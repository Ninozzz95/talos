/*
 * La modalità guardia sui siti delicati (decisione 145): la regola pura `guardia.mjs`.
 * Ogni prova guarda il verso sicuro: chiedere di nuovo è sempre ammesso, andare avanti senza il sì mai.
 * Fonti in FONTI-25-MODALITA-GUARDIA-2026-11-04.md (Hermes `website_policy.py:144-150`, browser-use `security_watchdog.py:177-290`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GUARDIA_MINUTI, SITI_DELICATI, STATO_GUARDIA_VUOTO, elencoGuardia, hostDi, passoGuardia, siDellaPersona, sitoDelicato,
} from '../src/computer-use/guardia.mjs';

const MIN = 60 * 1000;
const T0 = 1_000_000;
const elenco = elencoGuardia();
const passo = (o) => passoGuardia({ accesa: true, elenco, adesso: T0, ...o });

test('spenta di serie: nessun effetto, nemmeno su una banca', () => {
  for (const accesa of [false, undefined, 'true', 1]) {
    const r = passoGuardia({ accesa, origine: 'https://www.unicredit.it', elenco, adesso: T0 });
    assert.equal(r.esito, 'nulla');
    assert.deepEqual(r.stato, STATO_GUARDIA_VUOTO);
  }
});

test('hostDi: schema, www, porta, credenziali, percorso, punto finale e maiuscole', () => {
  assert.equal(hostDi('https://WWW.UniCredit.it:443/login?x=1#a'), 'unicredit.it');
  assert.equal(hostDi('http://utente:pw@online.bancobpm.it./conto'), 'online.bancobpm.it');
  assert.equal(hostDi('mail.google.com/mail/u/0'), 'mail.google.com');
  for (const neutra of ['', null, undefined, 'about:blank', 'data:text/html,x', 'blob:https://x/y', 'chrome://newtab', 'edge://settings']) {
    assert.equal(hostDi(neutra), null, String(neutra));
  }
});

test('hostDi come il browser (revisione Q, D9): barra rovesciata, ultima @, lettere larghe, view-source', () => {
  const casi = [
    ['https://unicredit.it\\login', 'unicredit.it'], ['https://evil.com\\@unicredit.it', 'evil.com'], ['https://a@b@unicredit.it/x', 'unicredit.it'],
    ['https://ｕｎｉｃｒｅｄｉｔ．ｉｔ/', 'unicredit.it'], ['view-source:https://www.unicredit.it/', 'unicredit.it'], ['unicredit.it:443/x', 'unicredit.it'],
  ];
  for (const [dentro, atteso] of casi) assert.equal(hostDi(dentro), atteso, dentro);
  // senza `URL` (React Native senza polyfill) vale la lettura a mano, e anche lei prende l'ULTIMA @ (mutante M3 della revisione Q)
  const URLvero = globalThis.URL;
  try {
    globalThis.URL = undefined;
    assert.equal(hostDi('https://a@b@unicredit.it/x'), 'unicredit.it');
    assert.equal(hostDi('https://WWW.UniCredit.it:443/login'), 'unicredit.it');
    assert.equal(hostDi('about:blank'), null);
  } finally { globalThis.URL = URLvero; }
});

test('elenco: le voci che mancavano (revisione Q, D8) ci sono', () => {
  for (const [host, voce] of [['outlook.cloud.microsoft', 'outlook.cloud.microsoft'], ['accounts.google.com', 'accounts.google.com'],
    ['myaccount.google.com', 'myaccount.google.com'], ['login.microsoftonline.com', 'login.microsoftonline.com'], ['appleid.apple.com', 'appleid.apple.com'],
    ['webmail.pec.it', 'webmail.pec.it'], ['www.inbank.it', 'inbank.it']]) assert.equal(sitoDelicato(hostDi(`https://${host}/`), elenco), voce, host);
  assert.equal(sitoDelicato('google.com', elenco), null, 'il resto di google.com resta fuori');
});

test('confronto dei siti: uguale o sottodominio col punto davanti, mai un nome che finisce allo stesso modo', () => {
  assert.equal(sitoDelicato('unicredit.it', elenco), 'unicredit.it');
  assert.equal(sitoDelicato('online.unicredit.it', elenco), 'unicredit.it');
  assert.equal(sitoDelicato('fintounicredit.it', elenco), null);
  assert.equal(sitoDelicato('unicredit.it.truffa.com', elenco), null);
  assert.equal(sitoDelicato('google.com', elenco), null, 'la posta è mail.google.com, non tutto google.com');
  assert.equal(sitoDelicato('mail.google.com', elenco), 'mail.google.com');
});

test('elenco: si aggiunge e non si toglie; un suffisso pubblico o un nome senza punto non entrano', () => {
  const e = elencoGuardia(['https://www.miabanca.example/', 'co.uk', 'gov.it', 'localhost', 'github.io', 42, null]);
  assert.ok(e.includes('miabanca.example'));
  for (const no of ['co.uk', 'gov.it', 'localhost', 'github.io']) assert.ok(!e.includes(no), no);
  for (const voce of SITI_DELICATI) assert.ok(e.includes(voce), voce);
  assert.ok(Object.isFrozen(e) && Object.isFrozen(SITI_DELICATI));
  for (const voce of SITI_DELICATI) assert.equal(voce, hostDi(voce), `voce già normalizzata: ${voce}`);
});

test('ingresso (variante A, decisione 145): dentro senza carta; nessun sì, quindi niente di fresco', () => {
  const r = passo({ origine: 'https://www.intesasanpaolo.com/' });
  assert.deepEqual(r, { esito: 'dentro', sito: 'intesasanpaolo.com', motivo: 'ingresso', fresco: false, stato: { sito: 'intesasanpaolo.com', siAl: null } });
  // senza il sì si resta dentro e non fresco; anche con l'orologio a zero, che è ciò che il ciclo usa quando la sua porta
  // `adesso` fallisce (`ciclo.mjs`, `Number(porte.adesso()) || 0`): la carta la decide il ciclo prima dell'azione che cambia
  for (const adesso of [T0 + 1, 0, 1]) {
    const dopo = passo({ origine: 'https://www.intesasanpaolo.com/x', stato: r.stato, adesso });
    assert.equal(dopo.esito, 'dentro', String(adesso));
    assert.equal(dopo.motivo, 'ingresso', String(adesso));
    assert.equal(dopo.fresco, false, String(adesso));
  }
});

test('con il sì: fresco sullo stesso sito e sui suoi sottodomini fino a 5 minuti esclusi; a 5 minuti motivo «tempo» e il sì resta nello stato', () => {
  assert.equal(GUARDIA_MINUTI, 5);
  const stato = siDellaPersona('paypal.com', T0);
  for (const [origine, adesso] of [['https://www.paypal.com/checkout', T0 + 1], ['https://pay.paypal.com/', T0 + 5 * MIN - 1]]) {
    const r = passo({ origine, stato, adesso });
    assert.equal(r.esito, 'dentro', origine);
    assert.equal(r.fresco, true, origine);
    assert.equal(r.motivo, undefined, origine);
  }
  const scaduto = passo({ origine: 'https://www.paypal.com/', stato, adesso: T0 + 5 * MIN });
  assert.equal(scaduto.esito, 'dentro');
  assert.equal(scaduto.motivo, 'tempo');
  assert.equal(scaduto.fresco, false);
  assert.equal(scaduto.stato.siAl, T0, 'il sì vecchio resta: i 5 minuti contano solo davanti a una mossa che cambia qualcosa');
});

test('lasciare il sito chiude la guardia; rientrare senza sì è di nuovo «ingresso»', () => {
  let stato = siDellaPersona('inps.it', T0);
  const fuori = passo({ origine: 'https://www.wikipedia.org/', stato, adesso: T0 + MIN });
  assert.equal(fuori.esito, 'nulla');
  assert.deepEqual(fuori.stato, STATO_GUARDIA_VUOTO);
  stato = fuori.stato;
  const rientro = passo({ origine: 'https://www.inps.it/', stato, adesso: T0 + 2 * MIN });
  assert.equal(rientro.esito, 'dentro');
  assert.equal(rientro.motivo, 'ingresso');
  assert.equal(rientro.fresco, false);
});

test('passare da un sito delicato a un altro: dentro il nuovo sito, e il sì del compito (variante A) lo copre', () => {
  const stato = siDellaPersona('inps.it', T0);
  const r = passo({ origine: 'https://www.agenziaentrate.gov.it/', stato, adesso: T0 + MIN });
  assert.equal(r.esito, 'dentro');
  assert.equal(r.sito, 'agenziaentrate.gov.it');
  assert.equal(r.fresco, true);
  assert.equal(r.stato.siAl, T0);
});

test('una origine neutra NON fa uscire dalla guardia (né col sì, né senza)', () => {
  const conSi = siDellaPersona('revolut.com', T0);
  for (const origine of ['about:blank', '', null, 'data:text/html,x', 'blob:https://revolut.com/1']) {
    const r = passo({ origine, stato: conSi, adesso: T0 + MIN });
    assert.equal(r.esito, 'dentro', String(origine));
    assert.equal(r.fresco, true, String(origine));
    assert.equal(r.sito, 'revolut.com');
    const senzaSi = passo({ origine, stato: { sito: 'revolut.com', siAl: null }, adesso: T0 + MIN });
    assert.equal(senzaSi.esito, 'dentro', String(origine));
    assert.equal(senzaSi.fresco, false, String(origine));
    assert.equal(senzaSi.motivo, 'ingresso', String(origine));
  }
  // e il tempo vale anche lì
  const tardi = passo({ origine: 'about:blank', stato: conSi, adesso: T0 + 5 * MIN });
  assert.equal(tardi.fresco, false);
  assert.equal(tardi.motivo, 'tempo');
});

test('schermo spento: si chiede subito di nuovo', () => {
  const r = passo({ origine: 'https://n26.com/', stato: siDellaPersona('n26.com', T0), adesso: T0 + 1, schermoSpento: true });
  assert.equal(r.esito, 'chiedi');
  assert.equal(r.motivo, 'schermo-spento');
});

test('orologio illeggibile o all\'indietro: si chiede, mai avanti', () => {
  const stato = siDellaPersona('wise.com', T0);
  for (const adesso of [NaN, Infinity, undefined, T0 - 1]) {
    const r = passo({ origine: 'https://wise.com/', stato, adesso });
    assert.equal(r.esito, 'chiedi', String(adesso));
    assert.equal(r.motivo, 'orologio');
  }
  assert.deepEqual(siDellaPersona('wise.com', NaN), STATO_GUARDIA_VUOTO, 'un sì senza orologio non vale');
  assert.deepEqual(siDellaPersona(null, T0), STATO_GUARDIA_VUOTO);
});

test('il sì vale per il compito (variante A): un altro sito delicato è coperto finché il sì è fresco, poi «tempo»', () => {
  const stato = siDellaPersona('bitwarden.com', T0);
  for (const origine of ['https://vault.bitwarden.com/', 'https://lastpass.com/']) {
    const r = passo({ origine, stato, adesso: T0 + 1 });
    assert.equal(r.esito, 'dentro', origine);
    assert.equal(r.fresco, true, origine);
  }
  const tardi = passo({ origine: 'https://lastpass.com/', stato, adesso: T0 + 5 * MIN });
  assert.equal(tardi.fresco, false);
  assert.equal(tardi.motivo, 'tempo');
});

test('la regola è pura: niente node:, niente I/O, niente orologio suo', () => {
  const sorgente = readFileSync(join(import.meta.dirname, '../src/computer-use/guardia.mjs'), 'utf8');
  assert.doesNotMatch(sorgente, /from 'node:|require\(|Date\.now|performance\.now|process\./u);
  const importazioni = [...sorgente.matchAll(/^import .* from '([^']+)';$/gmu)].map((m) => m[1]);
  assert.deepEqual(importazioni, ['./protezioni.mjs']);
});
