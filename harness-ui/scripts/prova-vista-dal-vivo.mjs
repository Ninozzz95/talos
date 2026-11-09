#!/usr/bin/env node
/*
 * The local vision, live, through TALOS's own supervisors (night train 02→03/11/2026, turn 3 given by the Desktop).
 * Today's code (`proiettore nel conto`, router vision, `visteFallite`) was proven only against fake engines: here the real binary opens a
 * real model with its real projector, on the two roads TALOS uses, and the rows say what a person would get.
 *
 * Cases, one model, on the engine given with --motore (the CPU engine is the fallback, as in the app):
 *   D1 direct road WITH the projector:  status has `proiettore`, no `vistaSenza`, `/props` says vision; an image question answers (200)
 *      and its prompt has more tokens than the same question without the image
 *   D2 direct road WITHOUT the projector: the card memory to compare with D1 (≈ the projector's memory, ⛔ rough: the fit may change)
 *   D3 direct road with a projector of ANOTHER model (--proiettore-sbagliato): the engine refuses it, TALOS reopens without, says
 *      `vistaSenza`, the chat still answers
 *   R1 router road WITH the projector: as D1, through the router, and no fallback to today's engine (`ripieghi` empty)
 *   R2 router road with the wrong projector, opened twice: the first opening retries without vision, the second goes without at once
 *      (memory of the failed vision), both say `vistaSenza`, the chat answers
 * Exit: 0 every case passed, 1 a case failed (rows say which), 2 wrong arguments, 3 not enough memory to start.
 * Use: node scripts/prova-vista-dal-vivo.mjs --motore <dir> --cpu <dir> --modello <gguf> --proiettore <mmproj> --proiettore-sbagliato <mmproj>
 *        --immagine <png|jpg> --uscita <jsonl> [--casi D1,D2,D3,R1,R2] [--registro <jsonl>, only for a dry try]
 * No key, no network: the environment loses every *_API_KEY, *_TOKEN, *_SECRET and provider variable before anything starts.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { cartellaScratch } from '../src/scratch.mjs';
import { createLlamaRouterSupervisor } from '../src/llama-router-supervisor.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';

for (const k of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET)$/iu.test(k) || /^(OPENROUTER|OPENAI|GEMINI|ANTHROPIC|ZAI|DEEPSEEK|GROQ|MISTRAL|XAI|TALOS_PROVIDER)/iu.test(k)) delete process.env[k];
}

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1]; };
const MOTORE = arg('motore'); const CPU = arg('cpu'); const MODELLO = arg('modello'); const PROIETTORE = arg('proiettore');
const SBAGLIATO = arg('proiettore-sbagliato'); const IMMAGINE = arg('immagine'); const USCITA = arg('uscita');
const CASI = (arg('casi') ?? 'D1,D2,D3,R1,R2').split(',').map((c) => c.trim().toUpperCase());
if (!MOTORE || !CPU || !MODELLO || !PROIETTORE || !SBAGLIATO || !IMMAGINE || !USCITA) {
  console.error('servono --motore --cpu --modello --proiettore --proiettore-sbagliato --immagine --uscita');
  process.exit(2);
}
const REGISTRO = arg('registro') ?? join(process.env.TALOS_CASA_BANCO ?? homedir(), 'Desktop', 'projects', 'registro-corse-pesanti.jsonl'); // another file only for a dry try of the script
const CORSA = `prova della vista dal vivo (${basename(MODELLO)}, ${basename(MOTORE.replace(/[\\/]vulkan[\\/]?$/u, ''))})`;
const ATTESA_MS = 300_000;
const MODEL_ID = basename(MODELLO);
const dataUrl = `data:image/${/\.jpe?g$/iu.test(IMMAGINE) ? 'jpeg' : 'png'};base64,${readFileSync(IMMAGINE).toString('base64')}`;
const proiettore = (path) => ({ path, bytes: statSync(path).size });

const ora = () => new Date().toISOString();
const registro = (evento, extra = {}) => appendFileSync(REGISTRO, `${JSON.stringify({ at: ora().replace(/\.\d+Z$/u, 'Z'), sessione: 'Motore locale', evento, corsa: CORSA, pid: process.pid, ...extra })}\n`);
const scrivi = (riga) => { const r = { at: ora(), modello: MODEL_ID, motore: MOTORE, ...riga }; appendFileSync(USCITA, `${JSON.stringify(r)}\n`); console.log(JSON.stringify(r).slice(0, 400)); };

/** Committable memory in GB, as the bench's guard reads it. */
function impegnabileGb() {
  try { return Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory'], { encoding: 'utf8', windowsHide: true }).trim()) / 2 ** 20; } catch { return null; }
}
/** Dedicated memory in use on the card, MiB (the bench's same counter). */
function schedaUsataMiB() {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | Measure-Object -Property DedicatedUsage -Sum).Sum'], { encoding: 'utf8', windowsHide: true }).trim();
    return out && Number.isFinite(Number(out)) ? Math.round(Number(out) / 2 ** 20) : null;
  } catch { return null; }
}

/* every engine opened here is closed, whatever happens (the bench's rule: none stays on the card) */
const daChiudere = new Set();
async function chiudiTutto() { // CLI review S4: capped, a stuck stop cannot keep the end line from being written
  await Promise.race([Promise.allSettled([...daChiudere].map((f) => f())), new Promise((ok) => { setTimeout(ok, 60_000).unref(); })]);
  daChiudere.clear();
}
let corsaAperta = false;
let finito = false;
const fine = async (codice, esito) => { if (finito) return; finito = true; await chiudiTutto(); if (corsaAperta) registro('fine', { esito }); process.exit(codice); };
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => { fine(130, `fermata: ${s}`); });
process.on('uncaughtException', (e) => { console.error(e); fine(1, `errore: ${String(e?.message ?? e).slice(0, 160)}`); });
process.on('unhandledRejection', (e) => { console.error(e); fine(1, `errore: ${String(e?.message ?? e).slice(0, 160)}`); });

function creaDiretto() {
  const sup = createLlamaServerSupervisor({ binaryPath: join(MOTORE, 'llama-server.exe'), fallbackBinaryPath: join(CPU, 'llama-server.exe'),
    motore: { variante: 'vulkan', dispositivi: [] }, modelStore: { lock: async () => {}, unlock: async () => {} }, gpuLayers: 99, finestreFile: null, healthTimeoutMs: ATTESA_MS });
  return sup;
}
function creaRouter(proiettoreDelModello) {
  const standalone = creaDiretto();
  const cartella = cartellaScratch('vista-router-');
  const sup = createLlamaRouterSupervisor({ binaryPath: join(MOTORE, 'llama-server.exe'), standalone, presetFile: join(cartella, 'presets.ini'), healthTimeoutMs: ATTESA_MS,
    memoriaUtilizzabile: async () => { const totale = 16304 * 2 ** 20; return totale - Math.max(2 * 2 ** 30, Math.floor(totale * 0.09)); }, // as `server.mjs`
    modelliInstallati: async () => [{ modelId: MODEL_ID, modelPath: MODELLO, opzioni: { finestraDiRiserva: 8192 }, ...(proiettoreDelModello ? { proiettore: proiettoreDelModello } : {}) }] });
  const chiudi = async () => { await sup.stop().catch(() => {}); await sup.chiudi().catch(() => {}); rmSync(cartella, { recursive: true, force: true }); };
  return { sup, chiudi };
}

async function domanda(sup, conImmagine) {
  const testo = 'Describe this image in one short sentence. If you cannot see an image, say NO IMAGE.';
  const content = conImmagine ? [{ type: 'text', text: testo }, { type: 'image_url', image_url: { url: dataUrl } }] : testo;
  const t0 = performance.now();
  const r = await sup.request('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ATTESA_MS),
    body: JSON.stringify({ temperature: 0, max_tokens: 200, cache_prompt: false, messages: [{ role: 'user', content }] }) });
  const corpo = await r.text();
  let j = null; try { j = JSON.parse(corpo); } catch { /* not json */ }
  const m = j?.choices?.[0]?.message ?? {};
  return { http: r.status, ms: Math.round(performance.now() - t0), tokenDomanda: j?.usage?.prompt_tokens ?? null,
    risposta: String(m.content ?? '').slice(0, 300), ragionamento: String(m.reasoning_content ?? '').length, errore: r.ok ? null : corpo.slice(0, 300) };
}
async function vedeDaProps(sup) {
  try { const r = await sup.request('/props', { signal: AbortSignal.timeout(10_000) }); const j = await r.json(); return j?.modalities?.vision ?? null; } catch { return null; }
}
const statoBreve = (st) => ({ stato: st.state, finestra: st.windowTokens ?? null, proiettore: st.proiettore?.path ? basename(st.proiettore.path) : null,
  vistaSenza: st.vistaSenza ?? null, vede: st.vede ?? null, ripieghi: st.router?.ripieghi?.length ?? null, ripiegoSuProcessore: st.motore?.ripiego ?? null });

/* a case = open, ask, check, close; a failure to open is a row, never a crash */
async function caso(nome, apri, controlla) {
  const t0 = performance.now();
  const { sup, chiudi } = apri();
  daChiudere.add(chiudi);
  const riga = { caso: nome };
  try {
    await apri.start(sup);
    riga.aperturaMs = Math.round(performance.now() - t0);
    riga.schedaMiB = schedaUsataMiB();
    Object.assign(riga, statoBreve(sup.status()), { vedeProps: await vedeDaProps(sup) });
    await controlla(sup, riga);
  } catch (e) {
    riga.errore = `${e?.code ?? ''} ${String(e?.message ?? e)}`.trim().slice(0, 300);
    riga.problemi = [...(riga.problemi ?? []), 'non aperto o errore'];
  } finally {
    await chiudi(); daChiudere.delete(chiudi);
  }
  riga.esito = riga.problemi?.length ? 'NON PASSA' : 'passa';
  scrivi(riga);
  return riga;
}
const conProblemi = (riga, condizioni) => { riga.problemi = Object.entries(condizioni).filter(([, ok]) => !ok).map(([k]) => k); };

function diretto(conProiettore) {
  const f = () => { const sup = creaDiretto(); return { sup, chiudi: () => sup.stop().catch(() => {}) }; };
  f.start = (sup) => sup.start({ modelId: MODEL_ID, modelPath: MODELLO, finestraDiRiserva: 8192, ...(conProiettore ? { proiettore: conProiettore } : {}) });
  return f;
}
function viaRouter(conProiettore, aperture = 1) {
  const f = () => creaRouter(conProiettore);
  f.start = async (sup) => {
    f.aperture = [];
    for (let i = 0; i < aperture; i += 1) {
      if (i > 0) await sup.stop();
      const t0 = performance.now();
      await sup.start({ modelId: MODEL_ID, modelPath: MODELLO, finestraDiRiserva: 8192, ...(conProiettore ? { proiettore: conProiettore } : {}) });
      const st = sup.status();
      f.aperture.push({ ms: Math.round(performance.now() - t0), vistaSenza: st.vistaSenza ?? null, ripieghi: st.router?.ripieghi?.length ?? null });
    }
  };
  return f;
}

/* ---- start ---- */
const libera = impegnabileGb();
if (libera !== null && libera < 8) { console.log(`⛔ memoria impegnabile ${libera.toFixed(1)} GB, sotto 8: non parto`); process.exit(3); }
const giusto = proiettore(PROIETTORE); // CLI review V-4: the files are read before the start line, so a missing one stops with no line at all
const sbagliato = proiettore(SBAGLIATO);
statSync(MODELLO);
registro('inizio');
corsaAperta = true;
const righe = [];
try {

if (CASI.includes('D1')) righe.push(await caso('D1 diretto col proiettore', diretto(giusto), async (sup, riga) => {
  riga.conImmagine = await domanda(sup, true);
  riga.senzaImmagine = await domanda(sup, false);
  const extra = riga.conImmagine.tokenDomanda !== null && riga.senzaImmagine.tokenDomanda !== null ? riga.conImmagine.tokenDomanda - riga.senzaImmagine.tokenDomanda : null;
  riga.tokenImmagine = extra;
  conProblemi(riga, { 'proiettore nello stato': riga.proiettore === basename(PROIETTORE), 'nessun vistaSenza': riga.vistaSenza === null,
    'props dice vista': riga.vedeProps === true, 'immagine risponde 200': riga.conImmagine.http === 200, 'risposta non vuota': riga.conImmagine.risposta.trim().length > 0,
    'non dice NO IMAGE': !/NO IMAGE/iu.test(riga.conImmagine.risposta), // CLI review V-3: a projector loaded badly answers 200 too
    "l'immagine costa token": extra !== null && extra > 0, 'non sul processore': !riga.ripiegoSuProcessore });
}));
if (CASI.includes('D2')) righe.push(await caso('D2 diretto senza proiettore', diretto(null), async (sup, riga) => {
  riga.conImmagine = await domanda(sup, true);
  const d1 = righe.find((r) => r.caso.startsWith('D1'));
  riga.differenzaSchedaMiB = d1?.schedaMiB != null && riga.schedaMiB != null ? d1.schedaMiB - riga.schedaMiB : null; // ⛔ rough: the fit may choose another window
  conProblemi(riga, { 'nessun proiettore nello stato': riga.proiettore === null, 'props dice niente vista': riga.vedeProps === false,
    /* CLI review V-2: any error is not enough, it must be the engine saying it reads no image (measured 01/11: 500 «image input is not supported … mmproj») */
    "l'immagine non passa, per la vista": riga.conImmagine.http !== 200 && /image|mmproj/iu.test(riga.conImmagine.errore ?? '') });
}));
if (CASI.includes('D3')) righe.push(await caso('D3 diretto col proiettore di un altro modello', diretto(sbagliato), async (sup, riga) => {
  riga.senzaImmagine = await domanda(sup, false);
  conProblemi(riga, { 'aperto lo stesso': riga.stato === 'ready', 'dice vistaSenza': riga.vistaSenza !== null, 'nessun proiettore nello stato': riga.proiettore === null, 'props dice niente vista': riga.vedeProps === false,
    'la chat risponde': riga.senzaImmagine.http === 200 && riga.senzaImmagine.risposta.trim().length > 0, 'non sul processore': !riga.ripiegoSuProcessore });
}));
if (CASI.includes('R1')) { const apri = viaRouter(giusto); righe.push(await caso('R1 router col proiettore', apri, async (sup, riga) => {
  riga.conImmagine = await domanda(sup, true);
  riga.senzaImmagine = await domanda(sup, false);
  const extra = riga.conImmagine.tokenDomanda !== null && riga.senzaImmagine.tokenDomanda !== null ? riga.conImmagine.tokenDomanda - riga.senzaImmagine.tokenDomanda : null;
  riga.tokenImmagine = extra;
  conProblemi(riga, { 'proiettore nello stato': riga.proiettore === basename(PROIETTORE), 'nessun vistaSenza': riga.vistaSenza === null, 'nessun ripiego su oggi': riga.ripieghi === 0,
    'props dice vista': riga.vedeProps === true, 'immagine risponde 200': riga.conImmagine.http === 200, 'risposta non vuota': riga.conImmagine.risposta.trim().length > 0,
    'non dice NO IMAGE': !/NO IMAGE/iu.test(riga.conImmagine.risposta), "l'immagine costa token": extra !== null && extra > 0 });
})); }
if (CASI.includes('R2')) { const apri = viaRouter(sbagliato, 2); righe.push(await caso('R2 router col proiettore sbagliato, due aperture', apri, async (sup, riga) => {
  riga.aperture = apri.aperture;
  riga.senzaImmagine = await domanda(sup, false);
  conProblemi(riga, { 'due aperture': apri.aperture?.length === 2, /* CLI review V-1: the router itself retried without vision, never today's engine (whose own cure says vistaSenza too) */
    'sempre nel router': apri.aperture?.length === 2 && apri.aperture.every((a) => a.ripieghi === 0),
    'prima: il router ha riaperto senza vista': /the router did not open/u.test(apri.aperture?.[0]?.vistaSenza ?? ''),
    'seconda dice vistaSenza': Boolean(apri.aperture?.[1]?.vistaSenza), 'seconda ricorda il guasto': /earlier in this session/u.test(apri.aperture?.[1]?.vistaSenza ?? ''),
    'la chat risponde': riga.senzaImmagine.http === 200 && riga.senzaImmagine.risposta.trim().length > 0 });
})); }

const falliti = righe.filter((r) => r.esito !== 'passa').map((r) => r.caso);
const esito = falliti.length ? `NON PASSA: ${falliti.join('; ')}` : `passa: ${righe.length} casi su ${righe.length}`;
scrivi({ caso: 'riepilogo', esito, casi: righe.length });
await fine(falliti.length ? 1 : 0, esito);
} catch (e) { // CLI review V-4: a failure outside a case (writing a row, the summary) still writes the end line
  console.error(e);
  await fine(1, `errore: ${String(e?.message ?? e).slice(0, 160)}`);
}
