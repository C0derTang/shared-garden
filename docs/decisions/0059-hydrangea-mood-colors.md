# 0059 — Hydrangea colors throughout life

Approved by the user for [issue #149](https://github.com/C0derTang/shared-garden/issues/149).
Amends decisions 0004, 0009, 0010, 0022, 0045 and 0053.

Every Hydrangea stage reflects the latest saved mood from each member on that
flower. Member slots keep the same tone positions for either viewer. A missing
choice stays neutral; the six existing mood colors are the only palette inputs.
Stems and leaves stay green. Saved tones persist across rollover, refresh and
reconnection until that member chooses again. Today's care markers still refer
only to today's originals. Historical Memory artwork uses that entry's own mood
in its author's slot, with the other slot neutral.

After permanent bloom, the same daily mood form remains available optionally.
The user explicitly chose **colors and history only**: no growth, streak,
achievement or other progression credit. No daily care obligation or risk cue
is introduced. The existing one-original-per-member-per-day and same-day
30-minute author-only edit window remain. Entries and replies stay available in
History and Memories. All other ordinary permanent blooms remain closed to new
originals; Cactus behavior and pre-bloom Hydrangea behavior remain unchanged.

Conservative implementation choices under decision 0004: derive the latest
per-member tones from existing entries in an additive read field, using neutral
fallbacks for responses from older servers. Reuse all existing entry/history
storage and authorized operations. Preserve existing rollover exclusions, and
exclude optional entries from the achievement evaluator's raw pair evidence by
comparing entry garden day with the immutable first-bloom credit day. The latter
retains the final growth pair even when settlement occurs later. No new grants,
configuration, table or arbitrary-color input is required.
