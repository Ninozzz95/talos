import test from 'node:test';
import assert from 'node:assert/strict';
import { consumoPerGiorno, consumoPerModello, riepilogoConsumo, giornoDi, giornoUmano, compatto } from '../../src/components/costi-consumo.js';
import { pesoAttrezzi, ripartizioneContesto, frasiRipartizione } from '../../src/components/contesto.js';

/*
 * 06/09 — D21/D22 (costi e consumo) e D26 (ripartizione del contesto).
 * ⛔ Ogni regola è provata anche AL VERSO CONTRARIO: quello che non sappiamo
 * non deve comparire come zero, e un totale deve dire chi ha lasciato fuori.
 */

/*
 * ⛔⛔⛔ 06/9 — questo fixture era scritto a mano e NON somigliava al corpo vero
 * di `/api/v1/sessions`: la data lì si chiama `avviataAlle` (non `avviata`) e i
 * giri stanno dentro il consumo (non a livello di sessione). Con quei nomi la
 * pagina Costi contava zero su tutto, e il test era verde lo stesso. Adesso il
 * fixture ha la forma VERA — `usageSessione`, il totale della conversazione
 * (CB-04) — e i vecchi nomi restano provati a parte, come compatibilità.
 */
const GIORNO = (giorno, extra = {}) => ({ avviataAlle: `${giorno}T10:00:00.000Z`, modello: 'z-ai/glm-5.3-flash', usageSessione: { prompt_tokens: 1000, completion_tokens: 200, cached_tokens: 800, giri: 3, esecuzioni: 2 }, ...extra });

test('COSTI-GIORNO: si raggruppa per giorno locale, dal più recente', () => {
  const righe = consumoPerGiorno([GIORNO('2026-09-06'), GIORNO('2026-09-06'), GIORNO('2026-09-05')]);
  assert.equal(righe.length, 2);
  assert.equal(righe[0].chiave, '2026-09-06');
  assert.equal(righe[0].sessioni, 2);
  assert.equal(righe[0].token, 2400);
  assert.equal(righe[0].giri, 6);
  assert.equal(righe[1].chiave, '2026-09-05');
  // ⛔ verso contrario: una sessione senza data NON finisce in un giorno inventato
  assert.equal(giornoDi({}), null);
  assert.equal(consumoPerGiorno([{ giri: 1 }]).length, 0);
});

test('COSTI-MODELLO: si raggruppa per modello, dal più consumato', () => {
  const righe = consumoPerModello([
    GIORNO('2026-09-06', { modello: 'a/uno', usageSessione: { prompt_tokens: 10, completion_tokens: 0 } }),
    GIORNO('2026-09-06', { modello: 'b/due', usageSessione: { prompt_tokens: 900, completion_tokens: 100 } }),
  ]);
  assert.deepEqual(righe.map((r) => r.chiave), ['b/due', 'a/uno']);
  // ⛔ verso contrario: senza modello dichiarato la riga non si inventa
  assert.equal(consumoPerModello([{ avviataAlle: '2026-09-06T10:00:00Z', modello: '' }]).length, 0);
});

test('COSTI-SESSIONE: si contano i token di TUTTA la conversazione, non quelli dell ultimo invio (CB-04)', () => {
  // Il corpo vero: `usage` è l'ultimo invio, `usageSessione` la somma dei tre.
  const sessione = {
    avviataAlle: '2026-09-06T10:00:00.000Z', modello: 'z-ai/glm-5.3-flash',
    usage: { prompt_tokens: 7716, completion_tokens: 25, cached_tokens: 7616, giri: 1 },
    usageSessione: { prompt_tokens: 23060, completion_tokens: 121, cached_tokens: 15232, giri: 3, esecuzioni: 3 },
  };
  const [riga] = consumoPerGiorno([sessione]);
  assert.equal(riga.token, 23181, '⛔ 7.741 sarebbe il solo ultimo invio: misurato su tre invii veri');
  assert.equal(riga.cache, 15232);
  assert.equal(riga.giri, 3, 'i giri stanno dentro il consumo, non a livello di sessione');
  // ⛔ AL CONTRARIO — una registrazione vecchia, senza `usageSessione`, non sparisce: si legge
  //    quello che c'è (l'ultimo invio) invece di dichiarare zero.
  const vecchia = { avviataAlle: sessione.avviataAlle, modello: sessione.modello, usage: sessione.usage };
  assert.equal(consumoPerGiorno([vecchia])[0].token, 7741);
  // ⛔ AL CONTRARIO — un campo `giri` a livello di sessione non esiste nel corpo vero e non
  //    deve diventare un numero: quello era il difetto («0 giri» su ogni riga, oppure inventati).
  assert.equal(consumoPerGiorno([{ avviataAlle: sessione.avviataAlle, modello: 'a/uno', giri: 99, usageSessione: { prompt_tokens: 1, completion_tokens: 1 } }])[0].giri, 0);
});

test('COSTI-CHI-MANCA: il riepilogo dichiara le sessioni che NON ha potuto contare', () => {
  const r = riepilogoConsumo([
    GIORNO('2026-09-06'),
    { avviataAlle: '2026-09-06T10:00:00Z', modello: 'a/uno' }, // senza usage
    { modello: 'a/uno', usageSessione: { prompt_tokens: 5, completion_tokens: 5 } }, // senza data
    { avviataAlle: '2026-09-06T10:00:00Z', usageSessione: { prompt_tokens: 1, completion_tokens: 1 } }, // senza modello
  ]);
  assert.equal(r.sessioni, 4);
  assert.equal(r.senzaToken, 1);
  assert.equal(r.senzaData, 1);
  assert.equal(r.senzaModello, 1);
  // il totale è di CHI aveva i token, non di tutti
  assert.equal(r.token, 1200 + 10 + 2);
});

test('COSTI-NUMERI: compatto e giorni in parole', () => {
  assert.equal(compatto(950), '950');
  assert.equal(compatto(12_600_000), '12,6 M');
  assert.equal(compatto(-1), '—');
  const oggi = new Date(2026, 8, 6);
  assert.equal(giornoUmano('2026-09-06', oggi), 'oggi');
  assert.equal(giornoUmano('2026-09-05', oggi), 'ieri');
  assert.match(giornoUmano('2026-08-30', oggi), /30/);
});

test('CONTESTO-PESO: si somma quello dichiarato e si contano quelli che NON dichiarano', () => {
  const p = pesoAttrezzi([{ tokenSchemaStimati: 60, categoria: 'base' }, { tokenSchemaStimati: 124, categoria: 'base' }, { categoria: 'esteso' }]);
  assert.equal(p.token, 184);
  assert.equal(p.senzaStima, 1);
  assert.equal(p.contati, 2);
  assert.equal(p.totale, 3);
});

test('CONTESTO-RIPARTIZIONE: la percentuale esiste solo se la finestra è dichiarata', () => {
  const attrezzi = [{ tokenSchemaStimati: 7454, categoria: 'base' }];
  const con = ripartizioneContesto({ attrezzi, finestra: 131_072 });
  assert.equal(con.occupato, 7454);
  assert.ok(con.percentuale > 5 && con.percentuale < 6);
  assert.equal(con.libero, 131_072 - 7454);
  // ⛔ verso contrario: senza finestra NON si sceglie un valore di comodo
  const senza = ripartizioneContesto({ attrezzi });
  assert.equal(senza.percentuale, null);
  assert.equal(senza.libero, null);
  assert.match(frasiRipartizione(senza), /finestra del modello non dichiarata/);
  assert.match(frasiRipartizione(con), /% della finestra/);
});

test('CONTESTO-ZERO-NON-E-IGNOTO: una voce che non so misurare NON compare come 0', () => {
  const attrezzi = [{ tokenSchemaStimati: 100 }];
  // trovato dal vivo il 06/09: Number(null) vale 0 ed è finito ⇒ compariva «Istruzioni di sistema · 0 token»
  const senza = ripartizioneContesto({ attrezzi, istruzioniToken: null, memoriaToken: undefined });
  assert.deepEqual(senza.voci.map((v) => v.id), ['attrezzi']);
  // quando invece il dato c'è davvero, anche se è zero, la riga si vede
  const con = ripartizioneContesto({ attrezzi, istruzioniToken: 0 });
  assert.deepEqual(con.voci.map((v) => v.id), ['attrezzi', 'istruzioni']);
});

test('CONTESTO-CHI-MANCA: se degli attrezzi non dichiarano il peso, la frase lo dice', () => {
  const r = ripartizioneContesto({ attrezzi: [{ tokenSchemaStimati: 100 }, {}, {}], finestra: 1000 });
  assert.match(frasiRipartizione(r), /2 attrezzi su 3 non dichiarano quanto pesano/);
});

test('CONTESTO-PROMESSA: quello che la sezione promette e non misura lo DICHIARA', () => {
  // Il cappello promette attrezzi + istruzioni + ricordi: se due non si misurano, vanno NOMINATI.
  const solo = ripartizioneContesto({ attrezzi: [{ tokenSchemaStimati: 100 }] });
  assert.deepEqual(solo.mancanti, ['istruzioni', 'memoria']);
  const conIstruzioni = ripartizioneContesto({ attrezzi: [{ tokenSchemaStimati: 100 }], istruzioniToken: 300 });
  assert.deepEqual(conIstruzioni.mancanti, ['memoria']);
  // ⛔ verso contrario: quando ci sono tutte, non si dichiara nessuna mancanza
  const tutte = ripartizioneContesto({ attrezzi: [{ tokenSchemaStimati: 100 }], istruzioniToken: 300, memoriaToken: 50 });
  assert.deepEqual(tutte.mancanti, []);
  assert.equal(tutte.occupato, 450);
});

// 12/09: 44 — è entrato `research_deposit` (la consegna del rapporto della ricerca approfondita, L1).
test('C10-DESCRIZIONI: 44 attrezzi, tutte in italiano, senza markdown a schermo', async () => {
  const m = await import('../../src/components/nomi-attrezzi.js');
  const ids = Object.keys(m.DESCRIZIONI_ATTREZZI);
  assert.equal(ids.length, 44);
  for (const id of ids) {
    const d = m.descrizioneAttrezzo(id);
    assert.ok(d && d.length > 10, `descrizione troppo corta per ${id}`);
    // ⛔ finiscono in textContent: il markdown si vedrebbe LETTERALE (visto in una foto del 06/09)
    assert.ok(!/\*\*|\[[^\]]*\]\(/.test(d), `markdown a schermo in ${id}: ${d}`);
    assert.ok(d.trim().endsWith('.'), `manca il punto finale in ${id}`);
  }
  // ⛔ verso contrario: un id che non esiste NON riceve una frase inventata
  assert.equal(m.descrizioneAttrezzo('non_esiste'), null);
  assert.equal(m.descrizioneAttrezzo('__proto__'), null);
  assert.deepEqual(m.attrezziSenzaDescrizione(['elenca', 'non_esiste']), ['non_esiste']);
});

test('G29-NOTIFICA-SISTEMA: si manda solo col permesso, solo a finestra nascosta, una volta sola', async () => {
  const m = await import('../../src/components/notifiche.js');
  const una = [{ sessione: { sessionId: 's1', nome: 'Pulizia store' }, stato: 'approvazione' }];
  // ⛔ senza permesso non si manda niente, e non si chiede di nascosto
  assert.deepEqual(m.deveAvvisareFuoriDallaFinestra({ permesso: 'default', visibile: false, notifiche: una }), []);
  assert.deepEqual(m.deveAvvisareFuoriDallaFinestra({ permesso: 'denied', visibile: false, notifiche: una }), []);
  // ⛔ con la finestra sotto gli occhi non si manda: quello che aspetta si vede già
  assert.deepEqual(m.deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: true, notifiche: una }), []);
  // col permesso e la finestra nascosta, si manda
  assert.equal(m.deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: false, notifiche: una }).length, 1);
  // ⛔ e una volta sola: la chiave è sessione:stato
  assert.deepEqual(m.deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: false, notifiche: una, giaAvvisate: ['s1:approvazione'] }), []);
  // ma un NUOVO stato della stessa sessione è una notifica nuova
  const conclusa = [{ sessione: { sessionId: 's1' }, stato: 'conclusa' }];
  assert.equal(m.deveAvvisareFuoriDallaFinestra({ permesso: 'granted', visibile: false, notifiche: conclusa, giaAvvisate: ['s1:approvazione'] }).length, 1);
  const t = m.testoNotificaSistema(una[0]);
  assert.equal(t.tag, 's1:approvazione');
  assert.match(t.corpo, /Pulizia store/);
  // lo stato del consenso dice il vero, e non offre di richiedere quando è negato
  assert.equal(m.statoConsensoNotifiche('granted').chiedibile, false);
  assert.equal(m.statoConsensoNotifiche('denied').chiedibile, false);
  assert.equal(m.statoConsensoNotifiche('default').chiedibile, true);
  assert.equal(m.statoConsensoNotifiche('default', false).chiedibile, false);
});

test('BH-12 PLURALE: «1 ricordi» non esiste più, e lo zero prende il plurale', async () => {
  const { plurale, parola } = await import('../../src/components/plurale.js');
  assert.equal(plurale(1, 'ricordo'), '1 ricordo');
  assert.equal(plurale(2, 'ricordo'), '2 ricordi');
  // ⛔ in italiano lo ZERO prende il plurale: non basta `n === 1`
  assert.equal(plurale(0, 'ricordo'), '0 ricordi');
  assert.equal(plurale(1, 'attrezzo'), '1 attrezzo');
  assert.equal(plurale(1, 'sessione'), '1 sessione');
  assert.equal(plurale(1, 'controllo'), '1 controllo');
  // gli invariabili restano invariabili, e sono dichiarati apposta
  assert.equal(plurale(1, 'file'), '1 file');
  assert.equal(plurale(9, 'file'), '9 file');
  assert.equal(plurale(1, 'attività'), '1 attività');
  assert.equal(plurale(9, 'attività'), '9 attività');
  /*
   * I numeri grandi si formattano all'italiana — e l'italiano NON raggruppa i
   * numeri di quattro cifre (regola «min2» di CLDR: il separatore compare da
   * cinque in su). Verificato su questo runtime, non dedotto: è il motivo per
   * cui «7454 token» a schermo è giusto e «7.454» sarebbe sbagliato.
   */
  assert.equal(plurale(1234, 'sessione'), '1234 sessioni');
  assert.equal(plurale(12345, 'sessione'), '12.345 sessioni');
  // ⛔ verso contrario: un numero che non è un numero non produce «NaN ricordi»
  assert.equal(plurale(undefined, 'ricordo'), '0 ricordi');
  assert.equal(plurale(NaN, 'ricordo'), '0 ricordi');
  assert.equal(parola(1, 'giro'), 'giro');
});
