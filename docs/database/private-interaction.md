# Private interaction setup and verification

Implements [issue #36](https://github.com/C0derTang/shared-garden/issues/36) and
[decision 0020](../decisions/0020-private-interaction.md), within the unchanged
[launch rules](../decisions/0004-finalized-launch-rules.md).

## Private deployment setup

After the fixed two-member bootstrap, a privileged database session calls
`private.bootstrap_private_interaction(smallint,text,text,jsonb)`. The arguments
are recipient slot `2`, title, message and an array of two to six objects with
`key` and `label`. Slot `1` remains the authoritative owner. Use bound parameters
from a private deployment tool. Do not put actual identities, copy, labels,
connection credentials or expanded parameter values in shell arguments, Git,
public artifacts or CI output. The release operator supplies these privately;
no production values are required by this implementation.

The bootstrap starts armed, creates no delivery, and accepts only an identical
configuration on retry. A retry never rearms or clears history. It is not exposed
through the API and is denied to all API roles, including `service_role`.
Recipient reads settle normal garden activity before the exact-26 check.
Owner preview/status do not settle, create a garden, or consume an event.

## Application seams

`PrivateInteraction` mounts in the already member-guarded `GardenLayout` and
independently reauthorizes through server actions. Every guarded destination
therefore receives eligible delivery or an owner unread answer. Only
`current="settings"` enables its modular owner controls. Settings/onboarding
work can replace the placeholder page without duplicating or moving this mount.

RPCs are `current_private_interaction()`,
`answer_private_interaction(p_answer_key)`, and
`owner_private_interaction(p_action,p_armed)`. The last accepts `status`,
`preview`, `arm` and `acknowledge`, and verifies owner membership itself.
Recipient unavailable responses contain no configuration or eligibility detail.
Answered recipients receive only `{"status":"answered"}`. Owner status includes
the saved choice and server time, while preview alone returns full content.

The private tables are never Realtime publications. The public
`private_interaction_signals` table carries only `owner_id` and `revision` under
live-owner RLS. Actual subscribers receive no private copy/answer from this
channel. Supabase can send anonymous empty change envelopes with no row fields;
these are not treated as authorized payloads. Partner and unrelated
Authenticated clients receive no signal rows. Revision updates occur on the
first answer and first acknowledgment only. The client coalesces refreshes,
ignores reads superseded by mutations, retries on focus/reconnect, and polls
while visible to recover missed changes. A failed refresh clears private copy.

## Reproducible local checks

Use an empty disposable local Supabase project; never point these harnesses at
a hosted project. The SQL tests roll back. The concurrency and HTTP harnesses
refuse configured member/Auth state and remove their synthetic fixtures; reset
the dedicated project afterward even after interrupted runs.

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- `supabase test db` includes eligibility, malformed bounded configuration,
  preview isolation, all lifecycle states, metadata forgery, revocation,
  direct-table/RPC denial, replay, owner acknowledgment and growth invariance.
- Run `docs/auth/verify-identity-auth-role.sql` as the local platform Auth test
  administrator to check the actual hook and identity binding lifecycle.
- `python3 supabase/tests/concurrency/private_interaction_race.py CONTAINER`
  observes real garden-lock waits for double delivery, disarm against answer,
  differing and matching answer retries, and simultaneous acknowledgments.
- `node scripts/verify-private-interaction.mjs LOCAL_STATUS_JSON` targets the
  reserved local `58621` project; add `ci` for the default CI `56321` project.
  It exercises actual PostgREST and Realtime with synthetic JWTs, scans denied
  responses for the synthetic private marker, verifies notification payload
  isolation and revocation, and detects read-triggered feedback loops.
- The Linux audio runtime remains part of the complete app checks. Run the
  full suite and `scripts/verify-audio-runtime.mjs` in Linux amd64. This feature
  does not change native media processing.

## Browser observations

The local synthetic owner preview was inspected at 320 pixels and a recipient
prompt at 390 pixels. Preview choice selection had no delivery or signal rows.
At 25 awards the recipient had only normal garden controls; at 26 the private
prompt appeared. A full refresh retained the pending prompt. Owner disarm hid
it, rearm resumed it, and closing/reopening left ordinary garden controls usable.
Saving one explicit choice closed the prompt and produced the open owner's
unread notification. A recipient refresh did not repeat it. Owner reload retained
unread state; explicit acknowledgment changed it to saved history.

The garden still had one Cactus, zero growth and zero blooms after this synthetic
sequence. The phone body width matched the 390-pixel viewport, all controls were
reachable, and the bloom decoration has a reduced-motion rule. Only the in-app
browser was used; no real Google login, production interaction or real account
was consumed. All helper routes, runtime fixtures and session material lived
outside the repository. No test bypass route is included in the application.
