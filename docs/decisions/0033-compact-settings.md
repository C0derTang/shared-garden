# Compact settings presentation

Status: conservative presentation choices under
[decision 0004](0004-finalized-launch-rules.md) and
[decision 0029](0029-immersive-garden.md), for
[issue #78](https://github.com/C0derTang/shared-garden/issues/78).

## Settings rows

The Settings route panel title is the page introduction. Its contents use one
compact bordered group rather than another title and a stack of explanatory
cards. Garden guide, gentle motion, garden-day help, and account access appear
as short labeled rows. Rows place their action beside the label where space
allows and stack below 420 CSS pixels so controls remain readable at the
supported 320-pixel viewport. Buttons and the motion label retain at least a
44-pixel target.

The garden-day row names the fixed 4 a.m. Pacific rollover in its summary and
keeps the longer explanation collapsed until requested. The motion row states
that the operating-system reduced-motion preference wins. Reopening the guide
still waits for a confirmed preference save before returning to the garden.
Failed saves retain the last confirmed control value and place the existing
refresh action directly in the settings group. Sign out remains the existing
same-origin POST action.

## Private owner control

The existing owner-only portal remains the sole way private controls enter
Settings. Its content uses a compact subsection below the personal rows and one
concise delivery-status line. The line distinguishes ready and armed, ready and
disarmed, saved pending and armed, saved pending and paused, and answered states.
Pending copy continues to say whether delivery is active without implying that
pausing erased the saved moment. Preview and arm controls keep 44-pixel targets.

The interaction lifecycle, owner authorization, preview isolation, queueing,
arming, answer acknowledgement, and durable pending and answered semantics are
unchanged. Private message text, answer labels, identities, and configuration
remain runtime-only and are not represented in this public decision.

Private interaction errors, confirmations, owner answer notifications, and a
recipient's dismissed-moment reopen action use the same active presentation
region. It appears in the currently active guide or moment sheet, otherwise
directly below an open route-panel header, and otherwise in a fixed,
safe-area-aware Garden region. Moving the presentation does not move focus,
duplicate notification state, or change acknowledgement, retry, and sheet-queue
behavior. This keeps recovery, acknowledgement, and reopen controls inside the
active modal accessibility tree and within the Garden viewport.

## Verification boundary

Component coverage exercises confirmed settings failures and retries, guide
reopen navigation, motion changes, collapsed garden-day help, every owner status,
preview isolation, and route-panel sheet coordination. Browser checks use only a
disposable synthetic local fixture at phone and desktop widths. No production
preference or private-interaction state is read or changed.
