import test from 'node:test';
import assert from 'node:assert/strict';
import { creaSorveglianzaConnessione, TESTI, RITMO } from '../../src/components/connessione.js';

// 05/9 T-15 — la macchina della connessione, col tempo finto: si prova che
// dica «riprovo», poi «non risponde», poi «collegato di nuovo», e il contrario.

function orologio() {
  const coda = []; let id = 0;
  return {
    pianifica: (fn, ms) => { const t = { id: ++id, fn, ms }; coda.push(t); return t.id; },
    annulla: (rid) => { const i = coda.findIndex((t) => t.id === rid); if (i >= 0) coda.splice(i, 1); },
    async scatta() { const t = coda.shift(); if (!t) return null; await t.fn(); await Promise.resolve(); return t.ms; },
    inAttesa: () => coda.length,
  };
}

test('CONN-CADUTA: una fetch fallita → riprovo; dopo i tentativi → non risponde', async () => {
  const o = orologio(); const eventi = [];
  const s = creaSorveglianzaConnessione({ ping: async () => false, suCambio: (st, d) => eventi.push([st, d.tentativi]), ...o });
  assert.equal(s.stato(), 'collegato');
  s.segnalaRete(false);
  assert.equal(s.stato(), 'riconnessione');
  assert.equal(TESTI.riconnessione(1), 'Connessione persa · riprovo…');
  const attese = [];
  for (let i = 0; i < RITMO.tentativiPrimaDiArrendersi; i += 1) attese.push(await o.scatta());
  assert.equal(s.stato(), 'caduto');
  assert.equal(TESTI.caduto, 'Il server non risponde');
  assert.equal(attese[0], RITMO.battitoMinimoMs, 'primo battito al minimo');
  assert.ok(attese.at(-1) > attese[0], 'i battiti si allargano');
  assert.ok(attese.every((ms) => ms <= RITMO.battitoMassimoMs), 'mai oltre il tetto');
  assert.equal(o.inAttesa(), 1, 'da caduto continua a battere, per accorgersi del ritorno');
});

test('CONN-RITORNO: il battito risponde → collegato di nuovo, gancio di riapertura, poi silenzio', async () => {
  const o = orologio(); let vivo = false; let riaperture = 0; const stati = [];
  const s = creaSorveglianzaConnessione({ ping: async () => vivo, suCambio: (st) => stati.push(st), suRicollegato: () => { riaperture += 1; }, ...o });
  s.segnalaSse(0);
  await o.scatta();
  assert.equal(s.stato(), 'riconnessione');
  vivo = true;
  await o.scatta();
  assert.equal(s.stato(), 'ricollegato');
  assert.equal(riaperture, 1);
  await o.scatta(); // scade la finestra «Collegato di nuovo»
  assert.equal(s.stato(), 'collegato');
  assert.deepEqual(stati, ['riconnessione', 'riconnessione', 'ricollegato', 'collegato']);
  assert.equal(o.inAttesa(), 0, 'in salute non batte');
});

test('CONN-VERSO-CONTRARIO: una fetch riuscita mentre riprovo chiude subito; un evento vivo pure; da sano il browser online non fa niente', async () => {
  const o = orologio(); const stati = [];
  const s = creaSorveglianzaConnessione({ ping: async () => false, suCambio: (st) => stati.push(st), ...o });
  s.segnalaBrowser(true);
  assert.equal(s.stato(), 'collegato'); assert.equal(o.inAttesa(), 0);
  s.segnalaBrowser(false);
  assert.equal(s.stato(), 'riconnessione');
  s.segnalaRete(true);
  assert.equal(s.stato(), 'ricollegato');
  await o.scatta();
  assert.equal(s.stato(), 'collegato');
  s.segnalaSse(2);
  s.segnalaEventoVivo();
  assert.equal(s.stato(), 'ricollegato');
  s.ferma();
});
