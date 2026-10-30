/*
 * 27/10/2026 — le cure della revisione del blocco 10 sulle cartelle bloccate e sul lucchetto fra processi. Le prove del revisore
 * (REVISIONE-BLOCCO-10-2026-10-27, B3, B4, B7, B9, B10, C4), portate qui coi moduli VERI e cartelle vere.
 *   B-R3: una cartella DENTRO un blocco non si chiede (prima: «consentita» e un consenso appeso); la bloccata STESSA ha la sua frase.
 *   B-R4: la revoca scrive PRIMA i blocchi: a guasto un blocco in più, mai uno in meno.
 *   B-R5: il blocco guarda il percorso SALVATO: una bloccata sostituita da una giunzione non blocca in silenzio un'altra cartella.
 *   C-R1: in una cartella dove non si possono creare file il lucchetto lascia passare subito (prima: 10 s e «un'altra finestra»).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const D = 'dispositivo-A1';
function banco(t, { recenti = [], fs = undefined, ammesse = () => [] } = {}) {
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-bloc-rev10-')));
  t.after(() => {
    if (process.platform === 'win32') { try { execFileSync('C:/Windows/System32/icacls.exe', [radice, '/remove:d', userInfo().username, '/T', '/C', '/Q'], { stdio: 'ignore' }); } catch { /* niente */ } }
    rimuoviCartellaDiProva(radice);
  });
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync.native(p); };
  const dati = crea('dati');
  const sessionRegistry = { cartellePiuUsate: () => recenti.map((p, i) => ({ percorso: p(radice), conteggio: 1, ultimaVolta: new Date(Date.UTC(2026, 9, 27, 10) - i * 1000).toISOString() })) };
  const nuovo = () => creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry, cartelleAmmesse: ammesse(radice), cartelleEscluse: [dati], ...(fs ? { fs } : {}) });
  return { radice, crea, dati, cartelle: nuovo(), nuovo };
}
async function bloccaDocumenti(b) {
  const utenti = b.crea('Utenti'); const doc = b.crea('Utenti', 'Documenti');
  await b.cartelle.consentiInAnticipo(D, utenti);
  const { cartellaId } = await b.cartelle.consentiInAnticipo(D, doc);
  return { utenti, doc, cartellaId };
}

test('BLOC-R10-01 (B-R3) dal dispositivo, una sottocartella di una BLOCCATA: la richiesta si rifiuta FOLDER_BLOCKED, niente carta né consenso appeso', async (t) => {
  const b = banco(t, { recenti: [(r) => join(r, 'Utenti', 'Documenti', 'Progetto')] });
  const { cartellaId } = await bloccaDocumenti(b);
  const prog = b.crea('Utenti', 'Documenti', 'Progetto');
  assert.equal((await b.cartelle.revoca(D, cartellaId)).bloccata, true, 'premessa: bloccata');
  const riga = (await b.cartelle.elenco(D)).find((r) => r.nome === 'Progetto');
  await assert.rejects(b.cartelle.chiedi({ dispositivoId: D, nomeDispositivo: 'Pad', cartellaId: riga.cartellaId }), { code: 'FOLDER_BLOCKED' });
  assert.deepEqual(b.cartelle.inAttesa(), [], 'nessuna carta sul PC');
  assert.equal((await b.cartelle.consensiDi(D)).some((c) => c.nome === 'Progetto'), false, 'nessun consenso appeso');
  assert.equal(await b.cartelle.consentita(D, prog), false);
});

test('BLOC-R10-02 (B-R3) un blocco messo SOPRA mentre la carta aspetta: «Consenti» rifiuta FOLDER_BLOCKED invece di salvare un consenso appeso', async (t) => {
  const b = banco(t, { recenti: [(r) => join(r, 'Utenti', 'Documenti', 'Progetto')] });
  const { cartellaId } = await bloccaDocumenti(b);
  b.crea('Utenti', 'Documenti', 'Progetto');
  const riga = (await b.cartelle.elenco(D)).find((r) => r.nome === 'Progetto');
  const attesa = await b.cartelle.chiedi({ dispositivoId: D, nomeDispositivo: 'Pad', cartellaId: riga.cartellaId });
  await b.cartelle.revoca(D, cartellaId); // la persona revoca Documenti mentre la carta di Progetto aspetta
  await assert.rejects(b.cartelle.rispondi(attesa.richiestaId, 'consentita'), { code: 'FOLDER_BLOCKED' });
  assert.equal((await b.cartelle.consensiDi(D)).some((c) => c.nome === 'Progetto'), false);
});

test('BLOC-R10-03 (B-R3, uccide MB10-1) la bloccata STESSA: la carta porta «bloccata», e «Consenti» toglie il blocco (l\'ultima scelta vince)', async (t) => {
  const b = banco(t, { recenti: [(r) => join(r, 'Utenti', 'Documenti')] });
  const { cartellaId, doc } = await bloccaDocumenti(b);
  assert.equal((await b.cartelle.revoca(D, cartellaId)).bloccata, true);
  const riga = (await b.cartelle.elenco(D)).find((r) => r.nome === 'Documenti');
  const attesa = await b.cartelle.chiedi({ dispositivoId: D, nomeDispositivo: 'Pad', cartellaId: riga.cartellaId });
  assert.equal(b.cartelle.inAttesa()[0]?.bloccata, true, 'la carta lo dice');
  await b.cartelle.rispondi(attesa.richiestaId, 'consentita');
  assert.equal(await b.cartelle.consentita(D, doc), true);
  assert.equal((await b.cartelle.consensiDi(D)).some((c) => c.bloccata), false);
});

test('BLOC-R10-04 (B-R4) la revoca che deve bloccare, col file dei CONSENSI che non si scrive una volta: il blocco c\'è già, la sottocartella è chiusa', async (t) => {
  let fallisci = false;
  const fs = { ...fsp, rename: async (a, bb) => { if (fallisci && String(bb).endsWith('consensi.json')) { fallisci = false; throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' }); } return fsp.rename(a, bb); } };
  const b = banco(t, { fs });
  const { cartellaId } = await bloccaDocumenti(b);
  const sotto = b.crea('Utenti', 'Documenti', 'Sotto');
  await b.cartelle.consentiInAnticipo(D, sotto);
  fallisci = true;
  await assert.rejects(b.cartelle.revoca(D, cartellaId), { code: 'EPERM' });
  const blocchi = JSON.parse(readFileSync(join(b.dati, 'remoto', 'cartelle-bloccate.json'), 'utf8'));
  assert.equal(blocchi.dispositivi[D]?.length, 1, 'il blocco è sul disco PRIMA dei consensi');
  assert.equal(await b.nuovo().consentita(D, sotto), false, 'a guasto: un blocco in più, mai uno in meno');
});

test('BLOC-R10-05 (B-R4, al contrario) se a non scriversi è il file dei BLOCCHI, niente cambia: la revoca si può rifare', async (t) => {
  let fallisci = false;
  const fs = { ...fsp, rename: async (a, bb) => { if (fallisci && String(bb).endsWith('cartelle-bloccate.json')) { fallisci = false; throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); } return fsp.rename(a, bb); } };
  const b = banco(t, { fs });
  const { cartellaId } = await bloccaDocumenti(b);
  fallisci = true;
  await assert.rejects(b.cartelle.revoca(D, cartellaId), { code: 'EPERM' });
  const rifatta = await b.nuovo().revoca(D, cartellaId);
  assert.equal(rifatta.bloccata, true, 'la seconda revoca trova ancora il consenso e blocca');
});

test('BLOC-R10-06 (B-R5) la bloccata sostituita da una giunzione verso un\'ALTRA cartella consentita: l\'altra resta consentita (nessun blocco in silenzio)', async (t) => {
  const b = banco(t);
  const { cartellaId, doc } = await bloccaDocumenti(b);
  const altra = b.crea('Altra');
  await b.cartelle.consentiInAnticipo(D, altra);
  await b.cartelle.revoca(D, cartellaId);
  rimuoviCartellaDiProva(doc); symlinkSync(altra, doc, 'junction');
  assert.equal(await b.cartelle.consentita(D, altra), true, 'Altra resta consentita');
  /* il vecchio nome ora PORTA ad Altra, che è consentita: il blocco era sulla cartella vera di allora, non sul nome */
  assert.equal((await b.cartelle.consensiDi(D)).filter((c) => c.bloccata).length, 1, 'il blocco di allora resta in elenco, uno solo');
});

test('BLOC-R10-07 (uccide MB10-2) una cartella raggiungibile solo dall\'elenco esplicito (TALOS_HARNESS_UI_PROJECT_DIRS): revocata, diventa bloccata', async (t) => {
  const b = banco(t, { ammesse: (r) => [join(r, 'Lavoro')] });
  b.crea('Lavoro'); const sotto = b.crea('Lavoro', 'Segreta');
  const { cartellaId } = await b.cartelle.consentiInAnticipo(D, sotto);
  assert.equal((await b.cartelle.revoca(D, cartellaId)).bloccata, true);
  assert.equal(await b.cartelle.consentita(D, sotto), false);
});

test('BLOC-R10-08 (C-R1) cartella dei dati dove non si possono creare file: il lucchetto lascia passare SUBITO, mai «un\'altra finestra»', { skip: process.platform !== 'win32' && 'ACL di Windows' }, async (t) => {
  const b = banco(t);
  const x = b.crea('X');
  await b.cartelle.consentiInAnticipo(D, b.crea('Y'));
  execFileSync('C:/Windows/System32/icacls.exe', [join(b.dati, 'remoto'), '/deny', `${userInfo().username}:(WD,AD)`], { stdio: 'ignore' });
  t.after(() => { try { execFileSync('C:/Windows/System32/icacls.exe', [join(b.dati, 'remoto'), '/remove:d', userInfo().username], { stdio: 'ignore' }); } catch { /* niente */ } });
  const t0 = Date.now();
  let codice = null; try { await b.nuovo().consentiInAnticipo(D, x); } catch (e) { codice = e.code; }
  const ms = Date.now() - t0;
  assert.ok(ms < 2_000, `aspettato ${ms} ms`);
  assert.notEqual(codice, 'REMOTE_STORE_BUSY', 'la frase «un\'altra finestra» sarebbe falsa');
  assert.ok(!existsSync(join(b.dati, 'remoto', 'consensi.json.lock')));
});
