import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmGenerationContext,
  LlmGenerationResult,
  LlmRegenerateChoicesContext,
  LlmRegenerateChoicesResult,
  TutorTurn,
} from './llm.types';
import { GeminiKeyPool } from './gemini-key-pool';

/**
 * 인라인 재생성은 사용자가 버튼을 누르고 기다린다. 배치보다 짧게 끊는다.
 * thinking을 끄면 실측 1.3~1.5초. 15초면 느린 응답도 흡수한다.
 */
const REGENERATE_TIMEOUT_MS = 15_000;

/**
 * Gemini는 "high demand"로 503을 간헐적으로 뱉는다(실측 6회 중 2회).
 * generate()는 BullMQ가 재시도하지만 동기 경로에는 재시도가 없어,
 * 재시도 없이 두면 버튼이 무작위로 실패한다.
 */
const REGENERATE_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 400;

/**
 * 짧은 백오프로 재시도할 가치가 있는 장애: 5xx(일시적 과부하) / 타임아웃 / 네트워크.
 */
class RetryableLlmError extends Error {}

/**
 * 429(RESOURCE_EXHAUSTED, rate limit) 또는 403(quota/permission) — 이 키는 지금 못 쓴다.
 * 같은 키로 백오프 재시도해봐야 같은 창 안에서는 똑같이 실패하므로, 재시도 대신
 * 해당 키를 풀에서 쿨다운시키고 다른 정상 키로 회전한다(callGemini 참고).
 */
class KeyExhaustedLlmError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google Gemini 기반 문항 생성기.
 *
 * 별도 SDK 없이 Gemini REST(generateContent)를 Node 내장 fetch로 호출한다.
 * API 키는 .env의 GEMINI_API_KEY 하나에서만 읽으며(ConfigModule 전역),
 * 이 서비스를 주입하면 다른 클래스에서도 동일 계약(generate/model)으로 재사용할 수 있다.
 */
@Injectable()
export class GeminiLlmService {
  private readonly logger = new Logger(GeminiLlmService.name);
  /** 여러 API 키를 라운드-로빈으로 돌려쓰고 429/403 키를 쿨다운시키는 게이트웨이. */
  private readonly keyPool: GeminiKeyPool;
  /** 재현성 추적을 위해 ai_generations.model에 저장할 값 */
  readonly model: string;
  private readonly maxTokens: number;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    // 여러 키를 콤마로 받는다(GEMINI_KEYS=key1,key2,key3).
    // 하위호환으로 단일 GEMINI_API_KEY도 함께 흡수한다(풀 내부에서 중복/공백 정리).
    const multiKeys = (this.config.get<string>('GEMINI_KEYS') ?? '').split(',');
    const singleKey = this.config.get<string>('GEMINI_API_KEY') ?? '';
    this.keyPool = new GeminiKeyPool([...multiKeys, singleKey], {
      cooldownMs: Number(this.config.get<string>('GEMINI_KEY_COOLDOWN_MS') ?? 60_000),
      cooldownQuotaMs: Number(this.config.get<string>('GEMINI_KEY_COOLDOWN_403_MS') ?? 900_000),
    });
    if (!this.keyPool.hasKeys) {
      this.logger.warn(
        'Gemini API 키가 설정되지 않았습니다(GEMINI_KEYS/GEMINI_API_KEY). 생성 잡이 FAILED 처리됩니다.',
      );
    } else {
      this.logger.log(`Gemini 키 풀 초기화: ${this.keyPool.size}개 키`);
    }
    this.model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    this.maxTokens = Number(this.config.get<string>('GEMINI_MAX_TOKENS') ?? 4096);
    this.baseUrl =
      this.config.get<string>('GEMINI_BASE_URL') ??
      'https://generativelanguage.googleapis.com/v1beta';
  }

  /** 다른 클래스에서 키 존재 여부만 확인하고 싶을 때 사용. */
  get isConfigured(): boolean {
    return this.keyPool.hasKeys;
  }

  /**
   * 지문/문항을 생성하고 계약(LlmGenerationResult)에 맞는 JSON을 반환한다.
   * 출력이 계약을 어기면 예외를 던져 프로세서가 FAILED 처리하도록 한다.
   */
  async generate(ctx: LlmGenerationContext): Promise<LlmGenerationResult> {
    const raw = await this.callGemini(this.buildSystemPrompt(), this.buildUserPrompt(ctx));
    return this.parseResult(raw);
  }

  /**
   * 선지 전체 재생성 (인라인 UX용 동기 호출).
   *
   * ⚠️ 정답 선지까지 새로 만든다 — 출제자가 쓴 기존 정답은 살아남지 않는다.
   * 그래서 이 메서드도, 이를 호출하는 엔드포인트도 DB에 쓰지 않는다.
   * 반환값은 "후보"이며 출제자가 확인 후 PATCH로 저장한다.
   *
   * 비동기 배치(generate)와 달리 BullMQ 재시도가 없다. 사용자가 버튼을 누르고
   * 기다리므로 (1) 짧은 타임아웃, (2) 일시적 장애에 대한 자체 재시도가 필요하다.
   * thinking은 끈다 — 선지 생성은 단순 작업이고, 켜면 지연이 2~3배가 된다.
   */
  async regenerateChoices(ctx: LlmRegenerateChoicesContext): Promise<LlmRegenerateChoicesResult> {
    const raw = await this.callGemini(
      this.buildChoicesSystemPrompt(ctx.choiceCount),
      this.buildChoicesUserPrompt(ctx),
      { timeoutMs: REGENERATE_TIMEOUT_MS, attempts: REGENERATE_ATTEMPTS, disableThinking: true },
    );
    return this.parseChoicesResult(raw, ctx.choiceCount);
  }

  /**
   * AI 튜터 채팅 스트리밍. 산문(평문)을 델타 단위로 흘려보낸다.
   *
   * generate/regenerateChoices와 달리:
   * - responseMimeType을 빼서 JSON이 아니라 산문을 받는다.
   * - streamGenerateContent?alt=sse 로 SSE 스트림을 받아 파싱한다.
   * - thinkingBudget=0 으로 사고 토큰을 꺼 첫 델타 지연을 줄인다.
   *
   * 재시도 정책: **첫 바이트를 받기 전(요청 자체 실패)에만** 예외를 던진다.
   * 스트림이 시작된 뒤의 중간 실패는 이미 델타를 보낸 상태라 재시도하면 중복이 되므로
   * 조용히 스트림을 끊는다(예외 없이 종료).
   */
  async *streamChat(
    system: string,
    history: TutorTurn[],
    userText: string,
  ): AsyncIterable<string> {
    if (!this.keyPool.hasKeys) {
      throw new ServiceUnavailableException('Gemini API 키가 설정되지 않았습니다.');
    }

    // 히스토리를 Gemini contents로 펼치고 이번 사용자 발화를 마지막에 붙인다.
    const contents = [
      ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      { role: 'user', parts: [{ text: userText }] },
    ];
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        maxOutputTokens: this.maxTokens,
        // 산문을 받는다 — responseMimeType(JSON 강제)을 켜지 않는다.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    // 첫 바이트를 받기 전에 429/403이면 그 키를 쿨다운시키고 다음 키로 회전한다.
    // 스트림이 시작된 뒤(아래 reader 루프)의 실패는 재시도하지 않는다(중복 방지).
    let response: Response | null = null;
    let anyKeyExhausted = false;
    for (let rotation = 0; rotation < this.keyPool.size; rotation++) {
      const key = this.keyPool.acquire();
      if (!key) break;
      const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse&key=${key}`;

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } catch (err) {
        // 첫 바이트 전 네트워크 실패는 키 문제가 아니다 → 회전하지 않고 즉시 던진다.
        throw new ServiceUnavailableException(
          `AI 튜터 응답 생성에 실패했습니다: ${(err as Error).message}`,
        );
      }

      if (res.ok && res.body) {
        response = res;
        break;
      }

      // 429/403: 이 키를 쿨다운시키고 다음 키로 회전.
      if (res.status === 429 || res.status === 403) {
        this.keyPool.penalize(key, res.status);
        anyKeyExhausted = true;
        this.logger.warn(
          `튜터 스트림 키 회전(HTTP ${res.status}) — 남은 정상 키 ${this.keyPool.availableCount()}개`,
        );
        continue;
      }

      // 그 외(5xx·4xx): 회전해도 같으므로 즉시 포기.
      const detail = await res.text().catch(() => '');
      this.logger.error(`튜터 스트림 시작 실패: HTTP ${res.status} ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException('AI 튜터 응답 생성에 실패했습니다.');
    }

    if (!response) {
      // 모든 키가 429/403으로 소진.
      if (anyKeyExhausted) {
        throw new HttpException(
          'AI 요청이 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new ServiceUnavailableException('AI 튜터 응답 생성에 실패했습니다.');
    }

    if (!response.body) {
      throw new ServiceUnavailableException('AI 튜터 스트림 응답이 비어 있습니다.');
    }

    // SSE 프레임은 청크 경계에서 잘릴 수 있다. 버퍼에 모아 "\n\n" 단위로 끊어 파싱한다.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const text = this.extractSseText(frame);
          if (text) yield text;
        }
      }
      // 종료 시 남은 버퍼도 마지막 프레임으로 처리한다.
      const tail = this.extractSseText(buffer);
      if (tail) yield tail;
    } catch (err) {
      // 스트림 도중 실패 — 이미 델타를 보냈을 수 있으므로 재시도/예외 대신 조용히 종료한다.
      this.logger.warn(`튜터 스트림 중단: ${(err as Error).message}`);
    }
  }

  /**
   * Gemini SSE 프레임 하나에서 텍스트 델타를 뽑는다.
   * 프레임은 여러 줄일 수 있고, 텍스트는 "data:" 라인의 JSON에 담겨 온다.
   */
  private extractSseText(frame: string): string {
    const payload = frame
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('');
    if (!payload || payload === '[DONE]') return '';
    try {
      const json = JSON.parse(payload) as GeminiResponse;
      return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    } catch {
      // 부분 JSON/키프레임이 아닌 라인은 조용히 무시한다.
      return '';
    }
  }

  /**
   * Gemini generateContent 호출 공통부.
   *
   * - timeoutMs: 주면 그 시간 안에 응답이 없을 때 끊는다(비동기 배치는 무제한).
   * - attempts: 일시적 장애(429/5xx/타임아웃)에만 재시도한다. 기본 1회(재시도 없음).
   *   generate()는 BullMQ가 재시도하므로 여기서 다시 재시도하지 않는다.
   * - disableThinking: gemini-2.5-*의 thinking 토큰을 끈다.
   */
  private async callGemini(
    system: string,
    user: string,
    opts: { timeoutMs?: number; attempts?: number; disableThinking?: boolean } = {},
  ): Promise<string> {
    if (!this.keyPool.hasKeys) {
      throw new ServiceUnavailableException('Gemini API 키가 설정되지 않았습니다.');
    }

    const attempts = Math.max(1, opts.attempts ?? 1);
    let lastError = '';
    let anyKeyExhausted = false;

    // 바깥 루프: 429/403에 걸린 키는 쿨다운시키고 다음 정상 키로 회전한다.
    // 최대 풀 크기만큼 회전한다(그 이상은 이미 모든 키를 한 번씩 시도한 셈).
    for (let rotation = 0; rotation < this.keyPool.size; rotation++) {
      const key = this.keyPool.acquire();
      if (!key) break; // 남은 정상 키 없음

      // 안쪽 루프: 같은 키에 대한 일시적 장애(5xx/타임아웃) 재시도.
      let rotateToNextKey = false;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await this.callGeminiOnce(key, system, user, opts);
        } catch (err) {
          lastError = (err as Error).message;

          // 429/403: 이 키는 지금 못 쓴다 — 쿨다운시키고 다른 키로 회전한다.
          if (err instanceof KeyExhaustedLlmError) {
            this.keyPool.penalize(key, err.status);
            anyKeyExhausted = true;
            this.logger.warn(
              `LLM 키 회전(HTTP ${err.status}): ${lastError} — 남은 정상 키 ${this.keyPool.availableCount()}개`,
            );
            rotateToNextKey = true;
            break;
          }

          // 5xx/타임아웃: 서버측 일시 장애 — 같은 키로 짧게 재시도.
          if (err instanceof RetryableLlmError && attempt < attempts) {
            this.logger.warn(`LLM 일시 실패(${attempt}/${attempts}): ${lastError} — 재시도`);
            await sleep(RETRY_BACKOFF_MS * attempt);
            continue;
          }

          // 4xx(잘못된 요청 등)는 어떤 키로 호출해도 동일하게 실패한다 — 즉시 포기.
          // 재시도 소진한 5xx도 여기로 떨어진다(키를 더 태우지 않고 포기).
          this.logger.error(`LLM 호출 실패: ${lastError}`);
          throw new ServiceUnavailableException('문항 생성 모델 호출에 실패했습니다.');
        }
      }

      if (!rotateToNextKey) break;
    }

    // 여기까지 왔다는 건 모든 키가 429/403으로 소진됐다는 뜻.
    if (anyKeyExhausted) {
      this.logger.error(`LLM 모든 키 소진(rate limit/quota): ${lastError}`);
      throw new HttpException(
        'AI 요청이 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.logger.error(`LLM 호출 실패: ${lastError}`);
    throw new ServiceUnavailableException('문항 생성 모델 호출에 실패했습니다.');
  }

  private async callGeminiOnce(
    key: string,
    system: string,
    user: string,
    opts: { timeoutMs?: number; disableThinking?: boolean },
  ): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${key}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            maxOutputTokens: this.maxTokens,
            // JSON만 받도록 강제 → 코드펜스/서두 텍스트 혼입을 최소화한다.
            responseMimeType: 'application/json',
            // gemini-2.5-*는 기본으로 thinking 토큰을 쓴다. 단순 작업에서는 지연만 늘린다.
            ...(opts.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
      });
    } catch (err) {
      // 타임아웃(AbortError)·네트워크 오류는 재시도 대상.
      throw new RetryableLlmError((err as Error).message);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const message = `HTTP ${response.status} ${detail.slice(0, 300)}`;
      // 429(rate limit)·403(quota/permission): 이 키는 지금 못 쓴다 — 회전 대상.
      if (response.status === 429 || response.status === 403) {
        throw new KeyExhaustedLlmError(response.status, message);
      }
      // 5xx: 일시적 과부하 — 짧은 백오프로 재시도할 가치가 있다.
      if (response.status >= 500) throw new RetryableLlmError(message);
      // 그 외 4xx: 잘못된 요청 — 재시도·회전해도 같다.
      throw new Error(message);
    }

    const data = (await response.json()) as GeminiResponse;
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  }

  private parseResult(raw: string): LlmGenerationResult {
    // 코드펜스/서두 텍스트가 섞여 와도 첫 JSON 오브젝트만 안전하게 추출한다.
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new ServiceUnavailableException('모델 응답에서 JSON을 찾지 못했습니다.');
    }

    let parsed: LlmGenerationResult;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new ServiceUnavailableException('모델 응답 JSON 파싱에 실패했습니다.');
    }

    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new ServiceUnavailableException('모델이 유효한 문항을 반환하지 않았습니다.');
    }
    return parsed;
  }

  private buildSystemPrompt(): string {
    return [
      '너는 한국 시험 문항 출제 전문가다. 요청에 맞는 문항을 생성하고,',
      '아래 JSON 스키마를 "그대로" 따르는 JSON 하나만 출력한다. 서두/설명/코드펜스 금지.',
      '',
      '{',
      '  "passage": { "title": string(선택), "bodyText": string } | null,',
      '  "questions": [',
      '    {',
      '      "questionType": "객관식"|"주관식",',
      '      "stemText": string,',
      '      "choices": [ { "content": string, "isCorrect": boolean, "explanation": string(선택) } ](객관식 전용),',
      '      "answerText": string(주관식 단답 정답, 선택),',
      '      "explanationText": string(선택),',
      '      "difficulty": 1~5',
      '    }',
      '  ]',
      '}',
      '',
      '규칙:',
      '- 객관식은 choices를 제공하고 isCorrect:true가 1개 이상(단일정답이면 정확히 1개).',
      '- 주관식 단답형은 answerText에 정답을 넣는다(자동채점 대상).',
      '- 주관식 서술형은 answerText 없이 explanationText에 모범답안을 서술한다.',
      '- 모든 텍스트는 한국어. JSON 외 문자는 절대 출력하지 않는다.',
    ].join('\n');
  }

  /**
   * 재생성 결과 검증. 여기서 막지 않으면 정답이 0개/2개인 선지 집합이
   * 저장되어 grading.util의 "정답 집합 == 선택 집합" 채점이 조용히 망가진다.
   */
  private parseChoicesResult(raw: string, expectedCount: number): LlmRegenerateChoicesResult {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new ServiceUnavailableException('모델 응답에서 JSON을 찾지 못했습니다.');
    }

    let parsed: LlmRegenerateChoicesResult;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new ServiceUnavailableException('모델 응답 JSON 파싱에 실패했습니다.');
    }

    const choices = parsed.choices;
    if (!Array.isArray(choices) || choices.length !== expectedCount) {
      throw new ServiceUnavailableException(
        `모델이 선지 ${expectedCount}개를 반환하지 않았습니다.`,
      );
    }
    if (choices.some((c) => typeof c?.content !== 'string' || !c.content.trim())) {
      throw new ServiceUnavailableException('빈 선지가 포함되어 있습니다.');
    }
    // 단일정답 전제. 0개면 채점이 항상 null, 2개 이상이면 전부 골라야 정답이 된다.
    const correctCount = choices.filter((c) => c.isCorrect === true).length;
    if (correctCount !== 1) {
      throw new ServiceUnavailableException(
        `정답 선지가 정확히 1개여야 합니다(받은 값: ${correctCount}개).`,
      );
    }

    return { choices };
  }

  private buildChoicesSystemPrompt(choiceCount: number): string {
    return [
      '너는 한국 시험 문항 출제 전문가다. 주어진 발문에 대한 선지 집합을 새로 만든다.',
      '아래 JSON 스키마를 "그대로" 따르는 JSON 하나만 출력한다. 서두/설명/코드펜스 금지.',
      '',
      '{ "choices": [ { "content": string, "isCorrect": boolean, "explanation": string(선택) } ] }',
      '',
      '규칙:',
      `- 선지는 정확히 ${choiceCount}개.`,
      '- isCorrect:true는 정확히 1개(단일정답).',
      '- 오답 선지는 그럴듯하되 명확히 틀려야 한다. 정답과 의미가 겹치면 안 된다.',
      '- 수식은 순수 텍스트로만 쓴다(예: x^2 - 2x = 0, f\'(x)). LaTeX/KaTeX 문법 금지.',
      '- 모든 텍스트는 한국어. JSON 외 문자는 절대 출력하지 않는다.',
    ].join('\n');
  }

  private buildChoicesUserPrompt(ctx: LlmRegenerateChoicesContext): string {
    const lines = [
      `시험: ${ctx.examType ?? '(미지정)'}`,
      `대분류: ${ctx.examCategory ?? '(미지정)'}`,
      `소분류: ${ctx.subjectName ?? '(미지정)'}`,
      `난이도: ${ctx.difficulty ?? 3} (1 쉬움 ~ 5 어려움)`,
      `선지 개수: ${ctx.choiceCount}`,
      '',
      '발문:',
      ctx.stemText,
    ];
    return lines.join('\n');
  }

  private buildUserPrompt(ctx: LlmGenerationContext): string {
    const lines = [
      `시험: ${ctx.examType ?? '(미지정)'}`,
      `대분류: ${ctx.examCategory ?? '(미지정)'}`,
      `소분류: ${ctx.subjectName ?? '(미지정)'}`,
      `난이도: ${ctx.difficulty} (1 쉬움 ~ 5 어려움)`,
      `문항 수: ${ctx.questionCount}`,
      `지문 포함: ${ctx.includePassage ? '예' : '아니오'}`,
    ];
    if (ctx.questionType) lines.push(`선호 유형: ${ctx.questionType}`);
    if (ctx.ox) {
      lines.push(
        'OX 스타일: 객관식 문항은 OX(참/거짓) 2지선다 형태로 만들어줘. 선택지는 정확히 2개("O","X" 또는 "참","거짓")로 하고, isCorrect는 정답 선지 1개에만 true.',
      );
    }
    lines.push('', `출제 지시: ${ctx.prompt}`);
    return lines.join('\n');
  }
}

// --- Gemini generateContent 응답의 최소 형태 ---------------------------------
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}
