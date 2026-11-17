/*
 * IL CRICCHETTO DELLE TAGLIE «DALLA BASE» — il verdetto: base contro testa.
 *
 * Ogni unità ha il suo tetto: un file o una funzione già sopra il bersaglio non supera il valore che ha SULLA BASE; ciò che è nuovo
 * sta sotto il bersaglio. Il codice che si sposta tiene il suo tetto: le unità della testa si abbinano a quelle della base UNA A UNA,
 * nell'ordine di Hermes (`hermes-agent-2026-11-01/scripts/code_health/compare.py:7-16`): stesso file, stesso nome e stesso corpo;
 * stesso file e stesso corpo; un altro file e stesso corpo se il nome è andato via dal suo; stesso file e stesso nome (ritoccata sul
 * posto, i nomi ripetuti accoppiati per somiglianza); un altro file, stesso nome e corpo simile. Il corpo è il testo NORMALIZZATO
 * (senza commenti né spazi): uno spazio o un commento in coda a ogni riga non fa sparire niente.
 */
import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import { REGOLE } from './regole.mjs';
import {
  alfanumerici, analizza, cambiFra, corpoDi, estensione, èContato, èDelCancello, èFuoriNonDichiarato, leggiAlbero, leggiOggetti, pesoDiCodice,
  risolvi, typescript,
} from './misura.mjs';

const INTERNI = new Set(builtinModules);
/** Il nome senza i numeri d'ordine (Hermes `compare.py:58-60`, `_base_name`): `f#2` -> `f`. */
export const nomeBase = (q) => q.replace(/#\d+(?=\.|$)/gu, '');

/* ---------------------------------------------------------------- multinsiemi di righe */

const multi = (righe) => { const m = new Map(); let n = 0; for (const r of righe) if (r) { m.set(r, (m.get(r) ?? 0) + 1); n += 1; } return { m, n }; };
const comuni = (a, b) => { let n = 0; const [p, g] = a.m.size <= b.m.size ? [a, b] : [b, a]; for (const [r, k] of p.m) { const h = g.m.get(r); if (h) n += Math.min(k, h); } return n; };
/** Le righe di `a` che `b` non ha (multinsieme). */
const meno = (a, b) => { const m = new Map(); let n = 0; for (const [r, k] of a.m) { const resto = k - (b.m.get(r) ?? 0); if (resto > 0) { m.set(r, resto); n += resto; } } return { m, n }; };
/** Somiglianza di due corpi (coefficiente di Dice sulle righe normalizzate): 1 = uguali, 0 = niente in comune. */
export function somiglianza(a, b) {
  const x = multi(a);
  const y = multi(b);
  return x.n + y.n === 0 ? 0 : (2 * comuni(x, y)) / (x.n + y.n);
}

/* ---------------------------------------------------------------- gli archi (regola 4) */

const CANDIDATI = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.mts', '.cts', '.vue', '.json', '.node'];
const INDICI = ['index.js', 'index.mjs', 'index.cjs', 'index.ts', 'index.tsx', 'index.jsx', 'index.vue', 'package.json'];
const FORME_DI_CARICO = new Set(['import', 'require', 'import()', 'Worker', 'fork', 'register']);
const cartellaDi = (rel) => rel.slice(0, Math.max(0, rel.lastIndexOf('/')));
const èCodicePerNome = (p) => /\.(?:[mc]?[jt]s|[jt]sx|vue)$/u.test(p);

/**
 * Dove arriva un percorso relativo scritto in `da`, nell'ordine di Node (nodejs.org/docs/latest-v24.x/api/modules.html,
 * «LOAD_AS_FILE»: il file esatto, poi le estensioni, poi la cartella). `null` se esce dal repo; se niente esiste, il percorso scritto.
 */
function arrivo(da, scritto, albero) {
  return arrivoDa(posix.join(cartellaDi(da), scritto.replace(/[?#].*$/u, '')), albero);
}
function arrivoDa(percorso, albero) {
  const p = posix.normalize(percorso).replace(/\/$/u, '');
  if (p === '..' || p.startsWith('../')) return null;
  if (albero.has(p)) return { verso: p, esiste: true };
  for (const e of CANDIDATI) if (albero.has(p + e)) return { verso: p + e, esiste: true };
  for (const i of INDICI) if (albero.has(`${p}/${i}`)) return { verso: `${p}/${i}`, esiste: true };
  /* TypeScript scrive `./x.js` per dire `./x.ts` */
  const m = /^(.*)\.([mc]?)js$/u.exec(p);
  if (m) for (const e of [`.${m[2]}ts`, '.tsx']) if (albero.has(m[1] + e)) return { verso: m[1] + e, esiste: true };
  return { verso: p, esiste: false };
}

/** Il `package.json` più vicino sopra un file, letto dall'albero dato: { radice, nome, dipendenze }. */
function pacchettoDi(da, albero, leggi, cache) {
  for (let d = cartellaDi(da); ; d = cartellaDi(d)) {
    const p = d ? `${d}/package.json` : 'package.json';
    if (albero.has(p)) {
      if (!cache.has(p)) {
        let j = {};
        try { j = JSON.parse(leggi(albero.get(p).sha)); } catch { /* un package.json rotto non dichiara niente */ }
        const dip = new Set();
        for (const k of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) for (const n of Object.keys(j?.[k] ?? {})) dip.add(n);
        cache.set(p, { radice: d, nome: typeof j?.name === 'string' ? j.name : '', dipendenze: dip });
      }
      return cache.get(p);
    }
    if (!d) return { radice: '', nome: '', dipendenze: new Set() };
  }
}

/**
 * Gli archi di un file contato verso ciò che il conto non vede. Tre classi:
 * - `arco`: una forma di carico (`import`, `require`, `createRequire(…)(…)`, `import()`, `new Worker`, `fork`, `module.register`)
 *   con un percorso scritto che arriva a un file non contato, anche se ancora non esiste; un percorso assoluto, un `#…` della mappa
 *   del pacchetto;
 * - `pacchetto`: un pacchetto che la base non dichiara nel `package.json` più vicino;
 * - `percorso`: una qualunque altra stringa che è il percorso di un file tracciato non contato (`new URL('./x', import.meta.url)`,
 *   `spawn(process.execPath, ['scripts/x.mjs'])`): solo se il file esiste.
 * Limite detto: un percorso costruito a pezzi mentre il programma gira non si vede qui (lo copre solo il conto della regola 5).
 */
export function archiDi(da, letterali, albero, R, pacchetto) {
  const out = new Map(); // chiave -> { classe, verso, forma }
  const metti = (classe, verso, forma) => { const k = `${classe}\0${verso}`; if (!out.has(k)) out.set(k, { classe, verso, forma }); };
  for (const { testo, forma } of letterali) {
    if (!testo || testo.length > 300 || /[\r\n*<>|"]/u.test(testo)) continue;
    const diCarico = FORME_DI_CARICO.has(forma.replace(/-dentro$/u, ''));
    const relativo = /^\.{1,2}(?:\/|$)/u.test(testo);
    if (relativo) {
      const a = arrivo(da, testo, albero);
      if (!a) { if (diCarico) metti('arco', `fuori-dal-repo:${testo}`, forma); continue; }
      if (èContato(a.verso, R)) continue;
      if (diCarico) metti('arco', a.verso, forma);
      else if (a.esiste && testo.length > 2) metti('percorso', a.verso, forma);
      continue;
    }
    if (forma === 'import' || forma === 'require' || forma === 'import()') {
      /* un alias del pacchetto (`@/x` nel telefono) è un percorso dentro il repo */
      const alias = R.ALIAS.find((x) => da.startsWith(x.dentro) && testo.startsWith(x.prefisso));
      if (alias) {
        const a = arrivoDa(alias.verso + testo.slice(alias.prefisso.length), albero);
        if (a && !èContato(a.verso, R)) metti('arco', a.verso, forma);
        continue;
      }
      if (/^(?:\/|file:|[A-Za-z]:[\\/])/u.test(testo)) { metti('arco', `assoluto:${testo}`, forma); continue; }
      if (testo.startsWith('#')) { metti('arco', `mappa:${testo}`, forma); continue; }
      if (testo.startsWith('node:') || INTERNI.has(testo) || /^(?:data|https?|blob):/u.test(testo)) continue;
      const nome = testo.startsWith('@') ? testo.split('/').slice(0, 2).join('/') : testo.split('/')[0];
      if (pacchetto.nome && nome === pacchetto.nome) {
        /* il pacchetto che importa se stesso per nome: è un percorso dentro la sua radice */
        const a = arrivo(`${pacchetto.radice}/x`, `./${testo.slice(nome.length + 1)}`, albero);
        if (a && !èContato(a.verso, R)) metti('arco', a.verso, forma);
        continue;
      }
      if (!pacchetto.dipendenze.has(nome)) metti('pacchetto', nome, forma);
      continue;
    }
    /* una stringa qualunque: è il percorso di un file tracciato non contato? dalla cartella del file in su, solo se esiste */
    if (!testo.includes('/') && !èCodicePerNome(testo)) continue;
    if (/^(?:[a-z]+:|\/\/|#)/iu.test(testo) || /\s/u.test(testo)) continue;
    const pulito = testo.replace(/^\/+/u, '');
    for (let d = cartellaDi(da); ; d = cartellaDi(d)) {
      const p = posix.normalize(d ? `${d}/${pulito}` : pulito);
      if (!p.startsWith('..') && albero.has(p)) { if (!èContato(p, R)) metti(diCarico ? 'arco' : 'percorso', p, forma); break; }
      if (!d) break;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- l'abbinamento */

/**
 * Abbina i FILE: un file della base va a UN solo file della testa. Vince lo stesso percorso, salvo che un file aggiunto porti
 * almeno SIMILE delle righe della base e più dello stesso percorso (il file spostato intero che lascia un rimando): allora il
 * tetto segue il corpo e il rimando resta un file esistente senza tetto suo.
 * @returns {Map<string, { percorso: string | null, righe: number, caratteri: number, tipi: boolean, stessoPosto: boolean } | null>}
 */
export function abbinaFile(base, testa, R) {
  const origine = new Map();
  const aggiunti = [...testa.keys()].filter((p) => !base.has(p));
  const mB = new Map();
  const mT = new Map();
  const multiB = (p) => { if (!mB.has(p)) mB.set(p, multi(base.get(p).righeN)); return mB.get(p); };
  const multiT = (p) => { if (!mT.has(p)) mT.set(p, multi(testa.get(p).righeN)); return mT.get(p); };
  const coppie = [];
  if (aggiunti.length) {
    for (const [bp, bm] of base) {
      /* solo i file della base che hanno perso righe possono cedere il tetto */
      const stesso = testa.get(bp);
      if (stesso && stesso.righe >= bm.righe) continue;
      const b = multiB(bp);
      if (!b.n || alfanumerici([...b.m.keys()].join('')) < R.SOGLIA_ALTRO_FILE) continue;
      const qui = stesso ? comuni(b, multiT(bp)) / b.n : 0;
      for (const hp of aggiunti) {
        const s = comuni(b, multiT(hp)) / b.n;
        if (s >= R.SIMILE && s > qui) coppie.push({ s, bp, hp, righe: bm.righe });
      }
    }
  }
  coppie.sort((x, y) => y.s - x.s || y.righe - x.righe || (x.bp < y.bp ? -1 : x.bp > y.bp ? 1 : 0) || (x.hp < y.hp ? -1 : 1));
  const ceduti = new Set();
  for (const { bp, hp } of coppie) {
    if (ceduti.has(bp) || origine.has(hp)) continue;
    ceduti.add(bp);
    const b = base.get(bp);
    origine.set(hp, { percorso: bp, righe: b.righe, caratteri: b.caratteri, tipi: b.tipi, stessoPosto: false });
  }
  for (const [hp] of testa) {
    if (origine.has(hp)) continue;
    const b = base.get(hp);
    if (!b) origine.set(hp, null);
    else if (ceduti.has(hp)) origine.set(hp, { percorso: hp, righe: 0, caratteri: 0, tipi: false, stessoPosto: true });
    else origine.set(hp, { percorso: hp, righe: b.righe, caratteri: b.caratteri, tipi: b.tipi, stessoPosto: true });
  }
  return origine;
}

/**
 * Abbina le FUNZIONI della testa a quelle della base, una a una, nell'ordine di Hermes. `daAbbinare` dice quali funzioni della
 * testa hanno bisogno di un tetto (quelle oltre il bersaglio): i passi sul corpo uguale girano su tutte, perché una funzione
 * non cambiata prenota la sua prima che una copia gliela porti via (`compare.py:8`).
 * @returns {Map<object, { percorso: string, f: object }>} funzione della testa -> la sua origine sulla base
 */
export function abbinaFunzioni(base, testa, origineFile, R, daAbbinare) {
  const prese = new Set();
  const abbinate = new Map();
  const perImpronta = new Map();
  const perNome = new Map(); // percorso della base -> nome -> [f]
  for (const [bp, bm] of [...base].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const nomi = new Map();
    for (const f of bm.funzioni) {
      if (!perImpronta.has(f.impronta)) perImpronta.set(f.impronta, []);
      perImpronta.get(f.impronta).push({ percorso: bp, f });
      const n = nomeBase(f.q);
      if (!nomi.has(n)) nomi.set(n, []);
      nomi.get(n).push(f);
    }
    perNome.set(bp, nomi);
  }
  /* dove è finito un file della base: lo stesso percorso, o il file che ne ha preso il corpo */
  const testaDi = new Map();
  for (const [hp, o] of origineFile) if (o && !o.stessoPosto) testaDi.set(o.percorso, hp);
  for (const [hp, o] of origineFile) if (o?.stessoPosto && !testaDi.has(hp)) testaDi.set(hp, hp);
  const nomiTesta = new Map();
  const nomeAndato = (bp, q) => {
    if (q.includes('<anonima>')) return true;
    const hp = testaDi.get(bp) ?? bp;
    const tm = testa.get(hp);
    if (!tm) return true;
    if (!nomiTesta.has(hp)) nomiTesta.set(hp, new Set(tm.funzioni.map((f) => f.q)));
    return !nomiTesta.get(hp).has(q);
  };
  const prendi = (hf, o) => { abbinate.set(hf, o); prese.add(o.f); };
  const baseDi = (hp) => origineFile.get(hp)?.percorso ?? null;
  let attesa = [];
  for (const [hp, tm] of [...testa].sort((a, b) => (a[0] < b[0] ? -1 : 1))) for (const f of tm.funzioni) attesa.push({ hp, f });
  /* 1. stesso file, stesso nome, stesso corpo */
  const perQ = new Map();
  const funzioneDi = (bp, q) => {
    if (!perQ.has(bp)) perQ.set(bp, new Map((base.get(bp)?.funzioni ?? []).map((f) => [f.q, f])));
    return perQ.get(bp).get(q);
  };
  attesa = attesa.filter(({ hp, f }) => {
    const bp = baseDi(hp);
    const b = bp && funzioneDi(bp, f.q);
    if (!b || b.impronta !== f.impronta || prese.has(b)) return true;
    prendi(f, { percorso: bp, f: b });
    return false;
  });
  /* 2. stesso file, stesso corpo (una rinomina, un'anonima il cui numero d'ordine è scivolato) */
  attesa = attesa.filter(({ hp, f }) => {
    if (f.alfanumerici < R.SOGLIA_STESSO_FILE) return true;
    const bp = baseDi(hp);
    const o = (perImpronta.get(f.impronta) ?? []).find((x) => x.percorso === bp && !prese.has(x.f));
    if (!o) return true;
    prendi(f, o);
    return false;
  });
  /* 3. un altro file, stesso corpo, se il nome è andato via dal suo file (uno spostamento vero; una copia non è uno spostamento) */
  attesa = attesa.filter(({ f }) => {
    if (f.alfanumerici < R.SOGLIA_ALTRO_FILE) return true;
    const o = (perImpronta.get(f.impronta) ?? []).find((x) => !prese.has(x.f) && nomeAndato(x.percorso, x.f.q));
    if (!o) return true;
    prendi(f, o);
    return false;
  });
  attesa = attesa.filter(({ f }) => daAbbinare(f));
  /* 4. stesso file, stesso nome (ritoccata sul posto); i nomi ripetuti si accoppiano per somiglianza, mai per numero d'ordine */
  const gruppi = new Map();
  for (const v of attesa) { const k = `${v.hp}\0${nomeBase(v.f.q)}`; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(v); }
  for (const [k, teste] of [...gruppi].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const hp = teste[0].hp;
    const bp = baseDi(hp);
    if (!bp) continue;
    let vecchie = (perNome.get(bp)?.get(k.slice(k.indexOf('\0') + 1)) ?? []).filter((f) => !prese.has(f));
    let nuove = teste.map((v) => v.f);
    if (nuove.length > 1 || vecchie.length > 1) {
      const tm = testa.get(hp);
      const bm = base.get(bp);
      const cN = nuove.map((f) => corpoDi(tm, f));
      const cV = vecchie.map((f) => corpoDi(bm, f));
      const voti = [];
      for (let i = 0; i < nuove.length; i += 1) for (let j = 0; j < vecchie.length; j += 1) { const s = somiglianza(cN[i], cV[j]); if (s >= R.SIMILE) voti.push({ s, i, j }); }
      voti.sort((x, y) => y.s - x.s || x.i - y.i || x.j - y.j);
      const fattiN = new Set();
      const fattiV = new Set();
      for (const { i, j } of voti) if (!fattiN.has(i) && !fattiV.has(j)) { fattiN.add(i); fattiV.add(j); prendi(nuove[i], { percorso: bp, f: vecchie[j] }); }
      nuove = nuove.filter((_, i) => !fattiN.has(i));
      vecchie = vecchie.filter((_, j) => !fattiV.has(j));
    }
    /* l'unica rimasta con quel nome è la funzione di quel nome, ritoccata */
    if (nuove.length === 1 && vecchie.length === 1) prendi(nuove[0], { percorso: bp, f: vecchie[0] });
  }
  /* 5. un altro file, stesso nome, corpo simile (spostata E ritoccata): solo se una sola è partita con quel nome */
  for (const { hp, f } of attesa) {
    if (abbinate.has(f) || f.alfanumerici < R.SOGLIA_ALTRO_FILE) continue;
    const n = nomeBase(f.q).split('.').pop();
    const corpo = corpoDi(testa.get(hp), f);
    const candidate = [];
    for (const [bp, nomi] of perNome) {
      if (bp === baseDi(hp)) continue;
      for (const [nomeV, lista] of nomi) {
        if (nomeV.split('.').pop() !== n) continue;
        for (const b of lista) if (!prese.has(b) && nomeAndato(bp, b.q) && somiglianza(corpo, corpoDi(base.get(bp), b)) >= R.SIMILE) candidate.push({ percorso: bp, f: b });
      }
    }
    if (candidate.length === 1) prendi(f, candidate[0]);
  }
  return abbinate;
}

/* ---------------------------------------------------------------- il verdetto */

const migliaia = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/gu, '.');

/**
 * Il giudizio di una testa contro una base. Non ferma niente e non legge l'interruttore: dà le violazioni, ognuna con la sua regola
 * (`1` il cancello toccato, `4` gli archi, `5` le forme di carico, `a` `b` `c` le proposte di bersaglio coi loro tetti in righe e in
 * caratteri di codice, `misura` il file che non si analizza).
 * @param {{ repo: string, base: string, testa: string, regole?: typeof REGOLE, percorsoTypescript?: string | null, proposte?: readonly string[] }} cosa
 */
export function giudica({ repo, base, testa, regole = REGOLE, percorsoTypescript = null, proposte = regole.PROPOSTE }) {
  const t0 = Date.now();
  const R = regole;
  const T = R.BERSAGLI;
  const ts = typescript(percorsoTypescript, repo);
  const shaBase = risolvi(repo, base);
  const shaTesta = risolvi(repo, testa);
  const alberoB = leggiAlbero(repo, shaBase);
  const alberoT = leggiAlbero(repo, shaTesta);
  const cambi = cambiFra(alberoB, alberoT);
  /** @type {{ regola: string, classe: string, file: string, testo: string, oltre?: number }[]} */
  const violazioni = [];
  const viola = (regola, classe, file, testo, oltre) => violazioni.push(oltre === undefined ? { regola, classe, file, testo } : { regola, classe, file, testo, oltre });
  const èFile = (v) => v && v.modo !== '120000' && v.modo !== '160000';

  /* ---- regola 1: il ramo tocca il cancello */
  const delCancello = [...cambi.keys()].filter((p) => èDelCancello(p, R)).sort();
  if (delCancello.length) viola('1', 'cancello', delCancello[0], `il ramo tocca ${delCancello.length} file del cancello (${delCancello.slice(0, 4).join(', ')}${delCancello.length > 4 ? ', …' : ''}): il giudizio resta quello della base, il cambio vale dalle unioni dopo e passa solo con un'eccezione scritta nell'INDICE`);

  /* ---- che cosa serve leggere */
  const daLeggere = new Set();
  const contatiCambiati = [];
  for (const [p, { prima, dopo }] of cambi) {
    if (dopo && !prima && /(^|\/)node_modules\//u.test(p)) viola('4', 'node-modules', p, 'file tracciato dentro un node_modules: Node risolve lì gli import nudi, è codice che il conto non vede');
    if (dopo?.modo === '160000' && prima?.sha !== dopo.sha) viola('4', 'legame', p, 'sottomodulo aggiunto o spostato: codice che il conto non vede');
    if (dopo && !prima && èFile(dopo) && èFuoriNonDichiarato(p, R)) viola('4', 'fuori-non-dichiarato', p, 'file di codice nuovo in una cartella che il censimento non conta e nessuno ha dichiarato fuori');
    if (!èContato(p, R)) continue;
    if (dopo?.modo === '120000') {
      viola('4', 'legame', p, 'legame simbolico tracciato nel censimento: il codice sta altrove e il conto non lo vede');
      continue;
    }
    contatiCambiati.push(p);
    if (èFile(prima)) daLeggere.add(prima.sha);
    if (èFile(dopo)) daLeggere.add(dopo.sha);
  }
  const oggetti = leggiOggetti(repo, [...daLeggere]);
  const testi = new Map();
  const leggi = (sha) => {
    if (!testi.has(sha)) {
      if (!oggetti.has(sha)) for (const [k, v] of leggiOggetti(repo, [sha])) oggetti.set(k, v);
      testi.set(sha, oggetti.get(sha).toString('utf8'));
    }
    return testi.get(sha);
  };
  /** @type {Map<string, ReturnType<typeof analizza>>} */
  const mBase = new Map();
  /** @type {Map<string, ReturnType<typeof analizza>>} */
  const mTesta = new Map();
  for (const p of contatiCambiati.sort()) {
    const { prima, dopo } = cambi.get(p);
    if (èFile(prima)) mBase.set(p, analizza(ts, leggi(prima.sha), p, R));
    if (èFile(dopo)) {
      const m = analizza(ts, leggi(dopo.sha), p, R);
      mTesta.set(p, m);
      if (m.errore) viola('misura', 'non-si-analizza', p, `${m.errore}: un file che non si misura non si giudica`);
    }
  }
  const tAnalisi = Date.now();

  /* ---- i file: tetti in righe e in caratteri di codice (a per gli esistenti, b per i nuovi) */
  const origine = abbinaFile(mBase, mTesta, R);
  const cpr = T.caratteriPerRiga;
  const nuoviTipati = [];
  for (const [p, m] of mTesta) {
    const o = origine.get(p);
    if (!o) {
      if (m.righe > T.fileNuovo) viola('b', 'file-nuovo-lungo', p, `file nuovo di ${migliaia(m.righe)} righe, bersaglio ${migliaia(T.fileNuovo)}`, m.righe - T.fileNuovo);
      if (m.caratteri > T.fileNuovo * cpr) viola('b', 'file-nuovo-caratteri', p, `file nuovo di ${migliaia(m.caratteri)} caratteri, tetto ${migliaia(T.fileNuovo * cpr)}`, m.caratteri - T.fileNuovo * cpr);
      if (!m.tipi) viola('b', 'file-nuovo-senza-tipi', p, 'file nuovo senza il controllo dei tipi (`// @ts-check` in testa, o TypeScript)');
      else nuoviTipati.push(p);
      continue;
    }
    const da = o.stessoPosto ? '' : ` (il corpo viene da ${o.percorso})`;
    const tetto = Math.max(T.fileEsistente, o.righe);
    if (m.righe > tetto) viola('a', 'file-cresciuto', p, `${migliaia(m.righe)} righe, tetto ${migliaia(tetto)}${o.righe > T.fileEsistente ? ' (la sua misura sulla base)' : ''}${da}`, m.righe - tetto);
    /* chi è già sopra il bersaglio in righe non cresce nemmeno in caratteri (una riga lunghissima non è una riga) */
    const sopra = o.righe > T.fileEsistente || o.caratteri > T.fileEsistente * cpr;
    const tettoC = sopra ? o.caratteri : T.fileEsistente * cpr;
    if (m.caratteri > tettoC) viola('a', 'file-caratteri', p, `${migliaia(m.caratteri)} caratteri, tetto ${migliaia(tettoC)}${sopra ? ' (la sua misura sulla base)' : ''}${da}`, m.caratteri - tettoC);
    if (o.tipi && !m.tipi) viola('b', 'tipi-spenti', p, 'il controllo dei tipi era acceso sulla base e il ramo lo spegne');
  }

  /* ---- le funzioni: tetti in righe proprie e in caratteri di codice (b) */
  const oltreBersaglio = (f) => f.righe > T.funzione || f.caratteri > T.funzione * cpr;
  const abbinate = abbinaFunzioni(mBase, mTesta, origine, R, oltreBersaglio);
  for (const [p, m] of mTesta) {
    for (const f of m.funzioni) {
      if (!oltreBersaglio(f)) continue;
      const o = abbinate.get(f);
      const da = o && o.percorso !== p ? ` (viene da ${o.percorso})` : '';
      const tetto = Math.max(T.funzione, o?.f.righe ?? 0);
      if (f.righe > tetto) viola('b', o ? 'funzione-cresciuta' : 'funzione-nuova', p, `${f.q} (riga ${f.riga}): ${migliaia(f.righe)} righe proprie, tetto ${migliaia(tetto)}${o && o.f.righe > T.funzione ? ' (la sua misura sulla base)' : ''}${da}`, f.righe - tetto);
      /* lo stesso corpo a parte il proprio nome (rinominata): i caratteri in più sono solo quelli del nome, non codice */
      if (o && o.f.impronta === f.impronta) continue;
      const sopra = o && (o.f.righe > T.funzione || o.f.caratteri > T.funzione * cpr);
      const tettoC = sopra ? o.f.caratteri : T.funzione * cpr;
      if (f.caratteri > tettoC) viola('b', 'funzione-caratteri', p, `${f.q} (riga ${f.riga}): ${migliaia(f.caratteri)} caratteri propri, tetto ${migliaia(tettoC)}${da}`, f.caratteri - tettoC);
    }
  }

  /* ---- il conto di discesa dei giganti (c): ogni riga nuova in un gigante esce in un modulo nuovo e tipato */
  const discesa = [];
  if (proposte.includes('c')) {
    let fuori = null; // le righe dei moduli nuovi tipati, ancora da spendere
    for (const [p, m] of mTesta) {
      const o = origine.get(p);
      if (!o || o.righe < T.gigante) continue;
      const b = multi(mBase.get(o.percorso).righeN);
      const h = multi(m.righeN);
      const aggiunte = meno(h, b);
      if (!aggiunte.n) continue;
      const tolte = meno(b, h);
      if (!fuori) { fuori = new Map(); for (const np of nuoviTipati) for (const [r, k] of multi(mTesta.get(np).righeN).m) fuori.set(r, (fuori.get(r) ?? 0) + k); }
      let uscite = 0;
      for (const [r, k] of tolte.m) { const c = Math.min(k, fuori.get(r) ?? 0); if (c) { uscite += c; fuori.set(r, fuori.get(r) - c); } }
      discesa.push({ file: p, aggiunte: aggiunte.n, uscite });
      if (aggiunte.n > uscite) viola('c', 'discesa', p, `gigante (${migliaia(o.righe)} righe sulla base): ${migliaia(aggiunte.n)} righe nuove, ${migliaia(uscite)} portate fuori in moduli nuovi e tipati`, aggiunte.n - uscite);
    }
  }

  /* ---- gli archi (4) e le forme di carico (5) dei file contati cambiati */
  const pacchetti = new Map();
  const archiNuovi = [];
  const versoTesta = new Map(); // file non contato -> chi lo raggiunge (per il peso dei raggiunti)
  const improntaBase = new Map();
  for (const m of mBase.values()) for (const c of m.carichi) improntaBase.set(c.impronta, (improntaBase.get(c.impronta) ?? 0) + 1);
  for (const [p, m] of mTesta) {
    const o = origine.get(p);
    const bp = mBase.has(p) ? p : o?.percorso ?? null;
    const noti = bp ? archiDi(bp, mBase.get(bp).letterali, alberoB, R, pacchettoDi(bp, alberoB, leggi, pacchetti)) : new Map();
    /* il pacchetto si legge dalla BASE: una dipendenza che il ramo aggiunge non è ancora dichiarata */
    const pk = pacchettoDi(p, alberoB, leggi, pacchetti);
    for (const [k, a] of archiDi(p, m.letterali, alberoT, R, pk)) {
      if (a.classe !== 'pacchetto') { if (!versoTesta.has(a.verso)) versoTesta.set(a.verso, p); }
      if (noti.has(k) || [...noti.values()].some((n) => n.verso === a.verso)) continue;
      archiNuovi.push({ da: p, ...a });
      const testo = a.classe === 'pacchetto' ? `pacchetto «${a.verso}» importato e non dichiarato nel package.json della base`
        : a.classe === 'arco' ? `arco nuovo (${a.forma}) verso un file non contato: ${a.verso}`
          : `percorso nuovo scritto verso un file non contato: ${a.verso}`;
      viola('4', a.classe, p, testo);
    }
    for (const c of m.carichi) {
      const resto = improntaBase.get(c.impronta) ?? 0;
      if (resto > 0) { improntaBase.set(c.impronta, resto - 1); continue; }
      viola('5', 'carico', p, `forma che carica codice in più (${c.tipo}${c.riga ? `, riga ${c.riga}` : ''}): ${c.impronta.slice(c.tipo.length + 1, 120)}`);
    }
  }

  /* ---- i file non contati cambiati o aggiunti: chi li raggiunge dal censimento? (dirottamenti e bersagli che ingrassano) */
  const nonContati = [...cambi].filter(([p, { dopo }]) => èFile(dopo) && !èContato(p, R) && !/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|bin|exe|dll|node|mp[34]|wav|lock)$/iu.test(p));
  let scanditi = 0;
  if (nonContati.length) {
    /* l'ultimo pezzo di un percorso scritto, senza estensione: il nome del file, o della cartella se arriva a un indice */
    const nomi = new Set();
    const senzaEst = (n) => n.replace(/\.[^.]+$/u, '');
    for (const [p] of nonContati) {
      const pezzi = p.split('/');
      const n = senzaEst(pezzi[pezzi.length - 1]);
      nomi.add(n);
      if ((n === 'index' || n === 'package') && pezzi.length > 1) nomi.add(senzaEst(pezzi[pezzi.length - 2]));
    }
    const bersagli = new Set(nonContati.map(([p]) => p));
    const fermi = [...alberoT].filter(([p, v]) => èFile(v) && èContato(p, R) && !mTesta.has(p));
    const blob = leggiOggetti(repo, fermi.map(([, v]) => v.sha));
    const STRINGA = /(['"`])([^'"`\r\n\\]{1,300})\1/gu;
    for (const [p, v] of fermi) {
      const testo = blob.get(v.sha).toString('utf8');
      scanditi += 1;
      const porta = (scritto) => { const taglio = scritto.replace(/[?#].*$/u, '').replace(/\/+$/u, ''); return nomi.has(senzaEst(taglio.slice(taglio.lastIndexOf('/') + 1))); };
      /* la ricerca testuale è solo un setaccio veloce: vede anche i commenti. Chi passa si analizza davvero, e contano le sole
         stringhe del codice (rigiocata del 12/11: tre falsi rossi per un percorso citato fra accenti gravi in un commento) */
      let passa = false;
      for (const m of testo.matchAll(STRINGA)) if (porta(m[2])) { passa = true; break; }
      if (!passa) continue;
      const letterali = analizza(ts, testo, p, R).letterali.filter((l) => porta(l.testo)).map((l) => ({ testo: l.testo, forma: 'altro' }));
      if (!letterali.length) continue;
      for (const a of archiDi(p, letterali, alberoT, R, { radice: '', nome: '', dipendenze: new Set() }).values()) {
        if (a.classe === 'pacchetto' || !bersagli.has(a.verso)) continue;
        if (!versoTesta.has(a.verso)) versoTesta.set(a.verso, p);
        if (!alberoB.has(a.verso)) viola('4', 'percorso', p, `un file non contato NUOVO (${a.verso}) è raggiunto da un percorso scritto in questo file, che il ramo non ha toccato`);
      }
    }
    for (const [p, { prima, dopo }] of nonContati) {
      /* solo ciò che Node esegue per estensione: un file di dati raggiunto (json, md, ps1) può crescere, il codice no */
      if (!versoTesta.has(p) || !èFile(prima) || prima.sha === dopo.sha || !èCodicePerNome(p)) continue;
      const pb = pesoDiCodice(ts, leggi(prima.sha), p);
      const pt = pesoDiCodice(ts, leggi(dopo.sha), p);
      if (pt.come === pb.come && pt.peso > pb.peso) viola('4', 'raggiunto', p, `file non contato raggiunto da ${versoTesta.get(p)}: il suo peso di codice cresce da ${migliaia(pb.peso)} a ${migliaia(pt.peso)} ${pt.come}`, pt.peso - pb.peso);
      else if (pt.come !== pb.come) viola('4', 'raggiunto', p, `file non contato raggiunto da ${versoTesta.get(p)}: sulla base si misurava in ${pb.come}, ora in ${pt.come}`);
    }
  }

  const accese = violazioni.filter((v) => !['a', 'b', 'c'].includes(v.regola) || proposte.includes(v.regola));
  accese.sort((x, y) => (x.regola < y.regola ? -1 : x.regola > y.regola ? 1 : 0) || (x.file < y.file ? -1 : x.file > y.file ? 1 : 0) || (x.testo < y.testo ? -1 : x.testo > y.testo ? 1 : 0));
  return {
    base: shaBase, testa: shaTesta, proposte: [...proposte], violazioni: accese, discesa, archiNuovi,
    misure: { cambiati: cambi.size, contatiCambiati: contatiCambiati.length, fermiScanditi: scanditi, msAnalisi: tAnalisi - t0, ms: Date.now() - t0 },
  };
}

/** Il censimento di una revisione, intero (lento: analizza ogni file contato): unità e archi, anche per lente (CLI, Mobile). */
export function censimento({ repo, rev, regole = REGOLE, percorsoTypescript = null }) {
  const R = regole;
  const ts = typescript(percorsoTypescript, repo);
  const sha = risolvi(repo, rev);
  const albero = leggiAlbero(repo, sha);
  const contati = [...albero].filter(([p, v]) => v.modo !== '120000' && v.modo !== '160000' && èContato(p, R)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const blob = leggiOggetti(repo, contati.map(([, v]) => v.sha));
  const testi = new Map();
  const leggi = (s) => { if (!testi.has(s)) { if (!blob.has(s)) for (const [k, v] of leggiOggetti(repo, [s])) blob.set(k, v); testi.set(s, blob.get(s).toString('utf8')); } return testi.get(s); };
  const pacchetti = new Map();
  const T = R.BERSAGLI;
  const lenteDi = (p) => Object.entries(R.LENTI).find(([, prefissi]) => prefissi.some((x) => p.startsWith(x)))?.[0] ?? 'pc';
  const vuota = () => ({ file: 0, righe: 0, caratteri: 0, funzioni: 0, fileSopra: 0, funzioniSopra: 0, senzaTipi: 0, nonAnalizzati: 0, archi: 0, percorsi: 0, pacchetti: 0, carichi: 0 });
  const perLente = { pc: vuota(), cli: vuota(), mobile: vuota() };
  const archi = [];
  const giganti = [];
  const carichi = {};
  for (const [p, v] of contati) {
    const m = analizza(ts, leggi(v.sha), p, R);
    const l = perLente[lenteDi(p)];
    l.file += 1; l.righe += m.righe; l.caratteri += m.caratteri; l.funzioni += m.funzioni.length;
    if (m.errore) l.nonAnalizzati += 1;
    if (!m.tipi) l.senzaTipi += 1;
    if (m.righe > T.fileEsistente) l.fileSopra += 1;
    if (m.righe >= T.gigante) giganti.push({ file: p, righe: m.righe, caratteri: m.caratteri });
    l.funzioniSopra += m.funzioni.filter((f) => f.righe > T.funzione).length;
    l.carichi += m.carichi.length;
    for (const c of m.carichi) carichi[c.tipo] = (carichi[c.tipo] ?? 0) + 1;
    for (const a of archiDi(p, m.letterali, albero, R, pacchettoDi(p, albero, leggi, pacchetti)).values()) {
      archi.push({ da: p, ...a });
      if (a.classe === 'arco') l.archi += 1; else if (a.classe === 'percorso') l.percorsi += 1; else l.pacchetti += 1;
    }
  }
  return { rev: sha, perLente, giganti: giganti.sort((a, b) => b.righe - a.righe), archi, carichi };
}

export { estensione };
