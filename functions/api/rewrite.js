// ============================================================
// /api/rewrite — Cloudflare Pages Function
// JS port of server.py /rewrite, with Cloudflare Workers AI added
// as the default free provider.
//
// Providers:
//   - cloudflare: Workers AI (free, uses env.AI binding)
//   - openai:     api.openai.com (BYOK)
//   - openrouter: openrouter.ai  (BYOK)
//   - gemini:     generativelanguage.googleapis.com (BYOK)
// ============================================================

const MAX_SENTENCES_PER_REQUEST = 10;
const MAX_SENTENCE_CHARS = 2500;

// Allowed Workers AI models (free-tier compatible)
const CF_ALLOWED_MODELS = [
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/mistral/mistral-small-3.1-24b-instruct',
  '@cf/qwen/qwen2.5-coder-32b-instruct'
];

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const provider = (body.provider || '').trim().toLowerCase();
  const apiKey = (body.apiKey || '').trim();
  let model = (body.model || '').trim();
  const mode = (body.mode || 'natural').trim().toLowerCase();
  const sentences = body.sentences;

  // Validation
  if (!['cloudflare', 'openai', 'openrouter', 'gemini'].includes(provider)) {
    return json({ error: 'Choose Cloudflare, OpenAI, OpenRouter, or Gemini.' }, 400);
  }
  if (provider !== 'cloudflare' && !apiKey) {
    return json({ error: 'Missing API key for ' + provider + '.' }, 400);
  }
  if (!model) return json({ error: 'Missing model name.' }, 400);
  if (!Array.isArray(sentences) || !sentences.length) {
    return json({ error: 'No sentences provided.' }, 400);
  }

  // For Cloudflare, restrict to allowed models (or fall back to default)
  if (provider === 'cloudflare' && !CF_ALLOWED_MODELS.includes(model)) {
    model = CF_ALLOWED_MODELS[0];
  }

  const results = [];
  const slice = sentences.slice(0, MAX_SENTENCES_PER_REQUEST);

  for (let index = 0; index < slice.length; index++) {
    const sentence = String(slice[index] || '').trim();
    if (sentence.length > MAX_SENTENCE_CHARS) {
      results.push({
        index, original: sentence, rewrite: '',
        error: `Sentence too long. Limit is ${MAX_SENTENCE_CHARS} characters.`
      });
      continue;
    }
    try {
      const rewrite = await callAI(env, provider, apiKey, model, sentence, mode);
      results.push({ index, original: sentence, rewrite, error: null });
    } catch (err) {
      results.push({ index, original: sentence, rewrite: '', error: err.message || String(err) });
    }
  }

  return json({ results });
}

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

// ============ PROMPT (matches server.py build_prompt) ============
function buildPrompt(sentence, mode) {
  let instruction;
  if (mode === 'aggressive') {
    instruction = 'Rewrite more strongly for natural human rhythm while preserving the meaning.';
  } else if (mode === 'conservative') {
    instruction = 'Make only minimal changes. Keep the original wording where possible.';
  } else {
    instruction = 'Rewrite naturally with better rhythm and shorter sentences.';
  }

  return `Rewrite this sentence into 1-2 shorter, natural human-sounding sentences.

Instruction:
${instruction}

Rules:
- Keep the meaning unchanged.
- Do not add new facts.
- Avoid em dashes.
- Avoid robotic transitions.
- Use simple, direct language.
- Keep technical terms intact.
- Preserve inline Markdown such as **bold**, *italic*, \`inline code\`, and links.
- Return only the rewritten sentence. No explanation.

Sentence:
${sentence}
`;
}

// ============ CLEAN AI RESPONSE (matches server.py clean_ai_response) ============
function cleanAiResponse(text) {
  if (!text) return '';
  let t = text.trim();
  t = t.replace(/^```(?:json|text)?/i, '').trim();
  t = t.replace(/```$/, '').trim();
  return t.replace(/^["']|["']$/g, '').trim();
}

// ============ PROVIDER DISPATCH ============
async function callAI(env, provider, apiKey, model, sentence, mode) {
  const prompt = buildPrompt(sentence, mode);
  if (provider === 'cloudflare') return callCloudflare(env, model, prompt);
  if (provider === 'openai')     return callOpenAI(apiKey, model, prompt);
  if (provider === 'openrouter') return callOpenRouter(apiKey, model, prompt);
  if (provider === 'gemini')     return callGemini(apiKey, model, prompt);
  throw new Error('Unsupported provider: ' + provider);
}

// ============ CLOUDFLARE WORKERS AI (free) ============
async function callCloudflare(env, model, prompt) {
  if (!env.AI) {
    throw new Error('Workers AI binding missing. Add an AI binding in Pages → Settings → Functions → Bindings.');
  }
  const response = await env.AI.run(model, {
    messages: [
      { role: 'system', content: 'You rewrite long sentences into shorter, natural, human-sounding sentences without changing meaning.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 220,
    temperature: 0.35
  });
  const out = typeof response === 'string'
    ? response
    : (response.response || response.result?.response || '');
  if (!out) throw new Error('Empty response from Workers AI.');
  return cleanAiResponse(out);
}

// ============ OPENAI ============
async function callOpenAI(apiKey, model, prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You rewrite long sentences into shorter, natural, human-sounding sentences without changing meaning.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.35,
      max_tokens: 220
    })
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return cleanAiResponse(data.choices?.[0]?.message?.content || '');
}

// ============ OPENROUTER ============
async function callOpenRouter(apiKey, model, prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://humanizer.pages.dev',
      'X-Title': 'Humanizer'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You rewrite long sentences into shorter, natural, human-sounding sentences without changing meaning.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.35,
      max_tokens: 220
    })
  });
  if (!res.ok) throw new Error(`OpenRouter API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return cleanAiResponse(data.choices?.[0]?.message?.content || '');
}

// ============ GEMINI ============
async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 220 }
    })
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Unexpected Gemini response: ' + JSON.stringify(data).slice(0, 200));
  return cleanAiResponse(text);
}

// ============ JSON RESPONSE HELPER ============
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
