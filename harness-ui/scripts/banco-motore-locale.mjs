#!/usr/bin/env node
/*
 * L2 del motore locale (owner 20/10/2026: «llama.cpp all'ultima; banco "famiglie di modelli × controlli" come cancello prima del tag»)
 * — IL BANCO DI COMPATIBILITÀ. Per ogni binario di llama-server (di solito: quello di prima e quello nuovo) e ogni GGUF di una famiglia
 * diversa, avvia il motore come lo avvia TALOS (`--jinja`, `-np 1`, `-ngl 99`, una finestra piccola) e prova i controlli da cui dipende
 * l'app. Il verdetto è un CANCELLO: il binario nuovo non deve perdere nessun controllo che quello di prima passava sullo stesso modello.
 *
 * Controlli (uno per riga del rapporto):
 *   avvio       /health pronto entro il tempo, e i secondi che ci ha messo
 *   props       /props risponde con `n_ctx` e un `chat_template`
 *   testo       una risposta semplice: testo non vuoto, nessun `<think>` dentro il testo (il difetto della sessione e00ae242)
 *   attrezzo    con un attrezzo offerto e una richiesta che lo vuole: `tool_calls` col nome giusto e argomenti JSON leggibili
 *   esito       dopo l'esito dell'attrezzo: una risposta di testo (il giro si chiude)
 *   senza-ragionamento  `thinking_budget_tokens: 0` (L1-b): nessun `reasoning_content` (solo per chi ragiona da sé)
 *   stream      SSE con almeno un pezzo di testo e la chiusura `[DONE]`
 *
 * Uso:  node scripts/banco-motore-locale.mjs --binari <vecchio.exe>,<nuovo.exe> --modelli <a.gguf>,<b.gguf>,… [--porta 4179] [--uscita file.json]
 * ⛔ Pesante: carica i modelli uno alla volta, mai due insieme. Si lancia solo a macchina libera (le altre sessioni lo sanno prima).
 * Nessuna chiave, nessuna rete: tutto su 127.0.0.1.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const arg = (nome, ripiego = null) => { const i = process.argv.indexOf(`--${nome}`); return i === -1 ? ripiego : process.argv[i + 1]; };
const BINARI = String(arg('binari', '')).split(',').filter(Boolean);
const MODELLI = String(arg('modelli', '')).split(',').filter(Boolean);
const PORTA = Number(arg('porta', '4179'));
const USCITA = arg('uscita');
const FINESTRA = Number(arg('finestra', '8192'));
if (!BINARI.length || !MODELLI.length) { console.error('servono --binari e --modelli'); process.exit(2); }

const BASE = `http://127.0.0.1:${PORTA}`;
const dormi = (ms) => new Promise((r) => setTimeout(r, ms));
const conTempo = (ms) => AbortSignal.timeout(ms);
const ATTREZZO = { type: 'function', function: { name: 'get_time', description: 'Get the current time in a city.', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } };

async function chat(corpo, ms = 180_000) {
  const r = await fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ max_tokens: 512, temperature: 0, ...corpo }), signal: conTempo(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function controlla(nome, fn) {
  try { const dettaglio = await fn(); return { controllo: nome, esito: dettaglio === 'non-applicabile' ? 'n/a' : 'ok', ...(dettaglio && dettaglio !== 'non-applicabile' ? { dettaglio } : {}) }; }
  catch (e) { return { controllo: nome, esito: 'fallito', motivo: String(e?.message ?? e).slice(0, 240) }; }
}

async function bancoDi(binario, modello) {
  const processo = spawn(binario, ['-m', modello, '--host', '127.0.0.1', '--port', String(PORTA), '-c', String(FINESTRA), '-ngl', '99', '-np', '1', '--jinja'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let coda = '';
  processo.stderr.on('data', (d) => { coda = (coda + d).slice(-4000); });
  const righe = [];
  const inizio = Date.now();
  try {
    righe.push(await controlla('avvio', async () => {
      for (;;) {
        if (processo.exitCode !== null) throw new Error(`uscito (${processo.exitCode}): ${coda.split('\n').filter(Boolean).slice(-2).join(' | ')}`);
        if (Date.now() - inizio > 300_000) throw new Error('non pronto in 300 s');
        try { if ((await fetch(`${BASE}/health`, { signal: conTempo(2_000) })).ok) return `${((Date.now() - inizio) / 1000).toFixed(1)} s`; } catch { /* non ancora */ }
        await dormi(1_000);
      }
    }));
    if (righe[0].esito !== 'ok') return righe;
    let ragiona = false;
    righe.push(await controlla('props', async () => {
      const p = await (await fetch(`${BASE}/props`, { signal: conTempo(10_000) })).json();
      const nCtx = p?.default_generation_settings?.n_ctx ?? p?.n_ctx;
      if (!Number.isInteger(nCtx) || !p?.chat_template) throw new Error(`n_ctx=${nCtx}, template=${Boolean(p?.chat_template)}`);
      ragiona = /<think>|reasoning|thinking/i.test(String(p.chat_template));
      return `n_ctx ${nCtx}; build ${p?.build_info ?? '?'}`;
    }));
    righe.push(await controlla('testo', async () => {
      const r = await chat({ messages: [{ role: 'user', content: 'Reply with exactly one word: ready' }] });
      const testo = String(r.choices?.[0]?.message?.content ?? '');
      if (/<\/?think>/i.test(testo)) throw new Error(`<think> nel testo: ${testo.slice(0, 120)}`);
      if (!testo.trim()) throw new Error('testo vuoto');
      return testo.trim().slice(0, 40);
    }));
    let chiamata = null;
    righe.push(await controlla('attrezzo', async () => {
      const r = await chat({ messages: [{ role: 'user', content: 'What time is it in Rome? Use the get_time tool.' }], tools: [ATTREZZO] });
      const c = r.choices?.[0]?.message?.tool_calls?.[0];
      if (!c) throw new Error(`nessuna tool_call; testo: ${String(r.choices?.[0]?.message?.content ?? '').slice(0, 120)}`);
      if (c.function?.name !== 'get_time') throw new Error(`nome ${c.function?.name}`);
      JSON.parse(c.function?.arguments || '{}');
      chiamata = { messaggio: r.choices[0].message, id: c.id };
      return c.function.arguments.slice(0, 60);
    }));
    righe.push(await controlla('esito', async () => {
      if (!chiamata) throw new Error('nessuna chiamata da chiudere');
      const r = await chat({ tools: [ATTREZZO], messages: [
        { role: 'user', content: 'What time is it in Rome? Use the get_time tool.' },
        { role: 'assistant', content: chiamata.messaggio.content ?? '', tool_calls: chiamata.messaggio.tool_calls },
        { role: 'tool', tool_call_id: chiamata.id, content: '14:05' },
      ] });
      const testo = String(r.choices?.[0]?.message?.content ?? '');
      if (!testo.trim()) throw new Error('nessun testo dopo l esito');
      if (/<\/?think>/i.test(testo)) throw new Error('<think> nel testo dopo l esito');
      return testo.trim().slice(0, 60);
    }));
    righe.push(await controlla('senza-ragionamento', async () => {
      if (!ragiona) return 'non-applicabile';
      const r = await chat({ messages: [{ role: 'user', content: 'Say hi.' }], thinking_budget_tokens: 0 });
      const ragionamento = String(r.choices?.[0]?.message?.reasoning_content ?? '');
      if (ragionamento.trim()) throw new Error(`ragiona lo stesso (${ragionamento.length} caratteri)`);
      return null;
    }));
    righe.push(await controlla('stream', async () => {
      const r = await fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: conTempo(180_000),
        body: JSON.stringify({ stream: true, max_tokens: 64, temperature: 0, messages: [{ role: 'user', content: 'Count from 1 to 5.' }] }) });
      const corpo = await r.text();
      if (!corpo.includes('data: [DONE]')) throw new Error('niente [DONE]');
      if (!/"content":"[^"]/u.test(corpo) && !/"reasoning_content":"[^"]/u.test(corpo)) throw new Error('nessun pezzo di testo');
      return null;
    }));
    return righe;
  } finally {
    processo.kill();
    for (let i = 0; i < 20 && processo.exitCode === null; i += 1) await dormi(500);
  }
}

const rapporto = { quando: new Date().toISOString(), finestra: FINESTRA, risultati: [] };
for (const modello of MODELLI) {
  for (const binario of BINARI) {
    console.log(`… ${basename(modello)} su ${binario}`);
    rapporto.risultati.push({ modello: basename(modello), binario, controlli: await bancoDi(binario, modello) });
  }
}
/* Il CANCELLO: per ogni modello, un controllo che il primo binario passava e un altro no è una regressione. */
const regressioni = [];
for (const modello of MODELLI.map((m) => basename(m))) {
  const [primo, ...altri] = rapporto.risultati.filter((r) => r.modello === modello);
  for (const altro of altri) {
    for (const c of primo.controlli) {
      const dopo = altro.controlli.find((x) => x.controllo === c.controllo);
      if (c.esito === 'ok' && dopo?.esito !== 'ok') regressioni.push({ modello, controllo: c.controllo, prima: primo.binario, dopo: altro.binario, motivo: dopo?.motivo ?? 'non provato' });
    }
  }
}
rapporto.regressioni = regressioni;
if (USCITA) writeFileSync(USCITA, JSON.stringify(rapporto, null, 2));
/* la build la dice il motore (`/props`), non il nome della cartella: due binari stanno spesso in cartelle che si chiamano uguale */
const buildDi = (r) => /build (\S+)/u.exec(r.controlli.find((c) => c.controllo === 'props')?.dettaglio ?? '')?.[1] ?? r.binario;
for (const r of rapporto.risultati) console.log(`${r.modello} · ${buildDi(r)}: ${r.controlli.map((c) => `${c.controllo}=${c.esito}`).join(' ')}`);
console.log(regressioni.length ? `⛔ ${regressioni.length} regressioni:\n${regressioni.map((x) => `- ${x.modello} ${x.controllo}: ${x.motivo}`).join('\n')}` : '✅ nessuna regressione');
process.exit(regressioni.length ? 1 : 0);
