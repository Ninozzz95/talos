/**
 * Source of truth: TALOS Desktop 0.1.7 @ 0c432153a288f64237e98403869d02d20d8fabc7
 * - resources/harness-ui/public/talos/brand/logo-short.svg
 * - resources/harness-ui/public/index.html boot layers
 * - resources/harness-ui/public/avvio.js reveal timing
 *
 * These frames are manually curated fixed-width terminal interpretations of the
 * Desktop graph mark. They are checked in; startup never rasterizes SVG assets.
 */
export const DESKTOP_LOGO_SOURCE={
  commit:'0c432153a288f64237e98403869d02d20d8fabc7',
  svg:'resources/harness-ui/public/talos/brand/logo-short.svg',
  markup:'resources/harness-ui/public/index.html',
  script:'resources/harness-ui/public/avvio.js',
  nominalRevealMs:7200,
} as const;

export const TALOS_ASCII_FRAMES:readonly (readonly string[])[]=Object.freeze([
  Object.freeze([
    '             ',
    '             ',
    '    ╱   ╲    ',
    '   ╱     ╲   ',
    '  │       │  ',
    '  │       │  ',
    '   ╲     ╱   ',
    '    ╲___╱    ',
  ]),
  Object.freeze([
    '      ●      ',
    '             ',
    '    ╱   ╲    ',
    '   ╱     ╲   ',
    '  │       │  ',
    '  │       │  ',
    '   ╲     ╱   ',
    '    ╲___╱    ',
  ]),
  Object.freeze([
    '      ●      ',
    '      │      ',
    '    ╱   ╲    ',
    '   ╱     ╲   ',
    '  │       │  ',
    '  │       │  ',
    '   ╲     ╱   ',
    '    ╲___╱    ',
  ]),
  Object.freeze([
    '      ●      ',
    '      │      ',
    '    ╱   ╲    ',
    '   ╱  ●  ╲   ',
    '  │       │  ',
    '  │       │  ',
    '   ╲     ╱   ',
    '    ╲___╱    ',
  ]),
  Object.freeze([
    '      ●      ',
    '      │      ',
    '    ╱   ╲    ',
    '   ╱  ●  ╲   ',
    '  │  ╱│╲  │  ',
    '  │   │   │  ',
    '   ╲     ╱   ',
    '    ╲___╱    ',
  ]),
  Object.freeze([
    '      ●      ',
    '      │      ',
    '    ╱   ╲    ',
    '   ╱  ●  ╲   ',
    '  │  ╱│╲  │  ',
    '  │ ● │ ● │  ',
    '   ╲  ●  ╱   ',
    '    ╲___╱    ',
  ]),
]);

export function asciiLogoFrame(index:number):readonly string[]{
  const frame=TALOS_ASCII_FRAMES[Math.max(0,Math.min(TALOS_ASCII_FRAMES.length-1,Math.trunc(index)))]!;
  return frame.map(line=>line.replaceAll('●','o').replaceAll('│','|').replaceAll('╱','/').replaceAll('╲','\\'));
}
