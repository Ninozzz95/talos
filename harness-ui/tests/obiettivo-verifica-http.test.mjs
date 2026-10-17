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

test('G3-HTTP-01 — POST /goal/verifica esegue le prove e risponde col resoconto; al terzo rosso dice quali criteri sono al tetto', async (t) => {
  const { chiedi } = await banco(t);
  const impostato = await chiedi('', { corpo: { testo: 'fix the login loop', criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] } });
  assert.equal(impostato.stato, 200, JSON.stringify(impostato.json));
  const prima = await chiedi('/verifica', { corpo: {} });
  assert.equal(prima.stato, 200, JSON.stringify(prima.json));
  const { verifica, criteriAlTetto, obiettivo } = prima.json.data;
  assert.equal(verifica.verdetti[0].esito, 'rosso');
  assert.equal(verifica.verdetti[0].uscita.coda, '[stderr]\n2 failing');
  assert.deepEqual(verifica.riepilogo, { verdi: 0, rossi: 1, nonVerificabili: 0, daGiudicare: 0 });
  assert.deepEqual(criteriAlTetto, []);
  assert.equal(obiettivo.stato, 'attivo');
  await chiedi('/verifica');
  const terza = await chiedi('/verifica');
  assert.deepEqual(terza.json.data.criteriAlTetto, ['c1']);
  assert.deepEqual(terza.json.data.obiettivo.motivo, { tipo: 'prove-rosse', dettaglio: 'c1' });
  // la lettura dell'obiettivo porta l'ultima verifica
  const letto = await chiedi('', { metodo: 'GET' });
  assert.deepEqual(letto.json.data.obiettivo.verifica, terza.json.data.verifica);
});

