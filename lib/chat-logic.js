const fs = require('node:fs');
const path = require('node:path');

const INSTRUCTIONS_FILE = path.join(process.cwd(), 'chatbot-instructions.md');
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1JhSODtviGHzXru6Eb5MhfXfVIF5vtJk3pclzzv7j2l4/export?format=csv&gid=1277715587';
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_LENGTH = 700;

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

async function loadServices(fetchImpl = fetch) {
  const response = await fetchImpl(SHEET_CSV_URL, { headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new Error(`Google Sheets request failed with ${response.status}`);
  const services = parseCsv(await response.text());
  if (!services.length || !services.every((service) => service.service_id)) throw new Error('Google Sheets CSV has no valid service IDs');
  return services;
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

function serviceCatalogText(services) {
  return services.map((service) => JSON.stringify(service)).join('\n');
}

function sourcesForIds(services, ids) {
  const byId = new Map(services.map((service) => [service.service_id, service]));
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

function developerPrompt(services, liveContext) {
  const instructions = fs.readFileSync(INSTRUCTIONS_FILE, 'utf8').trim();
  return `${instructions}\n\nLIVE DUBLIN CONTEXT (fetched for this message):\n${JSON.stringify(liveContext)}\n\nSERVICE CATALOG (one JSON record per line):\n${serviceCatalogText(services)}`;
}

module.exports = { RESPONSE_FORMAT, SHEET_CSV_URL, conversationText, developerPrompt, loadServices, normaliseHistory, parseCsv, sourcesForIds };
