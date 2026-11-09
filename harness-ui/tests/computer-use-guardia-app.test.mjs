/*
 * La modalità guardia sulle APP delicate (decisione 145 bis, owner 04/11): elenco gemello di quello dei siti, banche e pagamenti
 * riconosciuti dal nome del pacchetto. Stesse regole: spenta di serie, elenco fisso, la persona aggiunge e non toglie, 5 minuti.
 * Condizioni del Mobile (04/11 12:50): confronto esatto senza prefissi, un rifiuto dice perché, l'app manca ⇒ null.
 * Pacchetti verificati sul Play Store il 04/11; forma da developer.android.com/build/configure-app-module (letto il 04/11).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_DELICATE, APP_DI_PASSAGGIO, STATO_GUARDIA_VUOTO, appDelicata, elencoAppGuardia, elencoGuardia, elencoPassaggio, pacchettoValido, passoGuardia,
  siDellaPersona,
} from '../src/computer-use/guardia.mjs';

const MIN = 60 * 1000;
const T0 = 1_000_000;
const elenco = elencoGuardia();
const elencoApp = elencoAppGuardia();
const passo = (o) => passoGuardia({ accesa: true, elenco, elencoApp, adesso: T0, ...o });
// variante A (decisione 145): dentro la guardia l'esito è «dentro»; senza un sì fresco il ciclo chiede prima di un'azione che cambia
const esito = (r) => (r.esito === 'dentro' ? (r.fresco === true ? 'coperto' : 'da-chiedere') : r.esito);

test('APP-01: spenta di serie, nessun effetto nemmeno dentro l\'app di una banca', () => {
  for (const accesa of [false, undefined, 'true', 1]) {
    const r = passoGuardia({ accesa, origine: null, app: 'com.unicredit', elenco, elencoApp, adesso: T0 });
    assert.equal(r.esito, 'nulla', String(accesa));
  }
});

test('APP-02: elenco di partenza fisso, già nella forma di un pacchetto, banche e pagamenti verificati', () => {
  assert.ok(Object.isFrozen(APP_DELICATE) && Object.isFrozen(elencoApp));
  for (const voce of ['com.unicredit', 'com.latuabancaperandroid', 'com.paypal.android.p2pmobile', 'com.satispay.customer',
    'it.pagopa.io.app', 'com.revolut.revolut', 'com.posteitaliane.spim',
    'posteitaliane.posteapp.appposteid' /* PosteID, owner 04/11 12:59 */]) assert.ok(APP_DELICATE.includes(voce), voce);
  for (const voce of APP_DELICATE) assert.deepEqual(pacchettoValido(voce), { ok: true, pacchetto: voce }, voce);
  assert.ok(!APP_DELICATE.includes('com.ing.mobile'), 'ING Nederland, non ING Italia');
});

test('APP-03: dentro l\'app di una banca con la guardia accesa si chiede, prima del sì nessuna azione', () => {
  const r = passo({ origine: null, app: 'com.unicredit' });
  assert.deepEqual(r, { esito: 'dentro', sito: 'com.unicredit', genere: 'app', motivo: 'ingresso', fresco: false,
    stato: { sito: 'com.unicredit', siAl: null, app: 'com.unicredit' } }, 'variante A: lo stato tiene l\'app anche prima del sì (posto)');
  // il ciclo del telefono passa il pacchetto anche come origine (`origineDi`): vale lo stesso
  assert.equal(esito(passo({ origine: 'com.unicredit', app: 'com.unicredit' })), 'da-chiedere');
  assert.equal(passo({ origine: 'com.unicredit', app: 'com.unicredit' }).genere, 'app');
});

test('APP-04: confronto esatto, niente prefissi né nomi che finiscono allo stesso modo', () => {
  assert.equal(appDelicata('com.unicredit', elencoApp), 'com.unicredit');
  assert.equal(appDelicata('COM.UniCredit', elencoApp), 'com.unicredit', 'maiuscole: verso sicuro, si riconosce');
  for (const no of ['com.unicredit.x', 'com.unicreditx', 'x.com.unicredit', 'com', 'unicredit', '', null, undefined, 42]) {
    assert.equal(appDelicata(no, elencoApp), null, String(no));
    assert.equal(passo({ origine: 'https://negozio.example', app: no }).esito, 'nulla', String(no));
  }
});

test('APP-05: Chrome su un sito delicato chiede per il sito (l\'app conta come OR, non toglie il sito)', () => {
  const r = passo({ origine: 'https://www.unicredit.it/', app: 'com.android.chrome' });
  assert.equal(esito(r), 'da-chiedere');
  assert.equal(r.sito, 'unicredit.it');
  assert.equal(r.genere, undefined, 'una voce dei siti resta come prima, senza campi nuovi');
  // sito e app delicati insieme: vale il sito, una carta sola
  assert.equal(passo({ origine: 'https://www.unicredit.it/', app: 'com.unicredit' }).sito, 'unicredit.it');
});

test('APP-06: aggiunte della persona, ognuna con un motivo leggibile quando si rifiuta', () => {
  assert.deepEqual(pacchettoValido(' com.miabanca.app '), { ok: true, pacchetto: 'com.miabanca.app' });
  assert.deepEqual(pacchettoValido('Com.MiaBanca'), { ok: true, pacchetto: 'com.miabanca' });
  const casi = { '': 'vuoto', '   ': 'vuoto', 'com': 'un-segmento', 'unicredit': 'un-segmento', 'Banca Fake': 'forma', '1abc.x': 'forma',
    'com.1banca': 'forma', 'com..banca': 'forma', '.com.banca': 'forma', 'com.banca.': 'forma', 'com.ban-ca': 'forma', 'com.bànca': 'forma' };
  for (const [x, motivo] of Object.entries(casi)) {
    const r = pacchettoValido(x);
    assert.equal(r.ok, false, x);
    assert.equal(r.motivo, motivo, x);
    assert.ok(typeof r.testo === 'string' && r.testo.length > 20 && !/undefined|null/u.test(r.testo), `testo leggibile per ${JSON.stringify(x)}`);
  }
  for (const x of [null, undefined, 42, {}, ['com.a']]) assert.equal(pacchettoValido(x).ok, false, String(x));
});

test('APP-07: l\'elenco in vigore si allarga e non si stringe; le voci non valide restano fuori', () => {
  const e = elencoAppGuardia(['com.miabanca.app', 'Banca Fake', 'com', null, 42, 'COM.UNICREDIT']);
  assert.ok(e.includes('com.miabanca.app'));
  for (const no of ['Banca Fake', 'banca fake', 'com', 'null', '42']) assert.ok(!e.includes(no), no);
  for (const voce of APP_DELICATE) assert.ok(e.includes(voce), voce);
  assert.equal(e.length, APP_DELICATE.length + 1, 'nessun doppione');
  assert.deepEqual(elencoAppGuardia('com.a.b'), elencoAppGuardia(), 'un valore che non è un elenco non aggiunge niente');
  assert.equal(esito(passoGuardia({ accesa: true, origine: null, app: 'com.miabanca.app', elenco, elencoApp: e, adesso: T0 })), 'da-chiedere');
});

test('APP-08: il sì vale 5 minuti anche per un\'app; nel compito (variante A) copre anche un\'altra app delicata', () => {
  const stato = siDellaPersona('com.unicredit', T0);
  assert.equal(esito(passo({ origine: null, app: 'com.unicredit', stato, adesso: T0 + 4 * MIN })), 'coperto');
  const tardi = passo({ origine: null, app: 'com.unicredit', stato, adesso: T0 + 5 * MIN });
  assert.equal(esito(tardi), 'da-chiedere'); assert.equal(tardi.motivo, 'tempo'); assert.equal(tardi.genere, 'app');
  assert.equal(esito(passo({ origine: null, app: 'com.revolut.revolut', stato, adesso: T0 + 1 })), 'coperto');
  assert.equal(passo({ origine: null, app: 'com.unicredit', stato, adesso: T0 + 1, schermoSpento: true }).motivo, 'schermo-spento');
});

test('APP-09: app illeggibile (null) e nessuna origine: si resta dove si era, dentro la guardia', () => {
  const stato = siDellaPersona('com.unicredit', T0);
  for (const app of [null, undefined, '']) {
    const r = passo({ origine: null, app, stato, adesso: T0 + 1 });
    assert.equal(esito(r), 'coperto', String(app));
    assert.equal(r.sito, 'com.unicredit');
    assert.equal(r.genere, 'app');
  }
  // l'app della banca senza indirizzo letto: si resta
  assert.equal(esito(passo({ origine: null, app: 'com.unicredit', stato, adesso: T0 + 1 })), 'coperto');
});

test('APP-09b (revisione Q, D2): senza indirizzo si resta solo nell\'app del sì; un\'app diversa esce', () => {
  // il sì per l'app della banca, poi Chrome su una pagina vuota: è un'altra app, si esce (un indirizzo delicato rientra da solo)
  assert.equal(passo({ origine: 'about:blank', app: 'com.android.chrome', stato: siDellaPersona('com.unicredit', T0), adesso: T0 + 1 }).esito, 'nulla');
  // il sì per il sito della banca preso in Chrome: Chrome su una pagina vuota resta dentro, un'altra app no
  const nelBrowser = siDellaPersona('unicredit.it', T0, 'com.android.chrome');
  assert.deepEqual(nelBrowser, { sito: 'unicredit.it', siAl: T0, app: 'com.android.chrome' });
  assert.equal(esito(passo({ origine: 'about:blank', app: 'com.android.chrome', stato: nelBrowser, adesso: T0 + 1 })), 'coperto');
  assert.equal(esito(passo({ origine: null, app: ' COM.ANDROID.CHROME ', stato: nelBrowser, adesso: T0 + 1 })), 'coperto', 'maiuscole e spazi');
  assert.equal(esito(passo({ origine: null, app: null, stato: nelBrowser, adesso: T0 + 1 })), 'coperto', 'app illeggibile: si resta');
  assert.equal(passo({ origine: null, app: 'com.whatsapp', stato: nelBrowser, adesso: T0 + 1 }).esito, 'nulla');
  // sul PC: il sì preso in Edge; una lettura senza barra dell'indirizzo in Edge resta, il Blocco note esce
  const pc = siDellaPersona('unicredit.it', T0, 'Microsoft Edge');
  assert.equal(esito(passoGuardia({ accesa: true, origine: null, app: 'Microsoft Edge', elenco, stato: pc, adesso: T0 + 1 })), 'coperto');
  assert.equal(passoGuardia({ accesa: true, origine: null, app: 'Blocco note', elenco, stato: pc, adesso: T0 + 1 }).esito, 'nulla');
  // senza app nel sì la forma dello stato non cambia (chi la copia, chi la confronta)
  assert.deepEqual(siDellaPersona('unicredit.it', T0), { sito: 'unicredit.it', siAl: T0 });
  assert.deepEqual(siDellaPersona('unicredit.it', T0, '  '), { sito: 'unicredit.it', siAl: T0 });
});

test('APP-10: uscire dall\'app delicata verso un\'app qualunque chiude la guardia; rientrare chiede di nuovo', () => {
  const stato = siDellaPersona('com.unicredit', T0);
  const fuori = passo({ origine: 'com.whatsapp', app: 'com.whatsapp', stato, adesso: T0 + 1 });
  assert.equal(fuori.esito, 'nulla');
  const dentro = passo({ origine: 'com.unicredit', app: 'com.unicredit', stato: fuori.stato, adesso: T0 + 2 });
  assert.equal(esito(dentro), 'da-chiedere'); assert.equal(dentro.motivo, 'ingresso');
});

test('APP-11: senza elenco delle app la regola dei siti resta identica (chiamate di prima)', () => {
  const r = passoGuardia({ accesa: true, origine: 'https://www.unicredit.it', elenco, adesso: T0 });
  assert.deepEqual(r, { esito: 'dentro', sito: 'unicredit.it', motivo: 'ingresso', fresco: false, stato: { sito: 'unicredit.it', siAl: null } });
  assert.equal(esito(passoGuardia({ accesa: true, origine: null, app: 'com.unicredit', elenco, adesso: T0 })), 'da-chiedere',
    'senza elencoApp vale quello di partenza');
});

test('APP-12 (passaggio): tendina, permessi, tastiera e TALOS davanti valgono come app illeggibile: si resta, e il loro indirizzo non conta', () => {
  const stato = siDellaPersona('com.unicredit', T0);
  for (const app of ['com.android.systemui', 'com.google.android.permissioncontroller', 'com.android.permissioncontroller', 'ai.talos', 'ai.talos.dev',
    'com.google.android.inputmethod.latin', ' AI.TALOS ', 'talos']) {
    assert.equal(esito(passo({ origine: null, app, stato, adesso: T0 + 1 })), 'coperto', app);
    assert.equal(esito(passo({ origine: 'http://127.0.0.1:4174', app, stato, adesso: T0 + 1 })), 'coperto', `${app} con indirizzo`);
  }
  assert.equal(passo({ origine: null, app: 'com.whatsapp', stato, adesso: T0 + 1 }).esito, 'nulla');
  // fuori dalla guardia un'app di passaggio non fa entrare né chiedere
  assert.equal(passo({ origine: null, app: 'com.android.systemui', adesso: T0 }).esito, 'nulla');
  // un sito delicato resta delicato anche con un'app di passaggio? no: l'indirizzo di una finestra di passaggio non è la pagina della persona
  assert.equal(passo({ origine: 'https://www.unicredit.it', app: 'ai.talos', adesso: T0 }).esito, 'nulla');
  // le aggiunte di chi monta il ciclo: valide, minuscole; il resto fuori
  const e = elencoPassaggio(['com.foo.ime', '  TalosDev ', '', null, 42]);
  assert.ok(e.includes('com.foo.ime') && e.includes('talosdev'));
  for (const voce of APP_DI_PASSAGGIO) assert.ok(e.includes(voce), voce);
  assert.equal(e.length, APP_DI_PASSAGGIO.length + 2);
  assert.ok(Object.isFrozen(APP_DI_PASSAGGIO) && Object.isFrozen(e));
  assert.equal(esito(passo({ origine: null, app: 'com.foo.ime', stato, adesso: T0 + 1, passaggio: e })), 'coperto');
  assert.equal(passo({ origine: null, app: 'com.foo.ime', stato, adesso: T0 + 1 }).esito, 'nulla', 'senza aggiunta è un\'app diversa');
  // nessuna app delicata è di passaggio; e se chi monta il ciclo o la persona le fanno incontrare, vince la guardia
  assert.equal(esito(passo({ origine: null, app: 'com.unicredit', adesso: T0, passaggio: elencoPassaggio(['com.unicredit']) })), 'da-chiedere');
  for (const voce of APP_DELICATE) assert.ok(!APP_DI_PASSAGGIO.includes(voce), voce);
});

test('APP-13 (D7): una pagina di cassa è un sito in guardia, col suo host; senza host o senza cassa niente', () => {
  assert.deepEqual(passo({ origine: 'https://checkout.negozio.example/pay', cassa: true }),
    { esito: 'dentro', sito: 'checkout.negozio.example', motivo: 'ingresso', fresco: false, stato: { sito: 'checkout.negozio.example', siAl: null } });
  assert.equal(passo({ origine: 'https://negozio.example/pay', cassa: false }).esito, 'nulla');
  assert.equal(passo({ origine: null, cassa: true }).esito, 'nulla');
  assert.equal(passo({ origine: 'https://www.paypal.com', cassa: true }).sito, 'paypal.com', 'un sito dell\'elenco vale come voce dell\'elenco');
  assert.equal(passoGuardia({ accesa: false, origine: 'https://negozio.example', cassa: true, elenco, adesso: T0 }).esito, 'nulla');
  // col sì sulla cassa, la pagina dopo (ordine confermato, stesso host) non è più cassa: si esce
  const stato = siDellaPersona('negozio.example', T0);
  assert.equal(passo({ origine: 'https://negozio.example/grazie', cassa: false, stato, adesso: T0 + 1 }).esito, 'nulla');
});

test('APP-14 (O2, variante A): il sì del compito vale 5 minuti dalla sua data anche su un altro sito, con la sua app', () => {
  const conSi = siDellaPersona('inps.it', T0, 'Microsoft Edge');
  assert.deepEqual(conSi, { sito: 'inps.it', siAl: T0, app: 'microsoft edge' });
  const poste = passo({ origine: 'https://www.poste.it/', app: 'Microsoft Edge', stato: conSi, adesso: T0 + 4 * MIN });
  assert.equal(esito(poste), 'coperto');
  assert.equal(poste.sito, 'poste.it');
  assert.equal(poste.stato.siAl, T0, 'la data è quella del sì, non quella del passaggio');
  const tardi = passo({ origine: 'https://www.poste.it/', app: 'Microsoft Edge', stato: poste.stato, adesso: T0 + 5 * MIN });
  assert.equal(esito(tardi), 'da-chiedere'); assert.equal(tardi.motivo, 'tempo');
  for (const adesso of [T0 - 1, NaN]) assert.equal(passo({ origine: 'https://www.poste.it/', stato: conSi, adesso }).motivo, 'orologio', String(adesso));
  // uno stato senza data non copre niente
  assert.equal(esito(passo({ origine: 'https://www.poste.it/', stato: { sito: 'inps.it', siAl: null }, adesso: T0 + 1 })), 'da-chiedere');
  assert.equal(esito(passo({ origine: 'https://www.poste.it/', stato: STATO_GUARDIA_VUOTO, adesso: T0 + 1 })), 'da-chiedere');
});
