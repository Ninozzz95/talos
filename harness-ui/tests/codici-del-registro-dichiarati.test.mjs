/*
 * 27/10/2026 — codici del registro che una ROTTA porta e che `http-app.mjs` non dichiarava: passavano per `normalizeError` e diventavano
 * **500 «Internal error»** (lo stesso difetto di PROVIDER_KEY_MISSING, trovato dalla CLI dal vivo). Inventario in handoff,
 * INVENTARIO-CODICI-NON-DICHIARATI-2026-10-27.md. Qui solo quelli che una rotta raggiunge davvero, ognuno dalla SUA rotta:
 *   DELEGATION_READ_ONLY (impostazioni di una delega in sola lettura) · FORGE_INVALID (abilitare un attrezzo forgiato col manifesto
 *   guasto) · HISTORY_RECOVERY_AMBIGUOUS (riprendere una storia che non si ricompone con certezza) · START_OPERATION_CONFLICT (la stessa
 *   identità d'operazione per un avvio diverso). Tutti stato della risorsa o dato non valido: mai un guasto del server.
 * ⛔ FORK_POINT_NOT_FOUND e FORK_POINT_COMPACTED NON sono qui: la rotta del ramo li porta già a 409 SESSION_NOT_READY col motivo.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function server(t, sessionRegistry) {
  const s = http.createServer(createHttpApp({ sessionRegistry }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => s.close(r)));
  return (percorso, corpo) => fetch(`http://127.0.0.1:${s.address().port}${percorso}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  }).then(async (r) => ({ stato: r.status, corpo: await r.json() }));
}
const rifiuto = (code, reason, inglese) => ({ erroreAvvio: inglese, code, reason });

const CASI = [
  ['DELEGATION_READ_ONLY', 409, { aggiornaImpostazioni: () => rifiuto('DELEGATION_READ_ONLY', 'delegation-read-only', 'This delegation is read-only. To make changes, start a new explicit delegation from the parent session.') },
    '/api/v1/sessions/s1/settings', { modalitaOperativa: 'normale' }],
  ['FORGE_INVALID', 422, { abilitaToolForgiato: async () => ({ erroreAvvio: 'The tool manifest is not valid: shape not allowed', code: 'FORGE_INVALID' }) },
    '/api/v1/sessions/s1/tool-forge/t1/enable', { abilitato: true }],
  ['HISTORY_RECOVERY_AMBIGUOUS', 409, { resume: () => rifiuto('HISTORY_RECOVERY_AMBIGUOUS', 'interrupted-turn-events-ambiguous', 'The events of the interrupted turn cannot be matched with certainty. No data was changed.') },
    '/api/v1/sessions/s1/resume', { messaggio: 'continua' }],
];

for (const [codice, stato, metodi, percorso, corpo] of CASI) {
  test(`CODICI-27-10 ${codice}: dalla sua rotta risponde ${stato} col suo codice e una frase vera, mai 500 «Internal error»`, async (t) => {
    const chiama = await server(t, { elenca: () => [], esiste: () => true, ...metodi });
    const r = await chiama(percorso, corpo);
    assert.equal(r.corpo.error?.code, codice, JSON.stringify(r.corpo));
    assert.equal(r.stato, stato);
    assert.doesNotMatch(String(r.corpo.error?.message), /^Internal error$/u);
  });
}

test('CODICI-27-10 START_OPERATION_CONFLICT: un avvio con la stessa identità d\'operazione per parametri diversi risponde 409, mai 500', async (t) => {
  const cartella = cartellaDiProva('talos-codici-27-10-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiama = await server(t, { elenca: () => [], avviaLibero: () => rifiuto('START_OPERATION_CONFLICT', 'operation-id-conflict', 'The same operation identity is already tied to a different start') });
  const r = await chiama('/api/v1/sessions/custom', { cartellaLibera: cartella, consegna: 'ciao' });
  assert.equal(r.corpo.error?.code, 'START_OPERATION_CONFLICT', JSON.stringify(r.corpo));
  assert.equal(r.stato, 409);
  assert.doesNotMatch(String(r.corpo.error?.message), /^Internal error$/u);
});
