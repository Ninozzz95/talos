/*
 * FE-058, owner 02/11/2026: «Strumenti» ovunque al posto di «attrezzi»; il «+» del compositore apre le «Aggiunte», i pannelli
 * dell'interfaccia sono «Pannelli», così «strumenti» vuol dire solo gli strumenti del modello. Anche l'inglese si allinea.
 * Valgono le frasi a schermo: non i segnaposto come {attrezzo}, non le chiavi, non gli identificatori.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TESTI } from '../../src/i18n/testi/index.js';

const SEGNAPOSTO = /\{[^{}]*\}/g;
const it = Object.entries(TESTI.it).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v.replace(SEGNAPOSTO, '')]);

test('FE-058 nessuna frase italiana dice più la parola vecchia', () => {
  assert.deepEqual(it.filter(([, v]) => /attrezz/iu.test(v)).map(([k]) => k), []);
});

test('FE-058 nessun articolo è rimasto quello della parola vecchia', () => {
  const sbagliate = /\b(?:l|dell|all|nell|sull|quell)['’]\s?strument|\b(?:un|nessun|ad) strument/iu;
  assert.deepEqual(it.filter(([, v]) => sbagliate.test(v)).map(([k]) => k), []);
});

test('FE-058 le frasi tipo del censimento', () => {
  assert.equal(TESTI.it['app.board.tools.noneOffered'], 'Nessuno strumento offerto al modello in questa configurazione.');
  assert.equal(TESTI.it['app.status.toolRunning'], 'Strumento in corso');
  assert.equal(TESTI.it['app.permissions.toolUpdated'], 'Permesso per strumento aggiornato');
  assert.equal(TESTI.it['modello.sidebar.toolWorkshop'], 'Officina strumenti');
  assert.equal(TESTI.it['modello.modelPicker.filter.attrezzi'], 'Usa gli strumenti');
});

test('FE-058 i segnaposto e le chiavi non si toccano', () => {
  assert.match(TESTI.it['app.approval.whyToolGate'], /\{attrezzo\}/);
  assert.match(TESTI.it['app.board.mcp.serverLine'], /\{attrezzi\}/);
});

test('FE-058 il «+» apre le Aggiunte e i pannelli sono Pannelli, nelle due lingue', () => {
  assert.equal(TESTI.it['impostazioni.fieldHelp.composerPlusSelect'], 'Mostra le aggiunte in un cassetto o in un menu.');
  assert.equal(TESTI.en['impostazioni.fieldHelp.composerPlusSelect'], 'Show add-ons in a drawer or a menu.');
  assert.equal(TESTI.it['impostazioni.fieldHelp.windowPresentationSelect'], 'Apri i pannelli di lato o a schermo intero.');
  assert.equal(TESTI.en['impostazioni.fieldHelp.windowPresentationSelect'], 'Open panels to the side or full screen.');
  for (const k of ['impostazioni.field.windowPresentationSelect.title', 'modello.settings.toolPanels', 'modello.frammenti.aspetto.toolPanels']) {
    assert.equal(TESTI.it[k], 'Pannelli', k);
    assert.equal(TESTI.en[k], 'Panels', k);
  }
});

test('FE-058 anche il modello della pagina, testo e suggerimenti, ma non gli identificatori', () => {
  const pagina = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
  const visibili = [...pagina.matchAll(/>([^<>]*)</g)].map((m) => m[1]).concat([...pagina.matchAll(/\b(?:title|aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1]));
  assert.deepEqual(visibili.filter((t) => /\battrezz/iu.test(t.replace(SEGNAPOSTO, ''))), []);
  assert.match(pagina, /id="veloPermessiAttrezzi"/, 'gli id restano');
});
