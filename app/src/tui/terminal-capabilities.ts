export type TerminalCapabilities={interactive:boolean;color:boolean;motion:boolean;unicode:boolean};

export function detectTerminalCapabilities({stdinIsTTY,stdoutIsTTY,color,env}:{stdinIsTTY:boolean;stdoutIsTTY:boolean;color:boolean;env:Record<string,string|undefined>}):TerminalCapabilities{
  const interactive=stdinIsTTY&&stdoutIsTTY;
  const dumb=env.TERM==='dumb';
  const noColor=typeof env.NO_COLOR==='string'&&env.NO_COLOR.length>0;
  const reduced=env.TALOS_REDUCED_MOTION==='1'||env.TALOS_REDUCED_MOTION==='true';
  const unicode=interactive&&!dumb;
  const effectiveColor=interactive&&!dumb&&color&&!noColor;
  return{interactive,color:effectiveColor,motion:effectiveColor&&!reduced,unicode};
}
