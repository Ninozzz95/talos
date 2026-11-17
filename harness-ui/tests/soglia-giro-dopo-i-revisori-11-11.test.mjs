/*
 * 11/11/2026 — LA SOGLIA DELLA FINESTRA NON NOTA, GIRO DOPO I TRE REVISORI (brief `BRIEF-AGENTE-SOGLIA-200K-E-SCRITTA-245-2026-11-11.md`,
 * sezione «Giro piccolo dopo i tre revisori», punti 1-14; rapporti `RAPPORTO-REVISORE-{A,B,C}-SOGLIA-2026-11-11.md`; decisioni dell'owner
 * delle 17:27 (Q1, vince la persona ma si avvisa) e delle 17:47 (il compattatore di prima prende il tetto del motore)).
 * Ogni prova qui è nata ROSSA sulla testa `8125b5c89`.
 * Fonti: Hermes `agent/model_metadata.py:2219-2221` («Explicit config override — user knows best»), `agent/context_compressor.py:2771-2775`
 *   (l'uscita tolta dalla finestra); Codex `models-manager/src/model_info.rs:20-26` (`context_window.min(max_context_window)`);
 *   Claude Code CHANGELOG.md:1688 (la prima richiesta usava la finestra di serie; ora aspetta fino a 1,5 s quella del server).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as creaServerTcp } from 'node:net';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { calcolaSoglie } from '../src/kernel/compattazione-desktop.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { createImpostazioniContesto } from '../src/impostazioni-contesto.mjs';
import * as ripiego from '../src/finestra-di-ripiego.mjs';
import { resolveDesktopDefaultProfile } from '../src/context-runtime.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const radice = resolve(fileURLToPath(new URL('../', import.meta.url)));
const DEEPSEEK = 'deepseek/deepseek-v3.2';
const giri = async (n = 5) => { for (let i = 0; i < n; i += 1) await new Promise((r) => { setImmediate(r); }); };
const cartella = (t, nome) => { const d = mkdtempSync(join(tmpdir(), `talos-sg2-${nome}-`)); t.after(() => rimuoviCartellaDiProva(d)); return d; };
/* Le chiavi che la versione di PRIMA (`bb7d53e6a`, `src/impostazioni-contesto.mjs`: `CHIAVI` e `valida`) accetta nel file: con una chiave
   in più quella versione buttava l'intero file e la persona perdeva il motore e il modello del riassunto. */
const CHIAVI_DELLA_VERSIONE_DI_PRIMA = new Set(['schema', 'motore', 'modelloDelRiassunto', 'riservaDelRiassunto']);

/* ---------- punto 1: una voce storta non cancella più le altre impostazioni ---------- */

test('SG2-01 (punto 1a): una memoria scritta a mano fuori limite si scarta DA SOLA, con un avviso; motore e modello del riassunto restano', async (t) => {
  const dir = cartella(t, '01');
  const file = join(dir, 'context', 'impostazioni-contesto.json');
  mkdirSync(join(dir, 'context'), { recursive: true });
  writeFileSync(file, JSON.stringify({ schema: 'talos.context-settings.v1', motore: 'legacy', modelloDelRiassunto: 'openrouter:qwen/qwen3-8b', riservaDelRiassunto: null }));
  const fileMemorie = join(dir, 'context', 'finestre-dei-modelli.json');
  writeFileSync(fileMemorie, JSON.stringify({ schema: 'talos.model-windows.v1', finestreDeiModelli: { [DEEPSEEK]: 163_840, 'acme/zero': 0, 'acme/enorme': 20_000_000, 'non-un-modello': 65_536 } }));
  const avvisi = [];
  const imp = createImpostazioniContesto({ file, avvisa: (m) => avvisi.push(m) });
  assert.equal(imp.motorePerUnaConversazioneNuova(), 'legacy', 'la scelta del motore non si perde');
  assert.equal(imp.riassuntoPerUnGiro().modelloDelRiassunto, 'openrouter:qwen/qwen3-8b', 'il modello del riassunto non si perde');
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), 163_840, 'la voce buona resta');
  for (const id of ['acme/zero', 'acme/enorme', 'non-un-modello']) assert.equal(imp.finestraScrittaPer(id), null, id);
  for (const id of ['acme/zero', 'acme/enorme', 'non-un-modello']) assert.ok(avvisi.some((a) => a.includes(id)), `l'avviso nomina ${id}: ${avvisi.join(' | ')}`);
  assert.equal((await imp.leggi()).motore, 'legacy');
});

test('SG2-02 (punto 1b): il file delle impostazioni resta leggibile dalla versione di PRIMA anche con una memoria scritta (le memorie stanno nel loro file)', async (t) => {
  const dir = cartella(t, '02');
  const file = join(dir, 'context', 'impostazioni-contesto.json');
  const imp = createImpostazioniContesto({ file, avvisa: () => {} });
  await imp.scrivi({ motore: 'legacy' });
  await imp.scrivi({ finestreDeiModelli: { [DEEPSEEK]: 163_840 } });
  const sulDisco = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(sulDisco).filter((k) => !CHIAVI_DELLA_VERSIONE_DI_PRIMA.has(k)), [], `chiavi che la versione di prima rifiuta: ${Object.keys(sulDisco).join(', ')}`);
  assert.equal(sulDisco.motore, 'legacy');
  const memorie = JSON.parse(readFileSync(join(dir, 'context', 'finestre-dei-modelli.json'), 'utf8'));
  assert.deepEqual(memorie.finestreDeiModelli, { [DEEPSEEK]: 163_840 });
  // un processo nuovo rilegge le due cose dai due file
  const dopo = createImpostazioniContesto({ file, avvisa: () => {} });
  assert.equal(dopo.motorePerUnaConversazioneNuova(), 'legacy');
  assert.equal(dopo.finestraScrittaPer(DEEPSEEK), 163_840);
  assert.deepEqual((await dopo.leggi()).finestreDeiModelli, { [DEEPSEEK]: 163_840 }, 'la risposta della rotta le mostra come prima');
});

/* ---------- punto 2: il cablaggio del server vero (`server.mjs`) e della porta HTTP ---------- */

/* una porta libera su 127.0.0.1; con `TALOS_PROVE_PORTE=6080-6099` (le corse degli agenti) solo in quella fascia */
async function portaLibera() {
  const fascia = /^(\d+)-(\d+)$/u.exec(process.env.TALOS_PROVE_PORTE ?? '');
  const candidate = fascia ? Array.from({ length: Number(fascia[2]) - Number(fascia[1]) + 1 }, (_, i) => Number(fascia[1]) + i) : [0];
  for (const candidata of candidate) {
    const s = creaServerTcp();
    const presa = await new Promise((r) => { s.once('error', () => r(false)); s.listen(candidata, '127.0.0.1', () => r(true)); });
    if (!presa) continue;
    const { port } = s.address();
    await new Promise((r) => { s.close(r); });
    return port;
  }
  throw new Error(`nessuna porta libera in ${process.env.TALOS_PROVE_PORTE}`);
}

test('SG2-03 (punto 2, server vero con la rete chiusa): modello ignoto = finestra prudente detta come ripiego; modello locale senza riga; la memoria scritta dalla rotta vince', { timeout: 90_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-sg2-03-'));
  const workspace = join(dir, 'workspace'); mkdirSync(workspace);
  const port = await portaLibera();
  const token = randomBytes(24).toString('hex');
  const intestazione = (sessionId, modello) => `${JSON.stringify({ tipo: 'intestazione', sessionId, taskId: 'prova', cartella: workspace, task: { consegna: 'ciao' }, modello, avviataAlle: '2026-11-11T10:00:00.000Z' })}\n${JSON.stringify({ tipo: 'messaggi-finali', versioneGiro: 1, messaggiFinali: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao' }] })}\n${JSON.stringify({ type: 'RunFinished', _sequenza: 1 })}\n`;
  writeFileSync(join(dir, 'sg2-ignoto.jsonl'), intestazione('sg2-ignoto', 'acme/modello-mai-visto'));
  writeFileSync(join(dir, 'sg2-locale.jsonl'), intestazione('sg2-locale', 'local:qwen3.5-9b'));
  const env = { ...process.env, TALOS_HARNESS_UI_PORT: String(port), TALOS_HARNESS_UI_SEGRETI_DA: 'stdin', TALOS_HARNESS_UI_KEYRING: 'memoria',
    TALOS_SCRATCH_DIR: join(dir, 'scratch'), TALOS_HARNESS_UI_SESSIONS_DIR: dir, TALOS_HARNESS_UI_PROJECT_DIRS: workspace, TALOS_DESKTOP_DATA_DIR: join(dir, 'desktop') };
  for (const k of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'HF_TOKEN', 'TALOS_COMPACTION_TOKEN_CAP']) delete env[k];
  const figlio = spawn(process.execPath, ['--import', pathToFileURL(join(radice, 'tests', 'aiuto', 'rete-chiusa.mjs')).href, 'server.mjs'], { cwd: radice, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
  t.after(async () => { if (figlio.exitCode === null && figlio.signalCode === null) { const fine = new Promise((r) => { figlio.once('exit', r); }); figlio.kill(); await fine; } await rimuoviCartellaDiProva(dir); }); // un solo «dopo»: prima il server (tiene aperti i file), poi la cartella
  figlio.stdin.end(`TALOS_HARNESS_UI_TOKEN=${token}\n`);
  figlio.stdout.resume(); figlio.stderr.resume();
  const headers = { Cookie: `talos_token=${token}`, 'Content-Type': 'application/json' };
  const base = `http://127.0.0.1:${port}/api/v1`;
  const politica = async (id) => { const r = await fetch(`${base}/sessions/${id}/compaction-policy`, { headers }); assert.equal(r.status, 200, id); return (await r.json()).data; };
  let pronta = null;
  for (let i = 0; i < 300 && !pronta; i += 1) {
    if (figlio.exitCode !== null) throw new Error(`il server è uscito con ${figlio.exitCode}`);
    try { const r = await fetch(`${base}/sessions/sg2-ignoto/compaction-policy`, { headers, signal: AbortSignal.timeout(500) }); if (r.status === 200) pronta = (await r.json()).data; } catch { /* non ancora */ }
    if (!pronta) await new Promise((r) => { setTimeout(r, 100); });
  }
  assert.ok(pronta, 'il server di prova risponde');
  await new Promise((r) => { setTimeout(r, 300); }); // le letture in sottofondo (rotta e catalogo) falliscono: la rete è chiusa
  const ignoto = await politica('sg2-ignoto');
  assert.equal(ignoto.windowTokens, ripiego.FINESTRA_PRUDENTE, 'la finestra prudente, non i 200.000 del nucleo nudo');
  assert.equal(ignoto.triggerTokens, 96_000);
  assert.equal(ignoto.source, 'fallback', 'punto 3: la finestra prudente si dice ripiego (il telefono scrive «Model window not verified»)');
  assert.equal(ignoto.windowUnknown, true);
  const locale = await politica('sg2-locale');
  assert.equal(Object.hasOwn(locale, 'windowUnknown'), false, `un modello del motore locale ha la sua finestra: niente riga «non nota» (${JSON.stringify(locale)})`);
  // la porta HTTP delle impostazioni: la memoria scritta per quel modello vince, nel server vero
  const scritta = await fetch(`${base}/context-settings`, { method: 'POST', headers, body: JSON.stringify({ finestreDeiModelli: { 'acme/modello-mai-visto': 65_536 } }) });
  assert.equal(scritta.status, 200, await scritta.clone().text());
  const dopo = await politica('sg2-ignoto');
  assert.equal(dopo.windowTokens, 65_536);
  assert.equal(dopo.source, 'route-minimum');
  assert.equal(Object.hasOwn(dopo, 'windowUnknown'), false);
  const usa = await fetch(`${base}/context-settings/model-window?model=${encodeURIComponent('acme/modello-mai-visto')}`, { headers });
  assert.equal(usa.status, 200);
  assert.deepEqual((await usa.json()).data, { modello: 'acme/modello-mai-visto', finestra: 65_536, fonte: 'persona', letta: { finestra: ripiego.FINESTRA_PRUDENTE, fonte: 'prudente' } });
  // punto 5: la memoria di un modello locale si rifiuta, con la frase
  const localeNo = await fetch(`${base}/context-settings`, { method: 'POST', headers, body: JSON.stringify({ finestreDeiModelli: { 'local:qwen3.5-9b': 65_536 } }) });
  assert.equal(localeNo.status, 400);
  assert.match(JSON.stringify(await localeNo.json()), /local model/iu);
});

test('SG2-04 (punto 2 e 5, porta HTTP): la memoria passa dalla rotta; un valore fuori limite dice i limiti nel messaggio; due id dello stesso modello dicono quale vince', async (t) => {
  const dir = cartella(t, '04');
  const impostazioniContesto = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json'), avvisa: () => {} });
  const server = createServer(createHttpApp({ senzaGettone: 'prove', impostazioniContesto, sessionRegistry: { catenaDelleImpostazioni: () => [] },
    finestraDelModelloFn: (id) => (id === DEEPSEEK ? { modello: id, finestra: 163_840, fonte: 'catalogo', letta: { finestra: 163_840, fonte: 'catalogo' } } : null) }));
  const portaHttp = await portaLibera();
  await new Promise((r) => { server.listen(portaHttp, '127.0.0.1', r); });
  t.after(() => new Promise((r) => { server.close(r); }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/context-settings`;
  const manda = (corpo) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const ok = await manda({ finestreDeiModelli: { [DEEPSEEK]: 163_840 } });
  assert.equal(ok.status, 200);
  assert.equal(impostazioniContesto.finestraScrittaPer(DEEPSEEK), 163_840);
  const fuori = await manda({ finestreDeiModelli: { [DEEPSEEK]: 0 } });
  assert.equal(fuori.status, 400);
  const errore = (await fuori.json()).error;
  assert.match(errore.explanation, /4,096 and 10,000,000/u, `i limiti nel messaggio: ${JSON.stringify(errore)}`);
  assert.deepEqual(errore.params, { minimum: 4_096, maximum: 10_000_000 });
  const doppio = await manda({ finestreDeiModelli: { [`openrouter:${DEEPSEEK}`]: 131_072, [DEEPSEEK]: 100_000 } });
  assert.equal(doppio.status, 200);
  const dati = (await doppio.json()).data;
  assert.equal(impostazioniContesto.finestraScrittaPer(DEEPSEEK), 100_000, 'vince l\'ultima');
  assert.ok(Array.isArray(dati.avvisi) && dati.avvisi.some((a) => a.includes(DEEPSEEK) && a.includes('100,000')), `si dice quale vince: ${JSON.stringify(dati)}`);
  const usa = await fetch(`${base}/model-window?model=${encodeURIComponent(DEEPSEEK)}`);
  assert.equal(usa.status, 200);
  assert.deepEqual((await usa.json()).data, { modello: DEEPSEEK, finestra: 163_840, fonte: 'catalogo', letta: { finestra: 163_840, fonte: 'catalogo' } });
  assert.equal((await fetch(`${base}/model-window`)).status, 400, 'senza modello è una domanda sbagliata');
});

/* ---------- punto 3 e 8: la finestra prudente è un ripiego (source 'fallback'), e l'avviso del compositore lo dice ---------- */

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'c' } };
}
async function giroDi(opzioni, { modello = DEEPSEEK } = {}) {
  let alKernel = null;
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async (ri) => { alKernel = ri; return { comeFinita: 'concluso', messaggiFinali: [] }; } }),
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello, chiave: 'k', ...opzioni });
  const { sessionId } = registro.avvia('task-vero');
  const fine = Date.now() + 10_000;
  while (!alKernel && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); });
  const politica = registro.politicaCompattazione(sessionId);
  registro.ferma?.(sessionId);
  return { alKernel, politica };
}

test('SG2-05 (punto 8): col compattare automatico spento l\'avviso del compositore dice «finestra del modello non verificata» per la finestra prudente, EN e IT', async () => {
  const { politica } = await giroDi({ finestraTokenFn: () => 128_000, fonteFinestraFn: () => 'prudente' });
  const { valutaSogliaContesto } = await import('../frontend/src/components/compattazione-legacy.js');
  const { impostaLingua, t: traduci } = await import('../frontend/src/components/lingua.js');
  try {
    for (const lingua of ['en', 'it']) {
      impostaLingua(lingua);
      const v = valutaSogliaContesto({ tokenMisurati: 90_000, soglia: politica.triggerTokens, warningTokens: politica.warningTokens, source: politica.source, automatica: false });
      assert.equal(v.mostra, true);
      assert.equal(v.testo, traduci('chat.context.notice.windowUnverified', { n: lingua === 'en' ? '90,000' : '90.000', m: lingua === 'en' ? '96,000' : '96.000' }), `${lingua}: ${v.testo}`);
      assert.match(v.testo, lingua === 'en' ? /model window unverified/u : /finestra del modello non verificata/u);
    }
  } finally { impostaLingua('it'); }
});

/* ---------- punto 4: vince la persona, ma si avvisa ---------- */

test('SG2-06 (punto 4, owner 17:27 Q1): la memoria scritta vince sempre; sopra il catalogo la scelta lo dice col numero del catalogo, sotto no', async () => {
  const cataloghi = ripiego.creaFinestraDaiCataloghi({ openrouter: async () => ({ modelli: [{ id: DEEPSEEK, contextLength: 163_840 }] }) });
  const scritte = new Map([[DEEPSEEK, 200_000]]);
  const scelta = ripiego.creaSceltaDellaFinestra({ cataloghi, scrittaFn: (id) => scritte.get(id) ?? null });
  scelta(DEEPSEEK); await giri();
  assert.deepEqual(scelta(DEEPSEEK), { finestra: 200_000, fonte: 'persona', sopraIlCatalogo: 163_840 });
  scritte.set(DEEPSEEK, 65_536);
  assert.deepEqual(scelta(DEEPSEEK), { finestra: 65_536, fonte: 'persona' }, 'sotto il catalogo nessun avviso');
  assert.deepEqual(scelta.senzaLaPersona(DEEPSEEK), { finestra: 163_840, fonte: 'catalogo' }, 'quella che TALOS leggerebbe da sé');
  // e la politica del registro lo porta alla scheda Contesto
  const sopra = await giroDi({ finestraTokenFn: () => 200_000, fonteFinestraFn: () => ({ finestra: 200_000, fonte: 'persona', sopraIlCatalogo: 163_840 }) });
  assert.equal(sopra.politica.windowTokens, 200_000);
  assert.equal(sopra.politica.windowWrittenAboveCatalog, 163_840);
  assert.equal(Object.hasOwn(sopra.politica, 'windowUnknown'), false);
  const sotto = await giroDi({ finestraTokenFn: () => 65_536, fonteFinestraFn: () => ({ finestra: 65_536, fonte: 'persona' }) });
  assert.equal(Object.hasOwn(sotto.politica, 'windowWrittenAboveCatalog'), false);
});

/* ---------- punto 5: i bassi del revisore A ---------- */

test('SG2-07 (punto 5): rotta e catalogo hanno lo stesso tetto della persona; la rotta resta prima', () => {
  assert.deepEqual(ripiego.scegliFinestra({ dallaRotta: 1e12, dalCatalogo: 163_840 }), { finestra: 163_840, fonte: 'catalogo' });
  assert.deepEqual(ripiego.scegliFinestra({ dallaRotta: null, dalCatalogo: 1e15 }), { finestra: ripiego.FINESTRA_PRUDENTE, fonte: 'prudente' });
  assert.deepEqual(ripiego.scegliFinestra({ dallaRotta: 131_072, dalCatalogo: 163_840 }), { finestra: 131_072, fonte: 'rotta' });
  assert.deepEqual(ripiego.scegliFinestra({ dallaRotta: 10_000_000, dalCatalogo: 163_840 }), { finestra: 10_000_000, fonte: 'rotta' }, 'il tetto compreso');
});

test('SG2-08 (punto 5): la memoria di un modello locale si rifiuta con la frase; un id senza la forma di un modello si rifiuta; l\'esito dell\'attrezzo dice «ogni conversazione»', async (t) => {
  const dir = cartella(t, '08');
  const imp = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json'), avvisa: () => {} });
  for (const id of ['local:qwen3.5-9b', 'locale-ospite:lfm2.5']) {
    await assert.rejects(imp.scrivi({ finestreDeiModelli: { [id]: 65_536 } }), (e) => e.code === 'CTX_SETTINGS_INVALID' && /local model/iu.test(e.message) && /engine/iu.test(e.message), id);
  }
  await assert.rejects(imp.scrivi({ finestreDeiModelli: { gpt4: 65_536 } }), (e) => e.code === 'CTX_SETTINGS_INVALID' && /not a model id/u.test(e.message), 'un id senza fornitore né autore');
  const { creaFontiDelServer } = await import('../src/impostazioni/fonti-impostazioni.mjs');
  const { creaServizioImpostazioni } = await import('../src/impostazioni/servizio-impostazioni.mjs');
  const registro = { impostazioniCorrenti: (id) => (id === 's1' ? { modello: DEEPSEEK } : id === 's2' ? { modello: 'local:qwen3.5-9b' } : null) };
  const note = [];
  const s = creaServizioImpostazioni({ fonti: creaFontiDelServer({ impostazioniContesto: imp, registroFn: () => registro }), annotaPerIlModelloFn: (sessionId, testo) => { note.push(testo); } });
  /* la nota al modello di un cambio della persona (`servizio-impostazioni.mjs`, `dove`): la memoria vale per QUEL modello in ogni conversazione */
  await s.applicaDallaPersona({ sessionId: 's1', changes: [{ key: 'conversation.modelMemory', value: 131_072 }], origine: { tipo: 'pc' }, confermatoDa: 'finestra-pc' });
  assert.equal(note.length, 1);
  assert.doesNotMatch(note[0], /\(this conversation\)/u, note[0]);
  assert.match(note[0], /\(this model, in every conversation\)/u, note[0]);
  const fn = s.perLaSessione({ sessionId: 's1' });
  const elenco = (await fn('app_settings', { action: 'list', section: 'conversation' }, { fase: 'esegui' })).testo;
  assert.match(elenco, /Revision \d+/u);
  /* la revisione si rilegge prima di ogni cambio: ogni scrittura la fa avanzare */
  const revisione = async () => Number(/Revision (\d+)/u.exec((await fn('app_settings', { action: 'list', section: 'conversation' }, { fase: 'esegui' })).testo)?.[1]);
  const metti = async (valore, sessionId = 's1') => s.perLaSessione({ sessionId })('app_settings', { action: 'set', expected_revision: await revisione(), changes: [{ key: 'conversation.modelMemory', value: valore }] }, { fase: 'esegui', toolCallId: `c-${valore}` });
  assert.equal((await metti(163_840)).ok, true);
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), 163_840);
  const torna = await metti(null);
  assert.equal(torna.ok, true, JSON.stringify(torna));
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), null, 'null dall\'attrezzo torna automatica');
  const localeNo = await metti(65_536, 's2');
  assert.equal(localeNo.ok, false);
  assert.match(JSON.stringify(localeNo), /local model/iu);
});

/* ---------- punto 9: il primo giro dopo l'avvio non resta sulla misura prudente ---------- */

test('SG2-09 (punto 9, MEDIO 1 di C): con la finestra prudente il giro la RILEGGE prima di decidere; con una finestra nota il giro riceve ciò che riceveva', async () => {
  let fonte = 'prudente';
  let finestra = 128_000;
  const { alKernel } = await giroDi({ finestraTokenFn: () => finestra, fonteFinestraFn: () => fonte }, { modello: 'anthropic/claude-sonnet-5' });
  assert.equal(alKernel.finestraToken, 128_000, 'il giro parte con la prudente');
  assert.equal(typeof alKernel.finestraLocale?.attuale, 'function', 'e riceve la finestra da rileggere a ogni misura (`seguiLaFinestra` del kernel)');
  fonte = 'catalogo'; finestra = 1_000_000; // il catalogo arriva pochi millisecondi dopo
  assert.equal(alKernel.finestraLocale.attuale(), 1_000_000, 'la misura dopo legge la finestra del catalogo');
  assert.equal(await alKernel.finestraLocale.puoCrescere(), false, 'una finestra del cloud non si allarga');
  assert.equal((await alKernel.finestraLocale.cresci({ servono: 1 })).ok, false);
  const nota = await giroDi({ finestraTokenFn: () => 163_840, fonteFinestraFn: () => 'catalogo' });
  assert.equal(Object.hasOwn(nota.alKernel, 'finestraLocale'), false, 'finestra nota: niente cambia');
  const senza = await giroDi({ finestraTokenFn: () => 163_840 });
  assert.equal(Object.hasOwn(senza.alKernel, 'finestraLocale'), false, 'senza la fonte (CLI, telefono senza ospite): niente cambia');
});

/* ---------- punto 10 e 14: l'ingresso massimo del catalogo ---------- */

test('SG2-10 (punti 10 e 14, MEDIO 2 di C): un modello con l\'ingresso massimo più piccolo della finestra (OpenAI da 400.000, ingresso 272.000) usa l\'ingresso', async () => {
  const cataloghi = ripiego.creaFinestraDaiCataloghi({ diretto: async () => ({ modelli: [
    { id: 'openai:gpt-5', contextLength: 400_000, maxInputTokens: 272_000 },
    { id: 'openai:gpt-4.1', contextLength: 1_047_576, maxInputTokens: null },
    { id: 'openai:strano', contextLength: 128_000, maxInputTokens: 400_000 },
  ] }) });
  for (const id of ['openai:gpt-5', 'openai:gpt-4.1', 'openai:strano']) cataloghi.get(id);
  await giri();
  assert.equal(cataloghi.get('openai:gpt-5'), 272_000, 'l\'ingresso, non la finestra intera');
  assert.equal(cataloghi.get('openai:gpt-4.1'), 1_047_576, 'senza ingresso dichiarato, la finestra');
  assert.equal(cataloghi.get('openai:strano'), 128_000, 'un ingresso più grande della finestra non la allarga');
  const s = calcolaSoglie({ finestraToken: 272_000 });
  assert.ok(s.soglia < 272_000 && s.emergenza < 272_000, `si compatta prima del rifiuto: ${JSON.stringify(s)}`);
});

/* ---------- punto 12: il compattatore di prima prende il tetto del motore ---------- */

test('SG2-11 (punto 12, owner 17:47): Sonnet 5 a 1M col compattatore di prima compatta a 200.000, come il motore; il numero sta in un posto solo', async () => {
  assert.equal(typeof compattazione.finestraMassimaDelTetto, 'function', 'il tetto della finestra sta nel nucleo');
  const massima = compattazione.finestraMassimaDelTetto(compattazione.TETTO_TOKEN_DEFAULT);
  assert.equal(massima, 266_667);
  const s = calcolaSoglie({ finestraToken: 1_000_000 });
  assert.equal(s.soglia, 200_000, 'oggi 750.000');
  assert.equal(s.emergenza, Math.floor(massima * 0.9));
  assert.equal(s.finestraToken, 1_000_000, 'la finestra del modello resta quella vera');
  const motore = await resolveDesktopDefaultProfile({ provider: 'anthropic', model: 'claude-sonnet-5', finestraFn: () => 1_000_000, env: {} });
  assert.equal(motore.windowTokens, massima, 'il motore usa lo stesso numero');
  const { politica } = await giroDi({ finestraTokenFn: () => 1_000_000 }, { modello: 'anthropic/claude-sonnet-5' });
  assert.equal(politica.triggerTokens, 200_000);
  assert.equal(politica.windowTokens, 1_000_000);
  // sotto il tetto niente cambia (163.840 ⇒ 122.880), e un tetto scritto dall'installazione resta il suo
  assert.equal(calcolaSoglie({ finestraToken: 163_840 }).soglia, 122_880);
  assert.equal(calcolaSoglie({ finestraToken: 1_000_000, tettoToken: 500_000 }).soglia, 500_000);
});
