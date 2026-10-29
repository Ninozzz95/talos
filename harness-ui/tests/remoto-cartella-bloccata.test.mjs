/*
 * Owner 27/10/2026 sera — UNA CARTELLA REVOCATA CHE RESTA RAGGIUNGIBILE DIVENTA BLOCCATA: il nega vince, come in Claude Code
 * («Rules are evaluated in order: deny, then ask, then allow», code.claude.com/docs/en/permissions, letto il 27/10/2026).
 * Contratto: handoff `CONTRATTO-CARTELLE-BLOCCATE-2026-10-27.md`, tappa A (solo server). Chiude il `todo` REV-B8-C2.
 * Modulo VERO delle cartelle dei dispositivi, cartelle e giunzioni vere sotto TEMP, nessuna porta.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function ambiente(t) {
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-bloccata-')));
  const giunzioni = [];
  t.after(async () => { for (const g of giunzioni) { try { rmdirSync(g); } catch { /* già tolta */ } } await rimuoviCartellaDiProva(radice); });
  const dati = join(radice, 'dati');
  const fileConsensi = join(dati, 'remoto', 'consensi.json');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return p; };
  const giunzione = (verso, ...parti) => { const p = join(radice, ...parti); symlinkSync(verso, p, 'junction'); giunzioni.push(p); return p; };
  let ora = Date.parse('2026-10-27T20:00:00.000Z');
  const nuovo = (recenti = []) => creaCartelleDeiDispositivi({ fileConsensi, fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
    sessionRegistry: { cartellePiuUsate: () => recenti }, cartelleAmmesse: [], cartelleEscluse: [dati], clock: () => (ora += 1000) });
  return { radice, crea, giunzione, nuovo, fileConsensi, fileBloccate: join(dati, 'remoto', 'cartelle-bloccate.json') };
}
const revocaPerPercorso = async (c, percorso) => c.revoca('disp', (await c.consensoDi('disp', percorso)).cartellaId);

test('BLOCCATA-01 (REV-B8-C2) Y diventata una giunzione verso X: revocare Y blocca anche X, che è la stessa cartella, e lo dice', async (t) => {
  const a = ambiente(t);
  const x = a.crea('X'); const y = a.crea('Y');
  const c = a.nuovo();
  await c.consentiInAnticipo('disp', y); await c.consentiInAnticipo('disp', x);
  await rimuoviCartellaDiProva(y); a.giunzione(x, 'Y');
  const esito = await revocaPerPercorso(c, y);
  assert.equal(esito.revocata, true);
  assert.equal(esito.bloccata, true, 'still reachable through X: it becomes blocked');
  assert.equal(esito.tramite?.nome, 'X');
  assert.equal(esito.stessaCartella, true, 'Y and X are the same physical folder');
  assert.equal(await c.consentita('disp', y), false, 'the device can no longer work in «Y»');
  assert.equal(await c.consentita('disp', x), false, 'deny wins: X is the same folder, so X is blocked too');
});

test('BLOCCATA-02 Utenti e Utenti\\Documenti consentite: revocare Documenti la blocca, Utenti resta, l\'elenco del dispositivo la mostra bloccata', async (t) => {
  const a = ambiente(t);
  const u = a.crea('Utenti'); const d = a.crea('Utenti', 'Documenti');
  /* ⛔ mutante sopravvissuto: i consensi valgono per la cartella esatta, quindi il «dentro» conta solo per una sottocartella col suo
     consenso. Il nega vince anche su di lei (Claude Code: la specificità non cambia l'ordine). */
  const sotto = a.crea('Utenti', 'Documenti', 'sotto');
  const c = a.nuovo([{ percorso: d, ultimaVolta: '2026-10-27T19:00:00.000Z' }]);
  await c.consentiInAnticipo('disp', u); await c.consentiInAnticipo('disp', d); await c.consentiInAnticipo('disp', sotto);
  const esito = await revocaPerPercorso(c, d);
  assert.deepEqual({ bloccata: esito.bloccata, tramite: esito.tramite?.nome, stessa: esito.stessaCartella }, { bloccata: true, tramite: 'Utenti', stessa: false });
  assert.equal(await c.consentita('disp', d), false);
  assert.equal(await c.consentita('disp', sotto), false, 'a subfolder allowed on its own is blocked too: deny wins');
  /* e consentirla adesso non risponde «consentita»: dice quale blocco toglie prima */
  await assert.rejects(c.consentiInAnticipo('disp', a.crea('Utenti', 'Documenti', 'altra')), (e) => e.code === 'FOLDER_BLOCKED' && e.cartellaBloccata?.nome === 'Documenti');
  assert.equal(await c.consentita('disp', a.crea('Utenti', 'Altro')), false, 'a sibling was never allowed by itself (consents are per folder)');
  assert.equal(await c.consentita('disp', u), true, 'the parent stays allowed (its files inside Documenti are step B, the kernel)');
  const riga = (await c.elenco('disp')).find((r) => r.nome === 'Documenti');
  assert.deepEqual({ consentita: riga?.consentita, bloccata: riga?.bloccata }, { consentita: false, bloccata: true });
  const consensi = await c.consensiDi('disp');
  assert.deepEqual(consensi.filter((v) => v.bloccata).map((v) => v.nome), ['Documenti'], 'the PC window sees the block');
});

test('BLOCCATA-03 una cartella che nessun altro consenso raggiunge si revoca e basta: nessun blocco', async (t) => {
  const a = ambiente(t);
  const p = a.crea('Progetto'); const altra = a.crea('Altra');
  const c = a.nuovo();
  await c.consentiInAnticipo('disp', p); await c.consentiInAnticipo('disp', altra);
  const esito = await revocaPerPercorso(c, p);
  assert.deepEqual(esito, { revocata: true }, 'the answer keeps its old shape when nothing is blocked');
  assert.equal((await c.consensiDi('disp')).some((v) => v.bloccata), false);
  assert.equal(await c.consentita('disp', p), false);
  assert.equal(await c.consentita('disp', altra), true);
});

test('BLOCCATA-04 consentire di nuovo toglie il blocco (vince l\'ultima scelta della persona); «sblocca» toglie solo il blocco; dimenticare toglie tutto', async (t) => {
  const a = ambiente(t);
  const u = a.crea('Utenti'); const d = a.crea('Utenti', 'Documenti');
  const c = a.nuovo();
  await c.consentiInAnticipo('disp', u); await c.consentiInAnticipo('disp', d);
  const { tramite } = await revocaPerPercorso(c, d);
  assert.ok(tramite);
  await c.consentiInAnticipo('disp', d);
  assert.equal(await c.consentita('disp', d), true, 'allowed again');
  assert.equal((await c.consensiDi('disp')).some((v) => v.bloccata), false);
  await revocaPerPercorso(c, d);
  const blocco = (await c.consensiDi('disp')).find((v) => v.bloccata);
  assert.deepEqual(await c.sblocca('disp', blocco.cartellaId), { sbloccata: true });
  assert.equal(await c.consentita('disp', d), false, 'unblocked is not allowed: the consent was revoked');
  await assert.rejects(c.sblocca('disp', blocco.cartellaId), { code: 'NOT_FOUND' });
  await revocaPerPercorso(c, u).catch(() => {});
  await c.consentiInAnticipo('disp', u); await c.consentiInAnticipo('disp', d); await revocaPerPercorso(c, d);
  assert.deepEqual(await c.dimentica('disp'), { dimenticato: true });
  assert.deepEqual(await c.consensiDi('disp'), []);
});

test('BLOCCATA-05 il blocco sta in un file suo (uno scrittore vecchio dei consensi non lo cancella), regge al riavvio, e una chiave sconosciuta dei consensi non si perde', async (t) => {
  const a = ambiente(t);
  const u = a.crea('Utenti'); const d = a.crea('Utenti', 'Documenti');
  const c = a.nuovo();
  await c.consentiInAnticipo('disp', u); await c.consentiInAnticipo('disp', d);
  await revocaPerPercorso(c, d);
  const scritto = JSON.parse(readFileSync(a.fileConsensi, 'utf8'));
  assert.equal(scritto.bloccate, undefined, 'never in consensi.json: an older writer would drop it');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(a.fileBloccate, 'utf8')).dispositivi), ['disp'], 'in its own file, as the contract says');
  /* uno scrittore vecchio riscrive consensi.json con le sole chiavi che conosce: il blocco resta */
  writeFileSync(a.fileConsensi, JSON.stringify({ v: scritto.v, dispositivi: scritto.dispositivi, futuro: { x: 1 } }));
  const dopo = a.nuovo();
  assert.equal(await dopo.consentita('disp', d), false, 'blocked after a restart');
  await dopo.consentiInAnticipo('disp', a.crea('Nuova'));
  assert.deepEqual(JSON.parse(readFileSync(a.fileConsensi, 'utf8')).futuro, { x: 1 }, 'an unknown key survives our write');
});

test('BLOCCATA-06 un file dei blocchi storto non si legge come «nessun blocco»: si dice, come per i consensi', async (t) => {
  const a = ambiente(t);
  a.crea('dati', 'remoto');
  writeFileSync(a.fileBloccate, JSON.stringify({ v: 1, dispositivi: { disp: [{ percorso: 42 }] } }));
  const c = a.nuovo();
  await assert.rejects(c.consentita('disp', a.crea('Qualunque')), { code: 'REMOTE_CONSENTS_UNREADABLE' });
});
