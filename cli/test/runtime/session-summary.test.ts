import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {
  normalizeSessionSummary,
  normalizeSessionSummaries,
  type SessionSummaryEvidence,
} from '../../src/runtime/session-summary.ts';

const START='2026-09-20T10:00:00.000Z';
const UPDATE='2026-09-20T10:05:00.000Z';

test('typed session summary retains native lineage, measured session usage and honest unknown fields',()=>{
  const evidence:SessionSummaryEvidence={
    child:{
      sessionId:'child-1',
      taskCorto:'Inspect auth boundary',
      collisioni:[{percorso:'src/auth.ts',primaDi:null,dopoDi:'child-2'}],
      esitoDelega:'concluso',
      evidenzaDelega:{scritture:1,artefatti:0,toolCalls:2,toolCallsOk:2,toolCallsFalliti:0,verificabile:true},
    },
  };
  const row=normalizeSessionSummary({
    sessionId:'child-1',
    nome:'Auth review',
    avviataAlle:START,
    ultimaRispostaAlle:UPDATE,
    conclusa:true,
    forkDa:null,
    modello:'openai:gpt-5',
    padreId:'parent-1',
    profonditaDelega:2,
    taskDelega:'Inspect auth boundary',
    interrotta:false,
    inAttesaApprovazione:false,
    ultimoEsito:'successo',
    motivoChiusura:'fine-lavoro',
    usage:{prompt_tokens:999},
    usageSessione:{
      prompt_tokens:1200,
      completion_tokens:240,
      cached_tokens:null,
      giri:3,
      esecuzioni:2,
    },
  },evidence);

  assert.equal(row.id,'child-1');
  assert.equal(row.sessionId,'child-1','compatibility alias remains available to existing runtime callers');
  assert.equal(row.name,'Auth review');
  assert.equal(row.project,null,'current project/cwd is never invented for a historical global session');
  assert.equal(row.path,null);
  assert.equal(row.model,'openai:gpt-5');
  assert.equal(row.parentId,'parent-1');
  assert.equal(row.depth,2);
  assert.equal(row.delegatedTask,'Inspect auth boundary');
  assert.equal(row.forkedFrom,null);
  assert.equal(row.startedAt,START);
  assert.equal(row.updatedAt,UPDATE);
  assert.equal(row.endedAt,null,'last response time is not relabeled as an exact end time');
  assert.equal(row.outcome,'completed');
  assert.equal(row.interrupted,false);
  assert.deepEqual(row.usage,{
    promptTokens:1200,
    completionTokens:240,
    cachedTokens:null,
    turns:3,
    executions:2,
  },'whole-session usage wins over last-turn usage and preserves unmeasured cache as null');
  assert.equal(row.approvalWait,null);
  assert.deepEqual(row.collisions,[{path:'src/auth.ts',beforeSessionId:null,afterSessionId:'child-2'}]);
  assert.equal(row.delegationOutcome,'completed');
  assert.deepEqual(row.delegationEvidence,{
    writes:1,artifacts:0,toolCalls:2,toolCallsOk:2,toolCallsFailed:0,verifiable:true,
  });
});

test('lifecycle outcomes distinguish stop, failure, interruption, running and contradictory unknown',()=>{
  const base={sessionId:'s',avviataAlle:START,modello:'openai:gpt-5'};
  const cases:Array<[any,string]>=[
    [{...base,conclusa:true,interrotta:false,ultimoEsito:'errore',motivoChiusura:'fermata'},'stopped'],
    [{...base,conclusa:true,interrotta:false,ultimoEsito:'errore',motivoChiusura:'giri-finiti'},'failed'],
    [{...base,conclusa:true,interrotta:false,ultimoEsito:'errore',motivoChiusura:'errore'},'failed'],
    [{...base,conclusa:false,interrotta:true,ultimoEsito:null,motivoChiusura:null},'interrupted'],
    [{...base,conclusa:false,interrotta:false,ultimoEsito:null,motivoChiusura:null},'running'],
    [{...base,conclusa:false,interrotta:false,ultimoEsito:'successo',motivoChiusura:'fine-lavoro'},'unknown'],
    [{...base,conclusa:true,interrotta:false,ultimoEsito:null,motivoChiusura:null},'unknown'],
  ];
  for(const [raw,outcome] of cases)assert.equal(normalizeSessionSummary(raw).outcome,outcome,JSON.stringify(raw));
});

test('approval wait is structural and never invents request id or duration',()=>{
  const pending=normalizeSessionSummary({
    sessionId:'s1',avviataAlle:START,conclusa:false,interrotta:false,inAttesaApprovazione:true,
  });
  assert.deepEqual(pending.approvalWait,{pending:true,requestId:null,waitingMs:null});

  const observed=normalizeSessionSummary({
    sessionId:'s2',avviataAlle:START,conclusa:false,interrotta:false,inAttesaApprovazione:true,
  },{
    approval:{requestId:'approval-7',waitingMs:4321},
  });
  assert.deepEqual(observed.approvalWait,{pending:true,requestId:'approval-7',waitingMs:4321});

  const notPending=normalizeSessionSummary({
    sessionId:'s3',avviataAlle:START,conclusa:false,interrotta:false,inAttesaApprovazione:false,
  },{approval:{requestId:'stale',waitingMs:999}});
  assert.equal(notPending.approvalWait,null,'observational details cannot create a pending approval when the registry says none is pending');
});

test('session summary fields accept explicit future project/path/end evidence but do not derive them',()=>{
  const row=normalizeSessionSummary({
    sessionId:'s1',
    nome:'Known workspace',
    progetto:'talos',
    percorso:'/work/talos',
    avviataAlle:START,
    ultimaRispostaAlle:UPDATE,
    conclusa:true,
    conclusaAlle:'2026-09-20T10:06:00.000Z',
    ultimoEsito:'successo',
    motivoChiusura:'fine-lavoro',
  });
  assert.equal(row.project,'talos');
  assert.equal(row.path,'/work/talos');
  assert.equal(row.endedAt,'2026-09-20T10:06:00.000Z');
});

test('canonical runtime session order is oldest to newest so existing "last" resolution selects the newest',()=>{
  const rows=normalizeSessionSummaries([
    {sessionId:'new',avviataAlle:'2026-09-20T12:00:00.000Z',conclusa:true,ultimoEsito:'successo',motivoChiusura:'fine-lavoro'},
    {sessionId:'old',avviataAlle:'2026-09-20T09:00:00.000Z',conclusa:true,ultimoEsito:'successo',motivoChiusura:'fine-lavoro'},
    {sessionId:'middle',avviataAlle:'2026-09-20T10:00:00.000Z',conclusa:true,ultimoEsito:'successo',motivoChiusura:'fine-lavoro'},
  ]);
  assert.deepEqual(rows.map(row=>row.id),['old','middle','new']);
  assert.equal(rows.at(-1)?.sessionId,'new');
});

test('session facade enriches child collisions and observed approval wait from native read-only registry methods',async()=>{
  const calls:{children:string[];processes:string[]}={children:[],processes:[]};
  const registry:any={
    elenca:()=>[
      {
        sessionId:'new',nome:'New',avviataAlle:'2026-09-20T12:00:00.000Z',conclusa:false,interrotta:false,
        padreId:'parent',profonditaDelega:1,taskDelega:'Patch auth',inAttesaApprovazione:true,ultimoEsito:null,motivoChiusura:null,
        usageSessione:null,modello:'openai:gpt-5',
      },
      {
        sessionId:'parent',nome:'Parent',avviataAlle:'2026-09-20T09:00:00.000Z',conclusa:true,interrotta:false,
        padreId:null,profonditaDelega:0,inAttesaApprovazione:false,ultimoEsito:'successo',motivoChiusura:'fine-lavoro',
        usageSessione:{prompt_tokens:10,completion_tokens:5,cached_tokens:0,giri:1,esecuzioni:1},modello:'openai:gpt-5',
      },
    ],
    elencaFigli:(id:string)=>{calls.children.push(id);return{ok:true,figli:[{
      sessionId:'new',taskCorto:'Patch auth',collisioni:[{percorso:'src/auth.ts',primaDi:'sibling',dopoDi:null}],
      conclusa:false,interrotta:false,esitoDelega:null,evidenzaDelega:null,avviataAlle:'2026-09-20T12:00:00.000Z',
    }]};},
    elencaProcessi:(id:string)=>{calls.processes.push(id);return{ok:true,guardia:{segnalazioni:[{
      soggetto:'approvazione',requestId:'req-1',fermoDaMs:2500,
    }]}};},
    iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({}),
  };
  const runtime=createSessionFacade(registry,{model:'openai:gpt-5'});
  const rows=await runtime.listSessions();

  assert.deepEqual(rows.map(row=>row.id),['parent','new']);
  const child=rows[1]!;
  assert.deepEqual(child.collisions,[{path:'src/auth.ts',beforeSessionId:'sibling',afterSessionId:null}]);
  assert.deepEqual(child.approvalWait,{pending:true,requestId:'req-1',waitingMs:2500});
  assert.deepEqual(calls.children,['parent'],'children are enriched only through their real parent');
  assert.deepEqual(calls.processes,['new'],'process diagnostics are queried only for rows actually waiting on approval');
});

/* F-Q3 (owner 03/10: «anche effort deve essere salvato quando si riprende una sessione, se non lo fa già»): the kernel keeps each
   session's reasoning effort (`impostazioni-sessione`, read back on resume) and lists it (`elenca` → `reasoning`); the summary
   carries it, so the screen can show the effort the session really uses instead of the configured default. */
test('F-Q3: the summary carries the session\'s own reasoning effort, and only a known level',()=>{
  assert.equal(normalizeSessionSummary({sessionId:'s',reasoning:{effort:'high'}}).reasoningEffort,'high');
  assert.equal(normalizeSessionSummary({sessionId:'s',reasoning:{effort:'max'}}).reasoningEffort,'max');
  assert.equal(normalizeSessionSummary({sessionId:'s'}).reasoningEffort,null,'no stored effort: the model default');
  assert.equal(normalizeSessionSummary({sessionId:'s',reasoning:{effort:'ludicrous'}}).reasoningEffort,null,'an unknown level is not shown as one');
  assert.equal(normalizeSessionSummary({sessionId:'s',reasoning:null}).reasoningEffort,null);
});
