/*
 * A device chooses its own name, and the kernel keeps it as given (trimmed, 64 characters: accoppiamento.mjs, dispositivi.mjs). Before
 * it reaches the terminal it goes through ONE filter (block 10 E-R2: there were two, and they let different characters through):
 * every control and format character (\p{Cc}: line breaks, tabs, the ESC that starts an OSC 52 clipboard write; \p{Cf}: the bidi
 * overrides U+202A-202E and U+2066-2069, the invisibles U+200B, U+2060, U+00AD, the tags U+E0001…) and the line and paragraph separators
 * U+2028/2029 become a space; runs of space become one; the cut counts code points, so a pair is never split in half. The kernel cleans
 * the stored name with the same filter (Desktop, block 11), so the two stay identical.
 */
const UNSAFE=/[\p{Cc}\p{Cf}\u2028\u2029]/gu;
export const DEVICE_NAME_MAX=64;

/** The device's name as it may be shown, or '' when nothing printable is left. */
export function deviceNameText(name:unknown):string{
  return Array.from(String(name??'').replace(UNSAFE,' ').replace(/\s+/gu,' ').trim()).slice(0,DEVICE_NAME_MAX).join('');
}
/** The same, with a word when nothing is left. */
export function cleanDeviceName(name:unknown,fallback='device'):string{return deviceNameText(name)||fallback;}
