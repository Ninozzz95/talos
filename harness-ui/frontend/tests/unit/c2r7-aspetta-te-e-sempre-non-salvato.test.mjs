/*
 * C2-R7 (owner 08/10/2026 sera) — le due metà dell'interfaccia:
 * 1. la riga della MADRE dice «aspetta te» quando una discendente (figlia, nipote) aspetta la persona: il server lo calcola
 *    (`inAttesaDiscendente` nelle righe di GET /sessions), la riga lo legge come le altre attese;
 * 2. «Per questa sessione» davanti a un «Nega» messo dopo la nascita della carta consente solo QUESTA richiesta: il server non
 *    scrive il «sempre» (`nonUniti`), chi riceve la risposta segna la carta (`data-sempre-non-salvato`) e la carta lo dice sotto
 *    l'esito, inglese prima.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { segnaEsitoApprovazione } from '../../src/components/conversazione.js';
import { statoSessione } from '../../src/components/session-item.js';
import { impostaLingua } from '../../src/components/lingua.js';

/* Un DOM finto, solo ciò che `segnaEsitoApprovazione` usa: querySelector per UNA classe, remove, append, dataset. */
function nodoFinto(tag, doc) {
  const nodo = {
    tag, ownerDocument: doc, figli: [], padre: null, dataset: {}, attributi: {}, textContent: '', classi: new Set(),
    get className() { return [...nodo.classi].join(' '); },
    set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
    setAttribute: (k, v) => { nodo.attributi[k] = String(v); },
    getAttribute: (k) => nodo.attributi[k] ?? null,
    append: (...x) => { for (const f of x) { f.padre = nodo; nodo.figli.push(f); } },
    remove: () => { if (nodo.padre) nodo.padre.figli.splice(nodo.padre.figli.indexOf(nodo), 1); nodo.padre = null; },
    querySelector: (sel) => {
      const m = /^\.([\w-]+)$/u.exec(sel);
      if (!m) throw new Error(`selettore non previsto: ${sel}`);
      const cerca = (n) => { for (const f of n.figli) { if (f.classi.has(m[1])) return f; const d = cerca(f); if (d) return d; } return null; };
      return cerca(nodo);
    },
  };
  return nodo;
}
function cartaFinta() {
  const doc = { createElement: (tag) => nodoFinto(tag, doc) };
  const carta = doc.createElement('article');
  carta.className = 'talos-approval';
  const piede = doc.createElement('div'); piede.className = 'talos-approval__foot'; carta.append(piede);
  return carta;
}
const conClasse = (carta, classe) => carta.figli.filter((f) => f.classi.has(classe));

test('R7-UI-01: la madre con una discendente in attesa dice «aspetta te», come una sua approvazione', () => {
  impostaLingua('it');
  const madre = statoSessione({ conclusa: false, inAttesaDiscendente: true });
  const propria = statoSessione({ conclusa: false, inAttesaApprovazione: true });
  assert.equal(madre.classe, 'attesa');
  assert.equal(madre.testo, propria.testo, 'stessa parola della sua attesa: la carta sta nella sua chat');
  assert.equal(madre.tono, propria.tono);
  // una madre ferma (conclusa o interrotta) con la figlia che aspetta: aspetta la persona lo stesso
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo', inAttesaDiscendente: true }).classe, 'attesa');
  assert.equal(statoSessione({ conclusa: false, interrotta: true, inAttesaDiscendente: true }).classe, 'attesa');
});

test('R7-UI-02: AL CONTRARIO — senza discendenti in attesa la madre torna allo stato suo', () => {
  assert.equal(statoSessione({ conclusa: false, inAttesaDiscendente: false }).classe, 'vivo');
  assert.equal(statoSessione({ conclusa: false }).classe, 'vivo', 'una riga di un server vecchio, senza il campo');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo', inAttesaDiscendente: false }).classe, 'successo');
});

test('R7-UI-03: «sempre» non salvato — la carta lo dice sotto l\'esito, inglese prima, poi italiano', () => {
  impostaLingua('en');
  try {
    const carta = cartaFinta();
    carta.dataset.sempreNonSalvato = 'Terminal command';
    segnaEsitoApprovazione(carta, { approvato: true });
    const righe = conClasse(carta, 'talos-approval__sempre-non-salvato');
    assert.equal(righe.length, 1);
    /* il nome del pulsante premuto («For this session», non «Always allow»), e l'attrezzo e la regola con le parole della riga
       del perché e della finestra dei permessi (“Always deny”): review del bugfixer, 08/10 */
    assert.equal(righe[0].textContent, 'Allowed for this request only: the rule for “Terminal command” is “Always deny”, so “For this session” was not saved.');
    assert.ok(righe[0].classi.has('talos-approval__motivo'), 'stesso tono della riga del motivo, non un errore');
    const ordine = carta.figli.map((f) => [...f.classi].find((c) => c.startsWith('talos-approval__')));
    assert.deepEqual(ordine, ['talos-approval__esito', 'talos-approval__motivo'], 'sotto l\'esito, e il piede dei pulsanti è sparito');
  } finally { impostaLingua('it'); }
  const carta = cartaFinta();
  carta.dataset.sempreNonSalvato = 'Comando nel terminale';
  segnaEsitoApprovazione(carta, { approvato: true });
  assert.equal(conClasse(carta, 'talos-approval__sempre-non-salvato')[0].textContent, 'Consentito solo per questa richiesta: la regola di «Comando nel terminale» è «Nega sempre», quindi «Per questa sessione» non è stato salvato.');
});

test('R7-UI-04: AL CONTRARIO — niente riga se il «sempre» è stato scritto, o se la risposta è un no', () => {
  const scritta = cartaFinta();
  segnaEsitoApprovazione(scritta, { approvato: true });
  assert.equal(conClasse(scritta, 'talos-approval__sempre-non-salvato').length, 0, 'senza il segno: il «sempre» c\'è');
  const negata = cartaFinta();
  negata.dataset.sempreNonSalvato = 'Shell';
  segnaEsitoApprovazione(negata, { approvato: false });
  assert.equal(conClasse(negata, 'talos-approval__sempre-non-salvato').length, 0, 'un no non ha un «sempre» da perdere');
});

test('R7-UI-05: una volta sola — un esito ripetuto (riconnessione, risposta da un\'altra finestra) non raddoppia la riga', () => {
  const carta = cartaFinta();
  carta.dataset.sempreNonSalvato = 'Shell';
  segnaEsitoApprovazione(carta, { approvato: true });
  segnaEsitoApprovazione(carta, { approvato: true, altrove: true });
  assert.equal(conClasse(carta, 'talos-approval__sempre-non-salvato').length, 1);
  assert.equal(conClasse(carta, 'talos-approval__esito').length, 1);
});
