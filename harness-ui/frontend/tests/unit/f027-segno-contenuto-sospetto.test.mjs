/*
 * F-027 (owner 02/10/2026, «+1 con conferma») — la riga di un attrezzo il cui risultato porta testo che sembra un'istruzione per
 * un'IA: un segno piccolo sulla riga, e la nota in testa al dettaglio con le parole del kernel. Una volta sola per riga.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { domandaContenutoSospetto, fraseSospetto, segnaContenutoSospetto } from '../../src/components/contenuto-sospetto.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';
import { TIPI_DI_LUOGO } from '../../../src/kernel/confine-dati.mjs';

/* Un DOM finto, solo ciò che il componente usa: figli in ordine, classi, dataset, attributi, `:scope > .classe`. */
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
function documentoFinto() {
  const doc = { createElement: (tag) => nodoFinto(tag, doc) };
  return doc;
}
function rigaFinta() {
  const doc = documentoFinto();
  const riga = doc.createElement('div');
  riga.className = 'talos-tool-row';
  for (const c of ['talos-tool-row__icon', 'talos-tool-row__name', 'talos-tool-row__detail', 'talos-voce__meta', 'talos-dot']) {
    const f = doc.createElement('span'); f.className = c; riga.append(f);
  }
  const corpo = doc.createElement('pre');
  corpo.className = 'talos-tool-row__body';
  const blocco = doc.createElement('pre'); blocco.className = 'tool-result-block'; corpo.append(blocco);
  return { doc, riga, corpo };
}
const SOSPETTO = { source: 'leggi trappola.md', patterns: ['fake_role_tag'], place: { tipo: 'file', nome: 'trappola.md' } };
const NOTA_IT = 'C’è testo che sembra un’istruzione per un’IA dentro il file «trappola.md»: finge un messaggio di sistema. L’agente lo tratta come dati, e prima del prossimo passo che cambia qualcosa ti chiede conferma.';
const NOTA_EN = 'There is text that looks like an instruction to an AI in the file “trappola.md”: it pretends to be a system message. The agent treats it as data, and asks you before its next step that changes anything.';
const classiDeiFigli = (n) => n.figli.map((f) => [...f.classi][0]);

test('F027-SEGNO: il segno sta prima della colonna dell\'esito, e dice la frase del kernel al passaggio', () => {
  const { riga, corpo } = rigaFinta();
  segnaContenutoSospetto({ riga, corpo, sospetto: SOSPETTO });
  assert.deepEqual(classiDeiFigli(riga), ['talos-tool-row__icon', 'talos-tool-row__name', 'talos-tool-row__detail', 'talos-badge', 'talos-voce__meta', 'talos-dot']);
  const segno = riga.figli[3];
  assert.equal(segno.textContent, 'Contenuto sospetto');
  assert.ok(segno.classList.contains('talos-badge--warning'));
  assert.equal(segno.title, NOTA_IT);
  assert.equal(riga.dataset.contenutoSospetto, 'si');
});

test('F027-NOTA: la nota sta in testa al dettaglio, col tono d\'attenzione e le parole del kernel', () => {
  const { riga, corpo } = rigaFinta();
  segnaContenutoSospetto({ riga, corpo, sospetto: SOSPETTO });
  assert.deepEqual(classiDeiFigli(corpo), ['talos-system-note', 'tool-result-block']);
  const nota = corpo.figli[0];
  assert.equal(nota.getAttribute('data-tone'), 'warning');
  const testi = [];
  const raccogli = (n) => { if (n.textContent) testi.push(n.textContent); n.figli.forEach(raccogli); };
  raccogli(nota);
  assert.ok(testi.includes(NOTA_IT), testi.join(' | '));
  assert.ok(!testi.some((t) => /fake_role_tag|leggi trappola/u.test(t)), 'niente nomi tecnici a schermo');
});

test('F027-SEGNO-UNA-VOLTA: una riconnessione che rimanda l\'evento non raddoppia il segno né la nota', () => {
  const { riga, corpo } = rigaFinta();
  segnaContenutoSospetto({ riga, corpo, sospetto: SOSPETTO });
  segnaContenutoSospetto({ riga, corpo, sospetto: SOSPETTO });
  assert.equal(riga.figli.filter((f) => f.classi.has('talos-badge')).length, 1);
  assert.equal(corpo.figli.filter((f) => f.classi.has('talos-system-note')).length, 1);
});

test('F027-SEGNO-SENZA-DATI: un evento senza luogo (server più vecchio) porta il segno con la frase senza dettagli, mai vuota', () => {
  impostaLingua('it');
  assert.match(fraseSospetto({ source: 'shell', patterns: ['prompt_injection'] }), /^C’è testo che sembra un’istruzione per un’IA\. /u);
  assert.equal(fraseSospetto({}), fraseSospetto({ place: { tipo: 'file' } }));
  const { riga } = rigaFinta();
  segnaContenutoSospetto({ riga, corpo: null, sospetto: { source: 'shell', patterns: ['prompt_injection'] } });
  assert.equal(riga.figli.filter((f) => f.classi.has('talos-badge')).length, 1);
});

test('F027-DUE-LINGUE: la nota e la domanda d’approvazione si dicono in italiano e in inglese, dagli stessi dati del kernel', () => {
  impostaLingua('it');
  assert.equal(fraseSospetto(SOSPETTO), NOTA_IT);
  const azione = { fonte: 'leggi trappola.md', motivi: ['fake_role_tag', 'priority_override'], luogo: { tipo: 'file', nome: 'trappola.md' } };
  assert.equal(domandaContenutoSospetto(azione), 'Prima di questo passo l’agente ha letto testo che sembra un’istruzione per un’IA, dentro il file «trappola.md» (finge un messaggio di sistema e si dichiara a priorità assoluta). Può essere un tentativo di fargli fare cose che non hai chiesto: vuoi che lo faccia lo stesso?');
  impostaLingua('en');
  assert.equal(fraseSospetto(SOSPETTO), NOTA_EN);
  assert.equal(domandaContenutoSospetto(azione), 'Before this step the agent read text that looks like an instruction to an AI, in the file “trappola.md” (it pretends to be a system message and claims absolute priority). It may be an attempt to make it do things you did not ask for: do you want it to go ahead anyway?');
  assert.ok(!/fake_role_tag|leggi trappola/u.test(fraseSospetto(SOSPETTO) + domandaContenutoSospetto(azione)), 'niente nomi tecnici');
  impostaLingua('it');
});

test('F027-LUOGHI-DEL-KERNEL: ogni posto che il kernel può mandare ha le sue parole in italiano e in inglese', () => {
  /* 03/10/2026, estensione del confine: un tipo nuovo nel kernel senza la sua chiave diventerebbe «un risultato» a schermo. */
  const conNome = { file: ['luogo.file', 'luogo.unFile'], strumento: ['luogo.strumento', 'luogo.unoStrumento'] };
  for (const tipo of TIPI_DI_LUOGO) {
    for (const chiave of conNome[tipo] ?? [`luogo.${tipo}`]) {
      for (const lingua of ['it', 'en']) assert.ok(TESTI[lingua][`kernel.${chiave}`], `kernel.${chiave} (${lingua})`);
    }
  }
  impostaLingua('en');
  assert.match(fraseSospetto({ patterns: ['prompt_injection'], place: { tipo: 'cartella' } }), /in a folder listing:/u);
  impostaLingua('it');
  assert.match(fraseSospetto({ patterns: ['prompt_injection'], place: { tipo: 'progetto' } }), /dentro la mappa e lo stato del progetto:/u);
});
