import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

/**
 * A fake TTY that records every byte written to it, so a test can read the frame a terminal would show.
 * It models the parts of `NodeJS.WriteStream` the renderer reads: `columns`, `rows`, `isTTY`, `write(chunk, cb)` and
 * the `resize` event.
 */
export class FakeTty extends EventEmitter {
  readonly chunks: string[] = [];
  readonly isTTY = true;
  columns: number;
  rows: number;
  constructor(columns: number, rows: number) {
    super();
    this.columns = columns;
    this.rows = rows;
  }
  write(chunk: string | Uint8Array, encodingOrCb?: unknown, cb?: unknown): boolean {
    this.chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    const done = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    if (typeof done === 'function') done();
    return true;
  }
  output(): string {
    return this.chunks.join('');
  }
}

/**
 * Makes `tty` the process's terminal until the returned function is called: `process.stdout` AND file descriptor 1.
 *
 * The fork is written for a terminal that is `process.stdout`, and relies on it twice: `<AlternateScreen>` finds its
 * Ink instance with `instances.get(process.stdout)` to switch the renderer to alt-screen mode, and `unmount()` writes
 * the terminal-restore sequences with `writeSync(1, …)` so they land before a `process.exit()`. With a fake stdout
 * that is neither, the test measures a different program (measured: the alternate frame ends with one `\r\n` per row
 * and scrolls its first row off a 6-row screen) and the restore sequences leak into the test runner's real terminal.
 * In production both are the terminal, so both are the fake here.
 */
export function becomeProcessTerminal(tty: FakeTty): () => void {
  const stdoutDescriptor = Object.getOwnPropertyDescriptor(process, 'stdout');
  if (!stdoutDescriptor?.configurable) throw new Error('process.stdout cannot be redefined');
  const writeSync = fs.writeSync;
  Object.defineProperty(process, 'stdout', { configurable: true, enumerable: stdoutDescriptor.enumerable ?? true, get: () => tty });
  fs.writeSync = function interceptFd1(fd: number, data: unknown, ...rest: unknown[]): number {
    if (fd !== 1) return (writeSync as (...args: unknown[]) => number).call(fs, fd, data, ...rest);
    if (typeof data !== 'string' || rest.length > 0) throw new Error('becomeProcessTerminal: only writeSync(1, string) is modelled');
    tty.write(data);
    return Buffer.byteLength(data);
  } as typeof fs.writeSync;
  syncBuiltinESMExports();
  return () => {
    fs.writeSync = writeSync;
    syncBuiltinESMExports();
    Object.defineProperty(process, 'stdout', stdoutDescriptor);
  };
}

/** A non-interactive stdin: the renderer never enters raw mode on it. */
export class FakeStdin extends EventEmitter {
  readonly isTTY = false;
  readonly readableLength = 0;
  setEncoding(): this { return this; }
  setRawMode(): this { return this; }
  read(): null { return null; }
  ref(): this { return this; }
  unref(): this { return this; }
  resume(): this { return this; }
  pause(): this { return this; }
}

type Buffer2D = string[][];

function blank(columns: number, rows: number): Buffer2D {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => ' '));
}

/**
 * Replays a byte stream on a `columns` x `rows` screen and returns the visible rows with trailing spaces removed.
 * It understands what a VT100-class terminal does with the sequences a renderer emits: printable characters with
 * autowrap, CR, LF (with the ONLCR translation a Node TTY keeps in raw mode), BS, cursor movement and positioning,
 * erase in line and display, scrolling, DECSC/DECRC, the alternate screen (DEC 1049), and it ignores SGR, other DEC
 * private modes and OSC strings, which change attributes but not characters.
 * ⛔ An unknown sequence throws instead of being skipped: a frame read past a sequence the helper does not model
 * would be a guess.
 */
export function readScreen(stream: string, columns: number, rows: number): { rows: string[]; altScreen: boolean } {
  let main = blank(columns, rows);
  let alt = blank(columns, rows);
  let altScreen = false;
  let screen = main;
  let x = 0;
  let y = 0;
  let saved = { x: 0, y: 0 };
  let pendingWrap = false;
  const clampX = (v: number) => Math.max(0, Math.min(columns - 1, v));
  const clampY = (v: number) => Math.max(0, Math.min(rows - 1, v));
  const scrollUp = (n: number) => {
    for (let i = 0; i < n; i++) {
      screen.shift();
      screen.push(Array.from({ length: columns }, () => ' '));
    }
  };
  const scrollDown = (n: number) => {
    for (let i = 0; i < n; i++) {
      screen.pop();
      screen.unshift(Array.from({ length: columns }, () => ' '));
    }
  };
  const lineFeed = () => {
    if (y === rows - 1) scrollUp(1);
    else y++;
  };
  const eraseRow = (row: number, from: number, to: number) => {
    const line = screen[row];
    if (!line) return;
    for (let c = from; c < to; c++) line[c] = ' ';
  };

  let i = 0;
  const chars = Array.from(stream);
  while (i < chars.length) {
    const ch = chars[i]!;
    if (ch === '') {
      const next = chars[i + 1];
      if (next === '[') {
        let j = i + 2;
        let params = '';
        while (j < chars.length && /[0-9;:?<=>]/u.test(chars[j]!)) params += chars[j++];
        let intermediates = '';
        while (j < chars.length && /[ -/]/u.test(chars[j]!)) intermediates += chars[j++];
        const final = chars[j];
        if (final === undefined) throw new Error(`readScreen: truncated CSI at ${i}`);
        i = j + 1;
        const privateMode = params.startsWith('?');
        const nums = (privateMode ? params.slice(1) : params).split(';').map(p => (p === '' ? NaN : Number(p.split(':')[0])));
        const n = (k: number, fallback: number) => (Number.isNaN(nums[k] ?? NaN) ? fallback : nums[k]!);
        if (intermediates !== '') {
          // e.g. DECSCUSR `CSI Ps SP q` (cursor shape): no effect on characters.
          if (intermediates === ' ' && final === 'q') continue;
          throw new Error(`readScreen: unsupported CSI ${JSON.stringify(params + intermediates + final)}`);
        }
        if (privateMode) {
          if (final === 'h' || final === 'l') {
            if (nums.includes(1049)) {
              if (final === 'h' && !altScreen) {
                saved = { x, y };
                alt = blank(columns, rows);
                screen = alt;
                altScreen = true;
              } else if (final === 'l' && altScreen) {
                screen = main;
                altScreen = false;
                ({ x, y } = saved);
              }
            }
            continue;
          }
          throw new Error(`readScreen: unsupported private CSI ${JSON.stringify(params + final)}`);
        }
        pendingWrap = false;
        switch (final) {
          case 'm': break;
          case 'A': y = clampY(y - n(0, 1)); break;
          case 'B': y = clampY(y + n(0, 1)); break;
          case 'C': x = clampX(x + n(0, 1)); break;
          case 'D': x = clampX(x - n(0, 1)); break;
          case 'E': y = clampY(y + n(0, 1)); x = 0; break;
          case 'F': y = clampY(y - n(0, 1)); x = 0; break;
          case 'G': x = clampX(n(0, 1) - 1); break;
          case 'd': y = clampY(n(0, 1) - 1); break;
          case 'H': case 'f': y = clampY(n(0, 1) - 1); x = clampX(n(1, 1) - 1); break;
          case 'K': {
            const mode = n(0, 0);
            if (mode === 0) eraseRow(y, x, columns);
            else if (mode === 1) eraseRow(y, 0, x + 1);
            else eraseRow(y, 0, columns);
            break;
          }
          case 'J': {
            const mode = n(0, 0);
            if (mode === 0) { eraseRow(y, x, columns); for (let r = y + 1; r < rows; r++) eraseRow(r, 0, columns); }
            else if (mode === 1) { for (let r = 0; r < y; r++) eraseRow(r, 0, columns); eraseRow(y, 0, x + 1); }
            else if (mode === 2) { for (let r = 0; r < rows; r++) eraseRow(r, 0, columns); }
            // mode 3 erases scrollback only, which this screen does not keep.
            break;
          }
          case 'S': scrollUp(n(0, 1)); break;
          case 'T': scrollDown(n(0, 1)); break;
          case 'r': x = 0; y = 0; break; // DECSTBM homes the cursor; margins are not modelled.
          case 's': saved = { x, y }; break;
          case 'u': ({ x, y } = saved); break;
          case 'X': eraseRow(y, x, Math.min(columns, x + n(0, 1))); break;
          default: throw new Error(`readScreen: unsupported CSI ${JSON.stringify(params + final)}`);
        }
        continue;
      }
      if (next === ']') {
        // OSC: terminated by BEL or ST (ESC \).
        let j = i + 2;
        while (j < chars.length && chars[j] !== '' && !(chars[j] === '' && chars[j + 1] === '\\')) j++;
        if (j >= chars.length) throw new Error(`readScreen: unterminated OSC at ${i}`);
        i = chars[j] === '' ? j + 1 : j + 2;
        continue;
      }
      if (next === '7') { saved = { x, y }; i += 2; continue; }
      if (next === '8') { ({ x, y } = saved); i += 2; continue; }
      if (next === '=' || next === '>') { i += 2; continue; }
      throw new Error(`readScreen: unsupported escape ${JSON.stringify(ch + (next ?? ''))}`);
    }
    if (ch === '\r') { x = 0; pendingWrap = false; i++; continue; }
    if (ch === '\n') { lineFeed(); x = 0; pendingWrap = false; i++; continue; }
    if (ch === '\b') { x = clampX(x - 1); pendingWrap = false; i++; continue; }
    if (ch === '') { i++; continue; }
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) throw new Error(`readScreen: unsupported control 0x${code.toString(16)}`);
    if (pendingWrap) { lineFeed(); x = 0; pendingWrap = false; }
    screen[y]![x] = ch;
    if (x === columns - 1) pendingWrap = true;
    else x++;
    i++;
  }
  return { rows: screen.map(line => line.join('').replace(/ +$/u, '')), altScreen };
}

/** Waits until `predicate` holds or `timeoutMs` passes; the caller asserts afterwards, so a timeout reads as a diff. */
export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
}
