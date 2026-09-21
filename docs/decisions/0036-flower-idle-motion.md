# Flower idle motion

Status: conservative visual refinement under
[decision 0004](0004-finalized-launch-rules.md), for
[issue #88](https://github.com/C0derTang/shared-garden/issues/88). This extends
the artwork contract in [decision 0022](0022-flower-sprites.md) and preserves
the preference behavior in [decision 0033](0033-compact-settings.md).

## Motion treatment

Sprouts, buds, blooms, and fulfilled Dandelions use a slow 1.6-degree sway
anchored near the plant base. Seeds stay still. The animation transforms only
the SVG drawing in planted garden spots; planting coordinates, button boxes,
labels, focus targets, and
the original integer-aligned artwork remain unchanged. It uses CSS keyframes,
with no React timer, render loop, or added dependency.

Idle motion is an explicit sprite presentation option used by planted flowers.
Sprites in seed selection, sheets, memories, and the private full-bloom moment
remain static because those are selection, detail, history, or event views rather
than the idle garden. This also avoids adding ambient movement to route panels.

Species have fixed duration and negative-delay groups so collections begin at
different points in the cycle on every render. Garden planting spots supply a
second stable four-phase sequence, which also separates repeated species. The
animation is deliberately small enough to stay within the existing sprite and
bed clearances at supported phone and desktop widths.

## Suppression and verification

The authenticated member setting continues to suppress all animations with the
existing server-rendered global style when motion is disabled or unavailable.
The sprite also removes its own animation under `prefers-reduced-motion: reduce`,
so the device setting wins independently. Neither mechanism changes flower
state or artwork.

Verification uses the real sprite and garden components with disposable
synthetic data. It covers mixed stages and a two-bed full-bloom garden at 320,
390, and 1280 CSS pixels; computed running animation and differing phases;
member and device suppression; unchanged button geometry and interaction; and
the existing automated checks. No production data or preferences are used.
