import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDER_DIRETTI, eFonteDiretta, fontiDelSelettore, modelliDellaFonte, fraseVuotoDiretto,
} from '../../src/components/fonti-modelli.js';

/*
 * BC-12. La striscia delle schede è la cosa che l'owner guarda per decidere DOVE cercare: se un
 * conteggio è falso, o se «non ho la chiave» e «non ha modelli» si leggono uguale, la striscia
 * costa un giro a vuoto invece di risparmiarlo. Ogni prova ha il verso giusto e quello contrario.
 */

const modelli = (provider, n) => Array.from({ length: n }, (_, i) => ({ id: `${provider}:m${i}`, nome: `m${i}`, provider }));

test('⛔ LA RICHIESTA DELL’OWNER: cinque schede, e i tre fornitori sono di PRIMO livello', () => {
  const fonti = fontiDelSelettore({
    openrouter: modelli('openrouter', 444),
    locali: modelli('locale', 2),
    diretti: { anthropic: modelli('anthropic', 11), gemini: modelli('gemini', 31), openai: modelli('openai', 71) },
  });
  assert.deepEqual(fonti.map((f) => f.id), ['openrouter', 'locali', 'anthropic', 'gemini', 'openai']);
  assert.deepEqual(fonti.map((f) => f.etichetta), ['OpenRouter', 'Locali', 'Anthropic', 'Gemini', 'OpenAI']);
  assert.deepEqual(fonti.map((f) => f.conto), [444, 2, 11, 31, 71], 'ogni scheda porta il SUO conteggio, non la somma');
  // ⛔ AL CONTRARIO: la scheda ombrello non deve esistere più da nessuna parte.
  assert.equal(fonti.some((f) => f.id === 'diretti'), false);
  assert.equal(eFonteDiretta('diretti'), false);
  assert.deepEqual(PROVIDER_DIRETTI.map((p) => p.id), ['anthropic', 'gemini', 'openai']);
});

test('⛔ TRE STATI, NON UNO: «non ancora letto», «chiave non collegata» e «zero modelli» si distinguono', () => {
  const nonLetto = fontiDelSelettore({ openrouter: null, locali: null, diretti: null });
  for (const fonte of nonLetto) {
    assert.equal(fonte.conto, null, 'prima di leggere non si stampa nessun numero, nemmeno zero');
    assert.equal(fonte.collegato, true, 'e non si accusa nessuno di non avere la chiave');
  }

  const letto = fontiDelSelettore({ openrouter: [], locali: [], diretti: { anthropic: null, gemini: [], openai: modelli('openai', 3) } });
  const perId = Object.fromEntries(letto.map((f) => [f.id, f]));
  assert.equal(perId.anthropic.conto, null, 'senza chiave non c’è un conteggio da dare');
  assert.equal(perId.anthropic.collegato, false);
  assert.equal(perId.gemini.conto, 0, 'letto e vuoto È zero: un fatto, non un errore');
  assert.equal(perId.gemini.collegato, true);
  assert.equal(perId.openai.conto, 3);
});

test('le frasi del vuoto dicono tre cose diverse, e ognuna dice il passo successivo', () => {
  const conChiaveVuota = { diretti: { anthropic: null, gemini: [], openai: [] }, errori: {} };
  assert.match(fraseVuotoDiretto('anthropic', conChiaveVuota), /Collega la chiave Anthropic/u);
  assert.match(fraseVuotoDiretto('gemini', conChiaveVuota), /Nessun modello Gemini/u);
  assert.match(fraseVuotoDiretto('openai', { diretti: null }), /Leggo il catalogo OpenAI/u);
  assert.match(
    fraseVuotoDiretto('gemini', { diretti: { gemini: [] }, errori: { gemini: 'Gemini: HTTP 503' } }),
    /HTTP 503/u,
    'un guasto vince su tutto: si dice qual è, non «nessun modello»',
  );
  // ⛔ AL CONTRARIO — le tre frasi non devono essere la stessa frase.
  const tutte = new Set([
    fraseVuotoDiretto('anthropic', conChiaveVuota),
    fraseVuotoDiretto('gemini', conChiaveVuota),
    fraseVuotoDiretto('openai', { diretti: null }),
  ]);
  assert.equal(tutte.size, 3);
});

test('il catalogo della scheda aperta è il suo, e «non letto» resta null (≠ elenco vuoto)', () => {
  const cataloghi = {
    openrouter: modelli('openrouter', 2),
    locali: modelli('locale', 1),
    diretti: { anthropic: modelli('anthropic', 11), gemini: null, openai: [] },
  };
  assert.equal(modelliDellaFonte('openrouter', cataloghi).length, 2);
  assert.equal(modelliDellaFonte('locali', cataloghi).length, 1);
  assert.equal(modelliDellaFonte('anthropic', cataloghi).length, 11);
  assert.equal(modelliDellaFonte('gemini', cataloghi), null, 'senza chiave non c’è elenco: null, non []');
  assert.deepEqual(modelliDellaFonte('openai', cataloghi), [], 'con la chiave e zero modelli l’elenco c’è ed è vuoto');
  assert.equal(modelliDellaFonte('diretti', cataloghi), null, 'la vecchia scheda ombrello non ha più un catalogo');
  assert.equal(modelliDellaFonte('anthropic', { diretti: null }), null);
});
