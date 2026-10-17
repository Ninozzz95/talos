/*
 * Le prove di `obiettivo-contratto-http.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
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
import { testoErroreServer } from '../frontend/src/components/errori.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';
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



test('GOAL-CHTTP-03 — a malformed criterion is a 422 that names the criterion and what to remove, and the interface says it in both languages', async (t) => {
  const { posta, registro, sessionId } = await banco(t);
  const sempreVerde = await posta('', { testo: 'fix the login loop', criteri: [TRE_CRITERI[0], { testo: 'always green', verifica: { tipo: 'comando', comando: 'npm test || true' } }] });
  assert.equal(sempreVerde.stato, 422);
  assert.deepEqual([sempreVerde.error.code, sempreVerde.error.reason], ['GOAL_CONTRACT_INVALID', 'criterion-command-not-attributable']);
  assert.deepEqual(sempreVerde.error.params, { posizione: 2, operatore: '||' });
  assert.deepEqual(registro.statoObiettivo(sessionId), { ok: true, obiettivo: null }, 'the goal was not born');
  const fuori = await posta('', { testo: 'x', criteri: [{ testo: 'outside', verifica: { tipo: 'file', percorso: 'C:\\Windows\\win.ini', fatto: 'esiste' } }] });
  assert.deepEqual([fuori.stato, fuori.error.reason], [422, 'criterion-path-outside']);
  assert.deepEqual(fuori.error.params, { posizione: 1 }, 'the path the person wrote does not travel in the refusal');
  assert.equal(JSON.stringify(fuori.error).includes('Windows'), false);
  const troppi = await posta('', { testo: 'x', criteri: Array.from({ length: 21 }, (_, i) => ({ testo: `criterion ${i + 1}`, verifica: { tipo: 'giudizio' } })) });
  assert.deepEqual([troppi.stato, troppi.error.reason, troppi.error.params], [422, 'contract-too-many-criteria', { massimo: 20 }]);

  impostaLingua('it');
  t.after(() => impostaLingua('it'));
  assert.equal(testoErroreServer(sempreVerde.error).explanation, 'Criterio 2: il codice d’uscita di questo comando non direbbe com’è andata. Togli ||');
  assert.equal(testoErroreServer(sempreVerde.error).title, 'Criteri non validi');
  assert.equal(testoErroreServer(fuori.error).explanation, 'Criterio 1: il file deve stare dentro il progetto');
  assert.equal(testoErroreServer(troppi.error).explanation, 'Troppi criteri: il limite è 20');
  impostaLingua('en');
  assert.equal(testoErroreServer(sempreVerde.error).explanation, 'Criterion 2: the exit code of this command would not tell how it went. Remove ||');

  // e la conferma che manca, nelle due lingue
  await posta('', { testo: 'fix the login loop', criteri: TRE_CRITERI });
  const [c1] = registro.statoObiettivo(sessionId).obiettivo.contratto.criteri;
  const serve = await posta('/contratto', { criteri: [c1] });
  assert.equal(testoErroreServer(serve.error).explanation, 'Removing or changing criteria of the goal needs your confirmation');
  impostaLingua('it');
  assert.equal(testoErroreServer(serve.error).explanation, 'Togliere o cambiare criteri dell’obiettivo vuole la tua conferma');
  assert.equal(testoErroreServer(serve.error).title, 'Serve la tua conferma');
});

