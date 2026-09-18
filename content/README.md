# Daisy question bank

`daisy-questions.json` is the single portable source for Daisy's 100 authored
questions: 50 `light` and 50 `deeper`. Each entry has exactly `id`, `category`,
and `prompt`. Preserve the explicit IDs when reordering or correcting wording;
consumers must not infer identity from array position.

From the repository root, using Node.js 18 or newer with no dependencies:

```sh
node --test content/daisy-questions.test.mjs
```

The checks cover schema, allowed fields and categories, the complete required
ID set, counts, single-question punctuation, a 280-Unicode-code-point limit,
and uniqueness after normalizing case, Unicode compatibility forms, punctuation,
and spacing. Negative fixtures verify that invalid banks are rejected.
These mechanical checks cannot establish semantic variety, complete English,
or emotional suitability; review every changed prompt editorially as well.

## Editorial choices and ownership

Under the wording discretion in [Decision 0004](../docs/decisions/0004-finalized-launch-rules.md),
[issue #19](https://github.com/C0derTang/shared-garden/issues/19) uses one direct
question per entry, answerable in a phrase or a few sentences. Light topics span
everyday joys, favorites, discoveries, and playful imagination. Deeper topics
span values, support preferences, hopes, self-understanding, shared memories,
and gentle relationship reflection. Neither category asks for proof of care,
private secrets, sexual details, or traumatic disclosures. Wording works for
either participant without assumed gender, living arrangements, or marriage.

All 100 prompts were individually reviewed for those criteria and semantic
overlap during authorship. That is an editorial judgment, not an automated
guarantee; future edits need the same review and fresh validation.

Keep edits and reviews in this bank rather than creating alternate catalogs in
frontend or backend code. Daily assignment, both participants receiving the
same question, and avoiding repeats until exhaustion belong to a separate
feature. Array order does not specify a delivery schedule.
