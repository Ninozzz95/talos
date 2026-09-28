import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { apri, mostra, radice } from './aiuto.mjs';

/*
 * IL CANCELLO DEI COMPONENTI — dal 24/09/2026 il RIFERIMENTO è l'ATLAS.
 *
 * ⛔ NON DEPLOYABILE finché la review avversaria del coordinatore non lo accetta e l'owner non valuta sul 4174.
 *
 * Owner, 24/09/2026 (Q-18): «il cancello di parità si riscrive col riferimento Atlas; il mockup Calm congelato resta come
 * storia (non cancellarlo). Riscrivilo nominando per ogni valore la fonte nell'Atlas, e provalo al contrario».
 *
 * CHE COSA È CAMBIATO. Fino al 24/09 questo file confrontava il laboratorio (`lab/main.js`) con `mockup/talos-mockup.html`
 * (Calm, congelato) su struttura, parole e pixel (la versione intera è nella storia di git, commit 1a4ee27aa). Quel file
 * RESTA dov'è, come storia, e non è più il riferimento di questo cancello: il riferimento è `mockup/atlas/atlas.css`,
 * copia byte per byte di `source/atlas.css` del pacchetto «TALOS UI Atlas» (sha256 `fb833e6b…c8e5ee`, lo stesso
 * `file_sha256` di `registri/CSS-ATLAS.json`). Le pagine dell'Atlas e del prodotto non condividono markup né testi
 * (l'Atlas è una vetrina con dati dimostrativi), quindi il confronto non è più «stessi nodi, stessi pixel»: è **un
 * contratto di VALORI**, una riga per valore, e ogni riga nomina la sua fonte nell'Atlas — l'ID della regola nel
 * registro, la posizione riga:colonna nel file, il selettore, la proprietà e il valore dichiarato.
 *
 * TRE PIANI, e ognuno si prova al contrario (rapporto di Q-18 in `.claude/ATLAS-F2-ESITO-2026-09-24.md`):
 *   1. IL RIFERIMENTO È L'ATLAS — l'impronta del file, e per ogni riga: la regola comincia a quella riga:colonna col
 *      selettore dichiarato, dichiara quella proprietà con quel valore, e (se la riga non porta una decisione
 *      dell'owner o un calcolo dichiarato) il valore atteso nel prodotto È quel valore. Chi cambia un numero nel
 *      contratto senza una decisione, o tocca la copia dell'Atlas, fa diventare rosso questo piano.
 *   2. IL PRODOTTO SEGUE IL CONTRATTO — per le famiglie già portate, gli stili calcolati del campione del laboratorio
 *      (`?componente=ControlliF1` per F1) uguagliano il valore atteso di ogni riga.
 *   3. LE GUARDIE DI SEMPRE — i controlli di comportamento che il vecchio cancello faceva sul laboratorio (etichette
 *      integre, icone esistenti, tastiera, conteggi) restano, sul laboratorio, e non dipendono da nessun mockup.
 *
 * ⛔ Le famiglie NON ancora portate all'Atlas sono dichiarate `test.fixme`, una per componente, con la famiglia e la
 *   voce dell'Atlas: non passano e non falliscono, si VEDONO nel rapporto. Portare una famiglia vuol dire scrivere le
 *   sue righe nel contratto e togliere i suoi `fixme` — mai togliere un `fixme` senza righe.
 *
 * LE DECISIONI DELL'OWNER che fanno divergere un valore dall'Atlas (24/09/2026), e sono le SOLE ammesse:
 *   Q-01 fondi e contorni della Desktop 0.1.15 (spessore, colore, raggio) · Q-06 testo mai sotto gli 11 px ·
 *   Q-16 bottone-icona 36 × 36 per il cancello dei 36 px (`tests/browser/baseline-shell.spec.mjs:1274-1304`).
 *
 * Il laboratorio gira sul suo server (porta 4176, `serve-lab.mjs`) — mai sulla 4174 dell'owner.
 */
const LAB = process.env.TALOS_LAB_URL || `http://127.0.0.1:${process.env.TALOS_LAB_PORT || 4176}`;
const ATLAS_CSS = path.resolve(radice, 'mockup/atlas/atlas.css');
const IMPRONTA_ATLAS = 'fb833e6bffae79f4c69ea15706e1dbd30012d8717faabf054ac1d92699c8e5ee';

/*
 * Una fonte nell'Atlas: `id` e `pos` sono quelli di `registri/CSS-ATLAS.json`; `sel` e `prop` come sono scritti nel
 * file; `valore` il testo dichiarato come lo rilegge il CSSOM di Chrome (`.45` → `0.45`, `0` → `0px`); `parte` = indice
 * del pezzo di uno shorthand («1px solid var(--line)» → 0 = «1px»).
 */
const A = (id, pos, sel, prop, valore, parte) => ({ id, pos, sel, prop, valore, parte });

/*
 * IL CONTRATTO. `dove` = l'esemplare `data-s` del campione; `prop` = proprietà calcolata (`altezza`/`larghezza` =
 * rettangolo); `atteso` = valore nel prodotto (stringa, o `{ token }` = il colore che quel token risolve nel prodotto,
 * perché l'Atlas lo dichiara come alias di un nostro token — `:root` CSS-0001); `atlas` = una o più fonti;
 * `decisione` = la decisione dell'owner che fa divergere; `calcolo` = come dall'Atlas si arriva ad `atteso` quando non
 * è lo stesso testo. Senza `decisione` né `calcolo`, `atteso` DEVE essere il valore dell'Atlas (piano 1).
 */
const CONTRATTO = {
  F1: {
    campione: 'ControlliF1',
    righe: [
      // ── Bottoni: `.btn` e varianti
      { id: 'BTN-ALTEZZA', dove: 'sec', prop: 'altezza', atteso: '36px', atlas: A('CSS-0163', '9:351', '.btn', 'min-height', '36px') },
      { id: 'BTN-PAD-V', dove: 'sec', prop: 'padding-top', atteso: '7px', atlas: A('CSS-0163', '9:351', '.btn', 'padding', '7px 13px', 0) },
      { id: 'BTN-PAD-O', dove: 'sec', prop: 'padding-left', atteso: '13px', atlas: A('CSS-0163', '9:351', '.btn', 'padding', '7px 13px', 1) },
      { id: 'BTN-GAP', dove: 'sec', prop: 'gap', atteso: '8px', atlas: A('CSS-0163', '9:351', '.btn', 'gap', '8px') },
      { id: 'BTN-TESTO', dove: 'sec', prop: 'font-size', atteso: '12px', atlas: A('CSS-0163', '9:351', '.btn', 'font-size', '12px') },
      { id: 'BTN-INTERLINEA', dove: 'sec', prop: 'line-height', atteso: '16.2px', atlas: A('CSS-0163', '9:351', '.btn', 'line-height', '1.35'), calcolo: '12 px × 1.35' },
      { id: 'BTN-ANIMA', dove: 'sec', prop: 'transition-property', atteso: 'background-color, border-color', atlas: A('CSS-0163', '9:351', '.btn', 'transition', 'background 0.12s, border-color 0.12s'), calcolo: 'si animano fondo e bordo (`background` si calcola `background-color`); la durata resta il token di movimento della app (owner: niente spegnimento universale)' },
      { id: 'BTN-BORDO', dove: 'sec', prop: 'border-top-width', atteso: '2px', atlas: A('CSS-0163', '9:351', '.btn', 'border', '1px solid var(--line)', 0), decisione: 'Q-01: spessore del contorno della 0.1.15' },
      { id: 'BTN-RAGGIO', dove: 'sec', prop: 'border-top-left-radius', atteso: '9px', atlas: A('CSS-0163', '9:351', '.btn', 'border-radius', 'var(--control-radius)'), decisione: 'Q-01: raggio della 0.1.15' },
      { id: 'BTN-ICONA', dove: 'secIcona', prop: 'larghezza', atteso: '15px', atlas: A('CSS-0171', '9:1215', '.btn .icon', 'width', '15px') },
      { id: 'BTN-FANTASMA-TESTO', dove: 'ghost', prop: 'color', atteso: { token: '--talos-text' }, atlas: [A('CSS-0163', '9:351', '.btn', 'color', 'var(--text)'), A('CSS-0001', '2:1', ':root', '--text', 'var(--talos-text,#f3f0e9)')], calcolo: '`--text` è l\'alias Atlas di `--talos-text`' },
      { id: 'BTN-PRIMARIO-PESO', dove: 'pri', prop: 'font-weight', atteso: '600', atlas: A('CSS-0165', '9:738', '.btn.primary', 'font-weight', '600') },
      { id: 'BTN-PRIMARIO-OMBRA', dove: 'pri', prop: 'box-shadow', atteso: 'none', atlas: A('CSS-0165', '9:738', '.btn.primary', 'box-shadow', ''), calcolo: 'l\'Atlas non dichiara ombre sul primario ⇒ none (Q-01b: l\'ombra interna della 0.1.15 va via)' },
      { id: 'BTN-PICCOLO-ALTEZZA', dove: 'sm', prop: 'altezza', atteso: '29px', atlas: A('CSS-0170', '9:1140', '.btn.tiny', 'min-height', '29px') },
      { id: 'BTN-PICCOLO-PAD-V', dove: 'sm', prop: 'padding-top', atteso: '5px', atlas: A('CSS-0170', '9:1140', '.btn.tiny', 'padding', '5px 9px', 0) },
      { id: 'BTN-PICCOLO-PAD-O', dove: 'sm', prop: 'padding-left', atteso: '9px', atlas: A('CSS-0170', '9:1140', '.btn.tiny', 'padding', '5px 9px', 1) },
      { id: 'BTN-PICCOLO-TESTO', dove: 'sm', prop: 'font-size', atteso: '11px', atlas: A('CSS-0170', '9:1140', '.btn.tiny', 'font-size', '10px'), decisione: 'Q-06: testo mai sotto gli 11 px' },
      { id: 'BTN-PICCOLO-RAGGIO', dove: 'sm', prop: 'border-top-left-radius', atteso: '8px', atlas: A('CSS-0170', '9:1140', '.btn.tiny', 'border-radius', '7px'), decisione: 'Q-01: raggio della 0.1.15' },
      { id: 'BTN-ICONA-SOLA-L', dove: 'icon', prop: 'larghezza', atteso: '36px', atlas: A('CSS-0169', '9:1076', '.btn.icon-only', 'width', '34px'), decisione: 'Q-16: 36 × 36, vince il cancello dei 36 px' },
      { id: 'BTN-ICONA-SOLA-A', dove: 'icon', prop: 'altezza', atteso: '36px', atlas: A('CSS-0169', '9:1076', '.btn.icon-only', 'height', '34px'), decisione: 'Q-16: 36 × 36, vince il cancello dei 36 px' },
      { id: 'BTN-ICONA-SOLA-PAD', dove: 'icon', prop: 'padding-top', atteso: '0px', atlas: A('CSS-0169', '9:1076', '.btn.icon-only', 'padding', '0px') },
      { id: 'BTN-SPENTO', dove: 'secOff', prop: 'opacity', atteso: '0.45', atlas: A('CSS-0007', '3:196', 'button:disabled', 'opacity', '0.45') },
      // ── Campi, select, area di testo: `.text-input,select,textarea` e `.input-wrap`
      { id: 'CAMPO-ALTEZZA', dove: 'campo', prop: 'altezza', atteso: '36px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'min-height', '36px') },
      { id: 'CAMPO-PAD-O', dove: 'campo', prop: 'padding-left', atteso: '11px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'padding', '8px 11px', 1) },
      { id: 'CAMPO-TESTO', dove: 'campo', prop: 'font-size', atteso: '12px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'font-size', '12px') },
      { id: 'CAMPO-BORDO', dove: 'campo', prop: 'border-top-width', atteso: '1px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'border', '1px solid var(--line)', 0) },
      { id: 'CAMPO-SPENTO', dove: 'campoOff', prop: 'opacity', atteso: '0.45', atlas: A('CSS-0185', '9:2291', '.text-input:disabled', 'opacity', '0.45') },
      { id: 'CAMPO-ERRORE', dove: 'campoErr', prop: 'border-top-color', atteso: { token: '--talos-danger' }, atlas: [A('CSS-0187', '9:2372', '.text-input[aria-invalid=true]', 'border-color', 'var(--danger)'), A('CSS-0001', '2:1', ':root', '--danger', 'var(--talos-danger,#d87d72)')], calcolo: '`--danger` è l\'alias Atlas di `--talos-danger`' },
      { id: 'LENTE-ALTEZZA', dove: 'lente', prop: 'altezza', atteso: '38px', atlas: [A('CSS-0176', '9:1560', '.text-input,select,textarea', 'min-height', '36px'), A('CSS-0179', '9:1847', '.input-wrap', 'border', '1px solid var(--line)', 0)], calcolo: 'il campo interno (36) più il bordo del contenitore sopra e sotto (2 × 1)' },
      { id: 'LENTE-PAD-O', dove: 'lente', prop: 'padding-left', atteso: '34px', atlas: [A('CSS-0179', '9:1847', '.input-wrap', 'padding-left', '11px'), A('CSS-0183', '9:2212', '.input-wrap>svg', 'width', '16px'), A('CSS-0179', '9:1847', '.input-wrap', 'gap', '7px')], calcolo: 'il testo parte a 11 + 16 + 7 dal bordo interno: il cromo sta sull\'input, l\'icona è assoluta' },
      { id: 'LENTE-FUOCO', dove: 'lente', prop: 'outline-offset', fuoco: true, atteso: '2px', atlas: A('CSS-0181', '9:2067', '.input-wrap:focus-within', 'outline-offset', '2px') },
      { id: 'LENTE-FUOCO-SPESSORE', dove: 'lente', prop: 'outline-width', fuoco: true, atteso: '2px', atlas: A('CSS-0181', '9:2067', '.input-wrap:focus-within', 'outline', '2px solid var(--talos-ring,var(--accent))', 0) },
      { id: 'SELECT-ALTEZZA', dove: 'select', prop: 'altezza', atteso: '36px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'min-height', '36px') },
      { id: 'SELECT-PAD-O', dove: 'select', prop: 'padding-left', atteso: '11px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'padding', '8px 11px', 1) },
      { id: 'SELECT-TESTO', dove: 'select', prop: 'font-size', atteso: '12px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'font-size', '12px') },
      { id: 'AREA-PAD-V', dove: 'area', prop: 'padding-top', atteso: '8px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'padding', '8px 11px', 0) },
      { id: 'AREA-PAD-O', dove: 'area', prop: 'padding-left', atteso: '11px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'padding', '8px 11px', 1) },
      { id: 'AREA-TESTO', dove: 'area', prop: 'font-size', atteso: '12px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'font-size', '12px') },
      { id: 'AREA-INTERLINEA', dove: 'area', prop: 'line-height', atteso: '18px', atlas: [A('CSS-0001', '2:1', ':root', 'line-height', '1.5'), A('CSS-0004', '3:39', 'button,input,select,textarea', 'font', 'inherit')], calcolo: 'l\'area eredita il `font` (quindi l\'interlinea 1.5 della radice): 12 px × 1.5' },
      // ── Casella (Q-08: faccia custom con la misura dell'Atlas)
      { id: 'CASELLA-L', dove: 'casella', prop: 'larghezza', atteso: '15px', atlas: A('CSS-0189', '9:2511', '.checkline input', 'width', '15px') },
      { id: 'CASELLA-A', dove: 'casella', prop: 'altezza', atteso: '15px', atlas: A('CSS-0189', '9:2511', '.checkline input', 'height', '15px') },
      // ── Chip (Q-12: la forma va sulle pastiglie degli allegati)
      { id: 'CHIP-RAGGIO', dove: 'chip', prop: 'border-top-left-radius', atteso: '6px', atlas: A('CSS-0214', '9:4727', '.chip', 'border-radius', '6px') },
      { id: 'CHIP-PAD-V', dove: 'chip', prop: 'padding-top', atteso: '4px', atlas: A('CSS-0214', '9:4727', '.chip', 'padding', '4px 7px', 0) },
      { id: 'CHIP-PAD-O', dove: 'chip', prop: 'padding-left', atteso: '7px', atlas: A('CSS-0214', '9:4727', '.chip', 'padding', '4px 7px', 1) },
      { id: 'CHIP-GAP', dove: 'chip', prop: 'gap', atteso: '6px', atlas: A('CSS-0214', '9:4727', '.chip', 'gap', '6px') },
      { id: 'CHIP-TESTO', dove: 'chip', prop: 'font-size', atteso: '11px', atlas: A('CSS-0214', '9:4727', '.chip', 'font-size', '10px'), decisione: 'Q-06: testo mai sotto gli 11 px' },
      { id: 'CHIP-X-TESTO', dove: 'chipX', prop: 'font-size', atteso: '13px', atlas: A('CSS-0215', '9:4882', '.chip button', 'font-size', '13px') },
      { id: 'CHIP-X-PAD', dove: 'chipX', prop: 'padding-left', atteso: '3px', atlas: A('CSS-0215', '9:4882', '.chip button', 'padding', '0px 3px', 1) },
      { id: 'CHIP-X-MIN', dove: 'chipX', prop: 'min-width', atteso: '20px', atlas: A('CSS-0215', '9:4882', '.chip button', 'min-width', '20px') },
      // ── Scheda-scelta (`.well` + stato premuto)
      { id: 'SCELTA-PAD', dove: 'scelta', prop: 'padding-left', atteso: '16px', atlas: A('CSS-0220', '9:5359', '.well', 'padding', '16px') },
      { id: 'SCELTA-RAGGIO', dove: 'scelta', prop: 'border-top-left-radius', atteso: '10px', atlas: A('CSS-0220', '9:5359', '.well', 'border-radius', '10px') },
      { id: 'SCELTA-TITOLO', dove: 'sceltaTitolo', prop: 'color', atteso: { token: '--talos-accent-text' }, atlas: [A('CSS-0173', '9:1302', '.demo button[aria-pressed=true]:not(.switch)', 'color', 'var(--accent-text)'), A('CSS-0001', '2:1', ':root', '--accent-text', 'var(--talos-accent-text,#f0c783)')], calcolo: '`--accent-text` è l\'alias Atlas di `--talos-accent-text`' },
      // ── Barra degli strumenti (`.toolbar-demo`)
      { id: 'BARRA-GAP', dove: 'barra', prop: 'gap', atteso: '7px', atlas: A('CSS-0375', '11:2490', '.toolbar-demo', 'gap', '7px') },
      { id: 'BARRA-CAMPO-CRESCE', dove: 'barraCampo', prop: 'flex-grow', atteso: '1', atlas: A('CSS-0376', '11:2559', '.toolbar-demo .input-wrap', 'flex-grow', '1') },
      { id: 'BARRA-CAMPO-MIN', dove: 'barraCampo', prop: 'min-width', atteso: '160px', atlas: A('CSS-0376', '11:2559', '.toolbar-demo .input-wrap', 'min-width', '160px') },
    ],
  },
  /*
   * F2 — NOTE (voci `NotesScreen`, `NoteCard`, `NoteEditor`; `source/atlas.js:36-37, 146-148`). Il campione è la sezione
   * Note VERA del laboratorio coi suoi dati di prova (`lab/fixtures/note.js`): la nota «nota-cache» aperta nel dettaglio,
   * e il modulo «Nuova nota» per l'editor. `sel` = selettore dentro la sezione. `NS` = la radice della sezione Note.
   */
  F2: {
    campione: 'SezioneNote_dettaglio',
    righe: [
      { id: 'NOTE-TESTA-H2', sel: 'NS .td-intro h2', prop: 'font-size', atteso: '22px', atlas: A('CSS-0347', '11:143', '.page-demo>header h2', 'font-size', '22px') },
      { id: 'NOTE-TESTA-H2-PESO', sel: 'NS .td-intro h2', prop: 'font-weight', atteso: '550', atlas: A('CSS-0347', '11:143', '.page-demo>header h2', 'font-weight', '550') },
      { id: 'NOTE-TESTA-H2-SOTTO', sel: 'NS .td-intro h2', prop: 'margin-bottom', atteso: '4px', atlas: A('CSS-0347', '11:143', '.page-demo>header h2', 'margin-bottom', '4px') },
      { id: 'NOTE-TESTA-FRASE', sel: 'NS .td-intro p:not([role="status"])', prop: 'font-size', atteso: '11px', atlas: A('CSS-0348', '11:213', '.page-demo>header p', 'font-size', '11px') },
      { id: 'NOTE-TESTA-SOTTO', sel: 'NS .td-intro', prop: 'margin-bottom', atteso: '18px', atlas: A('CSS-0346', '11:35', '.page-demo>header', 'margin-bottom', '18px') },
      { id: 'NOTE-TESTA-GAP', sel: 'NS .td-intro', prop: 'column-gap', atteso: '18px', atlas: A('CSS-0346', '11:35', '.page-demo>header', 'gap', '18px') },
      { id: 'NOTE-BARRA-GAP', sel: 'NS .td-toolbar', prop: 'column-gap', atteso: '8px', atlas: A('CSS-0349', '11:267', '.page-demo .page-tools', 'gap', '8px') },
      { id: 'NOTE-BARRA-SOPRA', sel: 'NS .td-toolbar', prop: 'margin-top', atteso: '14px', atlas: A('CSS-0349', '11:267', '.page-demo .page-tools', 'margin', '14px 0px', 0) },
      { id: 'NOTE-CERCA-MIN', sel: 'NS .td-search', prop: 'min-width', atteso: '170px', atlas: A('CSS-0350', '11:359', '.page-demo .page-tools .input-wrap', 'min-width', '170px') },
      { id: 'NOTE-GRIGLIA-GAP', sel: 'NS .td-grid', prop: 'row-gap', atteso: '12px', atlas: A('CSS-0351', '11:417', '.page-demo .page-grid', 'gap', '12px') },
      { id: 'NOTE-CARD-PAD', sel: 'NS .td-card .td-card-open', prop: 'padding-top', atteso: '13px', atlas: A('CSS-0235', '9:6398', '.file-card', 'padding', '13px') },
      { id: 'NOTE-CARD-RAGGIO', sel: 'NS .td-card', prop: 'border-top-left-radius', atteso: '10px', atlas: A('CSS-0235', '9:6398', '.file-card', 'border-radius', '10px') },
      { id: 'NOTE-CARD-TITOLO', sel: 'NS .td-card h3', prop: 'font-size', atteso: '12px', atlas: A('CSS-0224', '9:5572', '.demo h4', 'font-size', '12px') },
      { id: 'NOTE-CARD-TITOLO-PESO', sel: 'NS .td-card h3', prop: 'font-weight', atteso: '550', atlas: A('CSS-0224', '9:5572', '.demo h4', 'font-weight', '550') },
      { id: 'NOTE-CARD-TITOLO-SOPRA', sel: 'NS .td-card h3', prop: 'margin-top', atteso: '12px', atlas: A('CSS-0237', '9:6617', '.file-card h4', 'margin', '12px 0px 6px', 0) },
      { id: 'NOTE-ESTRATTO-TESTO', sel: 'NS .td-card .td-excerpt', prop: 'font-size', atteso: '11px', atlas: A('CSS-0241', '9:7068', '.note-card .note-excerpt', 'font-size', '11px') },
      { id: 'NOTE-ESTRATTO-INTERLINEA', sel: 'NS .td-card .td-excerpt', prop: 'line-height', atteso: '18.7px', atlas: A('CSS-0241', '9:7068', '.note-card .note-excerpt', 'line-height', '1.7'), calcolo: '11 px × 1.7' },
      { id: 'NOTE-ESTRATTO-RIGHE', sel: 'NS .td-card .td-excerpt', prop: '-webkit-line-clamp', atteso: '3', atlas: A('CSS-0241', '9:7068', '.note-card .note-excerpt', '-webkit-line-clamp', '3') },
      { id: 'NOTE-ESTRATTO-SOPRA', sel: 'NS .td-card .td-excerpt', prop: 'margin-top', atteso: '7px', atlas: A('CSS-0241', '9:7068', '.note-card .note-excerpt', 'margin-top', '7px') },
      { id: 'NOTE-ESTRATTO-CONTINUO', sel: 'NS .td-card .td-excerpt', prop: 'white-space-collapse', atteso: 'collapse', atlas: A('CSS-0241', '9:7068', '.note-card .note-excerpt', 'white-space', ''), calcolo: 'l\'Atlas non dichiara `white-space`: vale `normal`, cioè gli a capo collassano in spazi (review 24/09 sera)' },
      { id: 'NOTE-PIEDE-SOPRA', sel: 'NS .td-card .td-card-bottom', prop: 'margin-top', atteso: '12px', atlas: A('CSS-0239', '9:6811', '.file-card footer', 'margin-top', '12px') },
      { id: 'NOTE-PIEDE-TESTO', sel: 'NS .td-card .td-card-bottom', prop: 'font-size', atteso: '11px', atlas: A('CSS-0239', '9:6811', '.file-card footer', 'font-size', '9px'), decisione: 'Q-06: testo mai sotto gli 11 px' },
      { id: 'NOTE-PIEDE-FILO', sel: 'NS .td-card .td-card-bottom', prop: 'padding-top', atteso: '0px', atlas: A('CSS-0243', '9:7308', '.note-card footer', 'padding-top', '0px') },
      { id: 'NOTE-APERTA-FONDO', sel: 'NS .td-card[data-selected="true"]', prop: 'background-color', atteso: { token: '--talos-accent-soft' }, atlas: A('CSS-0236', '9:6567', '.file-card.selected', 'background', 'var(--accent-soft)'), calcolo: 'il fondo d\'accento: l\'Atlas lo mescola al 12 % sul pannello (CSS-0001), il prodotto usa il suo token `--talos-accent-soft` — nessuna seconda palette' },
      { id: 'NOTE-DETT-RAGGIO', sel: 'NS .td-detail', prop: 'border-top-left-radius', atteso: '11px', atlas: A('CSS-0353', '11:625', '.page-demo .page-detail', 'border-radius', '11px') },
      { id: 'NOTE-DETT-BORDO', sel: 'NS .td-detail', prop: 'border-top-width', atteso: '1px', atlas: A('CSS-0353', '11:625', '.page-demo .page-detail', 'border', '1px solid var(--line)', 0) },
      { id: 'NOTE-DETT-TESTA-SOTTO', sel: 'NS .td-detail-head', prop: 'padding-bottom', atteso: '14px', atlas: A('CSS-0354', '11:751', '.page-detail header', 'padding-bottom', '14px') },
      { id: 'NOTE-DETT-ETICHETTA', sel: 'NS .td-detail-head > span:first-child', prop: 'font-size', atteso: '11px', atlas: A('CSS-0116', '7:3728', '.section-label', 'font-size', '10px'), decisione: 'Q-06: testo mai sotto gli 11 px' },
      { id: 'NOTE-DETT-ETICHETTA-MAIUSCOLA', sel: 'NS .td-detail-head > span:first-child', prop: 'text-transform', atteso: 'uppercase', atlas: A('CSS-0116', '7:3728', '.section-label', 'text-transform', 'uppercase') },
      { id: 'NOTE-DETT-ETICHETTA-SPAZIO', sel: 'NS .td-detail-head > span:first-child', prop: 'letter-spacing', atteso: '1.32px', atlas: A('CSS-0116', '7:3728', '.section-label', 'letter-spacing', '0.12em'), calcolo: '0.12 em su 11 px' },
      // L'editor: il modulo «Nuova nota» del laboratorio
      { id: 'NOTE-ED-ETICHETTA', campione: 'SezioneNote_nuova', sel: 'NS .td-field-label', prop: 'font-size', atteso: '11px', atlas: A('CSS-0174', '9:1402', '.field-label', 'font-size', '11px') },
      { id: 'NOTE-ED-ETICHETTA-SOTTO', campione: 'SezioneNote_nuova', sel: 'NS .td-field-label', prop: 'margin-bottom', atteso: '7px', atlas: A('CSS-0174', '9:1402', '.field-label', 'gap', '7px'), calcolo: 'lo spazio fra la parola e il campo: nell\'Atlas è il `gap` della colonna, qui il margine sotto l\'etichetta' },
      { id: 'NOTE-ED-TITOLO-TESTO', campione: 'SezioneNote_nuova', sel: 'NS .td-edit-title', prop: 'font-size', atteso: '12px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'font-size', '12px') },
      { id: 'NOTE-ED-TITOLO-PAD', campione: 'SezioneNote_nuova', sel: 'NS .td-edit-title', prop: 'padding-left', atteso: '11px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'padding', '8px 11px', 1) },
      { id: 'NOTE-ED-TITOLO-ALTEZZA', campione: 'SezioneNote_nuova', sel: 'NS .td-edit-title', prop: 'altezza', atteso: '36px', atlas: A('CSS-0176', '9:1560', '.text-input,select,textarea', 'min-height', '36px') },
      { id: 'NOTE-ED-TESTO-MIN', campione: 'SezioneNote_nuova', sel: 'NS .td-edit-body', prop: 'min-height', atteso: '170px', atlas: A('CSS-0355', '11:908', '.page-detail textarea', 'min-height', '170px') },
      { id: 'NOTE-ED-TESTO-TESTO', campione: 'SezioneNote_nuova', sel: 'NS .td-edit-body', prop: 'font-size', atteso: '12px', atlas: A('CSS-0355', '11:908', '.page-detail textarea', 'font-size', '12px') },
      { id: 'NOTE-ED-TESTO-INTERLINEA', campione: 'SezioneNote_nuova', sel: 'NS .td-edit-body', prop: 'line-height', atteso: '21.6px', atlas: A('CSS-0355', '11:908', '.page-detail textarea', 'line-height', '1.8'), calcolo: '12 px × 1.8' },
    ],
  },
};
/* La radice della sezione Note nel laboratorio, per i selettori `NS …` di F2. */
const RADICI = { NS: '#schermoNote .td-section[data-section="note"]' };

/* Le fonti di una riga, sempre come elenco. */
const fonti = (riga) => [].concat(riga.atlas);

/*
 * I COMPONENTI DEL LABORATORIO — il vecchio elenco, ora con la famiglia del piano Atlas
 * (`.claude/ATLAS-PIANO-FAMIGLIE-2026-09-24.md`) e la voce dell'Atlas che ne è il riferimento.
 * ⛔ 23/09/2026: la riga `ProviderCard` è ritirata col suo laboratorio (il velo «Fornitori e accessi» è tolto dal
 *   prodotto); il contratto della card lo misura `tests/browser/lab-provider.spec.mjs` sulla scheda «Provider» vera.
 */
const COMPONENTI = [
  { nome: 'RuntimeCard', famiglia: 'F4', atlas: 'RuntimeCard', schermata: 'schermoModelLab', selettore: '#panel-runtime [data-c=RuntimeCard]' },
  { nome: 'MemoryMeter', famiglia: 'F4', atlas: 'MemoryMeter', schermata: 'schermoModelLab', selettore: '#panel-runtime [data-c=MemoryMeter]' },
  { nome: 'CatalogoModelli', famiglia: 'F4', atlas: 'ModelLabScreen', schermata: 'schermoModelLab', selettore: '#panel-catalogo' },
  { nome: 'FonteRicerca', famiglia: 'F6', atlas: 'SettingsScreen', schermata: 'schermoImpostazioni', selettore: '#setting-source-preview' },
  { nome: 'SettingsNav', famiglia: 'F6', atlas: 'SettingsScreen', schermata: 'schermoImpostazioni', selettore: '#schermoImpostazioni .talos-settings__nav' },
  { nome: 'SettingRow', famiglia: 'F6', atlas: 'SettingRow', schermata: 'schermoImpostazioni', selettore: '#schermoImpostazioni [data-settings-group=design]' },
  { nome: 'CheckCard', famiglia: 'F7e', atlas: 'CheckCard', schermata: 'schermoDoctor', selettore: '#schermoDoctor' },
  { nome: 'ExtensionList_skills', famiglia: 'F7b', atlas: 'CapabilityScreen', schermata: 'schermoCapability', selettore: '#schermoCapability', sezione: 'skills' },
  { nome: 'ExtensionList_mcp', famiglia: 'F7b', atlas: 'CapabilityScreen', schermata: 'schermoCapability', selettore: '#schermoCapability', sezione: 'mcp' },
  { nome: 'ExtensionList_plugins', famiglia: 'F7b', atlas: 'CapabilityScreen', schermata: 'schermoCapability', selettore: '#schermoCapability', sezione: 'plugins' },
  { nome: 'ExtensionList_hooks', famiglia: 'F7b', atlas: 'CapabilityScreen', schermata: 'schermoCapability', selettore: '#schermoCapability', sezione: 'hooks' },
  { nome: 'ToolList', famiglia: 'F7b', atlas: 'ToolList', schermata: 'schermoCapability', selettore: '#schermoCapability' },
  { nome: 'AutomationRow', famiglia: 'F7b', atlas: 'AutomationRow', schermata: 'schermoAutomazioni', selettore: '#schermoAutomazioni' },
  { nome: 'ForgeList', famiglia: 'F7b', atlas: 'ForgeList', schermata: 'schermoOfficina', selettore: '#schermoOfficina' },
  { nome: 'ReportRow', famiglia: 'F7b', atlas: 'ReportRow', schermata: 'schermoRicerca', selettore: '#schermoRicerca' },
  { nome: 'LibraryRow', famiglia: 'F3', atlas: 'LibraryRow', schermata: 'schermoLibreria', selettore: '#schermoLibreria' },
  { nome: 'TaskRow', famiglia: 'F7b', atlas: 'TaskRow', schermata: 'schermoAttivita', selettore: '#schermoAttivita' },
  { nome: 'MemoryRow', famiglia: 'F7b', atlas: 'MemoryRow', schermata: 'schermoMemoria', selettore: '#schermoMemoria' },
  { nome: 'Board', famiglia: 'F7c', atlas: 'BoardScreen', schermata: 'schermoBoard', selettore: '#schermoBoard' },
  { nome: 'SessionItem', famiglia: 'F7a', atlas: 'SessionItem', schermata: 'schermoChat', selettore: '.talos-sidebar' },
  { nome: 'NavItem', famiglia: 'F7a', atlas: 'NavItem', schermata: 'schermoChat', selettore: '.talos-sidebar' },
  { nome: 'WorkspaceFooter', famiglia: 'F7a', atlas: 'WorkspaceFooter', schermata: 'schermoChat', selettore: '.talos-sidebar' },
  { nome: 'Topbar', famiglia: 'F7a', atlas: 'Topbar', schermata: 'schermoChat', selettore: '#schermoChat .talos-topbar' },
  { nome: 'Conversazione', famiglia: 'F5', atlas: 'Conversation', schermata: 'schermoChat', selettore: '#schermoChat .talos-conversation' },
  { nome: 'ModelliInstallati', famiglia: 'F4', atlas: 'ModelLabScreen', schermata: 'schermoModelLab', selettore: '#panel-installati' },
  { nome: 'CatalogoHf', famiglia: 'F4', atlas: 'ModelLabScreen', schermata: 'schermoModelLab', selettore: '#panel-hf' },
  { nome: 'CodaDownload', famiglia: 'F4', atlas: 'DownloadQueue', schermata: 'schermoModelLab', selettore: '#panel-download' },
  { nome: 'Inspector', famiglia: 'F5', atlas: 'Inspector', schermata: 'schermoChat', selettore: '#inspectorSessione' },
  { nome: 'Terminale', famiglia: 'F7d', atlas: 'TerminalScreen', schermata: 'schermoTerminale', selettore: '#schermoTerminale .talos-terminal' },
  { nome: 'Browser', famiglia: 'F7d', atlas: 'BrowserScreen', schermata: 'schermoBrowser', selettore: '#schermoBrowser .talos-browser' },
  { nome: 'Inspector_processi', famiglia: 'F5', atlas: 'Inspector', schermata: 'schermoChat', selettore: '#railProcessi' },
  { nome: 'Toast', famiglia: 'F7f', atlas: 'Toast', schermata: 'schermoChat', selettore: '#regioneToast' },
  { nome: 'NotificationPanel', famiglia: 'F7f', atlas: 'NotificationPanel', schermata: 'schermoChat', selettore: '#pannelloNotifiche' },
  { nome: 'ChatFooter', famiglia: 'F5', atlas: 'ChatFooter', schermata: 'schermoChat', selettore: '#schermoChat .talos-chat-foot' },
  { nome: 'Review', famiglia: 'F7d', atlas: 'ReviewScreen', schermata: 'schermoReview', selettore: '#schermoReview' },
  { nome: 'EmptyState', famiglia: 'F5', atlas: 'EmptySessionScreen', schermata: 'schermoVuota', selettore: '#schermoVuota .talos-conversation' },
];

/* Le famiglie portate all'Atlas, e quindi con righe nel contratto: le altre sono `fixme`. */
const FAMIGLIE_PORTATE = new Set(Object.keys(CONTRATTO));

/** Il laboratorio senza lo stile che spegne le transizioni (serve a leggere `transition-property`). */
async function apriCampione(browser, viewport, nome) {
  const contesto = await browser.newContext({ viewport, colorScheme: 'dark', locale: 'it-IT' });
  await contesto.route(/fonts\.(googleapis|gstatic)\.com/, (rotta) => rotta.abort());
  const pagina = await contesto.newPage();
  await pagina.goto(`${LAB}/?componente=${nome}`, { waitUntil: 'load' });
  await pagina.waitForSelector('html[data-visual-ready="true"]');
  await pagina.evaluate(() => document.fonts.ready);
  return { contesto, pagina };
}

/* ═══════════════════════════════════ 1. IL RIFERIMENTO È L'ATLAS ═══════════════════════════════════ */
test.describe('riferimento Atlas', () => {
  test('ATLAS-RIF-01 · la copia di atlas.css è quella del pacchetto (impronta di CSS-ATLAS.json)', async ({}, info) => {
    test.skip(info.project.name !== 'desktop-1440x900', 'il riferimento non dipende dalla finestra: si prova una volta');
    const impronta = createHash('sha256').update(readFileSync(ATLAS_CSS)).digest('hex');
    expect(impronta, 'mockup/atlas/atlas.css non è più la copia del pacchetto Atlas').toBe(IMPRONTA_ATLAS);
  });

  test('ATLAS-RIF-02 · ogni valore del contratto è quello che l\'Atlas dichiara, alla riga e col selettore citati', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-1440x900', 'il riferimento non dipende dalla finestra: si prova una volta');
    const testo = readFileSync(ATLAS_CSS, 'utf8');
    const righeFile = testo.split('\n');
    const contesto = await browser.newContext();
    await contesto.route('**/*', (rotta) => (rotta.request().url().startsWith('data:') ? rotta.continue() : rotta.abort()));
    const pagina = await contesto.newPage();
    await pagina.setContent(`<!doctype html><style id="atlas">${testo}</style>`);
    const norma = (s) => s.replace(/\s+/g, '').replace(/["']/g, '');
    const errori = [];
    let fontiLette = 0;
    for (const [famiglia, { righe }] of Object.entries(CONTRATTO)) {
      for (const riga of righe) {
        for (const f of fonti(riga)) {
          // a) la citazione: a riga:colonna comincia proprio quel selettore
          const [l, c] = f.pos.split(':').map(Number);
          if (!righeFile[l - 1]?.slice(c - 1).startsWith(`${f.sel}{`)) errori.push(`${famiglia}/${riga.id}: ${f.id} non comincia a ${f.pos} con «${f.sel}{»`);
          // b) il valore: la regola (fuori dalle @media) lo dichiara
          const letto = await pagina.evaluate(({ sel, prop }) => {
            const n = (s) => s.replace(/\s+/g, '').replace(/["']/g, '');
            const regole = [...document.getElementById('atlas').sheet.cssRules].filter((r) => r instanceof CSSStyleRule && n(r.selectorText) === n(sel));
            const conValore = regole.map((r) => r.style.getPropertyValue(prop).trim()).filter((v) => v !== '');
            return { regole: regole.length, valore: conValore.length ? conValore.at(-1) : '' };
          }, { sel: f.sel, prop: f.prop });
          fontiLette += 1;
          if (!letto.regole) { errori.push(`${famiglia}/${riga.id}: nessuna regola «${f.sel}» nell'Atlas`); continue; }
          if (letto.valore !== f.valore) errori.push(`${famiglia}/${riga.id}: ${f.id} ${f.sel} { ${f.prop} } dichiara «${letto.valore}», il contratto dice «${f.valore}»`);
        }
        // c) senza decisione né calcolo, l'atteso È il valore dell'Atlas
        if (!riga.decisione && !riga.calcolo) {
          const [f] = fonti(riga);
          const pezzi = f.valore.split(/\s+/);
          const pezzo = f.parte === undefined ? f.valore : pezzi[f.parte] ?? pezzi[0];
          const atteso = typeof riga.atteso === 'string' ? riga.atteso : JSON.stringify(riga.atteso);
          if (norma(pezzo) !== norma(atteso)) errori.push(`${famiglia}/${riga.id}: atteso «${atteso}» ma l'Atlas dice «${pezzo}» e la riga non porta né decisione né calcolo`);
        }
        if (riga.decisione && !/^Q-\d+/.test(riga.decisione)) errori.push(`${famiglia}/${riga.id}: una decisione nomina la sua domanda (Q-nn)`);
      }
    }
    await contesto.close();
    // Zero fonti lette non è un verde: il contratto deve esistere.
    expect(fontiLette, 'il contratto non ha fonti da leggere').toBeGreaterThan(0);
    expect(errori, errori.join('\n')).toEqual([]);
  });
});

/* ═══════════════════════════════════ 2. IL PRODOTTO SEGUE IL CONTRATTO ═══════════════════════════════════ */
test.describe('prodotto ↔ contratto Atlas', () => {
  for (const [famiglia, { campione: diSerie, righe: tutte }] of Object.entries(CONTRATTO)) for (const campione of [...new Set(tutte.map((r) => r.campione || diSerie))]) {
    const righe = tutte.filter((r) => (r.campione || diSerie) === campione);
    test(`ATLAS-${famiglia} · il campione «${campione}» del laboratorio ha i valori del contratto (${righe.length} righe)`, async ({ browser }, info) => {
      const { contesto, pagina } = await apriCampione(browser, info.project.use.viewport, campione);
      const misure = {};
      for (const riga of righe) {
        const sel = riga.sel ? riga.sel.replace(/^(\w+) /, (_, r) => `${RADICI[r]} `) : `[data-s="${riga.dove}"]`;
        if (riga.fuoco) await pagina.locator(sel).focus(); else await pagina.evaluate(() => document.activeElement?.blur?.());
        misure[riga.id] = await pagina.evaluate(({ sel, prop, token }) => {
          const el = document.querySelector(sel);
          if (!el) return { manca: true };
          const r = el.getBoundingClientRect();
          const valore = prop === 'altezza' ? `${Math.round(r.height * 100) / 100}px` : prop === 'larghezza' ? `${Math.round(r.width * 100) / 100}px` : getComputedStyle(el).getPropertyValue(prop).trim();
          let risolto = null;
          if (token) { const s = document.createElement('span'); s.style.setProperty('color', `var(${token})`); document.body.append(s); risolto = getComputedStyle(s).color; s.remove(); }
          return { valore, risolto };
        }, { sel, prop: riga.prop, token: typeof riga.atteso === 'object' ? riga.atteso.token : null });
      }
      await contesto.close();
      const scarti = righe.flatMap((riga) => {
        const m = misure[riga.id];
        if (m.manca) return [`${riga.id}: il campione non ha ${riga.sel || `[data-s="${riga.dove}"]`}`];
        const atteso = typeof riga.atteso === 'object' ? m.risolto : riga.atteso;
        return m.valore === atteso ? [] : [`${riga.id} (${fonti(riga).map((f) => `${f.id} ${f.sel} ${f.prop}`).join(' + ')}${riga.decisione ? ` · ${riga.decisione}` : ''}): «${m.valore}», atteso «${atteso}»`];
      });
      expect(scarti, scarti.join('\n')).toEqual([]);
    });
  }

  for (const comp of COMPONENTI) {
    if (FAMIGLIE_PORTATE.has(comp.famiglia)) continue;
    test.fixme(`ATLAS ${comp.famiglia} · ${comp.nome} ↔ voce Atlas «${comp.atlas}» — famiglia non ancora portata`, async () => {});
  }
});

/* ═══════════════════════════════════ 3. LE GUARDIE DI SEMPRE ═══════════════════════════════════ */
/*
 * I controlli di comportamento del vecchio cancello, con lo stesso nome, sul SOLO laboratorio: nessuno di loro
 * confrontava qualcosa col mockup. Cambia UNA cosa, dichiarata: ATTIVITA-CAMPO-COERENTE pretendeva l'altezza 36 del campo
 * della 0.1.15; il campo di ricerca delle Attività ha la lente, e il campo con la lente dell'Atlas è alto 38 (riga
 * LENTE-ALTEZZA del contratto: CSS-0176 + CSS-0179). E UNA si aggiunge: CAP-TASTIERA-INIZIO (il vecchio premeva Home
 * senza guardare dove finiva il fuoco).
 */
const GUARDATI = new Set(['CatalogoModelli', 'ExtensionList_skills', 'ExtensionList_mcp', 'ExtensionList_plugins', 'ExtensionList_hooks', 'AutomationRow', 'TaskRow', 'ToolList', 'Conversazione', 'Inspector']);

test.describe('guardie del laboratorio', () => {
  for (const comp of COMPONENTI.filter((c) => GUARDATI.has(c.nome))) {
    test(`GUARDIE ${comp.nome}`, async ({ browser }, info) => {
      const { contesto, pagina: a } = await apri(browser, `${LAB}/?componente=${comp.nome}`, { viewport: info.project.use.viewport });
      await a.waitForSelector('html[data-visual-ready="true"]');
      await mostra(a, comp.schermata);
      if (comp.nome === 'CatalogoModelli') {
        await a.evaluate(() => { for (const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]')) n.hidden = n.id !== 'panel-catalogo'; });
        expect(await a.locator('[data-catalog-detail] .talos-kv__k').nth(3).evaluate((n) => n.getBoundingClientRect().width), 'CAT-ETICHETTA-INTEGRA').toBeGreaterThanOrEqual(90);
      }
      if (comp.sezione) {
        await expect(a.locator(`#capPanel-${comp.sezione} [data-ext-detail] .talos-kv__k`).first(), 'EXT-ETICHETTE-INTEGRE').toHaveCSS('white-space', 'normal');
        expect(await a.locator(`${comp.selettore} use`).evaluateAll((ns) => ns.every((n) => document.querySelector(n.getAttribute('href')))), 'EXT-ICONA-ESISTENTE').toBe(true);
      }
      if (comp.nome === 'AutomationRow') {
        await expect(a.locator('[data-auto-stato]').first(), 'AUT-FILTRO-STILE-CANONICO').toHaveClass(/\btalos-tabs__tab\b/);
        expect(await a.locator('#schermoAutomazioni [role="switch"]').last().evaluate((n) => n.getBoundingClientRect().bottom <= innerHeight), 'AUT-DENSITA-COMANDI').toBe(true);
      }
      if (comp.nome === 'TaskRow') {
        // ATTIVITA-CAMPO-COERENTE: il campo delle Attività ha lo stile canonico — oggi quello dell'Atlas con la lente (38).
        await expect(a.locator('[data-task-query]'), 'ATTIVITA-CAMPO-COERENTE').toHaveCSS('height', '38px');
      }
      if (comp.nome === 'ToolList') {
        expect(await a.locator('[data-cap-list] .talos-measure--estimate').allTextContents(), 'CAP-STIMA-PREFISSO').not.toEqual(expect.arrayContaining([expect.stringMatching(/^~/)]));
        await a.locator('[data-cap-list] [role=option]').first().focus();
        await a.keyboard.press('End');
        await expect(a.locator('[data-cap-list] [role=option]').last(), 'CAP-TASTIERA-FINE').toBeFocused();
        expect(await a.locator('[data-cap-list]').evaluate((n) => n.getBoundingClientRect().height), 'CAP-LISTA-LUNGA').toBeLessThanOrEqual(480);
        await a.keyboard.press('Home');
        await expect(a.locator('[data-cap-list] [role=option]').first(), 'CAP-TASTIERA-INIZIO').toBeFocused();
      }
      if (comp.nome === 'Conversazione') {
        /* ⛔ 25/09/2026 — questa guardia era rimasta indietro di un giorno. Il 24/09 l'owner, con la foto del 4174 davanti
           (due anelli che giravano uno sopra l'altro), ha voluto l'orb in UN posto solo: la testata del messaggio TALOS
           (`creaMessaggioTalos`, conversazione.js:184, `2c500bb06`); la bolla d'attesa tiene solo la riga onesta (`creaAttesa`,
           conversazione.js:1238-1241). La guardia pretendeva ancora l'orb DENTRO la bolla ed era rossa prima di ATLAS (A/B
           del 25/09, lato 0254a7876). ⇒ Dice le due cose vere: l'orb vivo sta nella testata, e nella bolla non c'è. */
        await expect(a.locator('#schermoChat .talos-message__head .talos-orb.working'), 'ORB-VIVO').not.toHaveCount(0);
        await expect(a.locator('#schermoChat .talos-waiting__row .talos-orb'), 'ORB-UNICO').toHaveCount(0);
        await expect(a.locator('#schermoChat .talos-waiting__row .talos-line-loader'), 'ORB-NIENTE-SEGNAVIA').toHaveCount(0);
      }
      if (comp.nome === 'Inspector') {
        expect(await a.evaluate(() => {
          const riga = [...document.querySelectorAll('#railContesto .talos-kv')].find((n) => n.querySelector('.talos-kv__k')?.textContent === 'Riusato dalla cache');
          return riga ? { chiave: riga.querySelector('.talos-kv__k')?.textContent, valore: riga.querySelector('.talos-kv__v')?.textContent } : null;
        }), 'BC48-CACHE-NON-MISURATA').toEqual({ chiave: 'Riusato dalla cache', valore: 'non misurato' });
      }
      await contesto.close();
    });
  }
});
