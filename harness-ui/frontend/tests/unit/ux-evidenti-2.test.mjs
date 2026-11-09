import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AREE } from '../../src/i18n/testi/index.js';
import { datiRuntimeModello } from '../../src/components/runtime-modelli.js';
import { creaChatALato } from '../../src/components/pannello/a-lato.js';
import { documento } from './aiuto-dom-blocchi.mjs';

/*
 * Reperti «evidenti» 7, 9, 10 e 12 della revisione d'uso della candidata (Frontend, 04/11/2026,
 * `REVISIONE-UX-UI-CANDIDATA-2026-11-04.md`). Scritte rosse sulla candidata, prima della cura.
 */

test('UXE-09 — Laboratorio modelli, scheda Sistema: «Distingui», senza l\'accento sbagliato', () => {
  assert.match(AREE.modelli.it['lab.systemNote'], /^Distingui ciò che è misurato/u);
  assert.doesNotMatch(AREE.modelli.it['lab.systemNote'], /Distinguì/u);
  assert.match(AREE.modelli.en['lab.systemNote'], /^Distinguish\b/u);
});

const attesa = () => new Promise((f) => setTimeout(f, 5));
function chatALato() {
  const document = documento();
  const lato = creaChatALato({
    document, sessione: () => 's1',
    chiedi: async () => ({ risposta: 'Sta leggendo i test.', usage: { prompt_tokens: 100, completion_tokens: 20, cached_tokens: 0 } }),
    trasforma: async () => ({}), apriSessione: () => {}, quandoCorre: () => {},
    testoConsumo: (u) => `${u.prompt_tokens + u.completion_tokens} token`, testoErrore: (e) => e.message,
  });
  return { lato, costo: lato.nodo.querySelector('.lato-piede .talos-measure--estimate') };
}

test('UXE-10 — chat a lato vuota: nessuna «~» da sola sotto il campo; il costo si vede solo quando c\'è', async () => {
  const { lato, costo } = chatALato();
  assert.ok(costo, 'il posto del costo c\'è');
  assert.equal(costo.textContent, '');
  // rosso sulla candidata: lo stile delle stime mette la «~» davanti anche a un testo vuoto
  assert.equal(costo.hidden, true, 'vuoto ⇒ nascosto, così la «~» e il sottolineato a puntini non restano soli');
  // AL CONTRARIO: dopo una risposta col consumo il costo si vede
  lato.fai('a che punto sei?');
  await attesa();
  assert.match(costo.textContent, /120 token/u);
  assert.equal(costo.hidden, false);
});

/* Le chiavi vere che TALOS scrive nel browser (censimento del 04/11 sul sorgente, più le tre della foto della revisione). */
const CHIAVI_VERE = [
  'talos-harness-terminali-v1', 'talos-terminale-standalone-v1', 'talos.harness.desktop.settings.section.v1', 'talos.desktop.workspace.v2',
  'talos.harness.desktop.settings.v1', 'talos.harness.desktop.settings.copy.v1', 'talos.harness.desktop.settings.copy.pending.v1',
  'talos-harness-composer-size-v1', 'talos.harness.desktop.composer.v2', 'talos-harness-modal-sizes-v1', 'talos.bozze.v2',
  'talos.ask-draft.v1:sessione-1', 'talos.harness.desktop.comandi.v1', 'talos.harness.desktop.barra.fissate.v1',
  'talos.harness.desktop.barra.gruppi.v1', 'talos.harness.desktop.bacheca.vista.v1', 'talos.harness.desktop.link-fidati.v1',
  'talos.harness.desktop.link-destinazione.v1', 'talos.grafo.aperto.v1', 'talos.grafo.tipo.v1:wf-1', 'talos.workflow-graph-view.v2',
  'talos.harness.desktop.pannello.pieghe.v1', 'talos.harness.desktop.cardContesto.v1', 'talos-harness-sezioni-v1',
  'talos.harness.desktop.modelli.ripresa.v1', 'talos.harness.desktop.chatgpt-benvenuto.v1', 'talos.harness.desktop.modo-ritirato-scelto.v1',
  'talos.obiettivo.fascia.v1', 'talos.segnalazione.scartate.v1', 'talos-harness-browser-note-v1',
  'talos.harness.desktop.deleghe-attivita.v1', 'talos.session-deletion-feedback.v1',
];

test('UXE-07 — «Dati locali del browser»: un nome umano per ogni dato, mai la chiave interna', async () => {
  const { nomeDatoLocale } = await import('../../src/components/dati-locali.js');
  const altra = AREE.app.it['settings.localData.other'];
  for (const chiave of CHIAVI_VERE) {
    const nome = nomeDatoLocale(chiave);
    assert.notEqual(nome, altra, `${chiave} ha un nome suo`);
    assert.doesNotMatch(nome, /talos|[.-]v\d|settings\.|localData/iu, `${chiave} ⇒ «${nome}»`);
  }
  assert.equal(nomeDatoLocale('talos-harness-terminali-v1'), 'Schede del terminale');
  assert.equal(nomeDatoLocale('talos.harness.desktop.settings.section.v1'), 'Sezione aperta delle Impostazioni');
  assert.equal(nomeDatoLocale('talos.harness.desktop.settings.v1'), 'Impostazioni');
  assert.equal(nomeDatoLocale('talos.desktop.workspace.v2'), 'Spazio di lavoro');
  // AL CONTRARIO: una chiave nuova che nessuno ha ancora nominato non mostra il suo nome tecnico
  assert.equal(nomeDatoLocale('talos.qualcosa-di-nuovo.v9'), altra);
  // ogni nome c'è in inglese e in italiano
  for (const chiave of Object.keys(AREE.app.en).filter((k) => k.startsWith('settings.localData.'))) assert.ok(AREE.app.it[chiave], chiave);
});

test('UXE-07b — la grandezza in parole e una riga sola per le chiavi con lo stesso nome', async () => {
  const { grandezzaInParole, righeDatiLocali } = await import('../../src/components/dati-locali.js');
  assert.equal(grandezzaInParole(90), 'meno di 1 KB');
  assert.equal(grandezzaInParole(4300), '4,2 KB');
  assert.equal(grandezzaInParole(3 * 1024 * 1024), '3 MB');
  const righe = righeDatiLocali([['talos.ask-draft.v1:a', 200], ['talos-harness-terminali-v1', 90], ['talos.ask-draft.v1:b', 1200]]);
  assert.deepEqual(righe, [{ nome: 'Bozze non inviate', byte: 1400, quante: 2 }, { nome: 'Schede del terminale', byte: 90, quante: 1 }]);
});

test('UXE-07c — l\'elenco della pagina non scrive più la chiave in carattere da codice', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const inizio = app.indexOf("$('#settingsPrivacyList')");
  const tratto = app.slice(inizio, inizio + 1600);
  assert.doesNotMatch(tratto, /textElement\('code', '', chiave\)/u);
  assert.match(tratto, /righeDatiLocali\(voci\)/u);
});

const STATO_SENZA_RISPOSTA = {
  runtimeId: 'ollama', state: 'unknown', baseUrl: 'http://127.0.0.1:11434',
  observedAt: '2026-11-04T15:37:56.000Z', failureReason: 'RUNTIME_UNREACHABLE',
};

test('UXE-12 — Ollama controllato e muto: la carta dice «Non raggiungibile», non «Disponibilità non verificata»', () => {
  const d = datiRuntimeModello(STATO_SENZA_RISPOSTA);
  assert.equal(d.modelli, 'Non raggiungibile');
  assert.doesNotMatch(d.modelli, /non verificata/u);
  assert.equal(d.stato, 'Non raggiunto');
  assert.equal(d.errore, 'RUNTIME_UNREACHABLE');
  assert.equal(AREE.modelli.en['runtime.availabilityUnreachable'], 'Not reachable');
});

test('UXE-12b — AL CONTRARIO: senza un controllo vero resta «non verificata»; risposta storta = lettura non riuscita', () => {
  // nessuna data valida: nessuno ha controllato davvero (RUN-DATI-MANCANTI)
  assert.equal(datiRuntimeModello({ runtimeId: 'ollama', state: 'unknown', observedAt: 'non-data' }).modelli, 'Disponibilità non verificata');
  assert.equal(datiRuntimeModello({ runtimeId: 'ollama', state: 'unknown' }).modelli, 'Disponibilità non verificata');
  // un motivo senza una data vera non è un controllo (mutante M8 del 04/11: il controllo della data tolto restava vivo)
  assert.equal(datiRuntimeModello({ ...STATO_SENZA_RISPOSTA, observedAt: 'non-data' }).modelli, 'Disponibilità non verificata');
  assert.equal(datiRuntimeModello({ ...STATO_SENZA_RISPOSTA, observedAt: undefined }).modelli, 'Disponibilità non verificata');
  // ha risposto, ma non con un elenco di modelli: raggiunto o no, non è «non raggiungibile»
  const storta = datiRuntimeModello({ ...STATO_SENZA_RISPOSTA, failureReason: 'INVALID_RESPONSE' });
  assert.equal(storta.modelli, AREE.modelli.it['runtime.modelsReadFailed']);
  // un servizio raggiunto non cambia
  assert.equal(datiRuntimeModello({ runtimeId: 'ollama', state: 'observed', models: [] }).modelli, 'Nessun modello disponibile');
});
