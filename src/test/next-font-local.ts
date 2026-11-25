// next/font is a compile-time transform; tests receive a deterministic stand-in.
const localFont = () => ({ className: "test-local-font", style: { fontFamily: "cursive" } });

export default localFont;
