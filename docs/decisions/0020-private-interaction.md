# Privately configured final interaction

Status: conservative implementation choices under [decision 0004](0004-finalized-launch-rules.md), for [issue #36](https://github.com/C0derTang/shared-garden/issues/36).

## Configuration and authority

A privileged, non-API bootstrap installs one immutable configuration after the two membership slots exist. Slot 1 is the existing immutable owner; slot 2 is the designated recipient. No identities or message content are shipped. The bootstrap accepts a title (1–160 characters), message (1–4000), and two to six choices with unique lowercase keys (1–48 ASCII letters, digits, underscores or hyphens) and labels (1–120). All are plain text. Identical bootstrap retries are harmless; different configuration is rejected. It starts armed. Changing delivered copy or resetting a lifecycle requires a separately approved operation and has no application endpoint.

Every recipient operation checks live membership, takes the established garden lock, settles completed days and evaluates ordinary achievements, then checks the existing exact-26 predicate. The interaction is absent from that catalog. Client role metadata, flags, clocks and counts are never authority. All unauthenticated, unrelated, incomplete, unconfigured and disarmed requests fail closed. Recipient reads in those last three states expose only a generic unavailable state.

The first eligible, armed recipient read creates the singleton pending record. Repeated and concurrent reads return the same delivery. The first valid explicit choice records the recipient slot, server time, key and label atomically. Later submissions return the already-answered state without replacing the answer, including different-key retries. Invalid keys never create or answer an event. An answered recipient receives no message or answer payload and is never prompted again.

Disarming hides a pending message and rejects new answers until rearmed; it preserves the pending record and original delivery time. It cannot recall content already viewed in an open browser. The client checks on visibility/reconnect and every 15 seconds while visible, clears stale private content on a failed refresh, and the database always checks arming again before accepting an answer. Rearming resumes that same pending event. Neither control can erase or reset an answer.

## Owner and notification

Owner RPCs derive the role from the authoritative membership binding before returning status, preview or answer. Preview reads the private configuration without creating a pending record, evaluating eligibility, answering, or notifying. The preview is explicitly labeled and its choice buttons demonstrate selection locally only. Settings contains modular owner controls; the main navigation remains Garden, Memories and Achievements.

The answer has a durable unread state until the owner explicitly acknowledges it. Acknowledgment is idempotent and retains answer/history. While any authenticated page is open, a separately subscribed owner-only Realtime row invalidates the owner snapshot immediately; focus/reconnect/poll refresh also recover missed notifications. The row contains only a fixed owner slot and monotonically increasing revision. Private configuration and delivery/answer tables are in the unexposed private schema, have RLS and revoked API-role privileges, and are never published to Realtime. The signal's RLS permits only the live owner. Reads and repeated commands never change this signal, preventing refresh loops. No external notification service is used.

## Presentation and isolation

Pending delivery uses an accessible, dismissible bottom sheet with explicit choice buttons, confirmation of the selected choice and a separate save action. Closing it retains a small reopen control for the current visit. The garden remains usable. The decorative collection of all 13 full-bloom sprites uses the existing display-only sprite presentation and respects reduced motion; it never writes flower state, planting counts, achievements or history. Normal settlement performed by a recipient operation remains the existing garden behavior.

Authorized private content is loaded through uncached member-guarded server actions, never static props or public environment variables. React renders text rather than HTML. Owner status is hidden from other members even if they call actions, RPCs or direct routes themselves. No production preview-as-recipient, eligibility override, fixture seed or force-unlock endpoint exists.
