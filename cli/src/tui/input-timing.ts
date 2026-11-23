/*
 * How long an INCOMPLETE multi-byte terminal sequence (a mouse report cut after `ESC[<6`, a focus report cut after `ESC[`, a paste marker cut after `ESC[2`) is held
 * before it is given back to the input as text. A lone ESC is NEVER held (REV-ESC-PTY, 07/10: the Esc key must reach Ink at once); this is only for sequences that
 * have already shown they are one (`ESC[…`), which no keypress produces in two pieces.
 *
 * 08/10/2026: 30 ms was too short. The acceptance scenario s34 (a wheel report split after `ESC[`, the rest 5 ms later) failed in 2 of the last 6 full gates, and in 1 of 10
 * runs under CPU saturation (16 busy processes), against 0 of 20 on a quiet machine: when the rest of the report is late by more than the hold, `[<64;20;5M` lands in the
 * composer as text. The same class had been cured once before on the product's side (02/10, a busy event loop), and the hold itself is the remaining gap. A terminal
 * writes a report in one piece; the pieces come apart in the transport (ConPTY, SSH, a multiplexer) and the second one can be late by tens of milliseconds.
 *
 * Research read 08/10/2026 (owner rule: every clone, Hermes always):
 *  · Pi (pi-mono-2026-09-26, packages/tui/src/stdin-buffer.ts:23-24, 262-269, 388): `DEFAULT_SEQUENCE_TIMEOUT_MS = 50` for an incomplete CSI or mouse sequence, `DEFAULT_ESCAPE_TIMEOUT_MS = 10`
 *    for a lone ESC, with the doc comment "Increase for high-latency Alt+key input (SSH)": two different times for two different questions, as here.
 *  · Codex (codex-2026-09-24, tui/src/tui/event_stream.rs): reads through crossterm's event stream and has no timer of its own for a partial sequence; Hermes' input parser is the
 *    fork of Ink that is off limits (hermes-ink, not read); OpenCode, Cline, Goose, Zed and deepseek-harness have no terminal-input timer to compare.
 *  · Node.js readline `escapeCodeTimeout`: 500 ms by default for an ambiguous key sequence (the GNU readline keyseq-timeout); tmux `escape-time`: 10 ms since 3.5 (it was 500) with the
 *    warning that 0 is risky over a wide-area network or when characters of a sequence are delayed; Vim `ttimeoutlen`/`timeoutlen`.
 *  · The class is known in the wild: micro issue 3668 "Bracketed paste issue with split escape sequence", Claude Code issue 78788 "Esc keypresses intermittently dropped under load",
 *    libssh/SSH notes on a sequence cut by packet fragmentation.
 * 100 ms: twice Pi's figure (TALOS also has a second filter behind this one), a fifth of Node's. It costs a keypress that is really `Alt+[` (or a paste marker typed by hand) up to 100 ms
 * of delay; nothing else waits.
 */
export const PARTIAL_SEQUENCE_HOLD_MS=100;
