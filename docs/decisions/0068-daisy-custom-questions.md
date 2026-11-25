# 0068 — Daisy custom questions

Status: approved by the user on 2026-11-24. Source:
[issue #212](https://github.com/C0derTang/shared-garden/issues/212).
The choices below the user's answers are conservative choices under the
discretion of [decision 0067](0067-garden-overhaul.md) and
[decision 0004](0004-finalized-launch-rules.md). Follow
[AGENTS.md](../../AGENTS.md) for issue, build, review and merge gates.

This decision applies to the new garden (`/garden`) only. The frozen legacy
garden (`/legacy`), its tables and its functions are unchanged.

## The user's answers

The user asked for the Daisy's daily question to be editable, so the two
members can ask each other their own questions when they prefer that to the
daily one. They confirmed:

1. **Flower:** the Daisy. The Dandelion has no daily question; it holds one wish.
2. **Model:** "ask your partner". Each member can write one question for the
   other. You answer theirs, they answer yours. With no custom question, the
   partner sees the daily question.
3. **Timing:** a custom question can be written or edited at any time during the
   garden day until the partner has answered it. Then it locks.
4. **Achievement:** custom-question days count toward "Twenty paired Daisy
   questions". Each paired day that uses a custom question counts as one
   distinct question.

## Conservative choices

- **Scope:** at most one custom question per asker, Daisy and Pacific garden day
  (the 4 a.m. America/Los_Angeles boundary). The server makes the other member
  the addressee; no client chooses an addressee, a day or a time. The addressee
  must be a current (unrevoked) member. Each Daisy is independent. A bloomed
  Daisy takes no new question, because it takes no new answers. Past days are
  read-only.
- **Text:** the request body is exactly `{"prompt": <string>}`. Unknown fields,
  non-string values and bodies over 20,000 encoded bytes are rejected. The text
  is trimmed and must be 1–300 Unicode characters, in the style of
  [decision 0009](0009-daily-entries-and-questions.md).
- **Lifecycle:** the asker can ask, revise or withdraw only while the addressee
  has no Daisy entry on that flower that day, and only on the current day.
  Withdrawing returns the addressee to the daily question. Once the addressee
  answers, the question is permanent. If the addressee has already answered the
  daily question, no custom question can be added for them that day. An
  unanswered question stays with its own day; the next day starts fresh and the
  addressee sees that day's daily question.
- **Storage:** `v2_daisy_custom_questions` keeps one row per Daisy, day and
  asker. Each change bumps the row's `revision`. Withdrawing clears the text and
  bumps the revision instead of deleting the row, so Realtime delivers the
  change; the garden's publication excludes deletes. Asking again reuses the row
  with a new revision. A guard trigger beneath the functions refuses any change
  to a row whose addressee has answered, and any change to its flower, day or
  members.
- **Binding answers:** a Daisy answer still sends `{text, question_id}`.
  `question_id` is the daily bank ID (for example `light-001`) or the custom
  question key `custom-<id>-r<revision>` that the snapshot returned for the
  question the person saw. Under the garden lock, the server checks that key
  against the question actually addressed to the author on that flower and day:
  - a changed or withdrawn question, or the daily ID while a custom question is
    live, is rejected as stale ("Your question changed; refresh and answer
    again");
  - a key naming any question not addressed to the author there is rejected as
    forged ("Answer the question asked of you").

  The entry records `daisy_custom_question_id`. A composite foreign key proves
  that the question has the same flower and day and is addressed to the
  entry's author. An edit must send the same `question_id`, so an answer's
  question never changes.
- **Daily assignment:** unchanged. `v2_daisy_assignments` still assigns the bank
  question on the first Daisy read or answer of the day, and consumes its
  position in the cycle as before. Every Daisy entry still records its
  assignment day.
- **Care and growth:** answering a custom question is ordinary Daisy care.
  Pairing, growth, bloom, qualifying days, streaks and the ten-minute and
  before-noon evidence are unchanged.
- **Achievement key:** a paired Daisy flower-day where both members answered the
  daily question still counts under its bank question ID. A paired flower-day
  where either answer used a custom question counts under
  `custom:<flower id>:<garden day>`, which is unique to that Daisy and day.
  Settlement stores the same key in `v2_flower_day_facts.daisy_question_id`, and
  the evaluator uses the same rule for today's unsettled pairs. No custom
  question existed before this change, so existing facts and progress are
  unchanged and cannot decrease.
- **Display (split view):**
  - The Daisy's callout shows the question you answer. Its label is "today's
    light question", "today's deeper question" or "<partner> asks", using the
    private display name from
    [decision 0058](0058-private-member-display-names.md).
  - Below it, "ask <partner> your own question" opens a small form with a
    `n / 300` count, then "ask" or "save question", and "cancel". Once asked,
    the panel shows "you asked <partner>" with "edit" and "remove", and "You can
    change it until <partner> answers." When the partner has answered, the panel
    shows "<partner> answered · it stays as asked" and no controls.
  - With no question asked and the partner already answered, the control is
    hidden. On a bloomed Daisy, both the callout and the control are hidden.
  - The answer field says "Answer <partner>'s question" for a custom question.
  - If the question changes while you have a draft, a note asks you to read it
    again and sharing waits for "answer this question". The draft is kept.
  - Each answer card and each earlier-days entry starts with the question it
    answered: "the light question", "the deeper question", "you asked" or
    "<partner> asked".
- **Memories:** a Daisy card shows its answer's own question. For a custom
  question, "you asked" or "<partner> asked" appears above it. Daily questions
  show as before.
- **Sync and privacy:** custom questions are private garden content. They have
  live-member RLS and SELECT-only browser grants, with no grants for the
  service role or for anonymous callers. All changes go through
  `SECURITY DEFINER` functions. These run under the garden-operation lock, with
  `search_path = pg_catalog` and explicit grants
  ([decision 0028](0028-explicit-function-grants.md)). The table joins the
  existing `supabase_realtime` publication and the new garden's invalidation
  channel, so the partner sees questions asked, revised or withdrawn without
  reloading.
- **Excluded:** notifications, Today-card and away-note nudges, suggestions,
  changes to the bank or its order, custom questions on other flowers and
  editing a question after it is answered.

The functions and fields are documented in
[the new-garden Daisy question API](../database/v2-daisy-questions.md).
