/*
 * BLOCCHI-PC — i disegnatori dei blocchi dell'interfaccia generativa sul PC (catalogo v1, blocco 2, 02/11/2026).
 * Dall'albero del lettore del nucleo (`harness-ui/src/blocchi/lettore.mjs`, le sue fixture) al DOM, con un DOM finto
 * (`aiuto-dom-blocchi.mjs`: `innerHTML` lancia). Il disegno vero, i colori e il puntatore li prova la spec del browser
 * `tests/browser/blocchi-pc.spec.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spento, documento, clic, voceDelMenu, vociDelMenu, orologio } from './aiuto-dom-blocchi.mjs';
import { leggi } from '../../../src/blocchi/lettore.mjs';
import { ripiegoTestuale } from '../../../src/blocchi/catalogo.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { impostaOrologioCaricamento } from '../../src/components/caricamento-vivo.js';
import { durataBreveRigaViva } from '../../src/components/durata-breve.js';
import { disegnaBlocco, montaBloccoVivo, statoDelBlocco, SCELTA_DEL_DISEGNO, RITMO_DEL_DISEGNO_MS } from '../../src/components/blocchi/guscio.js';
import { EVENTO_AZIONE, puoAgire, agisci, creaAzione, statoAzione } from '../../src/components/blocchi/azione.js';
import { disegnaScelte } from '../../src/components/blocchi/scelte.js';
import { disegnaModulo } from '../../src/components/blocchi/modulo.js';
import { testoDelModulo } from '../../src/components/blocchi/modulo.js';
import { TESTI } from '../../src/i18n/testi/index.js';

impostaLingua('it');
const FIXTURE = new URL('../../../tests/fixtures/blocchi/', import.meta.url);
const corpo = (nome) => readFileSync(new URL(`${nome}.txt`, FIXTURE), 'utf8');
const tutto = (n) => [n, ...n.discendenti()];
const testoDi = (n) => n.textContent;

function monta(testo, opzioni = {}) {
  const doc = documento();
  const risultato = leggi(testo, opzioni.fonteOspite ? { fonte: opzioni.fonteOspite } : undefined);
  const nodo = disegnaBlocco(risultato, { document: doc, testo, ...opzioni });
  doc.body.append(nodo);
  return { doc, nodo, risultato };
}

test('BLOCCHI-PC-01 tabella: colonne, righe, celle numeriche a destra nella lingua, filtro e ordine come chiede il blocco', () => {
  const { nodo } = monta(corpo('01-tabella'));
  assert.equal(nodo.getAttribute('class'), `gu gu--${SCELTA_DEL_DISEGNO.guscio}`);
  assert.equal(nodo.dataset.tipo, 'tabella');
  assert.equal(nodo.dataset.stato, 'completo');
  assert.equal(nodo.querySelector('h3.gu__titolo').textContent, 'Vendite per mese');
  const th = nodo.querySelectorAll('table.md-table th');
  assert.deepEqual(th.map(testoDi), ['Mese', 'Euro']);
  assert.ok(th[1].classList.contains('num'));
  assert.equal(th[0].getAttribute('scope'), 'col');
  assert.equal(nodo.querySelectorAll('th button[data-ordina]').length, 2, 'ordinabile: true ⇒ un pulsante per intestazione');
  assert.equal(nodo.querySelector('input.talos-field__input'), null, 'filtrabile assente ⇒ nessun filtro');
  const righe = nodo.querySelectorAll('tbody tr');
  assert.equal(righe.length, 3);
  assert.deepEqual(righe[0].children.map(testoDi), ['Gennaio', '1200,00\u00A0€'], 'italiano: il separatore delle migliaia da cinque cifre (CLDR)');
  assert.deepEqual(righe[2].children.map(testoDi), ['Marzo', '—'], 'una cella che manca è un trattino');
  assert.ok(righe[1].children[1].classList.contains('num'));
});

test('BLOCCHI-PC-02 grafico: linee in SVG nostro, barre e torta; role=img col nome dalla descrizione; legenda solo da due serie', () => {
  const { nodo } = monta(corpo('02-grafico'));
  const figura = nodo.querySelector('[role="img"]');
  assert.equal(figura.getAttribute('aria-label'), 'Il prezzo sale da 10 a 14 euro fra gennaio e marzo.');
  const linea = nodo.querySelector('polyline.gc-serie');
  assert.ok(linea, 'linee ⇒ una polyline');
  assert.equal(linea.getAttribute('points').split(' ').length, 3);
  assert.equal(linea.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(nodo.querySelector('.gu-legenda'), null, 'una serie ⇒ niente legenda');
  assert.equal(nodo.querySelector('.gu-descrizione').getAttribute('aria-hidden'), 'true', 'la descrizione non si legge due volte');

  const barre = monta('root = Grafico("b", "Costi", "barre", "Due fornitori, due mesi.", [{nome: "Ott", punti: [{x: "OpenRouter", y: 19.4}, {x: "Z.AI", y: 7.1}]}, {nome: "Nov", punti: [{x: "OpenRouter", y: 9.7}, {x: "Locale", y: 1}]}], "€")').nodo;
  const barra = barre.querySelectorAll('.gr__barra');
  assert.equal(barra.length, 4);
  assert.equal(barra[0].style.width, '100%');
  assert.equal(barra[1].style.width, `${(9.7 / 19.4) * 100}%`);
  assert.ok(barra[1].classList.contains('gu-s2'), 'la seconda serie ha il suo colore');
  assert.deepEqual(barre.querySelectorAll('.gr__v').map(testoDi), ['19,4 €', '9,7 €', '7,1 €', '1 €']);
  assert.deepEqual(barre.querySelectorAll('.gr__n').map(testoDi), ['OpenRouter', '', 'Z.AI', 'Locale'], 'il nome anche quando la prima serie non ha quel punto');
  assert.equal(barre.querySelectorAll('.gu-legenda__voce').length, 2, 'due serie ⇒ legenda');

  const torta = monta('root = Grafico("t", null, "torta", "Quote.", [{nome: "Quote", punti: [{x: "A", y: 3}, {x: "B", y: 1}]}])').nodo;
  const fette = torta.querySelectorAll('circle.gc-torta');
  assert.equal(fette.length, 2);
  assert.match(torta.querySelector('.gu-legenda').textContent, /A · 3 · 75%/u);
  assert.equal(fette[1].getAttribute('stroke-dashoffset'), (-(3 / 4) * 2 * Math.PI * 30).toFixed(2));
});

test('BLOCCHI-PC-03 scelte: un tasto per opzione col testo del modello, la domanda, la frase sul clic', () => {
  const { nodo } = monta(corpo('03-scelte'));
  const tasti = nodo.querySelectorAll('button[data-scelta]');
  assert.deepEqual(tasti.map(testoDi), ['Continua', 'Fermati qui']);
  assert.ok(tasti.every((b) => b.classList.contains('talos-button--secondary') && b.type === 'button' && !spento(b)));
  assert.equal(nodo.querySelector('.gu-scelte__domanda').textContent, 'Come vuoi procedere?');
  assert.equal(nodo.querySelector('.gu-scelte__nota').textContent, t('blocchi.choices.note'));
});

test('BLOCCHI-PC-04 modulo: un campo per domanda, scelte come chip radio, testo e numero sul campo di casa, il tasto del modello sotto', () => {
  const { nodo } = monta(corpo('04-modulo'));
  assert.equal(nodo.querySelectorAll('input.talos-field__input').length, 2);
  assert.equal(nodo.querySelector('input[data-campo="notti"]').getAttribute('inputmode'), 'decimal');
  assert.equal(nodo.querySelector('input[data-campo="notti"]').type, 'text', 'niente spin nativo');
  const chip = nodo.querySelectorAll('.talos-chip[role="radio"]');
  assert.deepEqual(chip.map(testoDi), ['Treno', 'Aereo']);
  assert.ok(chip.every((c) => c.getAttribute('aria-checked') === 'false'), 'nessuna scelta già fatta');
  assert.equal(nodo.querySelector('fieldset.gq-campo legend').textContent, 'Mezzo');
  const invia = nodo.querySelector('.gu__sotto button[data-invia-modulo]');
  assert.equal(invia.textContent, 'Cerca');
  assert.ok(invia.classList.contains('talos-button--primary'));
});

test('BLOCCHI-PC-05 chiave-valore: righe talos-kv, stato col pallino e con la parola', () => {
  const { nodo } = monta(corpo('05-chiave-valore'));
  const righe = nodo.querySelectorAll('.talos-kv');
  assert.equal(righe.length, 3);
  assert.deepEqual(righe.map((r) => r.querySelector('.talos-kv__k').textContent), ['CPU', 'Disco', 'Acceso da']);
  assert.ok(righe[0].querySelector('.talos-kv__v').classList.contains('gu-kv--ok'));
  assert.ok(righe[1].querySelector('.talos-kv__v').classList.contains('gu-kv--attenzione'));
  assert.equal(righe[1].querySelector('.sr-only').textContent, ` (${t('blocchi.status.attenzione')})`);
  assert.equal(righe[2].querySelector('.sr-only'), null);
  assert.match(righe[1].querySelector('.talos-kv__v').textContent, /^91 /u);
});

test('BLOCCHI-PC-06 passi: elenco ordinato, stato nel pallino e a parole, «ora» è il passo corrente', () => {
  const { nodo } = monta(corpo('06-passi'));
  const voci = nodo.querySelectorAll('ol.gc-linea li');
  assert.deepEqual(voci.map((v) => v.dataset.stato), ['fatto', 'ora', 'dopo']);
  assert.equal(voci[1].getAttribute('aria-current'), 'step');
  assert.equal(voci[0].querySelector('.gc-linea__ora').textContent, 'lunedì');
  assert.equal(voci[2].querySelector('.gu-passi__titolo').textContent, 'Spegnimento del vecchio');
  assert.equal(voci[2].querySelector('.sr-only').textContent, ` (${t('blocchi.steps.daFare')})`);
});

test('BLOCCHI-PC-07 avviso: il talos-callout di casa per tono, testo su più righe, il tono a parole', () => {
  const { nodo } = monta(corpo('07-avviso'));
  const c = nodo.querySelector('.talos-callout');
  assert.equal(c.dataset.tono, 'attenzione');
  assert.equal(c.getAttribute('role'), 'note');
  assert.equal(c.querySelector('.gu-avviso__testo').textContent, 'Il disco è quasi pieno:\nrestano 2 GB.');
  const errore = monta('root = Avviso("e", null, "errore", "No.")').nodo.querySelector('.talos-callout');
  assert.ok(errore.classList.contains('talos-callout--pericolo'));
  const info = monta('root = Avviso("i", null, "info", "Sì.")').nodo.querySelector('.talos-callout');
  assert.ok(info.classList.contains('gu-avviso--info'));
});

test('BLOCCHI-PC-08 il testo del modello resta TESTO: un <script> in una cella, in un titolo, in un\'opzione non diventa un elemento', () => {
  const sporco = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const casi = [
    `root = Tabella("t", "${sporco}", [{id: "a", titolo: "${sporco}", tipo: "testo"}], [["${sporco}"]], true, true)`,
    `root = Scelte("s", "${sporco}", "${sporco}", [{testo: "<b>x</b>"}])`,
    `root = ChiaveValore("k", null, [{chiave: "${sporco}", valore: "${sporco}"}])`,
    `root = Grafico("g", null, "linee", "${sporco}", [{nome: "${sporco}", punti: [{x: "${sporco}", y: 1}]}])`,
    `root = Avviso("a", null, "info", "${sporco}")`,
  ];
  for (const testo of casi) {
    const { nodo, risultato } = monta(testo);
    assert.equal(risultato.stato, 'completo', testo);
    const tag = tutto(nodo).map((n) => n.tagName.toLowerCase());
    assert.ok(!tag.includes('script') && !tag.includes('img') && !tag.includes('b'), `${testo} ⇒ ${tag}`);
    assert.ok(nodo.textContent.includes('<script>alert(1)</script>') || nodo.textContent.includes('<b>x</b>'), 'il testo si vede com\'è');
  }
});

test('BLOCCHI-PC-09 nessun innerHTML coi dati del modello: guardia statica sui sorgenti dei blocchi', () => {
  const cartella = new URL('../../src/components/blocchi/', import.meta.url);
  const file = readdirSync(cartella).filter((f) => f.endsWith('.js'));
  assert.ok(file.length >= 12, `i file dei blocchi: ${file}`);
  for (const f of file) {
    const sorgente = readFileSync(new URL(f, cartella), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
    for (const vietato of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'DOMParser', 'createContextualFragment', 'srcdoc', 'eval(', 'new Function']) {
      assert.ok(!sorgente.includes(vietato), `${f} usa ${vietato}`);
    }
  }
});

test('BLOCCHI-PC-10 un clic su scelte ⇒ UN oggetto talos.blocco.azione.v1 con chiave d\'unicità; doppio clic e altre viste: niente', () => {
  const doc = documento();
  const risultato = leggi(corpo('03-scelte'));
  const azioni = [];
  const stato = statoDelBlocco();
  const opz = { document: doc, stato, origine: 'msg-42', quandoAgisce: (a) => azioni.push(a) };
  const a = disegnaBlocco(risultato, opz), b = disegnaBlocco(risultato, opz); // in linea e a lato: stesso stato
  doc.body.append(a, b);
  const [continua, fermati] = a.querySelectorAll('button[data-scelta]');
  clic(continua); clic(continua); clic(fermati);
  clic(b.querySelector('button[data-scelta]'));
  assert.equal(azioni.length, 1);
  assert.deepEqual({ ...azioni[0] }, { evento: EVENTO_AZIONE, idBlocco: 'prossimo', tipo: 'scelte', valore: 'Continua', chiave: 'msg-42#prossimo', titolo: null });
  assert.ok(Object.isFrozen(azioni[0]));
  assert.equal(continua.getAttribute('aria-pressed'), 'true');
  assert.equal(fermati.getAttribute('aria-pressed'), 'false');
  assert.ok(spento(continua) && spento(fermati), 'dopo il primo clic il blocco è bloccato');
  /* ridisegnato dopo (riapertura): resta bloccato sulla scelta fatta */
  const c = disegnaBlocco(risultato, opz);
  assert.ok(c.querySelectorAll('button[data-scelta]').every((x) => spento(x)));
  assert.equal(c.querySelector('button[data-scelta="Continua"]').getAttribute('aria-pressed'), 'true');
});

test('BLOCCHI-PC-11 nessun clic finché il blocco non è completo: scelte e modulo in arrivo sono spenti', () => {
  const clock = orologio();
  impostaOrologioCaricamento(clock.adesso);
  const doc = documento();
  const azioni = [];
  const vivo = montaBloccoVivo({ document: doc, timer: clock.timer, quandoAgisce: (a) => azioni.push(a) });
  doc.body.append(vivo.nodo);
  vivo.aggiungi('root = Scelte("s", "Allora?", null, [{testo: "Sì"}, {testo: "No"}]');
  clock.avanza(RITMO_DEL_DISEGNO_MS);
  const tasti = vivo.nodo.querySelectorAll('button[data-scelta]');
  assert.equal(tasti.length, 2, 'le opzioni arrivate si vedono già');
  assert.ok(tasti.every((x) => spento(x)), 'ma non si cliccano');
  clic(tasti[0]);
  assert.equal(azioni.length, 0);
  assert.equal(vivo.nodo.getAttribute('aria-busy'), 'true');
  vivo.aggiungi(')');
  vivo.fine();
  const dopo = vivo.nodo.querySelectorAll('button[data-scelta]');
  assert.ok(dopo.every((x) => !spento(x)));
  clic(dopo[1]);
  assert.equal(azioni.length, 1);
  assert.equal(azioni[0].valore, 'No');
  /* il modulo in arrivo: chip e tasti spenti */
  const m = montaBloccoVivo({ document: doc, timer: clock.timer, quandoAgisce: (a) => azioni.push(a) });
  doc.body.append(m.nodo);
  m.aggiungi(corpo('04-modulo').slice(0, -12));
  clock.avanza(RITMO_DEL_DISEGNO_MS);
  const controlli = [...m.nodo.querySelectorAll('.talos-chip'), ...m.nodo.querySelectorAll('input')];
  assert.ok(controlli.length >= 2 && controlli.every((x) => spento(x)));
  impostaOrologioCaricamento(null);
});

test('BLOCCHI-PC-12 in arrivo: riga viva coi secondi e le parole del tipo; il disegno segue il ritmo di 33 ms, mai uno per pezzo', () => {
  const clock = orologio();
  impostaOrologioCaricamento(clock.adesso);
  const doc = documento();
  const vivo = montaBloccoVivo({ document: doc, timer: clock.timer });
  doc.body.append(vivo.nodo);
  const testo = corpo('01-tabella');
  for (const c of testo.slice(0, 120)) vivo.aggiungi(c);
  assert.equal(vivo.disegni, 0, '120 pezzi ⇒ nessun disegno prima dei 33 ms');
  assert.equal(clock.attese() <= 2, true, 'al più un disegno in attesa (più l\'orologio della riga)');
  clock.avanza(RITMO_DEL_DISEGNO_MS);
  assert.equal(vivo.disegni, 1);
  const riga = vivo.nodo.querySelector('.gu-in-arrivo');
  assert.equal(riga.getAttribute('role'), 'status');
  assert.equal(riga.querySelector('.talos-caricamento__etichetta').textContent, t('blocchi.arriving.tabella'));
  assert.ok(riga.querySelector('.talos-caricamento__etichetta').classList.contains('talos-waiting__label'), 'lo shimmer di casa, subito');
  clock.avanza(3000);
  assert.equal(riga.querySelector('.talos-caricamento__secondi').textContent, durataBreveRigaViva(3000));
  assert.equal(vivo.nodo.querySelector('h3.gu__titolo').textContent, 'Vendite per mese', 'il titolo arrivato si vede già');
  const disegniPrima = vivo.disegni;
  clock.avanza(1000);
  assert.equal(vivo.disegni, disegniPrima, 'senza pezzi nuovi nessun ridisegno (i secondi corrono da soli)');
  for (const c of testo.slice(120)) vivo.aggiungi(c);
  vivo.fine();
  assert.equal(vivo.nodo.dataset.stato, 'completo');
  assert.equal(vivo.nodo.getAttribute('aria-busy'), null);
  assert.equal(vivo.nodo.querySelector('.gu-in-arrivo'), null, 'a fine arrivo la riga se ne va');
  assert.equal(vivo.nodo.querySelectorAll('tbody tr').length, 3);
  assert.equal(clock.attese(), 0, 'niente orologi lasciati accesi');
  impostaOrologioCaricamento(null);
});

test('BLOCCHI-PC-13 rotto: frase onesta col perché, il resto a posto, «Mostra il testo» apre il recinto così com\'è', () => {
  const casi = [
    ['root = Tabella("t", "x", [{id: "a"', 'blocchi.broken.reasonHalfway'],
    [corpo('20-rotto-tipo-sconosciuto'), 'blocchi.broken.reasonForm'],
    [corpo('25-rotto-oltre-il-limite'), 'blocchi.broken.reasonTooBig'],
  ];
  for (const [testo, chiave] of casi) {
    const { nodo, risultato } = monta(testo);
    assert.equal(risultato.stato, 'rotto');
    assert.equal(nodo.dataset.stato, 'rotto');
    assert.equal(nodo.querySelector('.gu-rotto').textContent, t('blocchi.broken.text', { perche: t(chiave) }));
    const mostra = nodo.querySelector('.gu-rotto__azioni button');
    const grezzo = nodo.querySelector('.gu-rotto__testo');
    assert.equal(grezzo.hidden, true);
    clic(mostra);
    assert.equal(grezzo.hidden, false);
    assert.equal(mostra.getAttribute('aria-expanded'), 'true');
    assert.equal(mostra.textContent, t('blocchi.broken.hideText'));
    assert.equal(grezzo.querySelector('code').textContent, testo);
    clic(mostra);
    assert.equal(grezzo.hidden, true);
    assert.equal(voceDelMenu(nodo, 'copia'), null, 'un blocco rotto non ha le azioni');
  }
  /* il blocco di codice della chat, se l'aggancio lo passa */
  const doc = documento();
  const usato = [];
  const n = disegnaBlocco(leggi('root = '), { document: doc, testo: 'root = ', bloccoCodice: (x) => { usato.push(x); return doc.createElement('div'); } });
  clic(n.querySelector('.gu-rotto__azioni button'));
  assert.deepEqual(usato, ['root = ']);
  /* rotto mentre arriva: subito, senza aspettare la fine */
  const clock = orologio();
  impostaOrologioCaricamento(clock.adesso);
  const vivo = montaBloccoVivo({ document: doc, timer: clock.timer });
  doc.body.append(vivo.nodo);
  vivo.aggiungi('root = Foto(');
  assert.equal(vivo.nodo.dataset.stato, 'rotto');
  assert.equal(clock.attese(), 0);
  impostaOrologioCaricamento(null);
});

test('BLOCCHI-PC-14 dati esterni: un blocco con fonte non ha clic; la fonte dell\'ospite vieta scelte (rotto) e si vede sotto', () => {
  const finto = { versione: 1, stato: 'completo', righe: 1, blocco: { tipo: 'scelte', id: 's', opzioni: [{ testo: 'Sì' }], fonte: { tipo: 'pagina', nome: 'x.it' } } };
  assert.equal(puoAgire(finto), false);
  /* ogni guardia regge da sola (difesa doppia: il guscio E il disegnatore E il primo gesto) */
  const senza = { ...finto, blocco: { ...finto.blocco, fonte: undefined } };
  assert.equal(puoAgire(senza), true);
  assert.equal(puoAgire({ ...senza, stato: 'in-arrivo' }), false);
  assert.equal(puoAgire({ ...senza, blocco: { ...senza.blocco, tipo: 'tabella' } }), false);
  const diretto = disegnaScelte(finto.blocco, { document: documento(), interattivo: true });
  assert.ok(spento(diretto.querySelector('button[data-scelta]')), 'il disegnatore non si fida di chi lo chiama');
  const moduloEsterno = disegnaModulo({ tipo: 'modulo', id: 'm', campi: [{ id: 'a', etichetta: 'A', tipo: 'testo' }], invia: 'Vai', fonte: { tipo: 'file', nome: 'x' } }, { document: documento(), interattivo: true });
  assert.ok(spento(moduloEsterno.querySelector('input')) && spento(moduloEsterno.azioniDelBlocco[0]), 'anche il modulo');
  const st = statoAzione(), consegnate = [];
  assert.ok(agisci(st, creaAzione(senza.blocco, 'Sì', 'o'), (a) => consegnate.push(a)));
  assert.equal(agisci(st, creaAzione(senza.blocco, 'Sì', 'o'), (a) => consegnate.push(a)), null);
  assert.equal(consegnate.length, 1);
  const doc = documento();
  const azioni = [];
  const n = disegnaBlocco(finto, { document: doc, quandoAgisce: (a) => azioni.push(a) });
  clic(n.querySelector('button[data-scelta]'));
  assert.equal(azioni.length, 0);
  assert.ok(spento(n.querySelector('button[data-scelta]')));
  const { nodo } = monta(corpo('03-scelte'), { fonteOspite: { tipo: 'pagina', nome: 'esempio.it' } });
  assert.equal(nodo.dataset.stato, 'rotto');
  assert.equal(nodo.querySelector('.gu-rotto').textContent, t('blocchi.broken.text', { perche: t('blocchi.broken.reasonExternal') }));
  const conFonte = monta(corpo('10-fonte-tabella'), { apriFonte: () => {} }).nodo;
  const fonte = conFonte.querySelector('.gu__sotto .gu__fonte');
  assert.equal(fonte.textContent, `${t('blocchi.source.label')} esempio.it · 2026-11-02`);
  assert.equal(fonte.querySelector('button[data-fonte]').textContent, 'esempio.it');
});

test('BLOCCHI-PC-15 modulo: un invio = un oggetto con le risposte per id; vuoto non parte; dopo, tutto spento', () => {
  const doc = documento();
  const azioni = [];
  const n = disegnaBlocco(leggi(corpo('04-modulo')), { document: doc, origine: 'm1', quandoAgisce: (a) => azioni.push(a) });
  doc.body.append(n);
  const invia = n.querySelector('button[data-invia-modulo]');
  clic(invia);
  assert.equal(azioni.length, 0, 'un modulo vuoto non diventa un messaggio');
  n.querySelector('input[data-campo="meta"]').value = ' Milano ';
  clic(n.querySelector('.talos-chip[data-valore="Aereo"]'));
  clic(n.querySelector('.talos-chip[data-valore="Treno"]'));
  clic(invia); clic(invia);
  assert.equal(azioni.length, 1);
  assert.deepEqual({ ...azioni[0].valore }, { meta: 'Milano', notti: null, mezzo: 'Treno' });
  assert.equal(azioni[0].chiave, 'm1#viaggio');
  assert.equal(azioni[0].tipo, 'modulo');
  assert.equal(testoDelModulo(leggi(corpo('04-modulo')).blocco, azioni[0].valore), 'Dove vuoi andare?: Milano · Mezzo: Treno');
  assert.ok([...n.querySelectorAll('.talos-chip'), ...n.querySelectorAll('input'), invia].every((x) => spento(x)));
  clic(n.querySelector('.talos-chip[data-valore="Aereo"]'));
  assert.equal(n.querySelector('.talos-chip[data-valore="Treno"]').getAttribute('aria-checked'), 'true', 'bloccato: niente cambia');
  /* più scelte: chip checkbox che si accendono e spengono */
  const p = disegnaBlocco(leggi('root = Modulo("p", null, [{id: "f", etichetta: "Fornitori", tipo: "piu-scelte", opzioni: [{testo: "A"}, {testo: "B"}]}], "Manda")'), { document: doc, quandoAgisce: (a) => azioni.push(a) });
  const [ca, cb] = p.querySelectorAll('.talos-chip[role="checkbox"]');
  clic(ca); clic(cb); clic(ca);
  clic(p.querySelector('button[data-invia-modulo]'));
  assert.deepEqual(azioni[1].valore.f, ['B']);
});

test('BLOCCHI-PC-16 tabella viva: filtro e ordine nello stato condiviso fra le viste; aria-sort sul th, ricavato dallo stato', () => {
  const doc = documento();
  const testo = 'root = Tabella("c", "Costi", [{id: "n", titolo: "Fornitore", tipo: "testo"}, {id: "e", titolo: "Costo", tipo: "soldi"}], [["OpenRouter", 19.4], ["Z.AI", 7.1], ["ChatGPT", 0], ["Altro", null]], true, true)';
  const r = leggi(testo);
  const stato = statoDelBlocco();
  const a = disegnaBlocco(r, { document: doc, stato }), b = disegnaBlocco(r, { document: doc, stato });
  doc.body.append(a, b);
  const nomi = (n) => n.querySelectorAll('tbody tr').map((x) => x.children[0].textContent);
  assert.equal(a.querySelector('.gu-conta').textContent, t('blocchi.table.countMany', { n: 4, total: 4 }));
  const [ordinaNome, ordinaCosto] = a.querySelectorAll('th button[data-ordina]');
  clic(ordinaCosto);
  assert.deepEqual(nomi(a), ['OpenRouter', 'Z.AI', 'ChatGPT', 'Altro'], 'cifre: prima dal più grande; i vuoti in fondo');
  assert.deepEqual(nomi(b), nomi(a), 'l\'altra vista segue');
  assert.equal(b.querySelectorAll('th')[1].getAttribute('aria-sort'), 'descending');
  assert.equal(b.querySelectorAll('th')[0].getAttribute('aria-sort'), null);
  clic(ordinaCosto);
  assert.deepEqual(nomi(a), ['ChatGPT', 'Z.AI', 'OpenRouter', 'Altro']);
  assert.equal(a.querySelectorAll('th')[1].getAttribute('aria-sort'), 'ascending');
  clic(ordinaNome);
  assert.deepEqual(nomi(a), ['Altro', 'ChatGPT', 'OpenRouter', 'Z.AI']);
  assert.equal(a.querySelectorAll('th button')[0], ordinaNome, 'il pulsante non si ricrea: il fuoco resta lì');
  const filtro = a.querySelector('input.talos-field__input');
  filtro.value = 'ROUTER';
  filtro.dispatchEvent(new Event('input'));
  assert.deepEqual(nomi(b), ['OpenRouter'], 'dentro la parola, senza maiuscole');
  assert.equal(b.querySelector('input.talos-field__input').value, 'ROUTER');
  assert.equal(b.querySelector('.gu-conta').textContent, t('blocchi.table.countMany', { n: 1, total: 4 }));
  filtro.value = 'zzz';
  filtro.dispatchEvent(new Event('input'));
  assert.equal(a.querySelector('tbody td').textContent, t('blocchi.table.noMatch'));
  assert.equal(a.querySelector('tbody td').getAttribute('colspan'), '2');
  /* una vista tolta dalla pagina smette di ascoltare */
  b.remove();
  filtro.value = '';
  filtro.dispatchEvent(new Event('input'));
  assert.equal(stato.tabella.ascoltatori, 1);
});

test('BLOCCHI-PC-17 «Copia» copia il ripiego testuale del nucleo; le altre azioni solo se l\'aggancio le sa fare', async () => {
  const doc = documento();
  const r = leggi(corpo('05-chiave-valore'));
  const copiati = [];
  const clock = orologio();
  const n = disegnaBlocco(r, { document: doc, copia: (x) => copiati.push(x), timer: clock.timer });
  doc.body.append(n); // R-10 (a876486c2, menu-del-blocco.js `esegui`): an entry of a shell off the page never acts
  /* scena 8 (05/11): le azioni stanno nel menu «⋯» della testata, la conferma in riga sotto; G-B2 (ea57a53ce): «Mostra il testo» sempre */
  const voci = (x) => vociDelMenu(x);
  assert.deepEqual(voci(n).map(testoDi), [t('blocchi.versions.showText'), t('chat.common.copy'), t('blocchi.actions.exportText')], 'senza aggancio: solo Mostra il testo, Copia ed Esporta');
  const copia = voceDelMenu(n, 'copia');
  clic(copia);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(copiati, [ripiegoTestuale(r.blocco, { lingua: 'it' })]);
  const fatto = n.querySelector('.gu__sotto .gu-fatto');
  assert.equal(fatto.textContent, t('chat.common.copied'));
  clock.avanza(4000);
  assert.equal(fatto.textContent, '');
  const fatti = [];
  const m = disegnaBlocco(r, { document: doc, azioni: { lato: (b) => fatti.push(['lato', b.id]), schermo: (b) => fatti.push(['schermo', b.id]), libreria: (b) => fatti.push(['libreria', b.id]) } });
  doc.body.append(m);
  assert.deepEqual(voci(m).map(testoDi), [t('blocchi.actions.side'), t('blocchi.actions.fullScreen'), t('blocchi.actions.library'), t('blocchi.versions.showText'), t('chat.common.copy'), t('blocchi.actions.exportText')]);
  voci(m).slice(0, 3).forEach(clic);
  assert.deepEqual(fatti, [['lato', 'server'], ['schermo', 'server'], ['libreria', 'server']]);
});

test('BLOCCHI-PC-18 la scelta del disegno sta in UNA costante: A di serie, B porta le azioni in testata e la fonte resta sotto', () => {
  assert.deepEqual({ ...SCELTA_DEL_DISEGNO }, { guscio: 'a', versione: 'equilibrata' });
  assert.ok(Object.isFrozen(SCELTA_DEL_DISEGNO));
  const doc = documento();
  const r = leggi(corpo('10-fonte-tabella'));
  const a = disegnaBlocco(r, { document: doc });
  assert.equal(a.dataset.versione, 'equilibrata');
  assert.ok(a.querySelector('.gu__testa button[aria-haspopup="menu"]') && voceDelMenu(a, 'copia'), 'scena 8: le azioni nel «⋯» della testata');
  assert.equal(a.querySelector('.gu__sotto button'), null);
  const b = disegnaBlocco(r, { document: doc, scelta: { guscio: 'b', versione: 'spinta' } });
  assert.ok(b.classList.contains('gu--b'));
  assert.equal(b.dataset.versione, 'spinta');
  assert.ok(b.querySelector('.gu__testa button[aria-haspopup="menu"]') && voceDelMenu(b, 'copia'));
  assert.equal(b.querySelector('.gu__sotto button'), null, 'nessun doppione sotto');
  assert.ok(b.querySelector('.gu__sotto .gu__fonte'), 'la provenienza non si perde');
});

test('BLOCCHI-PC-19 le parole: ogni chiave blocchi.* usata nei sorgenti esiste in inglese e in italiano, e sono diverse', () => {
  const cartella = new URL('../../src/components/blocchi/', import.meta.url);
  const usate = new Set();
  for (const f of readdirSync(cartella)) for (const [, k] of readFileSync(new URL(f, cartella), 'utf8').matchAll(/'(blocchi\.[a-zA-Z0-9.]+)'/gu)) usate.add(k);
  assert.ok(usate.size >= 30, `chiavi usate: ${usate.size}`);
  for (const k of usate) {
    assert.ok(TESTI.en[k], `${k} manca in inglese`);
    assert.ok(TESTI.it[k], `${k} manca in italiano`);
    assert.ok(!k.includes('-'), `${k}: niente trattini`);
  }
  impostaLingua('en');
  const { nodo } = monta(corpo('01-tabella'));
  assert.deepEqual(nodo.querySelectorAll('tbody tr')[0].children.map(testoDi), ['Gennaio', '1,200.00\u00A0€'], 'i numeri seguono la lingua');
  assert.equal(voceDelMenu(nodo, 'copia').textContent, 'Copy');
  impostaLingua('it');
});

test('BLOCCHI-PC-20 una tabella in arrivo si vede ma non si filtra né si ordina: filtro e ordine si accendono a blocco completo', () => {
  const clock = orologio();
  impostaOrologioCaricamento(clock.adesso);
  const doc = documento();
  const vivo = montaBloccoVivo({ document: doc, timer: clock.timer });
  doc.body.append(vivo.nodo);
  vivo.aggiungi('root = Tabella("c", "Costi", [{id: "n", titolo: "Nome", tipo: "testo"}], [["A"], ["B"]], true, true, null');
  clock.avanza(RITMO_DEL_DISEGNO_MS);
  assert.equal(vivo.nodo.querySelectorAll('tbody tr').length, 2, 'le righe arrivate si vedono');
  assert.equal(vivo.nodo.querySelectorAll('th button').length, 0, 'niente ordine mentre arriva');
  assert.equal(vivo.nodo.querySelector('input.talos-field__input').disabled, true, 'filtro spento mentre arriva');
  vivo.aggiungi(')');
  vivo.fine();
  assert.equal(vivo.nodo.querySelectorAll('th button').length, 1);
  assert.equal(vivo.nodo.querySelector('input.talos-field__input').disabled, false);
  impostaOrologioCaricamento(null);
});
