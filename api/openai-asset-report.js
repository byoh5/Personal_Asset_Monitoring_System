const OPENAI_RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const MAX_INPUT_BYTES = 120000;
const MAX_ASSET_ROWS = 12;

function applyCors(res) {
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

function sanitizeInput(body) {
  const profile = body && typeof body.profile === 'object' ? body.profile : {};
  const snapshot = body && typeof body.snapshot === 'object' ? body.snapshot : {};
  const assets = toArray(body?.assets)
    .slice(0, MAX_ASSET_ROWS)
    .map((asset) => ({
      name: toString(asset?.name, '-'),
      type: toString(asset?.type, 'other'),
      valuation: toNumber(asset?.valuation, 0),
      currency: toString(asset?.currency, 'KRW'),
      ticker: toString(asset?.ticker, ''),
      market: toString(asset?.market, ''),
    }));

  return {
    generated_at: toString(body?.generated_at, new Date().toISOString()),
    locale: toString(body?.locale, 'ko-KR'),
    profile: {
      age_range: toString(profile.age_range, '40s'),
      household_size: toNumber(profile.household_size, 1),
      dependents: toNumber(profile.dependents, 0),
      income_type: toString(profile.income_type, 'fixed'),
      monthly_income: toNumber(profile.monthly_income, 0),
      monthly_expense: toNumber(profile.monthly_expense, 0),
      risk_preference: toString(profile.risk_preference, 'moderate'),
      housing_status: toString(profile.housing_status, 'owner'),
      retirement_age: toNumber(profile.retirement_age, 60),
      goals: toArray(profile.goals).map((goal) => toString(goal)).filter((goal) => goal),
    },
    snapshot: {
      total_assets: toNumber(snapshot.total_assets, 0),
      total_liabilities: toNumber(snapshot.total_liabilities, 0),
      net_worth: toNumber(snapshot.net_worth, 0),
      emergency_months: toNumber(snapshot.emergency_months, 0),
      emergency_target_months: toNumber(snapshot.emergency_target_months, 0),
      debt_ratio: toNumber(snapshot.debt_ratio, 0),
      savings_rate: toNumber(snapshot.savings_rate, 0),
      monthly_surplus: toNumber(snapshot.monthly_surplus, 0),
      allocation_current: snapshot.allocation_current && typeof snapshot.allocation_current === 'object'
        ? snapshot.allocation_current
        : {},
      allocation_target: snapshot.allocation_target && typeof snapshot.allocation_target === 'object'
        ? snapshot.allocation_target
        : {},
      local_summary: toString(snapshot.local_summary, ''),
      local_recommendations: toArray(snapshot.local_recommendations)
        .map((item) => toString(item))
        .filter((item) => item),
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

  try {
    return JSON.parse(text);
  } catch (_error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const fragment = text.slice(start, end + 1);
      try {
        return JSON.parse(fragment);
      } catch (_error2) {
        return null;
      }
    }
    return null;
  }
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
      }
    });
  });
  if (chunks.length) return chunks.join('\n');

  const choices = Array.isArray(responseJson.choices) ? responseJson.choices : [];
  const firstMessage = choices[0]?.message?.content;
  if (typeof firstMessage === 'string' && firstMessage.trim()) return firstMessage.trim();
  return '';
}

function normalizeReportShape(raw) {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  const sanitizeItems = (items) =>
    toArray(items)
      .map((item) => toString(item))
      .filter((item) => item)
      .slice(0, 6);

  return {
    summary: toString(parsed.summary, '요약을 생성하지 못했습니다.'),
    strengths: sanitizeItems(parsed.strengths),
    risks: sanitizeItems(parsed.risks),
    actions_30d: sanitizeItems(parsed.actions_30d),
    actions_90d: sanitizeItems(parsed.actions_90d),
    allocation_commentary: toString(parsed.allocation_commentary, ''),
    disclaimer: toString(parsed.disclaimer, '본 결과는 참고용 정보이며 투자 자문이 아닙니다.'),
  };
}

function buildSystemPrompt() {
  return [
    'You are a financial analysis assistant for a hackathon demo.',
    'Return valid JSON only.',
    'Write in Korean.',
    'Do not provide legal, tax, or investment guarantee statements.',
    'Use a practical and concise tone.',
    'Output schema exactly:',
    '{"summary":"","strengths":[""],"risks":[""],"actions_30d":[""],"actions_90d":[""],"allocation_commentary":"","disclaimer":""}',
    'Rules:',
    '- strengths, risks, actions_30d, actions_90d: each 2 to 4 bullet items as short strings.',
    '- Mention concrete numbers from input when useful.',
    '- disclaimer must clearly say this is not investment advice.',
  ].join('\n');
}

module.exports = async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
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

  const responsePayload = {
    model,
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

  try {
    const openaiRes = await fetch(OPENAI_RESPONSES_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responsePayload),
    });

    const openaiJson = await openaiRes.json().catch(() => ({}));
    if (!openaiRes.ok) {
      const upstreamError = toString(openaiJson?.error?.message, 'OpenAI API request failed.');
      return res.status(502).json({ error: `OpenAI 오류: ${upstreamError}` });
    }

    const outputText = extractResponseText(openaiJson);
    const parsed = safeJsonParse(outputText);
    if (!parsed) {
      return res.status(502).json({ error: 'OpenAI 응답을 JSON으로 파싱하지 못했습니다.' });
    }

    const report = normalizeReportShape(parsed);
    return res.status(200).json({
      ok: true,
      model,
      generatedAt: new Date().toISOString(),
      report,
    });
  } catch (error) {
    return res.status(500).json({ error: `서버 오류: ${toString(error?.message, 'unknown')}` });
  }
};
