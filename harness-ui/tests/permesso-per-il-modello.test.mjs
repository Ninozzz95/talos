/*
 * Richiesta CLI 15/10/2026 — `permessoPerIlModello`: la riga «Turn permission» del preambolo dice il modo che l'ospite applica davvero
 * (la CLI manda sempre «On request» e applica il suo modo da sé; in accesso pieno il modello leggeva «On request» e rinunciava).
 * Solo la riga del preambolo e la sua chiave; `RunStarted.contesto` resta su `permessi`; assente ⇒ identico a prima.
 * Codex: `prompts/src/permissions_instructions.rs:88` («Developer fragment describing the active sandbox and approval policy»).
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avviaSessione, rigaDelPermessoPerIlModello } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BASE = { cartella: '/tmp/x', task: { consegna: 'fai' }, modello: 'm', chiave: 'k', creaFiltroGitignoreFn: async () => null };
async function giro(extra) {
  const preamboli = [];
  const eventi = [];
  await avviaSessione({
    ...BASE, ...extra,
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: async () => ({ comeFinita: 'concluso', detto: 'fatto' }),
    contestoDelProgettoFn: async (opzioni) => { preamboli.push(opzioni); return { testo: 'x' }; },
  });
  return { permesso: preamboli[0]?.permesso, runStarted: eventi.find((e) => e.type === 'RunStarted') };
}

test('PERM-MOD-01 — l\'ospite dice al modello il modo vero; la UI resta sull\'etichetta di `permessi`', async () => {
  const { permesso, runStarted } = await giro({ permessi: 'On request', permessoPerIlModello: 'Full access (TALOS asks the person only before secret files)' });
  assert.equal(permesso, 'Full access (TALOS asks the person only before secret files)');
  assert.match(JSON.stringify(runStarted), /On request/u, 'RunStarted.contesto resta su `permessi`');
  assert.doesNotMatch(JSON.stringify(runStarted), /Full access/u);
});

test('PERM-MOD-02 AL CONTRARIO — assente, vuoto, solo spazi o non stringa: vale `permessi`, come prima', async () => {
  for (const permessoPerIlModello of [undefined, null, '', '   \n ', 42]) {
    const { permesso } = await giro({ permessi: 'On request', ...(permessoPerIlModello === undefined ? {} : { permessoPerIlModello }) });
    assert.equal(permesso, 'On request', JSON.stringify(permessoPerIlModello));
  }
});

test('PERM-MOD-03 — una riga sola, entro 200 caratteri: un a capo non apre una riga nuova nella scheda', () => {
  assert.equal(rigaDelPermessoPerIlModello('Ask before\nedits'), 'Ask before edits');
  assert.equal([...rigaDelPermessoPerIlModello('x'.repeat(300))].length, 200);
});

test('PERM-MOD-04 — sul registro vero: una stringa o una funzione della sessione arriva all\'agent-service; una funzione che lancia non ferma il giro', async (t) => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const { attendiScritture } = await import('../src/session-store.mjs');
  for (const [nome, valore, atteso] of [
    ['stringa', 'Ask before edits', 'Ask before edits'],
    ['funzione', (voce) => `mode of ${voce.taskId}`, 'mode of task'],
    ['funzione che lancia', () => { throw new Error('x'); }, null],
  ]) {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-perm-mod-'));
    t.after(async () => { try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ } rimuoviCartellaDiProva(cartellaStore); });
    const visti = [];
    const registry = createSessionRegistry({ cartellaStore, permessoPerIlModello: valore,
      avviaSessioneFn: (input) => { visti.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); return Promise.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }); },
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
    const avvio = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
    assert.ok(!avvio?.erroreAvvio, nome);
    assert.equal(visti[0].permessoPerIlModello, atteso, nome);
    assert.equal(visti[0].permessi, 'Workspace write', `${nome}: la UI resta sull'etichetta`);
    await registry.chiudi?.();
  }
});

test('PERM-MOD-06 AL CONTRARIO — riserva S4 del bugfixer: una figlia NON riceve il permesso detto alla madre (ha i suoi cancelli, più stretti)', async (t) => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const { attendiScritture } = await import('../src/session-store.mjs');
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-perm-mod-figlia-'));
  const visti = [];
  const chiusure = [];
  const registry = createSessionRegistry({ cartellaStore, permessoPerIlModello: 'Full access (TALOS asks the person only before secret files)',
    avviaSessioneFn: (input) => { visti.push(input); const n = visti.length; input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${n}` });
      return new Promise((risolvi) => chiusure.push(() => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${n}` }); risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }); })); },
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  /* i giri finti si chiudono e il registro si chiude SEMPRE, anche se una asserzione fallisce: altrimenti il file resta vivo */
  t.after(async () => { for (const c of chiusure) c(); try { await registry.chiudi?.(); } catch { /* già chiuso */ } try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ } rimuoviCartellaDiProva(cartellaStore); });
  registry.avvia('task', { permessiScelto: 'Full access', modalitaOperativaScelta: 'normale' });
  assert.equal(visti[0].permessoPerIlModello, 'Full access (TALOS asks the person only before secret files)', 'premessa: la madre lo riceve');
  const figlia = await visti[0].onDelega('Read the files and summarise them.', undefined, { modalita: 'lettura' });
  assert.equal(figlia?.esito, 'avviato', `premessa: la figlia parte (${JSON.stringify(figlia)?.slice(0, 160)})`);
  const inputFiglia = visti.find((v) => v !== visti[0]);
  assert.ok(inputFiglia, 'premessa: la figlia ha un suo giro');
  assert.equal(inputFiglia.permessoPerIlModello, undefined);
});

test('PERM-MOD-05 — controllo: la scheda di lavoro scrive quello che riceve, nella riga «Turn permission»', async () => {
  const { testoSchedaDiLavoro } = await import('../src/scheda-di-lavoro.mjs');
  const testo = testoSchedaDiLavoro({ cartella: '/tmp/x', permesso: 'Full access (TALOS asks the person only before secret files)', modello: 'm', piattaforma: 'win32' });
  assert.match(testo, /Turn permission: Full access \(TALOS asks the person only before secret files\)\./u);
});
