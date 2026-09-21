import assert from 'node:assert/strict';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';

/*
 * ⛔⛔ P-13 — l'elenco dei file arriva al modello, e arriva DOPO RunStarted.
 *
 * La prova che conta di più qui non è «il testo viaggia»: è **l'ordine**. Il primo tentativo di
 * agganciare P-13 lo metteva in `session-registry.mjs`, dentro `avviaESegui`, e faceva cadere 148
 * test su 2084 — misurato, non temuto: `avviaSessione` emette RunStarted come sua PRIMA riga, e
 * tutto ciò che chiama `avviaESegui` conta su quell'evento già nel buffer al ritorno sincrono.
 * ⇒ Se un giorno qualcuno sposta questa costruzione un tick più in su, questo file lo dice subito,
 *   invece di lasciarglielo scoprire da 148 rossi che parlano d'altro.
 */

/* Il finto imita il vero: `talosLavora` è async, riceve un oggetto solo, e torna l'esito. */
function talosLavoraFinto(cattura) {
  return async (input) => {
    cattura(input);
    input.onGiro?.({ tipo: 'risposta', giro: 0, risposta: { role: 'assistant', content: 'ciao', tool_calls: [] } });
    return { comeFinita: 'concluso', detto: 'fatto' };
  };
}

const TASK = { consegna: 'fai qualcosa' };
const BASE = { cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k' };

test('P-13: l’elenco dei file arriva al kernel come stringa', async () => {
  let visto;
  await avviaSessione({
    ...BASE,
    onEvento: () => {},
    talosLavoraFn: talosLavoraFinto((input) => { visto = input; }),
    contestoDelProgettoFn: async () => ({ testo: 'FILE:\nsrc/uno.mjs\n' }),
    creaFiltroGitignoreFn: async () => null,
  });
  assert.equal(visto.contestoDelProgetto, 'FILE:\nsrc/uno.mjs\n');
});

/*
 * ⛔ LA PROVA CHE DIFENDE L'ORDINE. Se cade, la costruzione è risalita prima di RunStarted e la
 * catena sincrona di avviaESegui è di nuovo rotta.
 */
test('P-13: RunStarted è già emesso quando l’elenco si costruisce', async () => {
  const ordine = [];
  await avviaSessione({
    ...BASE,
    onEvento: (e) => ordine.push(`evento:${e.type}`),
    talosLavoraFn: talosLavoraFinto(() => ordine.push('kernel')),
    contestoDelProgettoFn: async () => { ordine.push('elenco'); return { testo: 'x' }; },
    creaFiltroGitignoreFn: async () => null,
  });
  const primo = ordine.indexOf('evento:RunStarted');
  const elenco = ordine.indexOf('elenco');
  assert.ok(primo >= 0, 'RunStarted deve essere stato emesso');
  assert.ok(elenco > primo, `⛔ l'elenco si è costruito PRIMA di RunStarted: ${ordine.join(' → ')}`);
  assert.ok(ordine.indexOf('kernel') > elenco, 'e il kernel lo riceve già pronto');
});

/*
 * ⛔ AL CONTRARIO: una sessione che non parte perché non si sono potuti elencare i file sarebbe una
 * cura molto peggiore della malattia — è lo stesso principio già scritto per le Skills.
 */
test('P-13, AL CONTRARIO: se l’elenco esplode, la sessione parte lo stesso', async () => {
  let visto;
  const esito = await avviaSessione({
    ...BASE,
    onEvento: () => {},
    talosLavoraFn: talosLavoraFinto((input) => { visto = input; }),
    contestoDelProgettoFn: async () => { throw new Error('disco illeggibile'); },
    creaFiltroGitignoreFn: async () => null,
  });
  assert.equal(esito.ok, true, '⛔ un elenco mancante non deve far cadere la sessione');
  assert.equal(visto.contestoDelProgetto, undefined, 'e al kernel non arriva un mezzo valore');
});

test('P-13, AL CONTRARIO: nessun elenco (null) non diventa una stringa vuota', async () => {
  let visto;
  await avviaSessione({
    ...BASE,
    onEvento: () => {},
    talosLavoraFn: talosLavoraFinto((input) => { visto = input; }),
    contestoDelProgettoFn: async () => null,
    creaFiltroGitignoreFn: async () => null,
  });
  assert.equal(visto.contestoDelProgetto, undefined, '⛔ «» direbbe al modello che il progetto è vuoto');
});
