# Compact garden guide

Status: approved direction and conservative interaction choices under
[decision 0004](0004-finalized-launch-rules.md), implemented for
[issue #75](https://github.com/C0derTang/shared-garden/issues/75).
This extends the modal contract in [decision 0029](0029-immersive-garden.md).

The guide is a centered, content-sized box over a translucent black tint of the
actual garden. It consumes no garden layout height. A short title, one instruction,
one primary action, and a count of the member’s two saved tutorial care facts
replace the long introductory card. Skip and temporary Close remain visible;
blooming Roses also offer Finish. The box is bounded by the viewport and safe
areas, scrolls for enlarged text, and introduces no animation.

The existing guide-step model chooses Cactus, an available seed patch, an existing
Rose, blooming Rose memories, ready, or unavailable from actual member facts.
The seed picker remains unrestricted. No guide action writes demonstration care,
selects a seed automatically, or changes progression or backend rules.

The guide requests a slot in the existing sheet FIFO. Its primary action releases
that slot and directly opens the relevant real spot sheet. It stays suspended
until that sheet closes, then rejoins the queue at the back using the current
facts. Already pending private moments retain priority over both that action and
the returning guide. A newly planted spot opens its flower care when revisited.
The guide never requires a click on the inert background.

Destination routes suspend the guide and release its slot, including browser
history navigation. A destination still waits for an active flower sheet under
0029’s contract. Reopening from Settings uses the existing successful preference
save and guide-request counter, then returns to Garden. Routine refresh does not
reopen a locally closed guide. There remains one preferences provider and one
private-event lifecycle.

The guide traps keyboard focus; the garden backdrop is inert while it is active.
Escape and Close temporarily hide it and return focus to the compact Guide button
once no queued sheet owns focus. Outside clicks do not dismiss it. Skip and Finish
hide it only after a successful save; errors retain the focused control and allow
retry. A pending save cannot take focus away from a subsequently opened flower
draft. Successful dismissal returns focus to the garden when no interaction owns
focus. No backend, identity, privacy, media, or eligibility policy changes apply.
