/*
 * R-34 parte 2, la PRESENZA dal telefono (forma del Mobile, OK di CLI e Performance, 30/10/2026): `TALOS_PRESENZA_DA_APP=1`, parte
 * ASSENTE, un «presente» scade dopo 60 s senza rinnovo (CLI), un corpo che non è un booleano è 400 e non cambia niente (Performance),
 * spenta la rotta è 404.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaPresenzaDaApp, DURATA_PRESENZA_MS } from '../src/presenza-da-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CARTA = { tipo: 'chiamata-dal-testo', semprePersona: true, toolCallId: 'daTesto-abc-1', nome: 'shell', argomenti: { comando: 'ls' } };

test('PRESENZA-01: parte assente; un «presente» vale 60 s; «assente» la spegne subito', () => {
  let ora = 1_000;
  const p = creaPresenzaDaApp({ adesso: () => ora });
  assert.equal(p.presente(), false, 'chiusa per difetto');
  assert.deepEqual(p.imposta(true), { presente: true });
  assert.equal(p.presente(), true);
  ora += DURATA_PRESENZA_MS - 1;
  assert.equal(p.presente(), true);
  ora += 2;
  assert.equal(p.presente(), false, 'senza rinnovo scade (l\'app uccisa non manda false)');
  p.imposta(true);
  p.imposta(false);
  assert.equal(p.presente(), false);
});

async function scena(t, presenza) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-presenza-'));
  const runs = [];
  const registry = createSessionRegistry({ promuoviDalTesto: true, cartellaStore,
    avviaSessioneFn: (input) => { runs.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    ...(presenza ? { personaPresenteFn: () => presenza.presente() } : {}) });
  t.after(async () => { await registry.chiudi?.(); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ } rimuoviCartellaDiProva(cartellaStore); });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const via = registry.iscriviti(sessionId, () => {}, 0, { capacita: 'chiamata-dal-testo' }); // un client capace collegato
  t.after(() => via());
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registry, presenzaDaApp: presenza ?? null }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(() => ok())));
  const manda = (corpo) => fetch(`http://127.0.0.1:${server.address().port}/api/v1/presence`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return { registry, sessionId, input: runs[0], manda };
}

test('PRESENZA-02 (Mobile): accesa e nessun segnale ⇒ nessuna-persona; true ⇒ la carta nasce; false ⇒ di nuovo nessuna-persona', { timeout: 5_000 }, async (t) => {
  const presenza = creaPresenzaDaApp();
  const { registry, sessionId, input, manda } = await scena(t, presenza);
  assert.deepEqual(await input.chiediApprovazioneFn(CARTA), { nessunaPersona: true, motivo: 'nessuna-persona' });
  assert.equal((await manda({ presente: true })).status, 200);
  const domanda = input.chiediApprovazioneFn(CARTA);
  await new Promise((r) => setTimeout(r, 10));
  const vista = registry.domandaInAttesa(sessionId, { capacita: 'chiamata-dal-testo' });
  assert.equal(vista?.azione?.semprePersona, true, 'con la persona davanti la carta c\'è');
  registry.rispondiApprovazione(sessionId, vista.requestId, false);
  await domanda;
  assert.equal((await manda({ presente: false })).status, 200);
  assert.deepEqual(await input.chiediApprovazioneFn(CARTA), { nessunaPersona: true, motivo: 'nessuna-persona' });
});

test('PRESENZA-03 (Performance): un «presente» che non è booleano è 400 e lo stato resta com\'era', { timeout: 5_000 }, async (t) => {
  const presenza = creaPresenzaDaApp();
  const { manda } = await scena(t, presenza);
  for (const corpo of [{ presente: 'true' }, { presente: 1 }, {}, { presente: true, altro: 1 }]) {
    assert.equal((await manda(corpo)).status, 400, JSON.stringify(corpo));
    assert.equal(presenza.presente(), false, `lo stato non cambia con ${JSON.stringify(corpo)}`);
  }
});

test('PRESENZA-04 AL CONTRARIO: spenta, la rotta è 404 e la porta del registro non c\'è', { timeout: 5_000 }, async (t) => {
  const { manda, input } = await scena(t, null);
  assert.equal((await manda({ presente: true })).status, 404);
  assert.equal(input.personaPresenteFn(), true, 'senza presenza dall\'app decide solo il client capace collegato, come sul desktop');
});
