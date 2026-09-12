/*
 * BANCO BC-13 — la leva `--cache-reuse`.
 *
 * Il caso: il prefisso NON e piu identico. L'agente compatta la storia, o
 * riscrive un risultato d'attrezzo a meta conversazione. Con `--cache-reuse 0`
 * (il predefinito) tutto cio che sta DOPO il punto di divergenza si rielabora;
 * con un valore > 0 il server prova a riusare i blocchi identici spostandoli
 * di posizione (KV shift).
 *
 * Si misura `prompt_ms` e `cache_n` della SECONDA richiesta, quella divergente.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';

const a = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BINARIO = a('binario', 'C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-desktop\\harness-ui\\.local-runtime\\b10517-vulkan\\llama-server.exe');
const MODELLO = a('modello');
const ETICHETTA = a('etichetta', 'senza-nome');
const EXTRA = (a('extra', '') || '').trim();
const RIPETIZIONI = Number(a('ripetizioni', '3'));

async function portaLibera() { const s = createServer(); await new Promise((ok, ko) => { s.once('error', ko); s.listen(0, '127.0.0.1', ok); }); const p = s.address().port; await new Promise((ok) => s.close(ok)); return p; }
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

function testo(parole, seme) {
  const v = ('registro attrezzo chiamata risposta consegna verifica numero mediana ripetizione differenza ' +
    'percentuale contesto token memoria scheda processo prova cancello sonda misura banco modello').split(' ');
  let s = seme; const out = [];
  for (let i = 0; i < parole; i += 1) { s = (s * 1103515245 + 12345) % 2147483648; out.push(v[s % v.length]); if (i % 19 === 18) out.push('.\n'); }
  return out.join(' ');
}

async function post(base, k, corpo, p = '/v1/chat/completions') {
  const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  const porta = await portaLibera();
  const k = randomBytes(32).toString('hex');
  const argv = ['-m', MODELLO, '--host', '127.0.0.1', '--port', String(porta), '--api-key', k, '-c', '32768',
    '-ngl', '99', '-fa', '1', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--jinja', '--metrics', '--props',
    ...(EXTRA ? EXTRA.split(/\s+/u) : [])];
  const log = [];
  const f = spawn(BINARIO, argv, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  f.stdout.on('data', (c) => log.push(String(c))); f.stderr.on('data', (c) => log.push(String(c)));
  let morto = false; f.once('close', () => { morto = true; });
  const base = `http://127.0.0.1:${porta}`;
  const scad = Date.now() + 15_000 + (statSync(MODELLO).size / 1e9) * 20_000;
  let pronto = false;
  while (Date.now() < scad && !morto) { try { if ((await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${k}` } })).ok) { pronto = true; break; } } catch { /* attendo */ } await attendi(200); }
  if (!pronto) { f.kill('SIGTERM'); console.error(`[${ETICHETTA}] NON PRONTO\n${log.join('').slice(-1500)}`); process.exit(3); }

  const preambolo = testo(8000, 11);   // ~11k token stabili in testa
  const attrezzo1 = testo(2200, 22);   // il blocco che verra RISCRITTO
  const attrezzo1bis = testo(2200, 99); // versione diversa, stessa lunghezza
  const coda = testo(2600, 33);        // cio che sta DOPO la divergenza

  const conversazione = (mezzo) => ([
    { role: 'system', content: preambolo },
    { role: 'user', content: 'Primo passo.' },
    { role: 'assistant', content: `Risultato attrezzo:\n${mezzo}` },
    { role: 'user', content: `Secondo passo, con questo contesto:\n${coda}` },
    { role: 'assistant', content: 'Ricevuto.' },
    { role: 'user', content: 'Concludi in una riga.' },
  ]);

  const righe = [];
  for (let r = 0; r < RIPETIZIONI; r += 1) {
    const marca = `${r}-${randomBytes(4).toString('hex')}\n`;
    const conA = conversazione(attrezzo1); conA[0].content = marca + preambolo;
    const conB = conversazione(attrezzo1bis); conB[0].content = marca + preambolo;
    const primo = await post(base, k, { messages: conA, max_tokens: 16, temperature: 0, stream: false, cache_prompt: true });
    const secondo = await post(base, k, { messages: conB, max_tokens: 16, temperature: 0, stream: false, cache_prompt: true });
    righe.push({ primo: primo.timings, secondo: secondo.timings });
    process.stderr.write(`[${ETICHETTA}] r${r}: 1° prompt_ms=${primo.timings.prompt_ms.toFixed(0)} n=${primo.timings.prompt_n} cache=${primo.timings.cache_n} | 2° (divergente) prompt_ms=${secondo.timings.prompt_ms.toFixed(0)} n=${secondo.timings.prompt_n} cache=${secondo.timings.cache_n}\n`);
  }
  f.kill('SIGTERM'); await attendi(1000);
  const med = (v) => { const s = [...v].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  console.log(JSON.stringify({
    etichetta: ETICHETTA, extra: EXTRA,
    divergente_prompt_ms_mediana: med(righe.map((x) => x.secondo.prompt_ms)),
    divergente_prompt_n_mediana: med(righe.map((x) => x.secondo.prompt_n)),
    divergente_cache_n_mediana: med(righe.map((x) => x.secondo.cache_n)),
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
