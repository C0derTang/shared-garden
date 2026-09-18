// Immutable migration input is copied from the editorial source, never hand edited.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { log } from 'node:console';
const root = new URL('../', import.meta.url);
const bank = JSON.parse(readFileSync(new URL('content/daisy-questions.json', root), 'utf8'));
const migration = new URL('supabase/migrations/20260918040000_daily_entries.sql', root);
const quote = (text) => "'" + text.replaceAll("'", "''") + "'";
const ordered = [...bank].sort((a, b) => Number(a.id.slice(-3)) - Number(b.id.slice(-3)) || Number(a.category !== 'light') - Number(b.category !== 'light'));
if (ordered.length !== 100 || new Set(ordered.map((q) => q.id)).size !== 100) throw new Error('Invalid question bank');
const rows = ordered.map((q, i) => ` (${quote(q.id)},${quote(q.category)},${quote(q.prompt)},${i + 1})`).join(',\n');
const generated = `-- BEGIN GENERATED DAISY BANK\ninsert into private.daisy_questions(question_id,category,prompt,delivery_order) values\n${rows};\n-- END GENERATED DAISY BANK`;
const before = readFileSync(migration, 'utf8');
const marker = /-- BEGIN GENERATED DAISY BANK[\s\S]*?-- END GENERATED DAISY BANK/;
if (!marker.test(before)) throw new Error('Daisy migration import markers are missing');
const after = before.replace(marker, generated);
if (process.argv.includes('--check')) {
  if (before !== after) throw new Error('Daisy migration differs from content/daisy-questions.json');
  log('Daisy migration matches all 100 authored questions and their alternating order.');
} else {
  writeFileSync(fileURLToPath(migration), after);
}
