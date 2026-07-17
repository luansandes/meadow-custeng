const test = require('node:test');
const assert = require('node:assert/strict');
const { loadServices, parseCsv, rankServices, sourceFor } = require('../api/chat');

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

test('retrieval ranks species-specific dental services', () => {
  const matches = rankServices('What dental services are available for cats?');
  assert.ok(matches.length > 0);
  assert.equal(matches[0].species, 'Cat');
  assert.match(matches[0].category, /Dental/);
});

test('retrieval understands common service synonyms', () => {
  const matches = rankServices('Which vaccines are available for rabbits?');
  assert.ok(matches.length > 0);
  assert.equal(matches[0].species, 'Rabbit');
  assert.equal(matches[0].category, 'Vaccination');
});

test('retrieval returns no records for unrelated queries', () => {
  assert.deepEqual(rankServices('astronaut spaceship weather'), []);
});

test('public source objects never expose full service records', () => {
  const source = sourceFor(loadServices()[0]);
  assert.deepEqual(Object.keys(source), ['service_id', 'service_name', 'species']);
});
