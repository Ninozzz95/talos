#!/usr/bin/env node
/*
 * IL CRICCHETTO DELLE TAGLIE «DALLA BASE» — la rigiocata: che cosa avrebbe fermato il cancello sulle unioni già entrate?
 *
 *   node rigiocata.mjs --repo <cartella> --candidata <revisione> --fuori <cartella> [--ultime 30]
 *                      [--ramo <nome>=<revisione>]… [--bersagli fileNuovo=800,funzione=300,…] [--typescript <dir>]
 *
 * Il campione sono le ultime N unioni sul primo genitore della candidata (ognuna contro il suo primo genitore) e i rami aperti dati
 * (ognuno contro il punto d'incontro con la candidata): lo stesso comando sceglie sempre gli stessi punti e dà lo stesso esito.
 * Per ogni punto scrive le violazioni di ognuna delle tre proposte di bersaglio — (a), (a)+(b), (a)+(b)+(c) — e, misurata A PARTE
 * dal cancello (conto degli a capo, spostamenti di git e una ricerca testuale degli import), la verità: l'unione ha davvero ingrassato un file sopra il
 * bersaglio o aggiunto un arco verso un file non contato? Così si contano i VERI positivi e i falsi rossi, non solo i rossi:
 * «zero falsi rossi» lo dà anche un cancello che non ferma niente.
 * Scrive `rigiocata.jsonl` (una riga per punto), `rigiocata.md` (la tabella) e `tempi.json` (a parte: i tempi cambiano a ogni corsa).
 *
 * Hermes, `hermes-agent-2026-11-01/scripts/code_health/replay.py:1-11`: «Replay the ratchet over recently merged PRs: what would it
 * have blocked? […] Use it before promoting a rule to blocking or changing a target».
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGOLE } from './regole.mjs';
import { cambiFra, contaRighe, èContato, gitTesto, leggiAlbero, leggiOggetti, risolvi } from './misura.mjs';
import { giudica } from './confronta.mjs';

const SEMPRE = ['1', '4', '5', 'misura'];
const IN_RIGHE = new Set(['file-cresciuto', 'file-nuovo-lungo', 'funzione-cresciuta', 'funzione-nuova', 'discesa']);
export const PROPOSTE_DA_MISURARE = Object.freeze({ a: ['a'], 'a+b': ['a', 'b'], 'a+b+c': ['a', 'b', 'c'] });

/**
 * La verità di un punto, misurata senza il cancello: i file che sulla base stavano sopra il bersaglio e sono cresciuti di righe
 * (conto degli a capo, differenza secca), e gli import con un percorso scritto che arrivano a un file non contato e sulla base non c'erano.
 */
export function verità(repo, base, testa, R) {
  const alberoB = leggiAlbero(repo, base);
  const alberoT = leggiAlbero(repo, testa);
  const cambi = [...cambiFra(alberoB, alberoT)].filter(([p]) => èContato(p, R));
  const file = (v) => v && v.modo !== '120000' && v.modo !== '160000';
  const oggetti = leggiOggetti(repo, cambi.flatMap(([, { prima, dopo }]) => [prima, dopo].filter(file).map((v) => v.sha)));
  const testo = (v) => (file(v) ? oggetti.get(v.sha).toString('utf8') : null);
  const IMPORT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"\n]+)\1/gu;
  const archi = (da, t, albero) => {
    const out = new Set();
    for (const m of t.matchAll(IMPORT)) {
      const p = posix.normalize(posix.join(posix.dirname(da), m[2])).replace(/[?#].*$/u, '');
      if (p.startsWith('..')) continue;
      const arriva = [p, `${p}.mjs`, `${p}.js`, `${p}.ts`, `${p}/index.js`, `${p}/index.mjs`, `${p}/index.ts`].find((x) => albero.has(x));
      if (arriva && !èContato(arriva, R)) out.add(arriva);
    }
    return out;
  };
  const ingrassati = [];
  const archiVeri = [];
  const nuoviLunghi = [];
  const piùPesanti = [];
  const nuoviSenzaTipi = [];
  const senzaSpazi = (t) => t.replace(/\s+/gu, '').length;
  /* il controllo dei tipi, letto dal testo: TypeScript per estensione (o `lang="ts"` in un .vue), oppure `@ts-check` nelle prime righe */
  const haITipi = (p, t) => /\.(?:[mc]?ts|tsx)$/u.test(p) || (p.endsWith('.vue') && /<script\b[^>]*\blang\s*=\s*["']?tsx?/iu.test(t)) || /^\s*\/\/\s*@ts-check\b/mu.test(t.split('\n').slice(0, 10).join('\n'));
  /* i file che git stesso chiama spostati non sono nuovi */
  const spostati = new Set(gitTesto(repo, ['diff', '--name-status', '-M', '--diff-filter=R', base, testa]).split('\n').filter(Boolean).map((r) => r.split('\t')[2]));
  for (const [p, { prima, dopo }] of cambi.sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const tb = testo(prima);
    const tt = testo(dopo);
    if (tb !== null && tt !== null) {
      const rb = contaRighe(tb);
      const rt = contaRighe(tt);
      if (rb > R.BERSAGLI.fileEsistente && rt > rb) ingrassati.push({ file: p, base: rb, testa: rt, netto: rt - rb, gigante: rb >= R.BERSAGLI.gigante });
      /* stesse righe o meno, ma più testo: il file sopra il bersaglio ingrassa lo stesso (caratteri senza gli spazi, commenti compresi) */
      else if (rb > R.BERSAGLI.fileEsistente && senzaSpazi(tt) > senzaSpazi(tb)) piùPesanti.push({ file: p, caratteri: senzaSpazi(tt) - senzaSpazi(tb) });
    }
    if (tb === null && tt !== null && !spostati.has(p) && contaRighe(tt) > R.BERSAGLI.fileNuovo) nuoviLunghi.push({ file: p, righe: contaRighe(tt) });
    if (tb === null && tt !== null && !spostati.has(p) && !haITipi(p, tt)) nuoviSenzaTipi.push({ file: p });
    if (tt !== null) {
      const noti = tb !== null ? archi(p, tb, alberoB) : new Set();
      for (const a of archi(p, tt, alberoT)) if (!noti.has(a)) archiVeri.push({ da: p, verso: a });
    }
  }
  return { ingrassati, archiVeri, nuoviLunghi, piùPesanti, nuoviSenzaTipi };
}

/** I punti della rigiocata: le ultime `ultime` unioni della candidata e i rami aperti. Sempre gli stessi per gli stessi argomenti. */
export function punti(repo, candidata, ultime, rami) {
  const cima = risolvi(repo, candidata);
  const out = [];
  const unioni = gitTesto(repo, ['log', '--first-parent', '--merges', '--format=%H %P%x09%s', `-${ultime}`, cima]).split('\n').filter(Boolean);
  for (const riga of unioni) {
    const [sha, primo] = riga.slice(0, riga.indexOf('\t')).split(' ');
    out.push({ nome: `unione ${sha.slice(0, 9)}`, tipo: 'unione', titolo: riga.slice(riga.indexOf('\t') + 1), base: primo, testa: sha });
  }
  for (const [nome, rev] of rami) {
    const testa = risolvi(repo, rev);
    out.push({ nome: `ramo ${nome}`, tipo: 'ramo', titolo: nome, base: gitTesto(repo, ['merge-base', testa, cima]).trim(), testa });
  }
  return out;
}

/** Gioca un punto: le violazioni per regola, la verità e l'esito di ogni proposta. */
export function gioca(repo, punto, R, percorsoTypescript = null) {
  const g = giudica({ repo, base: punto.base, testa: punto.testa, regole: R, percorsoTypescript, proposte: ['a', 'b', 'c'] });
  const v = verità(repo, punto.base, punto.testa, R);
  /* la verità di (a): un file sopra il bersaglio ingrassato (in righe, o in testo a righe ferme) o un arco nuovo; con (b) anche un
     file nuovo oltre il bersaglio o senza il controllo dei tipi */
  const veroDi = (accese) => v.ingrassati.length > 0 || v.piùPesanti.length > 0 || v.archiVeri.length > 0 || (accese.includes('b') && (v.nuoviLunghi.length > 0 || v.nuoviSenzaTipi.length > 0));
  const proposte = {};
  for (const [nome, accese] of Object.entries(PROPOSTE_DA_MISURARE)) {
    const viol = g.violazioni.filter((x) => SEMPRE.includes(x.regola) || accese.includes(x.regola));
    const rossa = viol.length > 0;
    const vero = veroDi(accese);
    proposte[nome] = {
      rossa, violazioni: viol.length,
      righe: viol.filter((x) => IN_RIGHE.has(x.classe)).reduce((n, x) => n + (x.oltre ?? 0), 0),
      classi: Object.fromEntries([...new Set(viol.map((x) => `${x.regola}:${x.classe}`))].sort().map((k) => [k, viol.filter((x) => `${x.regola}:${x.classe}` === k).length])),
      esito: rossa ? (vero ? 'vero positivo' : 'falso rosso') : (vero ? 'MANCATO' : 'verde'),
    };
  }
  return { punto: punto.nome, tipo: punto.tipo, titolo: punto.titolo, base: punto.base, testa: punto.testa, verità: v, proposte, violazioni: g.violazioni, discesa: g.discesa, ms: g.misure.ms };
}

function tabella(righe, R, cosa) {
  const out = [`# Rigiocata del cricchetto delle taglie dalla base — ${cosa}`, '',
    `Bersagli: ${JSON.stringify(R.BERSAGLI)}. «Vero» = l'unione ha ingrassato un file già sopra ${R.BERSAGLI.fileEsistente} righe (in righe, o in testo senza spazi a righe ferme) o ha aggiunto un import scritto verso un file non contato; con la proposta (b) accesa anche: ha aggiunto un file nuovo oltre ${R.BERSAGLI.fileNuovo} righe o senza il controllo dei tipi (misurato a parte dal cancello: conto degli a capo, ricerca testuale, spostamenti di git). Le funzioni non hanno una misura a parte: un rosso solo di funzione esce «falso rosso» e si guarda a mano, sotto.`, '',
    '| punto | verità (misurata a parte) | (a) | (a)+(b) | (a)+(b)+(c) |', '|---|---|---|---|---|'];
  const cella = (p) => (p.rossa ? `ROSSA ${p.violazioni} viol., ${p.righe} righe — ${p.esito}` : p.esito);
  for (const r of righe) {
    const v = [...r.verità.ingrassati.map((i) => `${i.file.split('/').pop()} +${i.netto}`), ...r.verità.archiVeri.map((a) => `arco → ${a.verso.split('/').slice(-2).join('/')}`), ...r.verità.nuoviLunghi.map((n) => `nuovo ${n.file.split('/').pop()} ${n.righe}`),
      ...r.verità.piùPesanti.map((n) => `${n.file.split('/').pop()} +${n.caratteri} caratteri a righe ferme`), ...(r.verità.nuoviSenzaTipi.length ? [`${r.verità.nuoviSenzaTipi.length} file nuovi senza tipi (conta per b)`] : [])].join('; ') || 'niente';
    out.push(`| ${r.punto} | ${v} | ${cella(r.proposte.a)} | ${cella(r.proposte['a+b'])} | ${cella(r.proposte['a+b+c'])} |`);
  }
  out.push('', '## Totali', '', '| proposta | campione | rosse | righe oltre il tetto | veri positivi | falsi rossi | mancati |', '|---|---|---|---|---|---|---|');
  for (const tipo of ['unione', 'ramo']) {
    const del = righe.filter((r) => r.tipo === tipo);
    for (const nome of Object.keys(PROPOSTE_DA_MISURARE)) {
      const p = del.map((r) => r.proposte[nome]);
      out.push(`| ${nome} | ${del.length} ${tipo === 'unione' ? 'unioni' : 'rami'} | ${p.filter((x) => x.rossa).length} | ${p.reduce((n, x) => n + x.righe, 0)} | ${p.filter((x) => x.esito === 'vero positivo').length} | ${p.filter((x) => x.esito === 'falso rosso').length} | ${p.filter((x) => x.esito === 'MANCATO').length} |`);
    }
  }
  out.push('', '## Che cosa avrebbe fermato, punto per punto (tutte e tre le proposte accese)', '');
  for (const r of righe) {
    out.push(`### ${r.punto} — ${r.titolo}`, `base ${r.base.slice(0, 9)}, testa ${r.testa.slice(0, 9)}; esito: (a) ${r.proposte.a.esito}, (a)+(b) ${r.proposte['a+b'].esito}, (a)+(b)+(c) ${r.proposte['a+b+c'].esito}`);
    if (!r.violazioni.length) out.push('- niente');
    for (const x of r.violazioni) out.push(`- [${x.regola}:${x.classe}] ${x.file}: ${x.testo}`);
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

function principale() {
  const argv = process.argv.slice(2);
  const valori = new Map();
  const rami = [];
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--repo', '--candidata', '--fuori', '--ultime', '--ramo', '--bersagli', '--typescript'].includes(argv[i]) || i + 1 >= argv.length) throw new Error(`argomento sconosciuto o senza valore: ${argv[i]}`);
    if (argv[i] === '--ramo') { const k = argv[i + 1].indexOf('='); if (k < 1) throw new Error('--ramo vuole <nome>=<revisione>'); rami.push([argv[i + 1].slice(0, k), argv[i + 1].slice(k + 1)]); } else valori.set(argv[i], argv[i + 1]);
  }
  for (const serve of ['--candidata', '--fuori']) if (!valori.has(serve)) throw new Error(`manca ${serve}`);
  const repo = resolve(valori.get('--repo') ?? process.cwd());
  const ultime = Number(valori.get('--ultime') ?? 30);
  if (!Number.isInteger(ultime) || ultime < 0) throw new Error('--ultime vuole un numero intero');
  const bersagli = { ...REGOLE.BERSAGLI };
  for (const pezzo of (valori.get('--bersagli') ?? '').split(',').filter(Boolean)) {
    const [k, v] = pezzo.split('=');
    if (!(k in bersagli) || !Number.isFinite(Number(v))) throw new Error(`--bersagli: «${pezzo}» non è un bersaglio (${Object.keys(bersagli).join(', ')})`);
    bersagli[k] = Number(v);
  }
  const R = { ...REGOLE, BERSAGLI: Object.freeze(bersagli) };
  const fuori = resolve(valori.get('--fuori'));
  mkdirSync(fuori, { recursive: true });
  const righe = [];
  const tempi = [];
  for (const p of punti(repo, valori.get('--candidata'), ultime, rami)) {
    const { ms, ...riga } = gioca(repo, p, R, valori.get('--typescript') ?? null);
    righe.push(riga);
    tempi.push({ punto: p.nome, ms });
    process.stderr.write(`${p.nome}: (a) ${riga.proposte.a.esito}, (a)+(b) ${riga.proposte['a+b'].esito}, (a)+(b)+(c) ${riga.proposte['a+b+c'].esito}, ${ms} ms\n`);
  }
  writeFileSync(`${fuori}/rigiocata.jsonl`, righe.map((r) => JSON.stringify(r)).join('\n') + (righe.length ? '\n' : ''));
  writeFileSync(`${fuori}/rigiocata.md`, tabella(righe, R, `candidata ${risolvi(repo, valori.get('--candidata')).slice(0, 9)}, ultime ${ultime} unioni, ${rami.length} rami`));
  writeFileSync(`${fuori}/tempi.json`, `${JSON.stringify(tempi, null, 1)}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = principale(); } catch (e) { process.stderr.write(`rigiocata: ${e?.message ?? e}\n`); process.exitCode = 2; }
}
