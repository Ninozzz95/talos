/*
 * R-42 (Performance, 31/10/2026): quando cambia solo il segnavia, la barra della cronologia tocca solo le voci VICINE invece di tutte,
 *   e lo stato finale è IDENTICO a quello della strada lunga. DOM finto minimo (niente librerie): conta quante voci ogni strada legge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggiornaCronologia, LENTE } from '../../src/components/cronologia.js';

/* scritture del DOM finto, in ordine: la prova R42-05 guarda se una lettura della geometria arriva DOPO una scrittura */
const diario = [];

const camel = (k) => `data-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
class Elemento {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag; this.attributi = new Map(); this.figli = []; this.padre = null; this.classi = new Set(); this.hidden = false; this.letture = 0;
    this.stile = new Map(); this.style = { getPropertyValue: (k) => this.stile.get(k) ?? '', setProperty: (k, v) => { diario.push('scrivi'); this.stile.set(k, v); } };
    const io = this;
    this.dataset = new Proxy({}, { get: (_, k) => (typeof k === 'string' && io.attributi.has(camel(k)) ? io.attributi.get(camel(k)) : undefined), set: (_, k, v) => { io.attributi.set(camel(k), String(v)); return true; }, deleteProperty: (_, k) => { io.attributi.delete(camel(k)); return true; } });
    this.classList = { toggle: (c, si) => { const vuole = si === undefined ? !this.classi.has(c) : Boolean(si); if (vuole) this.classi.add(c); else this.classi.delete(c); return vuole; }, contains: (c) => this.classi.has(c), add: (c) => this.classi.add(c), remove: (c) => this.classi.delete(c) };
    this.altezza = 10; this._scrollTop = 0; this.clientHeight = 400; this.scrollHeight = 6000;
  }
  get offsetHeight() { diario.push('leggi'); return this.altezza; }
  get scrollTop() { return this._scrollTop; }
  set scrollTop(v) { diario.push('scrivi'); this._scrollTop = v; }
  set className(v) { this.classi = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get tabIndex() { this.letture += 1; return this.attributi.has('tabindex') ? Number(this.attributi.get('tabindex')) : -1; }
  set tabIndex(v) { this.attributi.set('tabindex', String(v)); }
  getAttribute(k) { this.letture += 1; return this.attributi.has(k) ? this.attributi.get(k) : null; }
  setAttribute(k, v) { diario.push('scrivi'); this.attributi.set(k, String(v)); }
  hasAttribute(k) { this.letture += 1; return this.attributi.has(k); }
  removeAttribute(k) { this.attributi.delete(k); }
  append(...nodi) { for (const n of nodi) { n.padre = this; this.figli.push(n); } }
  remove() { if (this.padre) this.padre.figli = this.padre.figli.filter((f) => f !== this); }
  *discendenti() { for (const f of this.figli) { yield f; yield* f.discendenti(); } }
  querySelectorAll(sel) { const c = sel.replace(/^\./, ''); return [...this.discendenti()].filter((e) => e.classi.has(c)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}
function pagina(n) {
  const doc = { createElement: (t) => new Elemento(doc, t) };
  const nav = new Elemento(doc, 'nav');
  const lista = new Elemento(doc, 'div'); lista.className = 'talos-cronologia__lista'; nav.append(lista);
  const voci = Array.from({ length: n }, (_, i) => ({ diUtente: i % 2 === 0, lato: i % 2 === 0 ? 'utente' : 'talos', tono: '', elemento: {} }));
  return { nav, lista, voci, conversazione: {} };
}
const fotografia = ({ lista }) => lista.querySelectorAll('.talos-cronologia__voce').map((b) => JSON.stringify({ a: b.classi.has('talos-cronologia__voce--attiva'), c: b.attributi.get('aria-current') ?? null, t: b.attributi.get('tabindex'), l: b.querySelector('.talos-cronologia__linea').stile.get('--lente') }));

test('R42-01 strada corta e strada lunga finiscono nello STESSO stato, su una sequenza di spostamenti del segnavia', () => {
  const corta = pagina(600), lunga = pagina(600);
  for (const p of [corta, lunga]) aggiornaCronologia(p.nav, p.conversazione, { voci: p.voci });
  for (const vera of [0, 1, 7, 8, 300, 299, 599, 3, 3, 598]) {
    for (const p of [corta, lunga]) p.nav.dataset.attivaVera = String(vera);
    aggiornaCronologia(corta.nav, corta.conversazione, { fuoco: vera, voci: corta.voci, segui: true, soloSegnavia: true });
    aggiornaCronologia(lunga.nav, lunga.conversazione, { fuoco: vera, voci: lunga.voci, segui: true });
    assert.deepEqual(fotografia(corta), fotografia(lunga), `dopo il passaggio a ${vera}`);
    assert.equal(corta.nav.attributi.get('data-attiva'), lunga.nav.attributi.get('data-attiva'));
    assert.equal(corta.lista._scrollTop, lunga.lista._scrollTop, `stesso seguito a ${vera}`);
  }
  /* la tastiera sposta il FUOCO lontano dalla voce corrente (strada lunga); poi si scorre: la corrente di prima va spenta anche se è
     lontana dal fuoco di prima (mutante sopravvissuto) */
  for (const p of [corta, lunga]) aggiornaCronologia(p.nav, p.conversazione, { fuoco: 50, voci: p.voci });
  for (const p of [corta, lunga]) p.nav.dataset.attivaVera = '400';
  aggiornaCronologia(corta.nav, corta.conversazione, { fuoco: 400, voci: corta.voci, segui: true, soloSegnavia: true });
  aggiornaCronologia(lunga.nav, lunga.conversazione, { fuoco: 400, voci: lunga.voci, segui: true });
  assert.deepEqual(fotografia(corta), fotografia(lunga), 'dopo la tastiera e lo scorrimento');
});

test('R42-02 la strada corta legge solo le voci vicine: O(raggio della lente), non O(n)', () => {
  const p = pagina(600);
  aggiornaCronologia(p.nav, p.conversazione, { voci: p.voci });
  const bottoni = p.lista.querySelectorAll('.talos-cronologia__voce');
  for (const b of bottoni) b.letture = 0;
  p.nav.dataset.attivaVera = '300';
  aggiornaCronologia(p.nav, p.conversazione, { fuoco: 300, voci: p.voci, segui: true, soloSegnavia: true });
  const toccate = bottoni.filter((b) => b.letture > 0).length;
  const tetto = 2 * (2 * (LENTE.length - 1) + 1) + 2;
  assert.ok(toccate <= tetto, `voci lette ${toccate}, tetto ${tetto}`);
  /* AL CONTRARIO: la strada lunga le legge tutte (è la ragione della cura) */
  for (const b of bottoni) b.letture = 0;
  p.nav.dataset.attivaVera = '301';
  aggiornaCronologia(p.nav, p.conversazione, { fuoco: 301, voci: p.voci, segui: true });
  assert.equal(bottoni.filter((b) => b.letture > 0).length, 600);
});

test('R42-03 se le voci cambiano di numero, o non si sa quale era la corrente, la strada corta rinuncia e fa quella lunga', () => {
  const p = pagina(10);
  aggiornaCronologia(p.nav, p.conversazione, { voci: p.voci });
  const piu = [...p.voci, { diUtente: true, lato: 'utente', tono: '', elemento: {} }];
  p.nav.dataset.attivaVera = '10';
  aggiornaCronologia(p.nav, p.conversazione, { fuoco: 10, voci: piu, soloSegnavia: true });
  assert.equal(p.lista.querySelectorAll('.talos-cronologia__voce').length, 11, 'la voce nuova c’è: è passata dalla strada lunga');
  assert.equal(p.lista.querySelectorAll('.talos-cronologia__voce')[10].attributi.get('aria-current'), 'location');
  const q = pagina(10);
  q.nav.dataset.attivaVera = '4';
  aggiornaCronologia(q.nav, q.conversazione, { fuoco: 4, voci: q.voci, soloSegnavia: true });
  assert.equal(q.lista.querySelectorAll('.talos-cronologia__voce').length, 10, 'prima volta: niente da cui partire, strada lunga');
  assert.equal(q.nav.attributi.get('data-vera-disegnata'), '4');
});

test('R42-04 lo scorrimento usa la strada corta (sorgente), e il passaggio del mouse no (lì la lente si muove sotto il cursore)', () => {
  const sorgente = readFileSync(new URL('../../src/components/cronologia.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const segui = sorgente.slice(sorgente.indexOf('const seguiScorrimento'), sorgente.indexOf("scorrevole.addEventListener('scroll'"));
  assert.match(segui, /aggiornaCronologia\(nav, conversazione, \{[^}]*soloSegnavia: true/);
  /* AL CONTRARIO: la passata dopo un cambio di FORMA resta lunga (lì le voci cambiano) */
  const forma = sorgente.slice(sorgente.indexOf('const programmaAggiornamento'), sorgente.indexOf('const osservatore'));
  assert.doesNotMatch(forma, /soloSegnavia/);
});

test('R42-05 la strada corta legge la geometria PRIMA di scrivere (niente layout forzato), la lunga dopo', () => {
  const p = pagina(600);
  aggiornaCronologia(p.nav, p.conversazione, { voci: p.voci });
  p.nav.dataset.attivaVera = '200';
  diario.length = 0;
  aggiornaCronologia(p.nav, p.conversazione, { fuoco: 200, voci: p.voci, segui: true, soloSegnavia: true });
  const lettura = diario.indexOf('leggi');
  assert.ok(lettura >= 0, 'la geometria si legge');
  assert.equal(diario.slice(0, lettura).filter((x) => x === 'scrivi').length, 0, 'nessuna scrittura prima della lettura');
  /* AL CONTRARIO: la strada lunga scrive prima di leggere (è il difetto) */
  p.nav.dataset.attivaVera = '201';
  diario.length = 0;
  aggiornaCronologia(p.nav, p.conversazione, { fuoco: 201, voci: p.voci, segui: true });
  assert.ok(diario.slice(0, diario.indexOf('leggi')).includes('scrivi'));
});

test('R42-06 un segno della spina che si accende o spegne nella vista NON è un cambio di forma; un tono che cambia sì', async () => {
  const { toniDelSegno } = await import('../../src/components/cronologia.js');
  const base = 'talos-turn-spine__tick talos-turn-spine__tick--danger';
  assert.equal(toniDelSegno(base), toniDelSegno(`${base} talos-turn-spine__tick--visibile`), '--visibile non conta');
  assert.notEqual(toniDelSegno(base), toniDelSegno('talos-turn-spine__tick talos-turn-spine__tick--info'), 'un tono diverso conta');
  assert.notEqual(toniDelSegno('talos-turn-spine__tick'), toniDelSegno(base), 'un tono che compare conta');
  assert.notEqual(toniDelSegno(`${base} talos-turn-spine__tick--visibile`), toniDelSegno('talos-turn-spine__tick talos-turn-spine__tick--visibile'), 'un tono che SPARISCE conta (revisione del Desktop)');
  assert.equal(toniDelSegno(null), '');
  /* la regola sta nell'osservatore: il vecchio valore serve, e il confronto è sui toni */
  const sorgente = readFileSync(new URL('../../src/components/cronologia.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(sorgente, /attributeOldValue: true/);
  assert.match(sorgente, /toniDelSegno\(r\.oldValue\) !== toniDelSegno\(r\.target\.getAttribute\('class'\)\)/);
});
