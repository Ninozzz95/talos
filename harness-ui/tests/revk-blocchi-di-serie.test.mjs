/*
 * Revisione K (04/11/2026) delle decisioni 139 e 140: prove proposte per i mutanti sopravvissuti (K1, K3, K4, K10). Verdi sul codice
 * del commit 803a748a3, rosse sul mutante corrispondente. Solo nella cartella copiata, mai nel worktree.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { blocchiViviAllaNascita, catalogoBlocchiDaAmbiente } from '../src/blocchi/prompt-del-catalogo.mjs';
import { createImpostazioniChat } from '../src/impostazioni-chat.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function finche(condizione, tetto = 5_000) {
  const fine = Date.now() + tetto;
  while (!condizione()) {
    if (Date.now() > fine) throw new Error('condizione mai vera');
    await new Promise((f) => setTimeout(f, 10));
  }
}
function registroAComando(cartellaStore, opzioni = {}) {
  const giri = [];
  const r = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    cartelleProgetto: [], preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const fineGiro = new Promise((ok) => { risolvi = ok; });
      const i = giri.length;
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` });
      return fineGiro;
    },
    ...opzioni,
  });
  const fine = (i) => {
    giri[i].input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` });
    giri[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ok' }] } });
  };
  const chiudiTutto = async () => { for (let i = 0; i < giri.length; i += 1) { try { fine(i); } catch { /* già chiuso */ } } await r.chiudi?.({ attesaMassimaMs: 2_000 }).catch(() => {}); };
  return { r, giri, fine, chiudiTutto };
}
const haIlCatalogo = (giro) => Object.hasOwn(giro.input, 'catalogoBlocchi');

test('REVK-01 (K1) un salvataggio che fallisce sul disco non cambia la scelta in memoria: le conversazioni nuove seguono ancora la vecchia', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revk-chat-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  writeFileSync(join(dir, 'blocco'), 'un file al posto della cartella');
  const a = createImpostazioniChat({ file: join(dir, 'blocco', 'impostazioni-chat.json'), avvisa: () => {} });
  assert.equal(a.blocchiViviPerUnaConversazioneNuova(), true);
  /* l'errore vero del disco: la cartella del file è un file e mkdir lo dice (EEXIST, misurato su Windows; ENOTDIR se lo è un antenato) */
  await assert.rejects(() => a.scrivi({ blocchiVivi: false }), { code: /^(?:EEXIST|ENOTDIR)$/u, syscall: 'mkdir' });
  assert.equal(a.blocchiViviPerUnaConversazioneNuova(), true, 'la risposta dice «non salvato»: la nascita non deve vedere il valore non salvato');
  assert.deepEqual(await a.leggi(), { blocchiVivi: true });
});

test('REVK-02 (K3) GET /api/v1/chat-settings con una query è 400 come le sorelle', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revk-chat-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const server = http.createServer(createHttpApp({ senzaGettone: 'prove', impostazioniChat: createImpostazioniChat({ file: join(dir, 'c.json') }) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/chat-settings?x=1`);
  assert.equal(r.status, 400);
});

test('REVK-03 (K4) una funzione dell\'ospite che lancia alla nascita: la conversazione nasce SENZA catalogo (mai un prefisso diverso per sbaglio)', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'revk-lancia-'));
  const b = registroAComando(cartellaStore, { catalogoBlocchi: catalogoBlocchiDaAmbiente({}), blocchiViviPerNuoveFn: () => { throw new Error('guasto'); } });
  t.after(async () => { await b.chiudiTutto(); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ } rimuoviCartellaDiProva(cartellaStore); });
  b.r.avvia('task');
  await finche(() => b.giri.length === 1);
  assert.equal(haIlCatalogo(b.giri[0]), false);
});

test('REVK-04 (K10) un ramo di una conversazione ACCESA eredita il timbro e non rilegge la preferenza, anche se nel frattempo è spenta', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'revk-ramo-'));
  let preferenza = true; let letture = 0;
  const b = registroAComando(cartellaStore, { catalogoBlocchi: catalogoBlocchiDaAmbiente({}), blocchiViviPerNuoveFn: blocchiViviAllaNascita(() => { letture += 1; return preferenza; }) });
  t.after(async () => { await b.chiudiTutto(); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ } rimuoviCartellaDiProva(cartellaStore); });
  const { sessionId } = b.r.avvia('task');
  await finche(() => b.giri.length === 1);
  assert.ok(haIlCatalogo(b.giri[0]));
  b.fine(0);
  await b.r.attendiAssestamento(sessionId);
  preferenza = false;
  const ramo = b.r.forka(sessionId);
  assert.ok(ramo.sessionId, JSON.stringify(ramo));
  await finche(() => b.giri.length === 2);
  assert.ok(haIlCatalogo(b.giri[1]), 'il ramo porta il prefisso del padre');
  assert.equal(letture, 1, 'un ramo non rilegge la preferenza');
});
