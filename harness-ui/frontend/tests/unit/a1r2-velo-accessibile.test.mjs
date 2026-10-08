/*
 * A1-R2, review di «talos desktop» (07/10/2026) — IL VELO NON PARLA OGNI SECONDO. L'indicatore della cronologia era
 * `role="status"` + `aria-live="polite"` sul contenitore intero, e A1-R2 riscrive il conteggio degli eventi ogni secondo:
 * `role="status"` è `aria-atomic` di serie (MDN, «ARIA live regions», letto il 07/10/2026), quindi ogni tick riannunciava
 * tutta la regione. Qui si provano le funzioni VERE di `app.js`, estratte dal sorgente, su un DOM minimo:
 *   - la regione viva è la sola frase, e cambia solo quando la frase cambia (breve → lunga), non a ogni numero;
 *   - il numero sta FUORI dalla regione ed è `aria-hidden`;
 *   - il pulsante d'uscita sta fuori dalla regione (fratello), e si ritira a ogni velo nuovo;
 *   - senza eventi arrivati il velo non dice «lunga» (visto dal vivo: «Apro una cronologia lunga… 0 eventi finora»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

/** Il testo di `function nome(...) { ... }` dal sorgente, contando le graffe (le funzioni del velo non ne hanno nelle stringhe). */
function estrai(nome) {
  const inizio = APP.indexOf(`  function ${nome}(`);
  assert.ok(inizio >= 0, `funzione ${nome} non trovata`);
  assert.equal(APP.indexOf(`  function ${nome}(`, inizio + 1), -1, `funzione ${nome} definita due volte`);
  let i = APP.indexOf('{', inizio); let profondita = 0;
  for (; i < APP.length; i += 1) {
    if (APP[i] === '{') profondita += 1;
    else if (APP[i] === '}') { profondita -= 1; if (profondita === 0) break; }
  }
  return APP.slice(inizio, i + 1);
}

/** DOM minimo: solo ciò che le funzioni del velo usano. Ogni scrittura di testo si conta, per nodo. */
function documento() {
  const crea = (tag) => {
    const n = {
      tag, figli: [], parentElement: null, attributi: {}, ascoltatori: {}, proprio: '', scritture: 0, type: '',
      _classi: '',
      get className() { return this._classi; },
      set className(v) { this._classi = String(v); },
      classList: { contains: (c) => n._classi.split(/\s+/).includes(c) },
      get textContent() { return this.proprio + this.figli.map((x) => x.textContent).join(''); },
      set textContent(v) { this.proprio = String(v); this.figli = []; this.scritture += 1; },
      setAttribute(k, v) { this.attributi[k] = String(v); },
      getAttribute(k) { return k in this.attributi ? this.attributi[k] : null; },
      append(...nodi) { for (const x of nodi) { x.parentElement = this; this.figli.push(x); } },
      insertBefore(x, rif) { x.parentElement = this; const i = this.figli.indexOf(rif); this.figli.splice(i < 0 ? this.figli.length : i, 0, x); },
      remove() { if (this.parentElement) { this.parentElement.figli = this.parentElement.figli.filter((x) => x !== this); this.parentElement = null; } },
      addEventListener(tipo, fn) { this.ascoltatori[tipo] = fn; },
      click() { this.ascoltatori.click?.(); },
      discendenti() { return this.figli.flatMap((x) => [x, ...x.discendenti()]); },
      querySelector(sel) {
        // forme usate: «:scope > .a», «:scope > .a .b», «.a»
        const diretto = sel.startsWith(':scope > ');
        const [primo, ...resto] = sel.replace(':scope > ', '').split(' ').map((s) => s.slice(1));
        const candidati = (diretto ? this.figli : this.discendenti()).filter((x) => x.classList.contains(primo));
        for (const c of candidati) {
          if (!resto.length) return c;
          const trovato = c.discendenti().find((x) => x.classList.contains(resto[0]));
          if (trovato) return trovato;
        }
        return null;
      },
    };
    return n;
  };
  return { createElement: crea };
}

const TESTI = {
  'app.sessions.openingHistory': 'Opening history…',
  'app.sessions.openingLongHistory': 'Opening a long history…',
  'app.sessions.eventsSoFar': '{n} events so far',
  'app.sessions.showAsIs': 'Show the conversation as it is',
};

function banco() {
  const document = documento();
  const contesto = vm.createContext({
    document, Intl,
    tr: (k, p = {}) => (TESTI[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(p[x])),
    localeUI: () => 'en-US',
  });
  const nomi = ['assicuraCaricamentoCronologia', 'scriviSeCambia', 'aggiornaTestoCaricamentoLungo', 'mostraUscitaDalVelo', 'nascondiUscitaDalVelo', 'ripristinaVelo'];
  vm.runInContext(`${nomi.map(estrai).join('\n')}\nthis.f = { ${nomi.join(', ')} };`, contesto);
  const scorrevole = document.createElement('div');
  const conversation = document.createElement('div');
  scorrevole.append(conversation);
  contesto.f.assicuraCaricamentoCronologia(conversation);
  const indicatore = scorrevole.figli.find((x) => x.classList.contains('talos-caricamento-cronologia'));
  const tutti = () => [indicatore, ...indicatore.discendenti()];
  const regioni = () => tutti().filter((x) => x.getAttribute('role') === 'status' || x.getAttribute('aria-live') !== null);
  const dentroUnaRegione = (nodo) => { for (let n = nodo; n; n = n.parentElement) if (regioni().includes(n)) return true; return false; };
  const per = (classe) => tutti().find((x) => x.classList.contains(classe)) ?? null;
  return { f: contesto.f, conversation, indicatore, regioni, dentroUnaRegione, per };
}

test('A1R2-ARIA-01 una sola regione viva, ed è la frase: né il contenitore né il numero ne fanno parte', () => {
  const b = banco();
  assert.equal(b.indicatore.getAttribute('role'), null, 'il contenitore non è più una regione viva');
  assert.equal(b.indicatore.getAttribute('aria-live'), null);
  assert.equal(b.regioni().length, 1, 'una regione sola');
  const [regione] = b.regioni();
  assert.ok(regione.classList.contains('talos-caricamento-cronologia__testo'), 'la regione è la frase');
  assert.equal(regione.getAttribute('aria-live'), 'polite');
  const conteggio = b.per('talos-caricamento-cronologia__conteggio');
  assert.ok(conteggio, 'il numero ha uno span suo');
  assert.equal(conteggio.getAttribute('aria-hidden'), 'true');
  assert.equal(b.dentroUnaRegione(conteggio), false, 'il numero sta FUORI dalla regione (aria-atomic la riannuncerebbe intera)');
});

test('A1R2-ARIA-02 i tick con numeri diversi NON toccano la regione: una sola scrittura, breve → lunga', () => {
  const b = banco();
  const regione = b.regioni()[0];
  const prima = regione.scritture;
  for (const n of [120, 4_800, 24_713, 25_173, 26_109, 26_109]) b.f.aggiornaTestoCaricamentoLungo(b.conversation, n);
  assert.equal(regione.textContent, 'Opening a long history…');
  assert.equal(regione.scritture - prima, 1, `la regione si scrive una volta sola, non a ogni tick: ${regione.scritture - prima}`);
  const conteggio = b.per('talos-caricamento-cronologia__conteggio');
  assert.equal(conteggio.textContent, '26,109 events so far');
  assert.equal(conteggio.scritture, 5, 'il numero si riscrive solo quando cambia (l\'ultimo tick ripete 26.109)');
});

test('A1R2-ARIA-03 nessun evento arrivato: il velo non dice «lunga» e non mostra «0 eventi»', () => {
  const b = banco();
  b.f.aggiornaTestoCaricamentoLungo(b.conversation, 0);
  b.f.aggiornaTestoCaricamentoLungo(b.conversation, 0);
  assert.equal(b.regioni()[0].textContent, 'Opening history…');
  assert.equal(b.per('talos-caricamento-cronologia__conteggio').textContent, '');
  assert.equal(b.regioni()[0].scritture, 1, 'solo la scrittura di nascita');
});

test('A1R2-ARIA-04 il pulsante d\'uscita è un fratello FUORI dalla regione; il velo nuovo lo ritira e torna alla frase breve', () => {
  const b = banco();
  b.f.aggiornaTestoCaricamentoLungo(b.conversation, 900);
  let premuto = 0;
  b.f.mostraUscitaDalVelo(b.conversation, () => { premuto += 1; });
  b.f.mostraUscitaDalVelo(b.conversation, () => { premuto += 1; });
  const uscite = [b.indicatore, ...b.indicatore.discendenti()].filter((x) => x.classList.contains('talos-caricamento-cronologia__uscita'));
  assert.equal(uscite.length, 1, 'un pulsante solo anche se offerto due volte');
  const [uscita] = uscite;
  assert.equal(uscita.tag, 'button');
  assert.equal(uscita.type, 'button');
  assert.equal(uscita.parentElement, b.indicatore, 'sta nel contenitore, accanto alla frase');
  assert.equal(b.dentroUnaRegione(uscita), false, 'fuori dalla regione viva');
  assert.equal(uscita.textContent, 'Show the conversation as it is');
  b.f.ripristinaVelo(b.conversation);
  assert.equal(b.per('talos-caricamento-cronologia__uscita'), null, 'il velo nuovo parte senza pulsante');
  assert.equal(b.regioni()[0].textContent, 'Opening history…');
  assert.equal(b.per('talos-caricamento-cronologia__conteggio').textContent, '');
  assert.equal(premuto, 0);
});
