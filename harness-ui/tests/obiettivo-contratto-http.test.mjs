/*
 * ⭐⭐⭐ /goal, fase G2 (piano approvato dall'owner il 14/10/2026) — LE PORTE HTTP DEL CONTRATTO, dalla richiesta alla busta.
 *
 *   POST /api/v1/sessions/:id/goal            {testo, criteri?}       → l'obiettivo nasce col suo contratto
 *   POST /api/v1/sessions/:id/goal/criteri    {criteri}               → criteri in più (liberi)
 *   POST /api/v1/sessions/:id/goal/contratto  {criteri, conferma?}    → il contratto intero; togliere o cambiare vuole `conferma: true`
 *
 * Registro vero, giornale su disco. Si prova che cosa arriva a chi chiama: stato HTTP, codice, motivo, i valori della frase —
 * e che l'interfaccia la dice nelle due lingue con la posizione del criterio e il simbolo da togliere.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { TRE_CRITERI, conversazioneFerma, registroAGiri } from './aiuto/banco-obiettivo.mjs';

/* La cartella la toglie l'aiuto a fine FILE (dopo ogni `t.after`): qui si chiude il server e si aspettano le scritture. */
async function banco(t) {
  const cartellaStore = cartellaDiProva('talos-obiettivo-chttp-');
  const { registro, giri } = registroAGiri(cartellaStore);
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await attendiScritture({ cartellaStore }).catch(() => {}); });
  const sessionId = await conversazioneFerma({ registro, giri });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}/goal`;
  const posta = async (percorso, corpo) => {
    const r = await fetch(`${base}${percorso}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    const json = await r.json();
    return { stato: r.status, data: json.data, error: json.error };
  };
  return { registro, giri, sessionId, posta };
}

test('GOAL-CHTTP-01 — the contract through its doors: born with the goal, widened freely, narrowed only with the confirmation', async (t) => {
  const { posta, giri } = await banco(t);
  const giriPrima = giri.length;
  const nato = await posta('', { testo: 'fix the login loop', criteri: TRE_CRITERI });
  assert.equal(nato.stato, 200, JSON.stringify(nato.error));
  const [c1, c2, c3] = nato.data.obiettivo.contratto.criteri;
  assert.deepEqual([c1.id, c2.id, c3.id], ['c1', 'c2', 'c3']);
  assert.match(nato.data.obiettivo.contratto.impronta, /^sha256:[0-9a-f]{64}$/u);

  const inPiu = await posta('/criteri', { criteri: [{ testo: 'The linter is clean', verifica: { tipo: 'comando', comando: 'npm run lint' } }] });
  assert.equal(inPiu.stato, 200, JSON.stringify(inPiu.error));
  assert.deepEqual(inPiu.data.cambio, { aggiunti: ['c4'], tolti: [], cambiati: [] });
  const c4 = inPiu.data.obiettivo.contratto.criteri[3];

  const senzaConferma = await posta('/contratto', { criteri: [c1, c3, c4] });
  assert.equal(senzaConferma.stato, 409);
  assert.deepEqual([senzaConferma.error.code, senzaConferma.error.reason], ['GOAL_CONTRACT_NEEDS_CONFIRMATION', 'goal-contract-change-needs-confirmation']);
  assert.deepEqual(senzaConferma.error.params, { tolti: 'c2', cambiati: '' }, 'the answer names what would be removed');
  const noEsplicito = await posta('/contratto', { criteri: [c1, c3, c4], conferma: false });
  assert.equal(noEsplicito.stato, 409, 'conferma: false is a no');

  /* REV-GOAL-05 (14/10/2026): il sì in bianco non vale più; vale l'impronta del contratto che la persona ha davanti */
  const inBianco = await posta('/contratto', { criteri: [c1, c3, c4], conferma: true });
  assert.equal(inBianco.stato, 400, 'conferma: true is not a fingerprint');
  const vecchia = await posta('/contratto', { criteri: [c1, c3, c4], conferma: nato.data.obiettivo.contratto.impronta });
  assert.equal(vecchia.stato, 409, 'the fingerprint of a contract that has changed since (c4 added) is not a yes');
  const confermato = await posta('/contratto', { criteri: [c1, c3, c4], conferma: inPiu.data.obiettivo.contratto.impronta });
  assert.equal(confermato.stato, 200, JSON.stringify(confermato.error));
  assert.deepEqual(confermato.data.cambio, { aggiunti: [], tolti: ['c2'], cambiati: [] });
  assert.deepEqual(confermato.data.obiettivo.contratto.criteri.map((c) => c.id), ['c1', 'c3', 'c4']);
  const uguale = await posta('/contratto', { criteri: [c1, c3, c4] });
  assert.equal(uguale.stato, 200);
  assert.equal(uguale.data.invariato, true);
  assert.equal('cambio' in uguale.data, false);
  assert.equal(giri.length, giriPrima, 'G2: none of these doors starts a turn');
});

test('GOAL-CHTTP-02 — AL CONTRARIO: a body of the wrong shape is a 400 before anything is touched', async (t) => {
  const { posta, registro, sessionId } = await banco(t);
  for (const corpo of [{ testo: 'x', criteri: 'c1' }, { testo: 'x', criteri: {} }, { testo: 'x', criteri: null }, { testo: 'x', criteri: [], altro: 1 }, { criteri: TRE_CRITERI }]) {
    const r = await posta('', corpo);
    assert.equal(r.stato, 400, `POST /goal ${JSON.stringify(corpo).slice(0, 60)}`);
    assert.equal(r.error.code, 'QUERY_INVALID');
  }
  assert.deepEqual(registro.statoObiettivo(sessionId), { ok: true, obiettivo: null });
  await posta('', { testo: 'fix the login loop', criteri: TRE_CRITERI });
  const prima = registro.statoObiettivo(sessionId).obiettivo;
  const sbagliati = [
    ['/contratto', {}], ['/contratto', { criteri: 'c1' }], ['/contratto', { criteri: TRE_CRITERI, conferma: 'true' }], ['/contratto', { criteri: TRE_CRITERI, conferma: 1 }],
    ['/contratto', { criteri: TRE_CRITERI, altro: 1 }], ['/contratto', []], ['/contratto', { testo: 'x', criteri: TRE_CRITERI }],
    ['/criteri', {}], ['/criteri', { criteri: null }], ['/criteri', { criteri: TRE_CRITERI, conferma: true }], ['/criteri', ['x']],
  ];
  for (const [percorso, corpo] of sbagliati) {
    const r = await posta(percorso, corpo);
    assert.equal(r.stato, 400, `POST ${percorso} ${JSON.stringify(corpo).slice(0, 60)}`);
    assert.equal(r.error.code, 'QUERY_INVALID');
  }
  assert.deepEqual(registro.statoObiettivo(sessionId).obiettivo, prima, 'none of the malformed requests changed the contract');
});


test('GOAL-CHTTP-04 — the two contract doors are POST only, on a conversation that exists and a goal that is set', async (t) => {
  const { posta, sessionId } = await banco(t);
  for (const azione of ['contratto', 'criteri']) {
    assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/${sessionId}/goal/${azione}`), ['POST'], azione);
    const senza = await posta(`/${azione}`, { criteri: TRE_CRITERI });
    assert.deepEqual([senza.stato, senza.error.code, senza.error.reason], [409, 'GOAL_STATE_CONFLICT', 'goal-not-set'], azione);
  }
});
