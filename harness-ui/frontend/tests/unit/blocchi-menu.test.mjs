/*
 * Scena 8 (FE-080, gruppo G-A del ledger UI generativa 05/11/2026): le azioni del blocco nel menu «⋯» e col tasto destro,
 * l'esportazione in CSV (tabella) e come immagine (grafico), la conferma in riga. Variante A scelta dall'owner.
 * Fonti: WAI-ARIA APG «Menu Button Pattern» (w3.org/WAI/ARIA/apg/patterns/menu-button, letta il 05/11/2026);
 * OWASP «CSV Injection» (community.owasp.org/attacks/CSV_Injection, letta il 05/11/2026).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio, voceDelMenu } from './aiuto-dom-blocchi.mjs';
import { leggi } from '../../../src/blocchi/lettore.mjs';
import { ripiegoTestuale } from '../../../src/blocchi/catalogo.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { disegnaBlocco } from '../../src/components/blocchi/guscio.js';
import { azioniDelBlocco, creaMenuDelBlocco } from '../../src/components/blocchi/menu-del-blocco.js';
import { esportaBlocco, cellaCsv } from '../../src/components/blocchi/esporta.js';

impostaLingua('it');
const FIXTURE = new URL('../../../tests/fixtures/blocchi/', import.meta.url);
const corpo = (nome) => readFileSync(new URL(`${nome}.txt`, FIXTURE), 'utf8');
const ORA = new Date(2026, 10, 5, 19, 7);
const tasto = (key) => Object.assign(new Event('keydown', { cancelable: true }), { key });
const dopo = () => new Promise((r) => setImmediate(r));
const PIU = '.gu__testa button[aria-haspopup="menu"]';

const TABELLA = Object.freeze({
  tipo: 'tabella', id: 't1', titolo: 'Spese: ottobre/per voce',
  colonne: [{ id: 'voce', titolo: 'Voce; nome', tipo: 'testo' }, { id: 'euro', titolo: 'Euro', tipo: 'soldi' }],
  righe: [['Affitto "casa"', 750.5], ['=SOMMA(A1)', -12], [null, 3], ['riga\nnuova', 0]],
});

test('UIG-8.1 senza «Salva in Libreria» nell\'aggancio il menu non ha la voce Libreria; Copia ed Esporta ci sono sempre', () => {
  const blocco = leggi(corpo('01-tabella')).blocco;
  assert.deepEqual(azioniDelBlocco(blocco, {}).map((a) => a.id), ['copia', 'esporta']);
  const con = azioniDelBlocco(blocco, { lato() {}, schermo() {}, libreria() {} });
  assert.deepEqual(con.map((a) => a.id), ['lato', 'schermo', 'libreria', 'copia', 'esporta']);
  assert.equal(azioniDelBlocco(blocco, { libreria: 'non una funzione' }).some((a) => a.id === 'libreria'), false);
  assert.equal(con.find((a) => a.id === 'esporta').testo, t('blocchi.actions.exportCsv'));
  assert.equal(con.find((a) => a.id === 'esporta').separa, true, 'le esportazioni dopo un separatore, come nel bozzetto');
  assert.equal(azioniDelBlocco(leggi(corpo('02-grafico')).blocco, {}).find((a) => a.id === 'esporta').testo, t('blocchi.actions.exportImage'));
  assert.equal(azioniDelBlocco(leggi(corpo('05-chiave-valore')).blocco, {}).find((a) => a.id === 'esporta').testo, t('blocchi.actions.exportText'));
});

test('UIG-8.2 esportaBlocco(tabella): in italiano `;` e virgola decimale, in inglese `,` e punto; BOM e campi difficili tra virgolette', () => {
  const f = esportaBlocco(TABELLA, { ora: ORA, lingua: 'it' });
  assert.equal(f.mime, 'text/csv;charset=utf-8');
  assert.equal(f.nome, 'Spese ottobre - per voce.csv', 'la barra nel titolo diventa « - », non sparisce');
  assert.ok(f.testo.startsWith('﻿'), 'BOM per Excel');
  const righe = f.testo.slice(1).split('\r\n');
  assert.equal(righe[0], '"Voce; nome";Euro');
  assert.equal(righe[1], '"Affitto ""casa""";750,5', 'in italiano la virgola decimale, e il numero NON tra virgolette');
  assert.equal(righe[2], '\'=SOMMA(A1);-12', 'una formula non parte aprendo il file; un numero negativo resta un numero');
  assert.equal(righe[3], ';3');
  assert.equal(righe[4], '"riga\nnuova";0');
  assert.equal(righe.length, 5);
  const en = esportaBlocco(TABELLA, { ora: ORA, lingua: 'en' }).testo.slice(1).split('\r\n');
  assert.equal(en[0], 'Voce; nome,Euro', 'in inglese il `;` non chiede virgolette');
  assert.equal(en[1], '"Affitto ""casa""",750.5');
  assert.equal(en[2], '\'=SOMMA(A1),-12');
  assert.equal(en[3], ',3');
  assert.equal(esportaBlocco({ ...TABELLA, righe: [['a,b', 1234.25]] }, { lingua: 'en' }).testo.slice(1).split('\r\n')[1], '"a,b",1234.25');
  assert.equal(esportaBlocco({ ...TABELLA, righe: [['a,b', 1234.25]] }, { lingua: 'it' }).testo.slice(1).split('\r\n')[1], 'a,b;1234,25', 'in italiano la virgola non chiede virgolette');
  assert.equal(cellaCsv('a,b', 'en'), '"a,b"');
  assert.equal(cellaCsv('a;b', 'it'), '"a;b"');
  assert.equal(cellaCsv('a\rb', 'it'), '"a\rb"', 'anche il ritorno a capo da solo');
  assert.equal(cellaCsv('a\nb', 'en'), '"a\nb"');
  assert.equal(cellaCsv('+1'), '\'+1');
  assert.equal(cellaCsv('@x'), '\'@x');
  assert.equal(cellaCsv('-x'), '\'-x');
  for (const c of ['＝', '＋', '－', '＠']) assert.equal(cellaCsv(`${c}1`), `'${c}1`, `anche ${c} a tutta larghezza (OWASP)`);
  assert.equal(cellaCsv('\tx'), '\'\tx');
  assert.equal(cellaCsv('\rx'), '"\'\rx"');
  assert.equal(cellaCsv('semplice'), 'semplice');
  assert.equal(cellaCsv(undefined), '');
  assert.equal(esportaBlocco({ ...TABELLA, titolo: '' }, { ora: ORA, lingua: 'it' }).nome, 'talos-tabella-20261105-1907.csv');
  assert.equal(esportaBlocco({ ...TABELLA, titolo: '' }, { ora: ORA, lingua: 'en' }).nome, 'talos-table-20261105-1907.csv', 'il nome di ripiego segue la lingua');
  assert.equal(esportaBlocco({ ...TABELLA, titolo: '???' }, { ora: ORA, lingua: 'it' }).nome, 'talos-tabella-20261105-1907.csv');
  assert.equal(esportaBlocco({ ...TABELLA, titolo: 'a\\b' }, { ora: ORA, lingua: 'it' }).nome, 'a - b.csv');
  /* un titolo che sopravvive alla pulizia ma non ha né lettere né cifre non è un nome */
  assert.equal(esportaBlocco({ ...TABELLA, titolo: '— · —' }, { ora: ORA, lingua: 'it' }).nome, 'talos-tabella-20261105-1907.csv');
});

test('UIG-8.2b grafico come immagine SVG (testo scappato, niente script); gli altri tipi come il loro ripiego testuale', () => {
  const g = leggi(corpo('02-grafico')).blocco;
  for (const forma of ['barre', 'linee', 'torta']) {
    const f = esportaBlocco({ ...g, forma, titolo: 'A <b> & "c"' }, { ora: ORA });
    assert.equal(f.mime, 'image/svg+xml;charset=utf-8');
    assert.ok(f.nome.endsWith('.svg'), f.nome);
    assert.match(f.testo, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u);
    assert.ok(f.testo.includes('aria-label="A &lt;b&gt; &amp; &quot;c&quot;"'), `${forma}: aria-label scappato`);
    assert.ok(f.testo.includes('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>'), forma);
    assert.ok(!/<script|\son[a-z]+=/iu.test(f.testo), forma);
    assert.ok(f.testo.trimEnd().endsWith('</svg>'));
    const segni = (f.testo.match(/<(rect|polyline|path|circle)\b/gu) || []).length;
    assert.ok(segni >= g.serie[0].punti.length, `${forma}: ${segni} segni`);
    const figura = { barre: /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#3d6fd9"\/>/u, linee: /<polyline /u, torta: /<(path d="M|circle cx)/u }[forma];
    assert.match(f.testo, figura, forma);
    if (forma !== 'linee') assert.ok(!f.testo.includes('<polyline'), forma);
  }
  const kv = leggi(corpo('05-chiave-valore')).blocco;
  const f = esportaBlocco(kv, { ora: ORA, lingua: 'it' });
  assert.equal(f.mime, 'text/plain;charset=utf-8');
  assert.equal(f.testo, ripiegoTestuale(kv, { lingua: 'it' }));
  assert.ok(f.nome.endsWith('.txt'));
});

const GRAFICO = (forma, serie, extra = {}) => ({ tipo: 'grafico', id: 'g1', titolo: 'T', forma, serie, ...extra });
const rettangoli = (svg) => [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" fill="#[0-9a-f]{6}"\/>/gu)].map((m) => m.slice(1).map(Number));

test('UIG-8.2c l\'immagine esportata è quella dello schermo: barre negative, categorie per x, linee per x, legenda che va a capo, etichette accorciate', () => {
  /* barre negative: disegnate sotto lo zero, con altezza vera */
  const neg = esportaBlocco(GRAFICO('barre', [{ nome: 'S', punti: [{ x: 'a', y: 10 }, { x: 'b', y: -5 }] }]), { lingua: 'it' }).testo;
  const [ra, rb] = rettangoli(neg);
  assert.ok(rb[3] > 0, 'la barra negativa ha un\'altezza');
  assert.ok(Math.abs(ra[3] / rb[3] - 2) < 0.02, `proporzionate: ${ra[3]} contro ${rb[3]}`);
  assert.ok(Math.abs(rb[1] - (ra[1] + ra[3])) < 0.02, 'la negativa parte dallo zero, dove finisce la positiva');
  /* categorie come unione delle x, appaiate per x (non per posizione) */
  const due = esportaBlocco(GRAFICO('barre', [
    { nome: 'Uno', punti: [{ x: 'gen', y: 4 }, { x: 'feb', y: 2 }] },
    { nome: 'Due', punti: [{ x: 'feb', y: 8 }, { x: 'mar', y: 6 }] },
  ]), { lingua: 'it' }).testo;
  for (const x of ['gen', 'feb', 'mar']) assert.ok(due.includes(`>${x}</text>`), `la categoria ${x}`);
  const barre = rettangoli(due);
  assert.equal(barre.length, 4, 'un punto che manca non diventa una barra a zero');
  const xGen = barre[0][0];
  const febUno = barre[1], febDue = barre[2];
  assert.ok(febUno[0] > xGen && febDue[0] > febUno[0], 'feb della seconda serie accanto a feb della prima');
  assert.ok(Math.abs(febDue[3] / febUno[3] - 4) < 0.05, 'Due a feb vale 8, Uno a feb vale 2');
  /* linee per x: la seconda serie parte da feb, non da gen */
  const lin = esportaBlocco(GRAFICO('linee', [
    { nome: 'Uno', punti: [{ x: 'gen', y: 1 }, { x: 'feb', y: 2 }, { x: 'mar', y: 3 }] },
    { nome: 'Due', punti: [{ x: 'feb', y: 2 }, { x: 'mar', y: -1 }] },
  ]), { lingua: 'it' }).testo;
  const spezzate = [...lin.matchAll(/<polyline points="([^"]+)"/gu)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));
  assert.equal(spezzate.length, 2);
  assert.equal(spezzate[1][0][0], spezzate[0][1][0], 'il primo punto di Due sta sopra feb');
  assert.equal(spezzate[1][0][1], spezzate[0][1][1], 'stesso valore, stessa altezza');
  assert.ok(spezzate[1][1][1] > spezzate[0][0][1], 'il -1 scende sotto l\'1: la scala comprende i negativi');
  /* legenda: dieci serie dai nomi lunghi stanno dentro 640 */
  const molte = Array.from({ length: 10 }, (_, i) => ({ nome: `Serie numero ${i} con un nome lungo`, punti: [{ x: 'a', y: i + 1 }] }));
  const leg = esportaBlocco(GRAFICO('barre', molte), { lingua: 'it' }).testo;
  const xs = [...leg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>Serie numero/gu)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(xs.length, 10);
  assert.ok(xs.every(([x]) => x < 640), `nessuna voce oltre il bordo: ${xs.map((p) => p[0]).join(',')}`);
  assert.ok(new Set(xs.map((p) => p[1])).size > 1, 'la legenda va a capo');
  /* etichette lunghe accorciate coi puntini; il testo scappato DOPO l'accorciamento */
  const lunga = 'x'.repeat(80);
  const cat = esportaBlocco(GRAFICO('barre', [{ nome: 'S <&>', punti: [{ x: `<${lunga}>`, y: 1 }, { x: 'b', y: 2 }] }, { nome: 'Altra', punti: [{ x: 'b', y: 3 }] }], { unita: '€ <u>', descrizione: 'spese <x> & co' }), { lingua: 'it' }).testo;
  assert.ok(!cat.includes(lunga), 'l\'etichetta lunga non entra intera');
  assert.ok(/>&lt;x+…<\/text>/u.test(cat), 'accorciata coi puntini, e il < scappato');
  assert.ok(cat.includes('S &lt;&amp;&gt;'), 'il nome della serie scappato');
  assert.ok(cat.includes('€ &lt;u&gt;'), 'l\'unità scappata');
  assert.ok(!/<u>|<&>/u.test(cat));
  const desc = cat.match(/<desc>([^<]*)<\/desc>/u)?.[1] ?? '';
  assert.ok(desc.includes('&lt;') && !desc.includes('<x'), 'la descrizione scappata');
  /* torta: gli spicchi a zero non si disegnano, la legenda come a schermo (valore, unità, quota) */
  const torta = esportaBlocco(GRAFICO('torta', [{ nome: 'S', punti: [{ x: 'a', y: 3 }, { x: 'zero', y: 0 }, { x: 'b', y: 1 }] }], { unita: '%' }), { lingua: 'it' }).testo;
  assert.equal((torta.match(/<path d="M/gu) || []).length, 2, 'lo spicchio a zero non c\'è');
  assert.ok(torta.includes('a · 3% · 75%'), torta.match(/<text[^>]*>a ·[^<]*/u)?.[0]);
  const tortaEn = esportaBlocco(GRAFICO('torta', [{ nome: 'S', punti: [{ x: 'a', y: 1234.5 }, { x: 'b', y: 1 }] }]), { lingua: 'en' }).testo;
  assert.ok(tortaEn.includes('a · 1,234.5 · '), 'i numeri della legenda nella lingua');
  /* tutte positive: la scala parte da zero, come `grafico.js` (lo = min(0, …)); senza lo zero la barra più bassa sparirebbe */
  const positive = esportaBlocco(GRAFICO('barre', [{ nome: 'S', punti: [{ x: 'a', y: 5 }, { x: 'b', y: 10 }] }]), { lingua: 'it' }).testo;
  const [p5, p10] = rettangoli(positive);
  const altezzaSvg = Number(positive.match(/<svg[^>]* height="([\d.]+)"/u)[1]);
  assert.ok(p5[1] + p5[3] <= altezzaSvg - 40, `la base delle barre sta dentro l'immagine, sopra le etichette: ${p5[1] + p5[3]} su ${altezzaSvg}`);
  assert.ok(Math.abs(p10[3] / p5[3] - 2) < 0.02, `dallo zero: ${p5[3]} contro ${p10[3]}`);
  assert.ok(Math.abs(p5[1] + p5[3] - (p10[1] + p10[3])) < 0.02, 'poggiano sulla stessa linea dello zero');
  /* una serie sola: nessuna legenda, come sullo schermo */
  assert.ok(!/width="10" height="10"/u.test(neg), 'una serie sola non ha legenda');
  assert.ok(/width="10" height="10"/u.test(due), 'due serie sì');
  /* una torta con un solo spicchio è un cerchio pieno: un arco da 360° non si disegna */
  const piena = esportaBlocco(GRAFICO('torta', [{ nome: 'S', punti: [{ x: 'tutto', y: 7 }] }]), { lingua: 'it' }).testo;
  assert.ok(piena.includes('<circle '), 'il cerchio pieno');
  assert.equal((piena.match(/<path d="M/gu) || []).length, 0);
});

const MENU = '#menuDelBlocco';
const voceDi = (doc, k) => doc.body.querySelector(`${MENU} button[data-${k}]`);

test('UIG-8.3 il blocco ha UN tasto «⋯» in testata; il menu si apre nel corpo della pagina, fisso, condiviso; sotto resta solo la provenienza', () => {
  const doc = documento();
  const n = disegnaBlocco(leggi(corpo('10-fonte-tabella')), { document: doc, azioni: { lato() {}, schermo() {}, libreria() {} } });
  doc.body.append(n);
  const piu = n.querySelectorAll(PIU);
  assert.equal(piu.length, 1);
  assert.equal(piu[0].getAttribute('aria-label'), t('blocchi.menu.label'));
  assert.equal(piu[0].getAttribute('aria-expanded'), 'false');
  assert.equal(n.querySelector('[role="menu"]'), null, 'il menu NON vive nel blocco: un turno chiuso lo taglierebbe');
  clic(piu[0]);
  const menu = doc.body.querySelector(MENU);
  assert.ok(menu, 'il menu condiviso sta nel corpo');
  assert.equal(menu.parentNode, doc.body);
  assert.ok(menu.classList.contains('talos-context-menu'), 'lo stesso menu fisso delle altre superfici (schede.js)');
  assert.equal(menu.getAttribute('aria-label'), t('blocchi.menu.label'));
  assert.equal(menu.hidden, false);
  assert.equal(piu[0].getAttribute('aria-expanded'), 'true');
  const voci = menu.querySelectorAll('[role="menuitem"]');
  /* G-B2 (FE-081): «Barre ↔ Tabella» and «Mostra il testo» join this same menu (a table that can become bars, at v1) */
  assert.deepEqual(voci.map((v) => v.textContent), [t('blocchi.actions.side'), t('blocchi.actions.fullScreen'), t('blocchi.actions.library'), t('blocchi.versions.switchView'), t('blocchi.versions.showText'), t('chat.common.copy'), t('blocchi.actions.exportCsv')]);
  assert.deepEqual(voci.map((v) => v.querySelector('use')?.getAttribute('href')), ['#i-panel-right', '#i-maximize', '#i-library', '#i-lib-file-spreadsheet', '#i-code', '#i-copy', '#i-lib-file-spreadsheet'], 'le icone del bozzetto, dallo sprite');
  assert.equal(menu.querySelectorAll('[role="separator"]').length, 1);
  assert.equal(n.querySelectorAll('.gu__sotto button').length, 0, 'nessun tasto d\'azione sotto');
  assert.ok(n.querySelector('.gu__sotto .gu__fonte'), 'la provenienza resta');
  for (const k of ['lato', 'schermo', 'libreria', 'copia', 'esporta']) assert.ok(menu.querySelector(`button[data-${k}]`), k);
});

test('UIG-8.4 tastiera del menu (WAI-ARIA menu button): apre, frecce in giro, Home/End, Esc chiude, non risale e il fuoco torna su «⋯»', () => {
  const doc = documento();
  const fatte = [];
  const azioni = [{ id: 'a', testo: 'A', fai: () => fatte.push('a') }, { id: 'b', testo: 'B', fai: () => fatte.push('b') }, { id: 'c', testo: 'C', fai: () => fatte.push('c'), separa: true }];
  const m = creaMenuDelBlocco(doc, azioni, { valore: 'x1' });
  doc.body.append(m.nodo);
  let sulDocumento = 0;
  doc.addEventListener('keydown', () => { sulDocumento += 1; });
  const giu = tasto('ArrowDown');
  m.tasto.dispatchEvent(giu);
  assert.equal(giu.defaultPrevented, true, 'la freccia sul tasto non scorre la pagina');
  const menu = m.menu;
  const voci = menu.querySelectorAll('[role="menuitem"]');
  assert.equal(menu.querySelectorAll('[role="separator"]').length, 1, 'separa: un separatore prima della voce');
  assert.equal(voci[0].dataset.a, 'x1');
  assert.equal(menu.hidden, false);
  assert.equal(m.tasto.getAttribute('aria-expanded'), 'true');
  assert.equal(doc.activeElement, voci[0]);
  const frecce = ['ArrowDown', 'ArrowDown', 'ArrowDown'].map((k) => { const e = tasto(k); menu.dispatchEvent(e); return e; });
  assert.ok(frecce.every((e) => e.defaultPrevented), 'le frecce nel menu non scorrono la pagina');
  assert.equal(doc.activeElement, voci[0], 'dall\'ultima si torna alla prima');
  menu.dispatchEvent(tasto('ArrowUp'));
  assert.equal(doc.activeElement, voci[2], 'dalla prima si va all\'ultima');
  const casa = tasto('Home');
  menu.dispatchEvent(casa);
  assert.equal(doc.activeElement, voci[0]);
  assert.equal(casa.defaultPrevented, true);
  menu.dispatchEvent(tasto('End'));
  assert.equal(doc.activeElement, voci[2]);
  doc.activeElement = null;
  menu.dispatchEvent(tasto('ArrowUp'));
  assert.equal(doc.activeElement, voci[2], 'senza fuoco, freccia su va all\'ultima');
  const esc = Object.assign(new Event('keydown', { cancelable: true, bubbles: true }), { key: 'Escape' });
  const prima = sulDocumento;
  voci[1].dispatchEvent(esc);
  assert.equal(esc.defaultPrevented, true);
  assert.equal(sulDocumento, prima, 'Esc non risale: la vista a tutto schermo sotto non si chiude');
  assert.equal(menu.hidden, true);
  assert.equal(m.tasto.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.activeElement, m.tasto);
  m.tasto.dispatchEvent(tasto('ArrowUp'));
  assert.equal(doc.activeElement, m.menu.querySelectorAll('[role="menuitem"]')[2], 'freccia su apre sull\'ultima');
  m.menu.dispatchEvent(tasto('Tab'));
  assert.equal(m.menu.hidden, true, 'Tab chiude');
  clic(m.tasto);
  assert.equal(m.menu.hidden, false, 'il clic apre');
  assert.equal(doc.activeElement, m.menu.querySelectorAll('[role="menuitem"]')[0]);
  clic(m.tasto);
  assert.equal(m.menu.hidden, true, 'il secondo clic chiude');
  assert.deepEqual(fatte, []);
});

test('UIG-8.4b un clic fuori chiude il menu; un clic sul tasto o dentro no; aprire un altro blocco chiude il primo', () => {
  const doc = documento();
  const a = creaMenuDelBlocco(doc, [{ id: 'a', testo: 'A', fai() {} }]);
  const b = creaMenuDelBlocco(doc, [{ id: 'b', testo: 'B', fai() {} }]);
  const fuori = doc.createElement('p');
  doc.body.append(a.nodo, b.nodo, fuori);
  const giu = (n) => n.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  clic(a.tasto);
  giu(a.menu.querySelector('[role="menuitem"]'));
  assert.equal(a.menu.hidden, false, 'dentro il menu resta aperto');
  giu(a.tasto);
  assert.equal(a.menu.hidden, false, 'sul tasto ci pensa il clic');
  giu(fuori);
  assert.equal(a.menu.hidden, true, 'fuori chiude');
  assert.equal(a.tasto.getAttribute('aria-expanded'), 'false');
  clic(a.tasto);
  clic(b.tasto);
  assert.equal(a.tasto.getAttribute('aria-expanded'), 'false', 'un menu solo alla volta');
  assert.equal(b.tasto.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(b.menu.querySelectorAll('[role="menuitem"]').map((v) => v.textContent), ['B']);
});

test('UIG-8.5 scegliere una voce chiude il menu, rimette il fuoco su «⋯» PRIMA dell\'azione (senza scorrere) e mostra la conferma', async () => {
  const doc = documento();
  let fuocoAllAzione = null;
  const conferme = [];
  const fuochi = [];
  const azioni = [{ id: 'a', testo: 'A', fai: () => { fuocoAllAzione = doc.activeElement; return 'Fatto A'; } }, { id: 'b', testo: 'B', fai: () => undefined }];
  const m = creaMenuDelBlocco(doc, azioni, { valore: 'x', conferma: (s) => conferme.push(s) });
  doc.body.append(m.nodo);
  const proto = Object.getPrototypeOf(m.tasto);
  const vero = proto.focus;
  proto.focus = function (o) { fuochi.push(o); return vero.call(this, o); };
  try {
    clic(m.tasto);
    assert.deepEqual(fuochi.at(-1), { preventScroll: true }, 'aprire non fa scorrere la pagina');
    clic(m.menu.querySelectorAll('[role="menuitem"]')[0]);
    await dopo();
  } finally { proto.focus = vero; }
  assert.equal(fuocoAllAzione, m.tasto, 'la vista a tutto schermo ricorda il fuoco: deve essere «⋯», non la voce nascosta');
  assert.deepEqual(fuochi.at(-1), { preventScroll: true });
  assert.equal(m.menu.hidden, true);
  assert.deepEqual(conferme, ['Fatto A']);
  clic(m.tasto);
  clic(m.menu.querySelectorAll('[role="menuitem"]')[1]);
  await dopo();
  assert.deepEqual(conferme, ['Fatto A'], 'un\'azione che non dice niente non mostra niente');
  /* una voce spenta (la Libreria che sta salvando) non fa niente */
  m.voci.a.disabled = true;
  clic(m.tasto);
  const spenta = m.menu.querySelectorAll('[role="menuitem"]')[0];
  assert.equal(spenta.disabled, true);
  clic(spenta);
  await dopo();
  assert.deepEqual(conferme, ['Fatto A']);
});

test('UIG-8.6 il tasto destro apre lo stesso menu dove sta il puntatore; dentro un campo di testo resta quello del sistema', () => {
  const doc = documento();
  const r = leggi(corpo('01-tabella'));
  const n = disegnaBlocco(r, { document: doc });
  doc.body.append(n);
  const destro = Object.assign(new Event('contextmenu', { cancelable: true, bubbles: true }), { clientX: 300, clientY: 200 });
  n.dispatchEvent(destro);
  assert.equal(destro.defaultPrevented, true);
  const menu = doc.body.querySelector(MENU);
  assert.equal(menu.hidden, false);
  assert.deepEqual([menu.style.left, menu.style.top], ['300px', '200px'], 'si apre al puntatore, non sotto «⋯»');
  assert.equal(doc.activeElement, menu.querySelectorAll('[role="menuitem"]')[0]);
  menu.dispatchEvent(tasto('Escape'));
  for (const valore of ['true', '', 'plaintext-only']) {
    const campo = doc.createElement('div');
    campo.setAttribute('contenteditable', valore);
    const dentro = doc.createElement('span');
    campo.append(dentro);
    n.querySelector('.gu__dentro').append(campo);
    const ev = new Event('contextmenu', { cancelable: true, bubbles: true });
    dentro.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, false, `contenteditable="${valore}" tiene il menu del sistema`);
    assert.equal(menu.hidden, true);
    campo.remove();
  }
  const spento = doc.createElement('div');
  spento.setAttribute('contenteditable', 'false');
  n.querySelector('.gu__dentro').append(spento);
  const ev = new Event('contextmenu', { cancelable: true, bubbles: true });
  spento.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true, 'contenteditable="false" non è un campo');
  menu.dispatchEvent(tasto('Escape'));
  const input = doc.createElement('input');
  n.querySelector('.gu__dentro').append(input);
  const nelCampo = new Event('contextmenu', { cancelable: true, bubbles: true });
  input.dispatchEvent(nelCampo);
  assert.equal(nelCampo.defaultPrevented, false);
});

test('UIG-8.6b il tasto destro sul blocco NON risale alla risposta: il suo menu («Riprova», «Elimina») non si apre insieme (come il 25/10)', () => {
  const doc = documento();
  const n = disegnaBlocco(leggi(corpo('01-tabella')), { document: doc });
  const risposta = doc.createElement('article');
  let menuDellaRisposta = 0;
  risposta.addEventListener('contextmenu', () => { menuDellaRisposta += 1; });
  risposta.append(n);
  doc.body.append(risposta);
  const ev = new Event('contextmenu', { cancelable: true, bubbles: true });
  n.querySelector('.gu__dentro').dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(menuDellaRisposta, 0, 'un menu solo');
  doc.body.querySelector(MENU).dispatchEvent(tasto('Escape'));
  const input = doc.createElement('input');
  n.querySelector('.gu__dentro').append(input);
  const nelCampo = new Event('contextmenu', { cancelable: true, bubbles: true });
  input.dispatchEvent(nelCampo);
  assert.equal(nelCampo.defaultPrevented, false, 'nel campo il menu del sistema');
  assert.equal(menuDellaRisposta, 0, 'e nemmeno lì quello della risposta');
  /* AL CONTRARIO: fuori dal blocco la risposta ha il suo menu */
  const testo = doc.createElement('p');
  risposta.append(testo);
  testo.dispatchEvent(new Event('contextmenu', { cancelable: true, bubbles: true }));
  assert.equal(menuDellaRisposta, 1);
});

test('UIG-8.7 Copia ed Esporta dal guscio: copia il ripiego, scarica il file e la conferma in riga dice il nome e se ne va dopo 4 s', async () => {
  const doc = documento();
  const clock = orologio();
  const copiati = [];
  const scaricati = [];
  const r = leggi(corpo('01-tabella'));
  const n = disegnaBlocco(r, { document: doc, copia: (x) => copiati.push(x), scarica: (f) => scaricati.push(f), timer: clock.timer, ora: ORA });
  doc.body.append(n);
  clic(n.querySelector(PIU));
  clic(voceDi(doc, 'copia'));
  await dopo();
  assert.deepEqual(copiati, [ripiegoTestuale(r.blocco, { lingua: 'it' })]);
  const fatto = n.querySelector('.gu__sotto .gu-fatto');
  assert.equal(fatto.getAttribute('role'), 'status');
  assert.equal(fatto.textContent, t('chat.common.copied'));
  clock.avanza(3999);
  assert.equal(fatto.textContent, t('chat.common.copied'), 'resta quattro secondi');
  clock.avanza(1);
  assert.equal(fatto.textContent, '', 'la conferma se ne va da sola');
  clic(n.querySelector(PIU));
  clic(voceDi(doc, 'copia'));
  await dopo();
  clock.avanza(3000);
  clic(n.querySelector(PIU));
  clic(voceDi(doc, 'esporta'));
  await dopo();
  assert.equal(clock.attese(), 1, 'la conferma nuova toglie il tempo di quella vecchia');
  clock.avanza(1500);
  assert.equal(fatto.textContent, t('blocchi.actions.exported', { name: scaricati[0].nome }), 'la vecchia scadenza non cancella la conferma nuova');
  assert.equal(scaricati.length, 1);
  assert.equal(scaricati[0].mime, 'text/csv;charset=utf-8');
  assert.ok(scaricati[0].testo.slice(1).split('\r\n')[0].includes(';'), 'in italiano il CSV usa il punto e virgola');
  assert.ok(fatto.textContent.includes(scaricati[0].nome));
  const m = disegnaBlocco(r, { document: doc, copia: () => { throw new Error('no'); }, timer: clock.timer });
  doc.body.append(m);
  clic(m.querySelector(PIU));
  clic(voceDi(doc, 'copia'));
  await dopo();
  assert.equal(m.querySelector('.gu-fatto').textContent, '', 'una copia fallita non dice «Copiato»');
});

test('UIG-8.8 un blocco rotto non ha il menu; il guscio B lo porta nella stessa testata; un blocco tolto dalla pagina chiude il suo menu', () => {
  const doc = documento();
  assert.equal(disegnaBlocco(leggi(corpo('20-rotto-tipo-sconosciuto')), { document: doc, testo: 'x' }).querySelector(PIU), null);
  const b = disegnaBlocco(leggi(corpo('10-fonte-tabella')), { document: doc, scelta: { guscio: 'b', versione: 'spinta' } });
  assert.equal(b.querySelectorAll(PIU).length, 1);
  assert.equal(b.querySelectorAll('.gu__sotto button').length, 0);
  const s = disegnaBlocco(leggi(corpo('01-tabella')), { document: doc });
  doc.body.append(s);
  clic(s.querySelector(PIU));
  const menu = doc.body.querySelector(MENU);
  assert.equal(menu.hidden, false);
  s.remove();
  /* anche un tocco DENTRO il menu: le voci di un blocco che non c'è più non agiscono, il menu se ne va (isConnected) */
  menu.querySelector('[role="menuitem"]').dispatchEvent(new Event('pointerdown', { bubbles: true }));
  assert.equal(menu.hidden, true, 'il blocco non c\'è più: il suo menu non resta a galla');
});

test('UIG-8.9 le parole nuove esistono in inglese e in italiano', () => {
  for (const lingua of ['en', 'it']) {
    impostaLingua(lingua);
    for (const k of ['blocchi.menu.label', 'blocchi.actions.exportCsv', 'blocchi.actions.exportImage', 'blocchi.actions.exportText']) assert.notEqual(t(k), k);
    assert.ok(t('blocchi.actions.exported', { name: 'f.csv' }).includes('f.csv'));
  }
  impostaLingua('en');
  assert.equal(t('blocchi.menu.label'), 'Block actions');
  impostaLingua('it');
  assert.equal(t('blocchi.menu.label'), 'Azioni del blocco');
});

/* ---- Ledger G-C (05/11/2026): emendamento a G-A — confronto in CSV, diagramma in SVG — e i riporti R-4b…R-4e, R-6b ---- */
import { svgDelGrafico, svgDelDiagramma, formatoDiEsportazione } from '../../src/components/blocchi/esporta.js';

const ATTRIBUTI = (svg, nome) => [...svg.matchAll(new RegExp(`<${nome} ([^>]*)>`, 'gu'))].map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/gu)].map((a) => [a[1], a[2]])));
const TESTI = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/gu)].map((m) => m[1]);
const XML_BEN_FORMATO = (svg) => !/&(?!(amp|lt|gt|quot|#39);)/u.test(svg) && svg.isWellFormed();

test('UIG-9 esporta: confronto in CSV con BOM, CRLF, «;» in italiano, l\'apostrofo OWASP e il nome solo sulla prima riga', () => {
  const blocco = { tipo: 'confronto', titolo: 'Dove gira', colonne: [{ nome: 'In rete', pro: ['=HYPERLINK("x")', 'Veloce; molto'], contro: ['Costa'] }, { nome: '@Locale', pro: ['Privato'] }] };
  assert.equal(formatoDiEsportazione('confronto'), 'csv');
  const { nome, testo, mime } = esportaBlocco(blocco, { lingua: 'it' });
  assert.equal(nome, 'Dove gira.csv');
  assert.equal(mime, 'text/csv;charset=utf-8');
  assert.ok(testo.startsWith('\uFEFF'));
  assert.deepEqual(testo.slice(1).split('\r\n'), ['Nome;A favore;Contro', `In rete;"'=HYPERLINK(""x"")";Costa`, ';"Veloce; molto";', "'@Locale;Privato;"]);
  assert.equal(/(?<!\r)\n/u.test(testo), false, 'solo CRLF');
  const en = esportaBlocco(blocco, { lingua: 'en' }).testo.slice(1).split('\r\n');
  assert.equal(en[0], 'Name,For,Against');
  assert.equal(en[2], ',Veloce; molto,', 'in inglese il «;» non va fra virgolette: il separatore è la virgola');
});

test('UIG-9 esporta: diagramma in SVG senza script, ogni testo scappato, emoji intere, stessa disposizione dello schermo', () => {
  const ostile = '<script>alert(1)</script>&"\'';
  const blocco = { tipo: 'diagramma', titolo: `T ${ostile}`, nodi: [{ id: 'a', testo: ostile }, { id: 'b', testo: `${'x'.repeat(18)}😀😀😀` }, { id: 'c', testo: 'C' }], frecce: [{ da: 'a', a: 'b', testo: '<img src=x onerror=1>' }, { da: 'b', a: 'c' }, { da: 'c', a: 'a' }, { da: 'a', a: 'zz' }] };
  assert.equal(formatoDiEsportazione('diagramma'), 'svg');
  const { testo, mime, nome } = esportaBlocco(blocco, { lingua: 'en', ora: new Date(2026, 10, 5, 22, 0) });
  assert.equal(mime, 'image/svg+xml;charset=utf-8');
  assert.match(nome, /\.svg$/u);
  assert.equal(/<script|<img|foreignObject|<[^>]*\son\w+=/iu.test(testo), false, 'nessun elemento attivo, nessun attributo di evento DENTRO un tag (nel testo scappato «onerror=» è solo testo)');
  assert.ok(XML_BEN_FORMATO(testo), 'ogni & è un\'entità e nessuna coppia surrogata è spezzata');
  assert.ok(testo.includes('&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;&#39;'), 'il testo intero nel <title> del nodo, scappato');
  assert.equal(ATTRIBUTI(testo, 'polyline').length, 3, 'la freccia verso un nodo assente non si disegna');
  assert.equal(ATTRIBUTI(testo, 'polyline').filter((p) => p['stroke-dasharray']).length, 1, 'il ciclo: UNA freccia all\'indietro, tratteggiata come a schermo');
  assert.ok(TESTI(testo).includes(`${'x'.repeat(18)}😀…`), 'accorciato a punti di codice, mai mezza emoji');
  assert.equal(svgDelDiagramma({ ...blocco, nodi: [], frecce: [] }).includes('<g>'), false);
});

test('R-4b una fetta negativa della torta non si disegna (e non sposta le altre)', () => {
  const svg = svgDelGrafico({ tipo: 'grafico', forma: 'torta', titolo: 't', serie: [{ nome: 's', punti: [{ x: 'a', y: 3 }, { x: 'b', y: -5 }, { x: 'c', y: 1 }] }] });
  assert.equal(ATTRIBUTI(svg, 'path').length, 2, 'solo a e c');
  assert.ok(TESTI(svg).some((t) => t.startsWith('b · -5 · 0%')), 'in legenda resta, col suo valore e lo 0%');
});

test('R-4c una x sola sta al centro, in linee e in barre', () => {
  const serie = [{ nome: 's', punti: [{ x: 'unico', y: 4 }] }];
  const centro = 48 + (640 - 48 - 24) / 2;
  const linee = svgDelGrafico({ tipo: 'grafico', forma: 'linee', titolo: 't', serie });
  assert.equal(Number(ATTRIBUTI(linee, 'circle')[0].cx), centro);
  const barre = svgDelGrafico({ tipo: 'grafico', forma: 'barre', titolo: 't', serie });
  const r = ATTRIBUTI(barre, 'rect').find((a) => a.fill === '#3d6fd9');
  assert.equal(Number(r.x) + Number(r.width) / 2, centro);
});

test('R-6b l\'accorciatura non spezza mai una coppia di emoji e l\'XML resta valido', () => {
  const lungo = '🙂'.repeat(200);
  for (const forma of ['barre', 'linee', 'torta']) {
    const svg = svgDelGrafico({ tipo: 'grafico', forma, titolo: `${lungo}&`, unita: lungo, serie: [{ nome: lungo, punti: [{ x: lungo, y: 1 }] }, { nome: `<${lungo}`, punti: [{ x: lungo, y: 2 }] }] });
    assert.ok(XML_BEN_FORMATO(svg), forma);
    assert.ok(TESTI(svg).some((t) => t.endsWith('🙂…')), `${forma}: accorciato coi puntini dopo un'emoji intera`);
  }
});

test('R-4d ogni barra sta dentro l\'area del grafico, anche coi negativi (uccide «scala» con lo=0)', () => {
  const svg = svgDelGrafico({ tipo: 'grafico', forma: 'barre', titolo: 't', serie: [{ nome: 'a', punti: [{ x: 'p', y: 10 }, { x: 'q', y: -6 }] }, { nome: 'b', punti: [{ x: 'p', y: -2 }, { x: 'q', y: 4 }] }] });
  const area = { x: 48, y: 48, l: 640 - 48 - 24, a: 360 - 48 - 56 };
  const barre = ATTRIBUTI(svg, 'rect').filter((a) => a.fill?.startsWith('#') && a.fill !== '#ffffff' && a.height !== '10');
  assert.equal(barre.length, 4);
  for (const b of barre) {
    assert.ok(Number(b.y) >= area.y - 0.01 && Number(b.y) + Number(b.height) <= area.y + area.a + 0.01, JSON.stringify(b));
    assert.ok(Number(b.x) >= area.x && Number(b.x) + Number(b.width) <= area.x + area.l + 0.01);
  }
});

test('R-4e l\'SVG scrive i valori come lo schermo: ogni barra il suo, le linee l\'ultimo punto di ogni serie, nella lingua', () => {
  const serie = [{ nome: 'a', punti: [{ x: 'p', y: 1200.5 }, { x: 'q', y: -3 }] }, { nome: 'b', punti: [{ x: 'p', y: 7 }, { x: 'q', y: 9 }] }];
  const valori = (svg) => [...svg.matchAll(/<text class="valore"[^>]*>([^<]*)<\/text>/gu)].map((m) => m[1]);
  assert.deepEqual(valori(svgDelGrafico({ tipo: 'grafico', forma: 'barre', titolo: 't', unita: '€', serie }, 'it')), ['1200,5 €', '7 €', '-3 €', '9 €']);
  assert.deepEqual(valori(svgDelGrafico({ tipo: 'grafico', forma: 'linee', titolo: 't', unita: '%', serie }, 'en')), ['-3%', '9%']);
});

/* ───────────── G-B (scena 1+4, 05/11/2026): i riporti R-2b, R-8…R-11 sul menu del blocco ───────────── */

const finestraFinta = (innerWidth = 1000, innerHeight = 700) => Object.assign(new EventTarget(), { innerWidth, innerHeight });

test('UIG-B R-2b il tasto destro in una textarea o in una select lascia il menu del sistema', () => {
  const doc = documento();
  const n = disegnaBlocco(leggi(corpo('01-tabella')), { document: doc });
  doc.body.append(n);
  for (const tag of ['textarea', 'select']) {
    const campo = doc.createElement(tag);
    n.querySelector('.gu__dentro').append(campo);
    const ev = Object.assign(new Event('contextmenu', { cancelable: true, bubbles: true }), { clientX: 10, clientY: 10 });
    campo.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, false, `${tag}: resta il menu del sistema`);
  }
  assert.equal(doc.body.querySelector(MENU)?.hidden ?? true, true, 'il menu del blocco non si è aperto');
});

test('UIG-B R-8 a tutto schermo il menu va dentro `.gu-schermo`, e resta UNO solo', () => {
  const doc = documento();
  const fuori = creaMenuDelBlocco(doc, [{ id: 'a', testo: 'A', fai() {} }]);
  const schermo = doc.createElement('div');
  schermo.className = 'gu-schermo';
  const dentro = creaMenuDelBlocco(doc, [{ id: 'b', testo: 'B', fai() {} }]);
  schermo.append(dentro.nodo);
  doc.body.append(fuori.nodo, schermo);
  clic(fuori.tasto);
  assert.equal(fuori.menu.parentNode, doc.body);
  clic(dentro.tasto);
  assert.equal(dentro.menu.parentNode, schermo, 'il menu sta sopra la vista a tutto schermo');
  assert.equal(doc.body.querySelectorAll(MENU).length, 1, 'un menu solo, spostato');
  clic(fuori.tasto);
  assert.equal(fuori.menu.parentNode, doc.body, 'fuori dalla vista torna nel corpo');
  assert.equal(doc.body.querySelectorAll(MENU).length, 1);
});

test('UIG-B R-9 Tab nel menu chiude e rimette il fuoco su «⋯», senza fermare il Tab', () => {
  const doc = documento();
  const m = creaMenuDelBlocco(doc, [{ id: 'a', testo: 'A', fai() {} }]);
  doc.body.append(m.nodo);
  clic(m.tasto);
  const tab = tasto('Tab');
  m.menu.dispatchEvent(tab);
  assert.equal(m.menu.hidden, true);
  assert.equal(doc.activeElement, m.tasto, 'il fuoco torna su «⋯»: il Tab prosegue da lì');
  assert.equal(tab.defaultPrevented, false);
});

test('UIG-B R-10 lo scorrimento (fuori dal menu) e il ridimensionamento chiudono; una voce di un blocco tolto non agisce', async () => {
  const doc = documento();
  const fin = finestraFinta();
  const fatte = [];
  const m = creaMenuDelBlocco(doc, [{ id: 'a', testo: 'A', fai: () => { fatte.push('a'); } }], { finestra: fin });
  doc.body.append(m.nodo);
  clic(m.tasto);
  const sc = new Event('scroll');
  Object.defineProperty(sc, 'target', { value: m.menu });
  doc.dispatchEvent(sc);
  assert.equal(m.menu.hidden, false, 'scorrere DENTRO il menu non lo chiude');
  doc.dispatchEvent(new Event('scroll'));
  assert.equal(m.menu.hidden, true, 'uno scorrimento della pagina chiude');
  assert.equal(m.tasto.getAttribute('aria-expanded'), 'false');
  clic(m.tasto);
  fin.dispatchEvent(new Event('resize'));
  assert.equal(m.menu.hidden, true, 'il ridimensionamento chiude');
  clic(m.tasto);
  const voce = m.menu.querySelector('[role="menuitem"]');
  m.nodo.remove();
  clic(voce);
  await dopo();
  assert.deepEqual(fatte, [], 'la voce di un blocco non più nella pagina non fa niente');
});

test('UIG-B R-11 si misura dopo aver riempito; senza posto sotto si apre verso l\'alto; mai fuori dalla finestra', () => {
  const doc = documento();
  const fin = finestraFinta(1000, 700);
  const m = creaMenuDelBlocco(doc, [{ id: 'a', testo: 'A', fai() {} }, { id: 'b', testo: 'B', fai() {}, separa: true }], { finestra: fin });
  doc.body.append(m.nodo);
  m.tasto.getBoundingClientRect = () => ({ left: 900, right: 980, top: 640, bottom: 670, width: 80, height: 30 });
  clic(m.tasto);
  const menu = m.menu;
  m.chiudi(false);
  /* l'altezza vera arriva solo a menu pieno: prima di riempirlo vale 0 */
  Object.defineProperty(menu, 'offsetHeight', { get: () => (menu.querySelectorAll('[role="separator"]').length ? 300 : 0), configurable: true });
  Object.defineProperty(menu, 'offsetWidth', { get: () => 200, configurable: true });
  clic(m.tasto);
  assert.equal(menu.style.top, `${640 - 6 - 300}px`, 'verso l\'alto, misurato col separatore dentro');
  assert.equal(menu.style.left, `${980 - 200}px`, 'allineato al bordo destro di «⋯»');
  m.chiudi(false);
  m.tasto.getBoundingClientRect = () => ({ left: 900, right: 980, top: 100, bottom: 130, width: 80, height: 30 });
  clic(m.tasto);
  assert.equal(menu.style.top, '136px', 'con posto sotto si apre sotto');
  m.chiudi(false);
  m.tasto.getBoundingClientRect = () => ({ left: 0, right: 40, top: 200, bottom: 230, width: 40, height: 30 });
  clic(m.tasto);
  assert.equal(menu.style.left, '8px', 'mai fuori dal bordo sinistro');
});

/* ───────────── G-B2 (scenes 1+4, FE-081, 05/11/2026): the version entries in the same «⋯» menu, UIG-1.8…1.10 ───────────── */

const { creaStorico, aggiungiVersione, versioneCorrente } = await import('../../../src/blocchi/versioni.mjs');
const conRete = async (fare) => {
  const vera = globalThis.fetch;
  let chiamate = 0;
  globalThis.fetch = async () => { chiamate += 1; throw new Error('niente rete'); };
  try { await fare(); } finally { globalThis.fetch = vera; }
  return chiamate;
};
const versioniDi = (storico) => {
  const scatola = { storico, cambi: [] };
  return Object.assign(scatola, { aggancio: { versioni: { storico: () => scatola.storico, cambia: (n) => { scatola.cambi.push(n); scatola.storico = n; } } } });
};
const RECINTO_B1 = ['```talos-blocco nome=b1', '{}', '```'].join('\n');

test('UIG-1.8 «Versioni» is absent with 1 version and present with 2', () => {
  const blocco = leggi(corpo('01-tabella')).blocco;
  const uno = creaStorico(blocco, 'b1', {});
  const mostra = () => {};
  assert.equal(azioniDelBlocco(blocco, { ...versioniDi(uno).aggancio, mostraVersioni: mostra }).some((a) => a.id === 'versioni'), false);
  const due = aggiungiVersione(uno, { ...blocco, titolo: 'Altro titolo' }, { origine: 'modello', lingua: 'it' });
  const voce = azioniDelBlocco(blocco, { ...versioniDi(due).aggancio, mostraVersioni: mostra }).find((a) => a.id === 'versioni');
  assert.equal(voce?.testo, 'Versioni');
  /* in the shell: the list opens under the block, one button per version, the current one marked */
  const doc = documento();
  const n = disegnaBlocco(leggi(corpo('01-tabella')), { document: doc, storico: due, testo: RECINTO_B1 });
  doc.body.append(n);
  assert.equal(n.dataset.nome, 'b1', 'the name TALOS gave is readable on the shell');
  clic(voceDelMenu(n, 'versioni'));
  const tasti = n.querySelectorAll('.gu__versioni button');
  assert.deepEqual([...tasti].map((b) => b.dataset.versione), ['1', '2']);
  assert.equal(tasti[1].getAttribute('aria-current'), 'true');
});

test('UIG-1.9 «Mostra il testo» shows the current source, with 0 network calls', async () => {
  const blocco = leggi(corpo('01-tabella')).blocco;
  const due = aggiungiVersione(creaStorico(blocco, 'b1', {}), { ...blocco, titolo: 'Nuovo' }, { lingua: 'it' });
  let visto = null;
  const chiamate = await conRete(async () => {
    const voce = azioniDelBlocco(blocco, { ...versioniDi(due).aggancio, mostraTesto: (x) => { visto = x; } }).find((a) => a.id === 'testo');
    assert.equal(voce.testo, 'Mostra il testo');
    await voce.fai();
  });
  assert.equal(chiamate, 0);
  assert.equal(visto, versioneCorrente(due).sorgente, 'the CURRENT version, not v1');
  assert.match(visto, /Nuovo/);
  const doc = documento();
  const n = disegnaBlocco(leggi(corpo('01-tabella')), { document: doc });
  doc.body.append(n);
  clic(voceDelMenu(n, 'testo'));
  assert.ok(n.querySelector('pre.gu__sorgente')?.textContent.toLowerCase().includes('tabella'), 'the source under the block');
  clic(voceDelMenu(n, 'testo'));
  assert.equal(n.querySelector('pre.gu__sorgente'), null, 'a second click hides it');
});

test('UIG-1.10 «Condividi» absent without canShare or when it says false; present when true, and shares ONE File equal to the export', async () => {
  const blocco = leggi(corpo('01-tabella')).blocco;
  const ha = (navigatore) => azioniDelBlocco(blocco, { navigatore, ora: ORA }).some((a) => a.id === 'condividi');
  assert.equal(ha(undefined), false, 'no navigator');
  assert.equal(ha({ share() {} }), false, 'no canShare');
  assert.equal(ha({ canShare: () => false, share() {} }), false, 'canShare false');
  assert.equal(ha({ canShare: () => 'true', share() {} }), false, 'only a real true');
  assert.equal(ha({ canShare: () => { throw new Error('x'); }, share() {} }), false, 'a throwing canShare hides it');
  assert.equal(ha({ canShare: () => true }), false, 'no share function');
  const condivisi = [];
  const nav = { canShare: ({ files }) => files.length === 1 && files[0] instanceof File, share: async (dati) => { condivisi.push(dati); } };
  const voce = azioniDelBlocco(blocco, { navigatore: nav, ora: ORA }).find((a) => a.id === 'condividi');
  assert.equal(voce?.testo, 'Condividi');
  await voce.fai();
  assert.equal(condivisi.length, 1);
  const [f] = condivisi[0].files;
  assert.equal(condivisi[0].files.length, 1);
  const atteso = esportaBlocco(blocco, { lingua: 'it', ora: ORA });
  assert.equal(f.name, atteso.nome);
  assert.equal(f.type, atteso.mime);
  assert.deepEqual(new Uint8Array(await f.arrayBuffer()), new TextEncoder().encode(atteso.testo), 'same bytes, BOM included');
});

test('UIG-1.8b «Barre ↔ Tabella» and «Torna alla v1» are versions (origine vista / ritorno), with 0 network calls', async () => {
  const blocco = leggi(corpo('01-tabella')).blocco;
  const scatola = versioniDi(creaStorico(blocco, 'b1', {}));
  const chiamate = await conRete(async () => {
    const vista = azioniDelBlocco(blocco, scatola.aggancio).find((a) => a.id === 'vista');
    assert.equal(vista?.testo, 'Barre ↔ Tabella');
    assert.equal(azioniDelBlocco(blocco, scatola.aggancio).some((a) => a.id === 'torna'), false, 'at v1 there is nothing to go back to');
    await vista.fai();
    assert.equal(versioneCorrente(scatola.storico).origine, 'vista');
    assert.equal(versioneCorrente(scatola.storico).blocco.tipo, 'grafico');
    const torna = azioniDelBlocco(versioneCorrente(scatola.storico).blocco, scatola.aggancio).find((a) => a.id === 'torna');
    assert.equal(torna?.testo, 'Torna alla v1');
    await torna.fai();
  });
  assert.equal(chiamate, 0);
  const c = versioneCorrente(scatola.storico);
  assert.deepEqual([c.versione, c.origine, c.aVersione, c.blocco.tipo], [3, 'ritorno', 1, 'tabella']);
  assert.equal(azioniDelBlocco(blocco, { versioni: { storico: () => scatola.storico } }).some((a) => a.id === 'vista'), false, 'no cambia: no switch');
});

test('UIG-1.8c in the shell: the switch redraws the SAME shell, the label says «v2 · …», the host hears it; one right-click listener', () => {
  const doc = documento();
  const cambi = [];
  const n = disegnaBlocco(leggi(corpo('01-tabella')), { document: doc, quandoCambiaVersione: (s, v) => cambi.push(v.versione) });
  doc.body.append(n);
  assert.equal(n.querySelector('.gu__versione'), null, 'no label at v1');
  clic(voceDelMenu(n, 'vista'));
  assert.equal(n.dataset.tipo, 'grafico');
  assert.deepEqual(cambi, [2]);
  assert.match(n.querySelector('.gu__versione')?.textContent ?? '', /^v2 · /);
  clic(voceDelMenu(n, 'torna'));
  assert.equal(n.dataset.tipo, 'tabella');
  assert.deepEqual(cambi, [2, 3]);
  assert.match(n.querySelector('.gu__versione')?.textContent ?? '', /^v3 · /);
  let fermati = 0;
  const ev = Object.assign(new Event('contextmenu', { cancelable: true, bubbles: true }), { clientX: 5, clientY: 5 });
  const vero = ev.stopPropagation.bind(ev);
  ev.stopPropagation = () => { fermati += 1; vero(); };
  n.querySelector('.gu__dentro').dispatchEvent(ev);
  assert.equal(fermati, 1, 'after two redraws the right click is handled once');
});

test('UIG-B2 m9/m10 a menu opened by right click near the right or bottom edge is clamped to the window minus 8', () => {
  const doc = documento();
  const fin = finestraFinta(1000, 700);
  const m = creaMenuDelBlocco(doc, [{ id: 'a', testo: 'A', fai() {} }], { finestra: fin });
  doc.body.append(m.nodo);
  m.apri('prima', { x: 10, y: 10 });
  const menu = m.menu;
  m.chiudi(false);
  Object.defineProperty(menu, 'offsetHeight', { get: () => 300, configurable: true });
  Object.defineProperty(menu, 'offsetWidth', { get: () => 200, configurable: true });
  m.apri('prima', { x: 990, y: 100 });
  assert.equal(menu.style.left, `${1000 - 200 - 8}px`, 'm10: clamped on the right');
  m.chiudi(false);
  m.apri('prima', { x: 100, y: 699 });
  assert.equal(menu.style.top, `${700 - 300 - 8}px`, 'm9: clamped at the bottom');
  m.chiudi(false);
});

test('UIG-B2 f3/f9 «Torna alla v1» is absent when the screen already shows v1\'s source; no label for a history still at v1', async () => {
  const blocco = leggi(corpo('01-tabella')).blocco;
  const scatola = versioniDi(creaStorico(blocco, 'b1', {}));
  await azioniDelBlocco(blocco, scatola.aggancio).find((a) => a.id === 'vista').fai();
  await azioniDelBlocco(versioneCorrente(scatola.storico).blocco, scatola.aggancio).find((a) => a.id === 'torna').fai();
  assert.equal(versioneCorrente(scatola.storico).versione, 3);
  assert.equal(azioniDelBlocco(blocco, scatola.aggancio).some((a) => a.id === 'torna'), false, 'v3 equals v1: going back would do nothing');
  const doc = documento();
  const n = disegnaBlocco(leggi(corpo('01-tabella')), { document: doc, storico: creaStorico(blocco, 'b1', {}), testo: RECINTO_B1 });
  doc.body.append(n);
  assert.equal(n.querySelector('.gu__versione'), null, 'a history at v1 has no «v1» label');
});
