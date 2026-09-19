import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { registraRiga } from '../src/session-store.mjs';
import { creaTimelineAgenti } from '../src/agent-timeline.mjs';

function banco(t, extra = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-replay-'));
  const runs = [], writes = [];
  const options = { cartellaStore, guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    modello: 'm', chiave: 'test', preparaEsecuzioneFn: () => ({ cartella: cartellaStore, task: { id: 'task', consegna: 'Controlla il progetto' } }),
    avviaSessioneFn(input) { return new Promise(resolve => { runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted' }); }); }, ...extra };
  const write = options.registraRigaFn ?? registraRiga;
  options.registraRigaFn = (...args) => {
    const pending = Promise.resolve().then(() => write(...args));
    writes.push(pending.catch(() => {})); // The disk-failure scenario intentionally rejects.
    return pending;
  };
  const registro = createSessionRegistry(options);
  t.after(async () => {
    for (const r of runs) { r.input.onEvento({ type: 'RunFinished' }); r.resolve({ ok: true, esito: { messaggiFinali: [], detto: 'Fine', comeFinita: 'concluso' } }); }
    await new Promise(resolve => setImmediate(resolve)); // Complete the registry's resolved runs.
    for (let count = -1; count !== writes.length;) {
      count = writes.length;
      await Promise.all(writes);
    }
    rmSync(cartellaStore, { recursive: true, force: true });
  });
  return { registro, options, runs, cartellaStore };
}

test('RIPRESA-REPLAY-DUREVOLE: registra prima di aprire il grafo, padre/figlio/nipote, oltre120 e riavvio', async t => {
  const { registro: r, runs, options, cartellaStore } = banco(t);
  const { sessionId: root } = r.avvia('task');
  const child = await runs[0].input.onDelega('Controlla sorgenti');
  const grandchild = await runs[1].input.onDelega('Controlla nomi');
  for (let i = 0; i < 125; i++) runs[2].input.onEvento({ type: 'ToolCallStart', toolCallId: 't'+i, toolCallName: 'leggi' });
  const first = await r.timelineAgenti(root, { limit: 2 });
  assert.equal(first.schema, 'talos.agent-timeline.v1');
  assert.equal(first.coverage, 'complete');
  assert.equal(first.items.length, 2);
  const items = [...first.items]; let after = first.next;
  while (after != null) { const page = await r.timelineAgenti(root, { after, through: first.through }); items.push(...page.items); after = page.next; }
  assert.ok(items.length > 125);
  assert.deepEqual(items.map(x => x.seq), items.map((_, i) => i+1));
  assert.ok(items.some(x => x.node.sessionId === child.childId));
  assert.ok(items.some(x => x.node.sessionId === grandchild.childId && x.node.padreId === child.childId));
  const saved = readFileSync(join(cartellaStore, root+'.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(x => x.tipo === 'grafo-agenti');
  assert.deepEqual(saved.slice(0, items.length), items);
  const restored = createSessionRegistry(options); await restored.ripristina();
  const old = await restored.timelineAgenti(root, { through: first.through, limit: 500 });
  assert.deepEqual(old.items, items);
  const latest = await restored.timelineAgenti(root, { limit: 500 });
  assert.equal(latest.coverage, 'partial', 'restart while running must disclose interruption');
});

test('RIPRESA-REPLAY-PRIVACY: non duplica output, argomenti o ragionamento; ordine anche con orologio indietro', async t => {
  let now = 1900000000000;
  const { registro: r, runs } = banco(t, { clock: () => new Date(now--) });
  const { sessionId } = r.avvia('task');
  for (const event of [
    { type: 'ToolCallStart', toolCallName: 'leggi', toolCallId: 'id' },
    { type: 'ToolCallArgs', toolCallId: 'id', delta: 'SECRET_ARGUMENT' },
    { type: 'ToolCallResult', toolCallId: 'id', content: 'SECRET_OUTPUT' },
    { type: 'ReasoningMessageStart', messageId: 'a' },
    { type: 'ReasoningMessageContent', messageId: 'a', delta: 'SECRET_REASONING' },
    { type: 'ReasoningMessageEnd', messageId: 'a' },
  ]) runs[0].input.onEvento(event);
  const data = await r.timelineAgenti(sessionId);
  assert.ok(!JSON.stringify(data).includes('SECRET_'));
  assert.ok(data.items.some(x => x.event === 'ReasoningMessageStart'));
  assert.deepEqual(data.items.map(x=>x.seq), data.items.map((_,i)=>i+1));
});

test('RIPRESA-REPLAY-LEGACY: nessuna storia inventata o scrittura GET; cursori invalidi rifiutati', async t => {
  const { registro: r, cartellaStore } = banco(t);
  writeFileSync(join(cartellaStore,'legacy.jsonl'), JSON.stringify({tipo:'intestazione',sessionId:'legacy',taskId:'task',cartella:cartellaStore,task:{consegna:'Vecchia'},modello:'m',avviataAlle:'2026-01-01T00:00:00Z'})+'\n');
  await r.ripristina();
  const before = readFileSync(join(cartellaStore,'legacy.jsonl'));
  const data = await r.timelineAgenti('legacy');
  assert.equal(data.coverage, 'unavailable'); assert.deepEqual(data.items, []);
  assert.deepEqual(readFileSync(join(cartellaStore,'legacy.jsonl')),before);
  for (const query of [{after:-1},{limit:501},{after:2,through:1},{through:99}]) assert.equal((await r.timelineAgenti('legacy',query)).code,'QUERY_INVALID');
  assert.equal((await r.timelineAgenti('missing')).code, 'NOT_FOUND');
});

test('RIPRESA-REPLAY-DISCO: errore persistente dichiarato senza fermare la chat', async t => {
  const { registro:r, runs } = banco(t, { registraRigaFn: async ({record}) => { if(record.tipo==='grafo-agenti') throw Error('Disco pieno'); } });
  const {sessionId}=r.avvia('task');
  runs[0].input.onEvento({type:'ToolCallStart',toolCallId:'t',toolCallName:'leggi'});
  const data=await r.timelineAgenti(sessionId);
  assert.equal(data.coverage,'partial'); assert.equal(data.persisted,false);
  assert.equal(r.elenca().find(x=>x.sessionId===sessionId).conclusa,false);
});

test('RIPRESA-REPLAY-HTTP: endpoint reale, paginazione e validazione', async t => {
  const {registro:r}=banco(t); const {sessionId}=r.avvia('task');
  const server=createServer(createHttpApp({staticHandler:async()=>null,sessionRegistry:r}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}/agent-timeline`;
  const response=await fetch(base+'?limit=1'); assert.equal(response.status,200);
  assert.equal((await response.json()).data.items.length,1);
  for(const q of ['?foo=1','?limit=1&limit=2','?after=1.1','?limit=0']) assert.equal((await fetch(base+q)).status,400);
});

test('RIPRESA-REPLAY-FINE: durata del padre e fine figlio congelate; riavvio pulito non inventa buchi', async t => {
  const {registro:r,runs,options}=banco(t);const {sessionId}=r.avvia('task');
  await runs[0].input.onDelega('Controlla');
  for(const run of runs){run.input.onEvento({type:'RunFinished'});run.resolve({ok:true,esito:{detto:'Fine',comeFinita:'concluso',messaggiFinali:[]}});}
  await new Promise(resolve=>setImmediate(resolve));
  const before=await r.timelineAgenti(sessionId,{limit:500});
  const parent=before.items.findLast(x=>x.node.sessionId===sessionId).node;
  assert.equal(parent.conclusa,true);assert.ok(Number.isFinite(Date.parse(parent.conclusaAlle)));
  const restored=createSessionRegistry(options);await restored.ripristina();
  const after=await restored.timelineAgenti(sessionId,{limit:500});assert.equal(after.coverage,'complete');assert.deepEqual(after.items,before.items);
});

test('RIPRESA-REPLAY-PAGINA: watermark esclude nuovi eventi durante lettura, restituzioni non modificano archivio',async t=>{
 const {registro:r,runs}=banco(t);const {sessionId}=r.avvia('task');
 const first=await r.timelineAgenti(sessionId,{limit:1});
 runs[0].input.onEvento({type:'ToolCallStart',toolCallName:'leggi',toolCallId:'nuovo'});
 const page=await r.timelineAgenti(sessionId,{after:first.next,through:first.through,limit:500});
 assert.ok(page.items.every(x=>x.seq<=first.through));assert.equal(page.next,null);
 first.items[0].node.taskCorto='MANOMESSO';
 assert.notEqual((await r.timelineAgenti(sessionId)).items[0].node.taskCorto,'MANOMESSO');
});

test('RIPRESA-REPLAY-VERSIONE: record futuro non riusa identità e non crea pagine infinite',async()=>{
 const j=creaTimelineAgenti({clock:()=>new Date(),persistent:false});
 const one={tipo:'grafo-agenti',schema:'talos.agent-timeline.v1',rootId:'p',seq:1,at:new Date().toISOString(),coverage:'complete',node:{sessionId:'p'}};
 j.ripristina('p',[one,{...one,seq:2,schema:'talos.agent-timeline.v2'}]);
 const read=await j.leggi('p');assert.equal(read.coverage,'partial');assert.equal(read.through,2);assert.equal(read.next,null);
 j.registra('p',{sessionId:'p'},'updated');assert.equal(j.stato('p').items.at(-1).seq,3);
});
