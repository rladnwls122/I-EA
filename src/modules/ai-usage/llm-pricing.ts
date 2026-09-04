import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';

/**
 * 토큰 → 추정 원가 변환.
 *
 * **단가를 코드에 박지 않는다.** 모델 가격은 우리가 통제하지 않는 값이고 예고 없이
 * 바뀐다. 박아 두면 어느 순간 조용히 틀린 숫자를 근거로 가격·상한을 정하게 된다.
 * 그래서 단가는 env로 주입받고, 없으면 원가를 **null**로 남긴다 —
 * 토큰 수는 관측한 사실이고 원가는 파생값이라, 단가를 모를 때 0으로 적으면 거짓이 된다.
 * (원장에 토큰은 항상 남으므로, 나중에 단가를 알게 되면 소급 계산할 수 있다.)
 *
 * - `GEMINI_PRICE_INPUT_PER_MTOK`  — 입력 100만 토큰당 USD
 * - `GEMINI_PRICE_OUTPUT_PER_MTOK` — 출력 100만 토큰당 USD
 *
 * thinking 토큰은 출력으로 과금된다(Gemini 사고 모델 공통) — 그래서 출력 단가를 쓴다.
 * 원장에는 따로 떼어 저장하므로, 사고를 줄여 원가를 낮출 여지가 있는지 볼 수 있다.
 */

/** USD 1달러 = 1,000,000 마이크로. 소수 반올림 오차를 정수 원장에 누적시키지 않으려는 단위. */
export const MICROS_PER_USD = 1_000_000;

export interface TokenCounts {
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export interface LlmPrices {
  /** 입력 100만 토큰당 USD */
  inputPerMTok: number;
  /** 출력 100만 토큰당 USD */
  outputPerMTok: number;
}

/**
 * 마이크로 USD 단위의 추정 원가. 단가를 모르면 null.
 * 반올림은 마지막에 한 번만 한다 — 토큰별로 반올림하면 작은 호출이 전부 0이 된다.
 */
export function estimateCostMicros(tokens: TokenCounts, prices: LlmPrices | null): number | null {
  if (!prices) return null;
  const billedOutput = tokens.outputTokens + tokens.thinkingTokens;
  const usd =
    (tokens.promptTokens * prices.inputPerMTok + billedOutput * prices.outputPerMTok) / 1_000_000;
  return Math.round(usd * MICROS_PER_USD);
}

/** env에서 단가를 읽는다. 둘 다 유효한 양수일 때만 원가를 계산한다(반쪽 단가는 틀린 값이다). */
export function parsePrices(
  rawInput: string | undefined,
  rawOutput: string | undefined,
): LlmPrices | null {
  const input = Number(rawInput);
  const output = Number(rawOutput);
  const valid = (n: number) => Number.isFinite(n) && n >= 0;
  if (rawInput === undefined || rawOutput === undefined) return null;
  if (!valid(input) || !valid(output)) return null;
  return { inputPerMTok: input, outputPerMTok: output };
}

/** 단가 설정을 한 번만 읽어 들고 있는 얇은 제공자. 부팅 시 설정 여부를 로그로 알린다. */
@Injectable()
export class LlmPricingService {
  private readonly logger = new Logger(LlmPricingService.name);
  readonly prices: LlmPrices | null;

  constructor(config: ConfigService) {
    this.prices = parsePrices(
      config.get<string>('GEMINI_PRICE_INPUT_PER_MTOK'),
      config.get<string>('GEMINI_PRICE_OUTPUT_PER_MTOK'),
    );
    if (!this.prices) {
      // 조용히 null로 두면 대시보드가 "원가 0"으로 보이는 이유를 아무도 모른다.
      this.logger.warn(
        'GEMINI_PRICE_*_PER_MTOK가 설정되지 않았습니다 — 토큰만 기록하고 원가는 비워 둡니다.',
      );
    }
  }

  costMicros(tokens: TokenCounts): number | null {
    return estimateCostMicros(tokens, this.prices);
  }
}
