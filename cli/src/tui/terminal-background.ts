/*
 * 0.6.11 (owner 17/10/2026, «Sì, nella prossima versione»): the theme's background fills the WHOLE window.
 * The frame paints every cell it draws, but the terminal keeps its own default background around the grid: Windows Terminal's
 * padding, the scrollbar gutter, the part of a cell that does not fit, and on Windows the last row (the frame is `rows − 1` high,
 * terminal-shell.ts WIN32_FRAME_HEIGHT). With a black profile that showed as a black border (owner's photo, stress test 0.6.9).
 * The cure sets the terminal's DEFAULT background to the theme's (OSC 11) while the screen is up, and gives it back on the way out
 * (OSC 111, «reset to the profile's default»), the way Helix does (commit «Restore original terminal background color», 26/03/2026)
 * and opencode does for its embedded terminal (packages/tui/src/component/terminal-pane.tsx:363). Pi and Codex only READ it
 * (pi-mono packages/tui/src/tui.ts:168, codex-rs/tui/src/terminal_probe.rs).
 * - Not inside tmux or GNU screen: Helix stopped emitting OSC 11/111 there (flicker, stray SGR).
 * - A theme without a background (mono) changes nothing.
 * - A terminal that does not know the sequence ignores it (xterm ctlseqs: an unknown OSC is dropped).
 * - The colour is not read back first: OSC 111 restores the profile's own default, which is what the person had unless another
 *   program changed it before TALOS. Reading it would need an answer on stdin before Ink owns it.
 * TALOS_TUI_TERMINAL_BACKGROUND=0 turns it off.
 * - On Windows only inside Windows Terminal (`WT_SESSION`), unless TALOS_TUI_TERMINAL_BACKGROUND=1. The bugfixer's review of 0.6.11
 *   (F1) measured the system ConPTY (Windows 11 26200, node-pty): OSC 11 reaches the terminal, OSC 111 is absorbed, so a host on the
 *   system ConPTY (VS Code's terminal by default, node-pty hosts) kept the theme's colour after TALOS left, for every later program
 *   of the tab. Windows Terminal runs its own OpenConsole, which forwards these sequences (wtmux 4.1.0 notes: «the bundled OpenConsole
 *   forwards OSC 10/11 … the inbox conhost swallows them»). Owner 21/10/2026: «Solo in Windows Terminal». The same rule holds inside
 *   WSL, and a TERM_PROGRAM (VS Code and other terminals started from a Windows Terminal tab) means it is not Windows Terminal.
 */
const ST='\u001b\\';
export const RESET_TERMINAL_BACKGROUND=`\u001b]111${ST}`;

/** `#rrggbb` → the OSC 11 that sets it, or null for anything else. */
export function terminalBackgroundSequence(color:string|null|undefined):string|null{
  const match=typeof color==='string'?/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(color.trim()):null;
  if(!match)return null;
  return `\u001b]11;rgb:${match[1]!.toLowerCase()}/${match[2]!.toLowerCase()}/${match[3]!.toLowerCase()}${ST}`;
}

export function terminalBackgroundWanted({env,paintBackground,alternateScreen,interactive,platform=process.platform}:{env:Readonly<Record<string,string|undefined>>;paintBackground:boolean;alternateScreen:boolean;interactive:boolean;platform?:NodeJS.Platform}):boolean{
  if(!paintBackground||!alternateScreen||!interactive)return false;
  if(env.TALOS_TUI_TERMINAL_BACKGROUND==='0')return false;
  if(env.TMUX||env.STY)return false;
  if(/^(screen|tmux)/u.test(env.TERM??''))return false;
  if(windowsConsole(env,platform)&&!(env.WT_SESSION&&!env.TERM_PROGRAM)&&env.TALOS_TUI_TERMINAL_BACKGROUND!=='1')return false;
  return true;
}

/* Review 2 of 0.6.11 (S3-2), measured with node-pty: inside WSL the output crosses the host's ConPTY as well (OSC 111 absorbed), and
   `WT_SESSION` is inherited by everything started from a Windows Terminal tab — VS Code opened with `code .` from it too
   (jdhitsolutions.com/blog/?p=7112). Windows Terminal itself sets no TERM_PROGRAM (it exposes WT_SESSION and WT_PROFILE_ID), while
   VS Code sets `vscode` and most other terminals their own name (detect-terminal checks VS Code before WT_SESSION for this reason). */
function windowsConsole(env:Readonly<Record<string,string|undefined>>,platform:NodeJS.Platform):boolean{
  return platform==='win32'||Boolean(env.WSL_DISTRO_NAME||env.WSL_INTEROP);
}

export type TerminalBackground={apply(color:string|null|undefined):void;restore():void};

/** Writes only on a change; `restore` is safe to call any number of times and only resets what TALOS set. */
export function createTerminalBackground(write:(text:string)=>void):TerminalBackground{
  let current:string|null=null;
  return{
    apply(color){
      const sequence=terminalBackgroundSequence(color);
      if(!sequence){if(current!==null){current=null;write(RESET_TERMINAL_BACKGROUND);}return;}
      if(sequence===current)return;
      current=sequence;write(sequence);
    },
    restore(){if(current===null)return;current=null;write(RESET_TERMINAL_BACKGROUND);},
  };
}
