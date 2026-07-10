require('dotenv').config();
const system = '너는 한국 시험 문항 출제 전문가다. { "choices": [ { "content": string, "isCorrect": boolean } ] } 형태 JSON만 출력. 선지 정확히 5개, isCorrect:true 정확히 1개.';
const user = '시험: 수능\n대분류: 수학\n소분류: 대수\n난이도: 2\n선지 개수: 5\n\n발문:\n이차방정식 x^2 - 5x + 6 = 0 의 두 근의 합은?';
const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

async function call(label, extraCfg) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        system_instruction:{parts:[{text:system}]},
        contents:[{role:'user',parts:[{text:user}]}],
        generationConfig:{ maxOutputTokens:4096, responseMimeType:'application/json', ...extraCfg },
      })});
    const ms = Date.now()-t0;
    const j = await r.json();
    if (!r.ok) { console.log(`${label.padEnd(22)} HTTP ${r.status} ${ms}ms  ${JSON.stringify(j).slice(0,200)}`); return; }
    const think = j.usageMetadata?.thoughtsTokenCount ?? 0;
    const text = (j.candidates?.[0]?.content?.parts??[]).map(p=>p.text??'').join('');
    console.log(`${label.padEnd(22)} ${String(ms).padStart(6)}ms  thinking=${String(think).padStart(4)}  textLen=${text.length}  finish=${j.candidates?.[0]?.finishReason}`);
  } catch(e){ console.log(`${label.padEnd(22)} ERR ${Date.now()-t0}ms ${e.message}`); }
}
(async () => {
  console.log('--- thinking 켬 (현재 구현) x3 ---');
  for (let i=0;i<3;i++) await call(`기본 #${i+1}`, {});
  console.log('--- thinkingBudget: 0 x3 ---');
  for (let i=0;i<3;i++) await call(`no-think #${i+1}`, { thinkingConfig: { thinkingBudget: 0 } });
})();
