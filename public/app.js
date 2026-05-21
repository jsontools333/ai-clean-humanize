// ============================================================
// HUMANIZER - Frontend Logic (Cloudflare Pages version)
//
// Same logic as the Flask version, with two changes:
//   1. Cloudflare AI is the default provider — no API key needed
//   2. /api/rewrite is the endpoint (Pages Function, not Flask)
// ============================================================

// ============ ELEMENTS ============
const $ = id => document.getElementById(id);
const inputText = $('inputText');
const outputText = $('outputText');
const inputCount = $('inputCount');
const outputCount = $('outputCount');
const inputPreview = $('inputPreview');
const outputPreview = $('outputPreview');

const issues = $('issues');
const scoreNumber = $('scoreNumber');
const scoreDesc = $('scoreDesc');
const manualFixExamples = $('manualFixExamples');
const aiRewriteResults = $('aiRewriteResults');
const rewriteStatus = $('rewriteStatus');

const providerEl = $('provider');
const modelEl = $('model');
const modeEl = $('mode');
const apiKeyEl = $('apiKey');
const preserveMarkdownEl = $('preserveMarkdown');

const cleanBtn = $('cleanBtn');
const analyzeBtn = $('analyzeBtn');
const rewriteBtn = $('rewriteBtn');
const applyBtn = $('applyBtn');
const copyBtn = $('copyBtn');
const downloadBtn = $('downloadBtn');
const clearBtn = $('clearBtn');

const toast = $('toast');

let lastLongSentences = [];
let lastAiRewrites = [];

// ============ THEME ============
const root = document.documentElement;
const savedTheme = localStorage.getItem('humanizer-theme') || 'dark';
root.setAttribute('data-theme', savedTheme);
$('themeToggle').addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('humanizer-theme', next);
  renderPreviews();
});

// ============ TOAST ============
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// ============ ADVANCED PANEL ============
$('advancedToggle').addEventListener('click', () => {
  const body = $('advancedBody');
  const open = body.classList.toggle('open');
  $('advancedToggle').setAttribute('aria-expanded', open);
});

// ============ EDIT/PREVIEW TABS ============
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.target;
    const view = tab.dataset.view;
    document.querySelectorAll(`.tab[data-target="${target}"]`).forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const textarea = $(target === 'input' ? 'inputText' : 'outputText');
    const preview = $(target === 'input' ? 'inputPreview' : 'outputPreview');
    if (view === 'edit') {
      textarea.hidden = false;
      preview.hidden = true;
    } else {
      textarea.hidden = true;
      preview.hidden = false;
      renderPreview(target);
    }
  });
});

function renderPreview(target) {
  const textarea = $(target === 'input' ? 'inputText' : 'outputText');
  const preview = $(target === 'input' ? 'inputPreview' : 'outputPreview');
  const text = textarea.value || '';
  if (typeof marked !== 'undefined') {
    preview.innerHTML = marked.parse(text, { breaks: true, gfm: true });
  } else {
    preview.textContent = text;
  }
}
function renderPreviews() {
  if (!$('inputPreview').hidden) renderPreview('input');
  if (!$('outputPreview').hidden) renderPreview('output');
}

// ============ WORD COUNT ============
function countWords(s) {
  const cleaned = (s || '').trim();
  return cleaned ? cleaned.split(/\s+/).length : 0;
}
function updateCounts() {
  inputCount.textContent = `${countWords(inputText.value)} words`;
  outputCount.textContent = `${countWords(outputText.value)} words`;
}
inputText.addEventListener('input', () => {
  updateCounts();
  if (!$('inputPreview').hidden) renderPreview('input');
});
outputText.addEventListener('input', () => {
  updateCounts();
  if (!$('outputPreview').hidden) renderPreview('output');
});

// ============ HELPERS ============
function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function preserveMarkdownEnabled() {
  return preserveMarkdownEl?.checked ?? true;
}

// ============ PATTERNS ============
const patterns = [
  { name: 'Em dash',                       regex: /—/g,                                        replacement: '. ',     weight: 3 },
  { name: 'En dash',                       regex: /–/g,                                        replacement: '-',      weight: 1 },
  { name: 'Furthermore',                   regex: /\bFurthermore,\s*/gi,                       replacement: '',       weight: 2 },
  { name: 'Moreover',                      regex: /\bMoreover,\s*/gi,                          replacement: '',       weight: 2 },
  { name: 'Additionally',                  regex: /\bAdditionally,\s*/gi,                      replacement: '',       weight: 2 },
  { name: 'In conclusion',                 regex: /\bIn conclusion,\s*/gi,                     replacement: '',       weight: 2 },
  { name: 'It is important to note that',  regex: /\bIt is important to note that\s*/gi,       replacement: '',       weight: 3 },
  { name: 'It is worth noting that',       regex: /\bIt is worth noting that\s*/gi,            replacement: '',       weight: 3 },
  { name: "In today's fast-paced world",   regex: /\bIn today'?s fast-paced world,?\s*/gi,     replacement: '',       weight: 4 },
  { name: 'Seamless',                      regex: /\bseamless\b/gi,                            replacement: 'smooth', weight: 1 },
  { name: 'Robust',                        regex: /\brobust\b/gi,                              replacement: 'strong', weight: 1 },
  { name: 'Leverage',                      regex: /\bleverage\b/gi,                            replacement: 'use',    weight: 1 },
  { name: 'Utilize',                       regex: /\butilize\b/gi,                             replacement: 'use',    weight: 1 },
  { name: 'Enhance',                       regex: /\benhance\b/gi,                             replacement: 'improve',weight: 1 },
  { name: 'Comprehensive',                 regex: /\bcomprehensive\b/gi,                       replacement: 'complete',weight: 1 }
];

// ============ MARKDOWN-AWARE SENTENCE EXTRACTION ============
function isProtectedMarkdownLine(line) {
  const stripped = line.trim();
  if (!stripped) return true;
  if (stripped.startsWith('|') && stripped.endsWith('|')) return true;
  if (/^\|?[\s:\-]+\|[\s:\-|]+$/.test(stripped)) return true;
  if (/^#{1,6}\s+/.test(stripped)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(stripped)) return true;
  if (/^(\s*)([-*+]\s+|\d+\.\s+)/.test(line)) return true;
  if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) return true;
  if (stripped.startsWith('>')) return true;
  if (/^\s*<\/?[a-zA-Z][^>]*>\s*$/.test(line)) return true;
  return false;
}

function extractMarkdownCandidates(markdown) {
  const candidates = [];
  const lines = (markdown || '').split('\n');
  let inFence = false, fenceMarker = null, inFrontMatter = false;
  let paragraphLines = [], paragraphStart = 0;

  function flushParagraph() {
    if (!paragraphLines.length) return;
    const paragraph = paragraphLines.join('\n').replace(/\s+/g, ' ').trim();
    const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    for (let sent of sentences) {
      sent = sent.trim();
      if (countWords(sent) > 28) candidates.push({ sentence: sent, blockStartLine: paragraphStart + 1 });
    }
    paragraphLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], stripped = line.trim();
    if (i === 0 && stripped === '---') { flushParagraph(); inFrontMatter = true; continue; }
    if (inFrontMatter) { if (stripped === '---' && i !== 0) inFrontMatter = false; continue; }
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      flushParagraph();
      const marker = fenceMatch[1];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = null; }
      continue;
    }
    if (inFence) continue;
    if (isProtectedMarkdownLine(line)) { flushParagraph(); continue; }
    if (!paragraphLines.length) paragraphStart = i;
    paragraphLines.push(line);
  }
  flushParagraph();
  return candidates;
}

function splitSentences(text) {
  return (text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}
function simpleLongSentences(text) {
  return splitSentences(text).map(s => s.trim()).filter(s => countWords(s) > 28).map(s => ({ sentence: s, blockStartLine: null }));
}
function findLongSentences(text) {
  return preserveMarkdownEnabled() ? extractMarkdownCandidates(text) : simpleLongSentences(text);
}

// ============ MECHANICAL SHORT REWRITE ============
function mechanicalShortRewrite(sentence) {
  let cleaned = sentence
    .replace(/—/g, '. ').replace(/–/g, '-')
    .replace(/\bFurthermore,\s*/gi, '').replace(/\bMoreover,\s*/gi, '')
    .replace(/\bAdditionally,\s*/gi, '')
    .replace(/\bIt is important to note that\s*/gi, '')
    .replace(/\bIt is worth noting that\s*/gi, '')
    .replace(/\s+/g, ' ').trim();

  const words = cleaned.split(/\s+/);
  if (words.length <= 28) return cleaned;

  const breakWords = ['because', 'but', 'and', 'which', 'while', 'although', 'however', 'so', 'therefore'];
  let splitIndex = -1;
  for (let i = 12; i < Math.min(words.length - 8, 28); i++) {
    const w = words[i].toLowerCase().replace(/[^a-z]/g, '');
    if (breakWords.includes(w)) { splitIndex = i; break; }
  }
  if (splitIndex === -1) splitIndex = Math.min(22, Math.floor(words.length / 2));

  let first = words.slice(0, splitIndex).join(' ').replace(/[,:;]$/, '');
  let second = words.slice(splitIndex).join(' ').replace(/^[,;:\s]+/, '');
  first = first.charAt(0).toUpperCase() + first.slice(1);
  second = second.charAt(0).toUpperCase() + second.slice(1);
  if (!/[.!?]$/.test(first)) first += '.';
  if (!/[.!?]$/.test(second)) second += '.';
  return `${first} ${second}`;
}

// ============ MECHANICAL CLEAN ============
function protectMarkdownBlocks(text) {
  const blocks = [];
  const save = match => {
    const token = `__MD_PROTECTED_BLOCK_${blocks.length}__`;
    blocks.push({ token, value: match });
    return token;
  };
  text = text.replace(/^---[\s\S]*?---\s*/m, save);
  text = text.replace(/```[\s\S]*?```/g, save);
  text = text.replace(/~~~[\s\S]*?~~~/g, save);
  text = text.replace(/(?:^\|.*\|\s*$\n?)+/gm, save);
  return { text, blocks };
}
function restoreMarkdownBlocks(text, blocks) {
  blocks.forEach(b => { text = text.replaceAll(b.token, b.value); });
  return text;
}
function mechanicalClean() {
  let text = inputText.value;
  let blocks = [];
  if (preserveMarkdownEnabled()) {
    const protectedData = protectMarkdownBlocks(text);
    text = protectedData.text;
    blocks = protectedData.blocks;
  }
  patterns.forEach(p => {
    if (p.replacement !== null) text = text.replace(p.regex, p.replacement);
  });
  text = text
    .replace(/[ \t]{2,}/g, ' ').replace(/\.\s*\./g, '.')
    .replace(/[ \t]+([.,!?;:])/g, '$1').replace(/([.!?])([A-Z])/g, '$1 $2').trim();
  if (preserveMarkdownEnabled()) text = restoreMarkdownBlocks(text, blocks);
  outputText.value = text;
  if (!$('outputPreview').hidden) renderPreview('output');
  updateCounts();
}

// ============ RENDER ANALYSIS ============
function renderIssues(text) {
  const found = [];
  let score = 0;

  patterns.forEach(p => {
    const matches = text.match(p.regex);
    if (matches && matches.length) {
      const points = matches.length * p.weight;
      score += points;
      found.push({ name: p.name, count: matches.length, points });
    }
  });

  const longCandidates = findLongSentences(text);
  if (longCandidates.length) {
    const points = longCandidates.length * 2;
    score += points;
    found.push({
      name: preserveMarkdownEnabled() ? 'Markdown-safe long sentences over 28 words' : 'Long sentences over 28 words',
      count: longCandidates.length, points
    });
  }

  scoreNumber.textContent = score;
  scoreNumber.className = 'score-number ' + (score < 10 ? 'low' : score < 30 ? 'med' : 'high');
  scoreDesc.innerHTML = score < 10
    ? 'Looks mostly human. Minor polish may help.'
    : score < 30
    ? 'Moderate AI patterns detected. Try Quick Clean or AI Rewrite.'
    : 'Heavy AI patterns — significant cleanup recommended.';

  issues.innerHTML = found.length
    ? found.map(i => `<li><span class="issue-tag">${i.count}×</span><span>${escapeHtml(i.name)} <span style="color:var(--ink-muted);font-size:12px;">· ${i.points} pts</span></span></li>`).join('')
    : '<li class="empty-state" style="border-left:none;">No major AI-style patterns found. Looking good.</li>';

  renderLongSentenceExamples(longCandidates);
}

function renderLongSentenceExamples(candidates) {
  lastLongSentences = candidates;
  const examples = candidates.slice(0, 10);
  if (!examples.length) {
    manualFixExamples.className = 'examples empty';
    manualFixExamples.innerHTML = 'No long sentence examples found.';
    return;
  }
  manualFixExamples.className = 'examples';
  manualFixExamples.innerHTML = examples.map((item, idx) => {
    const line = item.blockStartLine ? ` · near line ${item.blockStartLine}` : '';
    return `
      <div class="example-card">
        <div class="example-title">Example ${idx + 1} — ${countWords(item.sentence)} words${line}</div>
        <div class="label">Original long sentence</div>
        <p class="original-text">${escapeHtml(item.sentence)}</p>
        <div class="label">Mechanical short version</div>
        <p>${escapeHtml(mechanicalShortRewrite(item.sentence))}</p>
      </div>
    `;
  }).join('');
}

function renderAiRewrites() {
  if (!lastAiRewrites.length) {
    aiRewriteResults.className = 'examples empty';
    aiRewriteResults.innerHTML = 'No AI rewrites yet.';
    return;
  }
  aiRewriteResults.className = 'examples';
  aiRewriteResults.innerHTML = lastAiRewrites.map((item, idx) => `
    <div class="example-card">
      <div class="example-title">AI Rewrite ${idx + 1}</div>
      <div class="label">Original</div>
      <p class="original-text">${escapeHtml(item.original)}</p>
      <div class="label">AI Human Version</div>
      <p>${item.error ? `<span class="error">${escapeHtml(item.error)}</span>` : escapeHtml(item.rewrite)}</p>
      ${item.rewrite ? `<button class="apply-one" data-index="${idx}">Apply this rewrite</button>` : ''}
    </div>
  `).join('');

  document.querySelectorAll('.apply-one').forEach(btn => {
    btn.addEventListener('click', () => {
      applyOneRewrite(Number(btn.dataset.index));
      btn.classList.add('applied');
      btn.textContent = '✓ Applied';
    });
  });
}

function setStatus(msg, kind = '') {
  rewriteStatus.textContent = msg;
  rewriteStatus.className = 'status' + (kind ? ' ' + kind : '');
}

// ============ AI REWRITE (calls /api/rewrite — Pages Function) ============
async function aiRewriteLongSentences() {
  renderIssues(inputText.value);

  const provider = providerEl.value;
  const model = modelEl.value.trim();
  const apiKey = apiKeyEl.value.trim();
  const mode = modeEl.value;

  // Cloudflare AI doesn't need a key; other providers do
  if (provider !== 'cloudflare' && !apiKey) {
    showToast('Add an API key for ' + provider + ', or switch to Cloudflare AI (free)');
    $('advancedBody').classList.add('open');
    $('advancedToggle').setAttribute('aria-expanded', 'true');
    return;
  }

  if (!lastLongSentences.length) {
    showToast('No long sentences found — click Analyze first');
    return;
  }

  const sentencesToRewrite = lastLongSentences.slice(0, 10).map(it => it.sentence);
  rewriteBtn.classList.add('loading');
  rewriteBtn.disabled = true;
  setStatus(`Rewriting ${sentencesToRewrite.length} sentence(s) via ${provider}…`, 'loading');
  aiRewriteResults.className = 'examples';
  aiRewriteResults.innerHTML = '';

  try {
    const response = await fetch('/api/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey, mode, sentences: sentencesToRewrite })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Rewrite failed.');
    lastAiRewrites = data.results || [];
    renderAiRewrites();
    setStatus(`Done — ${lastAiRewrites.length} rewrite(s) ready. Click "Apply this rewrite" on each one you like.`, 'success');
    showToast('Rewrites ready');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    aiRewriteResults.className = 'examples empty';
    aiRewriteResults.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
  } finally {
    rewriteBtn.classList.remove('loading');
    rewriteBtn.disabled = false;
  }
}

function applyOneRewrite(index) {
  const item = lastAiRewrites[index];
  if (!item || !item.rewrite) return;
  const current = outputText.value || inputText.value;
  outputText.value = current.replaceAll(item.original, item.rewrite);
  if (!$('outputPreview').hidden) renderPreview('output');
  updateCounts();
  showToast('Applied');
}

function applyAllRewrites() {
  if (!lastAiRewrites.length) { showToast('No AI rewrites to apply yet'); return; }
  let current = outputText.value || inputText.value;
  let applied = 0;
  lastAiRewrites.forEach(item => {
    if (item.original && item.rewrite) {
      current = current.replaceAll(item.original, item.rewrite);
      applied++;
    }
  });
  outputText.value = current;
  if (!$('outputPreview').hidden) renderPreview('output');
  updateCounts();
  showToast(`Applied ${applied} rewrite(s)`);
  document.querySelectorAll('.apply-one').forEach(btn => {
    btn.classList.add('applied');
    btn.textContent = '✓ Applied';
  });
}

async function copyOutput() {
  const text = outputText.value || inputText.value;
  if (!text) { showToast('Nothing to copy'); return; }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch {
    outputText.select();
    document.execCommand('copy');
    showToast('Copied');
  }
}

function downloadFile() {
  const text = outputText.value || inputText.value;
  if (!text) { showToast('Nothing to download'); return; }
  const isMd = preserveMarkdownEnabled();
  const blob = new Blob([text], { type: isMd ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = isMd ? 'humanized.md' : 'humanized.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function clearAll() {
  inputText.value = ''; outputText.value = '';
  inputPreview.innerHTML = ''; outputPreview.innerHTML = '';
  issues.innerHTML = '<li class="empty-state" style="border-left:none;">No patterns detected yet.</li>';
  manualFixExamples.className = 'examples empty';
  manualFixExamples.innerHTML = 'No long sentence examples yet. Click <strong>Analyze</strong>.';
  aiRewriteResults.className = 'examples empty';
  aiRewriteResults.innerHTML = 'No AI rewrites yet.';
  setStatus('Ready.');
  lastLongSentences = []; lastAiRewrites = [];
  scoreNumber.textContent = '—';
  scoreNumber.className = 'score-number';
  scoreDesc.innerHTML = 'Paste text and click <strong>Analyze</strong> to see results.';
  updateCounts();
  showToast('Cleared');
}

// ============ EVENT WIRING ============
analyzeBtn.addEventListener('click', () => { renderIssues(inputText.value); updateCounts(); });
cleanBtn.addEventListener('click', () => {
  cleanBtn.classList.add('loading');
  setTimeout(() => {
    mechanicalClean();
    renderIssues(inputText.value);
    cleanBtn.classList.remove('loading');
    showToast('Quick clean done');
  }, 100);
});
rewriteBtn.addEventListener('click', aiRewriteLongSentences);
applyBtn.addEventListener('click', applyAllRewrites);
copyBtn.addEventListener('click', copyOutput);
downloadBtn.addEventListener('click', downloadFile);
clearBtn.addEventListener('click', clearAll);

// Provider change → suggest default model + show/hide API key hint
providerEl.addEventListener('change', () => {
  const p = providerEl.value;
  const defaults = {
    cloudflare: '@cf/meta/llama-3.1-8b-instruct',
    openai: 'gpt-4.1-mini',
    gemini: 'gemini-2.0-flash',
    openrouter: 'openai/gpt-4o-mini'
  };
  modelEl.value = defaults[p] || '';
  apiKeyEl.placeholder = p === 'cloudflare' ? 'Not needed — using free Cloudflare AI' : 'Paste your API key here';
});

updateCounts();
