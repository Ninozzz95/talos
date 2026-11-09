#!/usr/bin/env node
/*
 * The five live measurements of the local vision form (`FORMA-VISTA-LOCALE-2026-11-01.md`, «Da misurare prima del codice»), one model at a
 * time, on 127.0.0.1:4183, with the shipped engine. No key, no paid model. Performance: only with its «libero», ≥ 10 GB free.
 *   1. the answer of the engine to an image WITHOUT the projector (HTTP code, sentence);
 *   2. the projector's memory (`[mtmd] estimated worst-case memory usage` in the engine log) and `/props` → `modalities`;
 *   3. tokens for one image (prompt tokens with the image minus the same prompt without it);
 *   4. `--spec-type ngram-mod` together with `--mmproj`: does the engine start, does it answer;
 *   5. `/completion` with `multimodal_data` (the road of the emulated tools).
 * Use: node scripts/misure-vista-locale.mjs --motore <dir> --modello <gguf> --proiettore <mmproj gguf> --immagine <png|jpg> --uscita <jsonl>
 */
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { setTimeout as dormi } from 'node:timers/promises';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1]; };
const MOTORE = arg('motore'); const MODELLO = arg('modello'); const PROIETTORE = arg('proiettore'); const IMMAGINE = arg('immagine'); const USCITA = arg('uscita');
if (!MOTORE || !MODELLO || !PROIETTORE || !IMMAGINE || !USCITA) { console.error('servono --motore --modello --proiettore --immagine --uscita'); process.exit(2); }
const PORTA = 4183;
const BASE = `http://127.0.0.1:${PORTA}`;
const dataUrl = `data:image/${/\.jpe?g$/iu.test(IMMAGINE) ? 'jpeg' : 'png'};base64,${readFileSync(IMMAGINE).toString('base64')}`;
const scrivi = (r) => { const riga = { at: new Date().toISOString(), modello: basename(MODELLO), ...r }; appendFileSync(USCITA, `${JSON.stringify(riga)}\n`); console.log(JSON.stringify(riga).slice(0, 300)); };
const ambiente = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/(_API_KEY|_TOKEN|_SECRET)$/iu.test(k) && !/^(OPENROUTER|OPENAI|GEMINI|ANTHROPIC|ZAI|DEEPSEEK|GROQ|MISTRAL|XAI)/iu.test(k)));

async function conMotore(extra, lavoro) {
  let registro = '';
  const p = spawn(join(MOTORE, 'llama-server.exe'), ['-m', MODELLO, '--host', '127.0.0.1', '--port', String(PORTA), '-ngl', '99', '-c', '8192', '--jinja', ...extra], { env: ambiente, windowsHide: true });
  p.stdout.on('data', (d) => { registro += d; }); p.stderr.on('data', (d) => { registro += d; });
  let uscito = null; p.on('exit', (c) => { uscito = c; });
  try {
    for (let i = 0; i < 600 && uscito === null; i++) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* not yet */ } await dormi(250); }
    if (uscito !== null) return { partito: false, uscita: uscito, coda: registro.split('\n').slice(-6).join(' | ') };
    return { partito: true, ...(await lavoro(() => registro)) };
  } finally {
    try { execFileSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    for (let i = 0; i < 40; i++) { try { await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(200) }); await dormi(100); } catch { break; } }
  }
}
const chiedi = async (messaggi) => {
  const r = await fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messaggi, max_tokens: 64, temperature: 0 }) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* text */ }
  return { stato: r.status, corpo: j, testo: j ? null : t.slice(0, 300) };
};
const DOMANDA = 'Describe this screenshot in one sentence.';
const conImmagine = [{ role: 'user', content: [{ type: 'text', text: DOMANDA }, { type: 'image_url', image_url: { url: dataUrl } }] }];
const senzaImmagine = [{ role: 'user', content: DOMANDA }];

/* 1 */
/* `conforme` (Mobile 1, Performance 1): the real refusal of THIS engine is still recognised by the code (`motoreLocaleNonVede`). To be run on
   every engine update: false means the sentence changed and the person would get the generic 500 again. */
const { motoreLocaleNonVede } = await import('../src/runtime-owner-adapter.mjs');
scrivi({ misura: 'senza-proiettore', ...(await conMotore([], async () => { const r = await chiedi(conImmagine); return { stato: r.stato, errore: r.corpo?.error ?? r.testo,
  conforme: motoreLocaleNonVede(r.stato, r.corpo ? JSON.stringify(r.corpo) : '') !== null }; })) });
/* 2 + 3 */
scrivi({ misura: 'con-proiettore', ...(await conMotore(['--mmproj', PROIETTORE], async (log) => {
  const props = await (await fetch(`${BASE}/props`)).json().catch(() => null);
  const base = await chiedi(senzaImmagine);
  const t0 = performance.now(); const img = await chiedi(conImmagine); const ms = Math.round(performance.now() - t0);
  const memoria = /\[mtmd\][^\n]*memory[^\n]*/iu.exec(log())?.[0] ?? null;
  return { modalities: props?.modalities ?? null, memoriaProiettore: memoria, tokenSenza: base.corpo?.usage?.prompt_tokens ?? null, tokenCon: img.corpo?.usage?.prompt_tokens ?? null,
    tokenImmagine: Number.isFinite(img.corpo?.usage?.prompt_tokens) && Number.isFinite(base.corpo?.usage?.prompt_tokens) ? img.corpo.usage.prompt_tokens - base.corpo.usage.prompt_tokens : null,
    msRisposta: ms, stato: img.stato, risposta: img.corpo?.choices?.[0]?.message?.content?.slice(0, 200) ?? img.corpo?.error ?? img.testo };
})) });
/* 4 */
scrivi({ misura: 'speculativa-e-proiettore', ...(await conMotore(['--mmproj', PROIETTORE, '--spec-type', 'ngram-mod'], async () => { const r = await chiedi(conImmagine); return { stato: r.stato, risposta: r.corpo?.choices?.[0]?.message?.content?.slice(0, 120) ?? r.corpo?.error ?? r.testo }; })) });
/* 5 */
scrivi({ misura: 'completion-multimodale', ...(await conMotore(['--mmproj', PROIETTORE], async () => {
  const marcatore = (await (await fetch(`${BASE}/props`)).json().catch(() => null))?.media_marker ?? '<__media__>';
  const r = await fetch(`${BASE}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: { prompt_string: `${DOMANDA}\n${marcatore}\n`, multimodal_data: [readFileSync(IMMAGINE).toString('base64')] }, n_predict: 48, temperature: 0 }) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* text */ }
  return { marcatore, stato: r.status, risposta: j?.content?.slice(0, 160) ?? j?.error ?? t.slice(0, 200) };
})) });
console.log('FINE');
