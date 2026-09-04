import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { LlmFeature, LlmUsageStatus, usageDateOf } from './llm-usage.constants';
import { LlmPricingService } from './llm-pricing';

/** Gemini 응답의 usageMetadata에서 뽑아낸 토큰 수. 필드가 없으면 0으로 접는다. */
export interface LlmTokenUsage {
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
}

/** 호출부가 넘기는 "누가·무엇을" — LLM 서비스는 프롬프트만 알지 사용자를 모른다. */
export interface LlmCallMeta {
  userId: string;
  feature: LlmFeature;
  generationId?: string | null;
}

/** usageMetadata가 통째로 없을 때(스트림 중단 등) 쓰는 0 사용량. */
export const EMPTY_TOKEN_USAGE: LlmTokenUsage = {
  promptTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  totalTokens: 0,
};

/**
 * Gemini 응답 조각에서 usageMetadata를 읽어 토큰 수로 접는다.
 *
 * 스트리밍은 프레임마다 usageMetadata를 실어 보내고 **마지막 값이 누적 총계**다.
 * 그래서 호출부는 프레임마다 이 함수를 돌려 마지막 값으로 덮어쓰면 된다(더하면 안 된다).
 */
export function parseUsageMetadata(raw: unknown): LlmTokenUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);

  const promptTokens = num(m.promptTokenCount);
  const outputTokens = num(m.candidatesTokenCount);
  const thinkingTokens = num(m.thoughtsTokenCount);
  // totalTokenCount는 사고 토큰을 포함한다. 빠져 있으면 우리가 아는 것만 더한다.
  const totalTokens = num(m.totalTokenCount) || promptTokens + outputTokens + thinkingTokens;

  if (!promptTokens && !outputTokens && !thinkingTokens && !totalTokens) return null;
  return { promptTokens, outputTokens, thinkingTokens, totalTokens };
}

/**
 * LLM 호출 1건을 원장에 남긴다.
 *
 * **절대 던지지 않는다.** 회계가 기능을 죽이면 안 된다 — 원장 기록이 실패했다고
 * 사용자가 기다린 문항 생성을 되돌리는 건 손해가 더 크다. 실패는 로그로만 남기고
 * 호출부는 그대로 진행한다(원장 유실은 서버 로그로 복구 가능한 사고다).
 */
@Injectable()
export class LlmUsageRecorder {
  private readonly logger = new Logger(LlmUsageRecorder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: LlmPricingService,
  ) {}

  async record(
    meta: LlmCallMeta,
    model: string,
    status: LlmUsageStatus,
    tokens: LlmTokenUsage,
    at: Date = new Date(),
  ): Promise<void> {
    try {
      await this.prisma.llmUsage.create({
        data: {
          userId: meta.userId,
          feature: meta.feature,
          model,
          status,
          promptTokens: tokens.promptTokens,
          outputTokens: tokens.outputTokens,
          thinkingTokens: tokens.thinkingTokens,
          totalTokens: tokens.totalTokens,
          costMicros: this.pricing.costMicros(tokens),
          usageDate: usageDateOf(at),
          generationId: meta.generationId ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `LLM 사용량 기록 실패 (user=${meta.userId} feature=${meta.feature}): ${(err as Error).message}`,
      );
    }
  }
}
