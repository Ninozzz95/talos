import assert from 'node:assert/strict';
import test from 'node:test';

import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';

/*
 * Parità remoto (censimento C3, owner: «dal dispositivo gira sul PC»): la Ricerca approfondita di una sessione del PC dal dispositivo, sulle rotte della finestra. Leggere è
 *   libero, senza percorsi del PC; riprendere, ricontrollare ed eliminare vogliono il consenso della cartella; mettere in pausa ferma soltanto, come `session.stop`.
 *   Fuori per ora: l'esportazione, che è un file e non una risposta JSON. Una ricerca nuova parte dal messaggio, con l'attrezzo del modello.
 */
const contesto = { dispositivo: { id: 'dispositivo-A1', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
const sessionRegistry = { elenca: () => [], esiste: () => true, async cartellaPerChatFile() { return { ok: true, cartella: 'C:\\Users\\persona\\progetto' }; } };
function banco({ consentita = true, risposte = {}, bloccati = [] } = {}) {
  const chiamate = [];
  const chiama = async (c) => { chiamate.push(c); return { stato: 200, dati: risposte[c.percorso] ?? { ok: true } }; };
  const cartelle = { consentita: async () => consentita, descrivi: async () => ({ nome: 'progetto' }), elenco: async () => [] };
  return { chiamate, operazioni: creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle, bloccateDi: async () => bloccati }) };
}
const BASE = '/api/v1/sessions/s1/research';

test('RICERCA-PONTE-01 elenco e stato sono letture libere, coi soli campi del contratto', async () => {
  const riga = { id: 'r1', titolo: 'Prezzi', domanda: 'Quanto costa /tmp/x?', question: 'Quanto costa /tmp/x?', stato: 'done', ultimoMessaggio: 'frase del modello', percorso: '/home/persona/x/r1.json', cartella: 'C:\\Users\\persona' };
  const dettaglio = { ricerca: { ...riga, contenutoRapporto: '# Il rapporto', contenutoRespinto: 'no', sintesi: 's', affermazioni: [{ numero: 1, testo: 't' }], fonti: [{ numero: 1, url: 'https://a.invalid' }], piano: [{ id: 'p' }], passi: [{ id: 'q', resultRef: 'C:\\x', error: 'C:\\y' }], spesa: { tokens: 3, searches: 1, pages: 0, altro: 9 }, giornale: { eventi: 1, righeSaltate: 0, stato: 'done' }, costoAtteso: null }, errore: null };
  const { chiamate, operazioni } = banco({ consentita: false, risposte: { [BASE]: { ricerche: [riga], totale: 1, errore: null }, [`${BASE}/r1`]: dettaglio } });
  const elenco = await operazioni.esegui('session.research.list', { sessionId: 's1' }, contesto);
  assert.deepEqual(elenco, { ricerche: [{ id: 'r1', domanda: riga.domanda, titolo: 'Prezzi', stato: 'done', motivo: null }], totale: 1, errore: null });
  const voce = await operazioni.esegui('session.research.get', { sessionId: 's1', ricercaId: 'r1' }, contesto);
  assert.equal(voce.ricerca.titolo, 'Prezzi');
  assert.deepEqual(voce.ricerca.spesa, { tokens: 3, searches: 1, pages: 0 });
  for (const k of ['contenutoRapporto', 'contenutoRespinto', 'sintesi', 'affermazioni', 'fonti', 'piano', 'passi', 'ultimoMessaggio', 'percorso', 'cartella', 'question']) assert.equal(Object.hasOwn(voce.ricerca, k), false, k);
  assert.equal(voce.ricerca.contenutoNegato, 'consent-required');
  assert.deepEqual(voce.ricerca.contenutoParams, { nome: 'progetto' });
  assert.deepEqual(chiamate.map((c) => [c.metodo, c.percorso]), [['GET', BASE], ['GET', `${BASE}/r1`]]);
});

test('RICERCA-PONTE-06 punto 3: il rapporto esce col consenso e senza blocchi, e mai dalla pausa', async () => {
  const ricerca = { id: 'r1', titolo: 'Prezzi', stato: 'done', contenutoRapporto: '# Il rapporto', sintesi: 's', fonti: [{ numero: 1, url: 'https://a.invalid/home/x', titolo: 't' }, { numero: 2, url: 'file:///C:/Users/x', titolo: 'l' }], passi: [{ id: 'q', state: 'failed', resultRef: 'C:\\x', error: 'C:\\y' }] };
  const risposte = { [`${BASE}/r1`]: { ricerca, errore: null }, [`${BASE}/r1/pausa`]: { ricerca, errore: 'Cannot read C:\\Users\\Mario Rossi\\AppData\\x\\meta.json' }, [`${BASE}/r1/ripresa`]: { ricerca, errore: null } };
  const aperto = banco({ risposte });
  const voce = await aperto.operazioni.esegui('session.research.get', { sessionId: 's1', ricercaId: 'r1' }, contesto);
  assert.equal(voce.ricerca.contenutoRapporto, '# Il rapporto');
  assert.equal(Object.hasOwn(voce.ricerca, 'contenutoNegato'), false);
  assert.deepEqual(voce.ricerca.fonti.map((f) => f.url), ['https://a.invalid/home/x', '']);
  assert.deepEqual(voce.ricerca.passi, [{ id: 'q', state: 'failed' }]);
  for (const azione of ['pause', 'resume']) {
    const r = await aperto.operazioni.esegui(`session.research.${azione}`, { sessionId: 's1', ricercaId: 'r1' }, contesto);
    assert.equal(Object.hasOwn(r.ricerca, 'contenutoRapporto'), false, azione);
    assert.doesNotMatch(JSON.stringify(r), /Mario|Users/u, azione);
  }
  assert.equal((await aperto.operazioni.esegui('session.research.pause', { sessionId: 's1', ricercaId: 'r1' }, contesto)).errore, 'RESEARCH_READ_FAILED', 'il guasto si dice col codice');
  const fermo = banco({ risposte, bloccati: ['C:\\Users\\persona\\progetto'] });
  const negato = await fermo.operazioni.esegui('session.research.get', { sessionId: 's1', ricercaId: 'r1' }, contesto);
  assert.equal(negato.ricerca.contenutoNegato, 'folder-blocked');
  assert.equal(Object.hasOwn(negato.ricerca, 'contenutoRapporto'), false);
  await assert.rejects(fermo.operazioni.esegui('session.research.list', { sessionId: 's1' }, contesto), { code: 'FOLDER_BLOCKED', stato: 409, reason: 'folder-blocked' });
  await fermo.operazioni.esegui('session.research.pause', { sessionId: 's1', ricercaId: 'r1' }, contesto);
});

test('RICERCA-PONTE-07 un rapporto oltre il tetto si taglia e lo dice; un motivo grezzo del PC non esce', async () => {
  const lungo = 'r\n'.repeat(30_000);
  const riga = { id: 'r1', stato: 'senza-rapporto', motivo: 'Unreadable: C:\\Users\\Mario\\x', motivoChiave: 'server.research.state.reportUnreadable', motivoParams: { detail: 'C:\\Users\\Mario\\x' } };
  const nota = { id: 'r2', stato: 'senza-rapporto', motivo: 'the report is empty', motivoChiave: 'k', motivoParams: { detail: 'the report is empty', detailChiave: 'server.research.report.empty', altro: 'no' } };
  const { operazioni } = banco({ risposte: { [BASE]: { ricerche: [riga, nota], totale: 2, errore: null }, [`${BASE}/r1`]: { ricerca: { ...riga, contenutoRapporto: lungo } } } });
  const r = await operazioni.esegui('session.research.get', { sessionId: 's1', ricercaId: 'r1' }, contesto);
  assert.equal(r.ricerca.contenutoTroncato, true);
  assert.ok(r.ricerca.contenutoRapporto.length < lungo.length);
  const { ricerche: [grezza, conChiave] } = await operazioni.esegui('session.research.list', { sessionId: 's1' }, contesto);
  assert.deepEqual([grezza.motivo, grezza.motivoChiave, grezza.motivoParams], [null, riga.motivoChiave, undefined]);
  assert.deepEqual([conChiave.motivo, conChiave.motivoParams], ['the report is empty', { detail: 'the report is empty', detailChiave: 'server.research.report.empty' }]);
});

test('RICERCA-PONTE-02 riprendere, ricontrollare ed eliminare vogliono il consenso; la pausa no', async () => {
  const { chiamate, operazioni } = banco({ consentita: false });
  for (const op of ['resume', 'recheck', 'delete']) {
    await assert.rejects(operazioni.esegui(`session.research.${op}`, { sessionId: 's1', ricercaId: 'r1' }, contesto), { code: 'CONSENT_REQUIRED' }, op);
  }
  assert.equal(chiamate.length, 0);
  await operazioni.esegui('session.research.pause', { sessionId: 's1', ricercaId: 'r1' }, contesto);
  assert.deepEqual(chiamate.map((c) => [c.metodo, c.percorso, c.corpo]), [['POST', `${BASE}/r1/pausa`, {}]]);
});

test('RICERCA-PONTE-05 eliminare una ricerca vuole la carta, come eliminare una voce della Libreria', async () => {
  const { chiamate, operazioni } = banco();
  for (const args of [{}, { confermata: 'true' }, { confermata: 1 }]) {
    await assert.rejects(operazioni.esegui('session.research.delete', { sessionId: 's1', ricercaId: 'r1', ...args }, contesto), { code: 'CONFIRMATION_REQUIRED', stato: 409 });
  }
  assert.equal(chiamate.length, 0);
});

test('RICERCA-PONTE-03 col consenso ogni azione arriva alla sua rotta', async () => {
  const { chiamate, operazioni } = banco();
  for (const [op, metodo, coda] of [['resume', 'POST', '/ripresa'], ['recheck', 'POST', '/riverifica'], ['delete', 'DELETE', '']]) {
    chiamate.length = 0;
    await operazioni.esegui(`session.research.${op}`, { sessionId: 's1', ricercaId: 'r1', confermata: true }, contesto);
    assert.deepEqual(chiamate.map((c) => [c.metodo, c.percorso]), [[metodo, `${BASE}/r1${coda}`]], op);
  }
});

test('RICERCA-PONTE-04 un id storto non diventa mai un pezzo di percorso', async () => {
  const { chiamate, operazioni } = banco();
  for (const ricercaId of ['../x', 'a/b', '', 7, undefined, 'a'.repeat(65)]) {
    await assert.rejects(operazioni.esegui('session.research.get', { sessionId: 's1', ricercaId }, contesto), { code: 'BAD_MESSAGE' }, String(ricercaId));
    await assert.rejects(operazioni.esegui('session.research.delete', { sessionId: 's1', ricercaId }, contesto), { code: 'BAD_MESSAGE' }, String(ricercaId));
  }
  assert.equal(chiamate.length, 0);
});
