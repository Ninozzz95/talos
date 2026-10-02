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

/*
 * ⭐ 02/10/2026 — la finestra in memoria (decisione owner: «ultimi 500 in RAM, il resto dal file»). Qui la finestra è 5 e il
 * «file» è un array: si prova che la RAM ha il tetto, che i record più vecchi tornano dal file tutti e in ordine, che una serie
 * di pagine legge il file UNA volta, e che un file incompleto o illeggibile si DICE (copertura parziale, errore), mai un buco.
 */
function cronologiaConFile({ finestra = 5, durataDisco = 30_000, persistent = true, rompi = null } = {}) {
  const file = [], letture = { quante: 0 };
  let t = Date.parse('2026-10-02T08:00:00Z');
  const j = creaTimelineAgenti({ clock: () => new Date(t += 1000), persistent, finestra, durataDisco,
    write: (rootId, record) => { if (rompi?.salta?.(record.seq)) return; file.push(structuredClone(record)); },
    leggiDalDisco: async (rootId, perRecord) => {
      letture.quante += 1;
      if (rompi?.lettura) throw new Error('disco');
      for (const r of [{ tipo: 'altro' }, ...file]) if (perRecord(r) === false) break;
      return { record: file.length };
    } });
  return { j, file, letture };
}
const tutteLePagine = async (j, root, limit = 4) => {
  const items = []; let after = 0; const coperture = new Set();
  for (;;) { const p = await j.leggi(root, { after, limit }); assert.ok(!p.erroreAvvio, p.erroreAvvio); items.push(...p.items); coperture.add(p.coverage); if (p.next == null) break; after = p.next; }
  return { items, coperture };
};

test('TIMELINE-FINESTRA-01: in RAM restano gli ultimi N; i più vecchi tornano dal file, tutti, in ordine, con una lettura sola', async () => {
  const { j, letture } = cronologiaConFile();
  for (let i = 0; i < 23; i++) j.registra('r', { sessionId: 'r' }, 'ToolCallStart', { complete: true });
  assert.equal(j.stato('r').items.length, 5, 'la RAM ha il tetto');
  assert.deepEqual(j.stato('r').items.map(r => r.seq), [19, 20, 21, 22, 23]);
  const { items, coperture } = await tutteLePagine(j, 'r');
  assert.deepEqual(items.map(r => r.seq), Array.from({ length: 23 }, (_, i) => i + 1));
  assert.deepEqual([...coperture], ['complete']);
  assert.equal(letture.quante, 1, 'sei pagine, una lettura del file');
  const mezzo = await j.leggi('r', { after: 10, limit: 500 });
  assert.deepEqual(mezzo.items.map(r => r.seq), Array.from({ length: 13 }, (_, i) => i + 11));
  const recenti = await j.leggi('r', { after: 19, limit: 500 });
  assert.deepEqual(recenti.items.map(r => r.seq), [20, 21, 22, 23]);
  assert.equal(letture.quante, 1, 'chi chiede solo la parte in RAM non tocca il file');
});

test('TIMELINE-FINESTRA-02: la copia dal file scade, e la finestra che avanza non usa una copia vecchia', async () => {
  const { j, letture } = cronologiaConFile({ durataDisco: 20 });
  for (let i = 0; i < 12; i++) j.registra('r', { sessionId: 'r' }, 'ToolCallStart', { complete: true });
  await tutteLePagine(j, 'r'); assert.equal(letture.quante, 1);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(j.stato('r').disco, null, 'scaduta: la RAM torna alla sola finestra');
  await tutteLePagine(j, 'r'); assert.equal(letture.quante, 2);
  for (let i = 0; i < 4; i++) j.registra('r', { sessionId: 'r' }, 'ToolCallStart', { complete: true });
  const { items } = await tutteLePagine(j, 'r');
  assert.deepEqual(items.map(r => r.seq), Array.from({ length: 16 }, (_, i) => i + 1), 'i record usciti dalla RAM dopo la copia si rileggono');
  assert.equal(letture.quante, 3);
});

test('TIMELINE-FINESTRA-03: un file che non dà tutto si dice parziale; un file illeggibile è un errore, mai un buco', async () => {
  const buco = cronologiaConFile({ rompi: { salta: seq => seq === 3 } });
  for (let i = 0; i < 12; i++) buco.j.registra('r', { sessionId: 'r' }, 'ToolCallStart', { complete: true });
  const p = await buco.j.leggi('r', { limit: 500 });
  assert.equal(p.coverage, 'partial');
  assert.deepEqual(p.items.map(r => r.seq), [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const rotto = cronologiaConFile({ rompi: { lettura: true } });
  for (let i = 0; i < 12; i++) rotto.j.registra('r', { sessionId: 'r' }, 'ToolCallStart', { complete: true });
  assert.equal((await rotto.j.leggi('r', { limit: 500 })).code, 'TIMELINE_READ_FAILED');
  assert.equal((await rotto.j.leggi('r', { after: 8, limit: 500 })).items.length, 4, 'la parte in RAM resta leggibile');
});

test('TIMELINE-FINESTRA-04: senza archivio i record usciti dalla finestra sono persi, e la copertura lo dice', async () => {
  const { j } = cronologiaConFile({ persistent: false });
  for (let i = 0; i < 4; i++) j.registra('r', { sessionId: 'r' }, 'ToolCallStart', { complete: true });
  assert.equal((await j.leggi('r')).coverage, 'complete', 'dentro la finestra niente è perso');
  for (let i = 0; i < 4; i++) j.registra('r', { sessionId: 'r' }, 'ToolCallStart', { complete: true });
  const p = await j.leggi('r', { limit: 500 });
  assert.equal(p.coverage, 'partial');
  assert.deepEqual(p.items.map(r => r.seq), [4, 5, 6, 7, 8]);
});

test('TIMELINE-FINESTRA-05: il ripristino rimette in RAM solo la finestra; il resto si legge dal file', async () => {
  // 21 e non 23: col taglio a metà ciclo (2 × finestra) 23 record finivano a 5 anche SENZA il taglio finale (mutante T8 vivo)
  const { j, file } = cronologiaConFile();
  for (let i = 0; i < 21; i++) j.registra('r', { sessionId: 'r' }, 'ToolCallStart', { complete: true });
  const letti = [];
  const dopo = creaTimelineAgenti({ clock: () => new Date(), persistent: true, finestra: 5, write: () => {},
    leggiDalDisco: async (root, perRecord) => { for (const r of file) { letti.push(r.seq); if (perRecord(r) === false) break; } } });
  dopo.ripristina('r', file);
  assert.equal(dopo.stato('r').items.length, 5);
  assert.equal(dopo.stato('r').seq, 21);
  const { items, coperture } = await tutteLePagine(dopo, 'r');
  assert.deepEqual(items.map(r => r.seq), Array.from({ length: 21 }, (_, i) => i + 1));
  assert.deepEqual([...coperture], ['complete']);
  assert.equal(letti.at(-1), 17, 'la lettura del file si ferma dove comincia la RAM');
});

test('TIMELINE-COMPATTI: un record di attrezzo porta i contatori, uno di stato l\'elenco intero; nel file un attrezzo pesa poco', async t => {
  const { registro: r, runs, cartellaStore } = banco(t);
  const { sessionId: root } = r.avvia('task');
  const child = await runs[0].input.onDelega('Controlla sorgenti');
  for (let i = 0; i < 70; i++) {
    runs[1].input.onEvento({ type: 'ToolCallStart', toolCallId: 'l' + i, toolCallName: 'leggi' });
    runs[1].input.onEvento({ type: 'ToolCallArgs', toolCallId: 'l' + i, delta: JSON.stringify({ percorso: `src/f${i}.mjs` }) });
    runs[1].input.onEvento({ type: 'ToolCallResult', toolCallId: 'l' + i, content: 'ok' });
  }
  runs[1].input.onEvento({ type: 'RunFinished' });
  const items = []; let after = 0;
  for (;;) { const p = await r.timelineAgenti(root, { after, limit: 500 }); items.push(...p.items); if (p.next == null) break; after = p.next; }
  const delFiglio = items.filter(x => x.node.sessionId === child.childId);
  const attrezzo = delFiglio.filter(x => x.event === 'ToolCallResult').at(-1);
  assert.equal(attrezzo.node.attivita.compatta, true);
  assert.equal(attrezzo.node.attivita.chiamate, 70);
  assert.equal(attrezzo.node.attivita.numeroFile, 70, 'il conteggio vede anche i file oltre il tetto di 60');
  assert.equal(attrezzo.node.attivita.file, undefined, 'nessun elenco nei record di attrezzo');
  assert.deepEqual(attrezzo.node.attivita.passi.map(p => p.percorso), ['src/f69.mjs']);
  const fine = delFiglio.find(x => x.event === 'RunFinished');
  assert.equal(fine.node.attivita.compatta, undefined);
  assert.equal(fine.node.attivita.file.length, 60);
  assert.equal(fine.node.attivita.fileTagliati, 10);
  await new Promise(resolve => setTimeout(resolve, 50));
  const righe = readFileSync(join(cartellaStore, root + '.jsonl'), 'utf8').split('\n').filter(l => l.includes('"tipo":"grafo-agenti"') && l.includes('"event":"ToolCallResult"'));
  assert.ok(righe.length >= 70);
  assert.ok(Math.max(...righe.map(l => Buffer.byteLength(l))) < 2048, 'un record di attrezzo nel file resta sotto i 2 KB');
});

/*
 * ⭐ 02/10/2026 — le statistiche di una figlia ora si tengono a incremento (memo accanto alla voce). Due cose che il memo deve
 * fare come il ricalcolo: un giro nuovo AZZERA l'esito del precedente, e togliere un giro (array sostituito) fa ripartire
 * il calcolo da capo invece di tenere l'esito di un giro che non c'è più.
 */
test('STATISTICHE-FIGLIA: un giro nuovo azzera l\'esito; togliere quel giro torna all\'esito di prima', async t => {
  const { registro: r, runs, cartellaStore } = banco(t);
  const { sessionId: root } = r.avvia('task');
  const child = await runs[0].input.onDelega('Controlla sorgenti');
  const figlia = () => r.elencaFigli(root).figli.find(f => f.sessionId === child.childId);
  runs[1].input.onEvento({ type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'leggi' });
  runs[1].input.onEvento({ type: 'ToolCallResult', toolCallId: 'a', content: 'ok' });
  runs[1].input.onEvento({ type: 'RunError', code: 'fermato', message: 'fermato dalla persona' });
  assert.deepEqual([figlia().ultimoEsito, figlia().motivoChiusura], ['errore', 'fermata']);
  runs[1].input.onEvento({ type: 'RunStarted', input: { consegna: 'riprova' } });
  assert.deepEqual([figlia().ultimoEsito, figlia().motivoChiusura], [null, null], 'un giro nuovo non ha ancora un esito');
  runs[1].input.onEvento({ type: 'TextMessageStart', messageId: 'm1' });
  assert.equal(figlia().operazioneCorrente?.kind, 'response');
  runs[1].input.onEvento({ type: 'TextMessageEnd', messageId: 'm1' });
  runs[1].input.onEvento({ type: 'RunFinished' });
  assert.deepEqual([figlia().ultimoEsito, figlia().motivoChiusura], ['successo', 'fine-lavoro']);
  await new Promise(resolve => setTimeout(resolve, 50));
  const avvii = readFileSync(join(cartellaStore, child.childId + '.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse)
    .filter(x => x?.type === 'RunStarted' || x?.evento?.type === 'RunStarted').map(x => (x.type ? x : x.evento)._sequenza);
  assert.equal(avvii.length, 2, 'due giri nel file della figlia');
  const tolto = await r.rimuoviMessaggio(child.childId, `giro:${avvii[1]}`);
  assert.ok(!tolto.erroreAvvio, tolto.erroreAvvio);
  assert.deepEqual([figlia().ultimoEsito, figlia().motivoChiusura], ['errore', 'fermata'], 'tolto il secondo giro, resta l\'esito del primo');
});
