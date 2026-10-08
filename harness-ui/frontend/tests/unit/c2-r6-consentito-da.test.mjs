/*
 * C2 R6 (08/10/2026) — la riga dell'attrezzo dice quando una chiamata è passata per un permesso dato PIÙ IN ALTO (la ricevuta porta
 * `consentitoDa`). Stessa forma del segno del contenuto sospetto: badge neutro prima della colonna dell'esito, frase intera al
 * passaggio e per lo screen reader, nota in testa al corpo quando c'è. Il nome è il titolo vivo della sessione, mai l'id.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fraseConsentitoDa, segnaConsentitoDa } from '../../src/components/consentito-da.js';
import { impostaLingua } from '../../src/components/lingua.js';

/* Un DOM finto, solo ciò che il componente usa (lo stesso della prova F027). */
function nodoFinto(tag, doc) {
  const nodo = {
    tag, ownerDocument: doc, figli: [], padre: null, dataset: {}, attributi: {}, textContent: '', title: '', classi: new Set(),
    get className() { return [...nodo.classi].join(' '); },
    set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: { add: (...c) => c.forEach((x) => nodo.classi.add(x)), contains: (c) => nodo.classi.has(c) },
    setAttribute: (k, v) => { nodo.attributi[k] = String(v); },
    getAttribute: (k) => nodo.attributi[k] ?? null,
    append: (...x) => { for (const f of x) { f.padre = nodo; nodo.figli.push(f); } },
    prepend: (...x) => { for (const f of x.reverse()) { f.padre = nodo; nodo.figli.unshift(f); } },
    before: (f) => { const i = nodo.padre.figli.indexOf(nodo); f.padre = nodo.padre; nodo.padre.figli.splice(i, 0, f); },
    querySelector: (sel) => {
      const m = /^:scope > \.([\w-]+)$/u.exec(sel);
      if (!m) throw new Error(`selettore non previsto: ${sel}`);
      return nodo.figli.find((f) => f.classi.has(m[1])) ?? null;
    },
  };
  return nodo;
}
function rigaFinta() {
  const doc = { createElement: (tag) => nodoFinto(tag, doc) };
  const riga = doc.createElement('div');
  riga.className = 'talos-tool-row';
  for (const c of ['talos-tool-row__icon', 'talos-tool-row__name', 'talos-tool-row__detail', 'talos-voce__meta', 'talos-dot']) {
    const f = doc.createElement('span'); f.className = c; riga.append(f);
  }
  const corpo = doc.createElement('pre');
  corpo.className = 'talos-tool-row__body';
  const blocco = doc.createElement('pre'); blocco.className = 'tool-result-block'; corpo.append(blocco);
  return { riga, corpo };
}
const classiDeiFigli = (n) => n.figli.map((f) => [...f.classi][0]);
const DAL_PADRE = { sessionId: 'padre-1', tipo: 'cartella' };
const nomi = (id) => (id === 'padre-1' ? 'Rifai il sito' : null);

test('R6-RIGA-01: il segno sta prima della colonna dell\'esito, neutro, e dice al passaggio CHI ha dato il permesso', () => {
  impostaLingua('it');
  const { riga, corpo } = rigaFinta();
  segnaConsentitoDa({ riga, corpo, consentitoDa: DAL_PADRE, nomeSessione: nomi });
  assert.deepEqual(classiDeiFigli(riga), ['talos-tool-row__icon', 'talos-tool-row__name', 'talos-tool-row__detail', 'talos-badge', 'talos-voce__meta', 'talos-dot']);
  const segno = riga.figli[3];
  assert.equal(segno.textContent, 'Permesso ereditato');
  assert.ok(!segno.classi.has('talos-badge--warning'), 'è una provenienza, non un avviso');
  assert.equal(segno.title, 'Consentito da un permesso dato in «Rifai il sito».');
  assert.equal(segno.getAttribute('aria-label'), segno.title);
  assert.equal(riga.dataset.consentitoDa, 'padre-1');
  assert.deepEqual(classiDeiFigli(corpo), ['talos-tool-row__nota-consentito-da', 'tool-result-block'], 'la nota in testa al corpo');
});

test('R6-RIGA-02: inglese prima, e il ripiego senza nome non inventa niente (mai l\'id)', () => {
  impostaLingua('en');
  try {
    assert.equal(fraseConsentitoDa(DAL_PADRE, nomi), 'Allowed by a permission given in “Rifai il sito”.');
    assert.equal(fraseConsentitoDa({ sessionId: 'sconosciuta' }, nomi), 'Allowed by a permission given in a session above this one.');
    assert.equal(fraseConsentitoDa(DAL_PADRE, null), 'Allowed by a permission given in a session above this one.');
    assert.equal(fraseConsentitoDa(DAL_PADRE, () => '   '), 'Allowed by a permission given in a session above this one.', 'un titolo di soli spazi non è un nome');
    assert.equal(fraseConsentitoDa(DAL_PADRE, () => '  Rifai il sito '), 'Allowed by a permission given in “Rifai il sito”.');
    assert.ok(!fraseConsentitoDa({ sessionId: 'sconosciuta' }, nomi).includes('sconosciuta'), 'l\'id non va a schermo');
  } finally { impostaLingua('it'); }
});

test('R6-RIGA-02b: un titolo che finisce con un punto non raddoppia la punteggiatura (review del bugfixer, visto dal vivo)', () => {
  impostaLingua('it');
  const titolo = () => 'DELEGA alla figlia la creazione di un file.';
  assert.equal(fraseConsentitoDa(DAL_PADRE, titolo), 'Consentito da un permesso dato in «DELEGA alla figlia la creazione di un file».');
  assert.equal(fraseConsentitoDa(DAL_PADRE, () => 'Davvero?!'), 'Consentito da un permesso dato in «Davvero».');
  // AL CONTRARIO: la punteggiatura DENTRO il nome resta, e un nome di sola punteggiatura non è un nome
  assert.equal(fraseConsentitoDa(DAL_PADRE, () => 'v1.2 del sito'), 'Consentito da un permesso dato in «v1.2 del sito».');
  assert.equal(fraseConsentitoDa(DAL_PADRE, () => '...'), 'Consentito da un permesso dato in una sessione più in alto.');
});

test('R6-RIGA-03: una volta sola — una riconnessione che rimanda l\'evento non raddoppia segno né nota', () => {
  const { riga, corpo } = rigaFinta();
  segnaConsentitoDa({ riga, corpo, consentitoDa: DAL_PADRE, nomeSessione: nomi });
  segnaConsentitoDa({ riga, corpo, consentitoDa: DAL_PADRE, nomeSessione: nomi });
  assert.equal(riga.figli.filter((f) => f.classi.has('talos-badge')).length, 1);
  assert.equal(corpo.figli.filter((f) => f.classi.has('talos-tool-row__nota-consentito-da')).length, 1);
});

test('R6-RIGA-04: AL CONTRARIO — senza un `sessionId` (ricevuta senza il campo, o campo rotto) non si segna niente', () => {
  for (const consentitoDa of [undefined, null, {}, { sessionId: '' }, { sessionId: 7 }]) {
    const { riga, corpo } = rigaFinta();
    segnaConsentitoDa({ riga, corpo, consentitoDa, nomeSessione: nomi });
    assert.equal(riga.figli.length, 5, JSON.stringify(consentitoDa));
    assert.equal(corpo.figli.length, 1);
  }
});

test('R6-RIGA-05: senza corpo (la vista della figlia) il segno c\'è lo stesso', () => {
  const { riga } = rigaFinta();
  segnaConsentitoDa({ riga, consentitoDa: DAL_PADRE, nomeSessione: nomi });
  assert.equal(riga.figli.filter((f) => f.classi.has('talos-badge')).length, 1);
});
