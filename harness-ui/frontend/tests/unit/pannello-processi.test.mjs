/*
 * PANNELLO v2 — la scheda PROCESSI, il modello PURO (PROVE.md U-05, U-10, U-16) sui dati di prova del kit, più i casi limite.
 * Il disegno (righe, «Ferma tutti», pagine, chip della porta) si prova nel browser: `tests/browser/pannello-processi.spec.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { impostaLingua } from '../../src/components/lingua.js';
import { modelloProcessi, contoProcessi, TETTO } from '../../src/components/pannello/processi.js';
import { contaProcessiAttivi } from '../../src/components/inspector.js';
import { creaStato, aggiungiMolti } from '../fixtures/pannello-dati.mjs';

const ADESSO = Date.parse('2026-10-29T15:00:00Z');
const S = creaStato(ADESSO);

test('PANNELLO-U05 — chi tace da ≥60 s sale in attenzione (M-02, M-03); «in sfondo» mai; il consenso in attenzione ma non nel numero', () => {
  impostaLingua('it');
  const pr = S.processi.map((p) => (p.id === 'tc-watch' ? { ...p, fermoDaMs: 61_000 } : p));
  const m = modelloProcessi({ processi: [...pr, { id: 'tc-cons', comando: 'rm -rf build', stato: 'in-consenso', chi: 'agente', giro: 13 }], risorse: S.risorse, porte: S.porte, adesso: ADESSO });
  assert.deepEqual(m.attenzione.map((r) => r.id).sort(), ['tc-cons', 'tc-watch']);
  assert.equal(contoProcessi({ processi: pr }).numero, 3);
  assert.equal(m.righe.find((r) => r.id === 'tc-dev').porte[0].porta, 5173);
  const sotto = modelloProcessi({ processi: [{ id: 'x', comando: 'npm run dev', stato: 'in-sfondo', fermoDaMs: 999_999 }] });
  assert.equal(sotto.attenzione.length, 0, '«in sfondo» non è mai «fermo» (BUG-14)');
  const giusto59 = modelloProcessi({ processi: [{ id: 'y', comando: 'x', stato: 'in-corso', fermoDaMs: 59_999 }] });
  assert.equal(giusto59.attenzione.length, 0, 'sotto la soglia di 60 s non si accusa nessuno');
});

test('PANNELLO-PROCESSI — il numero sulla scheda è quello di oggi (`contaProcessiAttivi`): un id una volta sola, il consenso fuori', () => {
  const lista = [...S.processi, S.processi[0], { id: 'c', comando: 'x', stato: 'in-consenso' }];
  assert.equal(contoProcessi({ processi: lista }).numero ?? 0, contaProcessiAttivi(lista));
  assert.deepEqual(contoProcessi({ processi: [] }), { numero: null, attenzione: 0, descrizione: '' }, 'a zero niente numero (U-10)');
});

test('PANNELLO-U16 — il filtro per stato elenca SOLO gli stati presenti (M-17), in più e non al posto di Accesi/Finiti/Tutti', () => {
  const sorgente = readFileSync(new URL('../../src/components/pannello/processi.js', import.meta.url), 'utf8');
  assert.match(sorgente, /statiPresenti = \[\.\.\.new Set\(m\.righe\.map/u, 'il menu nasce dagli stati delle righe, non da tutta la tabella');
  assert.ok(sorgente.includes("'pannello.processi.tuttiGliStati'"));
});

test('PANNELLO-PROCESSI-LIMITI — vuoto, uno, tantissimi, comando lunghissimo e con caratteri strani, dati rotti, porte e risorse assenti', () => {
  assert.equal(modelloProcessi({}).righe.length, 0);
  assert.equal(modelloProcessi({ processi: [S.processi[0]] }).righe.length, 1);
  const molti = structuredClone(S);
  aggiungiMolti(molti, ADESSO);
  assert.ok(modelloProcessi({ processi: molti.processi }).righe.length >= 40, 'oltre il tetto di oggi (40): ci si arriva con le pagine');
  assert.equal(TETTO, 40);
  const strano = modelloProcessi({ processi: [{ id: 'z', comando: `node "C:\\Program Files\\nodejs\\a b.js" --titolo="📊 <b>x</b>" ${'-x '.repeat(400)}`, stato: 'in-corso' }] });
  assert.ok(strano.righe[0].nome.includes('<b>x</b>'), 'il comando resta testo intero (si tronca a schermo, non nel modello)');
  const rotti = modelloProcessi({ processi: [null, { id: 'q', stato: 'stato-inventato' }] });
  assert.equal(rotti.righe[0].stato, 'in-corso', 'uno stato sconosciuto ricade su quello di oggi (`statoProcesso`), non rompe');
  const senza = modelloProcessi({ processi: [{ id: 'v', comando: 'x', stato: 'in-corso' }], risorse: null, porte: null });
  assert.equal(senza.righe[0].cpu, null, 'senza risorse nessun numero (P-03)');
  assert.deepEqual(senza.righe[0].porte, [], 'senza P-05 nessuna porta (niente di inventato)');
});
