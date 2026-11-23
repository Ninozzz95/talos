/*
 * ASYNC phase, step 7 (owner 01/10). The person's `agents.*` configuration as the kernel's optional parameters
 * (session-registry.mjs `limitiDelega`, `figlioDefault`; subagent-orchestrator.mjs `limiti`). Only what is set is passed:
 * with nothing set the kernel gets no parameter at all and keeps its own limits (10 agents, depth 2) and the mother's
 * model and effort — the desktop's condition for the kernel change.
 */
import type {AgentsConfig} from '../config/types.ts';

export type KernelDelegationOptions={
  limitiDelega?:{figliConcorrenti?:number;profondita?:number};
  figlioDefault?:{modello?:string;reasoning?:{effort:string}};
};

export function kernelDelegationOptions(agents:AgentsConfig|undefined):KernelDelegationOptions{
  const out:KernelDelegationOptions={};
  if(!agents)return out;
  const limits={...(agents.maxConcurrent!==undefined?{figliConcorrenti:agents.maxConcurrent}:{}),...(agents.maxDepth!==undefined?{profondita:agents.maxDepth}:{})};
  if(Object.keys(limits).length)out.limitiDelega=limits;
  const child={...(agents.model?{modello:agents.model}:{}),...(agents.reasoningEffort?{reasoning:{effort:agents.reasoningEffort}}:{})};
  if(Object.keys(child).length)out.figlioDefault=child;
  return out;
}
