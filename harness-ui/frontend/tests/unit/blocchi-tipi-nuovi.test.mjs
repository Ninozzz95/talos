/*
 * I quattro tipi del catalogo v2 sul PC (ledger G-C, scene 7 e 9, 05/11/2026): cursore, metriche, confronto, diagramma — e UIG-9.5
 * (i soldi con « €» staccato da uno spazio NON separabile). DOM finto di `aiuto-dom-blocchi.mjs`, nessun browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento } from './aiuto-dom-blocchi.mjs';
import { leggi } from '../../../src/blocchi/lettore.mjs';
import { ripiegoTestuale } from '../../../src/blocchi/catalogo.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { disegnaBlocco } from '../../src/components/blocchi/guscio.js';
import { numero } from '../../src/components/blocchi/comune.js';
import { testoNelNodo } from '../../src/components/blocchi/diagramma.js';
import { disegnaCursore } from '../../src/components/blocchi/cursore.js';
import { esportaBlocco } from '../../src/components/blocchi/esporta.js';

const FIXTURE = new URL('../../../tests/fixtures/blocchi/', import.meta.url);
const corpo = (nome) => readFileSync(new URL(`${nome}.txt`, FIXTURE), 'utf8');
const tutto = (n) => [n, ...n.discendenti()];

function monta(testo) {
  const doc = documento();
  const risultato = leggi(testo);
  const nodo = disegnaBlocco(risultato, { document: doc, testo });
  doc.body.append(nodo);
  return { doc, nodo, risultato };
}

test('UIG-9.5 i soldi portano « €» dopo uno spazio NON separabile (U+00A0), in tutte e due le lingue', () => {
  impostaLingua('it');
  assert.equal(numero(412, 'soldi'), '412,00 €');
  assert.equal(numero(-3.5, 'soldi'), '-3,50 €');
  impostaLingua('en');
  assert.equal(numero(1200, 'soldi'), '1,200.00 €');
  assert.equal(numero(1200), '1,200', 'un numero semplice resta senza simbolo');
  assert.equal(/ €/u.test(numero(5, 'soldi')), false, 'mai uno spazio normale, che andrebbe a capo prima del simbolo');
  impostaLingua('it');
});

test('UIG-7 cursore: input range nativo con etichetta visibile, risultato e totale che cambiano muovendolo, totale in aria-live', () => {
  impostaLingua('it');
  const { nodo } = monta(corpo('40-cursore'));
  assert.equal(nodo.dataset.tipo, 'cursore');
  const input = nodo.querySelector('input');
  assert.equal(input.getAttribute('type'), 'range');
  assert.deepEqual(['min', 'max', 'step'].map((k) => input.getAttribute(k)), ['0', '60', '5']);
  assert.equal(input.disabled, false, 'a blocco completo il cursore si muove');
  const etichetta = nodo.querySelector('label');
  assert.equal(etichetta.getAttribute('for'), input.getAttribute('id'), 'l\'etichetta visibile nomina il cursore');
  assert.equal(etichetta.textContent, 'Sconto sui modelli in rete');
  const qui = nodo.querySelector('output');
  assert.equal(qui.getAttribute('for'), input.getAttribute('id'));
  const totale = nodo.querySelector('.gu-totale');
  assert.equal(totale.getAttribute('aria-live'), 'polite');
  const risultati = () => nodo.querySelectorAll('.gu-cursore__risultato').map((n) => n.textContent);
  assert.equal(qui.textContent, '30');
  assert.deepEqual(risultati(), ['288,40 €', '126,35 €'], '412 e 180,5 col 30% di sconto');
  assert.equal(totale.textContent, 'Totale: 414,75 €');
  input.value = '60';
  input.dispatchEvent(new Event('input'));
  assert.equal(qui.textContent, '60');
  assert.deepEqual(risultati(), ['164,80 €', '72,20 €']);
  assert.equal(totale.textContent, 'Totale: 237,00 €');
});

test('UIG-7 cursore: mentre arriva (non interattivo, formula ancora assente) non si muove e non calcola', () => {
  const blocco = leggi(corpo('40-cursore')).blocco;
  for (const [b, interattivo] of [[blocco, false], [{ ...blocco, formula: undefined }, true]]) {
    const nodo = disegnaCursore(b, { document: documento(), interattivo });
    assert.equal(nodo.querySelector('input').disabled, true);
    assert.equal(nodo.querySelector('.gu-totale').textContent, '');
    assert.deepEqual(nodo.querySelectorAll('.gu-cursore__risultato').map((n) => n.textContent), ['—', '—']);
  }
});

test('UIG-9 metriche: nome, valore nella lingua, verso col segno E con la parola nascosta', () => {
  impostaLingua('it');
  const { nodo } = monta(corpo('41-metriche'));
  const riquadri = nodo.querySelectorAll('.gu-metrica');
  assert.equal(riquadri.length, 2);
  assert.equal(riquadri[0].querySelector('.gu-metrica__k').textContent, 'Spesa di ottobre');
  assert.equal(riquadri[0].querySelector('.gu-metrica__v').textContent, '675,30 €');
  const d = riquadri[0].querySelector('.gu-metrica__d');
  assert.equal(d.dataset.verso, 'su');
  assert.equal(d.querySelector('.gu-metrica__segno').getAttribute('aria-hidden'), 'true');
  assert.equal(d.querySelector('.sr-only').textContent.trim(), 'su', 'il verso detto a parole, non solo col colore');
  assert.equal(riquadri[1].querySelector('.gu-metrica__v').textContent, '214');
  assert.equal(riquadri[1].querySelectorAll('.gu-metrica__d').length, 0);
});

test('UIG-9 confronto: una colonna per voce, a favore e contro con l\'intestazione a parole, griglia dal CSS', () => {
  impostaLingua('it');
  const { nodo } = monta(corpo('42-confronto'));
  const griglia = nodo.querySelector('.gu-confronto');
  assert.equal(griglia.dataset.colonne, '2');
  assert.equal(griglia.getAttribute('style'), null, 'nessuno stile in linea');
  const col = nodo.querySelectorAll('.gu-confronto__colonna');
  assert.deepEqual(col.map((c) => c.querySelector('h4').textContent), ['In rete', 'Locale']);
  assert.deepEqual(col[0].querySelectorAll('.gu-confronto__titolo').map((n) => n.textContent), ['A favore', 'Contro']);
  assert.deepEqual(col[1].querySelectorAll('.gu-confronto__titolo').map((n) => n.textContent), ['A favore'], 'niente «contro» vuoto');
  assert.deepEqual(col[0].querySelectorAll('.gu-confronto__parte').map((n) => n.className),
    ['gu-confronto__parte gu-confronto__pro', 'gu-confronto__parte gu-confronto__contro'], 'il lato porta la sua classe: il CSS colora i punti da lì (LINGUA-2)');
  assert.deepEqual(col[0].querySelectorAll('li').map((n) => n.textContent), ['Modelli più grandi', 'Niente da installare', 'Costa a ogni richiesta']);
});

test('UIG-9 diagramma: SVG con punta di freccia a id unico, nome = ripiego testuale, testo dei nodi solo come testo', () => {
  impostaLingua('it');
  const { nodo, risultato } = monta(corpo('43-diagramma'));
  const s = nodo.querySelector('svg');
  assert.equal(s.getAttribute('role'), 'img');
  assert.equal(s.getAttribute('aria-label'), ripiegoTestuale(risultato.blocco, { lingua: 'it' }));
  const marcatore = nodo.querySelector('marker').getAttribute('id');
  const linee = nodo.querySelectorAll('polyline');
  assert.equal(linee.length, 3);
  assert.ok(linee.every((l) => l.getAttribute('marker-end') === `url(#${marcatore})`));
  assert.deepEqual(nodo.querySelectorAll('.gu-diagramma__nodo text').map((n) => n.textContent), ['Messaggio', 'Kernel', 'Attrezzi', 'Risposta']);
  assert.deepEqual(nodo.querySelectorAll('.gu-diagramma__etichetta').map((n) => n.textContent), ['chiama']);
  const altro = monta(corpo('43-diagramma')).nodo.querySelector('marker').getAttribute('id');
  assert.notEqual(altro, marcatore, 'due diagrammi nella stessa pagina non si rubano la punta');
  const ciclo = monta(corpo('44-diagramma-ciclo')).nodo;
  assert.equal(ciclo.querySelectorAll('.gu-diagramma__freccia--indietro').length, 1, 'il ciclo si taglia su UNA freccia all\'indietro');
});

test('UIG-9 diagramma: un testo ostile resta testo (nessun elemento in più) e l\'accorciatura non spezza un\'emoji', () => {
  const ostile = '<script>alert(1)</script>';
  const { nodo } = monta(`root = Diagramma("d", null, [{id: "a", testo: "${ostile}"}, {id: "b", testo: "B"}], [{da: "a", a: "b", testo: "<img src=x>"}])`);
  assert.equal(tutto(nodo).some((n) => ['script', 'img', 'foreignObject'].includes(n.tagName?.toLowerCase?.() ?? n.tagName)), false);
  assert.equal(nodo.querySelector('.gu-diagramma__nodo title').textContent, ostile, 'il testo intero resta nel titolo');
  const lungo = `${'a'.repeat(18)}😀😀`;
  const corto = testoNelNodo(lungo);
  assert.equal(Array.from(corto).length, 20, 'esattamente 20 punti di codice: entra intero');
  const spezza = testoNelNodo(`${'a'.repeat(18)}😀😀😀`);
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u.test(spezza.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/gu, '')), false);
  assert.equal(Array.from(spezza).at(-1), '…');
  assert.equal(spezza.isWellFormed(), true, 'mai mezza coppia surrogata');
});

/* ---- C2 (05/11/2026): i buchi di prova della revisione di G-C (e2, e9, e10) e il margine dell'anello su sé stesso ---- */

const GRAFICO_C2 = (forma, serie) => ({ tipo: 'grafico', id: 'g', titolo: 'T', forma, serie });
const testiValore = (svg) => [...svg.matchAll(/<text class="valore" x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]*)<\/text>/gu)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), testo: m[3] }));
const barreSvg = (svg) => [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" fill="#[0-9a-f]{6}"\/>/gu)].map((m) => m.slice(1).map(Number));

test('C2 e2 confronto: una colonna senza punti c\'è a schermo E resta una riga del CSV (l\'esportazione è lo schermo)', () => {
  impostaLingua('it');
  const { nodo, risultato } = monta('root = Confronto("c", null, [{nome: "Pieno", pro: ["uno"], contro: ["due", "tre"]}, {nome: "Vuota", pro: []}])');
  assert.deepEqual(nodo.querySelectorAll('.gu-confronto__colonna').map((c) => c.querySelector('h4').textContent), ['Pieno', 'Vuota']);
  const righe = esportaBlocco(risultato.blocco, { lingua: 'it' }).testo.slice(1).split('\r\n');
  assert.deepEqual(righe, ['Nome;A favore;Contro', 'Pieno;uno;due', ';;tre', 'Vuota;;']);
});

test('C2 e9 R-4e barre: il valore di una barra negativa sta SOTTO la barra, quello di una positiva SOPRA', () => {
  const svg = esportaBlocco(GRAFICO_C2('barre', [{ nome: 'S', punti: [{ x: 'a', y: 10 }, { x: 'b', y: -5 }] }]), { lingua: 'it' }).testo;
  const [pos, neg] = barreSvg(svg);
  const [tPos, tNeg] = testiValore(svg);
  assert.equal(tPos.testo, '10');
  assert.equal(tNeg.testo, '-5');
  assert.ok(tPos.y < pos[1], `positiva: testo a ${tPos.y}, sopra la cima ${pos[1]}`);
  assert.ok(tNeg.y > neg[1] + neg[3], `negativa: testo a ${tNeg.y}, sotto il fondo ${neg[1] + neg[3]}`);
});

test('C2 e10 R-4e linee: il valore dell\'ultimo punto resta dentro il grafico (ancorato alla fine, non oltre il bordo destro)', () => {
  const svg = esportaBlocco(GRAFICO_C2('linee', [{ nome: 'S', punti: [{ x: 'gen', y: 1 }, { x: 'feb', y: 3 }] }]), { lingua: 'it' }).testo;
  const spezzata = svg.match(/<polyline points="([^"]+)"/u)[1].split(' ').map((p) => p.split(',').map(Number));
  const destra = spezzata.at(-1)[0]; // l'ultimo punto sta sul bordo destro dell'area
  const [t] = testiValore(svg);
  assert.equal(t.testo, '3');
  assert.match(svg, /<text class="valore"[^>]*text-anchor="end"/u);
  assert.ok(t.x < destra, `il testo finisce a ${t.x}, prima del bordo dell'area ${destra}`);
});

test('C2 anello su sé stesso del nodo più a destra: entra nella larghezza, a schermo e nel viewBox dell\'SVG esportato', () => {
  impostaLingua('it');
  const { nodo, risultato } = monta('root = Diagramma("d", null, [{id: "a", testo: "A"}, {id: "b", testo: "B"}], [{da: "b", a: "b"}])');
  const s = nodo.querySelector('svg');
  const vista = Number(s.getAttribute('viewBox').split(' ')[2]);
  assert.equal(Number(s.getAttribute('width')), vista, 'la larghezza dell\'elemento è quella della tela');
  const linee = nodo.querySelectorAll('polyline');
  assert.equal(linee.length, 1);
  const xs = linee[0].getAttribute('points').split(' ').map((p) => Number(p.split(',')[0]));
  assert.ok(Math.max(...xs) <= vista, `a schermo l'anello arriva a ${Math.max(...xs)}, la tela è larga ${vista}`);
  const file = esportaBlocco(risultato.blocco, { lingua: 'it' }).testo;
  const l = Number(file.match(/viewBox="0 0 ([\d.]+) /u)[1]);
  const xsFile = file.match(/<polyline points="([^"]+)"/u)[1].split(' ').map((p) => Number(p.split(',')[0]));
  assert.ok(Math.max(...xsFile) <= l, `nell'SVG l'anello arriva a ${Math.max(...xsFile)}, il viewBox è largo ${l}`);
});
