/*
 * ⛔ s76 (CLI, 15/10/2026) — il negozio delle automazioni su Windows, con altri processi che leggono gli stessi file.
 *  - `scrivi` scrive `<id>.json.<uuid>.tmp` e lo rinomina su `<id>.json`. Su Windows un handle aperto da un altro processo (un
 *    lettore, un antivirus, l'indicizzatore) fa fallire il rename con EPERM/EACCES/EBUSY: la fine del giro non si scrive e lo
 *    scheduler chiude il giro come `fallita`.
 *  - `leggi` rendeva `null` per QUALUNQUE errore: un handle altrui diventava «automazione che non esiste», e `chiudiGiro` usciva
 *    in silenzio senza scrivere la fine.
 *  Riferimento: graceful-fs 4.2.11 `polyfills.js:86-115` ritenta il rename su win32 per EACCES/EPERM/EBUSY fino a 60 s, con
 *  un'attesa che sale di 10 ms fino a 100. La CLI ha curato dal suo lato con un fsAdapter (10 s, solo win32, solo quei tre codici).
 *  Le prove usano un fs finto che lancia N volte e poi passa al fs vero: il difetto si riproduce in modo deterministico.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createAutomationStore } from '../src/automation-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const VERO = { mkdir, readFile, readdir, rm, writeFile, rename, appendFile };
const errore = (code) => Object.assign(new Error(`${code}: operation not permitted (finto)`), { code });
/** Un fs che fa fallire `quante` volte l'operazione `nome` (sui file `.json` della voce) con `code`, poi usa quello vero. */
function fsCheInciampa(nome, quante, code = 'EPERM', filtro = () => true) {
  const conti = { [nome]: 0 };
  const fs = { ...VERO, [nome]: async (...argomenti) => {
    if (filtro(...argomenti) && conti[nome] < quante) { conti[nome] += 1; throw errore(code); }
    return VERO[nome](...argomenti);
  } };
  return { fs, conti };
}
const nuovaVoce = { nome: 'Dipendenze', istruzioni: 'Controlla le dipendenze del progetto.', cartella: tmpdir(), pianificazione: { tipo: 'giornaliera', ora: '09:00' }, fusoOrario: 'Europe/Rome' };
function cartella(t) { const c = mkdtempSync(join(tmpdir(), 'talos-auto-win-')); t.after(() => rimuoviCartellaDiProva(c)); return c; }
const opzioniWindows = { piattaforma: 'win32', attendi: async () => {} };
const sulJson = (percorso) => String(percorso).endsWith('.json');

test('AUTO-WIN-01 — il rename di `scrivi` che inciampa tre volte in EPERM (un handle altrui) riesce: la fine del giro è scritta', async (t) => {
  const dir = cartella(t);
  const base = createAutomationStore({ cartella: dir });
  const voce = await base.crea(nuovaVoce);
  await base.apriGiro(voce.id, { runId: 'r1', sessionId: 's1' });
  const { fs, conti } = fsCheInciampa('rename', 3, 'EPERM', (_da, a) => sulJson(a));
  const store = createAutomationStore({ cartella: dir, fsAdapter: fs, ...opzioniWindows });
  await store.chiudiGiro(voce.id, 'r1', { esito: 'finita', riassunto: 'ok' });
  assert.equal(conti.rename, 3, 'premessa: il rename è inciampato tre volte');
  const dopo = JSON.parse(readFileSync(join(dir, `${voce.id}.json`), 'utf8'));
  assert.equal(dopo.giroInCorso, null, 'la voce è stata riscritta: il giro non è più in corso');
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), [], 'nessun temporaneo resta');
});

test('AUTO-WIN-02 — `leggi` con un EPERM transitorio: ritenta e rende la voce, non `null` («cancellata»)', async (t) => {
  const dir = cartella(t);
  const voce = await createAutomationStore({ cartella: dir }).crea(nuovaVoce);
  const { fs, conti } = fsCheInciampa('readFile', 2, 'EBUSY', sulJson);
  const letta = await createAutomationStore({ cartella: dir, fsAdapter: fs, ...opzioniWindows }).leggi(voce.id);
  assert.equal(letta?.id, voce.id, 'a transient EBUSY made the automation look deleted');
  assert.equal(conti.readFile, 2, 'premessa: la lettura è inciampata due volte');
});

test('AUTO-WIN-03 — `chiudiGiro` con una lettura che inciampa: la riga «fine» arriva nello storico (prima usciva con null, in silenzio)', async (t) => {
  const dir = cartella(t);
  const base = createAutomationStore({ cartella: dir });
  const voce = await base.crea(nuovaVoce);
  await base.apriGiro(voce.id, { runId: 'r1', sessionId: 's1' });
  const { fs } = fsCheInciampa('readFile', 1, 'EPERM', sulJson);
  const esito = await createAutomationStore({ cartella: dir, fsAdapter: fs, ...opzioniWindows }).chiudiGiro(voce.id, 'r1', { esito: 'finita' });
  assert.ok(esito, 'chiudiGiro returned null: the end of the run was never written');
  const righe = readFileSync(join(dir, `${voce.id}.runs.jsonl`), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
  assert.ok(righe.some((r) => r.runId === 'r1' && r.evento === 'fine' && r.esito === 'finita'), 'nessuna riga «fine» nello storico');
});

test('AUTO-WIN-04 — lo storico (appendFile) che inciampa in EACCES: la riga arriva', async (t) => {
  const dir = cartella(t);
  const base = createAutomationStore({ cartella: dir });
  const voce = await base.crea(nuovaVoce);
  const { fs, conti } = fsCheInciampa('appendFile', 2, 'EACCES');
  await createAutomationStore({ cartella: dir, fsAdapter: fs, ...opzioniWindows }).apriGiro(voce.id, { runId: 'r1', sessionId: 's1' });
  assert.equal(conti.appendFile, 2);
  assert.match(readFileSync(join(dir, `${voce.id}.runs.jsonl`), 'utf8'), /"evento":"partita"/u);
});

test('AUTO-WIN-05 AL CONTRARIO — file che non c\'è ⇒ null; fuori da Windows niente ritento; un errore che non passa ⇒ errore, mai null; il temporaneo si toglie', async (t) => {
  const dir = cartella(t);
  const voce = await createAutomationStore({ cartella: dir }).crea(nuovaVoce);
  /* ENOENT: «non c'è» resta null, senza ritentare */
  const assente = fsCheInciampa('readFile', 99, 'ENOENT', sulJson);
  assert.equal(await createAutomationStore({ cartella: dir, fsAdapter: assente.fs, ...opzioniWindows }).leggi('non-esiste'), null);
  assert.equal(assente.conti.readFile, 1, 'ENOENT non si ritenta');
  /* fuori da Windows: un EPERM è subito un errore, e non diventa null */
  const linux = fsCheInciampa('readFile', 1, 'EPERM', sulJson);
  await assert.rejects(createAutomationStore({ cartella: dir, fsAdapter: linux.fs, piattaforma: 'linux', attendi: async () => {} }).leggi(voce.id),
    (e) => e.code === 'AUTOMATION_STORE_READ_FAILED');
  assert.equal(linux.conti.readFile, 1, 'fuori da Windows non si ritenta');
  /* Windows, ma il blocco non passa entro il tempo: errore, e il temporaneo non resta */
  const sempre = fsCheInciampa('rename', Infinity, 'EPERM', (_da, a) => sulJson(a));
  const lento = createAutomationStore({ cartella: dir, fsAdapter: sempre.fs, piattaforma: 'win32', ritentoMs: 30 });
  await assert.rejects(lento.imposta(voce.id, false), (e) => e.code === 'EPERM');
  assert.ok(sempre.conti.rename > 1, 'ha ritentato');
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), [], 'nessun temporaneo resta');
  /* un codice che non è transitorio: nessun ritento */
  const altro = fsCheInciampa('rename', 1, 'EXDEV', (_da, a) => sulJson(a));
  await assert.rejects(createAutomationStore({ cartella: dir, fsAdapter: altro.fs, ...opzioniWindows }).imposta(voce.id, false), (e) => e.code === 'EXDEV');
  assert.equal(altro.conti.rename, 1);
  /* JSON rotto: resta null, come prima */
  assert.ok(existsSync(join(dir, `${voce.id}.json`)));
});
