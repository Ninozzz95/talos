/*
 * Le righe del pannello delle notifiche del PC, dalla voce del registro del server (consegna della Frontend del 31/10/2026, FE-042):
 * una frase per ogni fatto, in italiano e in inglese; mai il codice di un fatto o di un'azione a schermo; il numero conta solo
 * approvazioni e domande non risolte; la notifica di sistema una volta per voce, mai per le azioni della persona.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { fraseDellaVoce, vociDaFare, vociInOrdine, giornoDi, deveAvvisareFuoriDallaFinestra, testoNotificaSistema, statoConsensoNotifiche, FATTI_DA_FARE, FATTI_SENZA_RIGA } from '../../src/components/notifiche.js';

const voce = (fatto, extra = {}) => ({ id: `${fatto}:s1:k`, seq: 1, fatto, azione: null, cosa: { tipo: 'sessione', id: 's1', nome: 'Redesign sidebar' },
  dato: null, porta: { tipo: 'sessione', id: 's1' }, istante: '2026-10-31T10:00:00.000Z', stato: { visto: false, risolto: false }, ...extra });

const ATTESE = {
  it: {
    approvazione: 'Vuole scrivere questo file:', domanda: 'Ha una domanda:', fine: 'Ha finito', interrotta: 'Da riprendere', errore: 'Da riprendere',
    'giro-finito': 'fatto', 'giro-fallito': 'non riuscito', 'giro-saltato': 'saltato',
    consentito: 'Hai consentito:', negato: 'Hai negato:', risposto: 'Hai risposto a:', saltato: 'Hai saltato:', ignoto: 'Nuovo avviso',
  },
  en: {
    approvazione: 'It wants to write this file:', domanda: 'Has a question:', fine: 'Finished', interrotta: 'To resume', errore: 'To resume',
    'giro-finito': 'done', 'giro-fallito': 'failed', 'giro-saltato': 'skipped',
    consentito: 'You allowed:', negato: 'You denied:', risposto: 'You answered:', saltato: 'You skipped:', ignoto: 'New notice',
  },
};

for (const lingua of ['it', 'en']) {
  test(`NOTIF-PC-01 (${lingua}) one sentence per fact, the data under it, never a code on screen`, (t) => {
    impostaLingua(lingua); t.after(() => impostaLingua('it'));
    const a = ATTESE[lingua];
    const permesso = fraseDellaVoce(voce('approvazione', { azione: 'scrivi', dato: { genere: 'file', valore: 'src/a.js' } }));
    assert.equal(permesso.frase, a.approvazione);
    assert.deepEqual(permesso.dato, { genere: 'file', valore: 'src/a.js' });
    assert.equal(permesso.tono, 'accento', 'until seen');
    assert.equal(fraseDellaVoce(voce('approvazione', { azione: 'scrivi', stato: { visto: true, risolto: false } })).tono, null, 'seen: no accent');
    assert.equal(fraseDellaVoce(voce('domanda', { dato: { genere: 'testo', valore: 'Quale ramo?' } })).frase, a.domanda);
    assert.equal(fraseDellaVoce(voce('fine')).frase, a.fine);
    assert.equal(fraseDellaVoce(voce('interrotta')).frase, a.interrotta);
    const errore = fraseDellaVoce(voce('errore', { dato: { genere: 'codice-errore', valore: 'PROVIDER_RATE_LIMITED' } }));
    assert.ok(errore.frase.startsWith(a.errore), errore.frase);
    assert.equal(errore.tono, 'pericolo');
    assert.doesNotMatch(errore.frase, /PROVIDER_RATE_LIMITED/u, 'the error code never in the sentence');
    assert.equal(errore.dato, null);
    for (const fatto of ['giro-finito', 'giro-fallito', 'giro-saltato']) {
      const giro = fraseDellaVoce(voce(fatto, { porta: { tipo: 'automazione', id: 'a1' } }));
      assert.ok(giro.frase && !/giro-|sezioni\./u.test(giro.frase), `${fatto}: ${giro.frase}`);
      if (a[fatto]) assert.match(giro.frase.toLowerCase(), new RegExp(a[fatto], 'u'));
    }
    for (const azione of ['consentito', 'negato', 'risposto', 'saltato']) {
      const traccia = fraseDellaVoce(voce('azione-persona', { azione, dato: { genere: 'file', valore: 'src/a.js' }, stato: { visto: true, risolto: true } }));
      assert.equal(traccia.frase, a[azione]);
      assert.equal(traccia.traccia, true, 'a lighter row, no dot');
      assert.equal(traccia.tono, null);
    }
    /* Performance 31/10: un'azione che questo lettore non conosce resta una riga generica, non sparisce (come farà il telefono vecchio con `saltato`) */
    const azioneNuova = fraseDellaVoce(voce('azione-persona', { azione: 'azione-del-futuro', dato: { genere: 'testo', valore: 'x' }, stato: { visto: true, risolto: true } }));
    assert.equal(azioneNuova.frase, a.ignoto);
    assert.equal(azioneNuova.traccia, true);
    const ignoto = fraseDellaVoce(voce('fatto-del-futuro', { dato: { genere: 'testo', valore: 'x' } }));
    assert.equal(ignoto.frase, a.ignoto);
    assert.doesNotMatch(ignoto.frase, /fatto-del-futuro/u, 'AL CONTRARIO: an unknown fact never shows its code');
  });
}

test('NOTIF-PC-02 AL CONTRARIO: a permission with a new action does not show the code; deep research fills its sentence and shows no data twice', (t) => {
  impostaLingua('it'); t.after(() => impostaLingua('it'));
  const nuova = fraseDellaVoce(voce('approvazione', { azione: 'attrezzo_nuovo_9', dato: { genere: 'testo', valore: 'x' } }));
  assert.doesNotMatch(nuova.frase, /attrezzo_nuovo_9/u);
  assert.equal(nuova.frase, 'Aspetta la tua approvazione');
  const ricerca = fraseDellaVoce(voce('approvazione', { azione: 'research_start', dato: { genere: 'testo', valore: 'prezzi dei pannelli' } }));
  assert.match(ricerca.frase, /prezzi dei pannelli/u);
  assert.equal(ricerca.dato, null, 'the data is in the sentence, not under it again');
});

test('NOTIF-PC-03 «Da fare» counts only unresolved permissions and questions; the person\'s actions and the automation turns never', () => {
  assert.deepEqual([...FATTI_DA_FARE].sort(), ['approvazione', 'domanda']);
  const voci = [
    voce('approvazione', { id: 'a', seq: 1 }), voce('domanda', { id: 'b', seq: 5 }), voce('approvazione', { id: 'c', seq: 3, stato: { visto: true, risolto: true } }),
    voce('azione-persona', { id: 'd', seq: 4, stato: { visto: true, risolto: true } }), voce('giro-finito', { id: 'e', seq: 2 }), voce('fine', { id: 'f', seq: 6 }),
  ];
  assert.deepEqual(vociDaFare(voci).map((v) => v.id), ['b', 'a'], 'unresolved only, newest first');
  assert.deepEqual(vociDaFare([voce('approvazione', { id: 'x', stato: { visto: true, risolto: false } })]).map((v) => v.id), ['x'], 'seen is not resolved: it stays to do');
  assert.deepEqual(vociInOrdine(voci).map((v) => v.id), ['f', 'b', 'd', 'c', 'e', 'a'], 'same instant: the newer in the register first');
});

/* Revisione dei blocchi 10-12, D-2 (31/10/2026): `seq` è il cursore del registro e avanza a ogni «visto»: dopo «Segna tutte» una voce di ieri
   passava davanti a una di oggi. La persona legge il tempo. */
test('NOTIF-PC-03b the order is by time, not by the register cursor: «Mark all as seen» moves nothing; a broken instant goes last', () => {
  /* tre chat diverse: con la decisione 62 due «Finished» della stessa chat sono una riga sola (NOTIF-PC-D23) */
  const chat = (id) => ({ cosa: { tipo: 'sessione', id, nome: id } });
  const ieri = voce('fine', { id: 'ieri', seq: 9, istante: '2026-10-30T10:00:00.000Z', ...chat('c-ieri') });
  const oggi = voce('azione-persona', { id: 'oggi', seq: 3, istante: '2026-10-31T10:00:00.000Z' });
  const vecchia = voce('fine', { id: 'vecchia', seq: 8, istante: '2026-10-26T10:00:00.000Z', ...chat('c-vecchia') });
  const rotta = voce('fine', { id: 'rotta', seq: 10, istante: 'non-una-data', ...chat('c-rotta') });
  assert.deepEqual(vociInOrdine([vecchia, ieri, oggi]).map((v) => v.id), ['oggi', 'ieri', 'vecchia']);
  assert.deepEqual(vociInOrdine([rotta, vecchia, oggi]).map((v) => v.id), ['oggi', 'vecchia', 'rotta']);
  const a = voce('domanda', { id: 'prima', seq: 9, istante: '2026-10-30T10:00:00.000Z' });
  const b = voce('approvazione', { id: 'dopo', seq: 2, istante: '2026-10-31T10:00:00.000Z' });
  assert.deepEqual(vociDaFare([a, b]).map((v) => v.id), ['dopo', 'prima'], '«To do» follows the same time');
});

/* Revisione dei blocchi 10-12: D-7, un valore d'azione col nome di una proprietà di Object non cade sulla frase generica; e le quattro
   asserzioni sul consenso che il blocco aveva perso. */
test('NOTIF-PC-03c an action named like an Object property takes the generic row, never a broken phrase', (t) => {
  impostaLingua('en'); t.after(() => impostaLingua('it'));
  assert.equal(fraseDellaVoce(voce('azione-persona', { azione: 'constructor', stato: { visto: true, risolto: true } })).frase, 'New notice');
  assert.equal(fraseDellaVoce(voce('azione-persona', { azione: 'inventata', stato: { visto: true, risolto: true } })).frase, 'New notice');
  const generica = fraseDellaVoce(voce('approvazione', { azione: 'inventata' })).frase;
  assert.equal(fraseDellaVoce(voce('approvazione', { azione: 'toString' })).frase, generica);
  assert.equal(fraseDellaVoce(voce('approvazione', { azione: '__proto__' })).frase, generica);
});

test('NOTIF-PC-03d the consent line: only «default» can be asked; denied, granted and an unsupported browser cannot', () => {
  assert.equal(statoConsensoNotifiche('default').chiedibile, true);
  assert.equal(statoConsensoNotifiche('granted').chiedibile, false);
  assert.equal(statoConsensoNotifiche('denied').chiedibile, false);
  assert.equal(statoConsensoNotifiche('default', false).chiedibile, false);
  const frasi = new Set([statoConsensoNotifiche('default').testo, statoConsensoNotifiche('granted').testo, statoConsensoNotifiche('denied').testo, statoConsensoNotifiche('default', false).testo]);
  assert.equal(frasi.size, 4, 'each state has its own sentence');
});

test('NOTIF-PC-04 the day label: today, yesterday, then the date; a broken instant gives nothing', (t) => {
  impostaLingua('en'); t.after(() => impostaLingua('it'));
  const adesso = new Date(2026, 9, 31, 12, 0);
  assert.equal(giornoDi(new Date(2026, 9, 31, 8, 0).toISOString(), adesso), 'Today');
  assert.equal(giornoDi(new Date(2026, 9, 30, 23, 0).toISOString(), adesso), 'Yesterday');
  assert.ok(giornoDi(new Date(2026, 9, 20, 9, 0).toISOString(), adesso).length > 3);
  assert.equal(giornoDi('non-una-data', adesso), '');
});

test('NOTIF-PC-05 the system notification: permission, once per entry, never for the person\'s actions, quiet only when you look at that session', () => {
  const p = voce('approvazione', { id: 'approvazione:s1:r1' });
  const azione = voce('azione-persona', { id: 'azione-persona:s1:r1', azione: 'consentito', stato: { visto: true, risolto: true } });
  const risolta = voce('domanda', { id: 'domanda:s1:q1', stato: { visto: false, risolto: true } });
  assert.deepEqual(deveAvvisareFuoriDallaFinestra({ permesso: 'default', visibile: false, voci: [p] }), []);
  assert.deepEqual(deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: false, voci: [p, azione, risolta] }).map((v) => v.id), ['approvazione:s1:r1']);
  assert.deepEqual(deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: false, voci: [p], giaAvvisate: ['approvazione:s1:r1'] }), [], 'once per entry');
  /* il difetto di app.js:9362: la sessione aperta non avvisava mai, nemmeno a finestra nascosta */
  assert.equal(deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: false, sessioneGuardata: 's1', voci: [p] }).length, 1, 'hidden window: it notifies even for the open session');
  assert.deepEqual(deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: true, sessioneGuardata: 's1', voci: [p] }), [], 'visible and that session open: quiet');
  assert.equal(deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: true, sessioneGuardata: 's2', voci: [p] }).length, 1, 'visible but another session: it notifies');
  const testo = testoNotificaSistema(voce('approvazione', { id: 'approvazione:s1:r9', azione: 'shell', dato: { genere: 'comando', valore: 'npm test' } }));
  assert.equal(testo.titolo, 'Redesign sidebar');
  assert.match(testo.corpo, /npm test/u);
  assert.equal(testo.tag, 'approvazione:s1:r9');
});

test('NOTIF-PC-06 (Frontend review 31/10) the document sentence has no placeholder; no dangling colon without data; deep research without data', (t) => {
  impostaLingua('it'); t.after(() => impostaLingua('it'));
  const documento = fraseDellaVoce(voce('approvazione', { azione: 'document_create', dato: { genere: 'file', valore: 'rapporto.docx' } }));
  assert.equal(documento.frase, 'Vuole creare questo documento:');
  assert.doesNotMatch(documento.frase, /\{|formato/u);
  assert.equal(fraseDellaVoce(voce('domanda')).frase, 'Ha una domanda');
  assert.equal(fraseDellaVoce(voce('approvazione', { azione: 'scrivi' })).frase, 'Vuole scrivere questo file');
  assert.equal(fraseDellaVoce(voce('azione-persona', { azione: 'consentito', stato: { visto: true, risolto: true } })).frase, 'Hai consentito');
  assert.equal(fraseDellaVoce(voce('approvazione', { azione: 'research_start' })).frase, 'Vuole avviare una ricerca approfondita');
  assert.equal(testoNotificaSistema(voce('domanda', { id: 'domanda:s1:q' })).corpo, 'Ha una domanda');
  /* AL CONTRARIO: con il dato i due punti restano */
  assert.equal(fraseDellaVoce(voce('domanda', { dato: { genere: 'testo', valore: 'Quale?' } })).frase, 'Ha una domanda:');
});

test('NOTIF-PC-07 (Frontend review 31/10) the day follows TALOS language, not the browser', (t) => {
  impostaLingua('en'); t.after(() => impostaLingua('it'));
  const adesso = new Date(2026, 9, 31, 12, 0);
  assert.match(giornoDi(new Date(2026, 9, 20, 9, 0).toISOString(), adesso), /October/u);
  impostaLingua('it');
  assert.match(giornoDi(new Date(2026, 9, 20, 9, 0).toISOString(), adesso), /ottobre/u);
});

test('NOTIF-PC-08 (Frontend review 31/10) visible window: only what waits for you, never the session you look at; hidden: every fact that notifies', () => {
  const fine = voce('fine', { id: 'fine:s9:giro-1', porta: { tipo: 'sessione', id: 's9' } });
  const giro = voce('giro-finito', { id: 'giro:a1:r1', porta: { tipo: 'automazione', id: 'a1' } });
  const permesso = voce('approvazione', { id: 'approvazione:s9:r1', porta: { tipo: 'sessione', id: 's9' } });
  assert.deepEqual(deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: true, sessioneGuardata: 's1', voci: [fine, giro, permesso] }).map((v) => v.id), ['approvazione:s9:r1']);
  assert.deepEqual(deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: false, sessioneGuardata: 's1', voci: [fine, giro, permesso] }).map((v) => v.id), ['fine:s9:giro-1', 'giro:a1:r1', 'approvazione:s9:r1']);
});

test('NOTIF-PC-09 (live photo 31/10) an automation turn with its summary: the outcome takes the colon, without a summary it does not', (t) => {
  impostaLingua('it'); t.after(() => impostaLingua('it'));
  const con = fraseDellaVoce(voce('giro-finito', { porta: { tipo: 'automazione', id: 'a1' }, dato: { genere: 'testo', valore: 'Ho controllato i report.' } }));
  assert.equal(con.frase, 'Fatto:');
  assert.equal(con.dato.valore, 'Ho controllato i report.');
  assert.equal(fraseDellaVoce(voce('giro-finito', { porta: { tipo: 'automazione', id: 'a1' } })).frase, 'Fatto');
});

test('NOTIF-PC-10 (CLI and Frontend 31/10) your change of a card: «Hai modificato» / «You changed», a lighter row, no dangling colon', (t) => {
  impostaLingua('it'); t.after(() => impostaLingua('it'));
  const riga = fraseDellaVoce(voce('azione-persona', { azione: 'modificato', stato: { visto: true, risolto: true } }));
  assert.equal(riga.frase, 'Hai modificato');
  assert.equal(riga.traccia, true);
  assert.equal(riga.glifo, 'i-check');
  impostaLingua('en');
  assert.equal(fraseDellaVoce(voce('azione-persona', { azione: 'modificato', stato: { visto: true, risolto: true } })).frase, 'You changed');
});

/* Phase 8 adversarial review, REV8-07: the `impostazioni` fact (a setting the model changed) had no drawn row — it fell into the generic
   «unknown» row with the bell, once per change, so it stayed out of the window list. 02/11/2026: the row is drawn (closed sketch FE-055,
   `impostazioni-dalla-chat.test.mjs` IMPC-14), so it enters «All» with its own sentence — still never in «To do», never counted, never
   a system notification, and never the generic «unknown» row. */
test('NOTIF-PC-11 (REV8-07, row drawn 02/11) the settings fact is in «All» with its own row; never in «To do», never «unknown»', () => {
  const voci = [voce('fine', { seq: 1, istante: '2026-10-31T09:00:00.000Z' }), voce('impostazioni', { seq: 2, istante: '2026-10-31T11:00:00.000Z', stato: { visto: false, risolto: true },
    impostazioni: { ricevuta: 'set-a', cambi: [{ chiave: 'tools.webSearchSource', prima: 'tavily', dopo: 'duckduckgo' }], confermatoDa: { tipo: 'finestra-pc' } } })];
  assert.deepEqual(vociInOrdine(voci).map((v) => v.fatto), ['impostazioni', 'fine']);
  assert.deepEqual(vociDaFare(voci), []);
  assert.equal(FATTI_SENZA_RIGA.has('impostazioni'), false);
  assert.notEqual(fraseDellaVoce(voci[1]).frase, fraseDellaVoce(voce('sconosciuto')).frase, 'never the generic «unknown» row');
  assert.equal(fraseDellaVoce(voci[1]).glifo, 'i-settings');
  assert.deepEqual(vociInOrdine([voce('fine'), voce('domanda')]).map((v) => v.fatto).sort(), ['domanda', 'fine'], 'every other fact stays');
});

/*
 * D23 of the 02/11 run (photo `n1-campanella`): two «Finished» at 20:59 for the same chat. Cause, read in the 4174 register (`r4-treno/harness-ui/.notifiche.jsonl`,
 * lines 47-48): two real turns of that chat, closed 7 s apart (`giro-5818` at 19:59:45.865Z, `giro-5850` at 19:59:52.703Z). Each turn has its own entry, and the two
 * rows read the same: same chat, same word, same minute. Such twins become one row, the newer, the way a Web Notification with the same `tag` replaces the older
 * one (MDN «Notification: tag»). Different minutes, days or chats stay, as NOTIF-PC-03b wants.
 */
test('NOTIF-PC-D23 (decision 62) two «Finished» of the same chat are one row, the newer, at any distance; another chat or kind keeps both', () => {
  const s = (id, istante, seq, extra = {}) => voce('fine', { id, seq, istante, ...extra });
  const prima = s('fine:s1:giro-5818', '2026-11-02T19:59:45.865Z', 47);
  const dopo = s('fine:s1:giro-5850', '2026-11-02T19:59:52.703Z', 48);
  assert.deepEqual(vociInOrdine([prima, dopo]).map((v) => v.id), ['fine:s1:giro-5850']);
  assert.deepEqual(vociInOrdine([dopo, prima]).map((v) => v.id), ['fine:s1:giro-5850'], 'whatever order the server sends');
  /* AL CONTRARIO */
  /* decisione 62 dell'owner (03/11/2026): un altro minuto, un altro giorno della stessa chat è la stessa riga, la più recente */
  const altroMinuto = s('fine:s1:giro-5700', '2026-11-02T19:58:59.000Z', 46);
  assert.deepEqual(vociInOrdine([prima, altroMinuto]).map((v) => v.id), ['fine:s1:giro-5818'], 'another minute of the same chat is the same row');
  const altroGiorno = s('fine:s1:giro-1', '2026-10-30T08:00:00.000Z', 3);
  assert.deepEqual(vociInOrdine([altroGiorno, dopo]).map((v) => v.id), ['fine:s1:giro-5850'], 'another day too');
  const altraChat = s('fine:s2:giro-1', '2026-11-02T19:59:50.000Z', 50, { cosa: { tipo: 'sessione', id: 's2', nome: 'Other' } });
  assert.deepEqual(vociInOrdine([prima, altraChat]).map((v) => v.id), ['fine:s2:giro-1', 'fine:s1:giro-5818'], 'another chat is another row');
  const interrotta = voce('interrotta', { id: 'interrotta:s1:giro-5830', seq: 51, istante: '2026-11-02T19:59:50.000Z' });
  assert.deepEqual(vociInOrdine([prima, interrotta, dopo]).map((v) => v.id), ['fine:s1:giro-5850', 'interrotta:s1:giro-5830'], 'only «Finished» twins merge');
  const senzaData = s('fine:s1:rotta', 'non-una-data', 52);
  assert.deepEqual(vociInOrdine([senzaData, s('fine:s1:rotta2', 'non-una-data', 53)]).map((v) => v.id), ['fine:s1:rotta2', 'fine:s1:rotta'], 'no time, no twin');
  const automazione = voce('fine', { id: 'fine:a', seq: 54, istante: '2026-11-02T19:59:46.000Z', cosa: { tipo: 'automazione', id: 's1', nome: 'x' } });
  assert.equal(vociInOrdine([prima, automazione]).length, 2, 'same id but another kind of thing');
});

/*
 * G1 of the fourth token review: with decision 62 the twin key is only the kind and the id of the thing. A «Finished» with no `cosa.id` (an old register line, a
 *   thing with no chat, a broken entry) had the key `sessione\0undefined`, so every such entry, of any chat or of none, folded into one row and the others vanished.
 *   Without an id there is no «same chat» to speak of: the entry keeps its own row.
 */
test('NOTIF-PC-G1 a «Finished» with no thing id never merges: each keeps its row, whatever its kind; with an id the rule of decision 62 stays', () => {
  const s = (id, istante, seq, cosa) => voce('fine', { id, seq, istante, cosa });
  const senzaId = s('fine:x:1', '2026-11-02T19:59:45.000Z', 1, { tipo: 'sessione', nome: 'A' });
  const altroSenzaId = s('fine:y:2', '2026-11-02T20:10:00.000Z', 2, { tipo: 'sessione', nome: 'B' });
  const idVuoto = s('fine:z:3', '2026-11-02T20:20:00.000Z', 3, { tipo: 'sessione', id: '', nome: 'C' });
  const idNullo = s('fine:w:4', '2026-11-02T20:30:00.000Z', 4, { tipo: 'sessione', id: null, nome: 'D' });
  const senzaCosa = s('fine:v:5', '2026-11-02T20:40:00.000Z', 5, undefined);
  const altraSenzaCosa = s('fine:u:6', '2026-11-02T20:50:00.000Z', 6, null);
  assert.deepEqual(vociInOrdine([senzaId, altroSenzaId, idVuoto, idNullo, senzaCosa, altraSenzaCosa]).map((v) => v.id),
    ['fine:u:6', 'fine:v:5', 'fine:w:4', 'fine:z:3', 'fine:y:2', 'fine:x:1']);
  assert.ok(vociInOrdine([senzaId, altroSenzaId]).every((v) => v.gemelle === undefined), 'no hidden twins without an id');
  /* two of each empty spelling: a null id and an empty id are no chat either */
  const altroIdVuoto = s('fine:z:7', '2026-11-02T20:21:00.000Z', 30, { tipo: 'sessione', id: '', nome: 'C2' });
  const altroIdNullo = s('fine:w:8', '2026-11-02T20:31:00.000Z', 31, { tipo: 'sessione', id: null, nome: 'D2' });
  assert.equal(vociInOrdine([idVuoto, altroIdVuoto]).length, 2, 'two empty ids');
  assert.equal(vociInOrdine([idNullo, altroIdNullo]).length, 2, 'two null ids');
  /* AL CONTRARIO: with an id, two «Finished» of the same chat are still one row (decision 62), also next to entries without one */
  const conId = s('fine:s1:a', '2026-11-02T19:00:00.000Z', 7, { tipo: 'sessione', id: 's1', nome: 'E' });
  const conIdDopo = s('fine:s1:b', '2026-11-02T21:00:00.000Z', 8, { tipo: 'sessione', id: 's1', nome: 'E' });
  assert.deepEqual(vociInOrdine([conId, senzaId, conIdDopo, altroSenzaId]).map((v) => v.id), ['fine:s1:b', 'fine:y:2', 'fine:x:1']);
  const zero = s('fine:n:0', '2026-11-02T18:00:00.000Z', 9, { tipo: 'sessione', id: 0, nome: 'F' });
  const zeroDopo = s('fine:n:1', '2026-11-02T18:30:00.000Z', 10, { tipo: 'sessione', id: 0, nome: 'F' });
  assert.deepEqual(vociInOrdine([zero, zeroDopo]).map((v) => v.id), ['fine:n:1'], 'a numeric id 0 is still an id');
});

/*
 * N9 of the second token review (S4): the hidden twin stayed «not seen» forever. Touching the visible row marked only its own id, and «Mark all as seen» disappeared
 *   when the only unseen entry was the hidden one, because the panel looked at the merged list. The kept row now carries its twins (`gemelle`), reads unseen while
 *   any of them is, and the panel asks the full list whether something is left to mark.
 */
test('NOTIF-PC-N9 the kept row carries its hidden twins and reads unseen while one is; «Mark all» looks at every entry', async () => {
  const { daSegnareViste, ceAncoraDaSegnare } = await import('../../src/components/notifiche.js');
  const s = (id, istante, seq, visto) => voce('fine', { id, seq, istante, stato: { visto, risolto: false } });
  const vecchia = s('fine:s1:giro-5818', '2026-11-02T19:59:45.865Z', 47, false);
  const nuova = s('fine:s1:giro-5850', '2026-11-02T19:59:52.703Z', 48, true);
  const [riga] = vociInOrdine([vecchia, nuova]);
  assert.equal(riga.id, 'fine:s1:giro-5850');
  assert.deepEqual(riga.gemelle, ['fine:s1:giro-5818']);
  assert.equal(riga.stato.visto, false, 'unseen while a twin is unseen');
  assert.deepEqual(daSegnareViste(riga), ['fine:s1:giro-5850', 'fine:s1:giro-5818'], 'touching the row marks the twins too');
  assert.equal(nuova.stato.visto, true, 'the register entry is not changed by the list');
  assert.equal(ceAncoraDaSegnare([vecchia, nuova]), true, 'the hidden unseen twin keeps «Mark all»');
  /* AL CONTRARIO */
  assert.equal(ceAncoraDaSegnare([s('a', '2026-11-02T19:59:45.865Z', 1, true), s('b', '2026-11-02T19:59:52.703Z', 2, true)]), false);
  assert.equal(ceAncoraDaSegnare([voce('impostazioni', { stato: { visto: false, risolto: true } })]), true);
  assert.equal(ceAncoraDaSegnare([]), false);
  const sola = vociInOrdine([s('x', '2026-11-02T19:00:00.000Z', 3, true)])[0];
  assert.equal(Object.hasOwn(sola, 'gemelle'), false, 'no twin, no field');
  assert.deepEqual(daSegnareViste(sola), ['x']);
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /void segnaNotificheViste\(daSegnareViste\(voce\)\);/u);
  const modulo = readFileSync(new URL('../../src/components/notifiche.js', import.meta.url), 'utf8');
  assert.match(modulo, /if \(ceAncoraDaSegnare\(voci\)\) \{/u);
});
