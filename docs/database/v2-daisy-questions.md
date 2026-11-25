# New-garden Daisy questions API

Contract for [decision 0068](../decisions/0068-daisy-custom-questions.md) and
[issue #212](https://github.com/C0derTang/shared-garden/issues/212), on top of
the new garden from [decision 0067](../decisions/0067-garden-overhaul.md).
Migration: `supabase/migrations/20261124500000_garden_v2_daisy_custom_questions.sql`.
Tests: `supabase/tests/database/garden_v2_daisy_questions.test.sql`. Legacy
`daisy_assignments`, `flower_entries` and their functions are unchanged.

## RPCs (authenticated members only)

| Function | Result and use |
| --- | --- |
| `v2_ask_daisy_question(p_flower_id uuid, p_question jsonb)` | Ask or revise your question for your partner on a Daisy today. `p_question` is exactly `{"prompt": "<1–300 characters>"}`. Returns `{flower_id, garden_day, questions}` |
| `v2_remove_daisy_question(p_flower_id uuid)` | Withdraw your unanswered question for today; does nothing if none is live. Same result shape |
| `v2_daisy_entry_questions(p_entry_ids bigint[])` | 1–100 entry IDs; returns `[{entry_id, question}]` for the Daisy entries among them, for history pages |
| `v2_submit_flower_entry(p_flower_id, p_payload)` | Unchanged signature. A Daisy payload is `{text, question_id}`, where `question_id` is the key of the question you were shown |
| `v2_edit_flower_entry(p_entry_id, p_payload)` | Unchanged signature. A Daisy edit must send the original `question_id` |

The server derives the asker (the caller), the addressee (the other member), the
garden day and every time. There is no client actor, addressee, day or clock
argument. Every call takes the v2 garden lock first, through
`v2_begin_garden_operation`.

### Errors

SQLSTATE `42501` means denied access: not a member, or the partner is not a
current member. SQLSTATE `22023` means rejected input, with these messages:

| Message | Meaning |
| --- | --- |
| `Unknown Daisy` | Not a new-garden Daisy (wrong or unknown flower) |
| `This flower has already bloomed` | A bloomed Daisy takes no new question |
| `Invalid question fields` | Not exactly `{"prompt": string}`, or over 20,000 bytes |
| `Ask a question of 1 to 300 characters` | Empty after trimming, or too long |
| `The question is locked` | The addressee already has a Daisy entry on that flower today |
| `Your question changed; refresh and answer again` | Stale answer: the question changed, was withdrawn, or a custom question is live while the daily ID was sent |
| `Answer the question asked of you` | Forged key: not a question addressed to you on this flower today |
| `Answer the assigned daily question` | A bank ID other than today's assignment |
| `An edit keeps its original question` | An edit sent a different `question_id` |

## Snapshot fields

`v2_current_garden_state` plants gain:

- `daisy_custom_questions`: today's live custom questions on a Daisy, or `[]`
  for other flowers. Each has `id`, `asker_id`, `addressee_id`, `prompt`,
  `revision`, `question_key` (`custom-<id>-r<revision>`), `created_at`,
  `updated_at` and `locked` (the addressee has answered). Withdrawn questions
  are omitted.
- Each entry in `entries` gains `daisy_custom_question_id` (bigint or null) and
  `question`. `question` is null for other flowers. For the daily question it
  is `{kind: "daily", prompt, category, question_id}`, and for a custom question
  it is `{kind: "custom", prompt, asked_by}`.

`daisy_question` (the day's bank assignment) is unchanged. The question a member
answers is the live custom question addressed to them, otherwise
`daisy_question`. `v2_entry_history` rows include `daisy_custom_question_id`.
`v2_memories_page` Daisy items keep `entry.question`, now the answer's own
question, and add `entry.question_asked_by` (1, 2 or null for the daily
question).

## Readable table

`v2_daisy_custom_questions` (live-member RLS, SELECT only for `authenticated`;
no writes for any API role): `id`, `flower_id`, `garden_day`, `asker_id`,
`addressee_id`, `prompt` (null once withdrawn), `revision`, `created_at`,
`updated_at`. There is one row per Daisy, day and asker. It is published to
`supabase_realtime` for INSERT and UPDATE. Clients treat messages only as
invalidation and reread the snapshot.

## Rollover and achievements

A custom answer is ordinary Daisy care for pairing and growth. For a paired
Daisy day, `v2_flower_day_facts.daisy_question_id` is the bank ID when both
members answered the daily question. It is `custom:<flower id>:<YYYY-MM-DD>`
when either answer used a custom question. "Twenty paired Daisy questions"
(`daisy-20`) counts distinct values across settled facts and today's pairs.

## Local verification

```sh
npm run db:start
npm run db:reset
npm run db:test
```

Use only generic fixture text. Never copy private content into tests or docs.
