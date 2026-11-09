#!/usr/bin/env node
/*
 * ⭐ The engine bench with TALOS' REAL supervisors (01/11/2026), the one that promotes the router and a new llama.cpp. It grows out of
 * `banco-motore-locale.mjs` (seven checks, the engine started by hand) and `misura-grandi.mjs` of 26/10.
 *
 * What it adds, all owner decisions:
 *   - the engine starts through `createLlamaServerSupervisor` and `createLlamaRouterSupervisor`, so window, `-ngl`/`--fit`, KV type and
 *     speculative decoding are the ones the app chooses, not a line written here;
 *   - a warm-up start first, then crossed order (lesson of 26/10: without them «speculative decoding halves the copy» was the cold start);
 *   - old engine against new, router against today's engine, speculative decoding off against on (owner 21/10: on by default after the bench);
 *   - the device memory read from `--list-devices` after a load, after a stop and after a change of model, and how long it takes to come
 *     back (llama.cpp #19627; it also sizes the «wait until the card is free» of A2-1);
 *   - quality next to speed: the same question must still have the right answer;
 *   - the sentinel that stops under 5 GB of commit (Windows charges GPU allocations to commit: the runs of 31/10 died of that, not of RAM).
 *
 * Criteria written BEFORE the runs (`PROGETTO-ROUTER-MOTORE-LOCALE-2026-10-26.md`): no worsening over 5% on load and first word, memory
 * freed on 5 changes out of 5.
 *
 * ⛔ Heavy: one family at a time, 13-18 GB in memory. Before it runs: read CPU, RAM and commit, announce to every session with the end
 * time, a start line and an end line in `registro-corse-pesanti.jsonl`. Local only, on 127.0.0.1, no keys, no paid model.
 *
 * Use: node scripts/banco-motore-vero.mjs --vecchio <dir with llama-server.exe> --nuovo <dir> --cpu <dir> --modelli <a.gguf>,<b.gguf>,<c.gguf> --uscita <file.jsonl>
 */
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as dormi } from 'node:timers/promises';
import { creaLettoreScheda, creaMemoriaScheda, liberaDellaSolaScheda } from '../src/attesa-scheda.mjs';
import { creaEmulatore, creaLettoreSse } from '../src/attrezzi-emulati.mjs';
import { classificaRisposta, codiciAltrui, esitiDelVerdetto, esitoSoloMescolamento, giudizio, pressioneDiMemoria, promozioneDiSerie, regolaCambi, regolaCopiaInRam, regolaEmulati, regolaEsperti, regolaHip, regolaMescolamento, regolaMtp, regolaNonPeggiore, regolaPosti, regolaScheda, regolaTenuta, rinominaRiuscita, verdettoBraccio } from './banco-regole.mjs';
import { readGgufHeader } from '../src/gguf-header.mjs';
import { cartellaScratch } from '../src/scratch.mjs'; // SCRATCH-CANCELLO-01: the bench's throwaway folders under the TALOS scratch root, never in TEMP
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';

const arg = (nome, ripiego = null) => { const i = process.argv.indexOf(`--${nome}`); return i === -1 ? ripiego : process.argv[i + 1]; };
const VECCHIO = arg('vecchio');
const NUOVO = arg('nuovo');
const CPU = arg('cpu');
const MODELLI = String(arg('modelli', '')).split(',').filter(Boolean);
const USCITA = arg('uscita');
const SOGLIA_IMPEGNABILE_GB = Number(arg('soglia-gb', '5'));
const SOGLIA_RAM_GB = Number(arg('soglia-ram-gb', '1.5')); // 02/11: below this the rows are marked «sottoPressione» (doubtful); the run goes on
const ATTESA_MS = 900_000;
const RIPETIZIONI = Number(arg('ripetizioni', '3'));
const COPPIE = Number(arg('coppie', '100')); // the rule wants 100 (owner 01/11): fewer are written, and the rule says not measured
const CARICAMENTO = arg('caricamento'); // `none`: without the copy of the model in RAM (owner 01/11, after the run stopped by low memory)
const SECONDO_MODELLO = arg('secondo-modello'); // only for the change of model, when one family is measured with one version
const RIFERIMENTO_SCHEDA = arg('riferimento-scheda'); // a file per card and driver: `{ "letturaTs": n }`. Written by the first valid run, read by the next
if (!Number.isInteger(RIPETIZIONI) || RIPETIZIONI < 3) { console.error('--ripetizioni: almeno 3, la regola è pass^3'); process.exit(2); }
if (!VECCHIO || !NUOVO || !CPU || !MODELLI.length || !USCITA) { console.error('servono --vecchio --nuovo --cpu --modelli --uscita'); process.exit(2); }

const lancia = promisify(execFile);
const QUI = new URL('..', import.meta.url);
/* Fourth review, D2: the first 6.000 characters stopped 20 before the first `cartellaScratch`: the rename could not succeed on any engine. A piece around it, and a bench that cannot pass stops here */
const SCRATCH = readFileSync(new URL('src/scratch.mjs', QUI), 'utf8');
const FILE_DA_RICOPIARE = SCRATCH.slice(Math.max(0, SCRATCH.indexOf('export function cartellaScratch') - 3000), SCRATCH.indexOf('export function cartellaScratch') + 3000);
if (!/\bcartellaScratch\b/u.test(FILE_DA_RICOPIARE)) { console.error('il pezzo da ricopiare non contiene il nome da cambiare'); process.exit(2); }
const MAX_RICOPIA = 4000; // the piece is about 2.000 words, as JSON more, and the thinking comes first: at 2.400 the copy of 01/11 stopped at the limit on both engines
const PROMPT_LUNGO = readFileSync(new URL('src/llama-server-supervisor.mjs', QUI), 'utf8').slice(0, 15000);
const ATTREZZO = { type: 'function', function: { name: 'get_time', description: 'Get the current time in a city.', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } };
const scrivi = (riga) => { appendFileSync(USCITA, `${JSON.stringify(riga)}\n`); console.log(JSON.stringify(riga).slice(0, 400)); };

const unite = (uscita) => [uscita.stdout, uscita.stderr].join('\n');
async function buildDi(dir) {
  const uscita = await lancia(join(dir, 'llama-server.exe'), ['--version'], { windowsHide: true });
  return /build (\d+), commit ([0-9a-f]+)/u.exec(unite(uscita))?.slice(1, 3).join(' ') ?? 'ignota';
}
/** `Vulkan0: AMD Radeon RX 9070 XT (16304 MiB, 15419 MiB free)`: what the device says it has free now. */
async function memoriaLibera(dir) {
  const uscita = await lancia(join(dir, 'llama-server.exe'), ['--list-devices'], { windowsHide: true, timeout: 20_000 });
  return Number(liberaDellaSolaScheda(unite(uscita))) || null; // the reader of the app: with two cards it does not guess (third review, M10)
}
/**
 * Fourth review, D7: `--list-devices` is a new process, and Vulkan gives it the budget of a new process: 1,454 MiB less with a 15,702 MiB model on the card. What the card really holds
 * comes from Windows, with a class name that does not change with the language of the system. Summed over the adapters: the virtual display reads zero.
 */
async function schedaUsataMiB() {
  const { stdout } = await lancia('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | Measure-Object -Property DedicatedUsage -Sum).Sum'], { windowsHide: true, timeout: 20_000 }).catch(() => ({ stdout: '' }));
  const byte = Number(stdout.trim());
  return stdout.trim() && Number.isFinite(byte) ? Math.round(byte / 2 ** 20) : null;
}
/** How long the card takes to give the memory back, up to 15 s (A2-1). */
async function tempoDiLiberazione(_dir, riferimentoMiB) {
  const inizio = Date.now();
  let ultima = null;
  while (Date.now() - inizio < 15_000) {
    ultima = await schedaUsataMiB();
    if (ultima !== null && riferimentoMiB !== null && ultima <= riferimentoMiB + 256) return { ms: Date.now() - inizio, usataMiB: ultima, tornata: true };
    await dormi(250);
  }
  return { ms: Date.now() - inizio, usataMiB: ultima, tornata: false };
}
/* the pages of the process in RAM now, the mapping too: under pressure Windows takes them away, so the private memory and the free memory of the system are written next to it */
async function ramDel(pid) {
  const { stdout } = await lancia('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$p = Get-Process -Id ${Number(pid)}; $o = Get-CimInstance Win32_OperatingSystem; "$($p.WorkingSet64) $($p.PrivateMemorySize64) $($o.FreePhysicalMemory)"`], { windowsHide: true, timeout: 20_000 });
  const [lavoro, privata, liberaKb] = stdout.trim().split(' ').map(Number);
  return { ramMiB: Math.round(lavoro / 2 ** 20), privataMiB: Math.round(privata / 2 ** 20), sistemaLiberaMiB: Math.round(liberaKb / 1024) };
}
/* 02/11: commit AND free RAM in one reading (ERNIE Q6 paged with 15 GB of commit left: the commit alone did not see it) */
async function memoriaGb() {
  /* Performance's review (02/11): the real sign of paging is the pages read from disk, read with it (the CIM class has the same name on
     an Italian Windows, the \Memory\ counter path does not). Second read (S3): the formatted counter is an instant sample, a fresh
     PowerShell read it as 0, 127, 0; the first query only primes it, the value is the one taken one second later. */
  const { stdout } = await lancia('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$o = Get-CimInstance Win32_OperatingSystem; $null = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; Start-Sleep -Milliseconds 1000; $m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; "$($o.FreeVirtualMemory) $($o.FreePhysicalMemory) $($m.PagesInputPersec)"'], { windowsHide: true, timeout: 20_000 });
  const [impegnabileKb, liberaKb, pagineInput] = stdout.trim().split(' ').map(Number);
  return { impegnabileGb: impegnabileKb / 2 ** 20, liberaGb: liberaKb / 2 ** 20, pagineInputSec: pagineInput };
}
async function impegnabileGb() { return (await memoriaGb()).impegnabileGb; }

const MOLTI_ATTREZZI = Array.from({ length: 39 }, (_, i) => ({ type: 'function', function: { name: `service_action_${i}`, description: `Service action number ${i}: unrelated to clocks or cities.`, parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } } }));

async function chat(sup, corpo) {
  const t0 = performance.now();
  const r = await sup.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ATTESA_MS),
    body: JSON.stringify({ temperature: 0, cache_prompt: false, ...corpo }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  const t = j.timings ?? {};
  const m = j.choices?.[0]?.message ?? {};
  return { misura: { ms: Math.round(performance.now() - t0), promptN: t.prompt_n, cacheN: t.cache_n, promptTs: Math.round(t.prompt_per_second ?? 0), genN: t.predicted_n, genTs: +(t.predicted_per_second ?? 0).toFixed(1), bozze: t.draft_n, bozzeOk: t.draft_n_accepted }, messaggio: m };
}

/**
 * The owner's criterion (01/11/2026): the FIRST SIGN of an answer, reasoning or text. The first visible word is always written next to it,
 * so both numbers stand. Streamed, because `timings` cannot say when the first token reached the person.
 */
async function primaParola(sup, messaggi, { cachePrompt = false, tools, tempi = false } = {}) {
  const t0 = performance.now();
  const controllo = new AbortController();
  const tetto = AbortSignal.any([controllo.signal, AbortSignal.timeout(ATTESA_MS)]);
  const r = await sup.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: tetto,
    body: JSON.stringify({ stream: true, temperature: 0, cache_prompt: cachePrompt, max_tokens: 512, messages: messaggi, ...(tools ? { tools } : {}), ...(tempi ? { timings_per_token: true } : {}) }) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const esito = { primoSegnoMs: null, primaVisibileMs: null, ...(tempi ? { promptN: null, cacheN: null } : {}) };
  const lettore = r.body.getReader();
  const decodifica = new TextDecoder();
  let resto = '';
  try {
    for (;;) {
      const { value, done } = await lettore.read();
      if (done) break;
      resto += decodifica.decode(value, { stream: true });
      const righe = resto.split('\n');
      resto = righe.pop();
      for (const riga of righe) {
        if (!riga.startsWith('data: ') || riga.includes('[DONE]')) continue;
        const voce = JSON.parse(riga.slice(6));
        const pezzo = voce?.choices?.[0]?.delta ?? {};
        const ms = Math.round(performance.now() - t0);
        /* `server-context.cpp:2384`: with `timings_per_token` the partial chunks carry them too, so the cost is known before the abort below */
        if (tempi && esito.promptN === null && voce?.timings) { esito.promptN = voce.timings.prompt_n ?? null; esito.cacheN = voce.timings.cache_n ?? null; }
        if (esito.primoSegnoMs === null && (pezzo.content || pezzo.reasoning_content)) esito.primoSegnoMs = ms;
        if (esito.primaVisibileMs === null && pezzo.content) esito.primaVisibileMs = ms;
      }
      if (esito.primaVisibileMs !== null) { controllo.abort(); break; }
    }
  } catch (e) { if (!controllo.signal.aborted) throw e; }
  return esito;
}

async function controlla(nome, fn) {
  try { const d = await fn(); return { controllo: nome, esito: d === 'n/a' ? 'n/a' : 'ok', ...(d && d !== 'n/a' ? { dettaglio: String(d).slice(0, 80) } : {}) }; }
  catch (e) { return { controllo: nome, esito: 'fallito', motivo: String(e?.message ?? e).slice(0, 200) }; }
}
const pulito = (testo) => { if (/<\/?think>/iu.test(testo)) throw new Error(`<think> nel testo: ${testo.slice(0, 80)}`); if (!testo.trim()) throw new Error('testo vuoto'); return testo.trim(); };

/** The checks the app depends on, as in `banco-motore-locale.mjs`, plus a question with one right answer. */
async function controlli(sup) {
  const righe = [];
  let props = {};
  righe.push(await controlla('props', async () => { props = await (await sup.request('/props', { signal: AbortSignal.timeout(10_000) })).json(); if (!props?.chat_template) throw new Error('nessun template'); return props.build_info; }));
  righe.push(await controlla('testo', async () => pulito(String((await chat(sup, { max_tokens: 512, messages: [{ role: 'user', content: 'Reply with exactly one word: ready' }] })).messaggio.content ?? ''))));
  righe.push(await controlla('giusta', async () => { const t = pulito(String((await chat(sup, { max_tokens: 2048, messages: [{ role: 'user', content: 'What is 17 times 23? Answer with the number only.' }] })).messaggio.content ?? '')); if (!/\b391\b/u.test(t)) throw new Error(`sbagliata: ${t.slice(0, 60)}`); return t; }));
  let chiamata = null;
  const domanda = { role: 'user', content: 'What time is it in Rome? Use the get_time tool.' };
  righe.push(await controlla('attrezzo', async () => {
    const m = (await chat(sup, { max_tokens: 1024, messages: [domanda], tools: [ATTREZZO] })).messaggio;
    const c = m.tool_calls?.[0];
    if (!c) throw new Error(`nessuna chiamata: ${String(m.content ?? '').slice(0, 100)}`);
    if (c.function?.name !== 'get_time') throw new Error(`nome ${c.function?.name}`);
    JSON.parse(c.function?.arguments || '{}');
    chiamata = { messaggio: m, id: c.id };
    return c.function.arguments;
  }));
  righe.push(await controlla('esito', async () => {
    if (!chiamata) throw new Error('nessuna chiamata da chiudere');
    return pulito(String((await chat(sup, { max_tokens: 1024, tools: [ATTREZZO], messages: [domanda, { role: 'assistant', content: chiamata.messaggio.content ?? '', tool_calls: chiamata.messaggio.tool_calls }, { role: 'tool', tool_call_id: chiamata.id, content: '14:05' }] })).messaggio.content ?? ''));
  }));
  righe.push(await controlla('senza-ragionamento', async () => {
    if (!/<think>|reasoning|thinking/iu.test(String(props.chat_template))) return 'n/a';
    const r = String((await chat(sup, { max_tokens: 256, thinking_budget_tokens: 0, messages: [{ role: 'user', content: 'Say hi.' }] })).messaggio.reasoning_content ?? '');
    if (r.trim()) throw new Error(`ragiona lo stesso (${r.length} caratteri)`);
    return null;
  }));
  /* Regressions from the list of 01/11: an agent offers dozens of tools, and a call that comes after the thinking must not stay inside it */
  righe.push(await controlla('molti-attrezzi', async () => {
    const m = (await chat(sup, { max_tokens: 1024, messages: [domanda], tools: [...MOLTI_ATTREZZI, ATTREZZO] })).messaggio;
    const c = m.tool_calls?.[0];
    if (c?.function?.name !== 'get_time') throw new Error(`tra ${MOLTI_ATTREZZI.length + 1} attrezzi: ${c?.function?.name ?? `nessuna chiamata, ${String(m.content ?? '').slice(0, 80)}`}`);
    JSON.parse(c.function.arguments || '{}');
    return null;
  }));
  righe.push(await controlla('ragiona-poi-attrezzo', async () => {
    if (!/<think>|reasoning|thinking/iu.test(String(props.chat_template))) return 'n/a';
    const m = (await chat(sup, { max_tokens: 2048, messages: [{ role: 'user', content: 'Think step by step about which tool fits, then find out what time it is in Rome.' }], tools: [ATTREZZO] })).messaggio;
    if (m.tool_calls?.[0]?.function?.name !== 'get_time') throw new Error(`nessuna chiamata: ${String(m.content ?? '').slice(0, 100)}`);
    if (/<tool_call|"name"\s*:\s*"get_time"/u.test(`${m.content ?? ''}${m.reasoning_content ?? ''}`)) throw new Error('la chiamata è rimasta anche nel testo o nel ragionamento');
    return null;
  }));
  righe.push(await controlla('stream', async () => {
    const r = await sup.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000), body: JSON.stringify({ stream: true, max_tokens: 64, temperature: 0, messages: [{ role: 'user', content: 'Count from 1 to 5.' }] }) });
    const corpo = await r.text();
    if (!corpo.includes('data: [DONE]')) throw new Error('niente [DONE]');
    return null;
  }));
  return { righe, build: props.build_info ?? null, effettiva: { finestra: props.default_generation_settings?.n_ctx ?? null, posti: props.total_slots ?? null } };
}

async function finestraDiRiserva(modello) {
  try { return Math.max(8192, Math.min((await readGgufHeader(modello))?.trainedContext || 16384, 16384)); } catch { return 8192; }
}

/* A2-1: as in `server.mjs`, one record per card, kept from one load to the next. Performance: the wait is written next to the load time, never inside it unnoticed. */
const schede = new Map();
function schedaDi(dir) {
  if (!schede.has(dir)) schede.set(dir, creaMemoriaScheda({ leggi: creaLettoreScheda({ binaryPath: join(dir, 'llama-server.exe') }) }));
  return schede.get(dir);
}
function attesaDellaScheda(dir, primaDellAvvio) {
  const ultima = schedaDi(dir).ultima();
  return ultima && ultima !== primaDellAvvio ? { esito: ultima.esito, ms: ultima.ms } : null;
}

/* Fourth review, M1: whatever happens, no engine stays on the card. Every opening is here until it is closed */
const daChiudere = new Set();
const conChiusura = (chiudi) => { const una = async () => { daChiudere.delete(una); await chiudi(); }; daChiudere.add(una); return una; };
async function chiudiTutto(motivo) {
  console.log(`⛔ ${motivo}: chiudo ${daChiudere.size} motori`);
  await Promise.allSettled([...daChiudere].map((f) => f()));
}
for (const segnale of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(segnale, () => { chiudiTutto(segnale).finally(() => { console.log('EXIT=130'); process.exit(130); }); });
process.on('uncaughtException', (e) => { chiudiTutto(String(e?.message ?? e).slice(0, 200)).finally(() => { console.log('EXIT=1'); process.exit(1); }); });
process.on('unhandledRejection', (e) => { chiudiTutto(String(e?.message ?? e).slice(0, 200)).finally(() => { console.log('EXIT=1'); process.exit(1); }); });
process.stdout.on('error', () => { /* the reader went away: the run closes by its own guards, and the rows are in the file */ });

function creaSupervisori(opzioni) {
  const { sup, chiudi } = creaSupervisoriNudi(opzioni);
  return { sup, chiudi: conChiusura(async () => { await sup.stop().catch(() => {}); await chiudi(); }) };
}
function creaSupervisoriNudi({ dir, speculativa, router, modelli }) {
  const scheda = schedaDi(dir);
  const standalone = createLlamaServerSupervisor({ binaryPath: join(dir, 'llama-server.exe'), fallbackBinaryPath: join(CPU, 'llama-server.exe'), motore: { variante: 'vulkan', dispositivi: [] }, scheda,
    modelStore: { lock: async () => {}, unlock: async () => {} }, gpuLayers: 99, finestreFile: null, caricamento: CARICAMENTO, speculativaNgram: speculativa, healthTimeoutMs: 600_000 });
  if (!router) return { sup: standalone, chiudi: () => standalone.stop() };
  const cartella = cartellaScratch('banco-router-');
  const sup = createLlamaRouterSupervisor({ binaryPath: join(dir, 'llama-server.exe'), standalone, scheda, presetFile: join(cartella, 'presets.ini'), healthTimeoutMs: 600_000,
    /* the same margin as `server.mjs`: the larger of 2 GiB and 9% of the card */
    memoriaUtilizzabile: async () => { const totale = 16304 * 2 ** 20; return totale - Math.max(2 * 2 ** 30, Math.floor(totale * 0.09)); },
    modelliInstallati: async () => Promise.all(modelli.map(async (m) => ({ modelId: basename(m), modelPath: m, opzioni: { finestraDiRiserva: await finestraDiRiserva(m) } }))) });
  return { sup, chiudi: async () => { await sup.chiudi(); rmSync(cartella, { recursive: true, force: true }); } };
}

async function sorveglia(azione) {
  const stato = { minimoGb: Infinity, minimoRamGb: Infinity, pagineInputMax: -Infinity, sottoPressione: false, fermato: false };
  const giro = setInterval(() => {
    memoriaGb().then((m) => {
      stato.minimoGb = Math.min(stato.minimoGb, m.impegnabileGb);
      if (Number.isFinite(m.liberaGb)) stato.minimoRamGb = Math.min(stato.minimoRamGb, m.liberaGb);
      if (Number.isFinite(m.pagineInputSec)) stato.pagineInputMax = Math.max(stato.pagineInputMax, m.pagineInputSec);
      const p = pressioneDiMemoria(m, { sogliaImpegnabileGb: SOGLIA_IMPEGNABILE_GB, sogliaRamGb: SOGLIA_RAM_GB });
      if (p.sottoPressione) stato.sottoPressione = true;
      if (p.ferma) { stato.fermato = true; azione(); }
    }).catch(() => {});
  }, 15_000);
  return { stato, fine: () => clearInterval(giro) };
}
/* 02/11, Performance's review S2-1: EVERY measuring row carries the mark, and the rules set a marked row aside (banco-regole.mjs) */
function segnaPressione(riga, guardia) {
  riga.ramLiberaMinimaGb = Number.isFinite(guardia.stato.minimoRamGb) ? +guardia.stato.minimoRamGb.toFixed(1) : null;
  riga.pagineInputSecMax = Number.isFinite(guardia.stato.pagineInputMax) ? Math.round(guardia.stato.pagineInputMax) : null;
  if (guardia.stato.sottoPressione) riga.sottoPressione = true;
}

const corseDelVerdetto = [];
/** One load: load time, the three measures, the checks, the memory before and after. */
async function corsa({ etichetta, dir, modello, speculativa, router, misura = true }) {
  const riga = { etichetta, modello: basename(modello), router, speculativa };
  const prima = await schedaUsataMiB();
  const { sup, chiudi } = creaSupervisori({ dir, speculativa, router, modelli: [modello] });
  const scelte = [];
  const stacca = sup.subscribeLogs((e) => { for (const s of String(e?.text ?? '').split(/\r?\n/u)) if (/\[talos\]/u.test(s) && !/loading /u.test(s)) scelte.push(s.trim().slice(0, 160)); });
  const guardia = await sorveglia(() => { sup.stop().catch(() => {}); });
  try {
    const t0 = Date.now();
    const attesaPrima = schedaDi(dir).ultima();
    await sup.start({ modelId: basename(modello), modelPath: modello, finestraDiRiserva: await finestraDiRiserva(modello) });
    riga.avvioS = +((Date.now() - t0) / 1000).toFixed(1);
    riga.attesaScheda = attesaDellaScheda(dir, attesaPrima); // inside `avvioS`
    const st = sup.status();
    riga.finestra = st.windowTokens ?? null;
    riga.motoreUsato = st.router?.ripieghi?.length ? 'ripiego-su-oggi' : (router ? 'router' : 'oggi');
    riga.ripiegoProcessore = st.motore?.ripiego ? { da: st.motore.ripiego.da, a: st.motore.ripiego.a } : null; // third review, D5: a new engine with a broken card must not pass on the processor
    riga.schedaUsataMiB = await schedaUsataMiB();
    riga.budgetLiberoMiB = await memoriaLibera(dir); // not the card: the budget of a new process (fourth review, D7)
    if (misura) {
      const agente = [{ role: 'system', content: `You are a coding agent. Reference file:\n${PROMPT_LUNGO}` }, { role: 'user', content: 'Reply with one word: ready.' }];
      riga.primaParola = (await chat(sup, { max_tokens: 8, messages: agente })).misura;
      riga.primoSegnoFreddo = await primaParola(sup, agente); // the whole prompt read again: the engine with nothing ready
      riga.primoSegnoCaldo = (await primaParola(sup, agente, { cachePrompt: true }), await primaParola(sup, agente, { cachePrompt: true })); // the first fills the cache, the second is the turn after
      riga.prosa = (await chat(sup, { max_tokens: 600, messages: [{ role: 'user', content: 'Explain in about 250 words how a hash map handles collisions.' }] })).misura;
      const copia = await chat(sup, { max_tokens: MAX_RICOPIA, messages: [{ role: 'user', content: `Rewrite this whole file, renaming the function cartellaScratch to scratchFolder everywhere. Output only the file.\n\n${FILE_DA_RICOPIARE}` }] });
      riga.ricopia = { ...copia.misura, rinomina: rinominaRiuscita(copia.messaggio.content) };
      const { righe, build, effettiva } = await controlli(sup);
      riga.build = build;
      riga.effettiva = effettiva;
      riga.tutteOk = righe.every((c) => c.esito === 'ok' || c.esito === 'n/a');
      riga.saltate = righe.filter((c) => c.esito === 'n/a').map((c) => c.controllo);
      riga.controlli = righe.map((c) => (c.esito === 'ok' ? c.controllo : `${c.controllo}=${c.esito}${c.motivo ? `(${c.motivo})` : ''}`));
    } else {
      await chat(sup, { max_tokens: 4, messages: [{ role: 'user', content: 'hi' }] });
    }
  } catch (e) { riga.errore = `${String(e?.message ?? e).slice(0, 300)}${e?.code ? ` [${e.code}]` : ''}`; }
  guardia.fine();
  stacca();
  await sup.stop().catch(() => {});
  await chiudi().catch(() => {});
  riga.liberazione = await tempoDiLiberazione(dir, prima);
  riga.impegnabileMinimoGb = Number.isFinite(guardia.stato.minimoGb) ? +guardia.stato.minimoGb.toFixed(1) : null;
  segnaPressione(riga, guardia);
  riga.scelte = scelte.slice(0, 8);
  if (guardia.stato.fermato) riga.fermataMemoria = true;
  if (misura) corseDelVerdetto.push(riga);
  if (misura || riga.errore) scrivi(riga);
  if (guardia.stato.fermato) { console.log(`⛔ meno di ${SOGLIA_IMPEGNABILE_GB} GB impegnabili: la corsa si ferma qui`); console.log('EXIT=3'); process.exit(3); }
}

/** A → B → A through the router: the card must hold what B alone holds, the old one really gone (#19627). */
async function cambio({ dir, modelli }) {
  const [a, b] = modelli;
  const riga = { etichetta: 'cambio-di-modello', a: basename(a), b: basename(b), passi: [] };
  const guardia = await sorveglia(() => {}); // 02/11 S2-1: no stop here (it never had one), only the mark
  const base = await schedaUsataMiB();
  const { sup, chiudi } = creaSupervisori({ dir, speculativa: 'auto', router: true, modelli });
  try {
    for (const modello of [a, b, a, b, a]) {
      const t0 = Date.now();
      const attesaPrima = schedaDi(dir).ultima();
      await sup.stop();
      await sup.start({ modelId: basename(modello), modelPath: modello, finestraDiRiserva: await finestraDiRiserva(modello) });
      const ms = Date.now() - t0;
      const attesaScheda = attesaDellaScheda(dir, attesaPrima); // inside `ms`
      await chat(sup, { max_tokens: 4, messages: [{ role: 'user', content: 'hi' }] });
      riga.passi.push({ modello: basename(modello), ms, attesaScheda, finestra: sup.status().windowTokens ?? null, usataMiB: await schedaUsataMiB(), ripieghi: sup.status().router?.ripieghi?.length ?? 0 });
    }
  } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
  guardia.fine();
  segnaPressione(riga, guardia);
  await sup.stop().catch(() => {});
  await chiudi().catch(() => {});
  riga.liberazione = await tempoDiLiberazione(dir, base);
  scrivi(riga);
  return riga;
}

/** Owner 01/11/2026: Stop during an opening cancels it. Desktop: the card must really be free, not only the state at rest. */
async function fermaDuranteLApertura({ dir, modello, router }) {
  const riga = { etichetta: 'ferma', modello: basename(modello), router };
  const base = await schedaUsataMiB();
  const { sup, chiudi } = creaSupervisori({ dir, speculativa: 'auto', router, modelli: [modello] });
  const stop = new AbortController();
  const avvio = sup.start({ modelId: basename(modello), modelPath: modello, finestraDiRiserva: await finestraDiRiserva(modello), signal: stop.signal }).catch((e) => e);
  await dormi(1_500);
  const t0 = Date.now();
  stop.abort();
  const esito = await avvio;
  riga.annullatoMs = Date.now() - t0;
  riga.codice = esito?.code ?? 'nessun errore: il caricamento era già finito';
  riga.stato = sup.status().state;
  try { riga.liberazione = await tempoDiLiberazione(dir, base); } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 200); } finally { await chiudi().catch(() => {}); }
  scrivi(riga);
}

async function caricamentoRotto({ dir }) {
  const cartella = cartellaScratch('banco-rotto-');
  const rotto = join(cartella, 'rotto.gguf');
  writeFileSync(rotto, 'this is not a GGUF file');
  const { sup, chiudi } = creaSupervisori({ dir, speculativa: 'auto', router: true, modelli: [rotto] });
  const errore = await sup.start({ modelId: 'rotto.gguf', modelPath: rotto, finestraDiRiserva: 8192 }).catch((e) => e);
  await chiudi().catch(() => {});
  rmSync(cartella, { recursive: true, force: true });
  scrivi({ etichetta: 'caricamento-rotto', errore: errore instanceof Error, ripiegoRouter: errore?.ripiegoRouter?.codice ?? null, codice: errore?.code ?? null });
}

/*
 * ── The three tweaks the owner sent to the bench (01/11/2026, `ANALISI-MOTORE-LOCALE-B-2026-11-01.md`) ─────────────────────────────
 * Run with `--tweak`, one model at a time, after the comparison above. The engine starts here with the app's own choices
 * (`sceltePerIlRouter`) plus `--slot-save-path`, which the supervisors do not pass yet: this measures the idea before any product code.
 *   foto      the agent prefix saved on disk, restored after a reopening, against the prefix read again. Refuted if the first sign does
 *             not go down, or if the first 64 tokens are not the same.
 *   crescita  a conversation saved, the engine reopened with a window 1.5× larger, restored, against reading it all again. Refuted if the
 *             restore fails or the answer changes.
 *   attrezzi  a file read, then rewritten through a tool call, at the engine's default temperature, with the draft settings off, 24/48/64
 *             and 16/16/256. The speculation measures of 26/10 were all in plain chat: this one is the real path.
 */
const PORTA_TWEAK = Number(arg('porta', '4183'));
const BASE_TWEAK = `http://127.0.0.1:${PORTA_TWEAK}`;
const SCRIVI_FILE = { type: 'function', function: { name: 'write_file', description: 'Write the whole content of a file.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } };
const LEGGI_FILE = { type: 'function', function: { name: 'read_file', description: 'Read a file.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } };
const attrezziAgente = [ATTREZZO, LEGGI_FILE, SCRIVI_FILE];

let motoreAperto = null;
async function apriDiretto({ dir, modello, finestra = null, cartellaFoto, aggiunte = [], senzaSpeculativa = false, posti = 1, caricamento = CARICAMENTO }) {
  /* Third review, M7: an engine left alive by a failed step, or a fake one forgotten on this port, would answer `/health` and be measured as the new one */
  if (motoreAperto) { await motoreAperto(); motoreAperto = null; }
  let sconosciuto = false;
  try { sconosciuto = (await fetch(`${BASE_TWEAK}/health`, { signal: AbortSignal.timeout(1_000) })).status > 0; } catch { /* the port is free */ }
  if (sconosciuto) throw new Error(`la porta ${PORTA_TWEAK} è già occupata`);
  const scelte = await createLlamaServerSupervisor({ binaryPath: join(dir, 'llama-server.exe'), motore: { variante: 'vulkan', dispositivi: [] }, modelStore: { lock: async () => {}, unlock: async () => {} }, gpuLayers: 99, finestreFile: null, caricamento })
    .sceltePerIlRouter({ modelPath: modello, ...(finestra ? { contextLength: finestra } : { finestraDiRiserva: await finestraDiRiserva(modello) }) });
  const argomenti = [...scelte.argomenti];
  if (senzaSpeculativa) { const i = argomenti.indexOf('--spec-type'); if (i !== -1) argomenti.splice(i, 2); }
  if (posti !== 1) { const i = argomenti.indexOf('-np'); if (i !== -1) argomenti[i + 1] = String(posti); else argomenti.push('-np', String(posti)); argomenti.push('--kv-unified'); }
  const t0 = Date.now();
  const motore = spawn(join(dir, 'llama-server.exe'), ['-m', modello, '--host', '127.0.0.1', '--port', String(PORTA_TWEAK), ...argomenti, '--jinja', '--metrics', '--props', '--slot-save-path', cartellaFoto, ...aggiunte],
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, env: { ...process.env, LLAMA_ARG_OFFLINE: '1' } });
  let coda = '';
  motore.stderr.on('data', (d) => { coda = (coda + d).slice(-2000); });
  const chiuso = new Promise((ok) => { motore.once('close', ok); });
  const chiudi = conChiusura(async () => { motore.kill(); await chiuso; motoreAperto = null; });
  motoreAperto = chiudi;
  for (;;) {
    if (motore.exitCode !== null) throw new Error(`il motore è uscito: ${coda.slice(-300)}`);
    if (Date.now() - t0 > 600_000) { await chiudi(); throw new Error('non pronto in 600 s'); }
    try { if ((await fetch(`${BASE_TWEAK}/health`, { signal: AbortSignal.timeout(2_000) })).ok) break; } catch { /* not yet */ }
    await dormi(250);
  }
  return { request: (percorso, opzioni = {}) => fetch(`${BASE_TWEAK}${percorso}`, opzioni), chiudi, coda: () => coda, pid: motore.pid, avvioS: +((Date.now() - t0) / 1000).toFixed(1), finestra: scelte.finestra };
}
const slot = async (sup, azione, filename) => {
  const r = await sup.request(`/slots/0?action=${azione}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }), signal: AbortSignal.timeout(120_000) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${azione}: HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const inizioRisposta = async (sup, messaggi, tools) => String((await chat(sup, { cache_prompt: true, max_tokens: 64, messages: messaggi, ...(tools ? { tools } : {}) })).messaggio.content ?? '');

async function tweakFoto({ dir, modello, cartellaFoto }) {
  const sistema = { role: 'system', content: `You are a coding agent. Reference file:\n${PROMPT_LUNGO}` };
  const prepara = [sistema, { role: 'user', content: 'Hello.' }];
  const domanda = [sistema, { role: 'user', content: 'Reply with one word: ready.' }];
  const file = 'foto-prefisso.bin';
  const riga = { etichetta: 'foto', modello: basename(modello), corse: [] };
  try {
    const m = await apriDiretto({ dir, modello, cartellaFoto });
    /* no tokens generated, the prompt evaluated into the cache (`tools/server/README.md:533`); `max_tokens` is an alias of `n_predict` */
    const t0 = performance.now();
    await chat(m, { cache_prompt: true, max_tokens: 0, messages: prepara, tools: attrezziAgente }).catch((e) => { riga.maxTokensZero = String(e.message).slice(0, 120); });
    riga.preparaMs = Math.round(performance.now() - t0);
    const salvata = await slot(m, 'save', file);
    riga.salvataggio = { ms: Math.round(salvata.timings?.save_ms ?? 0), byte: salvata.n_written, token: salvata.n_saved };
    await m.chiudi();
    for (const caso of ['freddo', 'foto', 'foto', 'freddo']) {
      const s = await apriDiretto({ dir, modello, cartellaFoto });
      const passo = { caso, avvioS: s.avvioS };
      if (caso === 'foto') passo.ripristinoMs = Math.round((await slot(s, 'restore', file)).timings?.restore_ms ?? 0);
      passo.segno = await primaParola(s, domanda, { cachePrompt: true, tools: attrezziAgente });
      passo.testo = await inizioRisposta(s, domanda, attrezziAgente);
      riga.corse.push(passo);
      await s.chiudi();
    }
    riga.stessoTesto = new Set(riga.corse.map((c) => c.testo)).size === 1;
  } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
  scrivi(riga);
}

async function tweakCrescita({ dir, modello, cartellaFoto }) {
  const riga = { etichetta: 'crescita', modello: basename(modello) };
  const file = 'foto-conversazione.bin';
  try {
    const m = await apriDiretto({ dir, modello, cartellaFoto });
    riga.prima = m.finestra;
    riga.dopo = Math.floor(m.finestra * 1.5);
    /* about half the window, as a conversation that is about to outgrow it */
    const quanti = Math.max(1, Math.floor(m.finestra / 12_000));
    const storia = Array.from({ length: quanti }, (_, i) => [{ role: 'user', content: `Read part ${i}:\n${PROMPT_LUNGO}` }, { role: 'assistant', content: 'Read.' }]).flat();
    const domanda = [...storia, { role: 'user', content: 'What is the name of the first function in the last part? One word.' }];
    riga.pieno = (await chat(m, { cache_prompt: true, max_tokens: 1, messages: domanda })).misura;
    riga.salvataggio = await slot(m, 'save', file);
    await m.chiudi();
    for (const caso of ['rifatta', 'ripristinata', 'ripristinata', 'rifatta']) {
      const s = await apriDiretto({ dir, modello, cartellaFoto, finestra: riga.dopo });
      const passo = { caso, avvioS: s.avvioS };
      if (caso === 'ripristinata') {
        try { passo.ripristinoMs = Math.round((await slot(s, 'restore', file)).timings?.restore_ms ?? 0); }
        catch (e) { passo.rifiutato = String(e.message).slice(0, 200); }
      }
      passo.segno = await primaParola(s, domanda, { cachePrompt: true });
      riga[caso] = [...(riga[caso] ?? []), passo];
      await s.chiudi();
    }
  } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
  scrivi(riga);
}

async function tweakAttrezzi({ dir, modello, cartellaFoto }) {
  const domanda = [{ role: 'user', content: 'Read src/scratch.mjs, then write it back renaming cartellaScratch to scratchFolder everywhere.' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"src/scratch.mjs"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: FILE_DA_RICOPIARE }];
  const LEVE = { spenta: { senzaSpeculativa: true }, serie: { aggiunte: ['--spec-ngram-mod-n-match', '24', '--spec-ngram-mod-n-min', '48', '--spec-ngram-mod-n-max', '64'] }, stretta: { aggiunte: ['--spec-ngram-mod-n-match', '16', '--spec-ngram-mod-n-min', '16', '--spec-ngram-mod-n-max', '256'] } };
  for (const caso of ['spenta', 'serie', 'stretta', 'stretta', 'serie', 'spenta']) {
    const riga = { etichetta: 'attrezzi', modello: basename(modello), caso };
    try {
      const s = await apriDiretto({ dir, modello, cartellaFoto, ...LEVE[caso] });
      /* the engine's own default temperature: the product sends none */
      const r = await s.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ATTESA_MS),
        body: JSON.stringify({ max_tokens: MAX_RICOPIA, messages: domanda, tools: attrezziAgente }) });
      const j = await r.json();
      const m = j.choices?.[0]?.message ?? {};
      const t = j.timings ?? {};
      riga.genTs = +(t.predicted_per_second ?? 0).toFixed(1);
      riga.genN = t.predicted_n;
      riga.bozze = t.draft_n;
      riga.bozzeOk = t.draft_n_accepted;
      const c = m.tool_calls?.[0];
      riga.chiamata = c?.function?.name ?? null;
      riga.rinomina = rinominaRiuscita(c?.function?.arguments);
      await s.chiudi();
    } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
    scrivi(riga);
  }
}

/**
 * The idle realign (§3.2 of the second analysis). Many templates drop the thinking of past turns when a new `user` arrives (`Qwen3.5-4B.jinja:100`),
 * and llama-server reuses only the common prefix at the token (`server-context.cpp:4105`), so the first message after a turn full of reads can
 * redo everything that follows that thinking. Three cases on the same conversation, thinking sent back as the product does (`talosHarness.mjs:1394`):
 *   senza       the next message as today;
 *   con         at rest the history plus a service `user` with `max_tokens: 0`, then the next message;
 *   interrotto  the same realign cut 300 ms in, as a person who sends straight away: the price of giving way.
 * `promptN` of `senza` minus `promptN` of `con` is the waste. If they match, this family keeps its prefix and needs no tweak.
 */
const RIORDINO_CASI = ['senza', 'con', 'interrotto', 'senza', 'con'];
async function conversazioneConLetture(s) {
  const storia = [{ role: 'system', content: 'You are a coding agent working in a repository. Use the tools.' },
    { role: 'user', content: 'Read src/scratch.mjs, then src/llama-server-supervisor.mjs, one at a time, then tell me in two sentences how they differ.' }];
  const letture = [['src/scratch.mjs', FILE_DA_RICOPIARE], ['src/llama-server-supervisor.mjs', PROMPT_LUNGO]];
  let daSolo = 0;
  const tieni = (m, altro = {}) => ({ role: 'assistant', content: m.content ?? '', ...(m.reasoning_content ? { reasoning_content: m.reasoning_content } : {}), ...altro });
  for (const [i, [percorso, contenuto]] of letture.entries()) {
    const { messaggio } = await chat(s, { cache_prompt: true, max_tokens: 1200, messages: storia, tools: attrezziAgente });
    if (messaggio.tool_calls?.[0]?.function?.name === 'read_file') daSolo += 1;
    /* the call is fixed, so that a model that skips one read still gives the same conversation shape */
    storia.push(tieni(messaggio, { tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: percorso }) } }] }));
    storia.push({ role: 'tool', tool_call_id: `c${i}`, content: contenuto });
  }
  const { messaggio: finale } = await chat(s, { cache_prompt: true, max_tokens: 1200, messages: storia, tools: attrezziAgente });
  storia.push(tieni(finale));
  return { storia, daSolo, pensiero: storia.filter((m) => m.reasoning_content).length };
}
async function tweakRiordino({ dir, modello, cartellaFoto }) {
  const servizio = { role: 'user', content: '.' };
  const prossimo = { role: 'user', content: 'Name the first function of the second file. One word.' };
  const corpo = (messaggi) => ({ cache_prompt: true, max_tokens: 0, messages: messaggi, tools: attrezziAgente });
  for (const caso of RIORDINO_CASI) {
    const riga = { etichetta: 'riordino', modello: basename(modello), caso };
    try {
      const s = await apriDiretto({ dir, modello, cartellaFoto });
      const { storia, daSolo, pensiero } = await conversazioneConLetture(s);
      riga.letteDaSolo = daSolo;
      riga.turniConPensiero = pensiero;
      if (caso === 'con') {
        const t0 = performance.now();
        const prova = await chat(s, corpo([...storia, servizio])).catch((e) => ({ errore: String(e.message).slice(0, 160) }));
        riga.riordino = prova.errore ? prova : { ms: Math.round(performance.now() - t0), promptN: prova.misura.promptN };
      }
      if (caso === 'interrotto') {
        const taglia = new AbortController();
        const fuori = s.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: taglia.signal, body: JSON.stringify({ temperature: 0, ...corpo([...storia, servizio]) }) }).then((r) => r.text()).catch(() => null);
        await dormi(300);
        taglia.abort();
        await fuori;
      }
      riga.segno = await primaParola(s, [...storia, prossimo], { cachePrompt: true, tools: attrezziAgente, tempi: true });
      await s.chiudi();
    } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
    scrivi(riga);
  }
}

/**
 * Owner 01/11/2026, «Controllo nel banco e nell'app»: #26663, una RX 9070 è caduta da 3868 a 821 t/s in lettura e ci è rimasta fino al riavvio del PC
 * [dichiarato, non rifatto]. Il banco apre e chiude motori di continuo: una corsa su una scheda degradata darebbe numeri falsi senza un errore.
 */
const CALO_MASSIMO_SCHEDA = 0.2;
async function provaScheda({ dir, modello, cartellaFoto }) {
  const s = await apriDiretto({ dir, modello, cartellaFoto });
  const letture = [];
  try {
    for (let i = 0; i < 3; i += 1) letture.push((await chat(s, { max_tokens: 1, messages: [{ role: 'user', content: PROMPT_LUNGO }] })).misura.promptTs);
  } finally { await s.chiudi(); }
  return letture.sort((a, b) => a - b)[1];
}

/**
 * Owner 01/11/2026, «Prova prima di accendere il router»: #27148 e #27624 aperte: con la memoria veloce accesa una risposta può analizzare il testo di
 * un'altra conversazione, anche in sequenza, un utente, router. Cento coppie: due conversazioni alternate che dividono il prefisso, ognuna col suo codice.
 * Basta UN mescolamento per spegnere quella memoria per tutti. Le risposte senza codice si contano a parte: non provano né il sì né il no.
 */
async function provaMescolamento({ dir, modello, cartellaFoto, posti, coppie = 100 }) {
  const riga = { etichetta: 'mescolamento', modello: basename(modello), posti, coppie, mescolate: 0, senzaCodice: 0, tagliate: 0, ripristiniProvati: 0, esempi: [], esempiSenzaCodice: [] };
  const router = posti === 1;
  const guardia = await sorveglia(() => { riga.fermataMemoria = true; });
  /*
   * Third review, D4: with a shared prefix the slot keeps the context, `f_keep` stays near 1, and `prompt_save`/`prompt_load` never run (`server-context.cpp:1834`, `f_keep < 0.5f`).
   * So two conversations with NOTHING in common: each one throws the other out, and the third request of a pair can be served only by what was saved. That is what
   * `cache_n` proves. One slot goes through the router as the app does; four are the case of the issue, with the engine opened by hand.
   */
  const coppiaDi = (sistema, testo) => (codice) => [{ role: 'system', content: `${sistema}\n${testo}` }, { role: 'user', content: `Remember this code: ${codice}.` }, { role: 'assistant', content: 'Remembered.' }, { role: 'user', content: 'What is the code? Reply with the code only.' }];
  const domandaA = coppiaDi('You are a coding agent. Reference file:', PROMPT_LUNGO);
  const domandaB = coppiaDi('Eres un corrector de textos. Archivo:', [...FILE_DA_RICOPIARE].reverse().join(''));
  let aperto = null;
  let chiudi = async () => {};
  try {
    if (router) {
      const supervisori = creaSupervisori({ dir, speculativa: 'auto', router: true, modelli: [modello] });
      aperto = supervisori.sup;
      chiudi = async () => { await aperto.stop().catch(() => {}); await supervisori.chiudi().catch(() => {}); };
      await aperto.start({ modelId: basename(modello), modelPath: modello, finestraDiRiserva: await finestraDiRiserva(modello) });
      riga.motoreUsato = aperto.status().router?.ripieghi?.length ? 'ripiego-su-oggi' : 'router';
    } else {
      aperto = await apriDiretto({ dir, modello, cartellaFoto, posti });
      chiudi = () => aperto.chiudi();
      riga.motoreUsato = 'oggi';
    }
    for (let i = 0; i < coppie && !riga.fermataMemoria; i += 1) {
      const a = `ALFA-${i}-${(i * 7919 + 13) % 104729}`;
      const b = `BETA-${i}-${(i * 6151 + 29) % 104729}`;
      for (const [passo, domanda, mio] of [[0, domandaA, a], [1, domandaB, b], [2, domandaA, a]]) {
        /* 02/11: 400 tokens cut the thinking models in the middle of their own code (LFM2.5); 1.200 leave room after the thinking */
        const { messaggio, misura } = await chat(aperto, { cache_prompt: true, max_tokens: 1200, messages: domanda(mio) });
        const testo = `${messaggio.content ?? ''}${messaggio.reasoning_content ?? ''}`;
        /* fourth review, M6: any code that is not this conversation's, also of a pair before: the leak is from the memory, and it can be old */
        /* 02/11: its own code cut short is not a leak (`codiciAltrui`); the WHOLE answer is kept: 120 characters hid the code that mattered */
        /* Performance's review S2-2: its own code cut short is counted apart (`tagliate`): not a leak, not a proof, it does not switch the rule off */
        const tipo = classificaRisposta(testo, mio);
        if (tipo === 'mescolata') { riga.mescolate += 1; if (riga.esempi.length < 3) riga.esempi.push({ mio, altrui: codiciAltrui(testo, mio), testo: testo.slice(0, 2000) }); }
        else if (tipo === 'tagliata') riga.tagliate += 1;
        else if (tipo === 'senza') { riga.senzaCodice += 1; if (riga.esempiSenzaCodice.length < 3) riga.esempiSenzaCodice.push({ mio, testo: testo.slice(0, 600) }); }
        if (passo === 2 && misura.cacheN > misura.promptN) riga.ripristiniProvati += 1; // the prefix came back from the memory, not from the slot B took
      }
    }
  } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
  guardia.fine();
  segnaPressione(riga, guardia);
  await chiudi().catch(() => {});
  scrivi(riga);
  return riga;
}

/** Brief G5, 19/08: dieci minuti di generazione sostenuta, nessun crollo. colibri nota che i lavori brevi lasciano fermi i clock della scheda. */
async function provaTenuta({ dir, modello, cartellaFoto, minuti = 10 }) {
  const riga = { etichetta: 'tenuta', modello: basename(modello), minuti, velocita: [] };
  const fine = Date.now() + minuti * 60_000;
  const guardia = await sorveglia(() => { riga.fermataMemoria = true; });
  try {
    const s = await apriDiretto({ dir, modello, cartellaFoto });
    try { while (Date.now() < fine && !riga.fermataMemoria) riga.velocita.push((await chat(s, { max_tokens: 1024, messages: [{ role: 'user', content: 'Explain in detail how a hash map handles collisions.' }] })).misura.genTs); }
    finally { await s.chiudi(); }
    const parti = riga.velocita.length;
    const media = (x) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
    riga.prima = +media(riga.velocita.slice(0, Math.ceil(parti / 3))).toFixed(1);
    riga.ultima = +media(riga.velocita.slice(-Math.ceil(parti / 3))).toFixed(1);
    if (!riga.fermataMemoria) riga.crollo = riga.ultima < riga.prima * 0.8; // cut short by the sentinel it did not hold ten minutes: not measured
  } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
  guardia.fine();
  segnaPressione(riga, guardia);
  scrivi(riga);
  return riga;
}

/**
 * Owner 01/11/2026, «Misuralo sul banco, poi regola»: il secondo posto entra solo con almeno il 30% in meno sul tempo delle deleghe, senza peggiorare il giro
 * normale. Due lavori insieme sullo stesso motore, contro lo stesso lavoro in fila. llama.cpp di suo apre 4 posti con la finestra in comune (`server.cpp:127-130`).
 */
async function tweakPosti({ dir, modello, cartellaFoto }) {
  const lavoro = (i) => ({ cache_prompt: true, max_tokens: 400, messages: [{ role: 'user', content: `Summarize this file in five lines, part ${i}.\n${FILE_DA_RICOPIARE}` }] });
  const righe = [];
  for (const caso of ['un-posto', 'due-posti', 'due-posti', 'un-posto', 'un-posto', 'due-posti']) {
    const riga = { etichetta: 'posti', modello: basename(modello), caso };
    try {
      const s = await apriDiretto({ dir, modello, cartellaFoto, ...(caso === 'due-posti' ? { posti: 2 } : {}) });
      const t0 = performance.now();
      if (caso === 'due-posti') await Promise.all([chat(s, lavoro(1)), chat(s, lavoro(2))]);
      else { await chat(s, lavoro(1)); await chat(s, lavoro(2)); }
      riga.ms = Math.round(performance.now() - t0);
      riga.giroSolo = (await chat(s, lavoro(3))).misura;
      await s.chiudi();
    } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
    righe.push(riga);
    scrivi(riga);
  }
  return righe;
}

const lavoroVero = [{ role: 'user', content: `Rewrite this whole file, renaming the function cartellaScratch to scratchFolder everywhere. Output only the file.\n${FILE_DA_RICOPIARE}` }];
const SENZA = { non: 'non misurato' };

/**
 * Owner 01/11/2026, «Si accende da sola se passa»: almeno +15% sul lavoro vero, nessun crash da 4.000 a 64.000, risposte non peggiori, tre su tre (`banco-regole.mjs`).
 * The head comes as a separate file (`--spec-draft-model`, `common/arg.cpp:4322`; `--mtp` only downloads it, `:3106`). The crash of 03/09 at windows ≥ 4096 with an explicit
 * `-ngl` is exactly what the three windows are for: the supervisor passes `-ngl 99`.
 */
async function tweakMtp({ dir, modello, cartellaFoto }) {
  const testa = arg('mtp-testa');
  if (!testa) { scrivi({ etichetta: 'mtp', modello: basename(modello), esito: SENZA.non, motivo: 'manca --mtp-testa' }); return []; }
  const righe = [];
  for (const finestra of [4000, 16000, 64000]) {
    for (const caso of ['serie', 'mtp', 'mtp', 'serie', 'serie', 'mtp']) {
      const riga = { etichetta: 'mtp', modello: basename(modello), finestra, caso };
      try {
        const s = await apriDiretto({ dir, modello, cartellaFoto, finestra, ...(caso === 'mtp' ? { senzaSpeculativa: true, aggiunte: ['--spec-type', 'draft-mtp', '--spec-draft-model', testa] } : {}) });
        const m = (await chat(s, { max_tokens: 1200, messages: lavoroVero })).misura;
        riga.genTs = m.genTs;
        const { righe: esiti } = await controlli(s);
        riga.controlliOk = esiti.every((c) => c.esito !== 'fallito');
        await s.chiudi();
      } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
      righe.push(riga);
      scrivi(riga);
    }
  }
  return righe;
}

/** Owner, «Una prova sola, su 3 famiglie»: stesso lavoro con Vulkan e con HIP, stesso modello. Il pacchetto generico `win-rocm` dà circa 5 parole al secondo: solo il binario per questa scheda. */
async function tweakHip({ dir, modello, cartellaFoto }) {
  const hip = arg('hip');
  if (!hip) { scrivi({ etichetta: 'hip', modello: basename(modello), esito: SENZA.non, motivo: 'manca --hip' }); return []; }
  const righe = [];
  const agente = [{ role: 'system', content: `You are a coding agent. Reference file:\n${PROMPT_LUNGO}` }, { role: 'user', content: 'Reply with one word: ready.' }];
  for (const caso of ['vulkan', 'hip', 'hip', 'vulkan', 'vulkan', 'hip']) {
    const riga = { etichetta: 'hip', modello: basename(modello), caso };
    try {
      const s = await apriDiretto({ dir: caso === 'hip' ? hip : dir, modello, cartellaFoto });
      riga.primaParolaMs = (await primaParola(s, agente)).primoSegnoMs;
      riga.genTs = (await chat(s, { max_tokens: 1200, messages: lavoroVero })).misura.genTs;
      await s.chiudi();
    } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
    righe.push(riga);
    scrivi(riga);
  }
  return righe;
}

/**
 * Owner, «Prima l'interruttore ufficiale»: i modelli a esperti che non entrano nella scheda. `--moe-cache-mib` (`common/arg.cpp:2789`) tiene sulla scheda gli esperti usati;
 * la percentuale la dice il motore quando si chiude (`src/llama-moe-cache.cpp:608`). Solo per chi ha `--esperti-cpu`: su un modello senza esperti la misura non direbbe niente.
 */
async function tweakEsperti({ dir, modello, cartellaFoto }) {
  const cpu = arg('esperti-cpu');
  const mib = arg('esperti-mib');
  if (!cpu || !mib) { scrivi({ etichetta: 'esperti', modello: basename(modello), esito: SENZA.non, motivo: 'servono --esperti-cpu e --esperti-mib' }); return []; }
  const righe = [];
  for (const caso of ['senza', 'con', 'con', 'senza', 'senza', 'con']) {
    const riga = { etichetta: 'esperti', modello: basename(modello), caso };
    try {
      const s = await apriDiretto({ dir, modello, cartellaFoto, aggiunte: ['--n-cpu-moe', cpu, ...(caso === 'con' ? ['--moe-cache-mib', mib] : [])] });
      riga.genTs = (await chat(s, { max_tokens: 1200, messages: lavoroVero })).misura.genTs;
      await s.chiudi();
      riga.tassoPreso = /hit rate = ([\d.]+)%/u.exec(s.coda())?.[1] ?? null;
    } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
    righe.push(riga);
    scrivi(riga);
  }
  return righe;
}

/**
 * Owner 01/11/2026, «Riparto senza la copia in RAM»: la stessa corsa col caricamento di oggi e senza la copia. Performance: quanto scende, e se la prima risposta ne soffre.
 * L'apertura si legge qui: la cache del file sparisce con la mappatura, e il secondo avvio può pagarla.
 */
async function tweakCopiaInRam({ dir, modello, cartellaFoto }) {
  const righe = [];
  const agente = [{ role: 'system', content: `You are a coding agent. Reference file:\n${PROMPT_LUNGO}` }, { role: 'user', content: 'Reply with one word: ready.' }];
  for (const caso of ['oggi', 'senza', 'senza', 'oggi', 'oggi', 'senza']) {
    const riga = { etichetta: 'copia-in-ram', modello: basename(modello), caso };
    let s = null;
    try {
      s = await apriDiretto({ dir, modello, cartellaFoto, caricamento: caso === 'senza' ? 'none' : null });
      riga.avvioS = s.avvioS;
      riga.primoSegnoMs = (await primaParola(s, agente)).primoSegnoMs;
      riga.genTs = (await chat(s, { max_tokens: 600, messages: [{ role: 'user', content: 'Explain in about 250 words how a hash map handles collisions.' }] })).misura.genTs;
      Object.assign(riga, await ramDel(s.pid));
      riga.schedaUsataMiB = await schedaUsataMiB();
    } catch (e) { riga.errore = String(e?.message ?? e).slice(0, 300); }
    await s?.chiudi().catch(() => {});
    righe.push(riga);
    scrivi(riga);
  }
  return righe;
}

/**
 * Owner 01/11/2026, «Tre compiti su tre, su 5 famiglie», contro la chat semplice e il formato libero (senza grammatica). Un template senza attrezzi lo dà `--chat-template` sul modello
 * vero; se il motore li dichiara lo stesso la riga dice `nonEmulabile`, e la misura non vale. Performance: per ogni passo ms di `/apply-template`, primo pezzo, e `prompt_n` del passo
 * dopo una chiamata, che deve valere il pezzo nuovo e non tutta la storia.
 */
async function tweakEmulati({ dir, modello, cartellaFoto }) {
  const leggiFlusso = async (risposta) => {
    const leggi = creaLettoreSse();
    const t0 = performance.now();
    const esito = { primoMs: null, testo: '', chiamata: null, timings: null, usage: null };
    for await (const pezzo of risposta.body) {
      for (const v of leggi(Buffer.from(pezzo).toString('utf8'))) {
        const d = v.choices?.[0]?.delta ?? {};
        if (esito.primoMs === null && (d.content || d.reasoning_content || d.tool_calls)) esito.primoMs = Math.round(performance.now() - t0);
        esito.testo += d.content ?? '';
        if (d.tool_calls?.[0]) esito.chiamata = d.tool_calls[0];
        if (v.timings) esito.timings = v.timings;
        if (v.usage) esito.usage = v.usage;
      }
    }
    return esito;
  };
  const corpoDi = (messaggi) => ({ model: basename(modello), stream: true, max_tokens: MAX_RICOPIA, temperature: 0, messages: messaggi, tools: attrezziAgente });
  const COMPITI = {
    legge: { messaggi: [{ role: 'user', content: 'Read src/scratch.mjs, then write it back renaming cartellaScratch to scratchFolder everywhere.' }], riuscito: (e) => e.chiamata?.function?.name === 'read_file', esito: FILE_DA_RICOPIARE,
      finale: (e) => e.chiamata?.function?.name === 'write_file' && rinominaRiuscita(e.chiamata.function.arguments) },
    chiama: { messaggi: [{ role: 'user', content: 'What time is it in Rome? Use the tool.' }], riuscito: (e) => e.chiamata?.function?.name === 'get_time' && /Rome|Roma/u.test(String(e.chiamata.function.arguments)) },
    'non-chiama': { messaggi: [{ role: 'user', content: 'What is 17 times 23? Answer with the number only, no tools.' }], riuscito: (e) => !e.chiamata && /391/u.test(e.testo) },
  };
  const righe = [];
  for (const caso of ['chat', 'libero', 'emulata', 'emulata', 'libero', 'chat', 'chat', 'libero', 'emulata']) {
    let s = null;
    try {
      s = await apriDiretto({ dir, modello, cartellaFoto, aggiunte: ['--chat-template', 'chatml'] });
      const props = await (await s.request('/props', { signal: AbortSignal.timeout(10_000) })).json();
      const nonEmulabile = props.chat_template_caps?.supports_tools !== false;
      /* the free format is the same road with the grammar taken away: the comparison is the grammar, nothing else */
      const chiama = (percorso, o) => s.request(percorso, percorso === '/completion' && caso === 'libero' ? { ...o, body: JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(o.body)).filter(([k]) => !['json_schema', 'grammar_lazy', 'grammar_triggers'].includes(k)))) } : o);
      const emulatore = creaEmulatore({ chiama, registro: (r) => { console.log(r.trim()); } });
      for (const [compito, c] of Object.entries(COMPITI)) {
        const riga = { etichetta: 'emulati', modello: basename(modello), caso, compito, nonEmulabile };
        try {
          const r = caso === 'chat'
            ? await s.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ATTESA_MS), body: JSON.stringify({ ...corpoDi(c.messaggi), tools: undefined }) })
            : await emulatore.genera(corpoDi(c.messaggi), { signal: AbortSignal.timeout(ATTESA_MS) });
          if (!r) throw new Error('la porta ha risposto null');
          const e = await leggiFlusso(r);
          riga.primoMs = e.primoMs;
          riga.riuscito = c.riuscito(e);
          if (c.esito && e.chiamata) {
            const storia = [...c.messaggi, { role: 'assistant', content: '', tool_calls: [e.chiamata] }, { role: 'tool', tool_call_id: e.chiamata.id, content: c.esito }];
            const e2 = await leggiFlusso(await emulatore.genera(corpoDi(storia), { signal: AbortSignal.timeout(ATTESA_MS) }));
            riga.riuscito = riga.riuscito && c.finale(e2);
            riga.primoMsDopo = e2.primoMs;
            riga.promptDopo = e2.timings?.prompt_n;
            riga.promptTotale = e2.usage?.prompt_tokens;
            riga.pezzoNuovo = (await (await s.request('/tokenize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: c.esito }) })).json()).tokens?.length;
          } else if (c.esito) riga.riuscito = false;
        } catch (err) { riga.errore = String(err?.message ?? err).slice(0, 300); }
        righe.push(riga);
        scrivi(riga);
      }
    } catch (e) { righe.push({ etichetta: 'emulati', modello: basename(modello), caso, errore: String(e?.message ?? e).slice(0, 300) }); scrivi(righe.at(-1)); }
    await s?.chiudi().catch(() => {});
  }
  return righe;
}

/** Le regole dell'11/09: vale solo tre su tre, le prove saltate si contano, «non misurato» non è mai zero. */
function verdetto({ scheda, mescolamento, tenute, cambioDiModello }) {
  const bracci = new Map();
  for (const c of corseDelVerdetto) {
    const chiave = `${c.modello}|${c.etichetta}`;
    if (!bracci.has(chiave)) bracci.set(chiave, []);
    bracci.get(chiave).push(c);
  }
  const righe = [...bracci].map(([braccio, corse]) => verdettoBraccio({ braccio, corse, ripetizioni: RIPETIZIONI }));
  const di = (modello, etichetta) => bracci.get(`${basename(modello)}|${etichetta}`) ?? [];
  const perModello = MODELLI.map((modello) => ({ modello: basename(modello), salto: regolaNonPeggiore(di(modello, 'vecchio'), di(modello, 'nuovo')), router: regolaNonPeggiore(di(modello, 'nuovo'), di(modello, 'router')),
    tenuta: regolaTenuta(tenute.find((t) => t.modello === basename(modello))) }));
  const regole = { perModello, cambi: regolaCambi(cambioDiModello), mescolamento: regolaMescolamento(mescolamento) };
  /* the guard of 5 families by 3 versions: what this run alone can promote. Across runs it is `banco-riepilogo.mjs` */
  const esiti = esitiDelVerdetto({ bracci: righe, regole });
  const promozione = { motore: promozioneDiSerie(esiti.motore), router: promozioneDiSerie(esiti.router) };
  const esito = scheda.corsaValida !== true ? 'non misurato' : giudizio([...righe.map((r) => r.esito ?? (r.passa ? 'passa' : 'non passa')), ...perModello.flatMap((m) => [m.salto.esito, m.router.esito, m.tenuta.esito]), regole.cambi.esito, regole.mescolamento.esito]);
  scrivi({ etichetta: 'verdetto', regola: 'pass^3', ripetizioni: RIPETIZIONI, bracci: righe, regole, scheda, famiglieChieste: MODELLI.length, promozione, esito });
  return esito;
}

if (process.argv.includes('--tweak')) {
  const cartellaFoto = cartellaScratch('banco-foto-');
  scrivi({ etichetta: 'inizio-tweak', quando: new Date().toISOString(), nuovo: await buildDi(NUOVO), modelli: MODELLI.map((m) => basename(m)) });
  for (const modello of MODELLI) {
    const m = { dir: NUOVO, modello, cartellaFoto };
    if ((await impegnabileGb()) < SOGLIA_IMPEGNABILE_GB) { console.log('⛔ memoria impegnabile sotto la soglia'); console.log('EXIT=3'); process.exit(3); }
    await tweakFoto(m);
    await tweakCrescita(m);
    /* 01/11/2026 (Performance, notte): `--solo-foto` misura solo il salvataggio e la rimessa della scheda (foto del prefisso e conversazione a
       mezza finestra) per la soglia di 1 s al 95° percentile; gli altri passaggi non girano */
    if (process.argv.includes('--solo-foto')) continue;
    await tweakAttrezzi(m);
    await tweakRiordino(m);
    const posti = await tweakPosti(m);
    const mtp = await tweakMtp(m);
    const hip = await tweakHip(m);
    const esperti = await tweakEsperti(m);
    const emulati = await tweakEmulati(m);
    const copiaInRam = await tweakCopiaInRam(m);
    scrivi({ etichetta: 'regole', modello: basename(modello), posti: regolaPosti(posti), mtp: regolaMtp(mtp), hip: regolaHip(hip), esperti: regolaEsperti(esperti), emulati: regolaEmulati(emulati), copiaInRam: regolaCopiaInRam(copiaInRam) });
  }
  rmSync(cartellaFoto, { recursive: true, force: true });
  scrivi({ etichetta: 'fine-tweak', quando: new Date().toISOString() });
  console.log('EXIT=0');
  process.exit(0);
}

scrivi({ etichetta: 'inizio', quando: new Date().toISOString(), vecchio: await buildDi(VECCHIO), nuovo: await buildDi(NUOVO), modelli: MODELLI.map((m) => basename(m)) });
const cartellaDellaScheda = cartellaScratch('banco-scheda-');
const schedaAllInizio = await provaScheda({ dir: NUOVO, modello: MODELLI[0], cartellaFoto: cartellaDellaScheda });
scrivi({ etichetta: 'controllo-scheda', quando: 'inizio', letturaTs: schedaAllInizio });
/* 02/11/2026, owner: `--solo-mescolamento` redoes only the mixing proof of the first model (one slot through the router, four on today's
   engine), with the cured tool; nothing else runs and no family verdict is written */
if (process.argv.includes('--solo-mescolamento')) {
  const righe = [];
  for (const posti of [1, 4]) {
    const r = await provaMescolamento({ dir: NUOVO, modello: MODELLI[0], cartellaFoto: cartellaDellaScheda, posti, coppie: COPPIE });
    righe.push(r);
    if (r.fermataMemoria) { console.log(`⛔ meno di ${SOGLIA_IMPEGNABILE_GB} GB impegnabili: la corsa si ferma qui`); console.log('EXIT=3'); process.exit(3); }
  }
  const solo = esitoSoloMescolamento(righe);
  scrivi({ etichetta: 'verdetto-mescolamento', modello: basename(MODELLI[0]), regola: solo.regola, esito: solo.esito });
  rmSync(cartellaDellaScheda, { recursive: true, force: true });
  scrivi({ etichetta: 'fine', quando: new Date().toISOString() });
  console.log(`EXIT=${solo.uscita}`);
  process.exit(solo.uscita);
}
const BRACCI = [
  { etichetta: 'vecchio', dir: VECCHIO, speculativa: 'auto', router: false },
  { etichetta: 'nuovo', dir: NUOVO, speculativa: 'auto', router: false },
  { etichetta: 'router', dir: NUOVO, speculativa: 'auto', router: true },
  { etichetta: 'senza-speculativa', dir: NUOVO, speculativa: 'off', router: false },
];
const tenute = [];
const fermaSeSenzaMemoria = (riga) => { if (!riga.fermataMemoria) return; console.log(`⛔ meno di ${SOGLIA_IMPEGNABILE_GB} GB impegnabili: la corsa si ferma qui`); console.log('EXIT=3'); process.exit(3); };
for (const modello of MODELLI) {
  const m = { modello };
  await corsa({ ...m, etichetta: 'riscaldamento', dir: NUOVO, speculativa: 'auto', router: false, misura: false });
  /* tre ripetizioni per braccio (regola dell'11/09, owner 01/11), a ordine incrociato (lezione del 26/10) */
  for (let giro = 0; giro < RIPETIZIONI; giro += 1) {
    for (const braccio of giro % 2 === 0 ? BRACCI : [...BRACCI].reverse()) await corsa({ ...m, ...braccio });
  }
  tenute.push(await provaTenuta({ dir: NUOVO, modello, cartellaFoto: cartellaDellaScheda }));
  fermaSeSenzaMemoria(tenute.at(-1));
}
const mescolamento = [await provaMescolamento({ dir: NUOVO, modello: MODELLI[0], cartellaFoto: cartellaDellaScheda, posti: 1, coppie: COPPIE })];
fermaSeSenzaMemoria(mescolamento[0]);
mescolamento.push(await provaMescolamento({ dir: NUOVO, modello: MODELLI[0], cartellaFoto: cartellaDellaScheda, posti: 4, coppie: COPPIE }));
fermaSeSenzaMemoria(mescolamento[1]);
await fermaDuranteLApertura({ dir: NUOVO, modello: MODELLI[0], router: false });
await fermaDuranteLApertura({ dir: NUOVO, modello: MODELLI[0], router: true });
const coppiaDelCambio = SECONDO_MODELLO ? [MODELLI[0], SECONDO_MODELLO] : MODELLI.slice(0, 2);
const cambioDiModello = coppiaDelCambio.length === 2 ? await cambio({ dir: NUOVO, modelli: coppiaDelCambio }) : null;
await caricamentoRotto({ dir: NUOVO });
const schedaAllaFine = await provaScheda({ dir: NUOVO, modello: MODELLI[0], cartellaFoto: cartellaDellaScheda });
let riferimentoScheda = null;
try { riferimentoScheda = RIFERIMENTO_SCHEDA ? JSON.parse(readFileSync(RIFERIMENTO_SCHEDA, 'utf8')).letturaTs : null; } catch { /* first run on this card: nothing to compare with */ }
const scheda = { ...regolaScheda({ inizio: schedaAllInizio, fine: schedaAllaFine, riferimento: riferimentoScheda, caloMassimo: CALO_MASSIMO_SCHEDA }), riferimento: riferimentoScheda ?? 'non misurato' };
scrivi({ etichetta: 'controllo-scheda', quando: 'fine', letturaTs: schedaAllaFine, ...scheda });
/* third review, M3: after the card, so that a void run cannot leave a green verdict in the file */
const esito = verdetto({ scheda, mescolamento, tenute, cambioDiModello });
if (scheda.corsaValida && RIFERIMENTO_SCHEDA && riferimentoScheda === null) writeFileSync(RIFERIMENTO_SCHEDA, JSON.stringify({ letturaTs: schedaAllInizio }));
rmSync(cartellaDellaScheda, { recursive: true, force: true });
scrivi({ etichetta: 'fine', quando: new Date().toISOString() });
if (!scheda.corsaValida) { console.log('⛔ la scheda ha perso oltre il 20% in lettura: la corsa non vale, si rifà dopo il riavvio del PC'); console.log('EXIT=4'); process.exit(4); }
if (esito === 'non passa') { console.log('⛔ una regola dell\'owner non passa: vedi la riga del verdetto'); console.log('EXIT=5'); process.exit(5); }
if (esito !== 'passa') { console.log('⛔ non misurato: manca almeno una prova, niente si promuove'); console.log('EXIT=6'); process.exit(6); }
console.log('EXIT=0');
process.exit(0);
