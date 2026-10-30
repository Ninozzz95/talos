/*
 * Difetto visto dalla sessione video sulla 0.1.34 (21/10/2026): Impostazioni → «Question timeout» diceva «when it expires the turn
 * stops», ma il desktop avvia il motore con `domandaScadutaFerma: false` (server.mjs, decisione owner 14/10): la domanda scaduta porta
 * al modello `ESITO_DOMANDA_SCADUTA_PROSEGUE` (scelta più prudente, detta) e il giro continua. La frase segue l'opzione del server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import testi from '../../src/i18n/testi/impostazioni.js';

const server = readFileSync(new URL('../../../server.mjs', import.meta.url), 'utf8');

test('SCADENZA-DOMANDA-01 la guida della scadenza delle domande dice ciò che il server fa davvero, nelle due lingue', () => {
  const nonFerma = /domandaScadutaFerma:\s*false/u.test(server);
  assert.ok(nonFerma, 'premessa: il desktop avvia il motore con la domanda scaduta che non ferma il giro');
  const en = testi.en['fieldHelp.askTimeoutSelect'];
  const it = testi.it['fieldHelp.askTimeoutSelect'];
  assert.doesNotMatch(en, /turn stops|stops the turn/iu, en);
  assert.doesNotMatch(it, /giro si ferma|ferma il giro/iu, it);
  assert.match(en, /goes on/iu);
  assert.match(it, /prosegue/iu);
});
