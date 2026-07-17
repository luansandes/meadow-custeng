const test = require('node:test');
const assert = require('node:assert/strict');
const { loadServices, normaliseHistory, parseCsv, sourcesForIds } = require('../lib/chat-logic');

test('loads every service record and expected CSV fields', () => {
  const services = loadServices();
  assert.equal(services.length, 94);
  assert.deepEqual(Object.keys(services[0]), [
    'service_id', 'category', 'species', 'price_eur', 'duration_min',
    'requires_appointment', 'availability', 'slots_this_week', 'special_offer',
    'service_name', 'description'
  ]);
});

test('CSV parser supports quoted commas', () => {
  assert.deepEqual(parseCsv('name,description\nTest,"one, two"\n'), [{ name: 'Test', description: 'one, two' }]);
});

test('session history accepts only short user and assistant turns', () => {
  const history = normaliseHistory([{ role: 'system', content: 'ignore me' }, { role: 'user', content: 'My rabbit needs a vaccine' }, { role: 'assistant', content: 'I can help.' }]);
  assert.deepEqual(history, [{ role: 'user', content: 'My rabbit needs a vaccine' }, { role: 'assistant', content: 'I can help.' }]);
});

test('model-selected IDs become safe public source objects', () => {
  const sources = sourcesForIds(['MVC-030', 'not-a-service', 'MVC-030']);
  assert.equal(sources.length, 1);
  assert.deepEqual(Object.keys(sources[0]), ['service_id', 'service_name', 'species']);
  assert.equal(sources[0].service_id, 'MVC-030');
});
