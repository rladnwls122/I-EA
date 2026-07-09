require('dotenv').config();
(async () => {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${base}/models/${model}:generateContent?key=${key}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: 'JSON만 출력한다.' }] },
        contents: [{ role: 'user', parts: [{ text: '{"ping":true} 를 그대로 출력해라' }] }],
        generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' },
      }),
    });
    console.log('HTTP', r.status, r.statusText);
    const body = await r.text();
    console.log('BODY:', body.slice(0, 900));
  } catch (e) {
    console.log('FETCH ERROR:', e.name, e.message);
    if (e.cause) console.log('CAUSE:', e.cause.code || e.cause.message);
  }
})();
