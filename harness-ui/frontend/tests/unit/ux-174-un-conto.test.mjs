import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { impostaLingua, t as traduci } from '../../src/components/lingua.js';
import * as scheda from '../../src/components/contesto-scheda.js';
import * as contesto from '../../src/components/contesto.js';
import { aggiornaPaginaCapability } from '../../src/components/capability.js';
import { modelloContesto } from '../../src/components/pannello/contesto.js';

/*
 * Decisione 174 dell'owner (04/11/2026, reperto 6 della revisione UX della candidata): tre schermate, tre conti della stessa finestra.
 *   · scheda Contesto: 33,4k usati, di cui solo ~18,5k con un nome (il resto non si vedeva da nessuna parte);
 *   · Memoria e contesto: «266.667» (la finestra del profilo) e «Strumenti 21.538» (gli schemi OFFERTI, non quelli spediti);
 *   · Capability: «1.048.576» (la finestra del catalogo).
 * Ora un posto solo calcola la base (`contoDellaFinestra`: il limite che agisce, o il catalogo se non c'è una sessione) e le tre
 * schermate la leggono; la parte senza nome si chiama «Riassunti e altro». I numeri sono quelli misurati dal vivo il 04/11
 * (DeepSeek V4.1 Flash: finestra del profilo 266.667, soglia 165.999 col margine del fornitore, catalogo 1.048.576).
 * Il tetto che si muove (166k → 146k col margine dell'euristica) è del motore: forma in `FORMA-174-TETTO-FERMO-2026-11-04.md`.
 * Scritta rossa sulla candidata c45b49fbb. Le funzioni si chiamano dal modulo: sulla candidata la prova cade su «non è una funzione».
 */
const BUDGET = { triggerTokens: 165_999, windowTokens: 266_667 };
const CATALOGO = 1_048_576;
const RICHIESTA = { categorie: [
  { id: 'system', tokens: 2_100 }, { id: 'rules', tokens: 400 }, { id: 'tools', tokens: 11_000 }, { id: 'conversation', tokens: 5_000 },
] }; // 18.500 con un nome

test('UX174-1 — la parte senza nome ha un nome, «Riassunti e altro», e le righe sommano la misura', () => {
  const limite = scheda.limiteCheAgisce({ budget: BUDGET });
  const r = scheda.ripartizioneSulLimite({ ripartizione: RICHIESTA, usati: 33_400, limite });
  const altro = r.voci.find((v) => v.id === 'altro');
  assert.ok(altro, 'la riga del resto c’è');
  assert.equal(altro.tokens, 14_900);
  assert.equal(r.voci.at(-1).id, 'altro', 'ultima, dopo le categorie con un nome');
  assert.equal(r.voci.reduce((s, v) => s + v.tokens, 0), 33_400, 'le righe sommano ciò che il fornitore ha misurato');
  assert.equal(traduci(scheda.CHIAVI_CATEGORIA.altro), 'Riassunti e altro');
  impostaLingua('en');
  try { assert.equal(traduci(scheda.CHIAVI_CATEGORIA.altro), 'Summaries and other'); } finally { impostaLingua('it'); }
  // verso contrario: senza misura, o con le stime che superano la misura, nessun resto inventato
  assert.equal(scheda.ripartizioneSulLimite({ ripartizione: RICHIESTA, usati: null, limite }).voci.some((v) => v.id === 'altro'), false);
  assert.equal(scheda.ripartizioneSulLimite({ ripartizione: RICHIESTA, usati: 18_000, limite }).voci.some((v) => v.id === 'altro'), false);
  // la scheda del pannello legge la stessa riga
  const m = modelloContesto({ schedaContesto: { budget: BUDGET, ripartizione: RICHIESTA }, usage: { prompt_tokens: 33_400 } });
  assert.deepEqual(m.voci.map((v) => v.id), ['system', 'rules', 'tools', 'conversation', 'altro']);
});

test('UX174-2 — la panoramica disegna il resto come fetta sua, senza gonfiare le categorie', () => {
  const p = scheda.misuraDellaPanoramica({ usati: 33_400, limite: { soglia: 165_999, finestra: 266_667 }, ripartizione: RICHIESTA });
  const strumenti = p.segmenti.find((s) => s.id === 'tools');
  assert.ok(Math.abs(strumenti.pct - (11_000 / 266_667) * 100) < 1e-9, 'gli strumenti valgono quello che pesano, non 33,4/18,5 volte tanto');
  const altro = p.segmenti.find((s) => s.id === 'altro');
  assert.equal(altro?.tokens, 14_900);
  const somma = p.segmenti.reduce((s, x) => s + x.pct, 0);
  assert.ok(Math.abs(somma - p.pctUsati) < 1e-9, 'le fette sommano l’uso');
});

test('UX174-3 — un posto solo calcola la base: il limite che agisce, e senza sessione il catalogo', () => {
  const conSessione = scheda.contoDellaFinestra({ scheda: { budget: BUDGET }, finestraCatalogo: CATALOGO });
  assert.deepEqual({ base: conSessione.base, fonte: conSessione.fonte, finestra: conSessione.finestra }, { base: 165_999, fonte: 'motore', finestra: 266_667 });
  const senza = scheda.contoDellaFinestra({ scheda: null, finestraCatalogo: CATALOGO });
  assert.deepEqual({ base: senza.base, fonte: senza.fonte }, { base: CATALOGO, fonte: 'catalogo' });
  assert.equal(scheda.contoDellaFinestra({}).base, null, 'mai un numero di comodo');
  // le tre schermate leggono QUESTO conto: la scheda Contesto (limiteCheAgisce), Memoria e contesto, Capability
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const memoria = /async function caricaRipartizioneContesto\(\) \{[\s\S]*?\n {2}\}/u.exec(app)?.[0] ?? '';
  assert.match(memoria, /contoDellaFinestraCorrente\(\)/u, 'Memoria e contesto');
  const capability = /function mostraCapability\(opzioni = \{\}\) \{[\s\S]*?\n {2}\}/u.exec(app)?.[0] ?? '';
  assert.match(capability, /contoDellaFinestraCorrente\(\)/u, 'Capability');
  assert.match(app, /function contoDellaFinestraCorrente\(\) \{[\s\S]{0,400}contoDellaFinestra\(\{ scheda: datiSchedaContesto\(\)/u, 'una funzione sola, sui dati della scheda Contesto');
});

test('UX174-4 — Memoria e contesto: la percentuale sul limite, e «Strumenti» sono quelli spediti, lo stesso numero della scheda', () => {
  const attrezzi = [{ nome: 'a', tokenSchemaStimati: 12_000 }, { nome: 'b', tokenSchemaStimati: 9_538 }]; // 21.538 offerti
  const conto = scheda.contoDellaFinestra({ scheda: { budget: BUDGET, ripartizione: RICHIESTA }, finestraCatalogo: CATALOGO });
  const r = contesto.ripartizioneContesto({ attrezzi, conto });
  assert.equal(r.finestra, 165_999, 'la base è il limite, non 266.667');
  assert.equal(r.voci.find((v) => v.id === 'attrezzi').token, 11_000, 'gli strumenti spediti, come la scheda Contesto, non i 21.538 offerti');
  assert.equal(r.fonteFinestra, 'limite');
  assert.match(contesto.frasiRipartizione(r), /limite dove la conversazione si riassume/u);
  impostaLingua('en');
  try { assert.match(contesto.frasiRipartizione(r), /limit where the conversation is summarised/u); } finally { impostaLingua('it'); }
  // verso contrario: senza sessione (niente richiesta spedita) restano gli offerti, sul catalogo, e lo dice
  const senza = contesto.ripartizioneContesto({ attrezzi, conto: scheda.contoDellaFinestra({ finestraCatalogo: CATALOGO }) });
  assert.equal(senza.voci.find((v) => v.id === 'attrezzi').token, 21_538);
  assert.equal(senza.finestra, CATALOGO);
  assert.equal(senza.fonteFinestra, 'catalogo');
});

/* Un DOM minimo per la pagina Capability: solo i nodi che `aggiornaPaginaCapability` scrive. */
function schermoCapability() {
  const nodi = new Map();
  const nodo = () => ({ textContent: '', hidden: false, disabled: false, dataset: {}, replaceChildren() {}, append() {}, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {} });
  return { querySelector: (s) => { if (!nodi.has(s)) nodi.set(s, nodo()); return nodi.get(s); }, querySelectorAll: () => [], ownerDocument: { createElement: () => nodo() }, nodi };
}

test('UX174-5 — Capability dice la quota sul limite che agisce, non sul catalogo', () => {
  const attrezzi = [{ nome: 'a', tokenSchemaStimati: 16_600 }];
  const conto = scheda.contoDellaFinestra({ scheda: { budget: BUDGET }, finestraCatalogo: CATALOGO });
  const s = schermoCapability();
  try { aggiornaPaginaCapability(s, attrezzi, { conto }); } catch { /* il DOM finto non ha tutto: conta la riga dei token */ }
  const riga = s.querySelector('[data-cap-token]').textContent;
  assert.match(riga, /10% del limite di 165\.999/u, `la riga dice «${riga}»`);
  assert.doesNotMatch(riga, /1\.048\.576/u);
});
