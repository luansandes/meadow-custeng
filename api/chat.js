const fs = require('node:fs');
const path = require('node:path');

const CSV_FILE = path.join(process.cwd(), 'Meadow Vet Care — Services.csv');
const DEFAULT_ORIGIN = 'https://luansandes.github.io';
const MAX_QUESTION_LENGTH = 500;
const MAX_RESULTS = 4;
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'for', 'i', 'in', 'is', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'what', 'which', 'with']);
const TERM_ALIASES = {
  jab: ['vaccination'],
  jabs: ['vaccination'],
  vaccine: ['vaccination'],
  vaccines: ['vaccination'],
  shot: ['vaccination'],
  shots: ['vaccination'],
  teeth: ['dental'],
  tooth: ['dental'],
  teethcleaning: ['dental'],
  groom: ['grooming'],
  grooming: ['grooming'],
  chip: ['microchip'],
  id: ['microchip'],
  diet: ['nutrition'],
  food: ['nutrition'],
  urgent: ['emergency'],
  emergency: ['emergency'],
  neuter: ['surgery'],
  spay: ['surgery']
};

let servicesCache;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  const [headers, ...records] = rows;
  if (!headers || !headers.length) return [];
  return records
    .filter((record) => record.some((value) => value.trim()))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ''])));
}

function loadServices() {
  if (!servicesCache) {
    servicesCache = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));
  }
  return servicesCache;
}

function tokenize(value) {
  return String(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function searchableText(service) {
  return [
    service.service_name,
    service.description,
    service.category,
    service.species,
    service.price_eur,
    service.duration_min,
    service.requires_appointment,
    service.availability,
    service.slots_this_week,
    service.special_offer
  ].join(' ').toLowerCase();
}

function rankServices(question, services = loadServices()) {
  const normalizedQuestion = question.toLowerCase().trim();
  const baseTerms = [...new Set(tokenize(normalizedQuestion))]
    .filter((term) => term.length > 1)
    .flatMap((term) => term.endsWith('s') && term.length > 3 ? [term, term.slice(0, -1)] : [term])
    .filter((term) => !STOP_WORDS.has(term));
  const terms = [...new Set(baseTerms.flatMap((term) => [term, ...(TERM_ALIASES[term] || [])]))];
  if (!terms.length) return [];

  return services
    .map((service) => {
      const text = searchableText(service);
      const name = service.service_name.toLowerCase();
      let score = 0;
      const category = service.category.toLowerCase();
      for (const term of terms) {
        if (text.includes(term)) score += 2;
        if (name.includes(term)) score += 4;
        if (service.species.toLowerCase() === term || category.includes(term)) score += 3;
      }
      if (text.includes(normalizedQuestion)) score += 8;
      return { service, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.service.service_name.localeCompare(right.service.service_name))
    .slice(0, MAX_RESULTS)
    .map((result) => result.service);
}

function sourceFor(service) {
  return {
    service_id: service.service_id,
    service_name: service.service_name,
    species: service.species
  };
}

function contextFor(services) {
  return services.map((service) => JSON.stringify({
    service_id: service.service_id,
    service_name: service.service_name,
    category: service.category,
    species: service.species,
    price_eur: service.price_eur,
    duration_min: service.duration_min,
    requires_appointment: service.requires_appointment,
    availability: service.availability,
    slots_this_week: service.slots_this_week,
    special_offer: service.special_offer,
    description: service.description
  })).join('\n');
}

function getAnswerText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text)
    .join('\n')
    .trim();
}

function corsHeaders(origin) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  if (origin !== allowedOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  Object.entries({ 'Content-Type': 'application/json; charset=utf-8', ...headers }).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

async function handler(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  const headers = corsHeaders(origin);

  if (origin && origin !== allowedOrigin) {
    return sendJson(res, 403, { error: 'This origin is not allowed.' });
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    return res.end();
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' }, headers);

  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return sendJson(res, 400, { error: `Question must contain 1 to ${MAX_QUESTION_LENGTH} characters.` }, headers);
  }

  const matches = rankServices(question);
  if (!matches.length) {
    return sendJson(res, 200, {
      answer: "I can’t find that in Meadow’s services. Please try asking about a specific service, species, availability, appointment, or price.",
      sources: []
    }, headers);
  }
  if (!process.env.OPENAI_API_KEY) {
    return sendJson(res, 500, { error: 'The chat service is not configured.' }, headers);
  }

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        max_output_tokens: 350,
        input: [
          {
            role: 'developer',
            content: [{
              type: 'input_text',
              text: 'You are Meadow Vet Care\'s warm, practical services assistant. Answer only from the supplied service records. Do not invent facts, prices, policies, medical advice, or booking availability. If the records do not answer the question, say so briefly and suggest a more specific service or species question. Give the most useful direct answer first. For several relevant services, use short plain-text bullets; for one service, use one or two short sentences. Mention appointment requirements, availability, duration, price, or an offer only when present and relevant. Prices are stored as literal euro values: state them exactly as supplied, prefixed with €. Do not use Markdown formatting or create citations; the application adds sources.'
            }]
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: `Question: ${question}\n\nService records:\n${contextFor(matches)}` }]
          }
        ]
      })
    });
    if (!openaiResponse.ok) {
      console.error('OpenAI request failed:', openaiResponse.status);
      return sendJson(res, 502, { error: 'The answer service is temporarily unavailable.' }, headers);
    }
    const answer = getAnswerText(await openaiResponse.json());
    if (!answer) return sendJson(res, 502, { error: 'The answer service returned no answer.' }, headers);
    return sendJson(res, 200, { answer, sources: matches.map(sourceFor) }, headers);
  } catch (error) {
    console.error('Chat request failed:', error);
    return sendJson(res, 502, { error: 'The answer service is temporarily unavailable.' }, headers);
  }
}

module.exports = handler;
module.exports.parseCsv = parseCsv;
module.exports.rankServices = rankServices;
module.exports.loadServices = loadServices;
module.exports.sourceFor = sourceFor;
