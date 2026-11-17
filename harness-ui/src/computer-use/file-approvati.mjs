/*
 * ⛔ Decisione 374 dell'owner (07/11/2026, via giudice): IL CUSTODE DEI DUE FILE DEL COMPUTER USE.
 *
 * `.computer-use-impostazione.json` (acceso o spento) e `.computer-use-luoghi.json` («Consenti sempre») decidono cosa può fare il computer
 * use. Il cancello 373 (session-registry.mjs, `comandoNominaFileDelComputerUse`) chiede una carta ai comandi che li NOMINANO; un comando
 * che li cambia senza nominarli (un glob, un nome composto, uno script) lo prende questo custode, senza nessuna carta in più:
 * - la VERSIONE APPROVATA (il testo, o «assente», e la sua impronta sha256) vive in memoria, una per server, comune a tutte le sessioni;
 * - cambia solo quando TALOS scrive il file da una porta approvata (`scrivi`: Impostazioni, `app_settings` con la sua carta,
 *   «Consenti sempre», togli/svuota), o con `adotta` dopo un comando con la carta 373 accettata o in Accesso completo (giro 3: in
 *   ENTRAMBI i casi solo i file che il comando nomina), uno `scrivi`/`file_edit` approvato (lo decide il registro delle sessioni);
 * - i lettori (impostazione.mjs, luoghi-ricordati.mjs) prendono il testo da `testo()`, MAI dal file: un processo lasciato in sottofondo che
 *   scrive DOPO il controllo non decide niente (nota a);
 * - `controlla()`, prima e dopo ogni comando: un file diverso dalla versione approvata si mette DA PARTE (rinominato in
 *   `<file>.changed-<ora>-<pid>-<n>`, mai cancellato: può essere la persona che lo cambia a mano, nota b) e si riscrive la versione
 *   approvata. Lo stesso contenuto già messo da parte (e la cui copia esiste ancora) non fa una seconda copia (nota e).
 * - un errore di lettura o di ripristino è CHIUSO: si dice, il file resta dov'è, e il computer use usa comunque la versione approvata.
 * Una coda sola per controlli e scritture: mai un ripristino intrecciato con un salvataggio.
 *
 * ⛔⛔ Giro 2 (revisore A, A1): l'IMPRONTA APPROVATA vive FUORI dai due file, nel portachiavi che TALOS usa già per le chiavi
 *   (`providerKeyring`, con il suo suffisso di scope): servizio `talos-computer-use-files`, account = impronta dei due percorsi, valore
 *   `v1:<sha256|assente>,<…>` nell'ordine dei percorsi. La aggiorna solo il custode, dopo una porta approvata e all'avvio.
 * ⛔⛔ Giro 3 (decisione 387 dell'owner, revisione 374 giro 2: B2, A3, A5, A6, X5). All'avvio:
 *   - uguale ⇒ approvato; diverso ⇒ il file va da parte e l'approvato è «assente» (spento, nessun luogo), detto all'avviso;
 *   - NESSUNA VOCE (prima installazione, aggiornamento dal giro 1, voce tolta) ⇒ l'approvato è «assente» per tutti e due: un file
 *     presente va DA PARTE, spento, una riga all'avviso. Mai più un'adozione all'avvio. Costo misurato nelle prove: chi aggiorna con il
 *     computer use acceso lo riaccende UNA volta dalle Impostazioni (e i luoghi «Consenti sempre» si ridanno), poi resta acceso;
 *   - la voce si SALVA alla fine della costruzione (non al primo controllo): due riavvii senza comandi non adottano niente;
 *   - il primo salvataggio che fallisce ⇒ CHIUSO (A5): i file sono «incerti», spento, una riga;
 *   - un portachiavi che LANCIA all'avvio (guasto passeggero, A6) ⇒ il confronto si rimanda e si riprova a ogni operazione della coda;
 *     nel frattempo chiuso, ma nessuna riga e mai «assente» scritto sopra un'impronta che non si è letta; se la seconda lettura fallisce
 *     ancora, la riga si dice una volta;
 *   - portachiavi assente o voce storta ⇒ CHIUSO: un file presente è «incerto» (spento, nessun luogo, non si tocca) con una riga; senza
 *     file nessuna riga (X5). Senza portachiavi acceso dalle Impostazioni vale fino al riavvio: dopo è di nuovo spento, con la riga.
 *   - `avvia()` (server.mjs, all'avvio): il primo controllo subito, e il suo esito resta per il primo controllo di una sessione.
 *   ⚠ Limite che resta: un programma dello stesso utente che SCRIVE apposta una voce valida nel portachiavi ottiene un'adozione, come
 *   scrive Hermes del suo portachiavi (`agent/vault_keychain.py:8-9`). Toglierla, invece, ora mette da parte i file.
 * ⛔ Giro 3 (B1 ALTO, A7): le copie hanno un tetto, le ultime 10 per file e 4 MiB per file, potato dopo OGNI rinomina (controllo, avvio,
 *   «assente» ripetuto, `scrivi` su un file incerto); la copia appena fatta non si toglie mai, anche con copie datate nel futuro, e da
 *   sola può stare sopra i 4 MiB (limite dichiarato). Come Hermes, che pota subito dopo ogni copia nuova e tiene la più recente
 *   (`hermes_cli/backup.py:679-681`, `_prune_oldest` a :1143).
 * ⛔ Giro 3 (A2): un file con un errore al controllo di prima non si adotta dopo: il controllo dopo lo mette da parte.
 * ⛔ Giro 3 (A8): i percorsi si confrontano senza maiuscole su Windows e macOS (come `accountDelleImpronte`).
 * ⛔ Giro 2, A6: `scrivi` che non riesce a mettere da parte un cambio estraneo RIFIUTA (`COMPUTER_USE_FILE_NOT_SET_ASIDE`), mai sovrascrive.
 *
 * Concorrenti, letti alla fonte il 08/11/2026: Hermes protegge `~/.hermes/config.yaml` solo cercando il nome nel testo del comando
 * (`tools/approval_detection.py:24-27`) e tiene i segreti nel portachiavi del sistema dichiarando che non separa dal codice dello stesso
 * utente (`agent/vault_keychain.py:1-10`); Codex confronta l'impronta approvata di un hook con quella attuale e un hook cambiato non
 * è più fidato (`codex-rs/hooks/src/engine/discovery.rs:1000-1016`) e tiene `.codex` in sola lettura con la sandbox
 * (`codex-rs/protocol/src/permissions.rs:2387-2393`); Claude Code protegge i suoi file di impostazione nella sandbox (`CHANGELOG.md:3885`,
 * `:4340`). Qui l'impronta è fuori dal file come in Codex, perché TALOS sul PC non ha una sandbox che impedisca la scrittura.
 */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync } from 'node:fs';
import { readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { scriviAtomico } from '../research-store.mjs';

export const EVENTO_FILE_COMPUTER_USE_RIPRISTINATI = 'talos.file-computer-use-ripristinati';
/** Il servizio del portachiavi che tiene le impronte approvate (il suffisso dello scope lo aggiunge `avvolgiAdattatoreKeyring`). */
export const SERVIZIO_IMPRONTE_COMPUTER_USE = 'talos-computer-use-files';
export const COPIE_PER_FILE = 10;
export const BYTE_DELLE_COPIE_PER_FILE = 4 * 1024 * 1024;

const impronta = (testo) => (testo === null ? 'assente' : createHash('sha256').update(testo, 'utf8').digest('hex'));
const leggiOAssente = async (file, leggiFn) => {
  try { return await leggiFn(file, 'utf8'); } catch (e) { if (e?.code === 'ENOENT') return null; throw e; }
};
const codiceDi = (e) => e?.code ?? String(e?.message ?? e);
const ordinePercorsi = (a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
/** Giro 3, A8: Windows e macOS non distinguono le maiuscole nei nomi dei file; Linux sì. */
const SENZA_MAIUSCOLE = process.platform === 'win32' || process.platform === 'darwin';
const chiaveDi = (p) => (SENZA_MAIUSCOLE ? resolve(p).toLowerCase() : resolve(p));
/** L'account della voce: l'impronta dei percorsi (minuscoli, Windows non distingue), uno per installazione e scope. */
export function accountDelleImpronte(file) {
  return createHash('sha256').update([...file].map((f) => resolve(f).toLowerCase()).sort().join('\n'), 'utf8').digest('hex').slice(0, 32);
}
const VALORE = /^v1:((?:[0-9a-f]{64}|assente)(?:,(?:[0-9a-f]{64}|assente))*)$/u;
const COPIA = /^(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z)-(\d+)-(\d+)$/u;
const IGNOTA = Symbol('impronta non letta');

/**
 * @param {{ file: string[], portachiavi: { get: Function, set: Function } | null, adesso?: () => number,
 *   deps?: { readFile?: Function, readFileSync?: Function, rename?: Function, renameSync?: Function, scrivi?: Function, readdir?: Function, stat?: Function, unlink?: Function } }} o
 */
export function creaCustodeFileComputerUse({ file, portachiavi, adesso = Date.now, deps = {} } = {}) {
  if (!Array.isArray(file) || file.length === 0 || file.some((f) => typeof f !== 'string' || !f)) throw new TypeError('The computer use files to keep are required.');
  if (portachiavi === undefined) throw new TypeError('The keychain that keeps the approved fingerprints is required (null means none: computer use stays closed).');
  const leggiFn = deps.readFile ?? readFile;
  const leggiSincronoFn = deps.readFileSync ?? readFileSync;
  const rinominaFn = deps.rename ?? rename;
  const rinominaSincronoFn = deps.renameSync ?? renameSync;
  const scriviFn = deps.scrivi ?? scriviAtomico;
  const elencaFn = deps.readdir ?? readdir;
  const statFn = deps.stat ?? stat;
  const togliFn = deps.unlink ?? unlink;
  const visti = new Set();
  const assoluti = file.map((p) => resolve(p)).filter((p) => { const k = chiaveDi(p); if (visti.has(k)) return false; visti.add(k); return true; });
  const ordinati = [...assoluti].sort(ordinePercorsi);
  const account = accountDelleImpronte(assoluti);
  let progressivo = 0;
  const nomeCopia = (f) => `${f}.changed-${new Date(adesso()).toISOString().replace(/[:.]/g, '-')}-${process.pid}-${(progressivo += 1)}`;
  /** I ripristini fatti fuori dal controllo (l'avvio, `scrivi`): li riferisce il controllo dopo. */
  let daRiferire = { ripristinati: [], errori: [] };
  /** chiave ⇒ { percorso, testo, impronta, incerto, salvata: l'impronta del portachiavi tenuta per un file incerto (IGNOTA = non letta),
      daParte: impronta ⇒ copia, attesa: confronto dell'avvio rimandato (A6), erroreAlControllo: A2 } */
  const stato = new Map();
  let daSalvare = false;
  const daPotare = new Map(); // file messi da parte all'avvio ⇒ la loro voce in `daRiferire`, per potare tenendo la copia nuova
  /** Giro 3, A4: le copie fatte da questo processo che esistono ancora (l'avviso nomina solo queste). */
  const vive = new Set();
  const nuovaCopia = (c) => { vive.add(chiaveDi(c)); return c; };

  /* ——— l'avvio: il confronto con l'impronta del portachiavi ——— */
  /** La voce del portachiavi: { salvate: Map | null (nessuna voce) } oppure { codice } (storta), o lancia (guasto). */
  function leggiVoce() {
    const v = portachiavi.get(SERVIZIO_IMPRONTE_COMPUTER_USE, account);
    if (v === null || v === undefined) return { salvate: null };
    const m = typeof v === 'string' ? VALORE.exec(v) : null;
    const parti = m ? m[1].split(',') : null;
    if (!parti || parti.length !== ordinati.length) return { codice: 'MALFORMED' };
    return { salvate: new Map(ordinati.map((f, i) => [chiaveDi(f), parti[i]])) };
  }
  const leggiSincronoOAssente = (f) => { try { return { testo: leggiSincronoFn(f, 'utf8') }; } catch (e) { return e?.code === 'ENOENT' ? { testo: null } : { errore: e }; } };

  /** Il confronto di un file con l'impronta salvata (`salvate` null = nessuna voce: l'approvato è «assente»). */
  function confrontaAllAvvio(s, salvate) {
    const f = s.percorso;
    const atteso = salvate === null ? 'assente' : salvate.get(chiaveDi(f));
    s.attesa = false;
    const letto = leggiSincronoOAssente(f);
    if (letto.errore) {
      /* un file che all'avvio non si legge non diventa la versione approvata: i lettori lo vedono assente (computer use spento, nessun
         luogo ricordato) e il controllo non lo tocca finché TALOS non lo scrive da una porta approvata */
      s.incerto = true; s.testo = null; s.impronta = null;
      s.salvata = atteso;
      if (salvate === null) daSalvare = true;
      return;
    }
    const { testo } = letto;
    const suo = impronta(testo);
    s.incerto = false; s.salvata = null;
    if (suo === atteso) { s.testo = testo; s.impronta = suo; if (salvate === null) daSalvare = true; return; }
    s.testo = null;
    if (testo === null) { s.impronta = 'assente'; daSalvare = true; return; }
    const copia = nomeCopia(f);
    try { rinominaSincronoFn(f, copia); } catch (e) {
      s.incerto = true; s.impronta = null;
      s.salvata = atteso;
      if (salvate === null) daSalvare = true;
      daRiferire.errori.push({ file: f, fase: 'da-parte', codice: codiceDi(e), allAvvio: true });
      console.warn(`[computer-use-files] ${f} did not match the approved version when TALOS started and could not be moved aside (${codiceDi(e)}): computer use treats it as absent`);
      return;
    }
    nuovaCopia(copia);
    s.impronta = 'assente';
    s.daParte.set(suo, copia);
    daSalvare = true;
    const voce = { file: f, copia, allAvvio: true };
    daRiferire.ripristinati.push(voce);
    daPotare.set(chiaveDi(f), voce);
    console.warn(`[computer-use-files] ${f} did not match the approved version when TALOS started${salvate === null ? ' (no approved version was saved yet)' : ''}: moved aside to ${copia}; computer use treats it as absent`);
  }

  /** Chiuso (portachiavi assente, voce storta, guasto che resta, salvataggio fallito): un file presente è incerto con una riga; un file
      assente è «assente» approvato, nessuna riga (X5). */
  function chiudi(s, codice, salvata) {
    const letto = leggiSincronoOAssente(s.percorso);
    s.attesa = false;
    if (!letto.errore && letto.testo === null) { s.incerto = false; s.testo = null; s.impronta = 'assente'; s.salvata = null; return; }
    s.incerto = true; s.testo = null; s.impronta = null; s.salvata = salvata;
    daRiferire.errori.push({ file: s.percorso, fase: 'impronta', codice, allAvvio: true });
  }

  let chiusoCodice = null;
  let rimandato = null; // A6: il codice del guasto all'avvio, finché la seconda lettura non decide
  let salvateAllAvvio = null;
  if (portachiavi === null) chiusoCodice = 'NO_KEYCHAIN';
  else {
    try {
      const letta = leggiVoce();
      if (letta.codice) chiusoCodice = letta.codice; else salvateAllAvvio = letta.salvate;
    } catch (e) { rimandato = codiceDi(e) || 'KEYCHAIN_ERROR'; }
  }
  for (const f of assoluti) stato.set(chiaveDi(f), { percorso: f, testo: null, impronta: null, incerto: false, salvata: null, daParte: new Map(), attesa: false, erroreAlControllo: false });
  if (chiusoCodice) {
    for (const s of stato.values()) chiudi(s, chiusoCodice, IGNOTA);
    if (daRiferire.errori.length > 0) console.warn(`[computer-use-files] the approved fingerprint could not be read from the keychain (${chiusoCodice}): computer use stays off and the files are left as they are until it is turned on again in Settings`);
  } else if (rimandato) {
    for (const s of stato.values()) { s.incerto = true; s.attesa = true; s.salvata = IGNOTA; }
    console.warn(`[computer-use-files] the keychain could not be read when TALOS started (${rimandato}): computer use stays off until the next check reads it`);
  } else {
    for (const s of stato.values()) confrontaAllAvvio(s, salvateAllAvvio);
  }

  /** A6: il confronto rimandato, alla prima operazione della coda. La seconda lettura che fallisce chiude con la riga, una volta. */
  function riprovaSeServe() {
    if (!rimandato) return;
    const codice = rimandato;
    rimandato = null;
    let letta;
    try { letta = leggiVoce(); } catch (e) { letta = { codice: codiceDi(e) || codice }; }
    for (const s of stato.values()) {
      if (!s.attesa) continue;
      if (letta.codice) chiudi(s, letta.codice, IGNOTA); else confrontaAllAvvio(s, letta.salvate);
    }
  }

  /** L'impronta approvata nel portachiavi, quando cambia. Ritorna false se non si è salvata. Mai «assente» scritto sopra un'impronta
      che non si è letta (A6): prima si rilegge la voce, e se non si legge non si salva. */
  function salvaSeServe() {
    if (!daSalvare || portachiavi === null) return true;
    if ([...stato.values()].some((s) => s.incerto && s.salvata === IGNOTA)) {
      let letta;
      try { letta = leggiVoce(); } catch { letta = { codice: 'KEYCHAIN_ERROR' }; }
      /* giro 4 (A2, XM8): una voce storta non si potrà mai leggere; non c'è un'impronta approvata da proteggere, quindi i file mai
         approvati da questa voce valgono «assente» e la scrittura approvata (riaccendere dalle Impostazioni) la ripara */
      if (letta.codice && letta.codice !== 'MALFORMED') return false;
      for (const s of stato.values()) if (s.incerto && s.salvata === IGNOTA) s.salvata = (letta.codice || letta.salvate === null) ? 'assente' : letta.salvate.get(chiaveDi(s.percorso));
    }
    const valore = `v1:${ordinati.map((f) => { const s = stato.get(chiaveDi(f)); return s.incerto ? (s.salvata ?? 'assente') : s.impronta; }).join(',')}`;
    try {
      portachiavi.set(SERVIZIO_IMPRONTE_COMPUTER_USE, account, valore);
      daSalvare = false;
      return true;
    } catch (e) {
      console.warn(`[computer-use-files] the approved fingerprint could not be saved to the keychain (${codiceDi(e)}): after a restart the files are checked against the previous one`);
      return false;
    }
  }
  /* B2: la voce si salva SUBITO, non al primo controllo. A5: il primo salvataggio che fallisce chiude. */
  if (daSalvare && portachiavi !== null && !salvaSeServe()) {
    let codice = 'KEYCHAIN_ERROR';
    try { portachiavi.set(SERVIZIO_IMPRONTE_COMPUTER_USE, account, '__prova__'); } catch (e) { codice = codiceDi(e) || codice; }
    for (const s of stato.values()) {
      const salvata = salvateAllAvvio === null ? 'assente' : (salvateAllAvvio.get(chiaveDi(s.percorso)) ?? 'assente');
      s.attesa = false; s.incerto = true; s.testo = null; s.impronta = null; s.salvata = salvata;
      daRiferire.errori.push({ file: s.percorso, fase: 'impronta', codice, allAvvio: true });
    }
    console.warn(`[computer-use-files] the approved fingerprint could not be saved to the keychain (${codice}): computer use stays off until it is turned on again in Settings`);
  }

  /** Il tetto delle copie di un file: le ultime COPIE_PER_FILE e BYTE_DELLE_COPIE_PER_FILE. Si toglie dalle più vecchie, mai `appena`
      (la copia appena fatta, A7: anche con copie datate nel futuro), che conta nel totale; senza `appena` resta la più recente.
      Ritorna quante ne ha tolte. */
  async function pota(f, appena = null) {
    const prefisso = `${basename(f)}.changed-`;
    let nomi;
    try { nomi = await elencaFn(dirname(f)); } catch { return 0; }
    const copie = [];
    for (const nome of nomi) {
      if (typeof nome !== 'string' || !nome.startsWith(prefisso)) continue;
      const m = COPIA.exec(nome.slice(prefisso.length));
      if (!m) continue;
      let byte = 0;
      try { byte = (await statFn(join(dirname(f), nome))).size; } catch { continue; }
      copie.push({ percorso: join(dirname(f), nome), quando: m[1], n: Number(m[3]), byte });
    }
    copie.sort((a, b) => (a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : a.n - b.n));
    const tenuta = appena === null ? copie.at(-1)?.percorso : appena;
    const altre = copie.filter((c) => chiaveDi(c.percorso) !== chiaveDi(tenuta ?? ''));
    let quante = copie.length;
    let totale = copie.reduce((t, c) => t + c.byte, 0);
    let tolte = 0;
    while (altre.length > 0 && (quante > COPIE_PER_FILE || totale > BYTE_DELLE_COPIE_PER_FILE)) {
      const vecchia = altre.shift();
      try { await togliFn(vecchia.percorso); } catch { break; }
      quante -= 1;
      totale -= vecchia.byte;
      tolte += 1;
      vive.delete(chiaveDi(vecchia.percorso));
      const s = stato.get(chiaveDi(f));
      for (const [h, c] of s.daParte) if (c === vecchia.percorso) s.daParte.delete(h);
    }
    return tolte;
  }
  const esiste = async (p) => { try { await statFn(p); return true; } catch { return false; } };

  const voce = (f) => {
    const s = typeof f === 'string' ? stato.get(chiaveDi(f)) : undefined;
    if (!s) throw new TypeError(`${f} is not a computer use file kept by TALOS.`);
    return s;
  };
  let coda = Promise.resolve();
  const inCoda = (fn) => { const p = coda.then(fn, fn); coda = p.catch(() => {}); return p; };
  /** Chi ha un comando in corso (il registro delle sessioni, decisione 374 giro 2, C4): l'avviso va a lui, non a chi controlla. */
  const inVolo = new Set();

  /* Un file: uguale ⇒ niente; diverso ⇒ da parte (se è un contenuto nuovo, o l'approvato è «assente») e versione approvata riscritta.
     Mai lancia: dice. Ogni rinomina pota subito (B1), tenendo la copia appena fatta (A7). */
  async function esamina(s, esito) {
    const f = s.percorso;
    if (s.incerto) return;
    let attuale;
    try { attuale = await leggiOAssente(f, leggiFn); } catch (e) {
      s.erroreAlControllo = true;
      esito.errori.push({ file: f, fase: 'lettura', codice: codiceDi(e) });
      return;
    }
    if (attuale === s.testo) { s.erroreAlControllo = false; return; }
    const suo = impronta(attuale);
    let copia = null;
    const giaDaParte = attuale !== null && s.daParte.has(suo) && await esiste(s.daParte.get(suo));
    if (attuale !== null && (s.testo === null || !giaDaParte)) {
      /* un contenuto nuovo, o l'approvato «assente» (il file va tolto di mezzo comunque): sempre una rinomina, mai cancellato */
      const destinazione = nomeCopia(f);
      try { await rinominaFn(f, destinazione); } catch (e) {
        /* ⛔ mai cancellare: se non si riesce a metterlo da parte non lo si sovrascrive, e il computer use usa la versione approvata */
        s.erroreAlControllo = true;
        esito.errori.push({ file: f, fase: 'da-parte', codice: codiceDi(e) });
        return;
      }
      s.daParte.set(suo, nuovaCopia(destinazione));
      copia = destinazione;
    }
    const tolte = copia ? await pota(f, copia) : 0;
    try {
      if (s.testo !== null) {
        await scriviFn(f, s.testo);
        if ((await leggiOAssente(f, leggiFn)) !== s.testo) throw Object.assign(new Error('the file does not match after the write'), { code: 'NON_UGUALE' });
      }
    } catch (e) {
      s.erroreAlControllo = true;
      esito.errori.push({ file: f, fase: 'ripristino', codice: codiceDi(e), ...(copia ? { copia } : {}), ...(tolte ? { tolte } : {}) });
      return;
    }
    s.erroreAlControllo = false;
    esito.ripristinati.push({ file: f, copia, ...(tolte ? { tolte } : {}) });
  }

  /** Un giro di controllo: il confronto rimandato, il salvataggio, le copie dell'avvio potate, i due file esaminati. */
  async function giroDiControllo() {
    riprovaSeServe();
    salvaSeServe();
    const esito = daRiferire;
    daRiferire = { ripristinati: [], errori: [] };
    for (const [k, voceAvvio] of daPotare) { const tolte = await pota(stato.get(k).percorso, voceAvvio.copia); if (tolte) voceAvvio.tolte = tolte; }
    daPotare.clear();
    for (const s of stato.values()) await esamina(s, esito);
    return esito;
  }

  return Object.freeze({
    file: Object.freeze(assoluti),
    custodisce: (f) => typeof f === 'string' && f.length > 0 && stato.has(chiaveDi(f)),
    /** Sincrono, per i lettori: il testo approvato (null = assente o incerto). Mai il file. */
    testo: (f) => voce(f).testo,
    impronta: (f) => voce(f).impronta,
    /** A4: una copia fatta da questo custode che esiste ancora (non potata). */
    copiaViva: (c) => typeof c === 'string' && vive.has(chiaveDi(c)),
    /** All'avvio del server (B2): il primo controllo subito; il suo esito resta per il primo controllo di una sessione. */
    avvia() {
      return inCoda(async () => {
        const esito = await giroDiControllo();
        daRiferire = { ripristinati: [...esito.ripristinati, ...daRiferire.ripristinati], errori: [...esito.errori, ...daRiferire.errori] };
        return esito;
      });
    },
    /** Prima e dopo un comando. `{ ripristinati: [{ file, copia, allAvvio?, tolte? }], errori: [{ file, fase, codice, allAvvio? }] }`. */
    controlla() {
      return inCoda(giroDiControllo);
    },
    /** Una porta approvata di TALOS scrive: prima si mette da parte un cambio estraneo (mai perso), poi si scrive e si approva.
        ⛔ Giro 2, A6: se il cambio estraneo non si legge o non si mette da parte, si RIFIUTA: mai sovrascritto. */
    scrivi(f, testo) {
      const s = voce(f);
      const assoluto = s.percorso;
      if (typeof testo !== 'string') return Promise.reject(new TypeError('The computer use file text must be a string.'));
      return inCoda(async () => {
        riprovaSeServe();
        const esito = { ripristinati: [], errori: [] };
        if (s.incerto) {
          /* un file incerto (illeggibile all'avvio, o il portachiavi chiuso): non si sa cosa sia, quindi va da parte prima */
          const destinazione = nomeCopia(assoluto);
          try {
            await rinominaFn(assoluto, destinazione);
            nuovaCopia(destinazione);
            const tolte = await pota(assoluto, destinazione);
            esito.ripristinati.push({ file: assoluto, copia: destinazione, ...(tolte ? { tolte } : {}) });
          } catch (e) {
            if (e?.code !== 'ENOENT') esito.errori.push({ file: assoluto, fase: 'da-parte', codice: codiceDi(e) });
          }
        } else await esamina(s, esito);
        const bloccante = esito.errori.find((e) => !(e.fase === 'ripristino' && e.copia));
        if (bloccante) {
          throw Object.assign(new Error(`TALOS did not save the computer use settings: ${basename(assoluto)} was changed outside TALOS and could not be read or could not be moved aside (${bloccante.codice}), so nothing was written.`), {
            code: 'COMPUTER_USE_FILE_NOT_SET_ASIDE', chiave: 'server.computerUseFiles.notSetAside', params: { file: basename(assoluto) },
          });
        }
        daRiferire.ripristinati.push(...esito.ripristinati);
        await scriviFn(assoluto, testo);
        s.testo = testo;
        s.impronta = impronta(testo);
        s.incerto = false;
        s.attesa = false;
        s.salvata = null;
        s.erroreAlControllo = false;
        daSalvare = true;
        salvaSeServe();
      });
    },
    /** Dopo un cambio APPROVATO fatto fuori dalle porte (carta 373 accettata, Accesso completo, scrivi/file_edit approvato): il file
        com'è adesso diventa la versione approvata. Un file che non si legge tiene la versione di prima (chiuso); un file con un errore
        al controllo di prima non si adotta (A2): il controllo dopo lo mette da parte.
        Giro 5 (decisione 396): due opzioni che il REGISTRO sceglie per l'Accesso completo; il comportamento di serie non cambia.
        Valgono dentro la coda, così fra la domanda e l'adozione non passa un controllo. `seNessunAltro` ⇒ con un comando in corso
        altrove (`inVolo`, solo conversazioni fuori dall'Accesso completo) non si adotta niente e si dice chi (A1: il cambio può
        essere di quella conversazione). `soloCerti` ⇒ un file incerto (chiuso o in attesa) resta chiuso (A2: il primo comando non
        riapre una voce storta o un portachiavi illeggibile). B1: la voce si riscrive solo se l'impronta cambia o un incerto torna certo.
        Giro 8 (T1, decisioni 323 e 370): con `soloCerti` non si adotta nemmeno un file la cui versione approvata è «assente» (nessuna
        versione salvata: dopo l'aggiornamento o alla prima installazione): il computer use lo riaccende solo la persona. Si dice in
        `protetti`, e il registro lo fa mettere da parte dal controllo. */
    adotta(soli = null, { seNessunAltro = false, soloCerti = false } = {}) {
      return inCoda(async () => {
        riprovaSeServe();
        if (seNessunAltro && inVolo.size > 0) return { errori: [], inVolo: [...inVolo] };
        const scelti = soli === null ? [...stato.values()] : [...new Set(soli.filter((f) => typeof f === 'string').map(chiaveDi))].filter((k) => stato.has(k)).map((k) => stato.get(k));
        const errori = [];
        const protetti = [];
        for (const s of scelti) {
          if (s.erroreAlControllo) { errori.push({ file: s.percorso, fase: 'controllo-prima', codice: 'NOT_CHECKED' }); continue; }
          if (s.attesa || (soloCerti && s.incerto)) continue;
          if (soloCerti && s.impronta === 'assente') { protetti.push(s.percorso); continue; }
          try {
            const attuale = await leggiOAssente(s.percorso, leggiFn);
            const nuova = impronta(attuale);
            if (s.incerto || s.impronta !== nuova) daSalvare = true;
            s.testo = attuale;
            s.impronta = nuova;
            s.incerto = false;
            s.salvata = null;
          } catch (e) { errori.push({ file: s.percorso, fase: 'lettura', codice: codiceDi(e) }); }
        }
        salvaSeServe();
        return { errori, ...(protetti.length ? { protetti } : {}) };
      });
    },
    /** C4: il registro dice quando un comando parte e finisce; `chiHaUnComando()` dà chi va avvisato di un cambio visto adesso. */
    comandoIniziato: (chi) => { inVolo.add(chi); },
    comandoFinito: (chi) => { inVolo.delete(chi); },
    chiHaUnComando: () => [...inVolo],
  });
}
