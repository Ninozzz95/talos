/*
 * Richiesta della CLI, 16/10/2026 notte — IL FULL ACCESS DELL'OSPITE. La CLI manda al kernel sempre «On request» e applica Full access
 * da sé (F-P-001), e il modo cambia a sessione aperta (Shift+Tab). La cura di SEG-DOC-REV-01 (`document_create` non scrive un segreto
 * fuori da Full access) guardava solo `livelloAccesso`: nella CLI in Full access avrebbe rifiutato, contro la regola dell'owner
 * («Full access non chiede mai», 12/10). `accessoPienoDellOspite: (voce) => boolean` del registro, chiesta nel momento in cui
 * `onDocumento` decide, con `{ sessionId, radiceId }`. Ogni caso anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avviaSessione } from '../src/agent-service.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function kernelFinto(documenti) {
  return async (input) => {
    for (const d of documenti) d.esito = await input.onDocumento?.(d.argomenti);
    return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} };
  };
}

async function accoda(t, opzioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'ospite-pieno-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'credentials.json'), '{"a":1}\n');
  const documenti = [{ argomenti: { format: 'json', title: 'credentials', body: '{"b":2}', mode: 'append' } }];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: kernelFinto(documenti),
    salvaVoceLibreriaFn: async () => ({ id: 'lib-finto' }), livelloAccesso: 'su-richiesta', ...opzioni });
  return { esito: documenti[0].esito, file: readFileSync(join(cartella, 'credentials.json'), 'utf8') };
}

/* Il registro: la funzione dell'ospite riceve { sessionId, radiceId }, una figlia la radice della madre, e una funzione che lancia vale «no». */
function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    giri,
  };
}


test('OSPITE-RI-01 — una figlia di una figlia: la radice che arriva all ospite è la conversazione principale', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'ospite-ri-'));
  const visti = [];
  const finti = giriFinti();
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'delega' } }),
    avviaSessioneFn: finti.avviaSessioneFn,
    accessoPienoDellOspite: (voce) => { visti.push(voce); return true; },
  });
  t.after(async () => {
    for (const g of finti.giri) { g.input.onEvento({ type: 'RunFinished' }); g.risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } }); }
    await registro.chiudi?.({ attesaMassimaMs: 1_000 });
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const madre = finti.giri[0].input;
  await madre.onDelega('figlia: delega ancora', cartellaStore);
  const figliaGiro = finti.giri[1]?.input;
  assert.ok(figliaGiro?.onDelega, 'premessa: la figlia può delegare');
  await figliaGiro.onDelega('nipote: scrivi un file', cartellaStore);
  const nipoteGiro = finti.giri[2]?.input;
  assert.ok(nipoteGiro, 'premessa: la nipote è partita');
  nipoteGiro.accessoPienoDellOspite();
  assert.equal(visti.at(-1).radiceId, sessionId, `la nipote riceve come radice ${visti.at(-1).radiceId}, non la principale ${sessionId}`);
});

test('OSPITE-RI-02 — il modo cambia fra due document_create dello stesso giro: la seconda segue il modo NUOVO', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'ospite-ri-modo-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'credentials.json'), '{"a":1}\n');
  let pieno = false;
  const documenti = [
    { argomenti: { format: 'json', title: 'credentials', body: '{"b":2}', mode: 'append' } },
    { argomenti: { format: 'json', title: 'credentials', body: '{"c":3}', mode: 'append' } },
  ];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, livelloAccesso: 'su-richiesta',
    accessoPienoDellOspite: () => pieno,
    talosLavoraFn: async (input) => {
      documenti[0].esito = await input.onDocumento(documenti[0].argomenti);
      pieno = true; // Shift+Tab a metà giro
      documenti[1].esito = await input.onDocumento(documenti[1].argomenti);
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} };
    },
    salvaVoceLibreriaFn: async () => ({ id: 'lib-finto' }) });
  assert.equal(documenti[0].esito?.ok, false, 'prima del cambio: rifiutato');
  assert.equal(documenti[1].esito?.ok, true, 'dopo il cambio: scritto');
});
