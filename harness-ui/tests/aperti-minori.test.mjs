import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await readFile(join(root, 'public/app.js'), 'utf8');

/** Estrae una funzione del monolite (IIFE senza export) e la istanzia con uno `state` finto: si prova il COMPORTAMENTO, non solo il testo. */
function funzioneDalMonolite(nome, { state = {}, Date: DateFinto = Date } = {}) {
  const inizio = app.indexOf(`  function ${nome}(`);
  assert.ok(inizio > 0, `${nome} deve esistere in app.js`);
  const fine = app.indexOf('\n  }\n', inizio);
  const sorgente = app.slice(inizio, fine + 4);
  // eslint-disable-next-line no-new-func
  return new Function('state', 'Date', `${sorgente}\nreturn ${nome};`)(state, DateFinto);
}

/*
 * ⭐ 04/9 — W1-12, gli «aperti minori» della mappa: sottotitolo del titolo
 * sessione, riga pendente evidenziata, meta della nota impostazioni, nomi
 * unici fra sessioni vive, ripresa con età e stima.
 */
test('W1-12 — nomeUnicoSessione: suffisso -2/-3 solo contro sessioni VIVE con quel nome; le concluse non contano; se stessa esclusa', () => {
  const state = { sessionSelection: { available: new Map([
    ['a', { sessionId: 'a', nome: 'refactor', conclusa: false }],
    ['b', { sessionId: 'b', nome: 'refactor-2', conclusa: false }],
    ['c', { sessionId: 'c', nome: 'vecchia', conclusa: true }],
  ]) } };
  const nomeUnicoSessione = funzioneDalMonolite('nomeUnicoSessione', { state });
  assert.deepEqual(nomeUnicoSessione('refactor', 'nuova'), { nome: 'refactor-3', cambiato: true });
  assert.deepEqual(nomeUnicoSessione('vecchia', 'nuova'), { nome: 'vecchia', cambiato: false }, 'AL CONTRARIO: un nome di una sessione conclusa può tornare');
  assert.deepEqual(nomeUnicoSessione('refactor', 'a'), { nome: 'refactor', cambiato: false }, 'AL CONTRARIO: rinominare se stessa con il proprio nome non è un doppione');
  assert.deepEqual(nomeUnicoSessione('   ', 'x'), { nome: '', cambiato: false });
});

test('W1-12 — formattaEta e stimaTokenRipresa: numeri veri o «non registrato», mai uno zero inventato', () => {
  const adesso = Date.parse('2026-09-04T10:00:00Z');
  class DateFinto extends Date { static now() { return adesso; } static parse(s) { return Date.parse(s); } }
  const formattaEta = funzioneDalMonolite('formattaEta', { Date: DateFinto });
  assert.equal(formattaEta('2026-09-04T09:59:20Z'), '40 s');
  assert.equal(formattaEta('2026-09-04T09:15:00Z'), '45 min');
  assert.equal(formattaEta('2026-09-04T07:00:00Z'), '3 h');
  assert.equal(formattaEta('2026-08-30T10:00:00Z'), '5 g');
  assert.equal(formattaEta(undefined), null, 'AL CONTRARIO: senza data niente età');
  const stimaTokenRipresa = funzioneDalMonolite('stimaTokenRipresa');
  assert.equal(stimaTokenRipresa(null), 'consumo non registrato');
  assert.equal(stimaTokenRipresa({ prompt_tokens: 0, completion_tokens: 0 }), 'consumo non registrato');
  assert.equal(stimaTokenRipresa({ prompt_tokens: 8000, completion_tokens: 400 }), 'circa 8.4k token (stima)');
  assert.equal(stimaTokenRipresa({ prompt_tokens: 512 }), 'circa 512 token (stima)');
});

test('W1-12 — cablaggio nel monolite: sottotitolo a tre stati, riga pendente, meta del giro, nomi unici nei due punti, toast prima della POST /resume', () => {
  // sottotitolo
  assert.match(app, /function aggiornaSottotitoloSessione\(\)/);
  assert.match(app, /'in attesa del primo messaggio' : 'premi «Nuova» per iniziare'/);
  const passa = app.slice(app.indexOf('function passaASessione('), app.indexOf('function aggiornaSottotitoloSessione('));
  assert.match(passa, /aggiornaSottotitoloSessione\(\);/, 'passaASessione aggiorna il sottotitolo');
  const pendente = app.slice(app.indexOf('function avviaSessionePendente('), app.indexOf('function titoloDalPrimoMessaggio('));
  assert.match(pendente, /aggiornaSottotitoloSessione\(\);/);
  assert.match(pendente, /aggiornaElencoSessioniReali\(\);/, 'la riga pendente si disegna subito');
  // riga pendente evidenziata
  assert.match(app, /className = 'session-item real-session-item active is-pending'/);
  const elenco = app.slice(app.indexOf('async function aggiornaElencoSessioniReali('), app.indexOf('function aggiornaWidgetAutomazioni('));
  assert.match(elenco, /\.\.\.pendente\]/);
  assert.match(elenco, /replaceChildren\(\.\.\.pendente\)/, 'anche con zero sessioni reali la riga pendente compare');
  // meta della nota
  assert.match(app, /function appendStatusNote\(text, isError = false, \{ meta: etichettaMeta = null \} = \{\}\)/);
  const allinea = app.slice(app.indexOf('function allineaPilloleAlGiroVivo('), app.indexOf('function appendRealTaskStart('));
  assert.match(allinea, /meta: `TALOS · giro \$\{state\.realSession\.runCount \|\| 1\}`/);
  assert.doesNotMatch(allinea.match(/appendStatusNote\([^\n]*/)[0], /concluso/, 'la CHIAMATA non passa «concluso» (il commento può nominarlo)');
  // nomi unici in ENTRAMBI i punti
  assert.equal((app.match(/nomeUnicoSessione\(/g) || []).length, 3, 'definizione + rinomina + titolo automatico');
  assert.match(app, /rinominata per evitare un doppione con una sessione viva/);
  // ripresa: toast PRIMA della POST
  const resume = app.slice(app.indexOf('async function resumeSession('), app.indexOf('/api/v1/sessions/${encodeURIComponent(sessionId)}/resume'));
  assert.match(resume, /toast\('Ripresa della sessione'/);
  assert.match(resume, /riprendere costa \$\{stimaTokenRipresa\(voceElenco\.usage\)\}/);
});
