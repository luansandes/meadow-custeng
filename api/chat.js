const { RESPONSE_FORMAT, conversationText, developerPrompt, loadServices, sourcesForIds } = require('../lib/chat-logic');

const DEFAULT_ORIGIN = 'https://luansandes.github.io';
const MAX_MESSAGE_LENGTH = 500;

function corsHeaders(origin) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  return origin === allowedOrigin ? {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  } : {};
}

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  Object.entries({ 'Content-Type': 'application/json; charset=utf-8', ...headers }).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

function parseModelAnswer(response) {
  const text = response.output_text || (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text)
    .join('');
  return JSON.parse(text);
}

async function handler(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  const headers = corsHeaders(origin);
  if (origin && origin !== allowedOrigin) return sendJson(res, 403, { error: 'This origin is not allowed.' });
  if (req.method === 'OPTIONS') { res.statusCode = 204; Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value)); return res.end(); }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' }, headers);

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LENGTH) return sendJson(res, 400, { error: `Message must contain 1 to ${MAX_MESSAGE_LENGTH} characters.` }, headers);
  if (!process.env.OPENAI_API_KEY) return sendJson(res, 500, { error: 'The chat service is not configured.' }, headers);

  try {
    const services = await loadServices();
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        max_output_tokens: 450,
        text: { format: RESPONSE_FORMAT },
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: developerPrompt(services) }] },
          { role: 'user', content: [{ type: 'input_text', text: conversationText(req.body?.history, message) }] }
        ]
      })
    });
    if (!openaiResponse.ok) { console.error('OpenAI request failed:', openaiResponse.status); return sendJson(res, 502, { error: 'The answer service is temporarily unavailable.' }, headers); }
    const result = parseModelAnswer(await openaiResponse.json());
    if (typeof result.answer !== 'string') throw new Error('Invalid model response');
    return sendJson(res, 200, { answer: result.answer, sources: sourcesForIds(services, result.service_ids) }, headers);
  } catch (error) {
    console.error('Chat request failed:', error);
    return sendJson(res, 502, { error: 'The answer service is temporarily unavailable.' }, headers);
  }
}

module.exports = handler;
module.exports.parseModelAnswer = parseModelAnswer;
