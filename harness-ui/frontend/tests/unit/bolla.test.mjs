/*
 * FE-066: la pagina della bolla del computer use (forma `FORMA-BOLLA-COMPUTER-USE-2026-11-03.md`). La finestra è del Desktop, la pagina non lo sa: aperta e chiusa sono il fuoco,
 * i dati arrivano sul canale dalla pagina principale, le risposte tornano di lì. Non c'è ancora chi parla dall'altro capo: si prova con un canale finto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio } from './aiuto-dom-blocchi.mjs';
import { CANALE_BOLLA, INDIRIZZO_PORTA_DAVANTI, leggiMessaggio, riduciBolla, riprendiSegnoAssente, STATO_INIZIALE_BOLLA } from '../../src/components/computer-use/bolla-protocollo.js';
import { CHIAVE_SEGNO_ASSENTE, creaBolla, linguaDellaBolla } from '../../src/components/computer-use/bolla.js';

function canaleFinto() {
  const c = { mandati: [], onmessage: null, postMessage(m) { c.mandati.push(m); }, arriva(data) { c.onmessage?.({ data }); } };
  return c;
}
function scena({ memoria } = {}) {
  const document = documento();
  const finestra = new EventTarget();
  finestra.aperti = [];
  finestra.location = { origin: 'http://127.0.0.1:4999' };
  finestra.ascolti = 0;
  const aggiungi = finestra.addEventListener.bind(finestra);
  const togli = finestra.removeEventListener.bind(finestra);
  finestra.addEventListener = (tipo, f) => { if (tipo === 'message') finestra.ascolti += 1; aggiungi(tipo, f); };
  finestra.removeEventListener = (tipo, f) => { if (tipo === 'message') finestra.ascolti -= 1; togli(tipo, f); };
  finestra.open = (u) => { finestra.aperti.push(u); return null; };
  const canale = canaleFinto();
  const clock = orologio();
  const b = creaBolla({ document, finestra, canale, timer: clock.timer, adesso: clock.adesso, memoria });
  document.body.append(b.nodo);
  return { document, finestra, canale, clock, b };
}
const bottone = (n, testo) => n.querySelectorAll('button').find((x) => x.textContent.startsWith(testo));
const passo = (bersaglio) => ({ tipo: 'evento', evento: { name: 'talos.computer-use-passo', value: { fase: 'annuncio', n: 1, bersaglio } } });

test('BOL-01 il protocollo prende solo forme note: tutto il resto si scarta', () => {
  assert.equal(CANALE_BOLLA, 'talos-bolla');
  assert.equal(leggiMessaggio(null), null);
  assert.equal(leggiMessaggio('x'), null);
  assert.equal(leggiMessaggio({ tipo: 'sconosciuto' }), null);
  assert.equal(leggiMessaggio({ tipo: 'evento' }), null, 'evento senza nome');
  assert.equal(leggiMessaggio({ tipo: 'evento', evento: { name: 'altro.evento', value: {} } }), null, 'solo gli eventi del computer use');
  assert.equal(leggiMessaggio({ tipo: 'domanda', id: 'q', porta: 'sconosciuta', dati: {} }), null);
  assert.equal(leggiMessaggio({ tipo: 'domanda', porta: 'mano', dati: {} }), null, 'senza id');
  assert.ok(leggiMessaggio({ tipo: 'domanda', id: 'q', porta: 'mano', dati: { motivo: 'anti-robot' } }));
  assert.ok(leggiMessaggio({ tipo: 'chiudi-domanda', id: 'q' }));
});

test('BOL-02 lo stato: la domanda arriva e si chiude solo se è quella; la fine toglie il lavoro', () => {
  let s = riduciBolla(STATO_INIZIALE_BOLLA, { tipo: 'domanda', id: 'q1', porta: 'mano', dati: {} });
  assert.equal(s.domanda.id, 'q1');
  assert.equal(riduciBolla(s, { tipo: 'chiudi-domanda', id: 'altra' }).domanda.id, 'q1');
  s = riduciBolla(s, { tipo: 'chiudi-domanda', id: 'q1' });
  assert.equal(s.domanda, null);
  s = riduciBolla(s, passo('Cerca'));
  assert.equal(s.pillola.lavora, true);
  assert.equal(s.fine, null);
  s = riduciBolla(s, { tipo: 'evento', evento: { name: 'talos.computer-use-fermato', value: { esito: 'fermato', motivo: 'pulsante-ferma' } } });
  assert.equal(s.pillola.lavora, false);
  assert.equal(s.fine.motivo, 'pulsante-ferma');
});

test('BOL-03 a riposo c\'è il campo; la pagina si annuncia', () => {
  const { b, canale } = scena();
  assert.ok(b.nodo.querySelector('textarea'));
  assert.deepEqual(canale.mandati, [{ tipo: 'pronta' }]);
  assert.equal(b.nodo.querySelector('[data-ferma]'), null);
});

test('BOL-04 aperta e chiusa sono il fuoco della finestra: nessun messaggio dal guscio', () => {
  const { b, finestra, document } = scena();
  assert.equal(b.nodo.dataset.aperta, 'false');
  finestra.dispatchEvent(new Event('focus'));
  assert.equal(b.nodo.dataset.aperta, 'true');
  assert.equal(document.activeElement, b.nodo.querySelector('textarea'));
  finestra.dispatchEvent(new Event('blur'));
  assert.equal(b.nodo.dataset.aperta, 'false');
});

test('BOL-05 scrivere: Invio manda sul canale e svuota; vuoto non manda; Maiusc+Invio va a capo', () => {
  const { b, canale } = scena();
  const campo = b.nodo.querySelector('textarea');
  const invio = (shiftKey = false) => { const e = new Event('keydown', { cancelable: true }); e.key = 'Enter'; e.shiftKey = shiftKey; campo.dispatchEvent(e); return e; };
  campo.value = '   ';
  invio();
  campo.value = 'compra il biglietto';
  assert.equal(invio(true).defaultPrevented, false);
  assert.equal(canale.mandati.filter((m) => m.tipo === 'messaggio').length, 0);
  invio();
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'messaggio', testo: 'compra il biglietto' });
  assert.equal(campo.value, '');
});

test('BOL-06 mentre lavora: la frase, i secondi che corrono e «Ferma» sempre raggiungibile', () => {
  const { b, canale, clock } = scena();
  canale.arriva(passo('Cerco il treno'));
  assert.match(b.nodo.textContent, /Cerco il treno/u);
  assert.equal(b.nodo.querySelector('textarea'), null);
  clock.avanza(3000);
  assert.match(b.nodo.textContent, /3 s/u);
  clic(b.nodo.querySelector('[data-ferma]'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'ferma' });
});

test('BOL-07 durante la presa della persona dice che non guarda, e i secondi si fermano', () => {
  const { b, canale, clock } = scena();
  canale.arriva(passo('Cerco'));
  clock.avanza(2000);
  canale.arriva({ tipo: 'evento', evento: { name: 'talos.computer-use-pausa', value: { motivo: 'persona', fase: 'inizio' } } });
  assert.match(b.nodo.textContent, /Non guardo lo schermo finché non riprendi/u);
  const prima = b.nodo.querySelector('.cu-bolla__sec').textContent;
  clock.avanza(5000);
  assert.equal(b.nodo.querySelector('.cu-bolla__sec').textContent, prima);
});

test('BOL-08 la carta del compito: risponde sul canale, «Consenti sempre» compreso', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'domanda', id: 'q1', porta: 'consenso', dati: { obiettivo: 'Compra', domini: [{ nome: 'a.example' }], app: [], accessi: [], posso: { pagare: true, inviare: false, cancellare: false, tetto: null } } });
  assert.ok(b.nodo.querySelector('.cs'));
  clic(b.nodo.querySelector('.cs-sempre'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'risposta', id: 'q1', valore: 'sempre' });
  assert.equal(b.nodo.querySelector('.cs'), null, 'risposto, la carta se ne va');
});

test('BOL-09 la riga «Posso» toccata sulla carta arriva a chi monta il ciclo', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'domanda', id: 'q1', porta: 'consenso', dati: { obiettivo: 'x', domini: [], app: [], accessi: [], posso: { pagare: true, inviare: false, cancellare: false, tetto: null } } });
  clic(bottone(b.nodo, 'inviare'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'posso', id: 'q1', valore: { pagare: true, inviare: true, cancellare: false, tetto: null } });
});

test('BOL-10 cassa, conferma singola, conferme insieme e mano: ogni porta la sua carta e la sua risposta', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'domanda', id: 'c', porta: 'conferma', dati: { protezione: 'pagamento', totale: { importo: 10, valuta: 'EUR' }, dominio: 'a.example', metodo: null, tetto: null } });
  clic(bottone(b.nodo, 'Paga 10,00 €'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'risposta', id: 'c', valore: 'si' });
  canale.arriva({ tipo: 'domanda', id: 'u', porta: 'conferma', dati: { protezione: 'credenziale', prova: 'Accedi' } });
  assert.match(b.nodo.textContent, /Password/u);
  clic(bottone(b.nodo, 'Sì'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'risposta', id: 'u', valore: 'si' });
  canale.arriva({ tipo: 'domanda', id: 'i', porta: 'conferme', dati: { voci: [{ id: 0, protezione: 'credenziale' }, { id: 1, protezione: 'pagamento' }] } });
  clic(bottone(b.nodo, 'No, fermati'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'risposta', id: 'i', valore: 'annulla' });
  canale.arriva({ tipo: 'domanda', id: 'm', porta: 'mano', dati: { motivo: 'anti-robot' } });
  clic(bottone(b.nodo, 'Fatto, riprendi'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'risposta', id: 'm', valore: 'fatto' });
});

test('BOL-11 alla fine: la frase del codice e chi ha deciso, poi il campo torna', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'evento', evento: { name: 'talos.computer-use-esito', value: { esito: 'completato', motivo: 'completato', decisioni: [{ passo: 1, protezione: 'credenziale', fonte: 'si-carta' }], spese: [] } } });
  assert.match(b.nodo.textContent, /Fatto\./u);
  assert.match(b.nodo.textContent, /Col tuo sì alla carta/u);
  assert.ok(b.nodo.querySelector('textarea'));
});

/* Decisione 274 (owner 05/11 23:12): mentre TALOS lavora, senza domanda e senza fine, la bolla è SOLO la pillola, come nel bozzetto
   (`bozzetto-computer-use-pc/index.html:1077` `lavoro` → `solo(pillola(...))`). «Apri in TALOS» resta sulla carta della domanda e su quella della fine (`:1029`). */
test('BOL-12 mentre lavora c\'è solo la pillola: nessuna carta e nessun «Apri in TALOS»', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'sessione', sessionId: 's1' });
  canale.arriva(passo('Cerco'));
  assert.match(b.nodo.textContent, /Cerco/u);
  assert.equal(b.nodo.querySelector('.carta'), null, 'nessuna carta mentre lavora');
  assert.equal(bottone(b.nodo, 'Apri in TALOS'), undefined, 'nessun «Apri in TALOS» mentre lavora');
  assert.equal(b.nodo.querySelector('.cu-bolla__carta').children.length, 0, 'il posto della carta è vuoto');
  const css = readFileSync(new URL('../../src/styles/bolla.css', import.meta.url), 'utf8');
  assert.match(css, /\n\.cu-bolla__carta:empty\{display:none\}/u, 'il posto vuoto non lascia la striscia del gap sopra la pillola');
});

test('BOL-12b «Apri in TALOS» sulla carta della domanda e su quella della fine: la sessione sul canale, e il guscio porta davanti con l\'indirizzo convenuto', () => {
  const { b, canale, finestra } = scena();
  canale.arriva({ tipo: 'sessione', sessionId: 's1' });
  canale.arriva(passo('Cerco'));
  canale.arriva({ tipo: 'domanda', id: 'm', porta: 'mano', dati: { motivo: 'anti-robot' } });
  assert.ok(b.nodo.querySelector('.carta'), 'la domanda ha la sua carta');
  clic(bottone(b.nodo, 'Apri in TALOS'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'apri', sessionId: 's1' });
  assert.deepEqual(finestra.aperti, [INDIRIZZO_PORTA_DAVANTI]);
  clic(bottone(b.nodo, 'Fatto, riprendi'));
  assert.equal(b.nodo.querySelector('.carta'), null, 'risposto, torna la sola pillola');
  canale.arriva({ tipo: 'evento', evento: { name: 'talos.computer-use-esito', value: { esito: 'completato', motivo: 'completato', decisioni: [], spese: [] } } });
  assert.ok(b.nodo.querySelector('.carta'), 'la fine ha la sua carta');
  clic(bottone(b.nodo, 'Apri in TALOS'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'apri', sessionId: 's1' });
  assert.deepEqual(finestra.aperti, [INDIRIZZO_PORTA_DAVANTI, INDIRIZZO_PORTA_DAVANTI]);
});

test('BOL-13 un messaggio malformato non tocca niente', () => {
  const { b, canale } = scena();
  const prima = b.nodo.textContent;
  canale.arriva({ tipo: 'domanda', porta: 'mano' });
  canale.arriva(42);
  assert.equal(b.nodo.textContent, prima);
});

test('BOL-14 la pagina è servita e costruita: ingresso, stili, tema, niente script in linea', () => {
  const html = readFileSync(new URL('../../bolla.template.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\.\/avvio\.js"><\/script>/u, 'il tema, come la finestra principale');
  assert.match(html, /<script type="module" src="\.\/bolla\.js"><\/script>/u);
  assert.match(html, /href="\.\/styles\.css"/u);
  assert.match(html, /href="\.\/bolla-stile\.css"/u);
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/u);
  assert.match(html, /<\/head>/u, 'serve al nonce del server');
  const build = readFileSync(new URL('../../scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(build, /bolla: 'src\/bolla\.js'/u);
  assert.match(build, /'bolla-stile': 'src\/styles\/bolla\.css'/u);
  assert.match(build, /bolla\.template\.html/u);
  const statici = readFileSync(new URL('../../../src/static-files.mjs', import.meta.url), 'utf8');
  for (const p of ["'/bolla.html'", "'/bolla.js'", "'/bolla-stile.css'"]) assert.ok(statici.includes(p), p);
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /bolla-protocollo/u, 'la pagina principale parla col canale solo dal ponte (FE-070, `ponte-bolla.test.mjs`)');
  assert.match(app, /creaPonteBolla/u);
  const css = readFileSync(new URL('../../src/styles/bolla.css', import.meta.url), 'utf8');
  assert.match(css, /background:\s*transparent/u, 'la finestra è trasparente');
  assert.doesNotMatch(css, /\.palco\b/u);
});

/* FE-073 (Desktop 05/11 17:09): su Windows senza cornice di cattura il guscio non disegna il segno e lo dice alla bolla, con `executeJavaScript` e `postMessage` sulla sua
 * finestra. La bolla lo mette nella pillola del PRIMO compito, finché il primo esito di un passo cambia la frase; la pausa vince; una volta per avvio dell'app. */
const ASSENTE = { tipo: 'segno-assente', motivo: 'windows-vecchio' };
const PROTEZIONE = { tipo: 'segno-assente', motivo: 'protezione' };
const AVVISO = /il mio cursore non si vede: segui la pillola/u;
const AVVISO_PROTEZIONE = /Su questo computer non posso mostrarti il mio cursore: Windows non mi lascia tenerlo fuori dalle foto dello schermo\. Quello che faccio lo vedi qui nella pillola\./u;
const dalGuscio = (finestra, data, o = {}) => { const e = new Event('message'); Object.assign(e, { data, source: finestra, origin: finestra.location.origin }, o); finestra.dispatchEvent(e); };
const esitoPasso = { tipo: 'evento', evento: { name: 'talos.computer-use-passo', value: { fase: 'esito', n: 1, esito: 'confermata', motivo: null } } };
const fineCompito = { tipo: 'evento', evento: { name: 'talos.computer-use-esito', value: { esito: 'completato', motivo: 'completato', decisioni: [], spese: [] } } };

test('BOL-15 il protocollo: «segno assente» solo nella forma convenuta, e una volta sola nello stato', () => {
  assert.deepEqual(leggiMessaggio({ ...ASSENTE, extra: 1 }), ASSENTE);
  assert.equal(leggiMessaggio({ tipo: 'segno-assente' }), null, 'senza motivo');
  assert.equal(leggiMessaggio({ tipo: 'segno-assente', motivo: 'altro' }), null, 'motivo sconosciuto');
  assert.deepEqual(leggiMessaggio({ ...PROTEZIONE, extra: 1 }), PROTEZIONE, 'la protezione dalle foto dello schermo rifiutata (segno-finestra.mjs, MESSAGGIO_SENZA_PROTEZIONE)');
  const s = riduciBolla(STATO_INIZIALE_BOLLA, ASSENTE);
  assert.equal(s.segnoAssente, 'atteso');
  assert.equal(riduciBolla(s, ASSENTE), s, 'il doppione non cambia niente');
  assert.equal(STATO_INIZIALE_BOLLA.segnoAssente, null);
});

test('BOL-16 la pillola del primo compito lo dice, il primo esito di un passo lo toglie, il secondo compito non lo dice', () => {
  const { b, canale, finestra } = scena();
  dalGuscio(finestra, ASSENTE);
  canale.arriva(fineCompito);
  canale.arriva(fineCompito);
  assert.doesNotMatch(b.nodo.textContent, AVVISO, "a riposo resta il campo, e una fine senza compito (rigiocata) non consuma l'avviso");
  assert.ok(b.nodo.querySelector('textarea'));
  canale.arriva(passo('Cerco il treno'));
  assert.match(b.nodo.textContent, AVVISO);
  assert.doesNotMatch(b.nodo.textContent, /Cerco il treno/u);
  canale.arriva(passo('Apro la pagina'));
  assert.match(b.nodo.textContent, AVVISO, 'resta finché non arriva un esito');
  canale.arriva(esitoPasso);
  assert.doesNotMatch(b.nodo.textContent, AVVISO);
  canale.arriva(fineCompito);
  canale.arriva(passo('Secondo compito'));
  assert.match(b.nodo.textContent, /Secondo compito/u);
  assert.doesNotMatch(b.nodo.textContent, AVVISO);
});

test("BOL-17 la pausa vince sull'avviso, e alla ripresa l'avviso torna finché non c'è un esito", () => {
  const { b, canale, finestra } = scena();
  dalGuscio(finestra, ASSENTE);
  canale.arriva(passo('Cerco'));
  canale.arriva({ tipo: 'evento', evento: { name: 'talos.computer-use-pausa', value: { motivo: 'persona', fase: 'inizio' } } });
  assert.match(b.nodo.textContent, /Non guardo lo schermo finché non riprendi/u);
  assert.doesNotMatch(b.nodo.textContent, AVVISO);
  canale.arriva({ tipo: 'evento', evento: { name: 'talos.computer-use-pausa', value: { motivo: 'persona', fase: 'fine' } } });
  assert.match(b.nodo.textContent, AVVISO);
});

test('BOL-18 solo dal guscio: altra sorgente, altra origine, il canale o dopo la chiusura non contano; il doppione si mostra una volta', () => {
  const { b, canale, finestra } = scena();
  dalGuscio(finestra, ASSENTE, { source: {} });
  dalGuscio(finestra, ASSENTE, { origin: 'http://altro.example' });
  canale.arriva(ASSENTE);
  dalGuscio(finestra, passo('Dal guscio'));
  assert.ok(b.nodo.querySelector('textarea'), 'dal guscio passa solo «segno assente», non gli eventi');
  assert.doesNotMatch(b.nodo.textContent, /Dal guscio/u);
  canale.arriva(passo('Cerco'));
  assert.doesNotMatch(b.nodo.textContent, AVVISO, 'nessuna via buona: niente avviso');
  assert.match(b.nodo.textContent, /Cerco/u);
  canale.arriva(fineCompito);

  dalGuscio(finestra, ASSENTE);
  dalGuscio(finestra, ASSENTE);
  canale.arriva(passo('Primo'));
  assert.match(b.nodo.textContent, AVVISO);
  canale.arriva(fineCompito);
  dalGuscio(finestra, ASSENTE);
  canale.arriva(passo('Dopo'));
  assert.doesNotMatch(b.nodo.textContent, AVVISO, 'una volta per avvio, anche se il guscio lo ripete');
  canale.arriva(fineCompito);

  const altra = scena();
  assert.equal(altra.finestra.ascolti, 1, 'un ascolto solo');
  altra.b.chiudi();
  assert.equal(altra.finestra.ascolti, 0, 'chiusa la bolla, il guscio non si ascolta più');
});

/* Trovato dal BOL-R10 in inglese (05/11): la pagina della bolla non sceglieva la lingua, e in inglese restava in italiano. Si sceglie come la pagina principale:
   la pseudo-lingua dall'àncora, poi la lingua salvata nelle impostazioni (stessa origine, stesso archivio), poi quella del browser. */
test('BOL-19 la bolla parla la lingua della pagina principale: salvata, poi browser, poi inglese; prima di disegnare', () => {
  const salvate = (uiLanguage) => JSON.stringify({ uiLanguage, appearance: {} });
  assert.equal(linguaDellaBolla({ salvate: salvate('en'), lingueBrowser: ['it-IT'] }), 'en', 'la scelta della persona vince sul browser');
  assert.equal(linguaDellaBolla({ salvate: salvate('it'), lingueBrowser: ['en-US'] }), 'it');
  assert.equal(linguaDellaBolla({ salvate: salvate('sistema'), lingueBrowser: ['en-US', 'it-IT'] }), 'en', '«segui il sistema»');
  assert.equal(linguaDellaBolla({ salvate: null, lingueBrowser: ['it-IT'] }), 'it', 'niente salvato');
  for (const rotto of ['{', '[]', '"en"', JSON.stringify({ uiLanguage: 7 }), JSON.stringify({ uiLanguage: 'xx' })]) {
    assert.equal(linguaDellaBolla({ salvate: rotto, lingueBrowser: ['it-IT'] }), 'it', `salvate illeggibili: ${rotto}`);
  }
  assert.equal(linguaDellaBolla({ salvate: null, lingueBrowser: [] }), 'en');
  assert.equal(linguaDellaBolla({ salvate: salvate('it'), lingueBrowser: ['it-IT'], ancora: '#lingua=qps' }), 'qps', 'la pseudo-lingua dall àncora, come la pagina principale');
  const ingresso = readFileSync(new URL('../../src/bolla.js', import.meta.url), 'utf8');
  assert.match(ingresso, /'talos\.harness\.desktop\.settings\.v1'|CHIAVE_IMPOSTAZIONI/u);
  const applica = ingresso.indexOf('applicaLingua(document, linguaDellaBolla(');
  assert.ok(applica > 0 && applica < ingresso.indexOf('creaBolla({'), 'la lingua si sceglie prima di disegnare la bolla');
});

/* FE-074 (Desktop 05/11 18:34): il guscio dice «segno assente» una volta per avvio e poi non lo ripete. Se la bolla si ricarica (la stessa finestra, la stessa sessione
   del browser) prima di mostrarlo l'avviso andava perso; se si ricarica dopo, ricompariva a ogni compito. Lo stato dell'avviso resta nell'archivio della sessione. */
function memoriaFinta(iniziale = null) {
  const m = { valore: iniziale, scritti: [], leggi: () => m.valore, scrivi: (v) => { m.valore = v; m.scritti.push(v); } };
  return m;
}
test('BOL-20 «segno assente» una volta sola anche se la bolla si ricarica: atteso resta atteso, mostrato o fatto non torna', () => {
  assert.equal(CHIAVE_SEGNO_ASSENTE, 'talos.bolla.segnoAssente');
  for (const [salvato, atteso] of [['atteso', 'atteso'], ['mostrato', 'fatto'], ['fatto', 'fatto'], [null, null], ['', null], ['altro', null], [1, null], [undefined, null]]) {
    assert.equal(riprendiSegnoAssente(salvato), atteso, String(salvato));
  }

  /* arrivato, la bolla si ricarica prima del primo compito: alla ripartenza il primo compito lo dice */
  const memoria = memoriaFinta();
  const prima = scena({ memoria });
  dalGuscio(prima.finestra, ASSENTE);
  assert.equal(memoria.valore, 'atteso');
  prima.b.chiudi();
  const dopo = scena({ memoria });
  dopo.canale.arriva(passo('Cerco il treno'));
  assert.match(dopo.b.nodo.textContent, AVVISO, 'dopo il ricarico il primo compito dice l avviso');
  assert.equal(memoria.valore, 'mostrato');
  dopo.b.chiudi();

  /* mostrato, la bolla si ricarica a metà compito: il guscio non lo ripete e la bolla non lo ridice */
  const terza = scena({ memoria });
  terza.canale.arriva(passo('Apro la pagina'));
  assert.doesNotMatch(terza.b.nodo.textContent, AVVISO, 'già letto: non torna dopo il ricarico');
  dalGuscio(terza.finestra, ASSENTE);
  terza.canale.arriva(fineCompito);
  terza.canale.arriva(passo('Secondo compito'));
  assert.doesNotMatch(terza.b.nodo.textContent, AVVISO, 'nemmeno se il guscio lo ripetesse');
  assert.equal(riprendiSegnoAssente(memoria.valore), 'fatto', 'al prossimo ricarico resta letto');
  terza.b.chiudi();

  /* senza archivio (lettura o scrittura che lanciano) la bolla funziona come prima, per la sua vita */
  const rotta = { leggi() { throw new Error('vietato'); }, scrivi() { throw new Error('pieno'); } };
  const senza = scena({ memoria: rotta });
  dalGuscio(senza.finestra, ASSENTE);
  senza.canale.arriva(passo('Cerco'));
  assert.match(senza.b.nodo.textContent, AVVISO);
  senza.b.chiudi();
  const nessuna = scena();
  dalGuscio(nessuna.finestra, ASSENTE);
  nessuna.canale.arriva(passo('Cerco'));
  assert.match(nessuna.b.nodo.textContent, AVVISO, 'senza memoria passata: come FE-073');
  nessuna.b.chiudi();

  const ingresso = readFileSync(new URL('../../src/bolla.js', import.meta.url), 'utf8');
  assert.ok(ingresso.includes('sessionStorage.getItem(CHIAVE_SEGNO_ASSENTE)'), 'l ingresso legge dall archivio della sessione');
  assert.ok(ingresso.includes('sessionStorage.setItem(CHIAVE_SEGNO_ASSENTE, v)'), 'e ci scrive');
});

/* Revisione segno-finestra, difetto 1 (05/11): il guscio manda anche `motivo:'protezione'` quando Windows rifiuta di tenere la finestra del segno fuori dalle
   foto dello schermo (segno-finestra.mjs, MESSAGGIO_SENZA_PROTEZIONE). La bolla lo dice con la sua frase; un motivo sconosciuto resta scartato. */
test('BOL-21 «segno assente» per la protezione: la sua frase nella pillola, anche dopo il ricarico; un motivo sconosciuto non dice niente', () => {
  const memoria = memoriaFinta();
  const prima = scena({ memoria });
  dalGuscio(prima.finestra, PROTEZIONE);
  prima.canale.arriva(passo('Cerco il treno'));
  assert.match(prima.b.nodo.textContent, AVVISO_PROTEZIONE);
  assert.doesNotMatch(prima.b.nodo.textContent, AVVISO, 'non la frase di Windows vecchio');
  prima.b.chiudi();

  /* arrivato e la bolla si ricarica prima del primo compito: torna con la frase della protezione */
  const salvata = memoriaFinta();
  const a = scena({ memoria: salvata });
  dalGuscio(a.finestra, PROTEZIONE);
  assert.equal(riprendiSegnoAssente(salvata.valore), 'atteso', 'il valore salvato si riprende come atteso');
  a.b.chiudi();
  const b2 = scena({ memoria: salvata });
  b2.canale.arriva(passo('Cerco'));
  assert.match(b2.b.nodo.textContent, AVVISO_PROTEZIONE, 'dopo il ricarico la stessa frase');
  assert.equal(riprendiSegnoAssente(salvata.valore), 'fatto');
  b2.b.chiudi();

  /* Windows vecchio salvato prima di questa cura ('atteso') resta la sua frase */
  const vecchia = scena({ memoria: memoriaFinta('atteso') });
  vecchia.canale.arriva(passo('Cerco'));
  assert.match(vecchia.b.nodo.textContent, AVVISO);
  assert.doesNotMatch(vecchia.b.nodo.textContent, AVVISO_PROTEZIONE);
  vecchia.b.chiudi();

  const ignoto = scena();
  dalGuscio(ignoto.finestra, { tipo: 'segno-assente', motivo: 'altro' });
  ignoto.canale.arriva(passo('Cerco'));
  assert.doesNotMatch(ignoto.b.nodo.textContent, AVVISO);
  assert.doesNotMatch(ignoto.b.nodo.textContent, AVVISO_PROTEZIONE);
  assert.match(ignoto.b.nodo.textContent, /Cerco/u, 'un motivo sconosciuto lascia la frase del passo');
  ignoto.b.chiudi();
});

/* Decisione 273 (owner 05/11 22:17): la frase della protezione (161 caratteri in italiano, 136 in inglese) non si taglia mai; la clamp a due righe resta per
   l'avviso di Windows vecchio e per ogni altra frase. Il modificatore lo mette il codice che mostra l'avviso, la regola sta in `bolla.css`. */
test('BOL-22 la frase della protezione ha tutte le sue righe; Windows vecchio e una frase qualunque restano a due', () => {
  const classi = (b) => b.nodo.querySelector('.fase').className.split(' ');
  const prot = scena();
  dalGuscio(prot.finestra, PROTEZIONE);
  prot.canale.arriva(passo('Cerco il treno'));
  assert.match(prot.b.nodo.textContent, AVVISO_PROTEZIONE);
  assert.ok(classi(prot.b).includes('fase--intera'), 'la protezione porta il modificatore');
  assert.ok(classi(prot.b).includes('fase--avviso'));
  prot.canale.arriva(esitoPasso);
  assert.ok(!classi(prot.b).includes('fase--intera'), 'tolto l avviso, la frase del passo torna normale');
  prot.b.chiudi();

  const vecchio = scena();
  dalGuscio(vecchio.finestra, ASSENTE);
  vecchio.canale.arriva(passo('Cerco'));
  assert.match(vecchio.b.nodo.textContent, AVVISO);
  assert.ok(classi(vecchio.b).includes('fase--avviso'));
  assert.ok(!classi(vecchio.b).includes('fase--intera'), 'Windows vecchio resta a due righe');
  vecchio.b.chiudi();

  const normale = scena();
  normale.canale.arriva(passo('Apro la pagina'));
  assert.deepEqual(classi(normale.b), ['fase'], 'una frase qualunque: né avviso né modificatore');
  normale.b.chiudi();

  const css = readFileSync(new URL('../../src/styles/bolla.css', import.meta.url), 'utf8');
  const regola = (sel) => {
    const i = css.indexOf(`\n${sel}{`);
    return i < 0 ? null : css.slice(i + sel.length + 2, css.indexOf('}', i));
  };
  const intera = regola('.fase--avviso.fase--intera');
  assert.ok(intera, 'la regola del modificatore esiste');
  assert.match(intera, /-webkit-line-clamp:\s*(?:none|unset|initial)|display:\s*block/u, 'il modificatore toglie il taglio');
  assert.match(regola('.fase--avviso') ?? '', /-webkit-line-clamp:\s*2/u, 'gli altri avvisi restano a due righe');
  /* Foto del 05/11: a tre-quattro righe il tondo pieno stringe la prima e l'ultima riga contro il bordo. Il raggio fisso vale solo con la frase intera. */
  const raggio = /border-radius:\s*(\d+)px/u.exec(regola('.pillola:has(.fase--intera)') ?? '');
  /* Revisione B sul gemello, difetto 2: «≤ 24» lasciava vivo il raggio 0 (M7). Il raggio è esattamente quello della carta, 22px. */
  assert.equal(Number(raggio?.[1]), 22, 'con la frase intera la pillola ha angoli fissi di 22px, come la carta');
});
