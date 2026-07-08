import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LlmGenerationContext, LlmGenerationResult } from './llm.types';

@Injectable()
export class AnthropicLlmService {
  private readonly logger = new Logger(AnthropicLlmService.name);
  private readonly client: Anthropic;
  /** 재현성 추적을 위해 ai_generations.model에 저장할 값 */
  readonly model: string;
  private readonly maxTokens: number;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      // 부팅은 막지 않되, 실제 호출 시점에 명확히 실패하도록 로그만 남긴다.
      this.logger.warn('ANTHROPIC_API_KEY가 설정되지 않았습니다. 생성 잡이 FAILED 처리됩니다.');
    }
    this.client = new Anthropic({ apiKey: apiKey ?? 'missing' });
    // 정확한 모델 문자열은 팀이 .env(AI_MODEL)로 지정한다. 하드코딩하지 않는다.
    this.model = this.config.get<string>('AI_MODEL') ?? 'claude-sonnet-4-5';
    this.maxTokens = Number(this.config.get<string>('AI_MAX_TOKENS') ?? 4096);
  }

  /**
   * 지문/문항을 생성하고 계약(LlmGenerationResult)에 맞는 JSON을 반환한다.
   * 출력이 계약을 어기면 예외를 던져 프로세서가 FAILED 처리하도록 한다.
   */
  async generate(ctx: LlmGenerationContext): Promise<LlmGenerationResult> {
    const system = this.buildSystemPrompt();
    const user = this.buildUserPrompt(ctx);

    let raw: string;
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      raw = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
    } catch (err) {
      this.logger.error(`LLM 호출 실패: ${(err as Error).message}`);
      throw new ServiceUnavailableException('문항 생성 모델 호출에 실패했습니다.');
    }

    return this.parseResult(raw);
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

  private buildUserPrompt(ctx: LlmGenerationContext): string {
    const lines = [
      `대분류: ${ctx.examCategory ?? '(미지정)'}`,
      `세부과목: ${ctx.subjectName ?? '(미지정)'}`,
      `난이도: ${ctx.difficulty} (1 쉬움 ~ 5 어려움)`,
      `문항 수: ${ctx.questionCount}`,
      `지문 포함: ${ctx.includePassage ? '예' : '아니오'}`,
    ];
    if (ctx.questionType) lines.push(`선호 유형: ${ctx.questionType}`);
    lines.push('', `출제 지시: ${ctx.prompt}`);
    return lines.join('\n');
  }
}
