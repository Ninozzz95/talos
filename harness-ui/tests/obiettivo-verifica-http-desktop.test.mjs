/*
 * Le prove di `obiettivo-verifica-http.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
/*
 * ⭐⭐⭐ /goal, fase G3 — LA PORTA DELLE PROVE, dalla richiesta alla busta.
 *
 *   POST /api/v1/sessions/:id/goal/verifica  {}  → { ok, obiettivo, verifica, criteriAlTetto }
 *
 * Il registro è quello VERO (giornale su disco), l'esecutore dei comandi è finto (le prove sul kernel vero stanno in
 * `obiettivo-verifica-registro.test.mjs`, G3-REG-08). Qui: che cosa arriva a chi chiama, i corpi sbagliati, i rifiuti con le loro
 * frasi nelle due lingue.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { testoErroreServer } from '../frontend/src/components/errori.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';
import { conversazioneFerma, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function banco(t) {
  const cartellaStore = cartellaDiProva('talos-g3-http-');
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g3-http-progetto-'));
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async (riga, dove, o) => { o.onPezzo({ flusso: 'errori', testo: '2 failing\n' }); return { codice: 1, enforcement: 'none' }; },
  });
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: b.registro }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await attendiScritture({ cartellaStore }).catch(() => {});
    rimuoviCartellaDiProva(cartellaStore);
    rimuoviCartellaDiProva(cartella);
  });
  const sessionId = await conversazioneFerma(b);
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}/goal`;
  const chiedi = async (percorso = '', { metodo = 'POST', corpo } = {}) => {
    const r = await fetch(`${base}${percorso}`, { method: metodo, ...(corpo !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) } : {}) });
    const testo = await r.text();
    return { stato: r.status, allow: r.headers.get('allow'), json: testo ? JSON.parse(testo) : null };
  };
  return { chiedi };
}


test('G3-HTTP-02 — AL CONTRARIO: un corpo che non è {} è un 400 e non esegue niente; GET su /verifica è un 405; i rifiuti nelle due lingue', async (t) => {
  const { chiedi } = await banco(t);
  await chiedi('', { corpo: { testo: 'a goal without criteria' } });
  for (const corpo of [{ a: 1 }, ['x'], 'x']) {
    const r = await chiedi('/verifica', { corpo });
    assert.equal(r.stato, 400, JSON.stringify(corpo));
    assert.equal(r.json.error.code, 'QUERY_INVALID');
  }
  const get = await chiedi('/verifica', { metodo: 'GET' });
  assert.equal(get.stato, 405);
  assert.equal(get.allow, 'POST');
  const senza = await chiedi('/verifica');
  assert.deepEqual([senza.stato, senza.json.error.code, senza.json.error.reason], [409, 'GOAL_STATE_CONFLICT', 'goal-no-contract']);
  assert.equal(senza.json.error.explanation, 'The goal has no criteria to check: add some first');
  impostaLingua('it');
  t.after(() => impostaLingua('it'));
  assert.equal(testoErroreServer(senza.json.error).explanation, 'L’obiettivo non ha criteri da controllare: aggiungine prima qualcuno');
  // l'interfaccia traduce solo la frase inglese che il server manda DAVVERO (`registro.rifiutoObiettivo`): le si danno quelle
  const frasi = [
    ['goal-check-running', 'The checks of the goal are already running', 'Le prove dell’obiettivo stanno già girando'],
    ['goal-check-while-working', 'The conversation is working: run the checks when it stops', 'La conversazione sta lavorando: lancia le prove quando si ferma'],
    ['goal-changed-during-check', 'The goal changed while its checks were running: the result was not saved', 'L’obiettivo è cambiato mentre giravano le prove: l’esito non è stato salvato'],
    ['goal-check-stopped', 'The checks were stopped before the end: the result was not saved', 'Le prove sono state fermate prima della fine: l’esito non è stato salvato'],
  ];
  for (const [motivo, inglese, italiano] of frasi) assert.equal(testoErroreServer({ code: 'GOAL_STATE_CONFLICT', reason: motivo, explanation: inglese }).explanation, italiano, motivo);
  impostaLingua('en');
  for (const [motivo, inglese] of frasi) assert.equal(testoErroreServer({ code: 'GOAL_STATE_CONFLICT', reason: motivo, explanation: inglese }).explanation, inglese, motivo);
});
