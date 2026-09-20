# Achievement badges and inline details

Status: conservative presentation choices under the approved direction in
[decision 0029](0029-immersive-garden.md), implemented by
[issue #77](https://github.com/C0derTang/shared-garden/issues/77).
Preserves [decision 0004](0004-finalized-launch-rules.md).

The Achievements route panel contains a compact two-column badge collection on
phones and four columns on wider screens. A small count, current shared streak,
overall progress bar, connection state, and Refresh control precede it. All 26
ordinary achievements remain in the server's order. There is no private-event
badge, hint, or extra completion denominator.

Short display labels and the existing pixel sprout, flower, heart, and book icons
make badges easier to scan. Every badge's accessible name retains the complete
server title, earned/growing state, and exact progress, target, and unit. Earned
badges use a check mark, solid border, and explicit Earned text; growing badges
use a diamond, dashed border, and explicit Growing text. Color is supplemental.
No animation is required, including when motion is enabled.

Activating a badge expands its details across the grid width, in place in the
existing route panel. Only one badge is expanded at a time. Its same button
remains focused and toggles the details closed with pointer, Enter, or Space.
The button exposes its expanded state and controlled detail element. Details
show the full server title, verbatim requirement, exact progress/target/unit,
and the earned date in Pacific time when present. Text wraps without truncation.
There is no extra modal, focus trap, provider, or sheet queue participant; Escape
continues to close the parent route panel according to the foundation contract.

Earned state is derived solely from the server's earned timestamp, never from
client progress reaching a target. Refresh, Realtime, focus/online events,
visible-page polling, stale-snapshot rejection, error feedback, and manual retry
retain their existing behavior. Refreshing a selected badge updates its details
without collapsing it. Full requirements and dates are deliberately absent from
the default compact view; they remain available on demand.
