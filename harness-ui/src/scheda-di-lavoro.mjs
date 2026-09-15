/**
 * scheda-di-lavoro.mjs — BLOCCO 2 del preambolo: dove sei, con che permesso, con che modello, e
 * con quali comandi si verifica il lavoro. Dieci-quindici righe, mai un file nominato.
 *
 * ── DA CHI LO PRENDIAMO, e perché ────────────────────────────────────────────────────────────
 *
 * È il «workspace snapshot» di Hermes v0.21 (`agent/coding_context.py:836-932`), che fra i quattro
 * concorrenti letti nel codice l'11/09/2026 è il più ricco al costo più basso (~100-130 token), più
 * il blocco `Environment` di Claude Code 2.1.268 (otto righe, zero file) e il suo `gitStatus`
 * tagliato a 2.000 caratteri. La cosa da rubare per intero è il commento di Hermes sui
 * «project facts», verbatim:
 *
 *   *«Hands the model its verify loop up front — which manifest, which package manager, and the
 *   exact test/lint/build commands — instead of making it rediscover them every session. Built once
 *   at prompt-build time; the string output must stay byte-stable to preserve the prompt cache.»*
 *
 * ⛔ E il vincolo di cache, dichiarato da loro e valido per noi (`coding_context.py:31-38`):
 *   *«The workspace snapshot is built once at prompt-build time and baked into the stable
 *   system-prompt tier — never re-probed per turn (that would shatter the prompt cache). Branch and
 *   dirty state drift mid-session, so the brief tells the model to re-check with git before acting
 *   on the snapshot.»*
 * ⇒ Qui si fa lo stesso: si costruisce UNA VOLTA e si DICHIARA che invecchia. Chi chiama non deve
 *   rifarlo a ogni giro — `contesto-del-progetto.mjs` tiene la cache che lo garantisce.
 *
 * ⛔⛔ IL RITRATTO DELLA CARTELLA CE L'AVEVAMO GIÀ, E NON LO MANDAVAMO AL MODELLO.
 *    `workspace-info.mjs` calcola da mesi ramo, file non salvati, repo annidati (`:105-113`) e
 *    quali `CLAUDE.md`/`AGENTS.md`/`TALOS.md`/`.talos` esistono (`:132-140`). Tutto questo finiva
 *    **nella modale «Nuova sessione»**, cioè davanti alla persona, e mai dentro il prompt. È la
 *    lezione [[chi-guarda-da-fuori-inventa-quello-che-dentro-aveva-gia]], di nuovo: prima di
 *    scrivere codice nuovo si cerca nel PROPRIO codebase. Questo modulo RIUSA quelle funzioni, non
 *    ne scrive di nuove.
 *
 * RICERCA WEB, letta l'11/09/2026 PRIMA di scrivere:
 *  · Anthropic, «Effective context engineering for AI agents», 29/09/2025 — il principio guida è
 *    *«find the smallest set of high-signal tokens that maximize the likelihood of your desired
 *    outcome»*. Il comando di verifica è il token a segnale più alto che esista in un progetto di
 *    codice: risponde in una riga alla domanda che l'agente si pone a ogni giro («ho finito?»).
 *  · Claude Platform Docs, «Prompt caching» (letto 11/09/2026) — *«Cache hits require 100%
 *    identical prompt segments»*. ⇒ In questa scheda NON entra niente che cambi da una chiamata
 *    all'altra senza una ragione: nessun orario, nessuna durata, nessun percorso assoluto.
 *    ⛔ L'unica cosa volatile che resta di proposito è lo stato di git (file non salvati), perché
 *    vale più di quanto costa — ed è dietro l'argomento `statoVolatile`, così l'A/B può misurare
 *    la differenza invece di discuterne.
 */
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { numeroItaliano, statoGit, istruzioniPresenti } from './workspace-info.mjs';

/** Hermes `_MAX_VERIFY_COMMANDS = 8`: oltre, la scheda smette di essere una scheda. */
export const MASSIMO_COMANDI_VERIFICA = 8;

/**
 * I manifesti che si riconoscono, e il gestore di pacchetti che si deduce dal lockfile.
 * ⛔ È una lista, e una lista invecchia: quando non riconosce niente la scheda TACE su questa
 *    riga invece di indovinare. Un «Progetto: sconosciuto» costerebbe token per non dire niente.
 */
export const MANIFESTI = Object.freeze([
  'package.json', 'deno.json', 'deno.jsonc', 'pyproject.toml', 'requirements.txt', 'setup.py',
  'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json',
  'Gemfile', 'CMakeLists.txt', 'Makefile', 'pubspec.yaml', 'Package.swift', 'mix.exs',
]);

const LOCKFILE = Object.freeze([
  ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lockb', 'bun'], ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'], ['poetry.lock', 'poetry'], ['uv.lock', 'uv'],
  ['Cargo.lock', 'cargo'], ['Gemfile.lock', 'bundler'],
]);

/** Gli script che valgono come «verifica», nell'ordine in cui servono. */
const SCRIPT_DI_VERIFICA = Object.freeze(['test', 'typecheck', 'lint', 'build', 'check', 'verify']);

/**
 * Quali manifesti ci sono, quale gestore di pacchetti, e i comandi con cui si verifica.
 * Non lancia mai: una cartella illeggibile produce una scheda più povera, non un errore.
 */
export async function fattiDelProgetto(cartella, { fs } = {}) {
  const disco = { readFile, stat, ...(fs ?? {}) };
  const manifesti = [];
  for (const nome of MANIFESTI) {
    try { await disco.stat(join(cartella, nome)); manifesti.push(nome); } catch { /* non c'è */ }
  }
  let gestore = null;
  for (const [lock, quale] of LOCKFILE) {
    try { await disco.stat(join(cartella, lock)); gestore = quale; break; } catch { /* non c'è */ }
  }

  const comandi = [];
  if (manifesti.includes('package.json')) {
    try {
      const pacchetto = JSON.parse(await disco.readFile(join(cartella, 'package.json'), 'utf8'));
      const script = pacchetto?.scripts && typeof pacchetto.scripts === 'object' ? pacchetto.scripts : {};
      const eseguibile = gestore === 'yarn' || gestore === 'bun' || gestore === 'pnpm' ? gestore : 'npm';
      const prefisso = eseguibile === 'npm' ? 'npm run' : `${eseguibile} run`;
      /*
       * ⛔⛔ SI GUARDA ANCHE IL PREFISSO, non solo il nome esatto — trovato GUARDANDO IL TESTO
       *   VERO l'11/09, non da un test: su `harness-ui/` la riga «Verifica» NON USCIVA, perché
       *   gli script di questo repo si chiamano `verify:all`, `verify:ui`, `test:kernel`, e
       *   nessuno di quei nomi è `test` o `verify` esatti. Era il difetto peggiore possibile in
       *   questo blocco: la riga a segnale più alto della scheda — quella che risponde da sola a
       *   «ho finito?», e che Hermes cita come la ragione d'essere dei suoi «project facts» —
       *   spariva in silenzio proprio sul progetto su cui stavo misurando la cura.
       * ⭐ L'ordine è deterministico due volte: prima la priorità della parola (`test` prima di
       *   `build`), poi il nome per unità di codice. La chiave della cache è il TESTO, e un ordine
       *   che dipende da come è scritto il `package.json` lo farebbe cambiare senza motivo.
       */
      const nomiScript = Object.keys(script).filter((k) => typeof script[k] === 'string');
      const candidati = [];
      for (const parola of SCRIPT_DI_VERIFICA) {
        const uguale = nomiScript.filter((k) => k === parola);
        const conPrefisso = nomiScript.filter((k) => k.startsWith(`${parola}:`)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        candidati.push(...uguale, ...conPrefisso);
      }
      for (const nome of candidati) {
        comandi.push(nome === 'test' && eseguibile === 'npm' ? 'npm test' : `${prefisso} ${nome}`);
        if (comandi.length >= MASSIMO_COMANDI_VERIFICA) break;
      }
    } catch { /* package.json rotto o illeggibile: nessun comando inventato */ }
  }
  if (comandi.length === 0 && manifesti.includes('Cargo.toml')) comandi.push('cargo test');
  if (comandi.length === 0 && manifesti.includes('go.mod')) comandi.push('go test ./...');
  if (comandi.length === 0 && manifesti.includes('Makefile')) comandi.push('make test');

  return { manifesti, gestore, comandi };
}

/**
 * Il testo del blocco 2.
 *
 * @param {object} input
 * @param {string} input.cartella — usata SOLO per ricavarne il NOME (vedi sotto)
 * @param {string} [input.nomeProgetto] — il nome della radice del progetto, se diversa dal cwd
 * @param {object|null} [input.git] — l'esito di `statoGit`
 * @param {string[]} [input.commit] — le righe «hash oggetto» degli ultimi commit
 * @param {object} [input.fatti] — l'esito di `fattiDelProgetto`
 * @param {string[]} [input.istruzioni] — i nomi dei file di istruzioni trovati
 * @param {string|null} [input.permesso] — l'etichetta del permesso del giro
 * @param {string|null} [input.modello]
 * @param {string|null} [input.piattaforma]
 */
export function testoSchedaDiLavoro({
  cartella, nomeProgetto = null, git = null, commit = [], fatti = null,
  istruzioni = [], permesso = null, modello = null, piattaforma = null,
} = {}) {
  /* ⛔ Il NOME della cartella, mai il percorso: contiene il nome della persona e questo testo esce
     dalla macchina dentro un prompt — [[cancello-4-non-guardava-tutto-mobile]]. Ed è anche ciò che
     rende il prefisso identico fra due macchine diverse sullo stesso progetto. */
  const nome = basename(String(cartella ?? '').replace(/[\\/]+$/, '')) || 'la cartella di lavoro';
  const righe = [];
  righe.push('Scheda di lavoro — fotografia scattata all\'inizio della sessione. Lo stato di git INVECCHIA mentre lavori: prima di fidartene, ricontrollalo.');
  righe.push(nomeProgetto && nomeProgetto !== nome
    ? `Cartella di lavoro: «${nome}», dentro il progetto «${nomeProgetto}».`
    : `Cartella di lavoro: «${nome}».`);

  if (git) {
    const pezzi = [];
    if (git.ramo) pezzi.push(`ramo ${git.ramo}`);
    if (Number.isFinite(git.nonSalvate)) pezzi.push(git.nonSalvate === 0 ? 'niente da salvare' : `${numeroItaliano(git.nonSalvate)} file non salvati`);
    if (git.repoAnnidati?.length) pezzi.push(`${git.repoAnnidati.length} repo annidati`);
    if (pezzi.length) righe.push(`Git: ${pezzi.join(' · ')}.`);
  } else {
    /* ⛔ «Non è un repo git» è un FATTO, e cambia cosa ha senso fare: niente `git diff`, niente
       «guarda l'ultimo commit». Tacere lo farebbe scoprire con un giro sprecato. */
    righe.push('Git: questa cartella non è un repository.');
  }
  if (Array.isArray(commit) && commit.length > 0) {
    righe.push(`Ultimi commit: ${commit.slice(0, 3).join(' | ')}`);
  }

  if (fatti?.manifesti?.length) {
    righe.push(`Progetto: ${fatti.manifesti.slice(0, 6).join(', ')}${fatti.gestore ? ` (gestore: ${fatti.gestore})` : ''}.`);
  }
  if (fatti?.comandi?.length) {
    /* La riga a segnale più alto della scheda: risponde a «ho finito?» senza un giro di scoperta. */
    righe.push(`Verifica: ${fatti.comandi.join(' ; ')}`);
  }

  if (permesso) righe.push(`Permesso di questo giro: ${permesso}.`);
  if (modello) righe.push(`Modello che stai usando: ${modello}.`);
  if (piattaforma) righe.push(`Piattaforma: ${piattaforma}.`);
  /*
   * ⛔ TOLTA l'11/09 la riga «Istruzioni di progetto presenti: …». Guardava SOLO il cwd, mentre il
   *   blocco 3 raccoglie la catena dalla RADICE DEL PROGETTO in giù: su `harness-ui/` la scheda
   *   avrebbe detto «nessuna» mentre due righe sotto c'era l'`AGENTS.md` della radice, per intero.
   *   Due verità diverse sulla stessa cosa nello stesso testo sono peggio di una sola incompleta.
   *   Chi ha bisogno del dato lo trova in `istruzioni`, che `schedaDiLavoro()` restituisce lo stesso.
   */
  return righe.join('\n');
}

/**
 * Costruisce la scheda leggendo davvero il disco. Non lancia mai.
 * ⛔ Le tre sonde girano IN PARALLELO: sono tre `spawn` di git più una manciata di `stat`, e in
 *    serie sarebbero la parte lenta di un preambolo che deve costare niente. Misurato su questo
 *    repo: 60-90 ms in parallelo.
 */
export async function schedaDiLavoro({
  cartella, permesso = null, modello = null, piattaforma = null, nomeProgetto = null,
  statoVolatile = true, fs, eseguiGit,
} = {}) {
  if (typeof cartella !== 'string' || cartella.trim() === '') return null;
  const opzioniGit = eseguiGit ? { eseguiGit } : {};

  const [git, commit, fatti, istruzioni] = await Promise.all([
    /* ⛔ `statoVolatile:false` toglie la riga che cambia più spesso (i file non salvati), per l'A/B
       sulla cache fra sessioni consecutive: è l'unica cosa in tutto il preambolo che si muove senza
       che nessuno abbia cambiato cartella, permesso o modello. Si misura, non si discute. */
    statoVolatile ? statoGit(cartella, opzioniGit).catch(() => null) : Promise.resolve(null),
    statoVolatile ? ultimiCommit(cartella, opzioniGit).catch(() => []) : Promise.resolve([]),
    fattiDelProgetto(cartella, { fs }).catch(() => null),
    istruzioniPresenti(cartella).catch(() => []),
  ]);

  return {
    testo: testoSchedaDiLavoro({ cartella, nomeProgetto, git, commit, fatti, istruzioni, permesso, modello, piattaforma }),
    git, commit, fatti, istruzioni,
  };
}

/**
 * Gli ultimi tre commit, in una riga ciascuno. Stessa forma di Hermes
 * (`coding_context.py:354`: `_git(root, "log", "-3", "--pretty=%h %s")`).
 * ⛔ Il soggetto si taglia a 72 caratteri: i nostri messaggi di commit sono lunghi apposta, e tre
 *    righe da 200 caratteri sono un terzo della scheda.
 */
export async function ultimiCommit(cartella, { eseguiGit } = {}) {
  if (typeof eseguiGit !== 'function') {
    /* Nessun esecutore iniettato: si usa quello di `workspace-info.mjs` passando da `statoGit`?
       No — quello non espone `git log`. Si fa qui, con lo stesso stile: spawn, timeout, mai throw. */
    const { spawn } = await import('node:child_process');
    return await new Promise((risolvi) => {
      let uscita = '';
      let processo;
      try { processo = spawn('git', ['log', '-3', '--pretty=%h %s'], { cwd: cartella, windowsHide: true }); }
      catch { risolvi([]); return; }
      const timer = setTimeout(() => { try { processo.kill(); } catch { /* già morto */ } risolvi([]); }, 4000);
      processo.stdout?.on('data', (pezzo) => { uscita += String(pezzo); });
      processo.on('error', () => { clearTimeout(timer); risolvi([]); });
      processo.on('close', (codice) => { clearTimeout(timer); risolvi(codice === 0 ? tagliaCommit(uscita) : []); });
    });
  }
  const uscita = await eseguiGit(['log', '-3', '--pretty=%h %s'], cartella);
  return uscita ? tagliaCommit(uscita) : [];
}

function tagliaCommit(uscita) {
  return String(uscita).split('\n').map((r) => r.trim()).filter(Boolean)
    .map((r) => (r.length > 72 ? `${r.slice(0, 71)}…` : r))
    .slice(0, 3);
}
