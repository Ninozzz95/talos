#!/usr/bin/env node
/**
 * Il cancello comune sulle impronte del nucleo (richiesta 161, decisione 402; blocco 0 della 0.2.4).
 *
 * ⛔ 18/11/2026, misura del lettore (`RAPPORTO-ALLINEAMENTO-TRE-PRODOTTI-2026-11-18.md`): fra le teste uscite di PC, CLI e telefono 397 file
 *   del nucleo erano uguali, 53 diversi e 20 assenti, e nessuno se n'era accorto: il nucleo «condiviso» lo era solo a parole. Il telefono
 *   0.1.48 portava il nucleo della 0.2.1, la CLI quello della 0.2.2, il PC il suo.
 * ⇒ Uno script che, per ogni file dell'elenco (UNA fonte: `nucleo-condiviso.json`), calcola lo sha256 del contenuto nelle tre copie,
 *   stampa i diversi e gli assenti ed esce 1 se ce n'è anche uno solo fuori dalle eccezioni motivate (`nucleo-eccezioni.json`).
 *   Una copia è un albero di git (`git:<rif>`, sola lettura degli oggetti: `ls-tree` + `cat-file --batch`, nessun checkout) oppure una
 *   cartella. Il telefono vive in una storia senza base comune col PC: il confronto è per contenuto, mai per commit.
 * Come la CLI fissa il suo nucleo (`cli/scripts/pack-vendor.mjs`: sha256 per file nel manifesto) e come il telefono controlla il commit dentro
 *   l'APK (`verifica-r4-nell-apk.mjs`): qui le tre colonne insieme.
 *
 * Uso:   node harness-ui/scripts/cancello/impronte-nucleo.mjs --pc <git:rif|cartella> --cli <git:rif|cartella> --telefono <git:rif|cartella>
 *          [--deposito <cartella di git>] [--elenco <json>] [--eccezioni <json>] [--json <file del rapporto>]
 * Esce:  0 tutto uguale (o eccezione motivata) · 1 file diversi o assenti · 2 uso sbagliato o elenco/eccezioni non validi.
 * ⛔ Non è agganciato alla CI (blocco 0): dove andrebbe lo dice il rapporto dell'agente 024-B0.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
export const PRODOTTI = Object.freeze(['pc', 'cli', 'telefono']);

/** L'elenco del nucleo, validato: `{ cartelle, file, fuoriCartelle: Set, fuoriFile: RegExp }`. */
export function leggiElenco(testo) {
  const e = JSON.parse(testo);
  if (e?.schema !== 'talos.nucleo-condiviso.v1' || !Array.isArray(e.cartelle) || !Array.isArray(e.file)) throw Error('elenco del nucleo non valido (schema talos.nucleo-condiviso.v1, cartelle, file)');
  const sani = (xs) => xs.every((x) => typeof x === 'string' && x && !x.includes('..') && !x.startsWith('/') && !x.includes('\\'));
  if (!sani(e.cartelle) || !sani(e.file)) throw Error('elenco del nucleo: percorsi relativi con «/», senza «..»');
  return { cartelle: e.cartelle, file: e.file, fuoriCartelle: new Set(e.fuori?.cartelle ?? []), fuoriFile: new RegExp(e.fuori?.file ?? '(?!)', 'u') };
}

/** Le eccezioni, validate: ogni riga ha file, prodotto, motivo e fonte. Mappa `prodotto → Set(file)`. */
export function leggiEccezioni(testo) {
  const e = JSON.parse(testo);
  if (e?.schema !== 'talos.nucleo-eccezioni.v1' || !Array.isArray(e.eccezioni)) throw Error('eccezioni non valide (schema talos.nucleo-eccezioni.v1, eccezioni)');
  const mappa = new Map(PRODOTTI.map((p) => [p, new Set()]));
  for (const [i, r] of e.eccezioni.entries()) {
    for (const campo of ['file', 'prodotto', 'motivo', 'fonte']) {
      if (typeof r?.[campo] !== 'string' || !r[campo].trim()) throw Error(`eccezione ${i + 1}: manca «${campo}» (un'eccezione senza motivo e fonte non vale)`);
    }
    if (!mappa.has(r.prodotto)) throw Error(`eccezione ${i + 1}: prodotto «${r.prodotto}» sconosciuto (pc, cli, telefono)`);
    mappa.get(r.prodotto).add(r.file);
  }
  return mappa;
}

/** Un percorso relativo («/») appartiene al nucleo? */
export function nelNucleo(percorso, elenco) {
  if (elenco.file.includes(percorso)) return true;
  const radice = elenco.cartelle.find((c) => percorso.startsWith(`${c}/`));
  if (!radice) return false;
  const parti = percorso.split('/');
  if (parti.slice(0, -1).some((p) => elenco.fuoriCartelle.has(p))) return false;
  return !elenco.fuoriFile.test(parti.at(-1));
}

const sha256 = (dati) => createHash('sha256').update(dati).digest('hex');

/** Una cartella: `Map(percorso → sha256)` dei soli file del nucleo. */
function improntaDiCartella(cartella, elenco) {
  const fuori = new Map();
  const aggiungi = (relativo) => {
    const pieno = join(cartella, ...relativo.split('/'));
    fuori.set(relativo, sha256(readFileSync(pieno)));
  };
  for (const f of elenco.file) if (existsSync(join(cartella, ...f.split('/'))) && statSync(join(cartella, ...f.split('/'))).isFile()) aggiungi(f);
  const cammina = (dir) => {
    for (const voce of readdirSync(dir, { withFileTypes: true })) {
      const pieno = join(dir, voce.name);
      const rel = relative(cartella, pieno).split(sep).join('/');
      if (voce.isDirectory()) { if (!elenco.fuoriCartelle.has(voce.name)) cammina(pieno); } else if (voce.isFile() && nelNucleo(rel, elenco)) aggiungi(rel);
    }
  };
  for (const c of elenco.cartelle) { const d = join(cartella, ...c.split('/')); if (existsSync(d) && statSync(d).isDirectory()) cammina(d); }
  return fuori;
}

/** Un albero di git: `ls-tree` per i nomi e gli oggetti, `cat-file --batch` per il contenuto (una volta per oggetto). */
async function improntaDiGit(deposito, rif, elenco) {
  const radici = [...new Set([...elenco.cartelle, ...elenco.file].map((p) => p.split('/')[0]))];
  const ls = spawnSync('git', ['-C', deposito, 'ls-tree', '-r', '-z', '--full-tree', rif, '--', ...radici], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (ls.status !== 0) throw Error(`git ls-tree ${rif}: ${ls.stderr.trim() || `uscita ${ls.status}`}`);
  const voci = [];
  for (const riga of ls.stdout.split('\0')) {
    const m = /^(\d+) blob ([0-9a-f]+)\t(.+)$/u.exec(riga);
    if (m && m[1] !== '120000' && nelNucleo(m[3], elenco)) voci.push({ percorso: m[3], oggetto: m[2] });
  }
  const oggetti = [...new Set(voci.map((v) => v.oggetto))];
  const impronte = await leggiOggetti(deposito, oggetti);
  return new Map(voci.map((v) => [v.percorso, impronte.get(v.oggetto)]));
}

function leggiOggetti(deposito, oggetti) {
  return new Promise((ok, no) => {
    const fuori = new Map();
    if (!oggetti.length) { ok(fuori); return; }
    const git = spawn('git', ['-C', deposito, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let resto = Buffer.alloc(0);
    let i = 0;
    let errore = '';
    git.stderr.on('data', (d) => { errore += d; });
    git.stdout.on('data', (d) => {
      resto = Buffer.concat([resto, d]);
      for (;;) {
        const a = resto.indexOf(10);
        if (a < 0) return;
        const testa = resto.subarray(0, a).toString('utf8');
        const m = /^([0-9a-f]+) blob (\d+)$/u.exec(testa);
        if (!m) { git.kill(); no(Error(`git cat-file: risposta inattesa «${testa}»`)); return; }
        const n = Number(m[2]);
        if (resto.length < a + 1 + n + 1) return;
        fuori.set(m[1], sha256(resto.subarray(a + 1, a + 1 + n)));
        resto = resto.subarray(a + 1 + n + 1);
        i += 1;
      }
    });
    git.on('error', no);
    git.on('close', (codice) => { if (i === oggetti.length) ok(fuori); else no(Error(`git cat-file: ${i}/${oggetti.length} oggetti (uscita ${codice}) ${errore.trim()}`)); });
    git.stdin.end(`${oggetti.join('\n')}\n`);
  });
}

export async function impronta(sorgente, { elenco, deposito }) {
  if (sorgente.startsWith('git:')) return improntaDiGit(deposito, sorgente.slice(4), elenco);
  const cartella = resolve(sorgente);
  if (!existsSync(cartella) || !statSync(cartella).isDirectory()) throw Error(`non è una cartella: ${cartella}`);
  return improntaDiCartella(cartella, elenco);
}

/**
 * Il confronto, puro. `copie`: `{ pc: Map, cli: Map, telefono: Map }`; `eccezioni`: `Map(prodotto → Set)`.
 * Un file è DIVERSO se le copie che lo confrontano non hanno tutte la stessa impronta; ASSENTE in un prodotto se lì manca (e altrove c'è).
 */
export function confronta(copie, eccezioni) {
  const tutti = [...new Set(PRODOTTI.flatMap((p) => [...copie[p].keys()]))].sort();
  const diversi = [];
  const assenti = [];
  let uguali = 0;
  let scusati = 0;
  for (const file of tutti) {
    const conta = PRODOTTI.filter((p) => !eccezioni.get(p)?.has(file));
    const mancano = conta.filter((p) => !copie[p].has(file));
    const valori = conta.filter((p) => copie[p].has(file)).map((p) => copie[p].get(file));
    if (mancano.length) assenti.push({ file, mancaIn: mancano, presenteIn: conta.filter((p) => copie[p].has(file)) });
    if (new Set(valori).size > 1) diversi.push({ file, impronte: Object.fromEntries(conta.map((p) => [p, copie[p].get(file) ?? null])) });
    if (!mancano.length && new Set(valori).size <= 1) { if (conta.length < PRODOTTI.length) scusati += 1; else uguali += 1; }
  }
  return { file: tutti.length, uguali, scusati, diversi, assenti, ok: diversi.length === 0 && assenti.length === 0 };
}

function argomenti(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || argv[i + 1] === undefined) return null;
    a[argv[i].slice(2)] = argv[i + 1];
  }
  return a;
}

const corta = (h) => (h === undefined ? 'eccezione   ' : h ? h.slice(0, 12) : 'assente     '); // undefined: quel prodotto non lo confronta

async function principale(argv) {
  const a = argomenti(argv);
  if (!a || !PRODOTTI.every((p) => a[p])) {
    console.error('uso: node harness-ui/scripts/cancello/impronte-nucleo.mjs --pc <git:rif|cartella> --cli <git:rif|cartella> --telefono <git:rif|cartella> [--deposito <git>] [--elenco <json>] [--eccezioni <json>] [--json <file>]');
    return 2;
  }
  const inizio = process.hrtime.bigint();
  let elenco;
  let eccezioni;
  try {
    elenco = leggiElenco(readFileSync(a.elenco ?? join(QUI, 'nucleo-condiviso.json'), 'utf8'));
    eccezioni = leggiEccezioni(readFileSync(a.eccezioni ?? join(QUI, 'nucleo-eccezioni.json'), 'utf8'));
  } catch (e) { console.error(`⛔ ${e.message}`); return 2; }
  const deposito = resolve(a.deposito ?? join(QUI, '..', '..', '..'));
  const copie = {};
  for (const p of PRODOTTI) {
    try { copie[p] = await impronta(a[p], { elenco, deposito }); } catch (e) { console.error(`⛔ copia ${p} (${a[p]}): ${e.message}`); return 2; }
    if (copie[p].size === 0) { console.error(`⛔ copia ${p} (${a[p]}): nessun file del nucleo. Rif o cartella sbagliati?`); return 2; }
  }
  const r = confronta(copie, eccezioni);
  const ms = Number((process.hrtime.bigint() - inizio) / 1_000_000n);
  const testa = `nucleo: ${r.file} file (pc ${copie.pc.size}, cli ${copie.cli.size}, telefono ${copie.telefono.size}) · ${r.uguali} uguali nei tre · ${r.scusati} uguali dove si confrontano (eccezioni) · ${r.diversi.length} diversi · ${r.assenti.length} assenti · ${ms} ms`;
  for (const d of r.diversi) console.error(`DIVERSO  ${d.file}  pc ${corta(d.impronte.pc)}  cli ${corta(d.impronte.cli)}  telefono ${corta(d.impronte.telefono)}`);
  for (const d of r.assenti) console.error(`ASSENTE  ${d.file}  manca in: ${d.mancaIn.join(', ')}  (c'è in: ${d.presenteIn.join(', ') || 'nessuno'})`);
  if (a.json) {
    const corpo = JSON.stringify({ schema: 'talos.impronte-nucleo.rapporto.v1', copie: Object.fromEntries(PRODOTTI.map((p) => [p, a[p]])), ...r, ms }, null, 2);
    writeFileSync(`${a.json}.tmp`, `${corpo}\n`);
    renameSync(`${a.json}.tmp`, a.json);
  }
  (r.ok ? console.log : console.error)(`${r.ok ? '✓' : '⛔'} ${testa}`);
  if (!r.ok) console.error('   Cosa fare: ogni file del nucleo deve avere gli stessi byte nei tre prodotti. Porta la cura dove manca, o scrivi in nucleo-eccezioni.json il motivo e la fonte (approvati) per cui quel prodotto non lo confronta.');
  return r.ok ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  principale(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(`⛔ impronte del nucleo: ${e?.message ?? e}`); process.exitCode = 2; });
}
