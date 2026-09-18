import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bank = JSON.parse(readFileSync(new URL('./daisy-questions.json', import.meta.url), 'utf8'));
const categories = ['light', 'deeper'];
const expectedIds = categories.flatMap((category) =>
  Array.from({ length: 50 }, (_, index) => `${category}-${String(index + 1).padStart(3, '0')}`),
);

function validateBank(questions) {
  assert.ok(Array.isArray(questions), 'Bank must be an array');
  assert.equal(questions.length, 100, 'Bank must contain exactly 100 questions');
  const ids = new Set();
  const prompts = new Set();
  const counts = { light: 0, deeper: 0 };

  for (const question of questions) {
    assert.ok(question !== null && typeof question === 'object' && !Array.isArray(question),
      'Each question must be an object');
    assert.deepEqual(Object.keys(question).sort(), ['category', 'id', 'prompt'],
      'Each question must have only id, category, and prompt');
    assert.ok(categories.includes(question.category), 'Unknown category');
    assert.equal(typeof question.id, 'string', 'ID must be a string');
    assert.ok(expectedIds.includes(question.id), `Unexpected ID: ${question.id}`);
    assert.ok(question.id.startsWith(`${question.category}-`), 'ID must match category');
    assert.ok(!ids.has(question.id), `Duplicate ID: ${question.id}`);
    ids.add(question.id);
    counts[question.category] += 1;

    const { prompt } = question;
    assert.equal(typeof prompt, 'string', `${question.id}: prompt must be a string`);
    assert.equal(prompt, prompt.trim(), `${question.id}: prompt must be trimmed`);
    assert.ok(!/[\p{Cc}\p{Cf}]/u.test(prompt), `${question.id}: no control or hidden characters`);
    assert.ok(Array.from(prompt).length <= 280, `${question.id}: prompt exceeds 280 characters`);
    assert.match(prompt, /^[A-Z][^?]*\?$/u, `${question.id}: use one capitalized question ending in ?`);

    // Ignore case, compatibility variants, punctuation, and spacing for duplicates.
    // Semantic uniqueness and complete, gentle English still need human review.
    const normalized = prompt.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    assert.ok(!prompts.has(normalized), `${question.id}: duplicate normalized prompt`);
    prompts.add(normalized);
  }

  assert.deepEqual([...ids].sort(), [...expectedIds].sort(), 'Bank must contain every required ID');
  assert.deepEqual(counts, { light: 50, deeper: 50 }, 'Each category must have exactly 50 questions');
}

test('the authored bank meets the Daisy content contract', () => validateBank(bank));
test('IDs remain valid independently of array ordering', () => validateBank([...bank].reverse()));

const invalidCases = [
  ['non-array bank', () => ({}), /Bank must be an array/],
  ['missing question', (copy) => copy.slice(1), /exactly 100/],
  ['extra question', (copy) => [...copy, copy[0]], /exactly 100/],
  ['null entry', (copy) => { copy[0] = null; return copy; }, /must be an object/],
  ['array entry', (copy) => { copy[0] = []; return copy; }, /must be an object/],
  ['missing field', (copy) => { delete copy[0].prompt; return copy; }, /must have only/],
  ['extra field', (copy) => { copy[0].answer = ''; return copy; }, /must have only/],
  ['unknown category', (copy) => { copy[0].category = 'medium'; return copy; }, /Unknown category/],
  ['category mismatch', (copy) => { copy[0].category = 'deeper'; return copy; }, /ID must match/],
  ['numeric ID', (copy) => { copy[0].id = 1; return copy; }, /ID must be a string/],
  ['out-of-range ID', (copy) => { copy[0].id = 'light-051'; return copy; }, /Unexpected ID/],
  ['wrong ID padding', (copy) => { copy[0].id = 'light-1'; return copy; }, /Unexpected ID/],
  ['duplicate ID', (copy) => { copy[0].id = copy[1].id; return copy; }, /Duplicate ID/],
  ['non-string prompt', (copy) => { copy[0].prompt = 42; return copy; }, /prompt must be a string/],
  ['empty prompt', (copy) => { copy[0].prompt = ''; return copy; }, /one capitalized question/],
  ['untrimmed prompt', (copy) => { copy[0].prompt += ' '; return copy; }, /must be trimmed/],
  ['multiline prompt', (copy) => { copy[0].prompt = 'What\nis it?'; return copy; }, /no control/],
  ['invisible character', (copy) => { copy[0].prompt = 'What\u200b is it?'; return copy; }, /no control/],
  ['overlong prompt', (copy) => { copy[0].prompt = `${'A'.repeat(280)}?`; return copy; }, /exceeds 280/],
  ['statement', (copy) => { copy[0].prompt = 'Tell me about today.'; return copy; }, /one capitalized question/],
  ['two questions', (copy) => { copy[0].prompt = 'What is it? Why?'; return copy; }, /one capitalized question/],
  ['exact duplicate', (copy) => { copy[0].prompt = copy[1].prompt; return copy; }, /duplicate normalized/],
  ['normalized duplicate', (copy) => {
    copy[0].prompt = 'What is your favorite snack?';
    copy[1].prompt = 'WHAT IS YOUR FAVORITE, SNACK?';
    return copy;
  }, /duplicate normalized/],
  ['Unicode compatibility duplicate', (copy) => {
    copy[0].prompt = 'What is your favorite snack?';
    copy[1].prompt = 'What is your favorite ｓｎａｃｋ?';
    return copy;
  }, /duplicate normalized/],
];

for (const [name, mutate, error] of invalidCases) {
  test(`rejects ${name}`, () => assert.throws(() => validateBank(mutate(structuredClone(bank))), error));
}

test('accepts the inclusive 280-character boundary', () => {
  const copy = structuredClone(bank);
  // Mechanical boundary fixture only; the authored English receives editorial review.
  copy[0].prompt = `${'A'.repeat(279)}?`;
  validateBank(copy);
});
