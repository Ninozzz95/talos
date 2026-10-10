/*
 * C3 tappa 4 (09/10/2026, decisioni owner) — PAUSA, RIPRESA e RIPROVA di una delega, nel registro VERO.
 * - Pausa (`pause_child` del padre): la figlia finisce l'attrezzo in volo e si ferma «in-pausa»; NON consegna niente al padre.
 * - Riprendi (`resume_child`): un messaggio NUOVO nella STESSA figlia (Claude Code: un agente fermato si riprende con
 *   SendMessage); quando finisce, il padre riceve il risultato come sempre.
 * - Riprova (la persona, `riprendiDelega(…, 'retry')`): lo stesso, su una figlia FALLITA, col motivo del fallimento davanti.
 * Il modello è finto (`avviaSessioneFn` non chiama nessun fornitore) ma rispetta `segnalePausa` come il kernel: la pausa la
 * guarda solo fra un giro e l'altro (il kernel vero è provato in `c3-pausa-figlia.test.mjs`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function modelloFinto() {
  const avvii = [];
  return {
    avvii,
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1;
      let chiudi;
      const attesa = new Promise((risolvi) => { chiudi = risolvi; });
      const avvio = { input, consegna: input.task?.consegna ?? '', messaggiIniziali: input.messaggiIniziali ?? null };
      avvio.concludi = (detto = 'Parte fatta.') => {
        input.onEvento({ type: 'RunFinished', threadId: `t${indice}`, runId: `r${indice}`, outcome: { type: 'success' }, result: { detto } });
        chiudi({ ok: true, esito: { detto, comeFinita: 'concluso' } });
      };
      avvio.fallisci = (messaggio = 'The provider refused the request.') => {
        input.onEvento({ type: 'RunError', message: messaggio, code: 'PROVIDER_REQUEST_ERROR' });
        chiudi({ ok: false, esito: { detto: messaggio, comeFinita: 'errore' }, erroreInterno: messaggio, codiceErrore: 'PROVIDER_REQUEST_ERROR' });
      };
      /* come il kernel: la pausa chiesta chiude il giro «in-pausa» al primo confine fra un giro e l'altro (qui: subito) */
      avvio.fraUnGiroEAltro = () => {
        if (!input.segnalePausa?.aborted) return false;
        const detto = '⏸ paused on request: before round 2.';
        input.onEvento({ type: 'RunError', message: detto, code: 'in-pausa' });
        chiudi({ ok: false, esito: { detto, comeFinita: 'in-pausa' } });
        return true;
      };
      avvii.push(avvio);
      input.onEvento({ type: 'RunStarted', threadId: `t${indice}`, runId: `r${indice}` });
      return attesa;
    },
  };
}

function banco() {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-c3-pausa-registro-'));
  const finto = modelloFinto();
  const registro = createSessionRegistry({
    avviaSessioneFn: finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
  });
  const avvio = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'delega e aspetta', permessi: 'Full access' });
  assert.ok(avvio.sessionId);
  return { cartella, finto, registro, madreId: avvio.sessionId, madre: finto.avvii[0] };
}
const tick = () => new Promise((r) => setImmediate(r));
const figlia = (b, childId) => b.registro.elencaFigli(b.madreId).figli.find((f) => f.sessionId === childId);

test('C3-PAUSA-REGISTRO: pause_child stops the child between rounds with no result for the parent; resume_child continues it in the SAME session and the result arrives', async () => {
  const b = banco();
  try {
    const ricevuta = await b.madre.input.onDelega('leggi i file e riassumili', undefined, { modalita: 'lettura' });
    assert.equal(ricevuta.esito, 'avviato');
    const childId = ricevuta.childId;
    const prima = b.finto.avvii[1];

    const pausa = await b.madre.input.pauseChildFn({ childId });
    assert.deepEqual(pausa, { childId, previous: 'running', paused: true });
    assert.equal(prima.input.segnalePausa.aborted, true, 'the pause reaches the turn of the child');
    assert.equal(prima.fraUnGiroEAltro(), true);
    await tick();
    assert.equal(figlia(b, childId).esitoDelega, 'in-pausa');
    assert.equal(figlia(b, childId).conclusa, true);
    assert.equal(figlia(b, childId).motivoChiusura, 'in-pausa', 'the closing reason is «in-pausa», never «errore»: the list, the graph and the menu read it');
    const inPausa = b.madre.input.listChildrenFn({}).items.find((c) => c.childId === childId);
    assert.deepEqual([inPausa.state, inPausa.result], ['paused', 'none'], 'the model reads «paused», and nothing was delivered to the parent');
    assert.equal(b.madre.input.pauseChildFn({ childId }).paused, false, 'a paused child is not paused twice');

    const ripresa = b.madre.input.resumeChildFn({ childId });
    assert.deepEqual(ripresa, { childId, previous: 'paused', resumed: true });
    await tick();
    const seconda = b.finto.avvii[2];
    assert.ok(seconda, 'a new turn started');
    assert.match(seconda.consegna, /You were paused by the person\. Continue the task from where you stopped/u, 'a NEW message in the child');
    assert.equal(figlia(b, childId).sessionId, childId, 'the SAME child session');
    assert.equal(figlia(b, childId).conclusa, false, 'running again');
    seconda.concludi('Ecco il riassunto dei file.');
    await tick(); await tick();
    assert.equal(figlia(b, childId).esitoDelega, 'concluso');
    assert.equal(figlia(b, childId).riassuntoDelega, 'Ecco il riassunto dei file.');
    const finita = b.madre.input.listChildrenFn({}).items.find((c) => c.childId === childId);
    assert.deepEqual([finita.state, finita.result], ['finished', 'waiting'], 'the result is delivered to the parent (in its queue, the parent is running)');
    assert.equal(b.madre.input.resumeChildFn({ childId }).resumed, false, 'a finished child is not resumed');
  } finally {
    rimuoviCartellaDiProva(b.cartella);
  }
});

test('C3-RIPROVA-REGISTRO: «Retry» on a FAILED child is a new message in the same child, with the reason; a running or concluded child is refused', async () => {
  const b = banco();
  try {
    const ricevuta = await b.madre.input.onDelega('aggiorna il file', undefined, { modalita: 'modifica' });
    const childId = ricevuta.childId;
    assert.deepEqual(b.registro.riprendiDelega(childId, 'retry'), { esito: 'rifiutato', motivo: 'the sub-agent is still running' });
    b.finto.avvii[1].fallisci('The provider refused the request.');
    await tick(); await tick();
    assert.equal(figlia(b, childId).esitoDelega, 'fallito');
    assert.deepEqual(b.registro.riprendiDelega(childId, 'resume'), { esito: 'rifiutato', motivo: 'the sub-agent is not paused' });

    assert.deepEqual(b.registro.riprendiDelega(childId, 'retry'), { esito: 'ripresa', childId });
    await tick();
    assert.equal(figlia(b, childId).esitoDelega, null, 'while the retry runs the old «fallito» is gone: the menu does not offer Retry on a running child');
    const nuovo = b.finto.avvii[2];
    assert.match(nuovo.consegna, /^Your previous attempt at this task did not finish: /u);
    nuovo.concludi('File aggiornato.');
    await tick(); await tick();
    assert.equal(figlia(b, childId).esitoDelega, 'concluso');
    assert.deepEqual(b.registro.riprendiDelega(childId, 'retry'), { esito: 'rifiutato', motivo: 'the sub-agent did not fail' });
    assert.deepEqual(b.registro.riprendiDelega('nessuna', 'retry'), { esito: 'rifiutato', motivo: 'not a sub-agent' });
  } finally {
    rimuoviCartellaDiProva(b.cartella);
  }
});

test('C3-PAUSA-NIPOTI: pausing a child pauses its running descendants too (model and person); a parent cannot pause a grandchild directly', async () => {
  for (const daChi of ['modello', 'persona']) {
    const b = banco();
    try {
      const ricevuta = await b.madre.input.onDelega('dividi il lavoro', undefined, { modalita: 'lettura' });
      const childId = ricevuta.childId;
      const nipoteRicevuta = await b.finto.avvii[1].input.onDelega('leggi il primo file', undefined, { modalita: 'lettura' });
      assert.equal(nipoteRicevuta.esito, 'avviato', `premise (${daChi}): the child delegated to a grandchild`);
      const nipote = b.finto.avvii[2];
      assert.equal(b.madre.input.pauseChildFn({ childId: nipoteRicevuta.childId }).code, 'AGENT_CONTROL_FORBIDDEN', 'only a DIRECT child can be paused');
      assert.equal(nipote.input.segnalePausa.aborted, false, 'the refused pause touched nothing');
      if (daChi === 'modello') assert.equal(b.madre.input.pauseChildFn({ childId }).paused, true);
      else assert.equal(b.registro.pausaDelega(childId), 'in-pausa');
      assert.equal(b.finto.avvii[1].input.segnalePausa.aborted, true);
      assert.equal(nipote.input.segnalePausa.aborted, true, `the grandchild is paused too (${daChi})`);
    } finally {
      rimuoviCartellaDiProva(b.cartella);
    }
  }
});
