/*
 * 12/10/2026 — I LINK DELLA CHAT A DUE PORTE (owner: «visto che abbiamo un browser integrato potremmo fare scegliere»). La LOGICA,
 * senza interfaccia (`link-esterni.js`): dove si apre un sito fidato, la destinazione ricordata o fissata, e le pagine che restano
 * sempre nel browser del computer. Stato dell'arte: Hermes apre sempre fuori (`apps/desktop/electron/external-open.ts`); VS Code
 * 1.109 lo decide con un'impostazione (`workbench.browser.openLocalhostLinks`). La domanda nel browser vero sta in
 * `link-conferma-browser.test.mjs` (LINK-PORTE-01..04).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaSitiFidati, creaDestinazioneDeiLink, paginaSoloNelSistema, DESTINAZIONI_DEI_LINK } from '../../src/components/link-esterni.js';

const depositoInMemoria = (iniziale = {}) => {
  const memoria = new Map(Object.entries(iniziale));
  return { memoria, getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
};
const FIDATI = 'talos.harness.desktop.link-fidati.v1';
const DOVE_FIDATI = 'talos.harness.desktop.link-fidati-destinazione.v1';
const DOVE = 'talos.harness.desktop.link-destinazione.v1';

test('LINK-DOVE-01: un sito fidato ricorda dove si apre; chi era fidato prima del 12/10 resta nel browser del computer', () => {
  const deposito = depositoInMemoria({ [FIDATI]: JSON.stringify(['vecchio.test']) });
  const fidati = creaSitiFidati({ deposito });
  assert.deepEqual(DESTINAZIONI_DEI_LINK, ['talos', 'sistema']);
  assert.equal(fidati.destinazione('vecchio.test'), 'sistema', 'l elenco dell 11/10 si legge com era');
  assert.equal(fidati.destinazione('mai-visto.test'), null, 'un sito non fidato non ha una destinazione');
  fidati.aggiungi('example.com', 'talos'); fidati.aggiungi('altro.test');
  assert.deepEqual([fidati.destinazione('example.com'), fidati.destinazione('altro.test')], ['talos', 'sistema']);
  assert.deepEqual(JSON.parse(deposito.memoria.get(FIDATI)), ['altro.test', 'example.com', 'vecchio.test'], 'la chiave dell 11/10 resta un elenco di nomi: una versione precedente la legge ancora');
  assert.deepEqual(JSON.parse(deposito.memoria.get(DOVE_FIDATI)), ['example.com']);
  const dopo = creaSitiFidati({ deposito });
  assert.deepEqual([dopo.destinazione('example.com'), dopo.destinazione('vecchio.test')], ['talos', 'sistema'], 'resta dopo un riavvio');
  let avvisi = 0; dopo.ascolta(() => { avvisi += 1; });
  dopo.imposta('example.com', 'sistema');
  dopo.imposta('example.com', 'sistema');
  dopo.imposta('mai-visto.test', 'talos');
  assert.deepEqual([dopo.destinazione('example.com'), dopo.fidato('mai-visto.test'), avvisi], ['sistema', false, 1], 'cambiare DOVE non rende fidato nessuno, e avvisa solo quando cambia');
  dopo.aggiungi('vecchio.test', 'talos');
  assert.equal(dopo.destinazione('vecchio.test'), 'talos', 'ri-fidarsi dalla domanda aggiorna la destinazione');
  dopo.togli('vecchio.test');
  assert.deepEqual(JSON.parse(deposito.memoria.get(DOVE_FIDATI)), [], 'tolto il sito, sul disco non resta la sua destinazione');
  dopo.aggiungi('vecchio.test');
  assert.equal(dopo.destinazione('vecchio.test'), 'sistema', 'tolto e rimesso, non eredita la destinazione di prima');
});

test('LINK-DOVE-02 AL CONTRARIO: dati rotti o sconosciuti non portano mai una pagina dentro l app da soli', () => {
  const sporco = depositoInMemoria({ [FIDATI]: JSON.stringify(['ok.test']), [DOVE_FIDATI]: JSON.stringify(['ok.test', 'non-fidato.test', 7]) });
  const fidati = creaSitiFidati({ deposito: sporco });
  assert.deepEqual([fidati.destinazione('ok.test'), fidati.fidato('non-fidato.test'), fidati.destinazione('non-fidato.test')], ['talos', false, null],
    'una destinazione senza la fiducia non conta');
  assert.equal(creaSitiFidati({ deposito: depositoInMemoria({ [FIDATI]: JSON.stringify(['ok.test']), [DOVE_FIDATI]: '{"storto":1}' }) }).destinazione('ok.test'), 'sistema');
  fidati.aggiungi('altro.test', 'ovunque');
  assert.equal(fidati.destinazione('altro.test'), 'sistema', 'una destinazione sconosciuta vale il browser del computer');
  assert.deepEqual(JSON.parse(sporco.memoria.get(DOVE_FIDATI)), ['ok.test'], 'al primo salvataggio la destinazione di chi non è fidato non torna sul disco');
  const rotto = { getItem: () => { throw new Error('negato'); }, setItem: () => { throw new Error('negato'); } };
  const d = creaDestinazioneDeiLink({ deposito: rotto });
  assert.deepEqual([d.ultima(), d.fissa()], ['sistema', null]);
  d.fissaSu('talos');
  assert.equal(d.fissa(), 'talos', 'vale per questa finestra anche se non si è potuto salvare');
  for (const storto of ['null', '[]', '"talos"', '{"ultima":"altrove","fissa":"altrove"}', '{"fissa":true}', 'non json']) {
    const letto = creaDestinazioneDeiLink({ deposito: depositoInMemoria({ [DOVE]: storto }) });
    assert.deepEqual([letto.ultima(), letto.fissa()], ['sistema', null], storto);
  }
});

test('LINK-DOVE-03: la destinazione dei link non fidati — l ultima usata si ricorda, quella fissata resta finché non la si toglie', () => {
  const deposito = depositoInMemoria();
  const d = creaDestinazioneDeiLink({ deposito });
  let avvisi = 0; d.ascolta(() => { avvisi += 1; });
  assert.deepEqual([d.ultima(), d.fissa()], ['sistema', null], 'di serie si chiede, col browser del computer in evidenza: com era prima');
  d.ricorda('talos'); d.ricorda('talos');
  assert.deepEqual([d.ultima(), d.fissa(), avvisi], ['talos', null, 1], 'ricordare l ultima non fissa niente');
  d.fissaSu('sistema');
  assert.deepEqual([d.ultima(), d.fissa()], ['sistema', 'sistema'], 'fissare porta con sé anche l ultima');
  const dopo = creaDestinazioneDeiLink({ deposito });
  assert.deepEqual([dopo.ultima(), dopo.fissa()], ['sistema', 'sistema'], 'resta dopo un riavvio');
  dopo.fissaSu(null);
  assert.deepEqual([dopo.fissa(), creaDestinazioneDeiLink({ deposito }).fissa()], [null, null], 'tolta, si torna a chiedere');
  dopo.fissaSu('altrove');
  assert.equal(dopo.fissa(), null, 'un valore sconosciuto non fissa niente');
});

test('LINK-DOVE-04: le pagine che restano nel browser del computer — accesso, chiavi, account; il resto no', () => {
  for (const si of [
    'https://openrouter.ai/settings/keys', 'https://openrouter.ai/auth?callback_url=x', 'https://platform.openai.com/api-keys',
    'https://platform.openai.com/settings/organization/billing', 'https://auth.openai.com/log-in', 'https://chatgpt.com/#settings/Usage',
    'https://console.anthropic.com/settings/keys', 'https://aistudio.google.com/apikey', 'https://accounts.google.com/signin/v2',
    'https://github.com/settings/tokens', 'https://github.com/login', 'https://login.microsoftonline.com/common/oauth2',
    'https://huggingface.co/settings/tokens', 'https://z.ai/manage-apikey/apikey-list'.replace('/manage-apikey/', '/account/'),
  ]) assert.equal(paginaSoloNelSistema(si), true, si);
  for (const no of [
    'https://github.com/NousResearch/hermes-agent/blob/main/README.md', 'https://openrouter.ai/models', 'https://openrouter.ai/docs/keys-and-limits',
    'https://platform.openai.com/docs/guides/text', 'https://example.com/settings', 'https://www.olivemagazine.com/recipes/account-of-a-dinner/',
    'https://github.com/owner/keystone', 'https://identity.example.com/', 'https://idea.example.com/login-tips',
  ]) assert.equal(paginaSoloNelSistema(no), false, no);
  for (const illeggibile of ['javascript:alert(1)', 'https://google.com@evil.test/settings', '', null]) assert.equal(paginaSoloNelSistema(illeggibile), false, String(illeggibile));
});
