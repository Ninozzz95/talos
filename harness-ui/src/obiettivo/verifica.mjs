/*
 * ⭐⭐⭐ /goal, fase G3 — IL CANCELLO: le prove del contratto le esegue il SISTEMA, non il racconto del modello.
 *
 * Un criterio a `comando` si esegue nella cartella della conversazione, col suo codice d'uscita; uno a `file` si guarda sul disco;
 * uno a `giudizio` qui non si decide (lo farà il giudice, G5): resta «da giudicare», mai un sì.
 *
 * Da chi viene che cosa (letto nel codice il 14/10/2026, ledger `LEDGER-GOAL-LOOP-ENGINEERING-2026-10-12.md` §15):
 *   · Hermes `hermes_cli/goals.py` (clone 2026-10-07, `865ba906`): `:51` 300 s di tempo, `:52` 3 tentativi, `:57` coda di 3.000
 *     caratteri di stdout+stderr; `:396-414` il tempo scaduto è un rosso con la riga `[gate timed out after Ns]` IN CODA all'uscita;
 *     `:373-393` le prove girano solo nella cartella della sessione su questo host, altrimenti non girano; `:1302-1308` un rosso NON
 *     si riusa mai (l'impronta `git porcelain` è stata tolta perché non vede i contenuti): ogni volta si riesegue.
 *   · dsh-goalloop `lib/core.js` (clone 2026-10-12): `:222-225` il terzo esito `unverifiable` col motivo; `:304-316` stdout e stderr
 *     tenuti distinti, perché la causa spesso sta solo in stderr.
 *   · Codex `codex-rs/ext/goal/src/tool.rs`: non esegue prove, chiude il modello. ⇒ eseguire è il passo in più.
 * Decisioni dell'owner, 14/10/2026 sera (tutte e tre le consigliate): 3 tentativi poi pausa; un comando che non c'è è «non
 *   verificabile» (non consuma un tentativo); stdout e stderr insieme nella stessa coda ma MARCATI.
 *
 * ⛔ Misurato prima di scrivere (14/10/2026, questa macchina): `cmd /d /s /c` — la shell di `spawn(…, {shell:true})` su Windows —
 *   esce **1** per un comando che non esiste, non 9009 (lo stesso che riporta golang/go#7850); bash in WSL esce 127. Su Windows
 *   il codice d'uscita non distingue «non c'è» da «è fallito»: lo dice `programmaTrovato`, che cerca il programma come cmd
 *   (cartella corrente, poi PATH, con le estensioni di PATHEXT). 126 = c'è ma non si esegue (POSIX).
 *
 * Il modulo non tocca processi né permessi da sé: chi chiama dà `eseguiComando`, `permessoComando`, `permessoLettura` (il registro
 * li lega al kernel della sessione: stessa esecuzione dell'attrezzo shell, stesso cancello dei permessi). Il disco lo guarda qui.
 */

import { open, realpath, stat } from 'node:fs/promises';
import { delimiter, extname, isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalHash } from '../workflow/canonical-json.mjs';
import { avvisoSospetto, avvolgiDati } from '../kernel/confine-dati.mjs'; // l'uscita delle prove dentro il confine dei dati
import { pezziFuoriDalleVirgolette } from './contratto.mjs';

/** Il tempo di una prova a comando (Hermes `DEFAULT_GATE_TIMEOUT_SECONDS = 300`). */
export const TEMPO_MASSIMO_PROVA_MS = 300_000;
/** Quanto dell'uscita di una prova si tiene e si ridà al modello (Hermes `_GATE_OUTPUT_TAIL_CHARS = 3000`). */
export const CODA_USCITA = 3_000;
/** Rossi DI FILA sullo stesso criterio prima della pausa (Hermes `DEFAULT_GATE_MAX_RETRIES = 3`; owner 14/10). */
export const TENTATIVI_MASSIMI = 3;
/** Un fatto `contiene` legge il file intero fino a qui; oltre non si controlla a buon prezzo, e lo si dice. */
export const CONTENUTO_FILE_MASSIMO = 4 * 1024 * 1024;

export const ESITI_DEL_CRITERIO = Object.freeze(['verde', 'rosso', 'non-verificabile', 'da-giudicare']);
/** Perché una prova non ha potuto dire sì o no. Identificatori stabili: la frase per la persona la sceglie l'interfaccia. */
export const MOTIVI_NON_VERIFICABILE = Object.freeze([
  'workspace-missing', // la cartella della conversazione non c'è su questo computer
  'workspace-not-here', // la conversazione lavora su un telefono: le prove girano solo qui
  'plan-mode', // in Piano non si esegue niente
  'permission-denied', // l'attrezzo dei comandi è spento per questa conversazione, o la sessione è in sola lettura
  'permission-needed', // servirebbe il sì della persona (lo chiederà il ciclo, G4): qui non si chiede fuori da un giro
  'command-not-found', // il programma non c'è
  'program-unconfirmed', // su Windows non si è potuto sapere se il programma c'è (una cartella del PATH irraggiungibile)
  'could-not-run', // il comando non è partito
  'stopped', // fermato (obiettivo tolto, server che si spegne)
  'file-outside', // il percorso, sul disco, porta fuori dalla cartella (un collegamento)
  'file-unreadable',
  'not-a-file',
  'file-too-large',
  'folder-blocked', // revisione blocco 11 (A-R3): il file o il comando toccano una cartella bloccata per il dispositivo che guida
]);

const MARCA = Object.freeze({ stdout: '[stdout]', stderr: '[stderr]' });
const nonVerificabile = (tipo, extra = {}) => ({ esito: 'non-verificabile', motivo: { tipo }, ...extra });

/* Gli ultimi `n` caratteri senza lasciare in testa la seconda metà di una coppia di surrogati. */
function ultimi(testo, n) {
  if (n <= 0) return '';
  const pezzo = testo.length > n ? testo.slice(-n) : testo;
  const primo = pezzo.charCodeAt(0);
  return primo >= 0xDC00 && primo <= 0xDFFF ? pezzo.slice(1) : pezzo;
}

/**
 * La coda dell'uscita di una prova: i pezzi nell'ordine in cui arrivano, ogni cambio di flusso marcato (`[stdout]`/`[stderr]`).
 * ⛔ La memoria resta limitata (al più il doppio della coda): una prova che scrive 2 GB non li tiene in RAM.
 * ⛔ Un blocco tagliato in testa lo dice (`[stderr] …`): chi legge sa che sopra c'era altro.
 */
export function nuovaCoda(massimo = CODA_USCITA) {
  const pezzi = [];
  let totale = 0;
  let persiPrima = false;
  return {
    aggiungi({ flusso, testo } = {}) {
      /* ⛔ Il kernel chiama i flussi `fuori` ed `errori` (`talosHarness.mjs`, `eseguiSuWindows`: `avvisa('errori', testo)`): una
         coda che riconosceva solo `stderr` marcava tutto come stdout (preso dalla prova G3-REG-08 sul kernel vero). */
      const f = flusso === 'stderr' || flusso === 'errori' ? 'stderr' : 'stdout';
      const t = String(testo ?? '');
      if (t === '') return;
      const ultimo = pezzi.at(-1);
      if (ultimo && ultimo.flusso === f) ultimo.testo += t; else pezzi.push({ flusso: f, testo: t, tagliato: false });
      totale += t.length;
      // si toglie dalla TESTA quanto basta: un blocco intero solo se sta tutto nell'eccesso, altrimenti se ne taglia l'inizio
      while (totale > massimo * 2) {
        const eccesso = totale - massimo * 2;
        const primo = pezzi[0];
        if (primo.testo.length <= eccesso && pezzi.length > 1) { pezzi.shift(); totale -= primo.testo.length; persiPrima = true; continue; }
        primo.testo = primo.testo.slice(eccesso); primo.tagliato = true; totale -= eccesso;
      }
    },
    /** @param {string} [rigaFinale] una riga del sistema in fondo (il tempo scaduto), sempre dentro la coda */
    testo(rigaFinale = '') {
      const coda = rigaFinale ? `${pezzi.length ? '\n' : ''}${rigaFinale}` : '';
      let spazio = massimo - coda.length;
      const fuori = [];
      let tagliatoInTesta = false;
      for (let i = pezzi.length - 1; i >= 0; i -= 1) {
        const { flusso, testo, tagliato } = pezzi[i];
        const corpo = testo.endsWith('\n') ? testo.slice(0, -1) : testo;
        const separatore = fuori.length ? 1 : 0;
        const intero = `${MARCA[flusso]}${tagliato ? ' …' : ''}\n${corpo}`;
        if (intero.length + separatore <= spazio) {
          fuori.unshift(intero); spazio -= intero.length + separatore;
          if (i === 0 && (tagliato || persiPrima)) tagliatoInTesta = true;
          continue;
        }
        const testa = `${MARCA[flusso]} …\n`;
        const resta = spazio - separatore - testa.length;
        if (resta > 0) fuori.unshift(testa + ultimi(corpo, resta));
        tagliatoInTesta = false; // il blocco tagliato lo dice da sé
        break;
      }
      const prima = tagliatoInTesta && !fuori[0]?.includes(' …\n') ? '…\n' : '';
      return ultimi(`${prima}${fuori.join('\n')}${coda}`, massimo);
    },
  };
}

/** L'impronta di ciò che un criterio CONTROLLA (non del suo testo): lega un esito e i tentativi alla prova vera. */
export function improntaDelCriterio(criterio) {
  const v = criterio?.verifica ?? {};
  const noti = Object.fromEntries(['tipo', 'comando', 'uscita', 'percorso', 'fatto', 'testo'].filter((c) => Object.hasOwn(v, c)).map((c) => [c, v[c]]));
  return canonicalHash(noti);
}
const chiaveDelCriterio = (criterio) => `${criterio.id}#${improntaDelCriterio(criterio)}`;

/* I comandi interni di cmd: non sono file, e cmd li esegue lo stesso. */
const INTERNI_DI_CMD = new Set(['assoc', 'break', 'call', 'cd', 'chdir', 'cls', 'color', 'copy', 'date', 'del', 'dir', 'echo', 'endlocal',
  'erase', 'exit', 'for', 'ftype', 'goto', 'if', 'md', 'mkdir', 'mklink', 'move', 'path', 'pause', 'popd', 'prompt', 'pushd', 'rd',
  'rem', 'ren', 'rename', 'rmdir', 'set', 'setlocal', 'shift', 'start', 'time', 'title', 'type', 'ver', 'verify', 'vol']);

/**
 * Il programma che cmd lancerebbe per questo comando c'è? Come lo cerca cmd: la cartella corrente, poi le cartelle del PATH, il
 * nome com'è e con ogni estensione di PATHEXT. `null` = non si sa dire (una variabile `%X%`, l'operatore `&` di PowerShell):
 * chi non sa dire non dichiara «non c'è».
 * @param {string} comando
 * @param {{ cartella: string, env?: object, esiste?: (percorso:string) => Promise<boolean> }} dove
 * @returns {Promise<boolean|null>}
 */
export async function programmaTrovato(comando, { cartella, env = process.env, esiste = eUnFile } = {}) {
  let pezzi = pezziFuoriDalleVirgolette(String(comando ?? ''));
  /* ⛔ G3-REV-09 (seconda riverifica del bugfixer, 14/10): `call X` lancia X, e `@` in testa spegne solo l'eco — il programma da
     cercare è quello dopo (misurato: `call programma-che-non-c-e` esce 1 come un fallimento). `if`, `for` e una parentesi lanciano
     un comando che questo lettore non sa trovare: «non so», mai «c'è». */
  while (pezzi.length > 0 && /^@*call$/iu.test(pezzi[0])) pezzi = pezzi.slice(1);
  const nome = (pezzi[0] ?? '').replace(/^@+/u, '');
  if (nome.startsWith('(') || /^(?:if|for)$/iu.test(nome)) return null;
  if (nome === '' || nome === '&' || nome.includes('%') || nome.includes('$')) return null;
  if (INTERNI_DI_CMD.has(nome.toLowerCase())) return true;
  const chiave = (k) => Object.keys(env).find((c) => c.toUpperCase() === k);
  const pathext = String(env[chiave('PATHEXT')] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const candidati = (base) => (extname(base) ? [base, ...pathext.map((e) => base + e)] : pathext.map((e) => base + e));
  const conCartella = nome.includes('/') || nome.includes('\\') || /^[A-Za-z]:/u.test(nome);
  const cartelle = conCartella ? [''] : [cartella, ...String(env[chiave('PATH')] ?? '').split(delimiter).filter(Boolean)];
  let incerto = false;
  for (const c of cartelle) {
    const base = conCartella ? (isAbsolute(nome) ? nome : resolve(cartella, nome)) : join(c, nome);
    for (const p of candidati(base)) {
      const c2 = await esiste(p);
      if (c2 === true) return true;
      if (c2 === null) incerto = true;
    }
  }
  return incerto ? null : false;
}
/* ⛔ G3-REV-02 (revisione del bugfixer, 14/10): gli «alias di esecuzione delle app» di Windows (python.exe, winget.exe in
   `%LOCALAPPDATA%\Microsoft\WindowsApps`) sono reparse point che `stat` non legge (EACCES) e che cmd esegue: un file che c'è ma non
   si lascia leggere (EACCES, EPERM) C'È. ⛔ G3-REV-07 (riverifica): ogni altro errore — una cartella del PATH su una condivisione di
   rete spenta dà UNKNOWN — non dice né sì né no: `null`, «non so». Solo ENOENT/ENOTDIR sono un no. */
async function eUnFile(percorso) {
  try { return (await stat(percorso)).isFile(); } catch (errore) {
    if (errore?.code === 'ENOENT' || errore?.code === 'ENOTDIR') return false;
    return errore?.code === 'EACCES' || errore?.code === 'EPERM' ? true : null;
  }
}

/*
 * Il percorso VERO (collegamenti seguiti) dell'antenato esistente più vicino, più i pezzi che ancora non ci sono: un fatto su un
 * file che non esiste si giudica comunque dentro o fuori. Stessa regola del kernel (`percorsoVero`, F4-03): un collegamento dentro
 * il progetto che porta fuori non è «dentro».
 */
async function percorsoVero(percorso) {
  let corrente = resolve(percorso);
  const mancanti = [];
  for (let salti = 0; salti < 64; salti += 1) {
    try {
      const vero = await realpath(corrente);
      return mancanti.length ? join(vero, ...mancanti) : vero;
    } catch (errore) {
      if (errore?.code !== 'ENOENT' && errore?.code !== 'ENOTDIR') return null;
      const su = resolve(corrente, '..');
      if (su === corrente) return null;
      mancanti.unshift(corrente.slice(su.length).replace(/^[\\/]+/u, ''));
      corrente = su;
    }
  }
  return null;
}
async function dentroLaCartella(assoluto, cartella) {
  const [vero, radice] = await Promise.all([percorsoVero(assoluto), realpath(cartella).catch(() => null)]);
  if (vero === null || radice === null) return null;
  const rel = process.platform === 'win32' ? relative(radice.toLowerCase(), vero.toLowerCase()) : relative(radice, vero);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/* Il testo di un file per il fatto `contiene`: UTF-8 (col BOM tolto), o UTF-16 se lo dice il BOM. */
function testoDelFile(b) {
  if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return b.subarray(2).toString('utf16le');
  if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) return Buffer.from(b.subarray(2, 2 + ((b.length - 2) & ~1))).swap16().toString('utf16le');
  const testo = b.toString('utf8');
  return testo.charCodeAt(0) === 0xFEFF ? testo.slice(1) : testo;
}
async function leggiIntero(percorso, dimensione) {
  const fd = await open(percorso, 'r');
  try {
    const buffer = Buffer.alloc(dimensione);
    let letti = 0;
    while (letti < dimensione) {
      const { bytesRead } = await fd.read(buffer, letti, dimensione - letti, letti);
      if (bytesRead === 0) break;
      letti += bytesRead;
    }
    return testoDelFile(buffer.subarray(0, letti));
  } finally { await fd.close(); }
}

async function provaComando(verifica, ctx) {
  const permesso = await ctx.permessoComando(verifica.comando);
  if (permesso?.consentito !== true) return nonVerificabile(MOTIVI_NON_VERIFICABILE.includes(permesso?.motivo) ? permesso.motivo : 'permission-needed');
  const coda = nuovaCoda();
  let esito;
  try {
    esito = await ctx.eseguiComando(verifica.comando, { timeoutMs: TEMPO_MASSIMO_PROVA_MS, onPezzo: (pezzo) => coda.aggiungi(pezzo), segnaleStop: ctx.segnaleStop });
  } catch {
    return nonVerificabile('could-not-run');
  }
  if (esito?.fermatoSuRichiesta || ctx.segnaleStop?.aborted) return nonVerificabile('stopped');
  const codice = esito?.codice;
  if (!Number.isSafeInteger(codice) || codice < 0) return nonVerificabile('could-not-run', { uscita: { codice: Number.isSafeInteger(codice) ? codice : null, coda: coda.testo() } });
  if (esito.fermatoDalTempo) {
    return { esito: 'rosso', motivo: { tipo: 'timed-out' }, uscita: { codice, coda: coda.testo(`[the check timed out after ${TEMPO_MASSIMO_PROVA_MS / 1000} s]`) } };
  }
  /* ⛔ G3-REV-01 (revisione del bugfixer, 14/10): su Windows cmd esce 1 sia per «non c'è» sia per un fallimento vero, quindi
     «non c'è» si chiede PRIMA del confronto con l'atteso: un criterio che si aspetta 1 (`grep -q TODO x` = «niente TODO») era
     VERDE col programma che non c'era. In POSIX il 127 è suo: un 127 atteso resta un verde. */
  if (esito.ambiente === 'windows' && codice !== 0 && typeof ctx.programmaTrovato === 'function') {
    const trovato = await ctx.programmaTrovato(verifica.comando);
    if (trovato === false) return nonVerificabile('command-not-found', { uscita: { codice, coda: coda.testo() } });
    /* G3-REV-07: «non so» (una cartella del PATH irraggiungibile) con un atteso diverso da 0 ⇒ il codice potrebbe essere quello
       di «non c'è»: un verde non si può dire. Con atteso 0 il rosso resta un rosso: un programma che non c'è non esce mai 0. */
    if (trovato === null && verifica.uscita !== 0) return nonVerificabile('program-unconfirmed', { uscita: { codice, coda: coda.testo() } });
  }
  if (codice === verifica.uscita) return { esito: 'verde', uscita: { codice } };
  if (esito.ambiente === 'posix') {
    if (codice === 127) return nonVerificabile('command-not-found', { uscita: { codice, coda: coda.testo() } });
    if (codice === 126) return nonVerificabile('could-not-run', { uscita: { codice, coda: coda.testo() } });
  }
  return { esito: 'rosso', motivo: { tipo: 'exit-code' }, uscita: { codice, atteso: verifica.uscita, coda: coda.testo() } };
}

async function provaFile(verifica, ctx) {
  const assoluto = resolve(ctx.cartella, ...verifica.percorso.split('/'));
  const dentro = await dentroLaCartella(assoluto, ctx.cartella);
  if (dentro === false) return nonVerificabile('file-outside');
  if (dentro === null) return nonVerificabile('file-unreadable');
  let info = null;
  try { info = await stat(assoluto); } catch (errore) {
    if (errore?.code !== 'ENOENT' && errore?.code !== 'ENOTDIR') return nonVerificabile('file-unreadable');
  }
  if (verifica.fatto === 'esiste') return info ? { esito: 'verde' } : { esito: 'rosso', motivo: { tipo: 'file-missing' } };
  if (verifica.fatto === 'non-esiste') return info ? { esito: 'rosso', motivo: { tipo: 'file-present' } } : { esito: 'verde' };
  // contiene / non-contiene: il fatto presuppone il file
  if (!info) return { esito: 'rosso', motivo: { tipo: 'file-missing' } };
  if (!info.isFile()) return nonVerificabile('not-a-file');
  const permesso = await ctx.permessoLettura(verifica.percorso);
  if (permesso?.consentito !== true) return nonVerificabile(MOTIVI_NON_VERIFICABILE.includes(permesso?.motivo) ? permesso.motivo : 'permission-needed');
  if (info.size > CONTENUTO_FILE_MASSIMO) return nonVerificabile('file-too-large');
  let testo;
  try { testo = await leggiIntero(assoluto, info.size); } catch { return nonVerificabile('file-unreadable'); }
  const c = testo.includes(verifica.testo);
  if (verifica.fatto === 'contiene') return c ? { esito: 'verde' } : { esito: 'rosso', motivo: { tipo: 'text-missing' } };
  return c ? { esito: 'rosso', motivo: { tipo: 'text-present' } } : { esito: 'verde' };
}

/**
 * La prova di UN criterio. Non lancia mai: ogni guasto è un esito che dice perché.
 * @param {{ id:string, verifica:object }} criterio
 * @param {{ cartella: string|null, perche?: string, eseguiComando: Function, permessoComando: Function, permessoLettura: Function,
 *   programmaTrovato?: Function, segnaleStop?: AbortSignal, orologio?: () => number }} ctx `cartella: null` = le prove non
 *   possono girare qui, e `perche` dice il motivo (`workspace-missing`, `workspace-not-here`, `plan-mode`)
 * @returns {Promise<object>} `{ id, impronta, tipo, esito, motivo?, uscita?, durataMs }`
 */
export async function verificaCriterio(criterio, ctx) {
  const orologio = ctx.orologio ?? (() => performance.now());
  const inizio = orologio();
  const tipo = criterio.verifica?.tipo;
  const base = { id: criterio.id, impronta: improntaDelCriterio(criterio), tipo };
  const fine = (resto) => ({ ...base, ...resto, durataMs: Math.max(0, Math.round(orologio() - inizio)) });
  if (tipo === 'giudizio') return fine({ esito: 'da-giudicare' });
  if (ctx.segnaleStop?.aborted) return fine(nonVerificabile('stopped'));
  if (typeof ctx.cartella !== 'string' || ctx.cartella === '') return fine(nonVerificabile(MOTIVI_NON_VERIFICABILE.includes(ctx.perche) ? ctx.perche : 'workspace-missing'));
  try {
    return fine(tipo === 'comando' ? await provaComando(criterio.verifica, ctx) : await provaFile(criterio.verifica, ctx));
  } catch {
    return fine(nonVerificabile('could-not-run'));
  }
}

/**
 * Le prove dell'intero contratto, UNA DOPO L'ALTRA (due comandi insieme si pestano i file). Un rosso non si riusa mai: ogni volta
 * si riesegue tutto (Hermes `goals.py:1302-1308`).
 * @returns {Promise<{ contratto:string, verdetti:object[], riepilogo:object }>}
 */
export async function verificaContratto(contratto, ctx) {
  const verdetti = [];
  for (const criterio of contratto.criteri) verdetti.push(await verificaCriterio(criterio, ctx));
  return { contratto: contratto.impronta, verdetti, riepilogo: riepilogoDei(verdetti) };
}
export function riepilogoDei(verdetti) {
  const conta = (esito) => verdetti.filter((v) => v.esito === esito).length;
  return { verdi: conta('verde'), rossi: conta('rosso'), nonVerificabili: conta('non-verificabile'), daGiudicare: conta('da-giudicare') };
}

/**
 * I rossi DI FILA per criterio (chiave `id#impronta` della prova: un criterio cambiato riparte da zero, uno tolto sparisce).
 * Un rosso conta uno in più; un verde azzera; «non verificabile» e «da giudicare» lasciano il conto com'era (owner 14/10: un
 * comando che non c'è non consuma un tentativo).
 * @returns {Record<string, number>}
 */
export function tentativiDopo(prima, contratto, verdetti) {
  const vecchi = prima && typeof prima === 'object' ? prima : {};
  const dopo = {};
  for (const criterio of contratto.criteri) {
    const chiave = chiaveDelCriterio(criterio);
    const verdetto = verdetti.find((v) => v.id === criterio.id && v.impronta === improntaDelCriterio(criterio));
    const conto = Number.isSafeInteger(vecchi[chiave]) && vecchi[chiave] > 0 ? vecchi[chiave] : 0;
    const nuovo = verdetto?.esito === 'rosso' ? conto + 1 : verdetto?.esito === 'verde' ? 0 : conto;
    if (nuovo > 0) dopo[chiave] = nuovo;
  }
  return dopo;
}
/** I criteri arrivati al tetto dei tentativi: i loro `id`, nell'ordine del contratto. */
export function criteriAlTetto(contratto, tentativi) {
  return contratto.criteri.filter((criterio) => (tentativi?.[chiaveDelCriterio(criterio)] ?? 0) >= TENTATIVI_MASSIMI).map((criterio) => criterio.id);
}
/** I tentativi che restano validi sotto un contratto nuovo: solo quelli delle prove rimaste identiche. */
export function tentativiSottoIlContratto(tentativi, contratto) {
  const valide = new Set(contratto.criteri.map(chiaveDelCriterio));
  return Object.fromEntries(Object.entries(tentativi ?? {}).filter(([chiave, n]) => valide.has(chiave) && Number.isSafeInteger(n) && n > 0));
}

/** Se un valore è il resoconto di una verifica scritto da questa versione (o da una più nuova, coi campi in più). */
export function verificaValida(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return false;
  if (valore.tentativi !== undefined && (!valore.tentativi || typeof valore.tentativi !== 'object' || Array.isArray(valore.tentativi)
    || Object.values(valore.tentativi).some((n) => !Number.isSafeInteger(n) || n < 1))) return false;
  if (valore.verdetti === undefined) return true; // solo i tentativi: «sotto questo contratto non si è ancora verificato»
  if (typeof valore.contratto !== 'string' || typeof valore.alle !== 'string' || Number.isNaN(Date.parse(valore.alle))) return false;
  return Array.isArray(valore.verdetti) && valore.verdetti.every((v) => v && typeof v === 'object' && typeof v.id === 'string'
    && typeof v.esito === 'string' && /^[a-z][a-z-]{0,39}$/u.test(v.esito));
}

/**
 * Il messaggio al modello dopo una verifica con dei rossi (lo userà il ciclo, G4): obiettivo, ogni prova che non passa col
 * comando, l'uscita e il tentativo n su TENTATIVI_MASSIMI, poi la regola. Come Hermes `goals.py:96-110`, più ciò che non è
 * verificabile e perché. `null` se non c'è niente da dire (nessun rosso e nessun non verificabile).
 */
export function testoPerIlModello(obiettivo, verifica) {
  const criteri = new Map((obiettivo?.contratto?.criteri ?? []).map((c) => [c.id, c]));
  const righe = [];
  for (const v of verifica?.verdetti ?? []) {
    if (v.esito !== 'rosso' && v.esito !== 'non-verificabile') continue;
    const criterio = criteri.get(v.id);
    if (!criterio) continue;
    const prova = criterio.verifica.tipo === 'comando' ? `command \`${criterio.verifica.comando}\``
      : criterio.verifica.tipo === 'giudizio' ? 'judgement by the TALOS judge on the evidence of your last turn' // G5
        : `file \`${criterio.verifica.percorso}\` (${criterio.verifica.fatto})`;
    const tentativo = verifica.tentativi?.[chiaveDelCriterio(criterio)];
    const intestazione = v.esito === 'rosso'
      ? `- ${v.id} FAILED — ${criterio.testo}\n  check: ${prova}${v.uscita ? `, exit code ${v.uscita.codice} (expected ${criterio.verifica.uscita})` : ''}${tentativo ? `, attempt ${tentativo} of ${TENTATIVI_MASSIMI}` : ''}; reason: ${v.motivo?.tipo ?? 'unknown'}`
      : `- ${v.id} COULD NOT BE CHECKED — ${criterio.testo}\n  check: ${prova}; reason: ${v.motivo?.tipo ?? 'unknown'}`;
    righe.push(intestazione);
    /* ⛔ 14/10/2026 notte (trovato rileggendo il confine per l'interruttore dei file adottati): l'uscita di una prova è testo che
       arriva DAL PROGETTO — un test può stampare «ignore previous instructions…» — e stava in un recinto di codice, fuori dal
       confine dei dati. Ora si avvolge come l'uscita di un comando (`shell` ⇒ luogo «comando», sequenze del terminale tolte), con
       l'avviso del rilevatore davanti se sembra scritto per un'AI. Il confine chiude anche ciò che il recinto chiudeva (un'uscita
       che prova a chiuderlo da dentro viene disinnescata da `avvolgiDati`). */
    /* G5: il motivo del giudice è scritto da un modello che ha letto il lavoro — anche lui DENTRO il confine dei dati */
    if (v.giudizio?.motivo) {
      const avvolto = avvolgiDati(v.giudizio.motivo, { fonte: 'goal judge' });
      righe.push('  judge says:');
      if (avvolto.sospetti.length > 0) righe.push(avvisoSospetto(avvolto.sospetti));
      righe.push(avvolto.testo);
    }
    if (v.uscita?.coda) {
      const avvolto = avvolgiDati(v.uscita.coda, { fonte: `shell ${criterio.verifica.tipo === 'comando' ? criterio.verifica.comando : criterio.verifica.percorso}`, comandi: true });
      righe.push(`  output (last ${CODA_USCITA} characters):`);
      if (avvolto.sospetti.length > 0) righe.push(avvisoSospetto(avvolto.sospetti));
      righe.push(avvolto.testo);
    }
  }
  if (righe.length === 0) return null;
  return [`Goal: ${obiettivo.testo}`, 'TALOS ran the checks of the goal contract. These did not pass:', ...righe,
    'Do not declare the goal complete while any check fails or cannot be checked. If a check itself is wrong or cannot pass, say so clearly and stop.'].join('\n');
}
