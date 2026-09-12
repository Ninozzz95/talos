/*
 * BANCO BC-13 — misura del motore locale (llama-server) leva per leva.
 *
 * ⛔ Mai la porta 4174: il banco alloca una porta libera dal sistema.
 * ⛔ I tempi NON li cronometro io: li legge dal campo `timings` che il server
 *    mette in ogni risposta (`prompt_ms`, `predicted_ms`, `cache_n`).
 *
 * Uso:
 *   node banco-motore-locale.mjs --modello <path.gguf> --etichetta base \
 *        --ripetizioni 3 [--extra "--cache-reuse 256"] [--ctx 16384]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { writeFileSync, appendFileSync, statSync } from 'node:fs';

function arg(nome, predefinito = null) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}

const BINARIO = arg('binario', 'C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-desktop\\harness-ui\\.local-runtime\\b10517-vulkan\\llama-server.exe');
const MODELLO = arg('modello');
const ETICHETTA = arg('etichetta', 'senza-nome');
const RIPETIZIONI = Number(arg('ripetizioni', '3'));
const CTX = Number(arg('ctx', '16384'));
const NGL = arg('ngl', '99');
const EXTRA = (arg('extra', '') || '').trim();
const USCITA = arg('uscita', 'C:\\Users\\Antonino\\AppData\\Local\\Temp\\claude\\C--Users-Antonino-Desktop-projects-AVM-harness-desktop\\af5c3844-a5da-4bb5-a142-7740e39b623d\\scratchpad\\misure.jsonl');
const N_PREDICT = Number(arg('predict', '128'));
const BERSAGLIO_TOKEN = Number(arg('token-preambolo', '11000'));
/* `cita` = compito d'agente vero: ricopiare alla lettera un pezzo del contesto
 * (eco di un risultato d'attrezzo, modifica di un file). E il caso in cui la
 * decodifica speculativa a n-grammi puo mordere, perche l'uscita e gia nel
 * prompt. `riassumi` = testo nuovo, dove non puo mordere. Si misurano entrambi. */
const COMPITO = arg('compito', 'riassumi');

if (!MODELLO) { console.error('serve --modello'); process.exit(2); }

async function portaLibera() {
  const s = createServer();
  await new Promise((ok, ko) => { s.once('error', ko); s.listen(0, '127.0.0.1', ok); });
  const p = s.address().port;
  await new Promise((ok) => s.close(ok));
  return p;
}

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

/* Testo deterministico: stesso preambolo per OGNI configurazione, altrimenti
 * le misure non si confrontano. LCG con seme fisso, nessun Math.random. */
function testoDeterministico(parole) {
  const vocab = ('il sistema deve leggere ogni riga del registro prima di dichiarare chiusa una fase ' +
    'la misura vale solo se il banco ripete lo stesso prompt con la stessa configurazione ' +
    'un cancello che non respinge nulla non e un cancello e va provato anche al verso contrario ' +
    'quando la cache del prefisso prende il tempo al primo token crolla e la generazione resta uguale ' +
    'strumento binario modello contesto token secondo memoria scheda grafica processo registro prova ' +
    'attrezzo chiamata risposta consegna verifica numero mediana ripetizione differenza percentuale').split(' ');
  let stato = 123456789;
  const out = [];
  for (let i = 0; i < parole; i += 1) {
    stato = (stato * 1103515245 + 12345) % 2147483648;
    out.push(vocab[stato % vocab.length]);
    if (i % 17 === 16) out.push('.\n');
  }
  return out.join(' ');
}

async function chiama(base, chiave, corpo, percorso = '/v1/chat/completions') {
  const r = await fetch(`${base}${percorso}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chiave}` },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${percorso} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  const porta = await portaLibera();
  const chiave = randomBytes(32).toString('hex');
  const argv = [
    '-m', MODELLO,
    '--host', '127.0.0.1', '--port', String(porta), '--api-key', chiave,
    '-c', String(CTX),
    ...(NGL === 'no' ? [] : ['-ngl', NGL]),
    ...(NGL === 'no' ? [] : ['-fa', '1', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0']),
    '--jinja', '--metrics', '--props',
    ...(EXTRA ? EXTRA.split(/\s+/u) : []),
  ];
  const log = [];
  const figlio = spawn(BINARIO, argv, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  figlio.stdout.on('data', (c) => log.push(String(c)));
  figlio.stderr.on('data', (c) => log.push(String(c)));
  let morto = false;
  figlio.once('close', () => { morto = true; });

  const base = `http://127.0.0.1:${porta}`;
  const bytes = statSync(MODELLO).size;
  const scadenza = Date.now() + 15_000 + (bytes / 1e9) * 20_000;
  const t0 = Date.now();
  let pronto = false;
  while (Date.now() < scadenza && !morto) {
    try {
      const r = await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${chiave}` } });
      if (r.ok) { pronto = true; break; }
    } catch { /* non ancora in ascolto */ }
    await attendi(200);
  }
  const msCaricamento = Date.now() - t0;
  if (!pronto) {
    figlio.kill('SIGTERM');
    console.error(`[${ETICHETTA}] NON PRONTO dopo ${msCaricamento} ms\n${log.join('').slice(-3000)}`);
    process.exit(3);
  }

  const props = await (await fetch(`${base}/props`, { headers: { Authorization: `Bearer ${chiave}` } })).json();

  /* Preambolo calibrato sui TOKEN VERI del tokenizzatore di questo modello,
   * non su una stima di caratteri: si chiede a /tokenize e si corregge. */
  let parole = Math.round(BERSAGLIO_TOKEN * 0.75);
  let preambolo = '';
  let nToken = 0;
  for (let giro = 0; giro < 8; giro += 1) {
    preambolo = testoDeterministico(parole);
    const t = await chiama(base, chiave, { content: preambolo }, '/tokenize');
    nToken = t.tokens.length;
    if (Math.abs(nToken - BERSAGLIO_TOKEN) <= 150) break;
    parole = Math.max(50, Math.round(parole * (BERSAGLIO_TOKEN / Math.max(1, nToken))));
  }

  const DOMANDA = COMPITO === 'cita'
    ? `Ricopia ALLA LETTERA, senza commenti, questo passaggio del testo di sistema:
---
${preambolo.slice(2000, 3200)}
---`
    : 'Riassumi in una riga la regola principale.';
  const DOMANDA_2 = COMPITO === 'cita'
    ? `Ricopia ALLA LETTERA, senza commenti, questo passaggio:
---
${preambolo.slice(5000, 6200)}
---`
    : 'E la seconda regola?';

  const misure = [];
  for (let rip = 0; rip < RIPETIZIONI; rip += 1) {
    /* FREDDO — marcatore unico in TESTA: nessun prefisso comune con i giri
     * precedenti, quindi il server rielabora tutti gli ~11.000 token. */
    const marcatore = `giro-${rip}-${randomBytes(6).toString('hex')}`;
    const sistema = `${marcatore}\n${preambolo}`;
    const freddo = await chiama(base, chiave, {
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: DOMANDA }],
      max_tokens: N_PREDICT, temperature: 0, stream: false, cache_prompt: true,
    });
    /* CALDO — stesso sistema, la conversazione cresce: e il caso vero
     * dell'agente (turno successivo con lo stesso preambolo davanti). */
    const caldo = await chiama(base, chiave, {
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: DOMANDA },
        { role: 'assistant', content: freddo.choices[0].message.content ?? 'ok' },
        { role: 'user', content: DOMANDA_2 },
      ],
      max_tokens: N_PREDICT, temperature: 0, stream: false, cache_prompt: true,
    });
    misure.push({
      rip,
      freddo: { ...freddo.timings, prompt_n: freddo.timings?.prompt_n, cache_n: freddo.timings?.cache_n },
      caldo: { ...caldo.timings },
    });
    process.stderr.write(`[${ETICHETTA}] giro ${rip}: freddo prompt_ms=${freddo.timings?.prompt_ms?.toFixed(0)} (n=${freddo.timings?.prompt_n}, cache=${freddo.timings?.cache_n}) gen=${freddo.timings?.predicted_per_second?.toFixed(2)} t/s | caldo prompt_ms=${caldo.timings?.prompt_ms?.toFixed(0)} (n=${caldo.timings?.prompt_n}, cache=${caldo.timings?.cache_n})\n`);
  }

  const metrics = await (await fetch(`${base}/metrics`, { headers: { Authorization: `Bearer ${chiave}` } })).text();

  let memoriaMB = null;
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${figlio.pid}).PeakWorkingSet64"`, { encoding: 'utf8' });
    memoriaMB = Math.round(Number(out.trim()) / 1048576);
  } catch { memoriaMB = null; }

  figlio.kill('SIGTERM');
  await attendi(1500);
  if (!morto) { try { process.kill(figlio.pid, 'SIGKILL'); } catch { /* gia morto */ } }

  const mediana = (v) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const riga = {
    etichetta: ETICHETTA,
    compito: COMPITO,
    quando: new Date().toISOString(),
    modello: MODELLO.split(/[\\/]/u).pop(),
    argv: argv.map((a) => (a === chiave ? '<chiave>' : a)),
    ctx: CTX,
    tokenPreambolo: nToken,
    msCaricamento,
    memoriaPiccoMB: memoriaMB,
    freddo: {
      promptMsMediana: mediana(misure.map((m) => m.freddo.prompt_ms)),
      promptTokenSMediana: mediana(misure.map((m) => m.freddo.prompt_per_second)),
      promptN: mediana(misure.map((m) => m.freddo.prompt_n)),
      cacheN: mediana(misure.map((m) => m.freddo.cache_n)),
      genTokenSMediana: mediana(misure.map((m) => m.freddo.predicted_per_second)),
    },
    caldo: {
      promptMsMediana: mediana(misure.map((m) => m.caldo.prompt_ms)),
      promptN: mediana(misure.map((m) => m.caldo.prompt_n)),
      cacheN: mediana(misure.map((m) => m.caldo.cache_n)),
      genTokenSMediana: mediana(misure.map((m) => m.caldo.predicted_per_second)),
    },
    grezzo: misure,
    props: { n_ctx: props.default_generation_settings?.n_ctx ?? null, modello: props.model_path ?? null },
    specAccettati: /spec_decode_num_accepted_tokens_total (\d+)/u.exec(metrics)?.[1] ?? null,
    specDraftati: /spec_decode_num_drafted_tokens_total (\d+)/u.exec(metrics)?.[1] ?? null,
  };
  appendFileSync(USCITA, `${JSON.stringify(riga)}\n`, 'utf8');
  writeFileSync(`${USCITA}.${ETICHETTA}.log`, log.join(''), 'utf8');
  console.log(JSON.stringify({ etichetta: ETICHETTA, freddo: riga.freddo, caldo: riga.caldo, msCaricamento, memoriaPiccoMB: memoriaMB, specAccettati: riga.specAccettati, specDraftati: riga.specDraftati }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
