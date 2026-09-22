import type {
  CliSessionApprovalWait,
  CliSessionCollision,
  CliSessionDelegationEvidence,
  CliSessionDelegationOutcome,
  CliSessionOutcome,
  CliSessionSummary,
  CliSessionUsage,
} from './types.ts';

export type SessionSummaryEvidence={
  child?:any;
  approval?:{requestId?:unknown;waitingMs?:unknown}|null;
};

function textOrNull(...values:unknown[]):string|null{
  for(const value of values)if(typeof value==='string'&&value.trim()!=='')return value.trim();
  return null;
}
function finiteOrNull(value:unknown):number|null{return Number.isFinite(value)?Number(value):null;}
function depthOf(value:unknown):number{return Number.isSafeInteger(value)&&Number(value)>=0?Number(value):0;}

function lifecycle(row:any):CliSessionOutcome{
  if(row?.interrotta===true||row?.interrupted===true)return'interrupted';
  const concluded=row?.conclusa===true||row?.completed===true;
  const explicitlyOpen=row?.conclusa===false||row?.completed===false;
  const last=textOrNull(row?.ultimoEsito,row?.lastOutcome);
  const closure=textOrNull(row?.motivoChiusura,row?.closureReason);

  if(explicitlyOpen&&(last!==null||closure!==null))return'unknown';
  if(!concluded&&!explicitlyOpen&&(last!==null||closure!==null))return'unknown';
  if(!concluded)return'running';
  if(closure==='fermata'||closure==='stopped'||closure==='cancelled')return'stopped';
  if(closure==='fine-lavoro'||closure==='completed'||last==='successo'||last==='success')return'completed';
  if(closure==='giri-finiti'||closure==='errore'||closure==='failed'||last==='errore'||last==='error')return'failed';
  return'unknown';
}

function usageOf(raw:unknown):CliSessionUsage|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const row=raw as any;
  const usage:CliSessionUsage={
    promptTokens:finiteOrNull(row.prompt_tokens??row.promptTokens),
    completionTokens:finiteOrNull(row.completion_tokens??row.completionTokens),
    cachedTokens:finiteOrNull(row.cached_tokens??row.cachedTokens),
    turns:finiteOrNull(row.giri??row.turns),
    executions:finiteOrNull(row.esecuzioni??row.executions),
  };
  return Object.values(usage).some(value=>value!==null)?usage:null;
}

function collisionOf(raw:any):CliSessionCollision|null{
  const path=textOrNull(raw?.percorso,raw?.path);if(!path)return null;
  return{path,beforeSessionId:textOrNull(raw?.primaDi,raw?.beforeSessionId),afterSessionId:textOrNull(raw?.dopoDi,raw?.afterSessionId)};
}

function delegationOutcomeOf(value:unknown):CliSessionDelegationOutcome|null{
  const normalized=textOrNull(value)?.toLowerCase()??null;
  if(normalized===null)return null;
  if(normalized==='concluso'||normalized==='completed'||normalized==='successo')return'completed';
  if(normalized==='fallito'||normalized==='failed'||normalized==='errore')return'failed';
  if(normalized==='rifiutato'||normalized==='refused')return'refused';
  return'unknown';
}

function delegationEvidenceOf(raw:any):CliSessionDelegationEvidence|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const out:CliSessionDelegationEvidence={
    writes:finiteOrNull(raw.scritture??raw.writes),
    artifacts:finiteOrNull(raw.artefatti??raw.artifacts),
    toolCalls:finiteOrNull(raw.toolCalls),
    toolCallsOk:finiteOrNull(raw.toolCallsOk),
    toolCallsFailed:finiteOrNull(raw.toolCallsFalliti??raw.toolCallsFailed),
    verifiable:typeof raw.verificabile==='boolean'?raw.verificabile:typeof raw.verifiable==='boolean'?raw.verifiable:null,
  };
  return Object.values(out).some(value=>value!==null)?out:null;
}

function approvalOf(row:any,evidence:SessionSummaryEvidence):CliSessionApprovalWait|null{
  if(row?.inAttesaApprovazione!==true&&row?.approvalWaiting!==true)return null;
  return{
    pending:true,
    requestId:textOrNull(evidence.approval?.requestId),
    waitingMs:finiteOrNull(evidence.approval?.waitingMs),
  };
}

export function normalizeSessionSummary(row:any,evidence:SessionSummaryEvidence={}):CliSessionSummary{
  const id=textOrNull(row?.sessionId,row?.id)??'';
  const child=evidence.child??null;
  const collisions=(Array.isArray(child?.collisioni)?child.collisioni:Array.isArray(row?.collisions)?row.collisions:[])
    .map(collisionOf).filter((value):value is CliSessionCollision=>value!==null);
  const startedAt=textOrNull(row?.avviataAlle,row?.startedAt);
  const updatedAt=textOrNull(row?.ultimaRispostaAlle,row?.aggiornataAlle,row?.updatedAt)??startedAt;
  return{
    id,sessionId:id,
    name:textOrNull(row?.nome,row?.name,row?.titolo,row?.title),
    project:textOrNull(row?.progetto,row?.project),
    path:textOrNull(row?.percorso,row?.path),
    model:textOrNull(row?.modello,row?.model,row?.modelId),
    parentId:textOrNull(row?.padreId,row?.parentId),
    depth:depthOf(row?.profonditaDelega??row?.depth),
    delegatedTask:textOrNull(row?.taskDelega,row?.delegatedTask,child?.taskCorto),
    forkedFrom:textOrNull(row?.forkDa,row?.forkedFrom),
    startedAt,
    updatedAt,
    endedAt:textOrNull(row?.conclusaAlle,row?.endedAt,row?.fineAlle),
    outcome:lifecycle(row),
    interrupted:row?.interrotta===true||row?.interrupted===true,
    usage:usageOf(row?.usageSessione??row?.sessionUsage),
    approvalWait:approvalOf(row,evidence),
    collisions,
    delegationOutcome:delegationOutcomeOf(child?.esitoDelega??row?.delegationOutcome),
    delegationEvidence:delegationEvidenceOf(child?.evidenzaDelega??row?.delegationEvidence),
  };
}

export function normalizeSessionSummaries(rows:readonly any[],evidenceById:ReadonlyMap<string,SessionSummaryEvidence>=new Map()):CliSessionSummary[]{
  return rows.map(row=>{
    const id=textOrNull(row?.sessionId,row?.id)??'';
    return normalizeSessionSummary(row,evidenceById.get(id)??{});
  }).filter(row=>row.id).sort((a,b)=>{
    if(a.startedAt===b.startedAt)return 0;
    if(a.startedAt===null)return-1;
    if(b.startedAt===null)return 1;
    return a.startedAt.localeCompare(b.startedAt);
  });
}
