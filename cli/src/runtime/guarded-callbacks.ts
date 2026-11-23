/*
 * The kernel callbacks that change something outside the conversation (a delegation, an artifact, an MCP/plugin/Forge tool):
 * the CLI takes its checkpoint before each (talos-composition.ts `beforeMutation`). The wrapper hands every argument on
 * unchanged — F-015: `onArtefatto(titolo, html, { copiaInLibreria })` carries the kernel's choice not to copy a read-only
 * session's artifact into the Library, and losing the third argument would bring the copy back.
 */
export const GUARDED_KERNEL_CALLBACKS=Object.freeze(['onDelega','onArtefatto','onAggiornaArtefatto','chiamaToolMcpFn','eseguiToolPluginFn','eseguiToolForgeFn'] as const);

export function guardKernelCallbacks(kernelInput:Record<string,unknown>,beforeMutation:(info:{tipo:string})=>unknown):Record<string,unknown>{
  const guarded:Record<string,unknown>={};
  for(const name of GUARDED_KERNEL_CALLBACKS){
    const dispatch=kernelInput[name];
    if(typeof dispatch==='function')guarded[name]=async(...args:unknown[])=>{await beforeMutation({tipo:name});return (dispatch as (...a:unknown[])=>unknown)(...args);};
  }
  return guarded;
}
