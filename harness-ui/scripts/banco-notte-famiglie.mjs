#!/usr/bin/env node
/*
 * ⭐ The night of the families (owner 01/11/2026): «Sei famiglie + LFM3 piccolo», «Sì, scarica e cancella a turno».
 * For each family, one at a time: download the three versions from the official repository, check every file against its LFS sha256,
 * run `banco-motore-vero.mjs` on them, delete what this script downloaded, go to the next. Qwen3.8 was already on the disk and stays.
 *
 * ⛔ Rules it keeps by itself, so that it can run without anyone watching:
 *   - the bench starts only with `--via` (Performance's explicit go, 01/11 sera), never because a lock expired; between families it
 *     never starts while another session holds the campaign lock (`campagna-in-corso.json`, not expired): it waits;
 *   - its own lock is taken for the bench only, released at the end, and only if it is still ours;
 *   - a start line and an end line in `registro-corse-pesanti.jsonl` for every bench and every download;
 *   - free disk read before every download (size + 10 GB margin), or the family is skipped and said;
 *   - only files this script downloaded are deleted, never the models that were already there;
 *   - a stop (Ctrl+C, end of the session) kills the bench tree, writes the end line and releases the lock.
 *
 * Use: node scripts/banco-notte-famiglie.mjs [--solo-scarica <family>] [--da <family>] [--mbs 10@<ISO hour>/25] [--coppie 100] [--caricamento none]
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, statfsSync } from 'node:fs';
import { scaricaUno } from './banco-scarico.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as attendi } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const arg = (nome, ripiego = null) => { const i = process.argv.indexOf(`--${nome}`); return i === -1 ? ripiego : process.argv[i + 1]; };
const CASA = (process.env.TALOS_CASA_BANCO ?? homedir()).replaceAll('\\', '/');
const PROGETTI = `${CASA}/Desktop/projects`;
const PROVE = `${PROGETTI}/TALOS-RICERCHE/prove`;
const CARTELLA = `${PROVE}/banco-famiglie-2026-11-01`;
const USCITA = `${PROVE}/banco-motore-2026-11-01/famiglie-notte.jsonl`;
const STATO = `${CARTELLA}/stato.jsonl`;
const REGISTRO = `${PROGETTI}/registro-corse-pesanti.jsonl`;
const LUCCHETTO = `${PROGETTI}/campagna-in-corso.json`;
/* Desktop, 01/11 sera: the handoff folders move to Downloads/TALOS/<name> and the old names disappear; the lock tool is read where it is at bench time */
const ESCLUSIVA_DOVE = ['TALOS/desktop', 'handoff-talos-2026-09-27'].map((c) => `${CASA}/Downloads/${c}/in-corso/performance-2026-10-29/strumenti/esclusiva.mjs`);
const esclusiva = () => { const p = ESCLUSIVA_DOVE.find((x) => existsSync(x)); if (!p) throw new Error(`strumento del lucchetto non trovato: ${ESCLUSIVA_DOVE.join(' | ')}`); return p; };
const SESSIONE = 'ec82f41a-6b82-477d-908d-6df1a85c40b1';
const BANCO = fileURLToPath(new URL('./banco-motore-vero.mjs', import.meta.url));
const MOTORI = { vecchio: `${PROVE}/llama-b11669/vulkan`, nuovo: `${PROVE}/llama-b11960/vulkan`, cpu: `${PROVE}/llama-b11960/cpu` };
const MARGINE_DISCO = 10e9;
const MINUTI_BANCO = 200; // ~2 h 20 measured per family on 01/11, with room: the lock expires by itself if this process dies

/* the list the owner chose on 01/11, sizes read that day on Hugging Face; `giaSulDisco` is never downloaded nor deleted */
const FAMIGLIE = [
  { nome: 'qwen3.8', giaSulDisco: `${PROVE}/modelli-grandi-2026-10-26`, file: ['Qwen3.8-27B-UD-Q3_K_XL.gguf', 'Qwen3.8-27B-UD-Q4_K_M.gguf', 'Qwen3.8-27B-UD-Q5_K_M.gguf'] },
  { nome: 'gemma4', repo: 'unsloth/gemma-4-26B-A4B-it-GGUF', file: ['gemma-4-26B-A4B-it-UD-Q3_K_XL.gguf', 'gemma-4-26B-A4B-it-UD-Q4_K_M.gguf', 'gemma-4-26B-A4B-it-UD-Q5_K_M.gguf'] },
  { nome: 'lfm2.5', repo: 'unsloth/LFM2.5-24B-A2B-GGUF', file: ['LFM2.5-24B-A2B-UD-Q4_K_XL.gguf', 'LFM2.5-24B-A2B-UD-Q5_K_XL.gguf', 'LFM2.5-24B-A2B-UD-Q6_K_XL.gguf'] },
  { nome: 'devstral2', repo: 'unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF', file: ['Devstral-Small-2-24B-Instruct-2512-UD-Q3_K_XL.gguf', 'Devstral-Small-2-24B-Instruct-2512-UD-Q4_K_XL.gguf', 'Devstral-Small-2-24B-Instruct-2512-UD-Q5_K_XL.gguf'] },
  { nome: 'ernie4.5', repo: 'unsloth/ERNIE-4.5-21B-A3B-PT-GGUF', file: ['ERNIE-4.5-21B-A3B-PT-Q4_K_M.gguf', 'ERNIE-4.5-21B-A3B-PT-UD-Q5_K_XL.gguf', 'ERNIE-4.5-21B-A3B-PT-Q6_K.gguf'] },
  { nome: 'gpt-oss', repo: 'unsloth/gpt-oss-20b-GGUF', file: ['gpt-oss-20b-Q4_K_M.gguf', 'gpt-oss-20b-UD-Q8_K_XL.gguf', 'gpt-oss-20b-F16.gguf'] },
  { nome: 'lfm3-piccolo', repo: 'LiquidAI/LFM3-1.7B-GGUF', file: ['LFM3-1.7B-Q4_K_M.gguf', 'LFM3-1.7B-Q8_0.gguf'], piccolo: true },
];

// «10@2026-11-02T00:44:00+01:00/25» = 10 MB/s until that hour, then 25 (Performance, 01/11: no disturbance during its campaign)
const forma = /^(\d+)(?:@([^/]+)\/(\d+))?$/u.exec(String(arg('mbs', '25')));
if (!forma) { console.error('--mbs: <MB/s> oppure <MB/s>@<ora ISO>/<MB/s>'); process.exit(2); }
const ORA_CAMBIO = forma[2] ? Date.parse(forma[2]) : Infinity;
const tetto = () => (Date.now() < ORA_CAMBIO ? Number(forma[1]) : Number(forma[3])) * 1_000_000;
const SOLO_SCARICA = arg('solo-scarica');
const DA = arg('da');
const PASSANTI = ['coppie', 'caricamento', 'ripetizioni'].flatMap((n) => (arg(n) ? [`--${n}`, arg(n)] : []));
/* Performance, 01/11 sera: the bench never starts by itself when a lock expires; it starts only after its explicit «via», then runs the night alone */
const VIA = arg('via');
const PIANO = process.argv.includes('--piano'); // prova a secco (Performance): stampa il piano e la durata stimata, non scarica e non apre modelli
if (!SOLO_SCARICA && !VIA && !PIANO) { console.error('il banco parte solo col «via» esplicito di Performance: --via "<chi e quando>"; senza, solo --solo-scarica <famiglia>'); process.exit(2); }
if (SOLO_SCARICA && !FAMIGLIE.some((f) => f.nome === SOLO_SCARICA)) { console.error(`famiglia sconosciuta: ${SOLO_SCARICA}`); process.exit(2); }
if (DA && !FAMIGLIE.some((f) => f.nome === DA)) { console.error(`famiglia sconosciuta: ${DA}`); process.exit(2); }

mkdirSync(CARTELLA, { recursive: true });
const ora = () => new Date().toISOString();
const stato = (riga) => { const r = { at: ora(), ...riga }; appendFileSync(STATO, `${JSON.stringify(r)}\n`); console.log(JSON.stringify(r)); };
let figlio = null; // the bench, killed with its tree on a stop
let corsaViva = null; // the heavy run whose end line is still owed
const registro = (evento, corsa, pid) => appendFileSync(REGISTRO, `${JSON.stringify({ at: ora().replace(/\.\d+Z$/u, 'Z'), sessione: 'Motore locale', evento, corsa, pid })}\n`);

/* ---------- the lock: never over someone else's, released only if still ours ---------- */
function chiTieneIlLucchetto() {
  try { const d = JSON.parse(readFileSync(LUCCHETTO, 'utf8')); return Date.parse(d.scadeAlle) > Date.now() ? d : null; } catch { return null; }
}
async function aspettaIlLucchetto(perChi) {
  for (let detto = false; ; detto = true) {
    const d = chiTieneIlLucchetto();
    if (!d || d.sessionId === SESSIONE) return;
    if (!detto) stato({ evento: 'attesa-lucchetto', famiglia: perChi, tiene: d.sessione, corsa: d.corsa, scade: d.scadeAlle });
    await attendi(120_000);
  }
}
const prendi = (corsa) => execFileSync(process.execPath, [esclusiva(), 'prendi', corsa, String(MINUTI_BANCO), SESSIONE, 'Motore locale'], { stdio: 'inherit' });
function lasciaSeNostro() { if (chiTieneIlLucchetto()?.sessionId === SESSIONE) execFileSync(process.execPath, [esclusiva(), 'lascia'], { stdio: 'inherit' }); }

/* ---------- the download: `banco-scarico.mjs` (02/11: Range appended only on 206, a 200 from zero, speed watch, retry cap, sha256) ---------- */
const scaricaFile = (repo, nome, oid, byte, dove) => scaricaUno({ url: `https://huggingface.co/${repo}/resolve/main/${nome}`, nome, oid, byte, dove, tetto, stato, attendi });
async function scaricaFamiglia(f) {
  if (f.giaSulDisco) return { percorsi: f.file.map((n) => join(f.giaSulDisco, n)), scaricati: [] };
  const dove = join(CARTELLA, f.nome);
  mkdirSync(dove, { recursive: true });
  const albero = await (await fetch(`https://huggingface.co/api/models/${f.repo}/tree/main?recursive=true`, { headers: { 'User-Agent': 'talos-bench' } })).json();
  const voci = f.file.map((n) => albero.find((v) => v.path === n));
  const mancante = f.file.find((_, i) => !voci[i]?.lfs?.oid);
  if (mancante) throw new Error(`impronta non trovata su Hugging Face: ${mancante}`);
  const servono = voci.reduce((s, v, i) => s + (existsSync(join(dove, f.file[i])) ? 0 : v.size), 0);
  const { bavail, bsize } = statfsSync(CARTELLA);
  if (bavail * bsize < servono + MARGINE_DISCO) throw new Error(`disco: servono ${(servono / 1e9).toFixed(1)} GB più 10 di margine, liberi ${(bavail * bsize / 1e9).toFixed(1)}`);
  const corsa = `scarico della famiglia ${f.nome} (${(servono / 1e9).toFixed(1)} GB)`;
  registro('inizio', corsa, process.pid);
  corsaViva = corsa; // a stop in the middle still writes the end line
  try {
    const percorsi = [];
    const scaricati = [];
    for (const [i, v] of voci.entries()) {
      stato({ evento: 'scarico', famiglia: f.nome, file: v.path, gb: Number((v.size / 1e9).toFixed(1)) });
      const { finale, giaPresente } = await scaricaFile(f.repo, v.path, v.lfs.oid, v.size, dove);
      percorsi.push(finale);
      scaricati.push(finale); // a file left by a previous night of this script is ours as well
      stato({ evento: 'impronta-confrontata', famiglia: f.nome, file: f.file[i], giaPresente });
    }
    return { percorsi, scaricati };
  } finally { registro('fine', corsa, process.pid); corsaViva = null; }
}
function chiudi(segnale) {
  if (figlio?.pid) { try { execFileSync('taskkill', ['/PID', String(figlio.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ } }
  if (corsaViva) registro('fine', `${corsaViva} (fermata: ${segnale})`, process.pid);
  lasciaSeNostro();
  stato({ evento: 'fermata', segnale });
  process.exit(130);
}
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(s, () => chiudi(s));

async function misura(f, percorsi) {
  await aspettaIlLucchetto(f.nome);
  const corsa = `banco del motore, famiglia ${f.nome}`;
  prendi(corsa);
  corsaViva = corsa;
  registro('inizio', corsa, process.pid);
  stato({ evento: 'banco', famiglia: f.nome, modelli: percorsi.length });
  const ambiente = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/(_API_KEY|_TOKEN|_SECRET)$/u.test(k)
    && !/^(OPENROUTER|OPENAI|GEMINI|ANTHROPIC|ZAI|DEEPSEEK|GROQ|MISTRAL|XAI)/u.test(k)));
  const uscita = await new Promise((ok) => {
    figlio = spawn(process.execPath, [BANCO, '--vecchio', MOTORI.vecchio, '--nuovo', MOTORI.nuovo, '--cpu', MOTORI.cpu, '--modelli', percorsi.join(','), '--uscita', USCITA, ...PASSANTI],
      { cwd: fileURLToPath(new URL('..', import.meta.url)), env: ambiente, stdio: 'inherit', windowsHide: true });
    figlio.on('exit', (codice, segnale) => ok(codice ?? segnale));
    figlio.on('error', (e) => ok(`errore: ${e.message}`));
  });
  figlio = null;
  registro('fine', corsa, process.pid);
  corsaViva = null;
  lasciaSeNostro();
  stato({ evento: 'banco-finito', famiglia: f.nome, uscita });
  return uscita;
}

/*
 * 01/11/2026 sera (Performance, strada A): `--foto` misura il salvataggio e la rimessa della scheda («Memoria delle conversazioni», soglia di
 * 1 s al 95° percentile) su UN quant per famiglia, quello di mezzo, DOPO il suo confronto e PRIMA di cancellarla; poi 3 minuti di riposo prima
 * della famiglia dopo. Esiti in un file separato; le foto stanno in una cartella temporanea del banco che si cancella con la corsa; sotto i
 * 20 GB liberi la famiglia si salta e lo si scrive, il confronto va avanti. Il confronto (`misura`) non cambia.
 */
const FOTO = process.argv.includes('--foto');
const USCITA_FOTO = `${PROVE}/banco-motore-2026-11-01/famiglie-notte-foto.jsonl`;
const DISCO_MINIMO_FOTO = 20e9;
const RIPOSO_DOPO_FOTO_MS = 180_000;
const discoLibero = (dove) => { try { const s = statfsSync(dove); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; } };
const diMezzo = (percorsi) => percorsi[Math.floor((percorsi.length - 1) / 2)];

async function misuraFoto(f, percorsi) {
  const libero = Math.min(discoLibero(PROVE), discoLibero(process.env.TEMP ?? PROVE));
  if (libero < DISCO_MINIMO_FOTO) { stato({ evento: 'foto-saltata', famiglia: f.nome, motivo: `disco libero ${(libero / 1e9).toFixed(1)} GB, sotto 20` }); return 'saltata'; }
  await aspettaIlLucchetto(f.nome);
  const corsa = `banco del motore, foto della scheda, famiglia ${f.nome}`;
  prendi(corsa);
  corsaViva = corsa;
  registro('inizio', corsa, process.pid);
  const modello = diMezzo(percorsi);
  stato({ evento: 'foto', famiglia: f.nome, modello });
  const ambiente = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/(_API_KEY|_TOKEN|_SECRET)$/u.test(k)
    && !/^(OPENROUTER|OPENAI|GEMINI|ANTHROPIC|ZAI|DEEPSEEK|GROQ|MISTRAL|XAI)/u.test(k)));
  const uscita = await new Promise((ok) => {
    figlio = spawn(process.execPath, [BANCO, '--tweak', '--solo-foto', '--vecchio', MOTORI.vecchio, '--nuovo', MOTORI.nuovo, '--cpu', MOTORI.cpu, '--modelli', modello, '--uscita', USCITA_FOTO],
      { cwd: fileURLToPath(new URL('..', import.meta.url)), env: ambiente, stdio: 'inherit', windowsHide: true });
    figlio.on('exit', (codice, segnale) => ok(codice ?? segnale));
    figlio.on('error', (e) => ok(`errore: ${e.message}`));
  });
  figlio = null;
  registro('fine', corsa, process.pid);
  corsaViva = null;
  lasciaSeNostro();
  stato({ evento: 'foto-finita', famiglia: f.nome, uscita });
  return uscita;
}

const daFare = SOLO_SCARICA ? FAMIGLIE.filter((f) => f.nome === SOLO_SCARICA) : FAMIGLIE.slice(DA ? FAMIGLIE.findIndex((f) => f.nome === DA) : 0);
if (PIANO) {
  /* the sizes: from the disk when the file is there, else from the Hugging Face tree (one GET per repository, no download) */
  const MINUTI_CONFRONTO = 140; // ~2 h 20 per family measured on 01/11 (the comment of MINUTI_BANCO)
  const pesoGb = async (f, nome) => {
    for (const dove of [f.giaSulDisco, CARTELLA].filter(Boolean)) { try { return statSync(join(dove, nome)).size / 1e9; } catch { /* not here */ } }
    if (!f.repo) return null;
    try { const albero = await (await fetch(`https://huggingface.co/api/models/${f.repo}/tree/main`)).json(); return (albero.find((x) => x.path === nome)?.size ?? 0) / 1e9 || null; } catch { return null; }
  };
  let totale = 0;
  console.log(`PIANO (prova a secco), ${daFare.length} famiglie, --foto ${FOTO ? 'sì' : 'no'}; uscita confronto ${USCITA}${FOTO ? `, foto ${USCITA_FOTO}` : ''}`);
  for (const f of daFare) {
    const pesi = await Promise.all(f.file.map((n) => pesoGb(f, n)));
    const confronto = f.piccolo ? Math.round(MINUTI_CONFRONTO / 3) : MINUTI_CONFRONTO;
    /* foto: about ten openings of the middle quant (reading the file at ~1.5 GB/s plus ~15 s each) and two minutes of prompts */
    const medio = pesi[Math.floor((pesi.length - 1) / 2)];
    const foto = FOTO ? Math.round((10 * ((medio ?? 20) / 1.5 + 15) + 120) / 60) : 0;
    const riposo = FOTO && f !== daFare.at(-1) ? RIPOSO_DOPO_FOTO_MS / 60_000 : 0;
    totale += confronto + foto + riposo;
    console.log(`- ${f.nome}: ${f.file.map((n, i) => `${n} (${pesi[i] == null ? '? GB' : `${pesi[i].toFixed(1)} GB`})`).join(', ')}`
      + ` · confronto ~${confronto} min${FOTO ? ` · foto su ${f.file[Math.floor((f.file.length - 1) / 2)]} ~${foto} min · riposo ${riposo} min` : ''}`);
  }
  console.log(`durata stimata: ~${Math.round(totale)} min (~${(totale / 60).toFixed(1)} h), senza i download`);
  process.exit(0);
}
stato({ evento: 'inizio', famiglie: daFare.map((f) => f.nome), soloScarica: Boolean(SOLO_SCARICA), via: VIA, passanti: PASSANTI, foto: FOTO });
let errori = 0;
for (const f of daFare) {
  let scaricata;
  try { scaricata = await scaricaFamiglia(f); } catch (e) { errori += 1; stato({ evento: 'famiglia-saltata', famiglia: f.nome, motivo: e.message }); continue; }
  if (SOLO_SCARICA) continue;
  const uscita = await misura(f, scaricata.percorsi);
  if (uscita !== 0) errori += 1;
  if (FOTO) {
    const foto = await misuraFoto(f, scaricata.percorsi); // un esito della foto non conta fra gli errori del confronto
    if (foto !== 'saltata' && f !== daFare.at(-1)) { stato({ evento: 'riposo', minuti: RIPOSO_DOPO_FOTO_MS / 60_000 }); await attendi(RIPOSO_DOPO_FOTO_MS); }
  }
  for (const p of scaricata.scaricati) rmSync(p, { force: true });
  stato({ evento: 'cancellata', famiglia: f.nome, file: scaricata.scaricati.length });
}
stato({ evento: 'fine', errori });
console.log(`EXIT=${errori ? 1 : 0}`);
process.exit(errori ? 1 : 0);
