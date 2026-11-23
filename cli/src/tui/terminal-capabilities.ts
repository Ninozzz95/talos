export type TerminalCapabilities={interactive:boolean;color:boolean;motion:boolean;unicode:boolean};

/** Full colour, as a terminal announces it. Windows Terminal says so by being there. */
export function terminalTrueColor(env:Record<string,string|undefined>):boolean{
  return /truecolor|24bit/iu.test(env.COLORTERM??'')||Boolean(env.WT_SESSION)||/truecolor|24bit|kitty|ghostty|wezterm/iu.test(env.TERM??'')||/iTerm|WezTerm|vscode|ghostty/iu.test(env.TERM_PROGRAM??'');
}

export function detectTerminalCapabilities({stdinIsTTY,stdoutIsTTY,color,env,reduceMotion=false}:{stdinIsTTY:boolean;stdoutIsTTY:boolean;color:boolean;env:Record<string,string|undefined>;/* stage 7.11: `ui.reduceMotion` */reduceMotion?:boolean}):TerminalCapabilities{
  const interactive=stdinIsTTY&&stdoutIsTTY;
  const dumb=env.TERM==='dumb';
  const noColor=typeof env.NO_COLOR==='string'&&env.NO_COLOR.length>0;
  const reduced=reduceMotion||env.TALOS_REDUCED_MOTION==='1'||env.TALOS_REDUCED_MOTION==='true';
  const unicode=interactive&&!dumb;
  const effectiveColor=interactive&&!dumb&&color&&!noColor;
  return{interactive,color:effectiveColor,motion:effectiveColor&&!reduced,unicode};
}
