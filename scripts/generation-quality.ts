/**
 * 생성 품질 회귀 측정 — **실행기**(실제 Gemini 호출).
 *
 *   RUN_LLM_TESTS=1 npm run quality:generation
 *   RUN_LLM_TESTS=1 npm run quality:generation -- --runs 3 --template toeic-part5
 *   RUN_LLM_TESTS=1 npm run quality:generation -- --json reports/2026-08-05.json
 *
 * **왜 CI가 아니라 수동 스크립트인가:** 템플릿 13종 × 반복이면 매 실행이 수십 번의 LLM 호출이다.
 * PR마다 돌리면 토큰이 녹고, 모델 출력이 비결정적이라 빨간 빌드가 신호가 아니라 노이즈가 된다.
 * (`src/llm-verify.spec.ts`가 같은 이유로 `RUN_LLM_TESTS=1` 뒤에 있다.)
 *
 * **무엇을 재는가:** 파서 통과율과 계약 준수율뿐이다. 판정 규칙은
 * `src/modules/ai-generation/generation-quality.ts`에 있고 네트워크 없이 테스트된다.
 * "오답이 매력적인가" 같은 축은 코드로 못 재므로 여기 없다 — 통과율 100%가 좋은 문제를 뜻하지 않는다.
 *
 * **무엇에 쓰는가:** #34가 "LLM 자기검증은 도그푸딩에서 품질 미달이 확인되면 후속"이라고
 * 유예했는데, 정작 미달인지 볼 근거가 없었다. 회차별 수치를 남겨 그 판단의 바닥을 만든다.
 * DB를 쓰지 않는다 — LLM 계층만 때린다.
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LlmUsageRecorder } from '@/modules/ai-usage/llm-usage.recorder';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import {
  FORMAT_TEMPLATE_IDS,
  listTemplates,
  resolveTemplateFormat,
} from '@/modules/ai-generation/format-templates';
import { resolveOutputLanguage } from '@/modules/ai-generation/exam-format';
import {
  GOLDEN_PROMPTS,
  checkFormatCompliance,
  templatesMissingGoldenPrompt,
  type ComplianceViolation,
} from '@/modules/ai-generation/generation-quality';

/** 기록기를 no-op으로 두므로 값은 쓰이지 않는다 — 타입 계약을 만족시키는 자리다. */
const QUALITY_USAGE_META = { userId: 'quality-script', feature: 'GENERATION' } as const;

/** 측정 기본값 — 한 템플릿을 몇 번 돌릴지. 비결정적 출력이라 1회는 표본이 아니다. */
const DEFAULT_RUNS = 2;
/** 배치당 문항 수. 작게 잡는다 — 계약 준수를 보는 것이지 분량을 보는 게 아니다. */
const QUESTION_COUNT = 2;
/** 무료 티어는 분당 한도가 빡빡하다. 호출 사이에 쉰다(llm-verify.spec.ts와 같은 사유). */
const COOLDOWN_MS = 2_000;

interface RunOutcome {
  templateId: string;
  ok: boolean;
  /** 파서에서 튕겼으면 그 사유. 통과했으면 undefined. */
  parseError?: string;
  violations: ComplianceViolation[];
  elapsedMs: number;
}

function parseArgs(argv: string[]) {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    runs: Number(get('--runs') ?? DEFAULT_RUNS),
    only: get('--template'),
    jsonPath: get('--json'),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (process.env.RUN_LLM_TESTS !== '1') {
    console.error(
      '실제 LLM 호출과 토큰을 씁니다. 의도한 실행이면 RUN_LLM_TESTS=1 을 붙이세요.',
    );
    process.exit(2);
  }

  // 템플릿을 늘리면서 골든 프롬프트를 안 넣으면 통과율은 그대로인데 커버리지만 조용히 준다.
  // 여기서 멈춘다 — 화이트리스트를 에디터 확장과 락스텝으로 넓히게 만든 것과 같은 장치다.
  const missing = templatesMissingGoldenPrompt(FORMAT_TEMPLATE_IDS);
  if (missing.length > 0) {
    console.error(`골든 프롬프트가 없는 템플릿: ${missing.join(', ')}`);
    console.error('generation-quality.ts의 GOLDEN_PROMPTS에 추가하고 다시 실행하세요.');
    process.exit(2);
  }

  const { runs, only, jsonPath } = parseArgs(process.argv.slice(2));
  const all = listTemplates();
  const targets = only ? all.filter((t) => t.id === only) : all;
  if (targets.length === 0) {
    console.error(`템플릿을 찾지 못했습니다: ${only}`);
    process.exit(2);
  }

  const config = { get: (k: string) => process.env[k] } as unknown as ConfigService;
  // 이 스크립트는 DB 없이 도는 수동 품질 측정 도구다 — 원장에 남길 사용자도, 남길 곳도 없다.
  // 기록기는 no-op으로 갈아 끼운다(계측은 서버 경로의 책임이다).
  const llm = new GeminiLlmService(config, {
    record: async () => undefined,
  } as unknown as LlmUsageRecorder);
  if (!llm.isConfigured) {
    console.error('GEMINI_API_KEY가 없습니다(.env 확인).');
    process.exit(2);
  }

  const outcomes: RunOutcome[] = [];

  for (const template of targets) {
    // 템플릿이 노출되는 첫 시험을 대표로 쓴다 — examType이 프롬프트·언어 추정에 들어간다.
    const examType = template.examTypes[0];
    const format = resolveTemplateFormat(template, {});
    const language = format.language ?? resolveOutputLanguage(examType, undefined);

    for (let i = 0; i < runs; i++) {
      const startedAt = Date.now();
      try {
        const result = await llm.generate({
          prompt: GOLDEN_PROMPTS[template.id],
          difficulty: 3,
          questionCount: QUESTION_COUNT,
          includePassage: format.includePassage,
          passageCount: format.passageCount,
          passageLabels: format.passageLabels,
          questionType: format.questionType,
          choiceCount: format.choiceCount,
          language,
          answerMode: format.answerMode,
          examType,
          templateHints: format.promptHints,
        }, QUALITY_USAGE_META);

        outcomes.push({
          templateId: template.id,
          ok: true,
          violations: checkFormatCompliance(result, {
            questionCount: QUESTION_COUNT,
            passageCount: format.passageCount,
            choiceCount: format.choiceCount,
            answerMode: format.answerMode,
            language,
            questionType: format.questionType,
          }),
          elapsedMs: Date.now() - startedAt,
        });
      } catch (e) {
        // 파서에서 튕긴 것도 데이터다 — 실패를 숨기면 통과율이 거짓말이 된다.
        outcomes.push({
          templateId: template.id,
          ok: false,
          parseError: e instanceof Error ? e.message : String(e),
          violations: [],
          elapsedMs: Date.now() - startedAt,
        });
      }
      process.stdout.write('.');
      await sleep(COOLDOWN_MS);
    }
  }

  process.stdout.write('\n\n');
  report(outcomes, runs);

  if (jsonPath) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    // 회차 간 비교가 목적이라 원자료를 그대로 남긴다 — 집계는 언제든 다시 할 수 있다.
    writeFileSync(jsonPath, JSON.stringify({ runs, outcomes }, null, 2));
    console.log(`\n원자료: ${jsonPath}`);
  }
}

function report(outcomes: RunOutcome[], runs: number): void {
  const byTemplate = new Map<string, RunOutcome[]>();
  for (const o of outcomes) {
    byTemplate.set(o.templateId, [...(byTemplate.get(o.templateId) ?? []), o]);
  }

  const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);

  console.log(`| 템플릿 | 파서 통과 | 계약 준수 | 주요 위반 축 |`);
  console.log(`|---|---|---|---|`);
  for (const [id, list] of byTemplate) {
    const parsed = list.filter((o) => o.ok);
    const clean = parsed.filter((o) => o.violations.length === 0);
    const axes = new Map<string, number>();
    for (const o of parsed) {
      for (const v of o.violations) axes.set(v.axis, (axes.get(v.axis) ?? 0) + 1);
    }
    const top = [...axes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([axis, n]) => `${axis}×${n}`)
      .join(', ');
    console.log(
      `| ${id} | ${pct(parsed.length, list.length)} | ${pct(clean.length, parsed.length)} | ${top || '—'} |`,
    );
  }

  const parsedAll = outcomes.filter((o) => o.ok);
  console.log(
    `\n전체: ${outcomes.length}회(템플릿당 ${runs}회) · 파서 통과 ${pct(parsedAll.length, outcomes.length)} · ` +
      `계약 준수 ${pct(parsedAll.filter((o) => o.violations.length === 0).length, parsedAll.length)}`,
  );

  // 위반 상세는 표 아래에 몰아서 — 표가 넓어지면 회차 비교가 어려워진다.
  const detailed = outcomes.filter((o) => !o.ok || o.violations.length > 0);
  if (detailed.length > 0) {
    console.log('\n상세:');
    for (const o of detailed) {
      if (!o.ok) console.log(`  [${o.templateId}] 파서 실패 — ${o.parseError}`);
      for (const v of o.violations) console.log(`  [${o.templateId}] ${v.axis}: ${v.detail}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
