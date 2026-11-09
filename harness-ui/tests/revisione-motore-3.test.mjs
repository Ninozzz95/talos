/*
 * Third adversarial review of the local engine block (`REVISIONE-BLOCCO-MOTORE-3-2026-11-01.md`): the defects that were cured, as tests that were red.
 * D1 (the summary on another local model) waits for the owner: it changes a contract of the common kernel.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as ms } from 'node:timers/promises';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaAperturaCondivisa } from '../src/apertura-condivisa.mjs';
import { creaCambioDiModello } from '../src/attesa-turno.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createSessionRegistry, giroSulModelloLocale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { EventEmitter } from 'node:events';
import { chiaviDagliArgomenti } from '../src/llama-router-supervisor.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { regolaCopiaInRam, regolaEmulati, regolaCambi, regolaMescolamento, regolaNonPeggiore, regolaScheda, regolaTenuta, verdettoBraccio, giudizio } from '../scripts/banco-regole.mjs';

const RISPOSTA = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'x' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const URL_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const corpoDi = (model) => JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: 'x' }] });

function fila({ giri, giroDi, occupato = async () => false, quieteMs = 120_000 } = {}) {
  const s = { state: 'ready', modelId: 'a' };
  const aperture = [];
  const scarichi = [];
  const cambio = creaCambioDiModello({ stato: () => s, scarica: async () => { scarichi.push(s.modelId); s.state = 'unavailable'; s.modelId = null; }, giriInCorso: () => giri(), giroDi, motoreOccupato: (o) => occupato(o), ogniMs: 1, quieteMs, registro: () => {} });
  const condivisa = creaAperturaCondivisa({ apri: async (modelId) => { aperture.push(modelId); s.state = 'ready'; s.modelId = modelId; return { state: 'ready', modelId }; } });
  const avvia = (modelId, sessione, signal) => condivisa.apri(modelId, { signal, coda: true, prima: (segnale) => cambio.prepara(modelId, segnale, { sessione }) });
  return { s, aperture, scarichi, cambio, condivisa, avvia };
}

test('D3 a conversation that ends its turn and opens a new one stands behind, also while the engine works', async () => {
  let turnoDiA = 1;
  let occupatoOra = true;
  const f = fila({ giri: () => ['A'], giroDi: () => turnoDiA, occupato: async () => occupatoOra });
  const stop = new AbortController();
  const cambio = f.avvia('b', 'B', stop.signal);
  await ms(10);
  assert.equal(f.cambio.staDietro('A'), false, 'its turn was open when B asked');
  turnoDiA = 2;
  assert.equal(f.cambio.staDietro('A'), true, 'the new turn is behind at once');
  await ms(10);
  assert.deepEqual(f.aperture, [], 'the engine is still at work: the door is closed and nothing is unloaded');
  occupatoOra = false;
  await cambio;
  assert.deepEqual(f.aperture, ['b']);
});

test('D3 the same conversation in the same turn goes on: only a new turn stands behind', async () => {
  const f = fila({ giri: () => ['A'], giroDi: () => 7, occupato: async () => true });
  const stop = new AbortController();
  const cambio = f.avvia('b', 'B', stop.signal);
  cambio.catch(() => {});
  await ms(10);
  assert.equal(f.cambio.staDietro('A'), false);
  assert.equal(f.cambio.staDietro('altra'), true);
  stop.abort(new Error('fine'));
  await cambio.catch(() => {});
});

test('M1 the engine falls during the wait: nobody holds the change, and the admitted turn is not left behind', async () => {
  const f = fila({ giri: () => ['A'] });
  const stopB = new AbortController();
  const b = f.avvia('b', 'B', stopB.signal);
  await ms(10);
  f.s.state = 'failed';
  f.s.modelId = null;
  await b;
  assert.deepEqual(f.aperture, ['b']);
  assert.deepEqual(f.scarichi, [], 'nothing to unload');
});

test('fourth review D5: a dead process keeps its name in the status: the state says it is gone', async () => {
  const f = fila({ giri: () => ['A'] });
  const b = f.avvia('b', 'B', new AbortController().signal);
  await ms(5);
  f.s.state = 'failed'; // `onClose` keeps `current`: the status still answers `modelId: 'a'`
  await b;
  assert.deepEqual(f.aperture, ['b']);
});

for (const stato of ['loading', 'stopping']) {
  test(`M1 an engine ${stato} is not an engine gone: the wait goes on, with the door open for the turn it protects`, async () => {
    const f = fila({ giri: () => ['A'] });
    const stop = new AbortController();
    const b = f.avvia('b', 'B', stop.signal);
    b.catch(() => {});
    await ms(5);
    f.s.state = stato;
    f.s.modelId = null;
    await ms(10);
    assert.deepEqual(f.aperture, []);
    assert.equal(f.cambio.portaChiusa(), false, 'a window that grows: the admitted turn still has to finish');
    stop.abort(new Error('fine'));
    await b.catch(() => {});
  });
}

test('D2 the selector moved during a turn: the turn counts for the model it started with', async () => {
  const voce = { provider: 'cloud', modello: 'local:b', modelId: 'local:b', modelloDelGiro: 'local:a', conclusa: false };
  assert.equal(giroSulModelloLocale(voce, 'a'), true);
  assert.equal(giroSulModelloLocale(voce, 'b'), false);
  const f = fila({ giri: () => (giroSulModelloLocale(voce, 'a') ? ['A'] : []), occupato: async () => true });
  const stop = new AbortController();
  const c = f.avvia('c', 'C', stop.signal);
  c.catch(() => {});
  await ms(20);
  assert.deepEqual(f.scarichi, [], 'the model does not go from under the turn');
  stop.abort(new Error('fine'));
  await c.catch(() => {});
});

test('D2 a conversation with no turn started yet is read from its selector, as before', () => {
  assert.equal(giroSulModelloLocale({ modello: 'local:a', modelId: 'local:a', provider: 'cloud', conclusa: false }, 'a'), true);
});

test('D2 and D3 on the real registry: the turn keeps its model when the selector moves, and each turn has its number', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-rev3-'));
  const fine = [];
  const registry = createSessionRegistry({ cartellaStore, modello: 'local:a', chiave: 'k', cartellaEsisteFn: () => true,
    avviaSessioneFn(input) { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise((r) => fine.push(r)); },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'leggi' } }) });
  t.after(async () => {
    for (const r of fine) r({});
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* the folder goes anyway */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale', modello: 'local:a' });
  await ms(5);
  assert.deepEqual(registry.giriSulModelloLocale('a'), [sessionId]);
  assert.equal(registry.giroDellaSessione(sessionId), 1);
  assert.equal(registry.giroDellaSessione('nessuna'), null);
  await registry.aggiornaImpostazioni(sessionId, { modello: 'local:b' });
  assert.deepEqual(registry.giriSulModelloLocale('a'), [sessionId], 'the turn in course stays on its model');
  assert.deepEqual(registry.giriSulModelloLocale('b'), []);
});

test('M4 the road with a provider store, the road of the product: the session reaches ready and opening', async () => {
  const pronti = [];
  const aperture = [];
  let aperto = false;
  const providerStore = { scegliChiave: () => null, getRuntime: () => ({}), hasKey: () => true, elencaPool: () => [], mettiInPanchina() {} };
  const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: (...a) => { pronti.push(a); return aperto; }, avviaLocale: async (...a) => { aperture.push(a); aperto = true; return { state: 'ready' }; },
    chiamaLocale: async () => RISPOSTA() };
  const f = creaFetchMultiProvider(async () => RISPOSTA(), { dipendenze, providerStore, sessioneDelGiro: 'sessione-1', onConsumoFornitore: async () => {} });
  await f(URL_CHAT, { method: 'POST', headers: {}, body: corpoDi('local:mod-a') });
  assert.deepEqual(pronti[0], ['mod-a', { sessione: 'sessione-1' }]);
  assert.equal(aperture[0][1].sessione, 'sessione-1');
});

const corsa = (altro = {}) => ({ tutteOk: true, motoreUsato: 'oggi', saltate: [], avvioS: 10, primoSegnoFreddo: { primoSegnoMs: 1000 }, ricopia: { rinomina: true }, ...altro });
const tre = (altro) => [corsa(altro), corsa(altro), corsa(altro)];

test('D5 an arm passes only on the engine it is named after', () => {
  const v = (braccio, corse) => verdettoBraccio({ braccio, corse, ripetizioni: 3 });
  assert.equal(v('m|nuovo', tre()).passa, true);
  assert.equal(v('m|router', tre({ motoreUsato: 'router' })).passa, true);
  assert.equal(v('m|router', tre({ motoreUsato: 'ripiego-su-oggi' })).passa, false, 'a router that fell back measured today\'s engine');
  assert.equal(v('m|router', tre()).passa, false);
  assert.equal(v('m|nuovo', tre({ ripiegoProcessore: { da: 'vulkan', a: 'cpu' } })).passa, false, 'a broken card must not pass on the processor');
  assert.equal(v('m|nuovo', [corsa(), corsa()]).passa, false, 'two runs');
  assert.equal(v('m|nuovo', [...tre(), corsa({ errore: 'x' })]).passa, false, 'one fell');
  assert.equal(v('m|nuovo', [corsa({ tutteOk: undefined }), corsa(), corsa()]).passa, false, 'crashed before the checks');
  assert.deepEqual(v('m|nuovo', [corsa({ saltate: ['a'] }), corsa({ saltate: ['a', 'b'] }), corsa()]).saltate, ['a', 'b']);
  assert.equal(v('m|nuovo', tre({ ripiegoProcessore: { a: 'cpu' } })).ripieghiProcessore, 3);
  assert.deepEqual(v('m|router', [corsa({ motoreUsato: 'router' }), corsa({ motoreUsato: 'ripiego-su-oggi' })]).motoriUsati, ['router', 'ripiego-su-oggi']);
});

test('D5 5% on opening and first sign, on medians, and the answers not worse', () => {
  const base = tre();
  assert.equal(regolaNonPeggiore(base, tre({ avvioS: 10.5, primoSegnoFreddo: { primoSegnoMs: 1050 } })).esito, 'passa');
  assert.equal(regolaNonPeggiore(base, tre({ avvioS: 10.6 })).esito, 'non passa');
  assert.equal(regolaNonPeggiore(base, tre({ primoSegnoFreddo: { primoSegnoMs: 1060 } })).esito, 'non passa');
  assert.equal(regolaNonPeggiore(base, tre({ ricopia: { rinomina: false } })).esito, 'non passa', 'faster and worse');
  assert.equal(regolaNonPeggiore(tre({ avvioS: 20 }), base).esito, 'passa', 'better is fine');
  assert.equal(regolaNonPeggiore(base, [corsa(), corsa()]).esito, 'non misurato');
  assert.equal(regolaNonPeggiore([], base).esito, 'non misurato');
  assert.equal(regolaNonPeggiore(base, tre({ avvioS: undefined })).esito, 'non misurato');
  assert.equal(regolaNonPeggiore(base, tre({ errore: 'x' })).esito, 'non misurato');
  assert.equal(regolaNonPeggiore(base, [corsa({ avvioS: 30 }), corsa(), corsa()]).esito, 'passa', 'one slow load is what a median is for');
});

const passi = (extra = {}) => ['a', 'b', 'a', 'b', 'a'].map((modello, i) => ({ modello, usataMiB: modello === 'a' ? 2000 + i : 3000, ripieghi: 0, ...extra }));

test('D5 five changes out of five, on the router, the memory the same every time', () => {
  assert.equal(regolaCambi({ passi: passi(), liberazione: { tornata: true } }).esito, 'passa');
  assert.equal(regolaCambi({ passi: passi(), liberazione: { tornata: false } }).esito, 'non passa', 'the memory did not come back');
  const cresce = passi();
  cresce[4].usataMiB = 2600;
  assert.equal(regolaCambi({ passi: cresce, liberazione: { tornata: true } }).esito, 'non passa', 'the old one stayed in memory');
  assert.equal(regolaCambi({ passi: passi({ ripieghi: 1 }), liberazione: { tornata: true } }).esito, 'non misurato');
  assert.equal(regolaCambi({ passi: passi({ usataMiB: null }), liberazione: { tornata: true } }).esito, 'non misurato');
  assert.equal(regolaCambi({ passi: passi().slice(0, 4), liberazione: { tornata: true } }).esito, 'non misurato');
  assert.equal(regolaCambi({ passi: passi(), errore: 'x' }).esito, 'non misurato');
  assert.equal(regolaCambi(null).esito, 'non misurato');
});

const uno = (altro = {}) => ({ posti: 1, coppie: 100, mescolate: 0, senzaCodice: 0, ripristiniProvati: 80, motoreUsato: 'router', ...altro });
const quattro = (altro = {}) => uno({ posti: 4, motoreUsato: 'oggi', ...altro });

test('D4 the mixed answers count only through the memory they must prove, and one mix closes it', () => {
  assert.equal(regolaMescolamento([uno(), quattro()]).esito, 'passa');
  assert.equal(regolaMescolamento([uno({ coppie: 20, ripristiniProvati: 20 }), quattro()]).esito, 'non misurato', 'the owner said one hundred pairs');
  assert.equal(regolaMescolamento([uno({ coppie: 20, mescolate: 1 }), quattro()]).esito, 'non passa', 'one mix closes it on any number of pairs');
  assert.equal(regolaMescolamento([uno({ mescolate: 1 }), quattro()]).esito, 'non passa');
  assert.equal(regolaMescolamento([uno(), quattro({ mescolate: 1, errore: 'x' })]).esito, 'non passa', 'a mix seen is a mix, whatever came after');
  assert.equal(regolaMescolamento([uno({ ripristiniProvati: 0 }), quattro()]).esito, 'non misurato', 'zero mixes on a road that saves nothing proves nothing');
  assert.equal(regolaMescolamento([uno({ ripristiniProvati: 49 }), quattro()]).esito, 'non misurato');
  assert.equal(regolaMescolamento([uno({ ripristiniProvati: 50 }), quattro()]).esito, 'passa');
  assert.equal(regolaMescolamento([uno({ ripristiniProvati: 60, fermataMemoria: true }), quattro()]).esito, 'non misurato', 'fourth review M5: stopped by the sentinel, the pairs asked are not the pairs made');
  assert.equal(regolaMescolamento([uno({ ripristiniProvati: undefined }), quattro()]).esito, 'non misurato');
  assert.equal(regolaMescolamento([uno()]).esito, 'non misurato', 'four slots not run');
  assert.equal(regolaMescolamento([uno({ senzaCodice: 1 }), quattro()]).esito, 'non misurato');
  assert.equal(regolaMescolamento([uno({ motoreUsato: 'ripiego-su-oggi' }), quattro()]).esito, 'non misurato', 'the router never ran');
  assert.equal(regolaMescolamento([uno({ errore: 'x' }), quattro()]).esito, 'non misurato');
  assert.equal(regolaMescolamento([]).esito, 'non misurato');
});

test('D5 ten minutes: a collapse closes it, a run cut short is not a measure', () => {
  assert.equal(regolaTenuta({ crollo: false, prima: 30, ultima: 29 }).esito, 'passa');
  assert.equal(regolaTenuta({ crollo: true }).esito, 'non passa');
  assert.equal(regolaTenuta({ errore: 'x', crollo: false }).esito, 'non misurato');
  assert.equal(regolaTenuta({}).esito, 'non misurato');
  assert.equal(regolaTenuta(undefined).esito, 'non misurato');
});

test('M2 the card: a drop during the run, and a card already slow at the start, void it', () => {
  assert.equal(regolaScheda({ inizio: 100, fine: 80 }).corsaValida, true);
  assert.equal(regolaScheda({ inizio: 100, fine: 79 }).corsaValida, false);
  assert.equal(regolaScheda({ inizio: 100, fine: 100, riferimento: 125 }).corsaValida, true);
  assert.equal(regolaScheda({ inizio: 100, fine: 100, riferimento: 126 }).corsaValida, false, 'slow already at the start: the drop alone would not see it');
  assert.equal(regolaScheda({ inizio: 0, fine: 100 }).corsaValida, false);
  assert.equal(regolaScheda({ inizio: 100, fine: 0 }).corsaValida, false);
  assert.equal(regolaScheda({ inizio: 100, fine: 100 }).sulRiferimento, null);
});

const compiti = (caso, altro = {}) => [1, 2, 3].flatMap(() => ['legge', 'chiama', 'non-chiama'].map((compito) => ({ caso, compito, riuscito: true, ...(compito === 'legge' ? { promptDopo: 2100, pezzoNuovo: 2000, promptTotale: 2500 } : {}), ...altro })));

test('emulated tools: three tasks out of three, every repetition, not worse than the free format, and the prefix kept', () => {
  assert.equal(regolaEmulati([...compiti('emulata'), ...compiti('libero', { riuscito: false }), ...compiti('chat', { riuscito: false })]).esito, 'passa');
  const una = compiti('emulata');
  una[4].riuscito = false;
  assert.equal(regolaEmulati(una).esito, 'non passa', 'one failed');
  assert.equal(regolaEmulati(compiti('emulata', { promptDopo: 2301, pezzoNuovo: 2000 })).esito, 'non passa', 'Performance: it reads the history again');
  assert.equal(regolaEmulati(compiti('emulata', { promptDopo: 2300, pezzoNuovo: 2000 })).esito, 'passa', 'fourth review D1: a result that is most of the prompt is what must be read');
  assert.equal(regolaEmulati(compiti('emulata').slice(0, 8)).esito, 'non misurato');
  assert.equal(regolaEmulati(compiti('emulata', { nonEmulabile: true })).esito, 'non misurato', 'the template had tools: nothing was emulated');
  assert.equal(regolaEmulati(compiti('emulata').map((r) => ({ ...r, promptDopo: undefined }))).esito, 'non misurato');
  assert.equal(regolaEmulati(compiti('emulata').map((r, i) => (i === 0 ? { ...r, errore: 'x' } : r))).esito, 'non misurato');
  assert.equal(regolaEmulati([]).esito, 'non misurato');
  assert.deepEqual(regolaEmulati([...compiti('emulata'), ...compiti('libero', { riuscito: false }), ...compiti('chat')]).conteggio, { emulata: 9, libero: 0, chat: 9 });
});

const ram = (caso, altro = {}) => [1, 2, 3].map(() => ({ caso, ramMiB: caso === 'oggi' ? 18000 : 1500, avvioS: caso === 'oggi' ? 14 : 30, primoSegnoMs: 14000, genTs: 19, ...altro }));

test('the copy in RAM: much less memory, first sign and writing not worse; a longer opening is written, it does not decide', () => {
  const esito = regolaCopiaInRam([...ram('oggi'), ...ram('senza')]);
  assert.equal(esito.esito, 'passa');
  assert.deepEqual(esito.ram, [18000, 1500]);
  assert.equal(esito.apertura, 1.143);
  assert.equal(regolaCopiaInRam([...ram('oggi'), ...ram('senza', { ramMiB: 9001 })]).esito, 'non passa', 'it did not really leave');
  assert.equal(regolaCopiaInRam([...ram('oggi'), ...ram('senza', { ramMiB: 9000 })]).esito, 'passa');
  assert.equal(regolaCopiaInRam([...ram('oggi'), ...ram('senza', { primoSegnoMs: 14701 })]).esito, 'non passa');
  assert.equal(regolaCopiaInRam([...ram('oggi'), ...ram('senza', { genTs: 18 })]).esito, 'non passa');
  assert.equal(regolaCopiaInRam([...ram('oggi'), ...ram('senza').slice(1)]).esito, 'non misurato');
  assert.equal(regolaCopiaInRam([...ram('oggi'), ...ram('senza', { errore: 'x' })]).esito, 'non misurato');
  assert.equal(regolaCopiaInRam([...ram('oggi'), ...ram('senza', { ramMiB: null })]).esito, 'non misurato');
  assert.equal(regolaCopiaInRam([]).esito, 'non misurato');
});

async function argomentiDi({ caricamento, gpuLayers = 99, aiuto = '' } = {}) {
  let chiamata;
  const figlio = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill() {}, exitCode: null, pid: 1 });
  const sup = createLlamaServerSupervisor({ binaryPath: 'C:\\t\\llama-server.exe', spawnImpl: (...a) => { chiamata = a; return figlio; }, fetchImpl: async () => ({ status: 200, ok: true }), portAllocator: async () => 18081, pollIntervalMs: 1, gpuLayers, caricamento, aiutoBinario: aiuto });
  await sup.start({ modelPath: 'C:\\m\\modello.gguf' });
  return chiamata[1];
}

test('the load mode reaches the engine only when asked, and only with the whole model on the card', async () => {
  const con = await argomentiDi({ caricamento: 'none' });
  assert.equal(con[con.indexOf('--load-mode') + 1], 'none');
  assert.equal((await argomentiDi({})).includes('--load-mode'), false, 'off by default until the bench promotes it');
  assert.equal((await argomentiDi({ caricamento: 'none', gpuLayers: 0 })).includes('--load-mode'), false, 'on the processor the mapping is what it works on');
});

test('the load mode has its key in the router preset: an argument with no key refuses the preset', () => {
  assert.deepEqual(chiaviDagliArgomenti(['--load-mode', 'none']), [['load-mode', 'none']]);
});

test('the word on a run: green only on all green', () => {
  assert.equal(giudizio(['passa', 'passa']), 'passa');
  assert.equal(giudizio(['passa', 'non misurato']), 'non misurato');
  assert.equal(giudizio(['non misurato', 'non passa']), 'non passa');
  assert.equal(giudizio([]), 'non misurato', 'M6: no run at all is not a green');
});
