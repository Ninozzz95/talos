// Decisione 183 (owner 04/11/2026): la cache del fornitore ripartiva da zero «per motivo sconosciuto» quando un giro riprendeva dopo un
// comando in sottofondo finito (4 volte in 2 minuti, 133-153 mila token riletti, DeepSeek V4.1 Flash su OpenRouter).
// Misurato (rapporto in-corso/RAPPORTO-CACHE-183-2026-11-04.md): la richiesta del risveglio ALLUNGA quella di prima byte per byte; a
// perdere la cache è il fornitore a valle (stesso corpo, stesso endpoint: 0, 0, letti, letti, letti, 0) o il cambio di fornitore.
// Prima della cura il giro lo chiamava «sconosciuto»; dopo, ha un nome: 'fornitore' (è cambiato chi serve) o 'persa-dal-fornitore'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { improntaDellaRichiesta, motivoDellaCacheRicominciata, talosLavora } from '../src/kernel/talosHarness.mjs';
import { testoUscitaSfondo } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const attrezzo = (name) => ({ type: 'function', function: { name, parameters: { type: 'object' } } });
const base = [{ role: 'system', content: 'You are a coding agent.' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }];
const imp = () => improntaDellaRichiesta({ modello: 'm', messaggi: base, attrezzi: [attrezzo('leggi')] });
const letta = (extra = {}) => ({ ...imp(), tokenDaCache: 9_000, at: 0, durataMs: 300_000, ...extra });

/** Un fornitore finto che annota ogni corpo inviato e dice chi ha servito (il campo `provider` di OpenRouter). */
function fornitore({ cache = [], chi = [], corpi = [] } = {}) {
  let n = 0;
  return async (_url, init) => {
    n += 1;
    corpi.push(JSON.parse(String(init?.body)));
    const primo = n === 1 && cache.length > 1;
    const messaggio = primo
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'k1', type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }
      : { role: 'assistant', content: 'fatto' };
    return Response.json({ provider: chi[n - 1] ?? chi.at(-1) ?? undefined, choices: [{ message: messaggio, finish_reason: primo ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 140_000, completion_tokens: 3, prompt_tokens_details: { cached_tokens: cache[n - 1] ?? 0 } } });
  };
}
async function giro(t, opzioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cache-183-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  const esito = await talosLavora({ cartella, task: { consegna: 'elenca' }, modello: 'deepseek/deepseek-v4.1-flash-1017', chiave: 'k',
    onGiro: (e) => { if (e?.tipo === 'cache-ricominciata') eventi.push(e); }, ...opzioni });
  return { esito, eventi };
}
/** Il risveglio come lo costruisce il server (`session-registry.mjs`, resume con notificaDelega.origine 'sfondo'). */
const risveglio = (messaggiFinali) => [...messaggiFinali,
  { role: 'user', content: testoUscitaSfondo({ comando: 'node -e "setTimeout(()=>console.log(1),20000)"', esito: 'riuscito', codice: 0 }), talosOrigin: 'background-notice' }];
const senzaNoteInCoda = (lista) => { let fine = lista.length; while (fine > 0 && lista[fine - 1]?.role === 'system') fine -= 1; return lista.slice(0, fine); };

test('CACHE-183-01 — il risveglio dopo un comando in sottofondo ALLUNGA la richiesta di prima: stessi attrezzi, stessa testa, stessi messaggi byte per byte', async (t) => {
  const corpi = [];
  const primo = await giro(t, { fetchDiRete: fornitore({ cache: [0, 4_000], chi: ['Wafer'], corpi }) });
  const secondo = await giro(t, { fetchDiRete: fornitore({ cache: [130_000], chi: ['Wafer'], corpi }), statoCachePrecedente: primo.esito.statoCache,
    messaggiIniziali: risveglio(primo.esito.messaggiFinali) });
  assert.equal(corpi.length, 3, 'due richieste nel giro della persona, una nel risveglio');
  const [, ultimaPrima, risvegliata] = corpi;
  const { messages: mPrima, ...testaPrima } = ultimaPrima;
  const { messages: mDopo, ...testaDopo } = risvegliata;
  assert.deepEqual(testaDopo, testaPrima, 'modello, attrezzi, chiave di sessione e ogni campo di testa restano uguali');
  const prefisso = senzaNoteInCoda(mPrima);
  assert.ok(prefisso.length >= 3, 'c\'è una storia da confrontare');
  assert.equal(JSON.stringify(mDopo.slice(0, prefisso.length)), JSON.stringify(prefisso), 'la storia di prima è un prefisso IN BYTE del risveglio');
  assert.deepEqual(secondo.eventi, [], 'la cache letta al risveglio non è una ripartenza');
});

test('CACHE-183-02 — stessa impronta, la cache torna a 0 prima della durata: se è cambiato chi serve è «fornitore», non «sconosciuto»', () => {
  assert.equal(motivoDellaCacheRicominciata(letta({ fornitore: 'Particle AI' }), imp(), { tokenDaCache: 0, ora: 60_000, fornitore: 'Wafer' }), 'fornitore');
  assert.equal(motivoDellaCacheRicominciata(letta({ fornitore: 'Particle AI' }), imp(), { tokenDaCache: 0, ora: 301_000, fornitore: 'Wafer' }), 'fornitore',
    'il cambio di fornitore è un fatto, la pausa una stima: vince il fatto');
});

test('CACHE-183-03 — stessa impronta e stesso fornitore (o fornitore non detto): la cache l\'ha persa il fornitore, e lo si dice', () => {
  assert.equal(motivoDellaCacheRicominciata(letta({ fornitore: 'Particle AI' }), imp(), { tokenDaCache: 0, ora: 60_000, fornitore: 'Particle AI' }), 'persa-dal-fornitore');
  assert.equal(motivoDellaCacheRicominciata(letta(), imp(), { tokenDaCache: 0, ora: 60_000 }), 'persa-dal-fornitore', 'una strada che non dice il fornitore (DeepSeek diretto)');
  assert.equal(motivoDellaCacheRicominciata(letta({ fornitore: 'Particle AI' }), imp(), { tokenDaCache: 0, ora: 60_000 }), 'persa-dal-fornitore', 'un lato senza nome non è un cambio');
  assert.equal(motivoDellaCacheRicominciata(letta(), imp(), { tokenDaCache: 0, ora: 60_000, fornitore: 'Wafer' }), 'persa-dal-fornitore', 'nemmeno quando il nome manca nel giro di prima');
  assert.equal(motivoDellaCacheRicominciata(letta({ fornitore: 'Particle AI' }), imp(), { tokenDaCache: 0, ora: 301_000, fornitore: 'Particle AI' }), 'pausa', 'oltre la durata resta «pausa»');
  assert.equal(motivoDellaCacheRicominciata(letta({ fornitore: 'Particle AI' }), imp(), { tokenDaCache: 8_000, ora: 60_000, fornitore: 'Wafer' }), null, 'riletti: niente da dire');
});

test('CACHE-183-04 — dal giro vero: il risveglio che il fornitore rilegge da zero dice chi l\'ha persa; lo stato porta il fornitore', async (t) => {
  const primo = await giro(t, { fetchDiRete: fornitore({ cache: [0, 4_000], chi: ['Particle AI'] }) });
  assert.equal(primo.esito.statoCache?.fornitore, 'Particle AI', 'lo stato della cache ricorda chi ha servito');
  const stesso = await giro(t, { fetchDiRete: fornitore({ cache: [0], chi: ['Particle AI'] }), statoCachePrecedente: primo.esito.statoCache,
    messaggiIniziali: risveglio(primo.esito.messaggiFinali) });
  assert.deepEqual(stesso.eventi.map((e) => e.motivo), ['persa-dal-fornitore']);
  assert.equal(stesso.eventi[0].tokenDaRileggere, 140_000);
  const altro = await giro(t, { fetchDiRete: fornitore({ cache: [0], chi: ['Wafer'] }), statoCachePrecedente: primo.esito.statoCache,
    messaggiIniziali: risveglio(primo.esito.messaggiFinali) });
  assert.deepEqual(altro.eventi.map((e) => e.motivo), ['fornitore']);
});

test('CACHE-183-05 — condizione di Performance (04/11): la ripartenza e il fornitore che ha servito QUELLA richiesta portano lo stesso giro, così si uniscono', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cache-183-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const tutti = [];
  // letti al giro 0 (attrezzo), persi al giro 1 da un altro fornitore: la ripartenza è del giro 1, e così il fornitore che l'ha servita
  await talosLavora({ cartella, task: { consegna: 'elenca' }, modello: 'deepseek/deepseek-v4.1-flash-1017', chiave: 'k',
    fetchDiRete: fornitore({ cache: [4_000, 0], chi: ['Particle AI', 'Wafer'] }),
    onGiro: (e) => { if (e?.tipo === 'cache-ricominciata' || e?.tipo === 'fornitore-a-valle') tutti.push({ tipo: e.tipo, giro: e.giro, fornitore: e.fornitore ?? null, motivo: e.motivo ?? null }); } });
  const ripartenza = tutti.find((e) => e.tipo === 'cache-ricominciata');
  assert.equal(ripartenza?.motivo, 'fornitore', 'premessa');
  const delGiro = tutti.filter((e) => e.tipo === 'fornitore-a-valle' && e.giro === ripartenza.giro);
  assert.deepEqual(delGiro.map((e) => e.fornitore), ['Wafer'], 'col numero del giro si trova chi ha servito la richiesta ripartita');
  assert.deepEqual(tutti.filter((e) => e.tipo === 'fornitore-a-valle').map((e) => e.giro), [0, 1], 'un giro per richiesta, mai lo stesso numero due volte');
});
