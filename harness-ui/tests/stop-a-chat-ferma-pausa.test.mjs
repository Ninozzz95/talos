/*
 * Owner 29/10/2026 sera (domanda della CLI, consigliata «Ferma anche quelli in pausa»): «Ferma tutto» ferma anche una delega IN PAUSA.
 * Prima restava in pausa e `resume_child` (o «Riprendi») la faceva ripartire a pagamento dopo che la persona aveva fermato tutto.
 * Registro VERO, modello finto (lo stesso banco di c3-pausa-figlia-registro).
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


test('SAF-PAUSA-01 «Ferma tutto» ferma anche la delega in pausa: niente più «Riprendi» né resume_child, e l\'evento la conta', async () => {
  const b = banco();
  const eventi = [];
  b.registro.iscriviti(b.madreId, (e) => eventi.push(e));
  try {
    const ricevuta = await b.madre.input.onDelega('leggi i file e riassumili', undefined, { modalita: 'lettura' });
    const childId = ricevuta.childId;
    await b.madre.input.pauseChildFn({ childId });
    assert.equal(b.finto.avvii[1].fraUnGiroEAltro(), true);
    await tick();
    assert.equal(figlia(b, childId).esitoDelega, 'in-pausa', 'premessa: in pausa');
    const esito = b.registro.fermaTutto(b.madreId);
    assert.equal(esito.figlieFermate, 1, 'la delega in pausa conta fra le fermate');
    assert.notEqual(figlia(b, childId).esitoDelega, 'in-pausa', 'non è più in pausa');
    assert.deepEqual(b.registro.riprendiDelega(childId, 'resume'), { esito: 'rifiutato', motivo: 'the sub-agent is not paused' });
    assert.equal(b.madre.input.resumeChildFn({ childId }).resumed, false, 'nemmeno il modello la riprende');
    assert.equal(b.finto.avvii.length, 2, 'nessun giro nuovo è partito');
    const ff = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.figlie-fermate').map((e) => e.value.ids);
    assert.deepEqual(ff, [[childId]]);
    assert.deepEqual(b.registro.riprendiDelega(childId, 'retry'), { esito: 'ripresa', childId }, 'la persona la può rifare apposta con «Riprova»');
  } finally {
    rimuoviCartellaDiProva(b.cartella);
  }
});

test('SAF-PAUSA-02 AL CONTRARIO: senza «Ferma tutto» la delega in pausa resta in pausa e si riprende come prima', async () => {
  const b = banco();
  try {
    const ricevuta = await b.madre.input.onDelega('leggi i file', undefined, { modalita: 'lettura' });
    await b.madre.input.pauseChildFn({ childId: ricevuta.childId });
    b.finto.avvii[1].fraUnGiroEAltro();
    await tick();
    assert.equal(figlia(b, ricevuta.childId).esitoDelega, 'in-pausa');
    assert.equal(b.madre.input.resumeChildFn({ childId: ricevuta.childId }).resumed, true);
  } finally {
    rimuoviCartellaDiProva(b.cartella);
  }
});
