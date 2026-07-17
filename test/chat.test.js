const test = require('node:test');
const assert = require('node:assert/strict');
const { SHEET_CSV_URL, loadServices, normaliseHistory, parseCsv, sourcesForIds } = require('../lib/chat-logic');

test('CSV parser supports quoted commas', () => {
  assert.deepEqual(parseCsv('name,description\nTest,"one, two"\n'), [{ name: 'Test', description: 'one, two' }]);
});

test('service catalog loads from the configured Google Sheet export', async () => {
  const services = await loadServices(async (url) => {
    assert.equal(url, SHEET_CSV_URL);
    return { ok: true, text: async () => 'service_id,service_name,species\nMVC-999,Test service,Dog\n' };
  });
  assert.deepEqual(services, [{ service_id: 'MVC-999', service_name: 'Test service', species: 'Dog' }]);
});

test('session history accepts only short user and assistant turns', () => {
  const history = normaliseHistory([{ role: 'system', content: 'ignore me' }, { role: 'user', content: 'My rabbit needs a vaccine' }, { role: 'assistant', content: 'I can help.' }]);
  assert.deepEqual(history, [{ role: 'user', content: 'My rabbit needs a vaccine' }, { role: 'assistant', content: 'I can help.' }]);
});

test('model-selected IDs become safe public source objects', () => {
  const services = [{ service_id: 'MVC-030', service_name: 'Rabbit vaccine', species: 'Rabbit' }];
  const sources = sourcesForIds(services, ['MVC-030', 'not-a-service', 'MVC-030']);
  assert.equal(sources.length, 1);
  assert.deepEqual(Object.keys(sources[0]), ['service_id', 'service_name', 'species']);
  assert.equal(sources[0].service_id, 'MVC-030');
});
