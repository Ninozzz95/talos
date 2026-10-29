import test from 'node:test';
import assert from 'node:assert/strict';
import { mostraCaricamentoVivo, impostaOrologioCaricamento, SOGLIA_CARICAMENTO_VIVO_MS } from '../../src/components/caricamento-vivo.js';

/*
 * CARICAMENTO-VIVO-01..05 (owner 29/10/2026, bozzetto «Caricamenti vivi»: «Testo fermo, poi riga viva»). Un DOM minimo e un orologio
 * finto: jsdom non è fra le dipendenze del frontend, e qui conta il TEMPO (soglia, secondi, spegnimento), non il disegno — quello lo
 * prova la suite del browser.
 */
function documento() {
  const doc = {
    createElement(tag) {
      const n = { tag, ownerDocument: doc, children: [], parentNode: null, dataset: {}, attributi: {}, _testo: '',
        classList: { set: new Set(), add(c) { this.set.add(c); }, contains(c) { return this.set.has(c); } },
        set className(v) { for (const c of String(v).split(/\s+/u).filter(Boolean)) this.classList.add(c); },
        get className() { return [...this.classList.set].join(' '); },
        get isConnected() { let p = this; while (p.parentNode) p = p.parentNode; return p === doc.radice; },
        setAttribute(k, v) { this.attributi[k] = String(v); },
        append(...figli) { for (const f of figli) { f.parentNode?.children.splice(f.parentNode.children.indexOf(f), 1); f.parentNode = this; this.children.push(f); } },
        replaceChildren(...figli) { for (const f of this.children) f.parentNode = null; this.children = []; this.append(...figli); },
        remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } },
        get textContent() { return this._testo + this.children.map((f) => f.textContent).join(''); },
        set textContent(v) { for (const f of this.children) f.parentNode = null; this.children = []; this._testo = String(v); },
      };
      return n;
    },
  };
  doc.radice = doc.createElement('body');
  return doc;
}
function orologio() {
  let ora = 0; let prossimo = 1; const attese = new Map();
  const timer = {
    setTimeout(fn, ms) { const id = prossimo++; attese.set(id, { fn, quando: ora + ms }); return id; },
    clearTimeout(id) { attese.delete(id); },
    setInterval(fn, ms) { const id = prossimo++; attese.set(id, { fn, quando: ora + ms, ogni: ms }); return id; },
    clearInterval(id) { attese.delete(id); },
  };
  const avanza = (ms) => {
    const fine = ora + ms;
    for (;;) {
      const [id, a] = [...attese].filter(([, x]) => x.quando <= fine).sort((x, y) => x[1].quando - y[1].quando)[0] ?? [];
      if (!a) break;
      ora = a.quando;
      if (a.ogni) a.quando += a.ogni; else attese.delete(id);
      a.fn();
    }
    ora = fine;
  };
  impostaOrologioCaricamento(() => ora);
  return { timer, avanza, attivi: () => attese.size };
}
function scena() {
  const doc = documento(); const box = doc.createElement('p'); doc.radice.append(box);
  return { doc, box, ...orologio() };
}

test('CARICAMENTO-VIVO-01 nei primi 2 s resta il testo fermo, senza secondi né shimmer', () => {
  const { box, timer, avanza } = scena();
  const et = mostraCaricamentoVivo(box, 'Caricamento…', { timer });
  avanza(SOGLIA_CARICAMENTO_VIVO_MS - 1);
  assert.equal(box.textContent, 'Caricamento…');
  assert.equal(et.classList.contains('talos-waiting__label'), false);
  assert.equal(box.children.length, 1);
});

test('CARICAMENTO-VIVO-02 oltre i 2 s l\'etichetta luccica e i secondi scorrono', () => {
  const { box, timer, avanza } = scena();
  const et = mostraCaricamentoVivo(box, 'Caricamento…', { timer });
  avanza(SOGLIA_CARICAMENTO_VIVO_MS);
  assert.equal(et.classList.contains('talos-waiting__label'), true);
  const secondi = box.children[1];
  assert.ok(secondi && /2/u.test(secondi.textContent), `secondi: ${secondi?.textContent}`);
  assert.equal(secondi.attributi['aria-hidden'], 'true', 'i secondi che cambiano non si annunciano');
  avanza(5000);
  assert.match(secondi.textContent, /7/u);
});

test('CARICAMENTO-VIVO-03 al contrario: quando arriva il contenuto vero l\'orologio si ferma da solo', () => {
  const { box, timer, avanza, attivi } = scena();
  mostraCaricamentoVivo(box, 'Caricamento…', { timer });
  avanza(3000);
  box.textContent = 'tre righe';
  avanza(1000);
  assert.equal(attivi(), 0, 'nessun orologio resta acceso');
  assert.equal(box.textContent, 'tre righe');
});

test('CARICAMENTO-VIVO-04 al contrario: un caricamento rapido non accende niente e non lascia orologi', () => {
  const { box, timer, avanza, attivi } = scena();
  mostraCaricamentoVivo(box, 'Caricamento…', { timer });
  avanza(500);
  box.textContent = 'fatto';
  avanza(5000);
  assert.equal(box.textContent, 'fatto');
  assert.equal(attivi(), 0);
});

test('CARICAMENTO-VIVO-06 un pannello che si ridisegna con la stessa chiave non ricomincia da zero, e a caricamento finito la chiave si dimentica', () => {
  // come la Bacheca: a ogni ridisegno un ELEMENTO nuovo al posto del vecchio, con la stessa chiave
  const { doc, box: pannello, timer, avanza } = scena();
  const disegna = () => { const p = doc.createElement('p'); pannello.replaceChildren(p); mostraCaricamentoVivo(p, 'Bacheca', { chiave: 'bacheca:note', timer }); return p; };
  disegna();
  avanza(1500);
  let p = disegna(); // ridisegno
  avanza(600);
  assert.equal(p.children.length, 2, 'superati i 2 s dal PRIMO disegno, non dal ridisegno');
  assert.match(p.children[1].textContent, /2/u);
  avanza(2000);
  p = disegna(); // ancora un ridisegno, a caricamento in corso da 4,1 s: i secondi continuano
  avanza(0);
  assert.match(p.children[1]?.textContent ?? '', /4/u, `secondi: ${p.children[1]?.textContent}`);
  p.textContent = 'note';
  avanza(2000);
  p = disegna(); // un caricamento nuovo, più tardi
  avanza(1000);
  assert.equal(p.children.length, 1, 'il caricamento nuovo riparte da zero: la chiave del vecchio è stata dimenticata');
});

test('CARICAMENTO-VIVO-07 lo stesso caricamento chiesto di nuovo nello stesso posto non si ricrea (lo shimmer non riparte)', () => {
  const { box, timer, avanza } = scena();
  const prima = mostraCaricamentoVivo(box, 'Carico', { chiave: 'k', timer });
  avanza(2500);
  const dopo = mostraCaricamentoVivo(box, 'Carico', { chiave: 'k', timer });
  assert.equal(dopo, prima);
  assert.equal(box.children.length, 2, 'etichetta e secondi restano');
  const altro = mostraCaricamentoVivo(box, 'Altro testo', { chiave: 'k', timer });
  assert.notEqual(altro, prima, 'un testo diverso (cambio di lingua) si ridisegna');
});

test('CARICAMENTO-VIVO-05 un pannello tolto dalla pagina spegne l\'orologio, e un nuovo caricamento nello stesso posto riparte da zero', () => {
  const { doc, box, timer, avanza, attivi } = scena();
  mostraCaricamentoVivo(box, 'Uno', { timer });
  avanza(3000);
  mostraCaricamentoVivo(box, 'Due', { timer });
  avanza(1000);
  assert.equal(box.textContent, 'Due', 'il secondo caricamento è fermo nei suoi primi 2 s');
  box.remove();
  avanza(5000);
  assert.equal(attivi(), 0);
  assert.equal(doc.radice.children.length, 0);
});
