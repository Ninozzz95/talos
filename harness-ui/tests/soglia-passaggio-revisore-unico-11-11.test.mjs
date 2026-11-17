/*
 * 11/11/2026 — passaggio dopo il revisore unico della soglia (GIALLO, giudice v1541; brief `BRIEF-AGENTE-SOGLIA-200K-E-SCRITTA-245-2026-11-11.md`,
 * sezione «Passaggio dopo il revisore unico», punti 3, 4 e 7; rapporto `RAPPORTO-REVISORE-SOGLIA-GIRO-DOPO-I-REVISORI-2026-11-11.md`).
 * Nate ROSSE sulla testa `ea437f67b` (le SG3-R* sono i mutanti vivi del revisore: rosse col mutante, verdi senza).
 * Fonti: Codex `models-manager/src/model_info.rs:20-26` (la finestra efficace è il minimo fra quella del modello e il tetto, e si usa quella);
 *   Hermes `agent/model_metadata.py:2219` (la memoria scritta vince); Claude Code `CHANGELOG.md:1709` (la finestra salvata per modello).
 */
import assert from 'node:assert/strict';
import { createServer as creaServerTcp } from 'node:net';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { createImpostazioniContesto } from '../src/impostazioni-contesto.mjs';
import * as ripiego from '../src/finestra-di-ripiego.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const DEEPSEEK = 'deepseek/deepseek-v3.2';
const giri = async (n = 5) => { for (let i = 0; i < n; i += 1) await new Promise((r) => { setImmediate(r); }); };
const cartella = (t, nome) => { const d = mkdtempSync(join(tmpdir(), `talos-sg3-${nome}-`)); t.after(() => rimuoviCartellaDiProva(d)); return d; };

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'c' } };
}
async function politicaDi(opzioni, modello = 'anthropic/claude-sonnet-5') {
  let partito = false;
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async () => { partito = true; return { comeFinita: 'concluso', messaggiFinali: [] }; } }),
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello, chiave: 'k', ...opzioni });
  const { sessionId } = registro.avvia('task-vero');
  const fine = Date.now() + 10_000;
  while (!partito && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); });
  const p = registro.politicaCompattazione(sessionId);
  registro.ferma?.(sessionId);
  return p;
}

/* ---------- punto 4: il telefono di oggi scrive il vero sopra il tetto del motore, senza toccare il telefono ---------- */

test('SG3-01 (punto 4): sopra il tetto del motore (1M, 400k, 272k) la politica dice `explicit-cap` + `engineCeiling`; sotto resta `route-minimum`', async () => {
  const prima = { ...process.env };
  delete process.env.TALOS_COMPACTION_TOKEN_CAP;
  try {
    assert.equal(compattazione.finestraMassimaDelTetto(), 266_667, 'il tetto del motore in finestra: 200.000 / 0,75');
    for (const finestra of [1_000_000, 400_000, 272_000]) {
      const p = await politicaDi({ finestraTokenFn: () => finestra, fonteFinestraFn: () => 'catalogo' });
      /* il pannello del telefono di oggi (`pannelloR4.ts:101`, Talos-Mobile `beac3dc9f`) con `explicit-cap` scrive «Cap set for this
         installation: TALOS compacts above 200k.»: vero. Con `route-minimum` scriveva «75% of the model window (1,000k)»: falso. */
      assert.equal(p.source, 'explicit-cap', `${finestra}: ${JSON.stringify(p)}`);
      assert.equal(p.engineCeiling, true);
      assert.equal(p.triggerTokens, 200_000, 'le soglie non cambiano');
      assert.equal(p.emergencyTokens, 240_000);
      assert.equal(p.windowTokens, finestra, 'la finestra del modello resta quella vera');
    }
    for (const finestra of [262_144, 163_840]) {
      const p = await politicaDi({ finestraTokenFn: () => finestra, fonteFinestraFn: () => 'catalogo' });
      assert.equal(p.source, 'route-minimum', `${finestra}: al contrario, sotto il tetto il 75% è vero`);
      assert.equal(Object.hasOwn(p, 'engineCeiling'), false);
      assert.equal(p.triggerTokens, Math.floor(finestra * 0.75));
    }
    const prudente = await politicaDi({ finestraTokenFn: () => 128_000, fonteFinestraFn: () => 'prudente' }, 'acme/mai-visto');
    assert.equal(prudente.source, 'fallback', 'la finestra prudente resta un ripiego');
  } finally { process.env = prima; }
});

test('SG3-02 (punto 3, foto 7): una memoria scritta, anche sotto il catalogo, la politica la dice scritta (`windowWritten`)', async () => {
  const sotto = await politicaDi({ finestraTokenFn: () => 65_536, fonteFinestraFn: () => ({ finestra: 65_536, fonte: 'persona' }) }, DEEPSEEK);
  assert.equal(sotto.windowWritten, true);
  assert.equal(sotto.source, 'route-minimum');
  assert.equal(Object.hasOwn(sotto, 'windowWrittenAboveCatalog'), false);
  const letta = await politicaDi({ finestraTokenFn: () => 163_840, fonteFinestraFn: () => ({ finestra: 163_840, fonte: 'catalogo' }) }, DEEPSEEK);
  assert.equal(Object.hasOwn(letta, 'windowWritten'), false, 'al contrario: letta dal catalogo, niente «scritta»');
});

/* ---------- punto 7: i mutanti vivi del revisore (R3, R5, R7, R9; R4 sta nella prova del frontend) ---------- */

test('SG3-R3 (punto 7): il file delle memorie si legge UNA volta per processo; una scelta dopo non lo rilegge', async (t) => {
  const dir = cartella(t, 'r3');
  const file = join(dir, 'context', 'impostazioni-contesto.json');
  const memorie = join(dir, 'context', 'finestre-dei-modelli.json');
  mkdirSync(join(dir, 'context'), { recursive: true });
  writeFileSync(memorie, JSON.stringify({ schema: 'talos.model-windows.v1', finestreDeiModelli: { [DEEPSEEK]: 163_840 } }));
  const imp = createImpostazioniContesto({ file, avvisa: () => {} });
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), 163_840);
  rmSync(memorie); // se la scelta rileggesse il disco, ora non troverebbe più niente
  assert.equal(existsSync(memorie), false);
  for (let i = 0; i < 3; i += 1) assert.equal(imp.finestraScrittaPer(DEEPSEEK), 163_840, `scelta ${i}: dalla copia in memoria`);
});

test('SG3-R5 (punto 7): la rotta della memoria in uso accetta SOLO `model`; un parametro in più è una domanda sbagliata', async (t) => {
  const dir = cartella(t, 'r5');
  const impostazioniContesto = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json'), avvisa: () => {} });
  const server = createServer(createHttpApp({ senzaGettone: 'prove', impostazioniContesto, sessionRegistry: { catenaDelleImpostazioni: () => [] },
    finestraDelModelloFn: (id) => ({ modello: id, finestra: 163_840, fonte: 'catalogo', letta: { finestra: 163_840, fonte: 'catalogo' } }) }));
  const fascia = /^(\d+)-(\d+)$/u.exec(process.env.TALOS_PROVE_PORTE ?? '');
  let porta = 0;
  if (fascia) {
    for (let p = Number(fascia[1]); p <= Number(fascia[2]) && !porta; p += 1) {
      const s = creaServerTcp();
      if (await new Promise((r) => { s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => r(true)); })) { await new Promise((r) => { s.close(r); }); porta = p; }
    }
  }
  await new Promise((r) => { server.listen(porta, '127.0.0.1', r); });
  t.after(() => new Promise((r) => { server.close(r); }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/context-settings/model-window`;
  assert.equal((await fetch(`${base}?model=${encodeURIComponent(DEEPSEEK)}`)).status, 200);
  assert.equal((await fetch(`${base}?model=${encodeURIComponent(DEEPSEEK)}&extra=1`)).status, 400);
  assert.equal((await fetch(`${base}?modello=${encodeURIComponent(DEEPSEEK)}`)).status, 400);
});

test('SG3-R7 (punto 7): una memoria nella forma provvisoria (dentro il file delle impostazioni) si legge ancora', async (t) => {
  const dir = cartella(t, 'r7');
  const file = join(dir, 'context', 'impostazioni-contesto.json');
  mkdirSync(join(dir, 'context'), { recursive: true });
  writeFileSync(file, JSON.stringify({ schema: 'talos.context-settings.v1', motore: 'legacy', finestreDeiModelli: { [DEEPSEEK]: 131_072 } }));
  const avvisi = [];
  const imp = createImpostazioniContesto({ file, avvisa: (m) => avvisi.push(m) });
  assert.equal(imp.finestraScrittaPer(DEEPSEEK), 131_072);
  assert.equal(imp.motorePerUnaConversazioneNuova(), 'legacy', 'e il resto del file resta');
  assert.deepEqual(avvisi, []);
  assert.equal(readFileSync(file, 'utf8').includes('131072'), true, 'leggere non riscrive il file');
});

test('SG3-R9 (punto 7): «più grande del catalogo» solo contro una finestra LETTA, mai contro la misura prudente', async () => {
  const cataloghi = ripiego.creaFinestraDaiCataloghi({ openrouter: async () => ({ modelli: [] }) });
  const scelta = ripiego.creaSceltaDellaFinestra({ cataloghi, scrittaFn: (id) => (id === 'acme/mai-visto' ? 200_000 : null) });
  scelta('acme/mai-visto'); await giri();
  assert.deepEqual(scelta('acme/mai-visto'), { finestra: 200_000, fonte: 'persona' });
  assert.deepEqual(ripiego.scegliFinestra({ dallaRotta: null, dalCatalogo: null, scritta: 200_000 }), { finestra: 200_000, fonte: 'persona' });
});
