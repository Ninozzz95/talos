/*
 * BLOCCHI-IMP — la riga «Blocchi vivi nelle risposte» / «Live blocks in replies» in Impostazioni → Chat (decisione 140, 04/11/2026), e la
 * scheda delle capacità senza la riga del computer use (richiesta del Computer use, 3a: la sua casa è l'interruttore, non «Non ancora»).
 * La riga è la stessa di «Chat a tutta larghezza» (`index.template.html`, `data-setting-row="chatFullWidthToggle"`): etichetta, aiuto,
 * interruttore. Lo stato a schermo lo scrive SOLO la risposta del server; un salvataggio fallito rimette l'interruttore com'era e lo dice.
 * DOM finto di `aiuto-dom-blocchi.mjs` (`innerHTML` lancia): la riga si costruisce elemento per elemento.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';

const MODULO = '../../src/components/blocchi-vivi-impostazione.js';
const attesa = () => new Promise((r) => setImmediate(r));

function finestra() {
  const doc = documento();
  const pannello = doc.createElement('div');
  pannello.setAttribute('id', 'setting-panel-chat');
  pannello.setAttribute('data-settings-panel', 'chat');
  const gruppo = doc.createElement('section');
  gruppo.dataset.settingsChatControls = '';
  const sorella = doc.createElement('div');
  sorella.className = 'talos-setting';
  sorella.dataset.settingRow = 'chatFullWidthToggle';
  gruppo.append(sorella);
  pannello.append(gruppo);
  doc.body.append(pannello);
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  doc.documentElement = { addEventListener() {}, removeEventListener() {} };
  return { doc, gruppo };
}
function server(stato = { blocchiVivi: true }, { rotto = false } = {}) {
  const chiamate = [];
  const fetchFn = async (url, opzioni = {}) => {
    chiamate.push({ url, metodo: opzioni.method ?? 'GET', corpo: opzioni.body ? JSON.parse(opzioni.body) : null });
    if (rotto || (opzioni.method === 'POST' && server.rifiuta)) return { ok: false, status: 503, json: async () => ({ ok: false, error: { code: 'CHAT_SETTINGS_UNAVAILABLE' } }) };
    if (opzioni.method === 'POST') stato = JSON.parse(opzioni.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { ...stato } }) };
  };
  return { fetchFn, chiamate };
}

test('BLOCCHI-IMP-01 la riga sta in Impostazioni → Chat accanto alle sorelle, con la grammatica della riga-interruttore e i testi nelle due lingue', async () => {
  impostaLingua('it');
  const { montaBlocchiVivi } = await import(MODULO);
  const { doc, gruppo } = finestra();
  const { fetchFn, chiamate } = server();
  montaBlocchiVivi({ documento: doc, fetchFn });
  await attesa();
  const riga = gruppo.querySelector('[data-setting-row="liveBlocksToggle"]');
  assert.ok(riga, 'la riga è nel gruppo dei controlli della chat');
  assert.equal(riga.getAttribute('data-c') ?? riga.dataset.c, 'SettingRow');
  assert.ok(riga.classList.contains('talos-setting'));
  const etichetta = riga.querySelector('label.talos-setting__label');
  const interruttore = riga.querySelector('input.talos-switch');
  assert.equal(etichetta.getAttribute('for'), 'setting-liveBlocksToggle');
  assert.equal(interruttore.getAttribute('id'), 'setting-liveBlocksToggle');
  assert.equal(interruttore.getAttribute('role'), 'switch');
  assert.equal(interruttore.getAttribute('aria-describedby'), 'settingsHelp-liveBlocksToggle');
  assert.equal(etichetta.textContent, 'Blocchi vivi nelle risposte');
  assert.equal(etichetta.textContent, t('blocchi.settings.title'));
  assert.match(riga.querySelector('p.talos-setting__help').textContent, /nuove/u, 'l\'aiuto dice che vale per le conversazioni nuove');
  assert.equal(interruttore.checked, true);
  assert.deepEqual(chiamate.map((c) => [c.url, c.metodo]), [['/api/v1/chat-settings', 'GET']]);
  for (const k of ['settings.title', 'settings.help', 'settings.notSaved', 'settings.unavailable']) {
    assert.ok(TESTI.en[`blocchi.${k}`], `${k} in inglese`);
    assert.ok(TESTI.it[`blocchi.${k}`], `${k} in italiano`);
  }
  assert.equal(TESTI.en['blocchi.settings.title'], 'Live blocks in replies');
  for (const k of ['settings.title', 'settings.help', 'settings.notSaved', 'settings.unavailable']) {
    assert.doesNotMatch(TESTI.en[`blocchi.${k}`] + TESTI.it[`blocchi.${k}`], /catalog|TALOS_|blocchiVivi|chat\.liveBlocks|api\//iu, 'niente nomi tecnici a schermo');
  }
});

test('BLOCCHI-IMP-02 il cambio va al server e la risposta decide; un salvataggio fallito rimette com\'era e lo dice; senza server l\'interruttore è spento', async () => {
  impostaLingua('it');
  const { montaBlocchiVivi } = await import(MODULO);
  const { doc, gruppo } = finestra();
  const s = server({ blocchiVivi: true });
  montaBlocchiVivi({ documento: doc, fetchFn: s.fetchFn });
  await attesa();
  const interruttore = gruppo.querySelector('input.talos-switch');
  interruttore.checked = false;
  interruttore.dispatchEvent(new Event('change'));
  await attesa(); await attesa();
  assert.deepEqual(s.chiamate.at(-1), { url: '/api/v1/chat-settings', metodo: 'POST', corpo: { blocchiVivi: false } });
  assert.equal(interruttore.checked, false);
  server.rifiuta = true;
  try {
    interruttore.checked = true;
    interruttore.dispatchEvent(new Event('change'));
    await attesa(); await attesa();
    assert.equal(interruttore.checked, false, 'torna com\'era');
    assert.equal(gruppo.querySelector('p.talos-setting__help').textContent, t('blocchi.settings.notSaved'));
  } finally { server.rifiuta = false; }

  const altra = finestra();
  const rotto = server({}, { rotto: true });
  montaBlocchiVivi({ documento: altra.doc, fetchFn: rotto.fetchFn });
  await attesa();
  const spento = altra.gruppo.querySelector('input.talos-switch');
  assert.equal(spento.disabled, true);
  assert.equal(altra.gruppo.querySelector('p.talos-setting__help').textContent, t('blocchi.settings.unavailable'));
});

test('BLOCCHI-IMP-03 l\'avvio la monta, come le sorelle che leggono dal server', () => {
  const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ montaBlocchiVivi \} from '\.\/components\/blocchi-vivi-impostazione\.js';/u);
  assert.match(main, /^montaBlocchiVivi\(\);$/mu);
});

test('BLOCCHI-IMP-04 scheda delle capacità: la riga del computer use non sta più fra le «Non ancora», e la sua frase è tolta in ogni lingua', () => {
  const legacy = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const inizio = legacy.indexOf("tr('app.sheets.capabilities.notImplemented')");
  assert.ok(inizio > 0, 'la sezione c\'è');
  const sezione = legacy.slice(inizio, legacy.indexOf('</div>', legacy.indexOf(".join('')", inizio)));
  assert.doesNotMatch(sezione, /Computer use/u);
  assert.doesNotMatch(legacy, /computerUseDesc/u);
  for (const resta of ['toolsetsDesc', 'gatewaysDesc', 'profilesDesc']) assert.match(sezione, new RegExp(resta, 'u'), `${resta} resta`);
  for (const lingua of Object.keys(TESTI)) assert.equal(TESTI[lingua]['app.sheets.capabilities.computerUseDesc'], undefined, lingua);
  const testi = readFileSync(new URL('../../src/i18n/testi/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(testi, /computerUseDesc/u);
});
