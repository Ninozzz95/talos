import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AREE } from '../../src/i18n/testi/index.js';
import { nomeModelloUmano } from '../../src/components/chat-foot.js';
import { documento } from './aiuto-dom-blocchi.mjs';

/*
 * Reperti «evidenti» 8, 11, 15, 20 e O4 della revisione d'uso della candidata (Frontend, 04/11/2026,
 * `REVISIONE-UX-UI-CANDIDATA-2026-11-04.md`). Scritte rosse sulla candidata, prima della cura.
 */
const leggi = (percorso) => readFileSync(new URL(percorso, import.meta.url), 'utf8');

test('UXE-11 — il nome del catalogo vince sull\'id: «DeepSeek V4.1 Flash 1017», non «deepseek-v4.1-flash-1017»', async () => {
  const piede = await import('../../src/components/chat-foot.js');
  assert.equal(typeof piede.registraNomiDelCatalogo, 'function', 'chi legge il catalogo registra i nomi');
  const id = 'deepseek/deepseek-v4.1-flash-1017';
  assert.equal(nomeModelloUmano(id), 'deepseek-v4.1-flash-1017', 'senza catalogo resta la regola di forma');
  assert.equal(piede.registraNomiDelCatalogo([[id, 'DeepSeek V4.1 Flash 1017']]), true);
  assert.equal(piede.registraNomiDelCatalogo([[id, 'DeepSeek V4.1 Flash 1017']]), false, 'nessun cambio, nessun ridisegno');
  assert.equal(nomeModelloUmano(id), 'DeepSeek V4.1 Flash 1017');
  // un fornitore diretto: l'id col prefisso di instradamento trova il nome
  piede.registraNomiDelCatalogo([['deepseek:deepseek-chat', 'DeepSeek Chat']]);
  assert.equal(nomeModelloUmano('deepseek:deepseek-chat'), 'DeepSeek Chat');
  // AL CONTRARIO: coppie storte non entrano, un id sconosciuto resta com'era, un locale non passa di qui
  assert.equal(piede.registraNomiDelCatalogo([['x/y', ''], [null, 'Z'], ['a/b'], 'nonsense']), false);
  assert.equal(nomeModelloUmano('x/y'), 'y');
  assert.equal(nomeModelloUmano('openai/gpt-9-mini'), 'gpt-9-mini');
  assert.equal(piede.registraNomiDelCatalogo('non un elenco'), false);
});

test('UXE-11b — ogni lettura del catalogo dei modelli passa da chi registra i nomi', () => {
  const app = leggi('../../src/legacy/app.js');
  assert.equal((app.match(/catalogoModelli\s*=\s*(c|catalogo)\s*;/gu) ?? []).length, 1, 'una sola assegnazione, dentro adottaCatalogoModelli');
  assert.match(app, /function adottaCatalogoModelli\(/u);
  assert.match(app, /registraNomiDelCatalogo\(/u);
});

test('UXE-08 — la voce delle Impostazioni dice ciò che c\'è, senza backup; i pulsanti in italiano', () => {
  const { impostazioni, modello } = AREE;
  assert.equal(impostazioni.it['sections.account.title'], 'Diagnosi e configurazione');
  assert.equal(impostazioni.en['sections.account.title'], 'Diagnostics and configuration');
  for (const k of ['settings.accountDoctorAndBackup', 'frammenti.impostazioni.accountDoctorAndBackup', 'frammenti.guscio.accountDoctorAndBackup']) {
    assert.equal(modello.it[k], 'Diagnosi e configurazione', k);
    assert.equal(modello.en[k], 'Diagnostics and configuration', k);
  }
  for (const [area, k] of [['modello', 'settings.agentChecksAndConfiguration'], ['impostazioni', 'copy.agentControlsAndConfigurationBackup']]) {
    assert.doesNotMatch(AREE[area].it[k], /backup/iu, `${area} ${k} it`);
    assert.doesNotMatch(AREE[area].en[k], /backup/iu, `${area} ${k} en`);
  }
  // i nomi italiani di sempre, quelli della Capability e della Bacheca
  for (const pre of ['settings.', 'frammenti.impostazioni.']) {
    assert.equal(modello.it[`${pre}agents`], 'Agenti');
    assert.equal(modello.it[`${pre}hooks`], modello.it['capability.hooks']);
    assert.equal(modello.it[`${pre}skills`], modello.it['capability.skills']);
    assert.equal(modello.it[`${pre}plugins`], modello.it['capability.plugins']);
    assert.equal(modello.en[`${pre}agents`], 'Agents', 'l\'inglese resta');
  }
  const html = leggi('../../index.template.html') + leggi('../../src/legacy/frammenti.html');
  assert.doesNotMatch(html, /Account, Doctor e backup|Il backup non è disponibile/u, 'il testo di riserva della pagina è lo stesso');
});

const RIFIUTO = { ok: false, error: { code: 'AUTH_REQUIRED', message: 'This server only accepts the TALOS window that started it' } };
const risposta = (status, corpo) => ({ status, ok: status < 400, clone() { return { json: async () => corpo }; } });
function finestraFinta(esito) {
  const document = documento();
  const finestra = { document, location: { href: 'http://127.0.0.1:4391/', origin: 'http://127.0.0.1:4391', ricariche: 0, reload() { this.ricariche += 1; } } };
  finestra.fetch = async () => esito();
  return finestra;
}
const attesa = () => new Promise((f) => setTimeout(f, 5));

test('UXE-15 — al primo «non autorizzato» una fascia fissa dice che la finestra non è più collegata, con «Rientra»', async () => {
  const { sorvegliaAccesso } = await import('../../src/components/accesso-perso.js');
  let corrente = () => risposta(200, { ok: true, data: { items: [] } });
  const finestra = finestraFinta(() => corrente());
  const sorveglianza = sorvegliaAccesso({ finestra });
  await finestra.fetch('/api/v1/sessions');
  await attesa();
  assert.equal(sorveglianza.fascia, null, 'una risposta buona non accende niente');
  corrente = () => risposta(401, RIFIUTO);
  const r = await finestra.fetch('/api/v1/app-settings/changes');
  assert.equal(r.status, 401, 'chi ha chiesto riceve la sua risposta, intatta');
  await attesa();
  const fascia = sorveglianza.fascia;
  assert.ok(fascia?.isConnected, 'la fascia è nella pagina');
  assert.equal(fascia.getAttribute('role'), 'alert');
  assert.match(fascia.textContent, /Questa finestra non è più collegata a TALOS/u);
  const bottone = fascia.querySelector('button');
  assert.equal(bottone.textContent, 'Rientra');
  bottone.dispatchEvent(new Event('click'));
  assert.equal(finestra.location.ricariche, 1, '«Rientra» ricarica la finestra');
  // una sola fascia anche con dieci rifiuti
  for (let i = 0; i < 10; i += 1) await finestra.fetch('/api/v1/sessions');
  await attesa();
  assert.equal(finestra.document.body.childNodes.filter((n) => n.className === 'talos-accesso-perso').length, 1);
});

test('UXE-15b — AL CONTRARIO: un 401 che non è il rifiuto della finestra, o fuori dall\'API, non accende la fascia', async () => {
  const { sorvegliaAccesso } = await import('../../src/components/accesso-perso.js');
  let corrente = () => risposta(401, { ok: false, error: { code: 'PROVIDER_AUTH_FAILED' } });
  const finestra = finestraFinta(() => corrente());
  const sorveglianza = sorvegliaAccesso({ finestra });
  await finestra.fetch('/api/v1/providers/openrouter/models');
  corrente = () => risposta(401, RIFIUTO);
  await finestra.fetch('https://openrouter.ai/api/v1/models');
  corrente = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => finestra.fetch('/api/v1/sessions'), TypeError);
  await attesa();
  assert.equal(sorveglianza.fascia, null);
  for (const k of ['accessLost.title', 'accessLost.body', 'accessLost.reenter']) {
    assert.ok(AREE.app.en[k] && AREE.app.it[k], k);
  }
  assert.match(AREE.app.it['accessLost.body'], /riapri TALOS dal suo collegamento/u, 'la fascia dice cosa fare');
});

test('UXE-20 — passando sopra la riga la stella prende il posto dell\'ora, non la copre', () => {
  const css = leggi('../../src/styles/mockup-sidebar.css');
  assert.match(css, /\.td-session-row:hover\s*>\s*\.talos-session-item\s+\.talos-session-item__aside[^{]*\{[^}]*visibility:\s*hidden/u);
  assert.match(css, /\.td-session-row:has\(> \.td-session-star:focus-visible\)\s*>\s*\.talos-session-item\s+\.talos-session-item__aside/u);
});

test('UXE-O4 — Chat e Terminale raccolgono le azioni sotto «⋯» come la Review', () => {
  const html = leggi('../../index.template.html');
  for (const [schermo, prefisso] of [['schermoChat', 'Chat'], ['schermoTerminale', 'Terminale']]) {
    const inizio = html.indexOf(`id="${schermo}"`);
    assert.ok(inizio > 0, schermo);
    const tratto = html.slice(inizio, html.indexOf('</section>', inizio));
    const azioni = tratto.slice(tratto.indexOf('talos-topbar__actions'));
    assert.match(azioni, new RegExp(`class="talos-topbar__raccolte" id="azioniRaccolte${prefisso}"[^>]*popover`, 'u'), schermo);
    assert.match(azioni, new RegExp(`popovertarget="azioniRaccolte${prefisso}"`, 'u'), schermo);
    const raccolte = azioni.slice(azioni.indexOf('talos-topbar__raccolte'), azioni.indexOf('</div>', azioni.indexOf('talos-topbar__raccolte')));
    for (const voce of ['data-apre-velo="veloAlbero"', 'data-azione="comandi"']) assert.ok(raccolte.includes(voce), `${schermo} ${voce}`);
    assert.equal((raccolte.match(/talos-topbar__raccolta-nome/gu) ?? []).length, (raccolte.match(/<button/gu) ?? []).length, 'ogni voce col suo nome');
  }
});
