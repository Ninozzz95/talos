/*
 * LA PROVA CHE IL CANCELLO MORDE.
 *
 * ⛔ Ogni analizzatore ha i suoi test e passano tutti — 108 in tutto. Ma quello prova solo che i
 * loro test passano. Questa prova e' un'altra domanda, ed e' quella che conta: messi davanti ai
 * difetti VERI trovati a mano il 06/09, li trovano? Un cancello che non riconosce i difetti che
 * SAPPIAMO esserci non protegge da niente — e' il difetto del cancello semantico, inerte per mesi
 * senza che nessuno se ne accorgesse perche' nessuno gli aveva mai dato in pasto un caso vero.
 *
 * Ogni caso qui sotto e' un difetto costato una giornata: le 12 icone mute, il foglio dei permessi
 * illeggibile, la voce «Note» che non portava da nessuna parte, le sessioni morte che dicevano «in
 * corso», il JSON grezzo nel riquadro d'errore, la scheda Agenti sempre vuota.
 * ⛔ E l'ultimo caso e' al CONTRARIO: il codice mostrato apposta non deve essere accusato. Senza
 * quello un cancello «severo» diventa rumore e smette di essere letto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { simboliMancanti, classiSenzaRegola } from '../../scripts/cancello/riferimenti-morti.mjs';
import { haGestore } from '../../scripts/cancello/controlli-morti.mjs';
import { statiBugiardi } from '../../scripts/cancello/stati-bugiardi.mjs';
import { testoGrezzo } from '../../scripts/cancello/testo-grezzo.mjs';
import { superficiScollegate } from '../../scripts/cancello/superfici-scollegate.mjs';

const prova = (nome, trovato) => assert.ok(trovato, `il cancello NON trova un difetto vero: ${nome}`);

test('⛔ il cancello morde: i difetti VERI del 06/09, uno per uno', () => {

// 1) le 12 icone: il template senza i-folder-open, il JS che lo usa in tre forme diverse
const html = '<svg class="talos-sprite"><symbol id="i-search"></symbol><symbol id="i-plus"></symbol></svg><button><use href="#i-search"/></button>';
const sorgenti = {
  'app.js': "icon('i-folder-open'); const m = { icona: 'i-trash' }; icon(c ? 'i-chevron' : 'i-chevron-right');",
};
const mancanti = simboliMancanti({ html, sorgenti });
const nomi = JSON.stringify(mancanti);
prova('icona chiamata come icon(...)      i-folder-open', /i-folder-open/.test(nomi));
prova('icona scritta come icona: ...      i-trash', /i-trash/.test(nomi));
prova('icona dentro un ternario           i-chevron-right', /i-chevron-right/.test(nomi));

// 2) .sheet-option: usata nel markup, e nel CSS c'e' SOLO .sheet-option.active
const senzaRegola = classiSenzaRegola({
  html: '<button class="sheet-option"><strong>Read only</strong><small>Legge</small></button>',
  css: '.sheet-option.active{ border-color: red; }',
  sorgenti: {},
});
prova('classe con la sola regola .active  .sheet-option', /sheet-option/.test(JSON.stringify(senzaRegola)));

// 3) la voce Note: ha data-vaia, la delega esiste, ma la mappa non conosce 'note'
const voceNote = {
  selettore: '[data-vaia="note"]', tag: 'BUTTON', testo: 'Note',
  attributi: { 'data-vaia': 'note' }, ascoltatori: [],
  antenati: [{ tag: 'DIV', attributi: {}, ascoltatori: [{ type: 'click' }] }],
};
// ⛔ le firme VERE del modulo: `valoriRiconosciuti` (non `valori`), `su` (non `selettore`), e
//    haGestore torna un OGGETTO {vivo, motivo, perche}, non un booleano. Il primo giro di questa
//    prova sbagliava le tre cose e accusava il modulo di non trovare il difetto: era la PROVA a
//    essere sbagliata. Si leggono le firme sul file, non si indovinano.
const deleghe = [{
  nome: 'viste', su: 'DIV', attributo: 'data-vaia', evento: 'click',
  valoriRiconosciuti: ['chat', 'terminale', 'review', 'browser'],
}];
const esito = haGestore(voceNote, { deleghe });
prova('voce con delega che NON conosce il valore (il caso «Note»)', esito.vivo === false && /non è fra i valori/.test(esito.perche || ''));
assert.equal(esito.motivo, 'valore-non-riconosciuto');

// 4) la sessione morta che dice «in corso»
const bugie = statiBugiardi(
  [{ sessionId: 's1', conclusa: false, interrotta: true }],
  [{ sessionId: 's1', stato: 'in corso', pallino: 'talos-dot--live' }],
);
prova('sessione interrotta mostrata «in corso»', JSON.stringify(bugie).length > 2 && /s1|interrott|in corso/i.test(JSON.stringify(bugie)));

// 5) il testo grezzo del riquadro «Attivita non riuscita»
const grezzo = testoGrezzo([
  { selettore: '.tool-args', testo: '{"titolo":"GPT Tokenizer Demo","html":"<!doctype html>"}', dentroCodice: false },
  { selettore: '.errore', testo: 'REFUSED. Empty html: nothing was created.', dentroCodice: false },
  { selettore: 'pre code', testo: '{"questo":"e codice mostrato apposta"}', dentroCodice: true },
], { nomiTecnici: ['document_create', 'web_search'] });
const g = JSON.stringify(grezzo);
prova('JSON grezzo a schermo', /tool-args/.test(g));
prova('REFUSED non tradotto', /errore/.test(g));
prova('AL CONTRARIO: il codice apposta NON accusato', !/pre code/.test(g));

// 6) la scheda Agenti che non chiama /children
const scollegate = superficiScollegate(
  [{ nome: 'Agenti', promette: 'i sotto-agenti della sessione', chiamate: [] }],
  [],
  { rotte: ['/api/v1/sessions/:id/children'] },
);
prova('scheda che promette e non chiama nulla', /Agenti/.test(JSON.stringify(scollegate)));
});
