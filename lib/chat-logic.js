const fs = require('node:fs');
const path = require('node:path');

const CSV_FILE = path.join(process.cwd(), 'Meadow Vet Care — Services.csv');
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_LENGTH = 700;

let servicesCache;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some((value) => value.trim()))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ''])));
}

function loadServices() {
  if (!servicesCache) servicesCache = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));
  return servicesCache;
}

function normaliseHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .map((turn) => ({ role: turn.role, content: turn.content.trim().slice(0, MAX_HISTORY_MESSAGE_LENGTH) }))
    .filter((turn) => turn.content)
    .slice(-MAX_HISTORY_MESSAGES);
}

function conversationText(history, message) {
  const previousTurns = normaliseHistory(history)
    .map((turn) => `${turn.role === 'user' ? 'Customer' : 'Assistant'}: ${turn.content}`)
    .join('\n');
  return `${previousTurns ? `Recent conversation:\n${previousTurns}\n\n` : ''}Current customer question: ${message}`;
}

function serviceCatalogText() {
  return loadServices().map((service) => JSON.stringify(service)).join('\n');
}

function sourcesForIds(ids) {
  const byId = new Map(loadServices().map((service) => [service.service_id, service]));
  return [...new Set(Array.isArray(ids) ? ids : [])]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, 5)
    .map((service) => ({ service_id: service.service_id, service_name: service.service_name, species: service.species }));
}

const RESPONSE_FORMAT = {
  type: 'json_schema',
  name: 'meadow_service_answer',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      answer: { type: 'string', description: 'A concise, helpful plain-text answer for the customer.' },
      service_ids: { type: 'array', items: { type: 'string' }, description: 'Only service_id values from records actually used in the answer.' }
    },
    required: ['answer', 'service_ids'],
    additionalProperties: false
  }
};

function developerPrompt() {
  return `You are Meadow Vet Care's service assistant. Use the complete service catalog below to decide which services match the customer's question. You are responsible for service selection; do not assume a separate search system selected records for you.

Give warm, practical answers using only the catalog. Never invent services, prices, policies, availability, medical advice, or booking availability. If no catalog record answers the question, say that clearly and use an empty service_ids list. Use the recent conversation only to resolve context, such as a pet species mentioned earlier. State prices as the literal catalog value prefixed with €. Use short plain-text paragraphs or bullets, never Markdown formatting. Return every service_id that materially supports the answer, and no unrelated IDs.

SERVICE CATALOG (one JSON record per line):
${serviceCatalogText()}`;
}

module.exports = { RESPONSE_FORMAT, conversationText, developerPrompt, loadServices, normaliseHistory, parseCsv, sourcesForIds };
