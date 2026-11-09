/*
 * FE-039 (owner 30/10 sera, variante B «Indice a sinistra»): le righe del bozzetto che il confronto col sorgente ha trovato scoperte.
 * Impostazioni: «Automatico, modello e riserva a vista, il resto sotto Avanzate»; «Se il modello non va: scritto prima che serva»; lavoro in corso coi secondi;
 * cache ripartita sotto i numeri.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { disegnaCatenaContesto } from '../../src/components/contesto-catena.js';
import { impostaOrologioCaricamento, mostraCaricamentoVivo } from '../../src/components/caricamento-vivo.js';

const template = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
const compactor = readFileSync(new URL('../../src/components/context-compactor.js', import.meta.url), 'utf8');
const pannello = readFileSync(new URL('../../src/components/pannello/contesto.js', import.meta.url), 'utf8');
const pagina = () => {
  const inizio = template.indexOf('id="contestoPannello-impostazioni"');
  return template.slice(inizio, template.indexOf('</section>', inizio));
};

test('CM-01 l\'ordine del bozzetto: questa chat, tutte le chat, poi Avanzate', () => {
  const p = pagina();
  const posti = ['Per questa chat', 'data-context-auto', 'Per tutte le chat', 'data-context-chain-text', 'data-context-advanced', 'data-context-settings'].map((x) => p.indexOf(x));
  assert.ok(posti.every((x) => x >= 0), JSON.stringify(posti));
  assert.deepEqual([...posti].sort((a, b) => a - b), posti);
});

test('CM-02 tutto il modulo sta sotto Avanzate, chiuso di serie; non sparisce nessun comando', () => {
  const p = pagina();
  const avanzate = p.slice(p.indexOf('<details'), p.indexOf('</details>'));
  assert.ok(avanzate.length > 0);
  assert.doesNotMatch(p.match(/<details[^>]*>/u)[0], /\bopen\b/u);
  for (const c of ['data-context-model-mode', 'data-context-trigger', 'data-context-target', 'data-context-recent', 'data-context-focus', 'data-context-semantic', 'data-context-native', 'Salva impostazioni']) {
    assert.ok(avanzate.includes(c), c);
  }
});

const nodo = () => ({ textContent: '', hidden: false, ascolti: {}, addEventListener(k, f) { this.ascolti[k] = f; } });
const nodi = () => ({ testo: nodo(), avviso: nodo(), modello: nodo(), riserva: nodo() });

test('CM-03 la catena si legge prima che serva, con le parole della carta delle Impostazioni', () => {
  const n = nodi();
  disegnaCatenaContesto(n, { catena: [{ ruolo: 'scelto', modello: 'z-ai/glm-5.3-flash', stato: 'pronto' }] });
  assert.match(n.testo.textContent, /GLM/iu);
  assert.equal(n.testo.hidden, false);
  assert.equal(n.avviso.hidden, true);
});

test('CM-04 un modello inutilizzabile lo dice l\'avviso, non la frase', () => {
  const n = nodi();
  disegnaCatenaContesto(n, { catena: [{ ruolo: 'scelto', modello: 'z-ai/x', stato: 'inutilizzabile', motivo: 'senza-chiave' }] });
  assert.equal(n.testo.hidden, true);
  assert.equal(n.avviso.hidden, false);
  assert.notEqual(n.avviso.textContent, '');
});

test('CM-05 lettura fallita o non ancora arrivata: niente frase inventata', () => {
  for (const stato of [null, undefined, {}, { catena: 'x' }]) {
    const n = nodi();
    disegnaCatenaContesto(n, stato);
    assert.equal(n.testo.hidden, true);
    assert.equal(n.avviso.hidden, true);
  }
});

test('CM-06 la finestra è cablata: legge la catena quando si apre la pagina, i due tasti portano all\'unica scelta delle Impostazioni', () => {
  assert.match(compactor, /if \(chiave === 'impostazioni'\) void caricaCatena\(\)/u);
  assert.match(compactor, /listen\(q\('chain-model'\), 'click', \(\) => scegliNelleImpostazioni\('modello'\)\)/u);
  assert.match(compactor, /listen\(q\('chain-backup'\), 'click', \(\) => scegliNelleImpostazioni\('riserva'\)\)/u);
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /catena: \(\) => apiGet\('\/api\/v1\/context-settings'\)/u);
});

test('CM-07 la riga del lavoro: viva mentre lavora, ferma in pausa, nei due modi', () => {
  assert.match(compactor, /scriviLavoro\(view\.jobLabel, ACTIVE\.has\(view\.job\?\.state\) && view\.job\?\.state !== 'paused', view\.job\?\.id, Date\.parse\(view\.job\?\.createdAt\)\)/u);
  assert.match(compactor, /scriviLavoro\(inCorso \? t\('chat\.context\.summarizing'\)/u);
  assert.doesNotMatch(compactor, /q\('job'\)\.textContent = (view\.jobLabel|inCorso)/u);
});

test('CM-08 i secondi contano da quando il lavoro è partito, non da quando si è aperta la finestra', () => {
  impostaOrologioCaricamento(() => 100_000);
  const programmati = [];
  const timer = { setTimeout: (f, ms) => { programmati.push(ms); return 1; }, clearTimeout() {}, setInterval() { return 2; }, clearInterval() {} };
  const doc = { createElement: () => ({ dataset: {}, classList: { add() {} }, setAttribute() {}, textContent: '' }) };
  const c = { ownerDocument: doc, replaceChildren() {}, append() {} };
  mostraCaricamentoVivo(c, 'x', { inizio: 90_000, timer });
  assert.deepEqual(programmati, [0], 'partito da 10 s: si accende subito');
  programmati.length = 0;
  const d = { ownerDocument: doc, replaceChildren() {}, append() {} };
  mostraCaricamentoVivo(d, 'x', { inizio: Number.NaN, timer });
  assert.deepEqual(programmati, [2000], 'inizio non valido: come prima');
  impostaOrologioCaricamento(null);
});

test('CM-09 la cache ripartita sta sotto i numeri, nella Panoramica; il pannello di destra non cambia', () => {
  assert.match(pannello, /pezzi\.push\(conParte\(nota, 'cache'\)\)/u);
  assert.match(compactor, /panoramica: \['tempo', 'categorie', 'cache', 'attenzione'\]/u);
  assert.doesNotMatch(compactor, /compattazioni: \[[^\]]*'cache'/u);
});

test('CM-10 le frasi nuove nelle due lingue', () => {
  const testi = readFileSync(new URL('../../src/i18n/testi/modello.js', import.meta.url), 'utf8');
  for (const k of ['context.forThisChat', 'context.forAllChats', 'context.advanced', 'context.changeModel', 'context.chooseBackup']) assert.equal(testi.split(`'${k}'`).length - 1, 2, k);
});
