/*
 * 0.1.25 (owner 09/10/2026) — la carta quando il modello esclude o riammette un fornitore a valle: Approva · Annulla, parole
 *   chiare su CHE COSA cambia e per CHI (ogni modello, o un modello per una voce di serie), il blocco Adesso → Dopo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eCartaFornitori, testiCartaFornitori, creaBloccoCartaFornitori } from '../../src/components/fornitori-carta.js';

function docFinto() {
  const crea = (tag) => ({
    tag, children: [], dataset: {}, className: '', _t: null,
    append(...c) { for (const x of c) this.children.push(x); },
    set textContent(v) { this._t = String(v); this.children = []; }, get textContent() { return this._t ?? this.children.map((c) => c.textContent).join(' '); },
  });
  return { createElement: crea };
}

test('FORN-CARTA-01: solo escludere e riammettere hanno la carta; l elenco no', () => {
  assert.equal(eCartaFornitori({ tipo: 'provider_exclude' }), true);
  assert.equal(eCartaFornitori({ tipo: 'provider_allow' }), true);
  assert.equal(eCartaFornitori({ tipo: 'provider_exclusions_list' }), false);
  assert.equal(eCartaFornitori({ tipo: 'automation_create' }), false);
});

test('FORN-CARTA-02: escludere per ogni modello — frase, Adesso → Dopo, e la nota che vale per tutte le sessioni', () => {
  const azione = { tipo: 'provider_exclude', fornitore: 'deepinfra', cambi: [{ campo: 'persona', modello: null, prima: ['chutes'], dopo: ['chutes', 'deepinfra'] }] };
  const t = testiCartaFornitori(azione);
  assert.equal(t.bersaglio, 'deepinfra');
  assert.equal(t.perche, 'TALOS vuole che OpenRouter salti deepinfra per ogni modello.');
  assert.ok(t.badge);
  assert.equal(t.nota, 'Vale per ogni modello e ogni sessione, dalla prossima richiesta.', 'la nota sta nel piede della carta');
  const blocco = creaBloccoCartaFornitori(docFinto(), azione);
  assert.match(blocco.textContent, /^Adesso chutes Dopo chutes, deepinfra$/u);
  assert.equal(blocco.className, 'talos-approval__automazione', 'il blocco della carta di casa: lo stesso margine');
  assert.equal(blocco.dataset.cartaFornitori, undefined, 'il dato della carta non si ripete sul blocco: un selettore troverebbe due elementi');
});

test('FORN-CARTA-03: riammettere una voce di serie dice per QUALE modello; prima vuoto si legge «nessuno»', () => {
  const DI_SERIE = { campo: 'di-serie', modello: 'z-ai/glm-5.3-flash', prima: true, dopo: false };
  const serie = { tipo: 'provider_allow', fornitore: 'open-inference', cambi: [DI_SERIE] };
  assert.equal(testiCartaFornitori(serie).perche, 'TALOS vuole che OpenRouter usi di nuovo open-inference per glm-5.3-flash, che di serie lo esclude.');
  assert.equal(testiCartaFornitori(serie).nota, '', 'solo un modello: niente nota «ogni modello»');
  assert.equal(creaBloccoCartaFornitori(docFinto(), serie).textContent, 'Per glm-5.3-flash escluso (di serie) → di nuovo ammesso');
  const vuoto = { tipo: 'provider_exclude', fornitore: 'chutes', cambi: [{ campo: 'persona', modello: null, prima: [], dopo: ['chutes'] }] };
  assert.match(creaBloccoCartaFornitori(docFinto(), vuoto).textContent, /Adesso nessuno/u);
  // review del bugfixer (09/10): lista della persona E di-serie, una carta sola che li dice tutti e due
  const tutti = { tipo: 'provider_allow', fornitore: 'open-inference', cambi: [{ campo: 'persona', modello: null, prima: ['open-inference'], dopo: [] }, DI_SERIE] };
  assert.equal(testiCartaFornitori(tutti).perche, 'TALOS vuole che OpenRouter usi di nuovo open-inference, anche per glm-5.3-flash, che di serie lo esclude.');
  assert.equal(creaBloccoCartaFornitori(docFinto(), tutti).textContent, 'Adesso open-inference Dopo nessuno Per glm-5.3-flash escluso (di serie) → di nuovo ammesso');
});

test('FORN-CARTA-04: «Annulla» sulla carta dei fornitori si legge «Annullata», come sulle automazioni; un no altrove resta «Negato»', async () => {
  const { segnaEsitoApprovazione } = await import('../../src/components/conversazione.js');
  const doc = { createElement: (tag) => ({ tag, attributes: {}, className: '', textContent: '', setAttribute(k, v) { this.attributes[k] = v; } }) };
  const scheda = (dataset) => ({ dataset, figli: [], querySelector: () => null, append(n) { this.figli.push(n); } });
  const fornitori = scheda({ cartaFornitori: 'provider_exclude' });
  assert.match(segnaEsitoApprovazione(fornitori, { approvato: false }, { document: doc }).textContent, /Annullata/u);
  const qualunque = scheda({});
  assert.doesNotMatch(segnaEsitoApprovazione(qualunque, { approvato: false }, { document: doc }).textContent, /Annullata/u, 'AL CONTRARIO: una carta qualunque resta «Negato»');
});
