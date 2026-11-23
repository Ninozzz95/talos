/*
 * A1 rimedio 3 — riduzione delle coppie di eventi di replay (decisione owner 07/10 09:45, rischio compat
 * accettato; dossier RICERCA-5x5x5x5-DEVLOG-A1-2026-10-07). RED contract:
 *   REPLAY   durante il replay sincrono della cronologia (`attach(id,0,true)`) il controller NON logga più
 *            `runtime.raw_event` per ogni evento: li conta e scrive UN SOLO `runtime.replay.summary`
 *            {sessionId, rawEvents} a fine replay. Oggi il resume di una sessione lunga scrive ~9.600 righe
 *            di raw_event (3 syscall ciascuna) — è il cuore dell'A1.
 *   LIVE     il percorso LIVE (non replay) continua a loggare ogni raw_event: nessuna perdita diagnostica
 *            fuori dal replay.
 *   GETTER   il controller espone `replaying()` (additivo) perché app.ts possa sopprimere la seconda metà
 *            della coppia (`ui.runtime_event`) dentro la stessa finestra di replay.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {closeDevelopmentLogging,developmentLogFlush,initializeDevelopmentLogging} from '../../src/diagnostics/development-log.ts';

function runtimeWithReplay(rawEvents:readonly unknown[],sunkReplaying:boolean[]){
  const sinks=new Map<string,(e:any)=>void>();
  const r:any={
    restore:async()=>({restored:0,total:0}),
    listSessions:async()=>[{sessionId:'s-replay',outcome:'completed'},{sessionId:'s-live',outcome:'completed'}],
    start:async()=>'new',
    resume:async(id:string)=>id,
    fork:async()=>'forked',
    compact:async()=>({ok:true}),
    /* the kernel replays the history SYNCHRONOUSLY inside subscribe (headless/run.ts:181, session-controller.ts:494) */
    subscribe(id:string,sink:(e:any)=>void){
      sinks.set(id,sink);
      if(id==='s-replay'){for(const raw of rawEvents){sunkReplaying.push(controller.replaying());sink(raw);}}
      return()=>sinks.delete(id);
    },
    cancel:async()=>{},close:async()=>{},
  };
  const controller=createTuiSessionController({runtime:r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  return{controller,sinks};
}
function readRows(dir:string){
  const names=readdirSync(dir).filter(name=>name.endsWith('.jsonl')).sort();
  return names.flatMap(name=>readFileSync(join(dir,name),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)));
}
const rawEvents=[{type:'RunStarted',runId:'r1'},{type:'TextMessageContent',messageId:'m1',delta:'a'},{type:'TextMessageContent',messageId:'m1',delta:'b'},{type:'ToolCallStart',toolCallId:'t1'},{type:'RunFinished'}];

test('A1-REPLAY: the history replay logs ONE summary instead of one raw_event per replayed event',()=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-devlog-replay-'));
  try{
    initializeDevelopmentLogging({logDir:dir,component:'a1-replay'});
    const sunkReplaying:boolean[]=[];
    const {controller}=runtimeWithReplay(rawEvents,sunkReplaying);
    controller.attach('s-replay',0,true);
    controller.close();
    developmentLogFlush();
    const rows=readRows(dir);
    const rawEventRows=rows.filter(row=>row.event==='runtime.raw_event');
    assert.deepEqual(rawEventRows,[],`the replay must not log a raw_event per event, got ${rawEventRows.length}`);
    const summaries=rows.filter(row=>row.event==='runtime.replay.summary');
    assert.equal(summaries.length,1,'exactly one replay summary');
    assert.equal(summaries[0]?.data?.rawEvents,rawEvents.length);
    assert.equal(summaries[0]?.data?.sessionId,'s-replay');
  }finally{closeDevelopmentLogging();rmSync(dir,{recursive:true,force:true});}
});

test('A1-LIVE: live (non-replay) events keep the full raw_event logging',()=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-devlog-live-'));
  try{
    initializeDevelopmentLogging({logDir:dir,component:'a1-live'});
    const sunkReplaying:boolean[]=[];
    const {controller,sinks}=runtimeWithReplay([],sunkReplaying);
    controller.attach('s-live');
    const before=readRows(dir).filter(row=>row.event==='runtime.raw_event').length;
    sinks.get('s-live')?.({type:'TextMessageContent',messageId:'m2',delta:'live'});
    controller.close();
    developmentLogFlush();
    const after=readRows(dir).filter(row=>row.event==='runtime.raw_event');
    assert.equal(after.length,before+1,'a live event is still logged as raw_event');
    assert.equal(after[0]?.data?.sessionId,'s-live');
  }finally{closeDevelopmentLogging();rmSync(dir,{recursive:true,force:true});}
});

test('A1-GETTER: replaying() is true inside the replay window and false outside it',()=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-devlog-getter-'));
  try{
    initializeDevelopmentLogging({logDir:dir,component:'a1-getter'});
    const sunkReplaying:boolean[]=[];
    const {controller}=runtimeWithReplay(rawEvents,sunkReplaying);
    assert.equal(controller.replaying?.(),false,'exposed getter, false before any replay');
    controller.attach('s-replay',0,true);
    assert.equal(controller.replaying?.(),false,'false after the synchronous replay returns');
    assert.deepEqual(sunkReplaying,rawEvents.map(()=>true),'true for every event inside the window');
    controller.close();
  }finally{closeDevelopmentLogging();rmSync(dir,{recursive:true,force:true});}
});
