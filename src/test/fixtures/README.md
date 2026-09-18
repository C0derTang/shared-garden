# Synthetic photo fixtures

`two-frame.apng` is the review regression fixture: a hand-constructed 1 × 1
RGBA PNG animation with two frames (red, then blue), no personal content or
metadata. Its chunks are `IHDR`, `acTL` (two frames), `fcTL`, `IDAT`, `fcTL`,
`fdAT`, `IEND`, with valid CRCs. It reproduces Sharp/libvips reporting PNG with
no `pages` field and accepting only the first frame. The sanitizer must reject
it as unsupported animation rather than silently flattening the composition.
