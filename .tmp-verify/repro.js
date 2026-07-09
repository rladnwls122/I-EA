require('dotenv').config();
const system = [
  '너는 한국 시험 문항 출제 전문가다. 주어진 발문에 대한 선지 집합을 새로 만든다.',
  '아래 JSON 스키마를 "그대로" 따르는 JSON 하나만 출력한다. 서두/설명/코드펜스 금지.',
  '{ "choices": [ { "content": string, "isCorrect": boolean, "explanation": string(선택) } ] }',
  '- 선지는 정확히 5개.', '- isCorrect:true는 정확히 1개(단일정답).',
].join('\n');
const user = '시험: 수능\n대분류: 수학\n소분류: 대수\n난이도: 2\n선지 개수: 5\n\n발문:\n이차방정식 x^2 - 5x + 6 = 0 의 두 근의 합은?';

(async () => {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${model}:generateContent?key=${key}`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: Number(process.env.GEMINI_MAX_TOKENS||4096), responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`HTTP ${r.status} (${Date.now()-t0}ms)`);
    const j = await r.json();
    console.log('finishReason:', j.candidates?.[0]?.finishReason);
    console.log('usage:', JSON.stringify(j.usageMetadata));
    const text = (j.candidates?.[0]?.content?.parts ?? []).map(p=>p.text??'').join('');
    console.log('TEXT len:', text.length);
    console.log('TEXT:', text.slice(0,400) || '(빈 문자열)');
  } catch (e) {
    console.log(`실패 (${Date.now()-t0}ms):`, e.name, '-', e.message);
  }
})();
