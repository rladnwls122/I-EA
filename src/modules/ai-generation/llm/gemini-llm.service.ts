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
  LlmReviewResult,
  REVIEW_AXES,
  TutorTurn,
} from './llm.types';
import { GeminiKeyPool } from './gemini-key-pool';
import { findBlankMarkers } from '@/common/prosemirror/prosemirror.util';
import {
  OutputLanguage,
  defaultChoiceCount,
  examFormatHints,
  languageRule,
  resolveOutputLanguage,
} from '../exam-format';
import { AnswerMode } from '../format-templates';

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
 * 자기검증(#34 후속)은 생성 배치에 얹히는 **부가** 호출이다. 무기한 매달리면 큐 워커 하나가
 * 판정 대기로 묶인다 — 생성 본체보다 짧게 끊고, 끊기면 판정만 포기한다(문항은 그대로 저장).
 */
const SELF_REVIEW_TIMEOUT_MS = 60_000;

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
  /**
   * LLM 자기검증(#34 후속) 스위치. **기본값은 꺼짐**이고, 켜야만 2차 호출이 나간다.
   *
   * 요청 파라미터가 아니라 환경변수로 둔 이유: 이 기능이 유예됐던 사유가 "호출 비용 배가"라,
   * 켤지 말지는 최종 사용자의 취향이 아니라 **운영 비용 결정**이다. DTO·프론트·input_params
   * 스냅샷을 건드리지 않으므로 꺼진 경로의 동작이 종전과 완전히 같음도 자명해진다.
   */
  readonly isSelfReviewEnabled: boolean;
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
    this.isSelfReviewEnabled =
      String(this.config.get<string>('AI_SELF_REVIEW') ?? '').toLowerCase() === 'true';
    if (this.isSelfReviewEnabled) {
      // 켠 사람이 비용 배가를 알고 켰는지 로그로 확인할 수 있게 한다.
      this.logger.log(`LLM 자기검증 활성화(AI_SELF_REVIEW) — 생성 배치마다 판정 호출이 1회 추가됩니다.`);
    }
  }

  /**
   * 판정에 쓰는 모델. **생성 모델과 분리하지 않는다** — 2026-08-04 결정 6(`GEMINI_TUTOR_MODEL`
   * 분리 보류)과 같은 판단이다. GEMINI_MODEL 기본값이 이미 flash급이라 지금 나누면 같은 값을
   * 가리키는 두 번째 설정 손잡이만 생긴다. 생성 모델을 pro급으로 올리는 결정이 실제로 날 때
   * 그 커밋에서 함께 나눈다(그 전까지 이 getter가 분기점을 한 곳에 모아 둔다).
   */
  get selfReviewModel(): string {
    return this.model;
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
    // 지문 수 — passageCount 명시가 없으면 includePassage로 0/1을 따른다(종전 동작).
    // 2 이상이면 다중지문 세트 모드(gap 3): 스키마·프롬프트·검증이 passages[] 계약으로 바뀐다.
    const passageCount = ctx.passageCount ?? (ctx.includePassage ? 1 : 0);
    // 지문 내장 빈칸 모드(#43 gap 9). 빈칸 수는 문항 수와 같다 — Part 6는 빈칸 하나가 문항 하나다.
    // 별도 파라미터를 두면 "빈칸 4개인데 문항 3개" 같은 요청이 무조건 FAILED가 되는 함정이 생긴다.
    const blankCount = ctx.blanksInPassage && passageCount === 1 ? ctx.questionCount : 0;
    const raw = await this.callGemini(
      this.buildSystemPrompt(ctx.language ?? 'ko', passageCount, blankCount),
      this.buildUserPrompt(ctx),
    );
    // choiceCount를 명시한 요청만 개수를 검증한다 — 시험별 관행 권고와 ox 힌트는
    // 종전대로 프롬프트 유도까지이고 검증 대상이 아니다(멀쩡한 배치를 FAILED로 떨구지 않도록).
    // answerMode='multiple'(복수정답 템플릿, #43 gap 4)이면 "정답 정확히 1개" 강제를 "1개 이상"으로 완화한다.
    return this.parseResult(
      raw,
      ctx.ox ? undefined : ctx.choiceCount,
      ctx.answerMode ?? 'single',
      passageCount,
      blankCount,
    );
  }

  /**
   * 생성 결과 자기검증 (#34 후속, 옵트인 2차 호출).
   *
   * 판정 축은 결정 3의 5축 중 **코드로 못 잡는 4축**뿐이다 — 형식 규격(선지 개수·언어·정답 개수)은
   * 파서가 이미 검증했으므로 토큰을 태워 다시 보지 않는다.
   *
   * 호출부(프로세서)가 실패를 흡수한다. 여기서는 계약 위반이면 그냥 던진다 —
   * "판정했는데 통과"와 "판정을 못 했다"를 뭉개면 기록이 거짓말이 된다.
   */
  async reviewGeneration(
    ctx: LlmGenerationContext,
    result: LlmGenerationResult,
  ): Promise<LlmReviewResult> {
    const raw = await this.callGemini(
      this.buildReviewSystemPrompt(result.questions.length),
      this.buildReviewUserPrompt(ctx, result),
      // 배치 경로지만 판정은 부가 기능이다 — 무기한 매달려 생성 잡을 붙잡고 있지 않도록 끊는다.
      { timeoutMs: SELF_REVIEW_TIMEOUT_MS },
    );
    return this.parseReviewResult(raw, result.questions.length);
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
      // 선지 재생성도 같은 언어 규칙을 따라야 한다 — 영어 지문 문항에 한국어 선지가 붙으면 못 쓴다.
      this.buildChoicesSystemPrompt(
        ctx.choiceCount,
        ctx.language ?? resolveOutputLanguage(ctx.examType, ctx.examCategory),
      ),
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
    // ⚠ Gemini는 프레임을 CRLF("\r\n\r\n")로 구분한다 — 정규화하지 않으면 "\n\n"이
    //   영원히 매치되지 않아 스트림 전체가 한 덩어리로 tail 처리되고, 여러 data JSON이
    //   이어붙어 파싱에 실패해 "델타 0개"로 조용히 끝난다(실제 프로덕션에서 발생).
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // 청크 경계에서 "\r"과 "\n"이 갈라질 수 있어 누적 버퍼를 통째로 정규화한다.
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
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
      const json = JSON.parse(payload) as GeminiResponse & {
        promptFeedback?: { blockReason?: string };
      };
      // 텍스트 없이 끝나는 원인(안전 차단·비정상 종료)을 서버 로그에 남긴다 —
      // 프로덕션에서 "델타 0개 스트림"의 원인을 특정할 수 있는 유일한 단서다.
      const blockReason = json.promptFeedback?.blockReason;
      if (blockReason) {
        this.logger.warn(`Gemini 프롬프트 차단(blockReason=${blockReason})`);
      }
      const finishReason = (json.candidates?.[0] as { finishReason?: string } | undefined)
        ?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        this.logger.warn(`Gemini 스트림 비정상 종료(finishReason=${finishReason})`);
      }
      // thinking 모델(gemini-2.5/3)의 사고 과정(thought: true 파트)은 사용자에게
      // 노출하지 않는다 — 최종 답변 파트만 델타로 흘린다.
      return (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => (p as { thought?: boolean }).thought !== true)
        .map((p) => p.text ?? '')
        .join('');
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

  private parseResult(
    raw: string,
    expectedChoiceCount?: number,
    answerMode: AnswerMode = 'single',
    passageCount = 0,
    blankCount = 0,
  ): LlmGenerationResult {
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
    // 배열이 비지 않아도 개별 문항이 비어있으면(발문 없음/객관식인데 선지 없음/정답 0·2개 이상)
    // 그대로 저장하면 빈 문제가 만들어진다 — 여기서 막아 프로세서가 FAILED 처리하게 한다.
    for (const q of parsed.questions) {
      if (typeof q.stemText !== 'string' || !q.stemText.trim()) {
        throw new ServiceUnavailableException('모델이 발문이 빈 문항을 반환했습니다.');
      }
      if (q.questionType === '객관식') {
        if (!Array.isArray(q.choices) || q.choices.length < 2) {
          throw new ServiceUnavailableException('모델이 선지가 부족한 객관식 문항을 반환했습니다.');
        }
        if (q.choices.some((c) => typeof c?.content !== 'string' || !c.content.trim())) {
          throw new ServiceUnavailableException('모델이 빈 선지를 포함한 문항을 반환했습니다.');
        }
        // 요청이 선지 개수를 명시했으면 정확히 그 개수여야 한다 —
        // 4지/5지 관행이 갈리는 시험을 섞어 쓰는 이상, 어긋난 개수는 조용히 저장하면 안 된다(#36).
        if (expectedChoiceCount && q.choices.length !== expectedChoiceCount) {
          throw new ServiceUnavailableException(
            `모델이 선지 ${expectedChoiceCount}개를 반환하지 않았습니다(받은 값: ${q.choices.length}개).`,
          );
        }
        const correctCount = q.choices.filter((c) => c.isCorrect === true).length;
        // 복수정답 모드(#43 gap 4)는 1개 이상이면 통과 — 채점(grading.util)은 정답 집합 비교라 그대로 호환된다.
        if (answerMode === 'multiple') {
          if (correctCount < 1) {
            throw new ServiceUnavailableException('모델이 정답 선지가 없는 문항을 반환했습니다.');
          }
        } else if (correctCount !== 1) {
          throw new ServiceUnavailableException(
            `모델이 정답 선지 개수가 잘못된 문항을 반환했습니다(받은 값: ${correctCount}개).`,
          );
        }
      }
    }
    // 단일/무지문 모드에서 다중지문 계약(passages 배열)이 섞여 오면 거부한다 —
    // 프로세서가 passages를 무시하므로, 그대로 두면 지문 없는 문항 배치가 조용히 COMPLETED 된다.
    if (passageCount <= 1 && Array.isArray(parsed.passages)) {
      throw new ServiceUnavailableException(
        '모델이 요청하지 않은 다중지문(passages)을 반환했습니다.',
      );
    }
    // 다중지문 세트 모드(gap 3) — 지문 개수·문항별 인덱스·빈 지문을 검증한다.
    // 여기서 막지 않으면 지문 없는 문항/문항 없는 지문이 조용히 저장된다.
    if (passageCount >= 2) {
      const passages = parsed.passages;
      if (!Array.isArray(passages) || passages.length !== passageCount) {
        throw new ServiceUnavailableException(
          `모델이 지문 ${passageCount}개를 반환하지 않았습니다(받은 값: ${Array.isArray(passages) ? passages.length : 0}개).`,
        );
      }
      if (passages.some((p) => typeof p !== 'string' || !p.trim())) {
        throw new ServiceUnavailableException('모델이 빈 지문을 반환했습니다.');
      }
      const assigned = new Set<number>();
      for (const q of parsed.questions) {
        const idx = q.passageIndex;
        if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= passageCount) {
          throw new ServiceUnavailableException(
            `모델이 지문 인덱스(passageIndex)가 잘못된 문항을 반환했습니다(받은 값: ${String(idx)}).`,
          );
        }
        assigned.add(idx);
      }
      if (assigned.size < passageCount) {
        throw new ServiceUnavailableException(
          '모델이 문항이 배정되지 않은 지문을 반환했습니다 — 모든 지문에 최소 1문항이 필요합니다.',
        );
      }
    }
    // 지문 내장 빈칸 모드(gap 9) — 지문의 마커 집합과 문항의 blankIndex 집합이 **일대일**이어야 한다.
    // 여기서 막지 않으면 "빈칸이 없는 지문", "가리킬 빈칸이 없는 문항", "번호가 겹친 문항"이
    // 조용히 저장돼 응시자가 못 푸는 세트가 된다.
    if (blankCount > 0) {
      this.validateBlanks(parsed, blankCount);
    }
    return parsed;
  }

  /**
   * 지문 속 `[[n]]` 마커와 문항 blankIndex의 대응 검증(#43 gap 9).
   * 마커 파싱은 조립과 같은 함수(findBlankMarkers)를 쓴다 — 규약이 두 군데로 갈라지지 않게.
   */
  private validateBlanks(parsed: LlmGenerationResult, blankCount: number): void {
    const body = parsed.passage?.bodyText;
    if (typeof body !== 'string' || !body.trim()) {
      throw new ServiceUnavailableException('모델이 빈칸을 담을 지문을 반환하지 않았습니다.');
    }
    const markers = findBlankMarkers(body);
    const expected = Array.from({ length: blankCount }, (_, i) => i + 1);
    // 등장 순서까지 오름차순이어야 한다 — 순서가 어긋나면 학습자가 (2)를 (1)보다 먼저 읽는다.
    if (markers.length !== blankCount || markers.some((n, i) => n !== expected[i])) {
      throw new ServiceUnavailableException(
        `모델이 지문에 빈칸 마커 [[1]]~[[${blankCount}]]를 순서대로 넣지 않았습니다(받은 값: ${markers.join(',') || '없음'}).`,
      );
    }
    const taken = new Set<number>();
    for (const q of parsed.questions) {
      const idx = q.blankIndex;
      if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 1 || idx > blankCount) {
        throw new ServiceUnavailableException(
          `모델이 빈칸 번호(blankIndex)가 잘못된 문항을 반환했습니다(받은 값: ${String(idx)}).`,
        );
      }
      if (taken.has(idx)) {
        throw new ServiceUnavailableException(
          `모델이 같은 빈칸(${idx}번)에 문항을 두 개 이상 배정했습니다.`,
        );
      }
      taken.add(idx);
      // 발문이 다른 빈칸을 가리키면 학습자가 지문에서 엉뚱한 자리를 본다.
      const stemMarkers = findBlankMarkers(q.stemText);
      if (stemMarkers.some((n) => n !== idx)) {
        throw new ServiceUnavailableException(
          `모델이 자기 빈칸(${idx}번)이 아닌 마커를 발문에 쓴 문항을 반환했습니다.`,
        );
      }
    }
    if (taken.size !== blankCount) {
      throw new ServiceUnavailableException(
        '모델이 문항이 배정되지 않은 빈칸을 남겼습니다 — 빈칸마다 문항이 정확히 하나여야 합니다.',
      );
    }
  }

  private buildSystemPrompt(
    language: OutputLanguage = 'ko',
    passageCount = 0,
    blankCount = 0,
  ): string {
    // 다중지문 세트(gap 3)는 passages 배열 + 문항별 passageIndex 계약으로 바뀐다.
    // 단일 지문/무지문(passageCount <= 1)은 종전 계약(passage 단일 객체) 그대로.
    const multiPassage = passageCount >= 2;
    // 지문 내장 빈칸(gap 9)은 단일 지문 위에서만 성립한다(resolveTemplateFormat이 보장).
    const blanks = blankCount > 0;
    return [
      '너는 한국 시험 문항 출제 전문가다. 요청에 맞는 문항을 생성하고,',
      '아래 JSON 스키마를 "그대로" 따르는 JSON 하나만 출력한다. 서두/설명/코드펜스 금지.',
      '',
      '{',
      multiPassage
        ? `  "passages": [ string, ... ] (지문 평문 정확히 ${passageCount}개 — 배열 순서가 지문 번호다),`
        : '  "passage": { "title": string(선택), "bodyText": string } | null,',
      '  "questions": [',
      '    {',
      '      "questionType": "객관식"|"주관식",',
      '      "stemText": string,',
      ...(multiPassage
        ? [`      "passageIndex": 0~${passageCount - 1} (이 문항의 근거 지문 인덱스),`]
        : []),
      ...(blanks ? [`      "blankIndex": 1~${blankCount} (이 문항이 맡은 지문 속 빈칸 번호),`] : []),
      '      "choices": [ { "content": string, "isCorrect": boolean, "explanation": string(선택) } ](객관식 전용),',
      '      "answerText": string(주관식 단답 정답, 선택),',
      '      "explanationText": string(선택),',
      '      "keywords": [string, ...] (이 문항의 핵심 개념/출제 포인트를 짧은 명사(구)로 2~4개),',
      '      "difficulty": 1~5',
      '    }',
      '  ]',
      '}',
      '',
      '규칙:',
      ...(multiPassage
        ? [
            '- 모든 문항에 passageIndex를 지정하고, 모든 지문(passages의 각 인덱스)에 최소 1문항을 배정한다.',
          ]
        : []),
      // 빈칸 마커는 평문 안의 규약이다 — 조립이 `___(n)___` 정본 형태로 바꿔 저장한다.
      // 형태를 모델이 마음대로 고르게 두면(밑줄·점선·(A)) 파싱이 불가능해진다.
      ...(blanks
        ? [
            `- 지문(bodyText) 안에 빈칸 마커 [[1]]부터 [[${blankCount}]]까지를 **글의 순서대로 정확히 한 번씩** 넣는다. 다른 형태(밑줄, -----, (A))로 빈칸을 표시하지 않는다.`,
            '- 문항은 빈칸 하나당 정확히 하나다. 각 문항의 blankIndex로 자기 빈칸을 가리키고, 발문에서 그 빈칸을 부를 때도 같은 마커([[n]])를 쓴다(다른 번호의 마커는 쓰지 않는다).',
            '- 선지는 그 빈칸에 그대로 들어갈 표현이어야 한다. 빈칸을 다시 문장으로 옮겨 적지 않는다.',
          ]
        : []),
      '- 객관식은 choices를 제공하고 isCorrect:true가 1개 이상(단일정답이면 정확히 1개).',
      '- 주관식 단답형은 answerText에 정답을 넣는다(자동채점 대상).',
      '- 주관식 서술형은 answerText 없이 explanationText에 모범답안을 서술한다.',
      '- keywords는 오답노트에서 "어느 개념에서 틀렸는지" 통계에 쓰인다 — 매 문항 반드시 채운다.',
      // 수식은 여전히 "평문 필드"로 오지만, 델리미터가 있어야 조립(buildRichDoc)이 math 노드로
      // 승격할 수 있다. 유니코드 흉내(×, ², √)는 승격 대상이 아니라 화면에 날것으로 남는다.
      '- 수식·화학식은 LaTeX로 쓰고 $...$(인라인) 또는 $$...$$(별행)로 감싼다. ×·²·√·½ 같은 유니코드 수학 기호로 흉내내지 않는다(화학식은 $\\ce{H2O}$ 형태).',
      // 언어는 시험별로 갈린다 — 토익 RC는 전부 영어, 한국 시험의 영어 과목은 발문만 한국어(#36 gap 2).
      languageRule(language),
      '',
      // "시험급" 품질 기준 4축(#34, 결정 3) — 형식 규격은 파서가 검증하므로 여기서는 나머지 축만 지시한다.
      '품질 기준(시험급):',
      '- 발문은 실제 기출 패턴의 간결한 한 문장으로 쓴다. 부정발문이면 "않은"/"없는"을 발문에 명시한다.',
      '- 오답 선지는 각각 그럴듯한 오해·실수에서 나오도록 설계하고, 해설에서 정답 근거와 대표 오답의 함정을 함께 짚는다.',
      '- difficulty 기준: 1=개념 확인, 3=표준 적용, 5=다단계 추론·복합 자료 해석.',
      '- 지문이 있는 문항은 지문을 읽어야만 풀리게 만든다. 일반 상식만으로 답이 나오는 문항은 금지.',
      '',
      'JSON 외 문자는 절대 출력하지 않는다.',
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

  // --- 자기검증 프롬프트·파서 (#34 후속) --------------------------------

  private buildReviewSystemPrompt(questionCount: number): string {
    return [
      '너는 한국 시험 출제 검수위원이다. 아래에 주어진 문항들이 "실제 시험에 낼 수 있는 수준"인지 판정한다.',
      '아래 JSON 스키마를 "그대로" 따르는 JSON 하나만 출력한다. 서두/설명/코드펜스 금지.',
      '',
      '{ "verdicts": [ { "index": 0, "verdict": "PASS"|"REVISE", "axes": [축, ...], "issues": [string, ...] } ] }',
      '',
      '규칙:',
      `- verdicts는 정확히 ${questionCount}개, index는 0부터 ${questionCount - 1}까지 각각 한 번씩.`,
      `- axes에는 다음 값만 쓴다: ${REVIEW_AXES.join(', ')}.`,
      '- PASS면 axes와 issues는 빈 배열. REVISE면 axes 1개 이상 + 그 근거를 issues에 한 줄씩.',
      '- issues는 한국어로, 출제자가 바로 고칠 수 있게 구체적으로 쓴다("어색하다" 같은 총평 금지).',
      '',
      '판정 축(이 4가지만 본다):',
      '- 발문형식: 실제 기출 발문 패턴인가. 부정발문이면 "않은/없는"이 발문에 드러나는가. 묻는 바가 하나로 확정되는가.',
      '- 오답매력도: 오답이 그럴듯한 오해·실수에서 나오는가. 한눈에 버려지는 선지나 정답과 의미가 겹치는 선지가 없는가.',
      '- 난이도일관성: 표기된 difficulty(1=개념 확인, 3=표준 적용, 5=다단계 추론)와 실제 요구 사고량이 맞는가.',
      '- 지문문항정합: 지문이 있는 문항이 지문을 읽어야만 풀리는가. 지문에 근거가 없는 선지로 정오가 갈리지 않는가.',
      '',
      '선지 개수·출력 언어·정답 개수 같은 형식 규격은 이미 기계 검증을 통과했다 — 다시 지적하지 않는다.',
      'JSON 외 문자는 절대 출력하지 않는다.',
    ].join('\n');
  }

  /** 판정 대상 직렬화. 정답 표시를 포함해야 "오답 매력도"를 볼 수 있다. */
  private buildReviewUserPrompt(ctx: LlmGenerationContext, result: LlmGenerationResult): string {
    const lines = [
      `시험: ${ctx.examType ?? '(미지정)'} / 대분류: ${ctx.examCategory ?? '(미지정)'} / 소분류: ${ctx.subjectName ?? '(미지정)'}`,
      `요청 난이도: ${ctx.difficulty} (1 쉬움 ~ 5 어려움)`,
      `출제 지시: ${ctx.prompt}`,
    ];
    const passages = result.passages ?? (result.passage ? [result.passage.bodyText] : []);
    for (const [i, body] of passages.entries()) {
      lines.push('', passages.length > 1 ? `[지문 ${i + 1}]` : '[지문]', body);
    }
    for (const [i, q] of result.questions.entries()) {
      lines.push('', `[문항 ${i}] (index=${i}, difficulty=${q.difficulty}, ${q.questionType})`);
      lines.push(`발문: ${q.stemText}`);
      for (const [ci, c] of (q.choices ?? []).entries()) {
        lines.push(`  ${ci + 1}) ${c.content}${c.isCorrect ? '  ← 정답' : ''}`);
      }
      if (q.answerText) lines.push(`정답(주관식): ${q.answerText}`);
      if (q.explanationText) lines.push(`해설: ${q.explanationText}`);
    }
    return lines.join('\n');
  }

  private parseReviewResult(raw: string, questionCount: number): LlmReviewResult {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new ServiceUnavailableException('자기검증 응답에서 JSON을 찾지 못했습니다.');
    }

    let parsed: LlmReviewResult;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new ServiceUnavailableException('자기검증 응답 JSON 파싱에 실패했습니다.');
    }

    const verdicts = parsed.verdicts;
    if (!Array.isArray(verdicts) || verdicts.length !== questionCount) {
      throw new ServiceUnavailableException(
        `자기검증이 문항 ${questionCount}건을 판정하지 않았습니다(받은 값: ${Array.isArray(verdicts) ? verdicts.length : 0}건).`,
      );
    }
    const seen = new Set<number>();
    for (const v of verdicts) {
      if (!Number.isInteger(v?.index) || v.index < 0 || v.index >= questionCount || seen.has(v.index)) {
        throw new ServiceUnavailableException(
          `자기검증 판정의 문항 index가 잘못되었습니다(받은 값: ${String(v?.index)}).`,
        );
      }
      seen.add(v.index);
      if (v.verdict !== 'PASS' && v.verdict !== 'REVISE') {
        throw new ServiceUnavailableException(
          `자기검증 판정값이 잘못되었습니다(받은 값: ${String(v.verdict)}).`,
        );
      }
      // 모르는 축 이름은 통계를 오염시키므로 떨군다(판정 자체는 살린다 — 버리는 쪽이 더 나쁘다).
      v.axes = Array.isArray(v.axes) ? v.axes.filter((a) => REVIEW_AXES.includes(a)) : [];
      v.issues = Array.isArray(v.issues) ? v.issues.filter((s) => typeof s === 'string' && s.trim()) : [];
      if (v.verdict === 'REVISE' && v.issues.length === 0) {
        // 근거 없는 REVISE는 검수자에게 아무것도 주지 못한다 — 축이라도 남기게 한다.
        v.issues = [`판정 근거가 제시되지 않았습니다(축: ${v.axes.join(', ') || '미지정'}).`];
      }
    }
    return { verdicts };
  }

  private buildChoicesSystemPrompt(choiceCount: number, language: OutputLanguage = 'ko'): string {
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
      // 생성 프롬프트와 같은 규약이어야 한다. 여기만 평문을 요구하던 시절에는 한 문항 안에서
      // 발문은 렌더된 수식, 재생성된 선지는 `x^2` 평문이 섞였다(#35 도입 시 정리).
      '- 수식·화학식은 LaTeX로 쓰고 $...$(인라인)로 감싼다. ×·²·√·½ 같은 유니코드 수학 기호로 흉내내지 않는다(화학식은 $\\ce{H2O}$ 형태).',
      // 선지 언어는 지문 언어를 따라간다 — 'en-passage-ko-stem'(발문만 한국어)에서도 선지는 영어다.
      language === 'ko'
        ? '- 선지 본문은 한국어로 쓴다.'
        : '- 선지 본문은 영어로 쓴다. 해설(explanation)은 한국어로 써도 된다.',
      'JSON 외 문자는 절대 출력하지 않는다.',
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
    const passageCount = ctx.passageCount ?? (ctx.includePassage ? 1 : 0);
    const lines = [
      `시험: ${ctx.examType ?? '(미지정)'}`,
      `대분류: ${ctx.examCategory ?? '(미지정)'}`,
      `소분류: ${ctx.subjectName ?? '(미지정)'}`,
      `난이도: ${ctx.difficulty} (1 쉬움 ~ 5 어려움)`,
      `문항 수: ${ctx.questionCount}`,
      passageCount >= 2
        ? `지문 포함: 예 — 서로 연계된 지문 ${passageCount}개 세트`
        : `지문 포함: ${passageCount === 1 ? '예' : '아니오'}`,
    ];
    if (passageCount >= 2) {
      lines.push(
        `다중지문 세트: passages에 지문을 정확히 ${passageCount}개 쓰고, 각 문항의 passageIndex(0부터)에 근거 지문을 지정한다. 모든 지문에 최소 1문항을 배정한다.`,
        // 시험별 관행(examFormatHints)에는 "지문 1개에 문항 여러 개" 같은 단일 지문 전제가
        // 섞여 있다 — 문자열 필터링은 취약하므로, 우선순위를 명시해 모순을 해소한다.
        '아래 형식 지시 중 "지문 1개" 전제의 관행과 어긋나는 부분은 이 다중지문 지시가 우선한다.',
      );
    }
    // 지문 내장 빈칸(gap 9) — 빈칸 수 = 문항 수. 시스템 프롬프트의 마커 규약과 짝을 이룬다.
    if (ctx.blanksInPassage && passageCount === 1) {
      lines.push(
        `지문 내장 빈칸: 지문 하나에 빈칸을 ${ctx.questionCount}개 두고(마커 [[1]]~[[${ctx.questionCount}]]), 문항 ${ctx.questionCount}개가 빈칸을 하나씩 맡는다.`,
      );
    }
    if (ctx.questionType) lines.push(`선호 유형: ${ctx.questionType}`);
    // 선지 개수 — 명시값이 있으면 강제, 없으면 시험별 관행(5지/4지)을 권고로만 흘린다(#36 gap 1).
    // ox는 2지선다를 따로 지시하므로 여기서 겹쳐 말하지 않는다.
    if (!ctx.ox) {
      if (ctx.choiceCount) {
        lines.push(`선지 개수: 객관식 문항의 선지는 정확히 ${ctx.choiceCount}개.`);
      } else {
        const conventional = defaultChoiceCount(ctx.examType);
        if (conventional) {
          lines.push(`선지 개수: 이 시험의 관행은 ${conventional}지선다다. 특별한 이유가 없으면 따른다.`);
        }
      }
    }
    // 시험별 형식 지시 — 이게 없으면 모델 출력이 전부 수능 스타일로 치우친다(#36 gap 5).
    const formatHints = examFormatHints(ctx.examType);
    if (formatHints.length) lines.push('', ...formatHints);
    // 출제 형식 템플릿 지시(#43) — 시험별 관행보다 구체적(발문 패턴·소재·선지 관행)이라 뒤에 싣는다.
    if (ctx.templateHints?.length) lines.push('', ...ctx.templateHints);
    // 복수정답 모드(#43 gap 4) — 검증 완화(parseResult)와 짝을 이루는 프롬프트 지시.
    if (ctx.answerMode === 'multiple') {
      lines.push(
        '',
        '복수정답: 정답(isCorrect:true)이 2개 이상일 수 있다. 발문에 "모두 고른 것은?"을 쓰고, 해설에 정답 조합의 근거를 밝힌다.',
      );
    }
    if (ctx.existingKeywords?.length) {
      lines.push(
        '',
        '기존 #키워드 풀(개념별 통계가 모이도록 가능하면 아래에서 골라 재사용하고, 정말 없을 때만 새로 만든다):',
        ctx.existingKeywords.join(', '),
      );
    }
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
