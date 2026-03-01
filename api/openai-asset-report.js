const crypto = require('node:crypto');

const OPENAI_RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const MAX_INPUT_BYTES = 120000;
const MAX_ASSET_ROWS = 8;
const DEFAULT_CORS_ORIGIN = 'https://byoh5.github.io';
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 8;
const DEFAULT_MAX_OUTPUT_TOKENS = 480;
const DEFAULT_RETRY_MAX_OUTPUT_TOKENS = 960;
const DEFAULT_PROMPT_CACHE_KEY = 'asset-report-v2';
const DEFAULT_RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const PROMPT_CACHE_RETENTION_VALUES = new Set(['in_memory', '24h']);
const ALLOCATION_KEYS = ['liquidity', 'equity', 'real_estate', 'gold'];
const REAL_ESTATE_KEYWORDS = [
  '부동산',
  '아파트',
  '주택',
  '집',
  '오피스텔',
  '상가',
  '토지',
  'real estate',
  'property',
];
const SELL_KEYWORDS = [
  '매도',
  '매각',
  '처분',
  '판매',
  '청산',
  'sell',
  'liquidate',
];
const SAFE_REAL_ESTATE_ACTION_TEXT = '부동산은 유동성이 낮아 매도보다 신규 매수 보류와 다른 자산 비중 조정으로 대응하세요.';
const REPORT_SCHEMA_NAME = 'asset_report';
const SHORT_ITEM_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: 120,
};
const REPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'strengths',
    'risks',
    'actions_30d',
    'actions_90d',
    'allocation_commentary',
  ],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 240 },
    strengths: {
      type: 'array',
      items: SHORT_ITEM_SCHEMA,
      minItems: 2,
      maxItems: 4,
    },
    risks: {
      type: 'array',
      items: SHORT_ITEM_SCHEMA,
      minItems: 2,
      maxItems: 4,
    },
    actions_30d: {
      type: 'array',
      items: SHORT_ITEM_SCHEMA,
      minItems: 2,
      maxItems: 4,
    },
    actions_90d: {
      type: 'array',
      items: SHORT_ITEM_SCHEMA,
      minItems: 2,
      maxItems: 4,
    },
    allocation_commentary: { type: 'string', minLength: 1, maxLength: 220 },
  },
};

const rateLimitStore = globalThis.__pamsRateLimitStore || new Map();
globalThis.__pamsRateLimitStore = rateLimitStore;

const responseCacheStore = globalThis.__pamsOpenAiResponseCache || new Map();
globalThis.__pamsOpenAiResponseCache = responseCacheStore;

function getHeader(req, name) {
  const headers = req && req.headers ? req.headers : {};
  const direct = headers[name];
  if (typeof direct === 'string') return direct;
  const lower = headers[name.toLowerCase()];
  if (typeof lower === 'string') return lower;
  return '';
}

function normalizeOrigin(value) {
  const text = toString(value, '').trim();
  if (!text) return '';
  try {
    return new URL(text).origin;
  } catch (_error) {
    return '';
  }
}

function parseAllowedOrigins(raw) {
  const value = toString(raw, DEFAULT_CORS_ORIGIN);
  if (value === '*') {
    return { allowAll: true, origins: [] };
  }
  const origins = value
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter((item) => item);
  return { allowAll: false, origins };
}

function extractRequestOrigins(req) {
  const origin = normalizeOrigin(getHeader(req, 'origin'));
  const refererOrigin = normalizeOrigin(getHeader(req, 'referer'));
  return Array.from(new Set([origin, refererOrigin].filter((item) => item)));
}

function isAllowedRequestOrigin(req, allowed) {
  if (allowed.allowAll) return true;
  if (!allowed.origins.length) return false;
  const requestOrigins = extractRequestOrigins(req);
  if (!requestOrigins.length) return false;
  return requestOrigins.some((origin) => allowed.origins.includes(origin));
}

function applyCors(req, res, allowed) {
  const origin = normalizeOrigin(getHeader(req, 'origin'));
  if (allowed.allowAll) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowed.origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (allowed.origins[0]) {
    res.setHeader('Access-Control-Allow-Origin', allowed.origins[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function getClientIp(req) {
  const forwarded = toString(getHeader(req, 'x-forwarded-for'), '');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    const ip = toString(first, '');
    if (ip) return ip;
  }
  const realIp = toString(getHeader(req, 'x-real-ip'), '');
  if (realIp) return realIp;
  return 'unknown';
}

function checkRateLimit(req) {
  const now = Date.now();
  const windowMs = Math.max(
    10 * 1000,
    toNumber(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS)
  );
  const maxRequests = Math.max(
    1,
    toNumber(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_RATE_LIMIT_MAX_REQUESTS)
  );
  const origin = extractRequestOrigins(req)[0] || 'no-origin';
  const ip = getClientIp(req);
  const key = `${ip}::${origin}`;

  const existing = rateLimitStore.get(key);
  if (!existing || now >= existing.resetAt) {
    const next = { count: 1, resetAt: now + windowMs, maxRequests };
    rateLimitStore.set(key, next);
    return { allowed: true, remaining: Math.max(0, maxRequests - 1), resetAt: next.resetAt, maxRequests };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt, maxRequests };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - existing.count),
    resetAt: existing.resetAt,
    maxRequests,
  };
}

function parseRequestBody(req) {
  if (!req || req.body === undefined || req.body === null) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_error) {
      return {};
    }
  }
  return {};
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizePercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(1));
}

function sanitizeAllocation(value) {
  const source = value && typeof value === 'object' ? value : {};
  const allocation = {};
  ALLOCATION_KEYS.forEach((key) => {
    const pct = sanitizePercent(source[key]);
    if (pct !== null && Math.abs(pct) >= 0.1) {
      allocation[key] = pct;
    }
  });
  return allocation;
}

function sanitizeAsset(asset) {
  const valuation = toNumber(asset?.valuation, 0);
  if (!Number.isFinite(valuation) || valuation === 0) return null;

  const normalized = {
    name: toString(asset?.name, '-').slice(0, 50),
    type: toString(asset?.type, 'other'),
    valuation: Math.round(valuation),
  };
  const currency = toString(asset?.currency, 'KRW');
  if (currency && currency !== 'KRW') {
    normalized.currency = currency;
  }
  const ticker = toString(asset?.ticker, '');
  if (ticker) normalized.ticker = ticker;
  const market = toString(asset?.market, '');
  if (market) normalized.market = market;
  return normalized;
}

function sanitizeInput(body) {
  const profile = body && typeof body.profile === 'object' ? body.profile : {};
  const snapshot = body && typeof body.snapshot === 'object' ? body.snapshot : {};
  const assets = toArray(body?.assets)
    .slice(0, MAX_ASSET_ROWS)
    .map((asset) => sanitizeAsset(asset))
    .filter((asset) => !!asset);

  const goals = toArray(profile.goals).map((goal) => toString(goal)).filter((goal) => goal).slice(0, 4);

  const profilePayload = {
    age_range: toString(profile.age_range, '40s'),
    household_size: Math.max(1, toNumber(profile.household_size, 1)),
    dependents: Math.max(0, toNumber(profile.dependents, 0)),
    income_type: toString(profile.income_type, 'fixed'),
    risk_preference: toString(profile.risk_preference, 'moderate'),
    housing_status: toString(profile.housing_status, 'owner'),
    retirement_age: Math.max(45, toNumber(profile.retirement_age, 60)),
    goals,
  };

  const monthlyIncome = toNumber(profile.monthly_income, 0);
  if (monthlyIncome > 0) profilePayload.monthly_income = Math.round(monthlyIncome);
  const monthlyExpense = toNumber(profile.monthly_expense, 0);
  if (monthlyExpense > 0) profilePayload.monthly_expense = Math.round(monthlyExpense);

  return {
    locale: toString(body?.locale, 'ko-KR'),
    profile: profilePayload,
    snapshot: {
      total_assets: Math.round(toNumber(snapshot.total_assets, 0)),
      total_liabilities: Math.round(toNumber(snapshot.total_liabilities, 0)),
      net_worth: Math.round(toNumber(snapshot.net_worth, 0)),
      emergency_months: sanitizePercent(snapshot.emergency_months) ?? 0,
      emergency_target_months: sanitizePercent(snapshot.emergency_target_months) ?? 0,
      debt_ratio: sanitizePercent(snapshot.debt_ratio) ?? 0,
      savings_rate: sanitizePercent(snapshot.savings_rate) ?? 0,
      monthly_surplus: Math.round(toNumber(snapshot.monthly_surplus, 0)),
      allocation_current: sanitizeAllocation(snapshot.allocation_current),
      allocation_target: sanitizeAllocation(snapshot.allocation_target),
    },
    assets,
  };
}

function stripCodeFence(raw) {
  const text = toString(raw, '').trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced && fenced[1] ? fenced[1].trim() : text;
}

function safeJsonParse(raw) {
  const text = stripCodeFence(raw);
  if (!text) return null;

  const candidates = [];
  candidates.push(text);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    const variants = [
      candidate,
      candidate
        .replace(/[“”＂]/g, '"')
        .replace(/[‘’＇]/g, "'"),
      candidate
        .replace(/[“”＂]/g, '"')
        .replace(/[‘’＇]/g, "'")
        .replace(/,\s*([}\]])/g, '$1'),
    ];

    for (const variant of variants) {
      try {
        return JSON.parse(variant);
      } catch (_error) {
        // Continue to next variant.
      }
    }
  }
  return null;
}

function extractResponseText(responseJson) {
  if (!responseJson || typeof responseJson !== 'object') return '';

  if (typeof responseJson.output_text === 'string' && responseJson.output_text.trim()) {
    return responseJson.output_text.trim();
  }

  const outputs = Array.isArray(responseJson.output) ? responseJson.output : [];
  const chunks = [];
  outputs.forEach((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((part) => {
      if (typeof part?.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim());
      } else if (typeof part?.output_text === 'string' && part.output_text.trim()) {
        chunks.push(part.output_text.trim());
      }
    });
  });
  if (chunks.length) return chunks.join('\n');

  const choices = Array.isArray(responseJson.choices) ? responseJson.choices : [];
  const firstMessage = choices[0]?.message?.content;
  if (typeof firstMessage === 'string' && firstMessage.trim()) return firstMessage.trim();
  return '';
}

function extractStructuredResponse(responseJson) {
  if (responseJson && typeof responseJson.output_parsed === 'object' && responseJson.output_parsed !== null) {
    return responseJson.output_parsed;
  }
  if (responseJson && typeof responseJson.parsed === 'object' && responseJson.parsed !== null) {
    return responseJson.parsed;
  }

  const outputs = Array.isArray(responseJson?.output) ? responseJson.output : [];
  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part && typeof part === 'object') {
        if (part.parsed && typeof part.parsed === 'object') return part.parsed;
        if (part.json && typeof part.json === 'object') return part.json;
      }
    }
  }
  return null;
}

function normalizePromptCacheKey(model) {
  const base = toString(process.env.OPENAI_PROMPT_CACHE_KEY, DEFAULT_PROMPT_CACHE_KEY)
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .slice(0, 64);
  const normalizedBase = base || DEFAULT_PROMPT_CACHE_KEY;
  return `${normalizedBase}:${model}`;
}

function normalizePromptCacheRetention(raw) {
  const value = toString(raw, '').toLowerCase();
  if (!value) return '';
  return PROMPT_CACHE_RETENTION_VALUES.has(value) ? value : '';
}

function buildResponsePayload({
  model,
  maxOutputTokens,
  rawInput,
  useStructuredOutput,
  enablePromptCaching,
  promptCacheKey,
  promptCacheRetention,
}) {
  const payload = {
    model,
    max_output_tokens: maxOutputTokens,
    temperature: 0.2,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: buildSystemPrompt() }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: rawInput }],
      },
    ],
  };

  if (enablePromptCaching && promptCacheKey) {
    payload.prompt_cache_key = promptCacheKey;
  }
  if (enablePromptCaching && promptCacheRetention) {
    payload.prompt_cache_retention = promptCacheRetention;
  }

  if (useStructuredOutput) {
    payload.text = {
      format: {
        type: 'json_schema',
        name: REPORT_SCHEMA_NAME,
        strict: true,
        schema: REPORT_JSON_SCHEMA,
      },
    };
  }
  return payload;
}

function shouldRetryWithoutStructuredOutput(openaiJson) {
  const message = toString(openaiJson?.error?.message, '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('unknown parameter') ||
    message.includes('text.format') ||
    message.includes('json_schema') ||
    message.includes('schema')
  );
}

function shouldRetryWithoutPromptCaching(openaiJson) {
  const message = toString(openaiJson?.error?.message, '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('prompt_cache_key') ||
    message.includes('prompt_cache_retention') ||
    message.includes('prompt cache')
  );
}

async function requestOpenAI(apiKey, payload) {
  const openaiRes = await fetch(OPENAI_RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const openaiJson = await openaiRes.json().catch(() => ({}));
  return { openaiRes, openaiJson };
}

function extractUsage(openaiJson) {
  const usage = openaiJson && typeof openaiJson === 'object' ? openaiJson.usage : null;
  if (!usage || typeof usage !== 'object') return null;

  const inputTokens = toNumber(usage.input_tokens ?? usage.prompt_tokens, 0);
  const outputTokens = toNumber(usage.output_tokens ?? usage.completion_tokens, 0);
  const totalTokens = toNumber(usage.total_tokens, inputTokens + outputTokens);
  const inputDetails = usage.input_tokens_details && typeof usage.input_tokens_details === 'object'
    ? usage.input_tokens_details
    : usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
      ? usage.prompt_tokens_details
      : {};
  const cachedInputTokens = toNumber(inputDetails.cached_tokens, 0);

  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  };
}

function getResponseCacheTtlMs() {
  return Math.max(0, toNumber(process.env.OPENAI_RESPONSE_CACHE_TTL_MS, DEFAULT_RESPONSE_CACHE_TTL_MS));
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function getResponseCacheKey({ model, maxOutputTokens, rawInput }) {
  return hashText(
    JSON.stringify({
      v: 2,
      model,
      maxOutputTokens,
      rawInput,
    })
  );
}

function cleanupResponseCache(now) {
  if (responseCacheStore.size < 200) return;

  for (const [key, entry] of responseCacheStore.entries()) {
    if (!entry || now >= entry.expiresAt) {
      responseCacheStore.delete(key);
    }
  }

  if (responseCacheStore.size <= 300) return;
  const entries = Array.from(responseCacheStore.entries())
    .sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0));
  const removeCount = responseCacheStore.size - 250;
  entries.slice(0, removeCount).forEach(([key]) => responseCacheStore.delete(key));
}

function readResponseCache(cacheKey, now) {
  if (!cacheKey) return null;
  const entry = responseCacheStore.get(cacheKey);
  if (!entry) return null;
  if (now >= entry.expiresAt) {
    responseCacheStore.delete(cacheKey);
    return null;
  }
  return entry.value;
}

function writeResponseCache(cacheKey, value, ttlMs, now) {
  if (!cacheKey || ttlMs <= 0 || !value) return;
  responseCacheStore.set(cacheKey, {
    createdAt: now,
    expiresAt: now + ttlMs,
    value,
  });
  cleanupResponseCache(now);
}

function hasKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function isRealEstateSellAction(text) {
  const normalized = toString(text, '').toLowerCase();
  if (!normalized) return false;
  return hasKeyword(normalized, REAL_ESTATE_KEYWORDS) && hasKeyword(normalized, SELL_KEYWORDS);
}

function sanitizeActionItems(items) {
  const rows = toArray(items)
    .map((item) => toString(item))
    .filter((item) => item)
    .map((item) => (isRealEstateSellAction(item) ? SAFE_REAL_ESTATE_ACTION_TEXT : item));

  const unique = [];
  rows.forEach((item) => {
    if (!unique.includes(item)) {
      unique.push(item);
    }
  });
  return unique.slice(0, 4);
}

function normalizeReportShape(raw) {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  const sanitizeItems = (items) =>
    toArray(items)
      .map((item) => toString(item))
      .filter((item) => item)
      .slice(0, 4);

  return {
    summary: toString(parsed.summary, '요약을 생성하지 못했습니다.'),
    strengths: sanitizeItems(parsed.strengths),
    risks: sanitizeItems(parsed.risks),
    actions_30d: sanitizeActionItems(parsed.actions_30d),
    actions_90d: sanitizeActionItems(parsed.actions_90d),
    allocation_commentary: toString(parsed.allocation_commentary, ''),
  };
}

function buildSystemPrompt() {
  return [
    'You are a concise financial analysis assistant.',
    'Write in Korean and return JSON only.',
    'Follow the provided schema exactly. Do not add extra keys.',
    'Keep every item short, practical, and based on numeric input values.',
    'Treat real estate as illiquid in most household contexts.',
    'Do not suggest selling or partially selling real estate as a default action.',
    'Prefer actions like pausing new real-estate purchases, improving cash flow, and rebalancing liquid assets.',
    'Do not provide legal or tax advice.',
  ].join('\n');
}

function isLikelyTruncatedResponse(openaiJson, outputText) {
  const status = toString(openaiJson?.status, '').toLowerCase();
  const incompleteReason = toString(openaiJson?.incomplete_details?.reason, '').toLowerCase();
  if (status === 'incomplete') return true;
  if (incompleteReason.includes('max_output_tokens') || incompleteReason.includes('length')) return true;

  const outputs = Array.isArray(openaiJson?.output) ? openaiJson.output : [];
  for (const item of outputs) {
    const itemStatus = toString(item?.status, '').toLowerCase();
    const itemReason = toString(item?.incomplete_details?.reason, '').toLowerCase();
    if (itemStatus === 'incomplete') return true;
    if (itemReason.includes('max_output_tokens') || itemReason.includes('length')) return true;
  }

  const text = toString(outputText, '').trim();
  if (!text) return false;
  if (text.includes('{') && !text.endsWith('}')) return true;
  return false;
}

async function requestOpenAIWithFallbacks({
  apiKey,
  model,
  maxOutputTokens,
  rawInput,
  promptCacheKey,
  promptCacheRetention,
}) {
  let usedStructuredOutput = true;
  let enablePromptCaching = true;
  let attempts = 0;
  let openaiRes = null;
  let openaiJson = null;

  while (attempts < 3) {
    const currentPayload = buildResponsePayload({
      model,
      maxOutputTokens,
      rawInput,
      useStructuredOutput: usedStructuredOutput,
      enablePromptCaching,
      promptCacheKey,
      promptCacheRetention,
    });
    ({ openaiRes, openaiJson } = await requestOpenAI(apiKey, currentPayload));
    if (openaiRes.ok) break;

    let shouldRetry = false;
    if (enablePromptCaching && shouldRetryWithoutPromptCaching(openaiJson)) {
      enablePromptCaching = false;
      shouldRetry = true;
    } else if (usedStructuredOutput && shouldRetryWithoutStructuredOutput(openaiJson)) {
      usedStructuredOutput = false;
      shouldRetry = true;
    }

    if (!shouldRetry) break;
    attempts += 1;
  }

  return { openaiRes, openaiJson, usedStructuredOutput };
}

function extractReportFromResponse(openaiJson) {
  const structured = extractStructuredResponse(openaiJson);
  if (structured && typeof structured === 'object') {
    return {
      report: normalizeReportShape(structured),
      parsed: true,
      usedStructuredOutput: true,
      outputText: '',
    };
  }

  const outputText = extractResponseText(openaiJson);
  const parsed = safeJsonParse(outputText);
  if (!parsed) {
    return {
      report: null,
      parsed: false,
      usedStructuredOutput: false,
      outputText,
    };
  }

  return {
    report: normalizeReportShape(parsed),
    parsed: true,
    usedStructuredOutput: false,
    outputText,
  };
}

function buildSuccessPayload({ model, report, usage, serverResponseCacheHit, recoveredFromTruncation }) {
  const payload = {
    ok: true,
    model,
    generatedAt: new Date().toISOString(),
    report,
    cache: {
      server_response_cache_hit: !!serverResponseCacheHit,
      recovered_from_truncation: !!recoveredFromTruncation,
    },
  };
  if (usage) {
    payload.usage = usage;
    if (usage.input_tokens > 0) {
      payload.cache.prompt_cache_hit_rate = Number((usage.cached_input_tokens / usage.input_tokens).toFixed(4));
    }
  }
  return payload;
}

module.exports = async function handler(req, res) {
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);
  applyCors(req, res, allowedOrigins);

  if (req.method === 'OPTIONS') {
    if (!isAllowedRequestOrigin(req, allowedOrigins)) {
      return res.status(403).json({ error: 'Origin not allowed.' });
    }
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  if (!isAllowedRequestOrigin(req, allowedOrigins)) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  const rate = checkRateLimit(req);
  res.setHeader('X-RateLimit-Limit', String(rate.maxRequests));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(rate.resetAt / 1000)));
  if (!rate.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  const model = toString(process.env.OPENAI_MODEL, DEFAULT_MODEL);
  const body = parseRequestBody(req);
  const sanitized = sanitizeInput(body);

  const rawInput = JSON.stringify(sanitized);
  if (!rawInput || Buffer.byteLength(rawInput, 'utf8') > MAX_INPUT_BYTES) {
    return res.status(413).json({ error: '입력 데이터가 너무 큽니다. 자산 항목 수를 줄여주세요.' });
  }

  const maxOutputTokens = Math.max(
    160,
    toNumber(process.env.OPENAI_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS)
  );
  const retryMaxOutputTokens = Math.min(
    1200,
    Math.max(
      maxOutputTokens + 80,
      toNumber(process.env.OPENAI_MAX_OUTPUT_TOKENS_RETRY, DEFAULT_RETRY_MAX_OUTPUT_TOKENS)
    )
  );
  const promptCacheKey = normalizePromptCacheKey(model);
  const promptCacheRetention = normalizePromptCacheRetention(process.env.OPENAI_PROMPT_CACHE_RETENTION);
  const responseCacheTtlMs = getResponseCacheTtlMs();
  const responseCacheKey = responseCacheTtlMs > 0
    ? getResponseCacheKey({ model, maxOutputTokens, rawInput })
    : '';

  if (responseCacheKey) {
    const cachedPayload = readResponseCache(responseCacheKey, Date.now());
    if (cachedPayload) {
      return res.status(200).json({
        ...cachedPayload,
        cache: {
          ...(cachedPayload.cache || {}),
          server_response_cache_hit: true,
        },
      });
    }
  }

  try {
    let recoveredFromTruncation = false;
    let requestResult = await requestOpenAIWithFallbacks({
      apiKey,
      model,
      maxOutputTokens,
      rawInput,
      promptCacheKey,
      promptCacheRetention,
    });

    if (!requestResult.openaiRes || !requestResult.openaiRes.ok) {
      const upstreamError = toString(requestResult.openaiJson?.error?.message, 'OpenAI API request failed.');
      return res.status(502).json({ error: `OpenAI 오류: ${upstreamError}` });
    }

    let extracted = extractReportFromResponse(requestResult.openaiJson);

    if (!extracted.parsed && retryMaxOutputTokens > maxOutputTokens) {
      const likelyTruncated = isLikelyTruncatedResponse(
        requestResult.openaiJson,
        extracted.outputText
      );

      const retryResult = await requestOpenAIWithFallbacks({
        apiKey,
        model,
        maxOutputTokens: retryMaxOutputTokens,
        rawInput,
        promptCacheKey,
        promptCacheRetention,
      });

      if (retryResult.openaiRes && retryResult.openaiRes.ok) {
        const retryExtracted = extractReportFromResponse(retryResult.openaiJson);
        if (retryExtracted.parsed) {
          requestResult = retryResult;
          extracted = retryExtracted;
          recoveredFromTruncation = true;
          if (likelyTruncated) {
            console.warn('Recovered from likely truncated OpenAI JSON response.');
          }
        }
      }
    }

    if (!extracted.parsed || !extracted.report) {
      const hint = requestResult.usedStructuredOutput
        ? ' (structured output)'
        : ' (fallback output)';
      console.warn(`Failed to parse OpenAI response JSON${hint}`);
      return res.status(502).json({
        error: 'OpenAI 응답이 잘렸거나 JSON 파싱에 실패했습니다. 잠시 후 다시 시도해주세요.',
      });
    }

    const usage = extractUsage(requestResult.openaiJson);
    const payload = buildSuccessPayload({
      model,
      report: extracted.report,
      usage,
      serverResponseCacheHit: false,
      recoveredFromTruncation,
    });
    writeResponseCache(responseCacheKey, payload, responseCacheTtlMs, Date.now());
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ error: `서버 오류: ${toString(error?.message, 'unknown')}` });
  }
};
