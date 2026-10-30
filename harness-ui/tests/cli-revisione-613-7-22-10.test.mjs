/*
 * 22/10/2026 — la REVISIONE 7 della CLI su 74f9caf27 (DO-NOT-PUBLISH, un S2 e cinque S3; prove nella `review613-7` della CLI). Le cure:
 * F1 (S2) lo scarto misurato passa lo STESSO controllo di plausibilità dell'ancora e ha un tetto (metà finestra); si azzera al cambio di
 *    modello. F2 lo Stop e il tempo scaduto chiudono l'ALBERO di git (Windows: il lanciatore `Git\cmd\git.exe` muore, i figli no), e git
 *    non lancia più gpg. F3 il /compact oltre la soglia dice `al-minimo`. F4 un giro senza misura restituisce la stima dei SUOI attrezzi, e
 *    il registro senza scarto ripiega sugli attrezzi di base del kernel. F5 il fine giro passa il motivo alla regola. F6 se pavimento +
 *    riassunto atteso + scarto non entrano nella finestra non si paga — nemmeno sul rifiuto del fornitore — e lo si dice una volta.
 * 23/10/2026 — la REVISIONE 8 della CLI (prove R8-*): N1 il tetto dello scarto della misura non scende mai sotto gli schemi del giro, e
 *    uno scarto misurato con meno attrezzi riceve la differenza (registro → agent-service → giro); e — trovato dalla prova che la CLI ha
 *    chiesto — il blocco dei fatti non fa mai uscire la richiesta dalla finestra. N2 lo scarto della sessione sta nel giornale (riga
 *    `scarto-sessione`) e torna al riavvio; con un modello diverso solo gli attrezzi; una sessione di prima si apre come sempre. N3
 *    `tokenDopo` sulla scala di `tokenPrima`.
 * Ogni prova ha la sua scena AL CONTRARIO. Adattatore, agent-service e registro VERI; fornitori e giri finti; nessuna porta.
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { ATTREZZI_OPENAI, stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { costruisciBloccoFatti, eseguiGitPredefinito } from '../src/kernel/ricarica-post-compact.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

function cartella(t, nome = 'talos-r7-') {
  const c = realpathSync.native(mkdtempSync(join(tmpdir(), nome)));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
/* il valore di PRIMA si salva una volta sola per prova: due scene nella stessa prova registravano due ripristini, e quello della seconda
   rimetteva il tetto della prima, che restava nell'ambiente per le prove dopo */
const tettiOriginali = new WeakMap();
function conTetto(t, valore) {
  if (!tettiOriginali.has(t)) {
    const prima = process.env[compattazione.VARIABILE_TETTO_TOKEN];
    tettiOriginali.set(t, prima);
    t.after(() => { if (prima === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = prima; });
  }
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(valore);
}
const overflow = () => new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 8192 tokens. However, you requested about 9000 tokens." } }), { status: 400, headers: { 'content-type': 'application/json' } });
/**
 * Il fornitore finto: `prompt(corpo)` decide `prompt_tokens` (null ⇒ nessun `usage`), `rifiuta(n)` se la richiesta n-esima (dei giri, non
 * dei riassunti) risponde «contesto pieno». Conta corpi e riassunti.
 */
function fornitore({ prompt = (corpo) => stima(corpo.messages), rifiuta = () => false } = {}) {
  const corpi = [];
  let riassunti = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) {
      riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nfatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    }
    const n = corpi.length;
    corpi.push(corpo);
    if (rifiuta(n)) return overflow();
    const p = prompt(corpo);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], ...(p === null ? {} : { usage: { prompt_tokens: p, completion_tokens: 1 } }) });
  };
  return { fetchDiRete, corpi, get riassunti() { return riassunti; } };
}
const coppie = (n, l = 600) => Array.from({ length: n }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(l / 7)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(l / 7)}` }]).flat();
const giro = (t, { messaggiIniziali, ...resto }) => talosLavora({ cartella: cartella(t), modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
  messaggiIniziali, contestoDelProgetto: 'Project files:\n', ...resto });

/* ---------- F1 ---------- */
test('R7-F1-01 — un `prompt_tokens` impossibile (×30, sopra la finestra) non diventa lo scarto: il giro restituisce la stima dei suoi attrezzi e nessun riassunto; AL CONTRARIO un numero onesto sì', async (t) => {
  const messaggi = [{ role: 'system', content: 'You are a coding agent' }, ...coppie(6), { role: 'user', content: 'Rispondi OK.' }];
  const gonfiato = fornitore({ prompt: (corpo) => 30 * stima(corpo.messages) });
  const r = await giro(t, { messaggiIniziali: messaggi, finestraToken: 32_000, fetchDiRete: gonfiato.fetchDiRete });
  const attrezzi = compattazione.stimaDegliAttrezzi(gonfiato.corpi[0].tools);
  assert.ok(30 * stima(gonfiato.corpi[0].messages) > 32_000, 'premessa: il numero è sopra la finestra');
  assert.equal(r.scartoMisurato, attrezzi, `la stima degli attrezzi, non ${30 * stima(gonfiato.corpi[0].messages)}`);
  assert.equal(gonfiato.riassunti, 0);
  const onesto = fornitore({ prompt: (corpo) => stima(corpo.messages) + 3_000 });
  const o = await giro(t, { messaggiIniziali: messaggi, finestraToken: 32_000, fetchDiRete: onesto.fetchDiRete });
  assert.ok(Math.abs(o.scartoMisurato - 3_000) <= 5, `AL CONTRARIO: lo scarto vero (${o.scartoMisurato})`);
});

test('R7-F1-02 — `prompt_tokens: 1` non azzera lo scarto (tornava il buco S2-2): resta la stima degli attrezzi; e lo scarto ha un tetto, metà della finestra', async (t) => {
  const messaggi = [{ role: 'system', content: 'You are a coding agent' }, ...coppie(4), { role: 'user', content: 'Rispondi OK.' }];
  const uno = fornitore({ prompt: () => 1 });
  const r = await giro(t, { messaggiIniziali: messaggi, finestraToken: 12_000, fetchDiRete: uno.fetchDiRete });
  const attrezzi = compattazione.stimaDegliAttrezzi(uno.corpi[0].tools);
  assert.ok(attrezzi > 1_000, `premessa: gli attrezzi pesano (${attrezzi})`);
  assert.equal(r.scartoMisurato, attrezzi, 'non 0');
  /* l'unità: plausibilità, tetto con e senza finestra */
  assert.equal(compattazione.scartoDaMisura(1, 4_000, { finestraToken: 12_000 }), null, 'sotto un quarto della stima');
  assert.equal(compattazione.scartoDaMisura(40_000, 4_000, { finestraToken: 32_000 }), null, 'sopra la finestra');
  assert.equal(compattazione.scartoDaMisura(30_000, 4_000, { finestraToken: 32_000 }), 16_000, 'il tetto: metà finestra');
  assert.equal(compattazione.scartoDaMisura(30_000, 4_000, { soglia: 30_000 }), 20_000, 'senza finestra, il tetto dalla finestra implicita nella soglia (30.000 / 0,75 = 40.000, metà 20.000)');
  assert.equal(compattazione.scartoDaMisura(30_000, 4_000, { soglia: 6_000 }), null, 'e la plausibilità: 30.000 è oltre la finestra implicita di 8.000');
  assert.equal(compattazione.scartoDaMisura(5_000, 4_000, { finestraToken: 32_000 }), 1_000, 'AL CONTRARIO: un numero vero passa com\'è');
  assert.equal(compattazione.scartoDaMisura(3_000, 4_000, { finestraToken: 32_000 }), 0, 'una stima che sovrastima: 0, mai negativo');
});

/* ---------- registro ---------- */
const CLOUD = 'z-ai/glm-5.3-flash';
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function registroDiProva(t, opzioni = {}) {
  const cartellaStore = cartellaDiProva('talos-r7-registro-');
  const giri = [];
  const riassunti = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ input, concludi(storia, extra = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], ...extra } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const riassumiPerCompattazioneFn = async (input) => { riassunti.push(input); return { scelta: { role: 'assistant', content: '## Riassunto\nR' }, finishReason: 'stop', usage: null }; };
  let ms = Date.parse('2026-10-22T10:00:00.000Z');
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: CLOUD, chiave: 'k', riassumiPerCompattazioneFn, clock: () => new Date(ms += 1000), ...opzioni });
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  const avvia = () => { const { sessionId } = registro.avvia('task-vero', { modelloScelto: CLOUD }); assert.ok(sessionId); return sessionId; };
  const assesta = async (sessionId) => { await attendiScritture({ cartellaStore, sessionId }); await new Promise((ok) => setTimeout(ok, 60)); };
  return { registro, giri, riassunti, avvia, assesta, cartellaStore };
}
const breve = () => [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }];

test('R7-F1-03 — lo scarto della sessione si azzera al cambio di modello (era di un altro tokenizzatore e di altri attrezzi); AL CONTRARIO un cambio che non tocca il modello lo tiene', async (t) => {
  const { registro, giri, avvia, assesta } = registroDiProva(t);
  const sessionId = avvia();
  giri[0].concludi(breve(), { scartoMisurato: 4_000 });
  await assesta(sessionId);
  assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { permessi: 'Read only' }), { ok: true });
  registro.resume(sessionId, 'uno');
  assert.equal(giri[1].input.scartoMisurato, 4_000, 'AL CONTRARIO: cambiare i permessi non lo tocca');
  giri[1].concludi([...breve(), { role: 'user', content: 'uno' }, { role: 'assistant', content: 'ok' }], { scartoMisurato: 4_000 });
  await assesta(sessionId);
  assert.notEqual((await registro.aggiornaImpostazioni(sessionId, { modello: 'altro/modello' }))?.ok, false);
  registro.resume(sessionId, 'due');
  assert.equal(giri[2].input.scartoMisurato, undefined, 'col modello nuovo il giro misura da capo (gli attrezzi del suo primo invio)');
});

/* ---------- F2 ---------- */
test('R7-F2-01 — git senza firme: `-c log.showSignature=false` sta negli argomenti del blocco dei fatti', async () => {
  const visti = [];
  await costruisciBloccoFatti({ cartellaProgetto: 'C:/progetto' }, { eseguiGit: async (file, args) => { visti.push(args); return { stdout: 'abc uno' }; } });
  assert.deepEqual(visti[0].slice(0, 4), ['-C', 'C:/progetto', '-c', 'log.showSignature=false']);
  assert.ok(visti[0].includes('log'));
});

test('R7-F2-02 — Windows: lo Stop chiude l\'ALBERO del processo (il lanciatore e i suoi figli), e non aspetta; AL CONTRARIO `execFile` col solo segnale lascia vivo il figlio', { skip: process.platform !== 'win32' }, async (t) => {
  const base = cartella(t, 'talos-r7-albero-');
  /* un «lanciatore» come Git\cmd\git.exe: fa partire un figlio che dorme e ne scrive il pid, poi aspetta */
  const lanciatore = join(base, 'lanciatore.mjs');
  writeFileSync(lanciatore, [
    "import { spawn } from 'node:child_process';",
    "import { writeFileSync } from 'node:fs';",
    /* `detached`: fuori dal job object di libuv, come il git.exe vero sotto il lanciatore (un lanciatore Node chiuderebbe i figli da solo) */
    "const figlio = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore', detached: true, windowsHide: true });",
    'writeFileSync(process.argv[2], String(figlio.pid));',
    'setTimeout(() => {}, 30000);',
  ].join('\n'));
  const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const attendiPid = async (file) => { for (let i = 0; i < 200 && !existsSync(file); i += 1) await new Promise((ok) => setTimeout(ok, 25)); return Number(readFileSync(file, 'utf8')); };
  const attendiMorto = async (pid) => { for (let i = 0; i < 80 && vivo(pid); i += 1) await new Promise((ok) => setTimeout(ok, 25)); return !vivo(pid); };

  const pidCura = join(base, 'cura.pid');
  const stop = new AbortController();
  const chiamata = eseguiGitPredefinito(process.execPath, [lanciatore, pidCura], { signal: stop.signal, windowsHide: true });
  const figlioCura = await attendiPid(pidCura);
  const t0 = Date.now();
  stop.abort();
  await assert.rejects(chiamata, { name: 'AbortError' });
  assert.ok(Date.now() - t0 < 2_500, `lo Stop non aspetta il processo (${Date.now() - t0} ms)`);
  assert.equal(await attendiMorto(figlioCura), true, 'il figlio del lanciatore è chiuso');

  /* AL CONTRARIO, la forma di prima: `promisify(execFile)` col solo segnale */
  const pidPrima = join(base, 'prima.pid');
  const stop2 = new AbortController();
  const vecchia = promisify(execFile)(process.execPath, [lanciatore, pidPrima], { signal: stop2.signal, windowsHide: true });
  const figlioPrima = await attendiPid(pidPrima);
  stop2.abort();
  await assert.rejects(vecchia, { name: 'AbortError' });
  await new Promise((ok) => setTimeout(ok, 300));
  const sopravvissuto = vivo(figlioPrima);
  try { process.kill(figlioPrima); } catch { /* già chiuso */ }
  assert.equal(sopravvissuto, true, 'AL CONTRARIO: il solo segnale lasciava vivo il figlio');
});

test('R7-F2-03 — il tempo scaduto chiude l\'albero allo stesso modo e lo dice (`ETIMEDOUT`)', { skip: process.platform !== 'win32' }, async (t) => {
  const base = cartella(t, 'talos-r7-albero-');
  const lanciatore = join(base, 'lanciatore.mjs');
  writeFileSync(lanciatore, [
    "import { spawn } from 'node:child_process';",
    "import { writeFileSync } from 'node:fs';",
    /* `detached`: fuori dal job object di libuv, come il git.exe vero sotto il lanciatore (un lanciatore Node chiuderebbe i figli da solo) */
    "const figlio = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore', detached: true, windowsHide: true });",
    'writeFileSync(process.argv[2], String(figlio.pid));',
    'setTimeout(() => {}, 30000);',
  ].join('\n'));
  const pid = join(base, 'tempo.pid');
  await assert.rejects(eseguiGitPredefinito(process.execPath, [lanciatore, pid], { timeout: 1_500, windowsHide: true }), { code: 'ETIMEDOUT' });
  const figlio = Number(readFileSync(pid, 'utf8'));
  let vivo = true;
  for (let i = 0; i < 80 && vivo; i += 1) { try { process.kill(figlio, 0); await new Promise((ok) => setTimeout(ok, 25)); } catch { vivo = false; } }
  assert.equal(vivo, false, 'il figlio è chiuso anche al tempo scaduto');
});

/* ---------- F3 ---------- */
test('R7-F3-01 — /compact con un tratto vecchio che non rende: oltre la soglia `al-minimo`; AL CONTRARIO sotto la soglia `poco-utile`', async (t) => {
  const storia = [{ role: 'system', content: `${'istruzione di sistema '.repeat(2_000)}` }, { role: 'user', content: 'Consegna' }];
  for (let i = 0; i < 5; i += 1) storia.push({ role: 'user', content: `d${i}` }, { role: 'assistant', content: `r${i}` });
  const corsa = async (tetto) => {
    conTetto(t, tetto);
    const { registro, giri, avvia, assesta, riassunti } = registroDiProva(t);
    const sessionId = avvia();
    giri[0].concludi(storia, { scartoMisurato: 0 });
    await assesta(sessionId);
    const esito = await registro.compatta(sessionId);
    assert.equal(riassunti.length, 0, 'niente pagato');
    return esito.motivo;
  };
  const totale = stima(storia);
  assert.equal(await corsa(totale - 2_000), 'al-minimo', 'oltre la soglia');
  assert.equal(await corsa(totale + 4_000), 'poco-utile', 'AL CONTRARIO: sotto la soglia');
});

/* ---------- F4 ---------- */
test('R7-F4-01 — un fornitore senza `usage`: il giro restituisce la stima dei SUOI attrezzi, non lo scarto ereditato; AL CONTRARIO con `usage` la misura', async (t) => {
  const messaggi = [{ role: 'system', content: 'You are a coding agent' }, ...coppie(3), { role: 'user', content: 'Rispondi OK.' }];
  const muto = fornitore({ prompt: () => null });
  const r = await giro(t, { messaggiIniziali: messaggi, scartoMisurato: 9_999, fetchDiRete: muto.fetchDiRete });
  assert.equal(r.scartoMisurato, compattazione.stimaDegliAttrezzi(muto.corpi[0].tools), 'la stima dei suoi attrezzi');
  const misurato = fornitore({ prompt: (corpo) => stima(corpo.messages) + 1_234 });
  const m = await giro(t, { messaggiIniziali: messaggi, scartoMisurato: 9_999, fetchDiRete: misurato.fetchDiRete });
  assert.ok(Math.abs(m.scartoMisurato - 1_234) <= 5, `AL CONTRARIO: la misura (${m.scartoMisurato})`);
});

test('R7-F4-02 — il registro senza uno scarto (dopo un riavvio, o un giro che non l\'ha portato) ripiega sugli attrezzi di base: il riassunto di fine giro parte; AL CONTRARIO con uno scarto 0 dichiarato no', async (t) => {
  const base = compattazione.stimaDegliAttrezzi(ATTREZZI_OPENAI);
  assert.ok(base > 1_000, `premessa: gli attrezzi di base pesano (${base})`);
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(10, 800), { role: 'user', content: 'ultima' }, { role: 'assistant', content: 'ok' }];
  const corsa = async (extra) => {
    conTetto(t, stima(storia) + Math.floor(base / 2));
    const { giri, avvia, assesta, riassunti } = registroDiProva(t);
    const sessionId = avvia();
    giri[0].concludi(storia, extra);
    await assesta(sessionId);
    return riassunti.length;
  };
  assert.equal(await corsa({}), 1, 'senza scarto: con gli attrezzi di base la storia passa la soglia, e il riassunto parte');
  assert.equal(await corsa({ scartoMisurato: 0 }), 0, 'AL CONTRARIO: con uno scarto 0 dichiarato resta sotto');
});

/* ---------- F5 ---------- */
/* N7 (revisione 9 della CLI, 23/10/2026): il fine giro e il giro hanno la STESSA regola (F5), e da N7 quella regola è il 10% anche
   all'emergenza (testo approvato dall'owner il 22/10): un passo piccolo all'emergenza non si paga, uno dal 10% in su sì */
test('R7-F5-01 — fine giro all\'emergenza, con la finestra nota: la stessa regola del giro, il 10% della soglia (N7) — un guadagno piccolo non si paga; AL CONTRARIO uno dal 10% in su sì', async (t) => {
  const finestra = 20_000;
  const storia = (codaToken) => [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(4, 600),
    { role: 'user', content: 'Ultima: guarda questo.' }, { role: 'assistant', content: `Ecco: ${'x'.repeat(codaToken * 4)}` }];
  const corsa = async (codaToken) => {
    const { giri, avvia, assesta, riassunti } = registroDiProva(t, { finestraTokenFn: () => finestra });
    const sessionId = avvia();
    giri[0].concludi(storia(codaToken), { scartoMisurato: 0 });
    await assesta(sessionId);
    return riassunti.length;
  };
  const sopraEmergenza = Math.ceil(finestra * 0.9 - stima(storia(0)) + 300);
  assert.equal(await corsa(sopraEmergenza), 0, 'all\'emergenza un guadagno sotto il 10% della soglia non si paga (N7)');
  const soloSoglia = Math.ceil(finestra * 0.75 - stima(storia(0)) + 300);
  assert.equal(await corsa(soloSoglia), 0, 'e alla soglia nemmeno: la stessa regola');
  /* AL CONTRARIO: all'emergenza un tratto vecchio grande (guadagno oltre il 10% della soglia) si paga */
  let n = 10;
  const grande = (k) => [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(k, 2_400), { role: 'user', content: 'Ultima.' }, { role: 'assistant', content: 'ok' }];
  while (stima(grande(n)) < finestra * 0.9 + 300) n += 1;
  const { giri, avvia, assesta, riassunti } = registroDiProva(t, { finestraTokenFn: () => finestra });
  const sessionId = avvia();
  giri[0].concludi(grande(n), { scartoMisurato: 0 });
  await assesta(sessionId);
  assert.equal(riassunti.length, 1, 'AL CONTRARIO: all\'emergenza un guadagno vero oltre il 10% si paga');
});

/* ---------- F6 ---------- */
test('R7-F6-01 — una finestra più piccola di sistema + attrezzi: nessun riassunto né all\'emergenza né sul rifiuto del fornitore, «non entra» detto una volta coi numeri; AL CONTRARIO già detto per questa finestra non si ripete, per un\'altra sì', async (t) => {
  /* §4.2 (pezzo B, regola N): a non entrare è la CODA (una risposta lunga già data), non la richiesta nuova — sistema, attrezzi e
     richiesta nuova da soli stanno sotto la linea d'emergenza, così la regola N non scatta e decide F6 */
  const messaggi = [{ role: 'system', content: `${'regola '.repeat(1_700)}` }, { role: 'user', content: 'Consegna' }, ...coppie(4, 600),
    { role: 'user', content: 'Mostrami il log.' }, { role: 'assistant', content: `Ecco il log: ${'x'.repeat(12_000)}` }, { role: 'user', content: 'Rispondi OK.' }];
  const corsa = async (extra = {}) => {
    const f = fornitore({ rifiuta: () => true });
    const eventi = [];
    let errore = null;
    try { await giro(t, { messaggiIniziali: messaggi, finestraToken: 8_192, fetchDiRete: f.fetchDiRete, onGiro: (e) => eventi.push(e), ...extra }); } catch (e) { errore = e; }
    return { f, errore, nonEntra: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'non-entra') };
  };
  const prima = await corsa();
  assert.ok(prima.errore, 'il giro fallisce, come prima');
  assert.equal(prima.f.riassunti, 0, 'nessun riassunto pagato (prima: uno a ogni giro fallito)');
  assert.equal(prima.nonEntra.length, 1, '«non entra» una volta');
  assert.equal(prima.nonEntra[0].finestra, 8_192);
  assert.ok(prima.nonEntra[0].pavimento >= 8_192, `col pavimento che non entra (${prima.nonEntra[0].pavimento})`);
  assert.equal(prima.nonEntra[0].compattato, false);
  const giaDetto = await corsa({ nonEntraDetto: 8_192 });
  assert.equal(giaDetto.nonEntra.length, 0, 'già detto per questa finestra: non si ripete');
  assert.equal(giaDetto.f.riassunti, 0);
  const altra = await corsa({ nonEntraDetto: 4_096 });
  assert.equal(altra.nonEntra.length, 1, 'detto per un\'altra finestra: si dice');
});

test('R7-F6-02 — AL CONTRARIO: sul rifiuto del fornitore un riassunto che può far entrare la richiesta si paga ancora (uno), e il giro riparte', async (t) => {
  const messaggi = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna' }, ...coppie(14, 1_400), { role: 'user', content: 'Rispondi OK.' }];
  const f = fornitore({ rifiuta: (n) => n === 0 });
  const eventi = [];
  const r = await giro(t, { messaggiIniziali: messaggi, finestraToken: 32_000, fetchDiRete: f.fetchDiRete, onGiro: (e) => eventi.push(e) });
  assert.equal(r.comeFinita, 'concluso');
  assert.equal(f.riassunti, 1, 'il riassunto che serve si paga');
  assert.ok(!eventi.some((e) => e.motivo === 'non-entra'), 'e non si dice «non entra»');
});

test('R7-F6-04 — anche il riassunto di fine giro: con la finestra nota, se pavimento + riassunto atteso + scarto non entrano, non si paga; AL CONTRARIO con uno scarto che lascia spazio sì', async (t) => {
  const finestra = 20_000;
  /* una coda grande (nel pavimento) e un tratto vecchio che renderebbe: oltre l'emergenza */
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(10, 1_000),
    { role: 'user', content: 'Ultima: guarda questo.' }, { role: 'assistant', content: `Ecco: ${'x'.repeat(4 * 16_000)}` }];
  const corsa = async (scarto) => {
    const { giri, avvia, assesta, riassunti } = registroDiProva(t, { finestraTokenFn: () => finestra });
    const sessionId = avvia();
    giri[0].concludi(storia, { scartoMisurato: scarto });
    await assesta(sessionId);
    return riassunti.length;
  };
  assert.ok(stima(storia) > finestra * 0.9, 'premessa: oltre la linea d\'emergenza');
  assert.equal(await corsa(4_000), 0, 'con 4.000 di scarto il pavimento non entra: nessun riassunto');
  assert.equal(await corsa(0), 1, 'AL CONTRARIO: senza scarto entra, e il riassunto si paga');
});

test('R7-F6-03 — il registro ricorda «non entra» per finestra (anche se il giro poi fallisce) e lo passa al giro dopo; agent-service porta finestra e pavimento al giornale', async (t) => {
  const { registro, giri, avvia, assesta } = registroDiProva(t);
  const sessionId = avvia();
  giri[0].input.onEvento({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', giro: 1, compattato: false, motivo: 'non-entra', finestra: 8_192, pavimento: 9_100 } });
  giri[0].concludi(breve());
  await assesta(sessionId);
  registro.resume(sessionId, 'ancora');
  assert.equal(giri[1].input.nonEntraDetto, 8_192);
  /* agent-service: i due numeri arrivano nell'evento, e `nonEntraDetto` arriva al motore */
  const eventi = [];
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', nonEntraDetto: 8_192,
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async (input) => {
      assert.equal(input.nonEntraDetto, 8_192);
      input.onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: false, motivo: 'non-entra', finestra: 8_192, pavimento: 9_100 });
      return { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [], recordDiCompattazione: [] };
    } });
  const fine = eventi.find((e) => e.name === 'talos.compattazione')?.value;
  assert.deepEqual(fine, { fase: 'fine', giro: 1, compattato: false, motivo: 'non-entra', finestra: 8_192, pavimento: 9_100 });
});

test('R7-F1-04 — senza una finestra dichiarata, col tetto dell\'ospite: un `prompt_tokens` gonfiato sopra la finestra implicita (soglia / 0,75) non diventa lo scarto; AL CONTRARIO un numero onesto sì', async (t) => {
  const messaggi = [{ role: 'system', content: 'You are a coding agent' }, ...coppie(6), { role: 'user', content: 'Rispondi OK.' }];
  const gonfiato = fornitore({ prompt: (corpo) => 30 * stima(corpo.messages) });
  const r = await giro(t, { messaggiIniziali: messaggi, tettoCompattazioneToken: 20_000, fetchDiRete: gonfiato.fetchDiRete });
  assert.ok(30 * stima(gonfiato.corpi[0].messages) > 20_000 / 0.75, 'premessa: sopra la finestra implicita');
  assert.equal(r.scartoMisurato, compattazione.stimaDegliAttrezzi(gonfiato.corpi[0].tools), 'la stima degli attrezzi, non il numero gonfiato');
  assert.equal(gonfiato.riassunti, 0);
  const onesto = fornitore({ prompt: (corpo) => stima(corpo.messages) + 2_000 });
  const o = await giro(t, { messaggiIniziali: messaggi, tettoCompattazioneToken: 20_000, fetchDiRete: onesto.fetchDiRete });
  assert.ok(Math.abs(o.scartoMisurato - 2_000) <= 5, `AL CONTRARIO: lo scarto vero (${o.scartoMisurato})`);
  assert.equal(compattazione.scartoDaMisura(40_000, 4_000, { soglia: 20_000 }), null, 'l\'unità: sopra soglia / 0,75 senza finestra');
});

test('R7-F6-05 — niente da riassumere, ma sistema + attrezzi + coda non entrano nella finestra: nessun riassunto e «non entra» detto lo stesso; AL CONTRARIO una finestra che li regge non lo dice', async (t) => {
  const corsa = async (finestraToken) => {
    const f = fornitore({ rifiuta: () => true });
    const eventi = [];
    /* pezzo B: senza tratto vecchio, e con la richiesta nuova che da sola entra (la regola N non scatta) */
    const messaggi = [{ role: 'system', content: `${'regola '.repeat(1_700)}` }, { role: 'user', content: 'Consegna' },
      { role: 'assistant', content: `Ecco il log: ${'x'.repeat(12_000)}` }, { role: 'user', content: 'Rispondi OK.' }];
    let errore = null;
    try { await giro(t, { messaggiIniziali: messaggi, finestraToken, fetchDiRete: f.fetchDiRete, onGiro: (e) => eventi.push(e) }); } catch (e) { errore = e; }
    return { f, errore, nonEntra: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'non-entra') };
  };
  const piccola = await corsa(8_192);
  assert.ok(piccola.errore, 'il fornitore rifiuta, il giro fallisce');
  assert.equal(piccola.f.riassunti, 0);
  assert.equal(piccola.nonEntra.length, 1, '«non entra» anche senza un tratto vecchio');
  assert.ok(piccola.nonEntra[0].pavimento >= 8_192);
  const grande = await corsa(64_000);
  /* R12-1: il fornitore finto rifiuta sempre coi numeri di una finestra da 8.192; quando non resta niente da accorciare, «non entra» si
     dice con la finestra DEL FORNITORE (come ZK3-02). Il controllo di questa prova è F6 sulla finestra dichiarata, che regge: lì no. */
  assert.equal(grande.nonEntra.filter((e) => e.finestra === 64_000).length, 0, 'AL CONTRARIO: con una finestra che regge il pavimento non si dice');
});

test('R7-F6-07 — gli attrezzi che pesano quasi tutta la finestra (8k, ~7.250 contati dal fornitore): il tetto dello scarto non nasconde più il «non entra» — nessun riassunto, una riga; AL CONTRARIO su una finestra che li regge il riassunto si paga', async (t) => {
  /* il caso della CLI (revisione 7, F6 ancora aperta su 08aafe959): la prima richiesta passa con `prompt_tokens` ≈ 8.050 ≤ 8.192 (plausibile),
     lo scarto vero è ~7.250 ma il tetto di F1 lo portava a 4.096, e «non entra» non scattava: si pagava un riassunto a ogni giro */
  const messaggi = [{ role: 'system', content: `You are a coding agent. ${'regola del progetto '.repeat(120)}` }, { role: 'user', content: 'Consegna' },
    ...coppie(3, 300), { role: 'user', content: 'Leggi il file e rispondi.' }];
  /* il «di più» del fornitore (gli schemi che conta lui) si fissa alla PRIMA richiesta, perché quella passi a 8.150 su 8.192 come nel caso
     della CLI (la richiesta vera porta anche le note del kernel, che qui non si contano a mano) */
  const corsa = async (finestraToken) => {
    const eventi = [];
    let riassunti = 0;
    let richieste = 0;
    let extra = null;
    const fetchDiRete = async (_u, o) => {
      const corpo = corpoSenzaMarcatori(o.body);
      if (!corpo.tools?.length) { riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nfatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }); }
      extra ??= 8_150 - stima(corpo.messages);
      const prompt = stima(corpo.messages) + extra;
      if (prompt > finestraToken) return overflow();
      richieste += 1;
      const messaggio = richieste === 1
        ? { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'nota.txt' }) } }] }
        : { role: 'assistant', content: 'OK' };
      return Response.json({ choices: [{ index: 0, message: messaggio, finish_reason: messaggio.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: 1 } });
    };
    const lavoro = cartella(t);
    writeFileSync(join(lavoro, 'nota.txt'), `${'contenuto della nota '.repeat(40)}\n`);
    let errore = null;
    try {
      await talosLavora({ cartella: lavoro, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
        contestoDelProgetto: 'Project files:\n', finestraToken, fetchDiRete, onGiro: (e) => eventi.push(e) });
    } catch (e) { errore = e; }
    return { riassunti, errore, richieste, extra, nonEntra: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'non-entra') };
  };
  const piccola = await corsa(8_192);
  assert.ok(piccola.extra > 6_000, `premessa: il fornitore conta quasi tutta la finestra in più della stima (${piccola.extra})`);
  assert.ok(piccola.richieste >= 1, 'premessa: la prima richiesta passa, e lo scarto si misura');
  assert.equal(piccola.riassunti, 0, 'nessun riassunto: nessuno farebbe entrare la richiesta');
  /* ⛔ R12-1 (revisione 12 della CLI): qui la richiesta va oltre la finestra di ~440 token, e ~730 di prosa nella storia possono
     spiegarne una parte (`scartoFissoCerto`): «non entra» prima di mandare non è CERTO, e decide il fornitore. Resta il cuore della
     prova: il tetto dello scarto non fa pagare un riassunto, e il giro finisce coi numeri del fornitore. */
  assert.ok(piccola.nonEntra.length <= 1, '«non entra» al più una volta');
  assert.equal(piccola.errore?.contestoPieno?.numeri?.massimo, 8_192, 'il giro finisce coi numeri del fornitore');
  const grande = await corsa(32_000);
  assert.ok(!grande.nonEntra.length, 'AL CONTRARIO: con una finestra che regge non si dice');
});

test('R7-F6-08 — il giro restituisce DUE scarti: quello della misura col tetto (metà finestra) e quello intero per «può entrare?»; il registro usa quello intero nel fine giro (nessun riassunto); AL CONTRARIO col solo scarto col tetto il riassunto si paga', async (t) => {
  /* (a) il giro: una richiesta sola che passa a 8.150 su 8.192 */
  const messaggi = [{ role: 'system', content: 'You are a coding agent' }, ...coppie(3, 300), { role: 'user', content: 'Rispondi OK.' }];
  let extra = null;
  const r = await talosLavora({ cartella: cartella(t), modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
    contestoDelProgetto: 'Project files:\n', finestraToken: 8_192,
    fetchDiRete: async (_u, o) => {
      const corpo = corpoSenzaMarcatori(o.body);
      extra ??= 8_150 - stima(corpo.messages);
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages) + extra, completion_tokens: 1 } });
    } });
  assert.equal(r.scartoMisurato, 4_096, 'la misura ha il tetto: metà finestra');
  assert.ok(Math.abs(r.scartoNonEntra - extra) <= 5, `«può entrare?» usa lo scarto intero (${r.scartoNonEntra} contro ${extra})`);
  /* (b) il registro: oltre l'emergenza, un tratto vecchio che con lo scarto col tetto «entrerebbe» */
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(14, 600), { role: 'user', content: 'ultima' }, { role: 'assistant', content: 'ok' }];
  const corsa = async (extraEsito) => {
    const { giri, avvia, assesta, riassunti } = registroDiProva(t, { finestraTokenFn: () => 8_192 });
    const sessionId = avvia();
    giri[0].concludi(storia, extraEsito);
    await assesta(sessionId);
    return riassunti.length;
  };
  assert.ok(stima(storia) + 4_096 >= 8_192 * 0.9, `premessa: con lo scarto della misura la storia passa l'emergenza (${stima(storia) + 4_096})`);
  assert.equal(await corsa({ scartoMisurato: 4_096, scartoNonEntra: 7_300 }), 0, 'con lo scarto intero il pavimento non entra: nessun riassunto');
  assert.equal(await corsa({ scartoMisurato: 4_096 }), 1, 'AL CONTRARIO: col solo scarto col tetto il riassunto si paga');
});

/* ---------- revisione 8 della CLI (23/10/2026): N1, N2, N3 ---------- */
/* Gli schemi PESANTI, come i 24 attrezzi della CLI (~7.300 token): quelli del kernel più diciassette attrezzi MCP dalle descrizioni lunghe.
   Il fornitore ONESTO conta ciò che riceve — messaggi E schemi — e rifiuta oltre la finestra, come un fornitore vero. */
const ATTREZZI_PESANTI = Array.from({ length: 17 }, (_, i) => ({
  name: `attrezzo_${i}`, description: `Strumento ${i}. ${'Descrive con molta cura che cosa fa e quando usarlo. '.repeat(22)}`,
  inputSchema: { type: 'object', properties: { percorso: { type: 'string', description: 'il percorso del file da leggere o scrivere' } } },
}));
function fornitoreOnesto(finestra, { risposta = 'OK' } = {}) {
  const conti = { richieste: 0, rifiuti: 0, riassunti: 0, schemi: null };
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nfatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    }
    conti.schemi = compattazione.stimaDegliAttrezzi(corpo.tools);
    const prompt = stima(corpo.messages) + conti.schemi;
    if (prompt > finestra) { conti.rifiuti += 1; return overflow(); }
    conti.richieste += 1;
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: risposta }, finish_reason: 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: 1 } });
  };
  return { fetchDiRete, conti };
}
const giroPesante = (t, extra) => giro(t, { toolMcp: ATTREZZI_PESANTI, chiamaToolMcpFn: async () => ({ content: [], isError: false }), ...extra });

test('R8-N1-01 — schemi pesanti e fornitore onesto: lo scarto ereditato è stato misurato con meno attrezzi (un server MCP collegato a metà sessione), e il giro aggiunge la differenza — si compatta prima, nessun rifiuto; AL CONTRARIO con gli stessi attrezzi la misura ereditata si rispetta e niente si paga', async (t) => {
  const finestra = 10_240;
  const messaggi = [{ role: 'system', content: 'You are a coding agent' }, ...coppie(5, 1_200), { role: 'user', content: 'Rispondi OK.' }];
  const base = compattazione.stimaDegliAttrezzi(ATTREZZI_OPENAI);
  const f = fornitoreOnesto(finestra);
  let errore = null;
  try { await giroPesante(t, { messaggiIniziali: messaggi, finestraToken: finestra, scartoMisurato: base, stimaAttrezziMisurati: base, fetchDiRete: f.fetchDiRete }); } catch (e) { errore = e; }
  assert.ok(f.conti.schemi > 6_500, `premessa: gli schemi pesano come quelli della CLI (${f.conti.schemi})`);
  assert.ok(stima(messaggi) + base < finestra * 0.75, `premessa: con lo scarto ereditato la richiesta «entra» (${stima(messaggi) + base})`);
  assert.ok(stima(messaggi) + f.conti.schemi > finestra, `premessa: con gli schemi veri no (${stima(messaggi) + f.conti.schemi})`);
  assert.equal(errore, null, `il giro finisce (${errore?.message})`);
  assert.equal(f.conti.rifiuti, 0, 'nessuna richiesta rifiutata come troppo grande');
  assert.equal(f.conti.riassunti, 1, 'un riassunto, pagato prima della richiesta');
  /* AL CONTRARIO: lo stesso scarto misurato con GLI STESSI attrezzi è il numero del fornitore (conta meno della stima): niente si paga */
  let riassunti = 0;
  const conta = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nfatto' }, finish_reason: 'stop' }] }); }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages) + base, completion_tokens: 1 } });
  };
  await giroPesante(t, { messaggiIniziali: messaggi, finestraToken: finestra, scartoMisurato: base, stimaAttrezziMisurati: f.conti.schemi, fetchDiRete: conta });
  assert.equal(riassunti, 0, 'AL CONTRARIO: la misura ereditata si rispetta');
});

test('R8-N1-05 — il filo: il registro passa al giro gli schemi con cui ha misurato lo scarto, e agent-service li porta al motore; AL CONTRARIO senza uno scarto misurato non passa niente', async (t) => {
  const { registro, giri, avvia, assesta } = registroDiProva(t);
  const sessionId = avvia();
  giri[0].concludi(breve(), { scartoMisurato: 3_000, stimaAttrezzi: 2_500 });
  await assesta(sessionId);
  registro.resume(sessionId, 'uno');
  assert.equal(giri[1].input.scartoMisurato, 3_000);
  assert.equal(giri[1].input.stimaAttrezziMisurati, 2_500);
  giri[1].concludi([...breve(), { role: 'user', content: 'uno' }, { role: 'assistant', content: 'ok' }], { scartoMisurato: 3_000, stimaAttrezzi: 2_500 });
  await assesta(sessionId);
  assert.notEqual((await registro.aggiornaImpostazioni(sessionId, { modello: 'altro/modello' }))?.ok, false);
  registro.resume(sessionId, 'due');
  assert.equal(giri[2].input.stimaAttrezziMisurati, undefined, 'AL CONTRARIO: col modello nuovo niente scarto, niente schemi della misura');
  let visto;
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', scartoMisurato: 3_000, stimaAttrezziMisurati: 2_500, onEvento: () => {},
    talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [], recordDiCompattazione: [] }; } });
  assert.equal(visto.scartoMisurato, 3_000);
  assert.equal(visto.stimaAttrezziMisurati, 2_500, 'agent-service la porta al motore');
});

test('R8-N1-02 — il tetto dello scarto della misura non scende mai sotto gli schemi del giro: un fornitore onesto da 9.000 su 10.240 dà lo scarto vero; AL CONTRARIO senza attrezzi resta metà finestra', () => {
  assert.equal(compattazione.scartoDaMisura(9_000, 1_000, { finestraToken: 10_240, attrezzi: 7_338 }), 7_338, 'il tetto sale agli attrezzi');
  assert.equal(compattazione.scartoDaMisura(9_000, 2_000, { finestraToken: 10_240, attrezzi: 7_338 }), 7_000, 'sotto il tetto, lo scarto vero');
  assert.equal(compattazione.scartoDaMisura(9_000, 1_000, { finestraToken: 10_240 }), 5_120, 'AL CONTRARIO: senza attrezzi, metà finestra');
  assert.equal(compattazione.scartoDaMisura(9_000, 1_000, { finestraToken: 10_240, attrezzi: 0 }), 5_120, 'attrezzi 0: metà finestra');
  assert.equal(compattazione.scartoDaMisura(40_000, 1_000, { finestraToken: 32_000, attrezzi: 7_338 }), null, 'la plausibilità resta la stessa');
});

test('R8-N1-04 — il blocco dei fatti non fa mai uscire la richiesta dalla finestra: col riassunto VERO più lungo dell\'atteso, se è il blocco a sforare si toglie; AL CONTRARIO con un riassunto che lascia spazio il blocco resta', async (t) => {
  /* finestra 10.240, scarto 7.500: la cornice (~1.520) + il blocco (~250) + l'atteso (~480) entrano, quindi la stima decide di pagare col
     blocco; il riassunto vero da ~1.000 token col blocco sfora (10.269), senza no (10.018) */
  const messaggi = [{ role: 'system', content: 'You are a coding agent' }, ...coppie(5, 1_200), { role: 'user', content: 'Rispondi OK.' }];
  const corsa = async (caratteriDelRiassunto) => {
    const visti = [];
    const fetchDiRete = async (_u, o) => {
      const corpo = corpoSenzaMarcatori(o.body);
      if (!corpo.tools?.length) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'parola '.repeat(caratteriDelRiassunto / 7)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
      visti.push(corpo);
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages) + compattazione.stimaDegliAttrezzi(corpo.tools), completion_tokens: 1 } });
    };
    const r = await giro(t, { messaggiIniziali: messaggi, finestraToken: 10_240, scartoMisurato: 7_500, fetchDiRete });
    const rec = r.recordDiCompattazione?.at(-1);
    assert.ok(rec, 'premessa: il giro ha compattato all\'emergenza');
    return { conBlocco: JSON.stringify(rec.riassunto).includes('coveredThrough='), richiesta: stima(rec.riassunto) + 7_500 };
  };
  const lungo = await corsa(4_000);
  assert.equal(lungo.conBlocco, false, 'col riassunto lungo il blocco si toglie');
  assert.ok(lungo.richiesta < 10_240, `e la richiesta entra (${lungo.richiesta})`);
  const corto = await corsa(1_600);
  assert.equal(corto.conBlocco, true, 'AL CONTRARIO: col riassunto che lascia spazio il blocco resta');
  assert.ok(corto.richiesta < 10_240, `anche lei dentro (${corto.richiesta})`);
});

test('R8-N1-03 — dieci giri a 10.240 con risposte da 4.000 caratteri e ~7.300 token di schemi: nessuna richiesta rifiutata, e pochi riassunti', async (t) => {
  const finestra = 10_240;
  const f = fornitoreOnesto(finestra, { risposta: `Risposta lunga: ${'parola '.repeat(570)}` });
  let storia = [{ role: 'system', content: 'You are a coding agent' }];
  let scartoMisurato;
  let record = null;
  const errori = [];
  for (let n = 0; n < 10; n += 1) {
    const messaggiIniziali = [...storia, { role: 'user', content: `Domanda ${n}: spiega la parte ${n} del progetto.` }];
    try {
      const r = await giroPesante(t, { messaggiIniziali, finestraToken: finestra, fetchDiRete: f.fetchDiRete,
        ...(Number.isFinite(scartoMisurato) ? { scartoMisurato } : {}),
        ...(record ? { recordCompattazioneIniziale: record } : {}) });
      storia = r.messaggiFinali;
      scartoMisurato = r.scartoMisurato;
      record = r.recordDiCompattazione?.at(-1) ?? record;
    } catch (e) { errori.push(e.message); storia = messaggiIniziali; }
  }
  assert.ok(f.conti.schemi > 6_500, `premessa: gli schemi pesano come quelli della CLI (${f.conti.schemi})`);
  assert.deepEqual(errori, [], 'ogni giro finisce');
  assert.equal(f.conti.rifiuti, 0, `nessuna richiesta rifiutata (${f.conti.rifiuti} su ${f.conti.richieste + f.conti.rifiuti})`);
  /* la finestra lascia 10.240 − ~8.000 di schemi ≈ 2.200 token per tutto il resto, e ogni risposta ne aggiunge ~1.000: dal terzo giro un
     riassunto a giro è il minimo fisico. Misurato sul codice di prima (b6d4e3746): 7 richieste rifiutate e 8 riassunti; con la cura 0 e 8 */
  assert.ok(f.conti.riassunti <= 8, `al più un riassunto a giro, e nessuno nei due giri che entrano (${f.conti.riassunti} in 10 giri)`);
  assert.ok(scartoMisurato >= f.conti.schemi - 50, `lo scarto portato fra i giri è quello degli schemi veri (${scartoMisurato} contro ${f.conti.schemi})`);
});

/* N2: un registro sullo STESSO archivio, ricreato come dopo un riavvio */
function registroRiavviabile(t, opzioni = {}) {
  const cartellaStore = cartellaDiProva('talos-r8-registro-');
  const giri = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ input, concludi(storia, extra = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], ...extra } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const riassumiPerCompattazioneFn = async () => ({ scelta: { role: 'assistant', content: '## Riassunto\nR' }, finishReason: 'stop', usage: null });
  let ms = Date.parse('2026-10-23T01:00:00.000Z');
  const crea = () => createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: CLOUD, chiave: 'k', riassumiPerCompattazioneFn, clock: () => new Date(ms += 1000), finestraTokenFn: () => 64_000, ...opzioni });
  const assesta = async (sessionId) => { await attendiScritture({ cartellaStore, sessionId }); await new Promise((ok) => setTimeout(ok, 60)); };
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  return { crea, giri, assesta, cartellaStore };
}
/* una storia con un tratto vecchio da riassumere: il /compact compatta e dice `tokenPrima` = stima della storia + scarto della sessione */
const storiaLunga = () => [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(14, 1_400), { role: 'user', content: 'ultima' }, { role: 'assistant', content: 'ok' }];
const righeScarto = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r)).filter((r) => r.tipo === 'scarto-sessione');
const scartoDelCompact = async (registro, sessionId) => {
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.compattato, true, `premessa: il /compact compatta (${JSON.stringify(esito)})`);
  return esito.tokenPrima - stima(storiaLunga());
};

test('R8-N2-01 — lo scarto della sessione sopravvive al riavvio: una riga nel giornale, e dopo il riavvio il giro e il /compact usano lo scarto misurato; AL CONTRARIO senza la riga vale la stima degli attrezzi di base', async (t) => {
  const amb = registroRiavviabile(t);
  const prima = amb.crea();
  const { sessionId } = prima.avvia('task-vero', { modelloScelto: CLOUD });
  amb.giri[0].concludi(storiaLunga(), { scartoMisurato: 9_000, scartoNonEntra: 9_400, stimaAttrezzi: 7_300 });
  await amb.assesta(sessionId);
  assert.deepEqual(righeScarto(amb.cartellaStore, sessionId).map(({ modello, scartoMisurato, scartoNonEntra, attrezzi }) => ({ modello, scartoMisurato, scartoNonEntra, attrezzi })),
    [{ modello: CLOUD, scartoMisurato: 9_000, scartoNonEntra: 9_400, attrezzi: 7_300 }], 'una riga sola nel giornale');
  const dopo = amb.crea();
  await dopo.ripristina();
  assert.equal(await scartoDelCompact(dopo, sessionId), 9_000, 'il /compact dopo il riavvio conta lo scarto misurato');
  const ancora = amb.crea();
  await ancora.ripristina();
  ancora.resume(sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.scartoMisurato, 9_000, 'il giro dopo il riavvio riceve lo scarto misurato');
  amb.giri.at(-1).concludi([...storiaLunga(), { role: 'user', content: 'ancora' }, { role: 'assistant', content: 'ok' }], { scartoMisurato: 9_000, scartoNonEntra: 9_400, stimaAttrezzi: 7_300 });
  await amb.assesta(sessionId);
  assert.equal(righeScarto(amb.cartellaStore, sessionId).length, 1, 'lo stesso scarto non si riscrive');
  /* AL CONTRARIO: una sessione di prima della cura, senza la riga nel giornale (e senza un record del /compact sopra), si apre come sempre
     e vale la stima degli attrezzi di base */
  const altra = amb.crea();
  const { sessionId: vecchiaId } = altra.avvia('task-vero', { modelloScelto: CLOUD });
  amb.giri.at(-1).concludi(storiaLunga(), { scartoMisurato: 9_000, scartoNonEntra: 9_400, stimaAttrezzi: 7_300 });
  await amb.assesta(vecchiaId);
  const file = join(amb.cartellaStore, `${vecchiaId}.jsonl`);
  writeFileSync(file, `${readFileSync(file, 'utf8').trim().split('\n').filter((r) => JSON.parse(r).tipo !== 'scarto-sessione').join('\n')}\n`);
  assert.equal(righeScarto(amb.cartellaStore, vecchiaId).length, 0, 'premessa: nessuna riga nel giornale');
  const vecchia = amb.crea();
  await vecchia.ripristina();
  const base = compattazione.stimaDegliAttrezzi(ATTREZZI_OPENAI);
  assert.equal(await scartoDelCompact(vecchia, vecchiaId), base, `senza la riga, gli attrezzi di base (${base}); la sessione si apre e si compatta senza errori`);
});

test('R8-N2-02 — al ripristino con un modello diverso da quello della riga vale solo la stima degli attrezzi che l\'ospite manda (non lo scarto di un altro tokenizzatore); AL CONTRARIO con lo stesso modello lo scarto misurato', async (t) => {
  const amb = registroRiavviabile(t);
  const prima = amb.crea();
  const { sessionId } = prima.avvia('task-vero', { modelloScelto: CLOUD });
  amb.giri[0].concludi(storiaLunga(), { scartoMisurato: 9_000, scartoNonEntra: 9_400, stimaAttrezzi: 7_300 });
  await amb.assesta(sessionId);
  assert.notEqual((await prima.aggiornaImpostazioni(sessionId, { modello: 'altro/modello' }))?.ok, false);
  await amb.assesta(sessionId);
  const dopo = amb.crea();
  await dopo.ripristina();
  assert.equal(await scartoDelCompact(dopo, sessionId), 7_300, 'modello diverso: gli attrezzi, non 9.000');
  const ancora = amb.crea();
  await ancora.ripristina();
  ancora.resume(sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.scartoMisurato, undefined, 'il giro col modello nuovo misura da capo');
});

test('R8-N3-01 — `tokenDopo` sta sulla scala di `tokenPrima` (la richiesta che parte, scarto compreso), nel /compact e nel giro; AL CONTRARIO la sola proiezione era più piccola dello scarto intero', async (t) => {
  const amb = registroRiavviabile(t);
  const registro = amb.crea();
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CLOUD });
  amb.giri[0].concludi(storiaLunga(), { scartoMisurato: 3_000 });
  await amb.assesta(sessionId);
  const esito = await registro.compatta(sessionId);
  assert.equal(esito.compattato, true, JSON.stringify(esito));
  assert.equal(esito.tokenPrima, stima(storiaLunga()) + 3_000, 'tokenPrima: storia + scarto');
  const record = registro.statoCompattazione(sessionId).record;
  assert.equal(esito.tokenDopo, stima(record.riassunto) + 3_000, `tokenDopo: proiezione + scarto (${esito.tokenDopo})`);
  assert.ok(esito.tokenDopo > 3_000, 'AL CONTRARIO: la sola proiezione non conterebbe lo scarto');
  /* nel giro: il record del riassunto porta lo scarto, e il verdetto del fornitore resta sulla sola proiezione (nessun «inefficace» finto) */
  const f = fornitore({ prompt: (corpo) => stima(corpo.messages) + 2_500 });
  conTetto(t, 6_000);
  const r = await giro(t, { messaggiIniziali: [...storiaLunga(), { role: 'user', content: 'Rispondi OK.' }], fetchDiRete: f.fetchDiRete, scartoMisurato: 2_500 });
  const rec = r.recordDiCompattazione?.at(-1);
  assert.ok(rec, 'premessa: il giro ha compattato');
  assert.equal(rec.tokenDopo, stima(rec.riassunto) + 2_500, `tokenDopo nel giro porta lo scarto (${rec.tokenDopo})`);
  assert.ok(Math.abs(r.scartoMisurato - 2_500) <= 5, `il verdetto confronta il fornitore con la sola proiezione: lo scarto resta vero (${r.scartoMisurato})`);
});

test('R8-N3-02 — anche il record di «sola coda» del giro porta lo scarto in `tokenDopo`; e il giro restituisce la stima degli schemi che ha mandato (N2)', async (t) => {
  conTetto(t, 4_000);
  let riassunti = 0;
  let schemi = null;
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nfatto' }, finish_reason: 'stop' }] }); }
    schemi ??= compattazione.stimaDegliAttrezzi(corpo.tools);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages) + 1_000, completion_tokens: 1 } });
  };
  /* la scena di S2-1-GIRO-SOLA-CODA-01: un esito enorme negli ultimi scambi e poca storia vecchia — la coda si accorcia senza riassunto */
  const messaggi = [
    ...[1, 2, 3].flatMap((i) => [{ role: 'user', content: `Richiesta ${i}: rispondi OK.` }, { role: 'assistant', content: 'OK' }]),
    { role: 'user', content: 'Leggi il file grande.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"grande.txt"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: `${'contenuto del file grande, riga dopo riga. '.repeat(600)}` },
    { role: 'assistant', content: 'Letto.' },
    { role: 'user', content: 'Ora rispondi OK.' },
  ];
  const r = await giro(t, { messaggiIniziali: messaggi, fetchDiRete, scartoMisurato: 1_000 });
  const rec = r.recordDiCompattazione?.at(-1);
  assert.ok(rec && riassunti === 0, `premessa: la coda si è accorciata senza riassunto (${riassunti})`);
  assert.equal(rec.tokenDopo, stima(rec.riassunto) + 1_000, `tokenDopo della sola coda: proiezione + scarto (${rec.tokenDopo})`);
  assert.equal(r.stimaAttrezzi, schemi, 'il giro restituisce gli schemi che ha mandato, per il registro');
});

test('R8-N3-03 — il record del riassunto di fine giro del registro porta lo scarto della sessione in `tokenDopo`', async (t) => {
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(10, 800), { role: 'user', content: 'ultima' }, { role: 'assistant', content: 'ok' }];
  conTetto(t, stima(storia) + 1_500);
  const { registro, giri, avvia, assesta } = registroDiProva(t);
  const sessionId = avvia();
  giri[0].concludi(storia, { scartoMisurato: 3_000 });
  await assesta(sessionId);
  let record = null;
  for (let i = 0; i < 100 && !record; i += 1) {
    record = registro.statoCompattazione(sessionId)?.record ?? null;
    if (!record) await new Promise((ok) => setTimeout(ok, 20));
  }
  assert.ok(record, 'premessa: il riassunto di fine giro ha scritto il suo record');
  assert.equal(record.tokenDopo, stima(record.riassunto) + 3_000, `tokenDopo: proiezione + scarto della sessione (${record.tokenDopo})`);
});

/* ---------- revisione 9 della CLI (23/10/2026): N6 ---------- */
test('R9-N6-01 — all\'emergenza il riassunto di fine giro arrivato, adottato come base, BASTA per la linea d\'emergenza: nessun secondo riassunto sullo stesso punto, una riga sola; AL CONTRARIO se la base da sola resta sopra l\'emergenza il resto si riassume', async (t) => {
  conTetto(t, 4_000); // soglia 4.000, emergenza 4.800
  const lavoro = cartella(t);
  const testo = (contenuto) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  /* il giro 1 prepara in sottofondo il riassunto che il registro consegnerebbe a fine giro */
  const coppieDi = (n) => Array.from({ length: n }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` }]).flat();
  let n = 10;
  while (stima(coppieDi(n + 1)) < 3_450) n += 1; // oltre l'80% della soglia (si prepara), sotto la soglia (il giro 1 non compatta)
  const coppieLunghe = coppieDi(n);
  const r0 = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) return testo('## Riassunto\nRIASSUNTO-DI-FINE-GIRO');
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  const uno = await talosLavora({ cartella: lavoro, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' },
    messaggiIniziali: [{ role: 'system', content: 'You are a coding agent' }, ...coppieLunghe, { role: 'user', content: 'Continua.' }],
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0, scartoMisurato: 0 });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta?.record, 'premessa: un riassunto pronto a fine giro');
  const corsa = async (richiesta, scarto, dopo = []) => {
    const messaggiIniziali = [...uno.messaggiFinali, ...dopo, { role: 'user', content: richiesta }];
    const coda = messaggiIniziali.slice(pronta.record.coveredThrough);
    const scambio = stima([...pronta.record.riassunto, ...coda]);
    const inArrivo = Object.assign(Promise.resolve({ ...pronta, origine: 'fine-giro' }),
      { firma: { coveredThrough: pronta.record.coveredThrough, impronta: pronta.impronta, base: pronta.base } });
    let riassunti = 0;
    const primi = [];
    const r1 = async (_u, o) => {
      const corpo = corpoSenzaMarcatori(o.body);
      if (!corpo.tools?.length) { riassunti += 1; return testo('## Riassunto\nSECONDO-RIASSUNTO'); }
      primi.push(corpo);
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages) + scarto, completion_tokens: 1 } });
    };
    const fini = [];
    const inizi = [];
    await talosLavora({ cartella: lavoro, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali,
      compattazioneInArrivo: inArrivo, compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1, scartoMisurato: scarto,
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fini.push(e); if (e?.tipo === 'compattazione-inizio') inizi.push(e); } });
    return { riassunti, fini, inizi, scambio, totale: stima(messaggiIniziali), prima: primi[0] };
  };
  /* la richiesta e lo scarto: lo scambio da solo sotto la soglia, con lo scarto sopra la soglia e sotto l'emergenza; la richiesta intera
     sopra l'emergenza */
  /* come nel caso della CLI: qualche scambio arrivato dopo il riassunto di fine giro, che il codice di prima riassumeva di nuovo */
  const dopo = coppieDi(3);
  const prova = await corsa('Adesso continua.', 0, dopo);
  const scarto = 4_400 - prova.scambio;
  assert.ok(scarto > 0 && prova.scambio + scarto >= 4_000 && prova.scambio + scarto < 4_800, `premessa: la base con lo scarto sta fra soglia ed emergenza (${prova.scambio} + ${scarto})`);
  assert.ok(prova.totale + scarto >= 4_800, `premessa: la richiesta intera sta oltre l'emergenza (${prova.totale} + ${scarto})`);
  const n6 = await corsa('Adesso continua.', scarto, dopo);
  assert.equal(n6.riassunti, 0, `nessun secondo riassunto (${n6.riassunti})`);
  assert.equal(n6.fini.length, 1, 'una riga sola per la richiesta');
  assert.ok(n6.inizi.length <= n6.fini.length, 'ogni inizio ha la sua fine (uno scambio istantaneo non apre una riga viva, IST-02)');
  assert.equal(n6.fini[0].compattato, true, 'la base è la compattazione di questa richiesta');
  assert.equal(n6.fini[0].adottato?.origine, 'fine-giro', 'e lo dice: adottata dal fine giro');
  assert.equal(n6.fini[0].restoNonRiuscito, undefined, 'nessun resto da annunciare');
  assert.ok(JSON.stringify(n6.prima.messages).includes('RIASSUNTO-DI-FINE-GIRO'), 'la richiesta parte con la base');
  /* AL CONTRARIO: quattro scambi lunghi arrivati DOPO la base la tengono sopra l'emergenza (scarto compreso) ⇒ il resto si riassume */
  const lunga = await corsa('Adesso continua.', scarto, coppieDi(4).map((m) => ({ ...m, content: `${m.content} ${'dettaglio '.repeat(250)}` })));
  assert.ok(lunga.scambio + scarto >= 4_800, `premessa: la base con lo scarto resta oltre l'emergenza (${lunga.scambio} + ${scarto})`);
  assert.equal(lunga.riassunti, 1, 'AL CONTRARIO: il resto si riassume');
});

/* ---------- revisione 9 della CLI (23/10/2026): N7 ---------- */
test('R9-N7-01 — all\'emergenza vale il 10% della soglia (testo approvato dall\'owner il 22/10): un passo piccolo su una richiesta che ENTRA nella finestra non si paga; AL CONTRARIO una richiesta che con lo scarto supera già la finestra è un overflow certo, e un passo che accorcia si paga prima del 400', () => {
  const mezzo = [{ role: 'user', content: 'x'.repeat(3_580) }]; // ~900 token: un passo piccolo
  const argomenti = { pavimentoConCornice: 1_800, mezzo, soglia: 7_680, finestraToken: 10_240, motivo: 'emergenza' };
  const prima = 1_800 + stima(mezzo);
  assert.ok(compattazione.guadagnoAtteso({ ...argomenti, prima }) > 0 && compattazione.guadagnoAtteso({ ...argomenti, prima }) < 768, 'premessa: un guadagno vero ma sotto il 10% della soglia');
  assert.equal(compattazione.riassuntoUtile({ ...argomenti, prima, scarto: 7_300 }), false, 'entra (≈ 9.600 su 10.240): non si paga');
  assert.equal(compattazione.riassuntoUtile({ ...argomenti, prima, scarto: 7_700 }), true, 'AL CONTRARIO: oltre la finestra (≈ 10.400) è un overflow certo, si paga prima');
  assert.equal(compattazione.riassuntoUtile({ ...argomenti, prima, scarto: 7_700, finestraToken: null }), false, 'senza una finestra dichiarata decide il fornitore (10%)');
});

test('R9-N7-02 — venti giri a 10.240 con ~7.300 token di schemi e risposte da 1.500 caratteri (il caso della CLI): nessuna richiesta rifiutata e meno riassunti da ~6% (prima 11 su 20); i riassunti partono solo quando la richiesta non entrerebbe', async (t) => {
  const finestra = 10_240;
  const f = fornitoreOnesto(finestra, { risposta: `Risposta: ${'parola '.repeat(213)}` });
  let storia = [{ role: 'system', content: 'You are a coding agent' }];
  let scartoMisurato;
  let stimaAttrezziMisurati;
  let record = null;
  const errori = [];
  for (let n = 0; n < 20; n += 1) {
    const messaggiIniziali = [...storia, { role: 'user', content: `Domanda ${n}: spiega la parte ${n} del progetto.` }];
    try {
      const r = await giroPesante(t, { messaggiIniziali, finestraToken: finestra, fetchDiRete: f.fetchDiRete,
        ...(Number.isFinite(scartoMisurato) ? { scartoMisurato, stimaAttrezziMisurati } : {}), ...(record ? { recordCompattazioneIniziale: record } : {}) });
      storia = r.messaggiFinali;
      scartoMisurato = r.scartoMisurato;
      stimaAttrezziMisurati = r.stimaAttrezzi;
      record = r.recordDiCompattazione?.at(-1) ?? record;
    } catch (e) { errori.push(e.message); storia = messaggiIniziali; }
  }
  assert.deepEqual(errori, [], 'ogni giro finisce');
  assert.equal(f.conti.rifiuti, 0, `nessuna richiesta rifiutata (${f.conti.rifiuti})`);
  assert.ok(f.conti.riassunti <= 7, `riassunti solo quando servono (${f.conti.riassunti} in 20 giri; con l'esenzione dell'emergenza erano 11)`);
});

/* S4-1 (revisione 9 della CLI): la regola N parla quando è il MESSAGGIO a non entrare (un testo lungo, un'immagine). Una richiesta corta
   con una cornice già oltre la linea è la finestra: lo dice «non entra» e la richiesta parte (N-S41-01, N-S41-02) */
test('R7-F6-06 (con la regola N) — quando è una richiesta nuova LUNGA a non entrare con la cornice, decide la regola N: REQUEST_TOO_LARGE prima di ogni riassunto, e nessun «non entra»; AL CONTRARIO una richiesta corta con la cornice oltre la linea è «non entra», non «troppo grande»', async (t) => {
  const corsa = async (sistema, richiesta) => {
    const f = fornitore();
    const eventi = [];
    const messaggi = [{ role: 'system', content: sistema }, { role: 'user', content: 'Consegna' }, ...coppie(4, 600), { role: 'user', content: richiesta }];
    let errore = null;
    /* la cartella delle copie c'è sempre sul desktop: senza, l'allegato non partirebbe mai (F2b della revisione 9) */
    try { await giro(t, { messaggiIniziali: messaggi, finestraToken: 8_192, fetchDiRete: f.fetchDiRete, cartellaIncollati: cartella(t), onGiro: (e) => eventi.push(e) }); } catch (e) { errore = e; }
    return { f, eventi, errore };
  };
  const lunga = await corsa('You are a coding agent', `Guarda questo: ${'riga del log incollato '.repeat(1_800)}`);
  assert.equal(lunga.errore?.code, 'REQUEST_TOO_LARGE');
  assert.equal(lunga.errore.dati.allegabile, true, 'un testo lungo si può mandare come allegato');
  assert.equal(lunga.f.corpi.length + lunga.f.riassunti, 0, 'niente partito, niente pagato');
  assert.ok(!lunga.eventi.some((e) => e.motivo === 'non-entra'), 'la regola N parla prima');
  const corta = await corsa(`${'regola '.repeat(3_400)}`, 'Rispondi OK.');
  assert.notEqual(corta.errore?.code, 'REQUEST_TOO_LARGE', 'AL CONTRARIO: la richiesta corta non è «troppo grande»');
  assert.equal(corta.eventi.filter((e) => e.motivo === 'non-entra').length, 1, '«non entra», una volta');
  assert.ok(corta.f.corpi.length >= 1, 'e la richiesta parte');
});

test('R7-COMPACT-NONENTRA-01 — /compact a mano su una conversazione che non entra nella finestra: il risultato porta `nonEntra { finestra, pavimento }` ogni volta, e il giornale NON l\'evento `non-entra` (F4 della revisione 9: è della strada del giro, che lo dice al giro dopo); AL CONTRARIO con una finestra che regge niente', async (t) => {
  const storia = [{ role: 'system', content: `${'regola '.repeat(1_700)}` }, { role: 'user', content: 'Consegna' }, ...coppie(6, 600),
    { role: 'user', content: 'Mostrami il log.' }, { role: 'assistant', content: `Ecco il log: ${'x'.repeat(24_000)}` }];
  const corsa = async (finestra) => {
    const { registro, giri, avvia, assesta, cartellaStore } = registroDiProva(t, { finestraTokenFn: () => finestra });
    const sessionId = avvia();
    giri[0].concludi(storia, { scartoMisurato: 0 });
    await assesta(sessionId);
    const primo = await registro.compatta(sessionId);
    const secondo = await registro.compatta(sessionId);
    await assesta(sessionId);
    const righe = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r));
    const eventi = righe.filter((r) => r.type === 'CUSTOM' && r.name === 'talos.compattazione' && r.value?.motivo === 'non-entra');
    registro.resume(sessionId, 'ancora');
    return { primo, secondo, eventi, giroDopo: giri.at(-1).input };
  };
  const piccola = await corsa(8_192);
  assert.equal(piccola.primo.ok, true, JSON.stringify(piccola.primo));
  assert.equal(piccola.primo.nonEntra?.finestra, 8_192, `il primo risultato lo dice (${JSON.stringify(piccola.primo)})`);
  assert.ok(piccola.primo.nonEntra.pavimento >= 8_192);
  assert.equal(piccola.secondo.nonEntra?.finestra, 8_192, 'anche il secondo: è la risposta a quella richiesta');
  assert.equal(piccola.eventi.length, 0, 'il /compact non scrive l\'evento: dopo un riassunto pagato faceva dire «niente riassunto»');
  assert.notEqual(piccola.giroDopo.nonEntraDetto, 8_192, 'e il giro dopo non lo crede già detto: lo dirà lui, una volta');
  const grande = await corsa(64_000);
  assert.equal(grande.primo.nonEntra, undefined, 'AL CONTRARIO: con una finestra che regge, niente');
  assert.equal(grande.eventi.length, 0);
});

test('R7-COMPACT-NONENTRA-02 — il «non entra» del /compact si misura con lo scarto INTERO della sessione (F6, seconda passata), non con quello col tetto della misura; AL CONTRARIO col solo scarto col tetto la stessa conversazione entra', async (t) => {
  /* la cornice di sistema pesa ~8.000 token: col tetto (4.000) la conversazione entra in 16.384, con lo scarto intero (9.000) no */
  const storia = [{ role: 'system', content: `${'regola '.repeat(4_600)}` }, { role: 'user', content: 'Consegna' }, ...coppie(2, 400),
    { role: 'user', content: 'ultima' }, { role: 'assistant', content: 'ok' }];
  const corsa = async (extra) => {
    const { registro, giri, avvia, assesta } = registroDiProva(t, { finestraTokenFn: () => 16_384 });
    const sessionId = avvia();
    giri[0].concludi(storia, extra);
    await assesta(sessionId);
    return registro.compatta(sessionId);
  };
  const p = stima(storia);
  assert.ok(p + 4_000 < 16_384 && p + 9_000 >= 16_384, `premessa: la conversazione (${p}) entra col tetto e non con lo scarto intero`);
  const intero = await corsa({ scartoMisurato: 4_000, scartoNonEntra: 9_000 });
  assert.equal(intero.ok, true, JSON.stringify(intero));
  assert.equal(intero.nonEntra?.finestra, 16_384, `con lo scarto intero non entra (${JSON.stringify(intero)})`);
  const colTetto = await corsa({ scartoMisurato: 4_000 });
  assert.equal(colTetto.nonEntra, undefined, 'AL CONTRARIO: col solo scarto col tetto entra');
});
