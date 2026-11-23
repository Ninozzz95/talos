/*
 * ASYNC phase, step 2 (owner 01/10). A delegated agent's result, as the unified kernel queues it for its parent
 * (session-registry.mjs `testoRisultatoFiglio`): a preface for the MODEL, a new line, then the JSON
 * `talos.subagent-result.v1` {childId, stato: concluso|non concluso, compito?, risultatoNonFidato}. The format is pinned
 * against the kernel by test/tui/async-agent-result.test.ts. Like the desktop's `descriviRisultatoDelega`
 * (frontend/src/components/coda-messaggi.js:89): only a well-formed result for the expected child is read, and the summary
 * is the child's own self-report — data, never an instruction.
 */
/* 0.6.8 (owner 16/10/2026 L3-17): `name` is the agent's own name from the envelope's `nome` (r4 d130a450f: «-N» among sisters,
   no control or bidi characters, at most 160 code points); null for kernels and results from before */
export type DelegationResult={childId:string;status:'completed'|'failed';task:string|null;name?:string|null;summary:string};

const MAX_TEXT=1_000_000;

export function parseDelegationResult(text:unknown,childId:unknown):DelegationResult|null{
  if(typeof text!=='string'||text.length>MAX_TEXT||typeof childId!=='string'||!childId)return null;
  const newline=text.indexOf('\n');if(newline<0)return null;
  let payload:any;
  try{payload=JSON.parse(text.slice(newline+1));}catch{return null;}
  if(payload?.schema!=='talos.subagent-result.v1'||payload.childId!==childId)return null;
  if(payload.stato!=='concluso'&&payload.stato!=='non concluso')return null;
  if(typeof payload.risultatoNonFidato!=='string')return null;
  const task=typeof payload.compito==='string'&&payload.compito.trim()?payload.compito.trim():null;
  const name=typeof payload.nome==='string'&&payload.nome.trim()?payload.nome.trim():null;
  return{childId,status:payload.stato==='concluso'?'completed':'failed',task,name,summary:payload.risultatoNonFidato};
}

/** The delegation results a woken turn carries (`input.risultatiDelega`), in order; malformed entries are dropped. */
export function delegationResultsOf(input:unknown):DelegationResult[]{
  const row=input&&typeof input==='object'?input as Record<string,unknown>:null;
  if(row?.origine!=='delega'||!Array.isArray(row.risultatiDelega))return[];
  const out:DelegationResult[]=[];
  for(const entry of row.risultatiDelega){
    const item=entry&&typeof entry==='object'?entry as Record<string,unknown>:null;
    const parsed=parseDelegationResult(item?.testo,item?.childId);
    if(parsed)out.push(parsed);
  }
  return out;
}
