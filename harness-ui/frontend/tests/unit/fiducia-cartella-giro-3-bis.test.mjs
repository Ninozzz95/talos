/*
 * Fiducia della cartella, giro 3-bis (owner 11/11/2026 16:35, giudice v1491): su un disco intero o sulla cartella utente la carta offre
 *   «Mi fido solo per questa conversazione» / «Trust for this conversation only», e la risposta va alla rotta con `soloPerLaConversazione`
 *   (la conversazione sola, in memoria: mai nel file). Alla nascita su quelle cartelle non c'è una fiducia da salvare: niente carta, la
 *   conversazione nasce trattenuta e la carta a conversazione aperta fa la domanda. Come Claude Code (`CHANGELOG.md:8474`, `:4739`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { creaDomandaFiducia, creaVoceFiducia, fiduciaDa, testiCartaFiducia } from '../../src/components/fiducia-cartella.js';

const pausa = () => new Promise((r) => { setTimeout(r, 0); });
const DA_CHIEDERE = { sessionId: 's1', fiduciaDaChiedere: true, pienoTrattenuto: true, soloConversazione: true };

function finestra({ soloPerLaConversazione }) {
  const doc = documento();
  const carte = [];
  const salvate = [];
  const domanda = creaDomandaFiducia({ document: doc,
    leggi: async () => ({ cartella: 'C:\\', fidata: null, ...(soloPerLaConversazione ? { soloPerLaConversazione: true } : {}) }),
    salva: async (id, si, opzioni) => { salvate.push([id, si, opzioni]); return { fidata: si }; },
    metti: (scheda) => { doc.body.append(scheda); carte.push(scheda); } });
  return { domanda, carte, salvate };
}

for (const [lingua, si] of [['it', 'Mi fido solo per questa conversazione'], ['en', 'Trust for this conversation only']]) {
  test(`3-BIS ROSSA (${lingua}) — sul disco intero la carta offre la scelta solo per questa conversazione e la manda alla rotta`, async () => {
    impostaLingua(lingua);
    const f = finestra({ soloPerLaConversazione: true });
    await f.domanda.chiedi({ sessionId: 's1', fiducia: DA_CHIEDERE });
    assert.equal(f.carte.length, 1);
    assert.equal(f.carte[0].querySelector('[data-fiducia-si]').textContent, si);
    assert.ok(Object.hasOwn(f.carte[0].dataset, 'fiduciaSoloQui'));
    assert.ok(f.carte[0].textContent.includes(t('chat.trust.plainWide')), 'la carta dice che qui la fiducia non si salva');
    assert.ok(f.carte[0].textContent.includes('C:\\'), 'e nomina il disco');
    clic(f.carte[0].querySelector('[data-fiducia-si]'));
    await pausa(); await pausa();
    assert.deepEqual(f.salvate, [['s1', true, { soloSeMaiChiesta: true, soloPerLaConversazione: true }]]);
  });
}

test('3-BIS — su una cartella normale la carta resta quella di prima (Sì per la cartella, senza la bandiera)', async () => {
  impostaLingua('it');
  const f = finestra({ soloPerLaConversazione: false });
  await f.domanda.chiedi({ sessionId: 's1', fiducia: { sessionId: 's1', fiduciaDaChiedere: true, pienoTrattenuto: true } });
  assert.equal(f.carte[0].querySelector('[data-fiducia-si]').textContent, t('chat.trust.yes'));
  assert.equal(Object.hasOwn(f.carte[0].dataset, 'fiduciaSoloQui'), false);
  clic(f.carte[0].querySelector('[data-fiducia-si]'));
  await pausa(); await pausa();
  assert.deepEqual(f.salvate, [['s1', true, { soloSeMaiChiesta: true }]]);
});

test('3-BIS — testi nelle due lingue, la voce del velo e lo stato dall\'istantanea', () => {
  impostaLingua('en');
  const en = testiCartaFiducia({ soloQui: true });
  impostaLingua('it');
  const it = testiCartaFiducia({ soloQui: true });
  assert.notEqual(en.si, it.si);
  assert.match(en.perche, /never saves trust here/u);
  assert.match(it.perche, /non salva mai la fiducia/u);
  const doc = documento();
  const voce = creaVoceFiducia(doc, { soloQui: true, onFidati: () => {} });
  assert.match(voce.textContent, /Mi fido solo per questa conversazione/u);
  assert.equal(fiduciaDa('s1', { fiduciaDaChiedere: true, fiduciaSoloConversazione: true }).soloConversazione, true);
  assert.equal(Object.hasOwn(fiduciaDa('s1', { fiduciaDaChiedere: true }), 'soloConversazione'), false, 'la forma di prima resta uguale');
});

test('3-BIS — app.js: alla nascita su un disco intero niente carta; la voce del velo manda la bandiera', () => {
  const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const nascita = APP.slice(APP.indexOf('async function chiediFiduciaDellaCartella('), APP.indexOf('async function chiediFiduciaDellaCartella(') + 1600);
  assert.match(nascita, /if \(letta\?\.soloPerLaConversazione === true\) return true;/u);
  assert.match(APP, /apiPost\('\/api\/v1\/folder-trust', \{ sessionId, fidata: true, \.\.\.\(fiducia\.soloConversazione \? \{ soloPerLaConversazione: true \} : \{\}\) \}\)/u);
  assert.match(APP, /creaVoceFiducia\(document, \{ soloQui: fiducia\.soloConversazione === true, onFidati:/u);
});
