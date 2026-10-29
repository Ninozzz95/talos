/*
 * Controllo remoto — le CARTELLE dei dispositivi, col consenso del PC (R5.12).
 *
 * Owner, 23/10/2026 sera (AskUserQuestion, tre tornate):
 *   · un dispositivo vede le cartelle delle sessioni recenti del PC; la prima volta che ne usa una, il PC chiede
 *     «Consenti a <dispositivo> di lavorare in <cartella>?» e la risposta si ricorda, per dispositivo E cartella; la revoca è per
 *     cartella; la cartella dell'app non compare MAI (D-REM-6: senza elenco esplicito il server ammetteva la cartella in cui sta, che
 *     nell'app installata è quella del programma);
 *   · il consenso vale anche per SCRIVERE nelle sessioni già aperte (leggere resta libero), e la revoca le blocca subito;
 *   · fuori casa nessuno risponde sul PC: le cartelle si consentono PRIMA, dal PC.
 * Contratto con il Mobile: `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, parte 1, revisione 1.
 *
 * Come i concorrenti, e un passo oltre: Happy prende i «posti» dalle sessioni recenti e il telefono manda il PERCORSO, senza nessun
 * consenso (`happy-app/sources/sync/agentSessionPlaces.ts:76-103`); Claude Code lavora nella cartella in cui la sessione è nata.
 * Qui il percorso non lascia mai il PC, l'id non si indovina, e ogni cartella si consente una volta per dispositivo.
 *
 * ⛔ Le regole di sicurezza (obiezioni 2-7 del Mobile, accolte):
 *   · `cartellaId` è un HMAC-SHA256 del percorso REALE con un segreto del PC (`segreto-cartelle` nella cartella dei dati): stabile
 *     ai riavvii, e un dizionario di percorsi comuni non lo ricostruisce (un hash semplice lo farebbe);
 *   · il percorso reale (realpath) si confronta al consenso E a ogni controllo: una giunzione cambiata dopo il consenso non porta il
 *     consenso in un'altra cartella;
 *   · l'identità del dispositivo è quella del peer iroh AUTENTICATO (chi chiama la passa), mai un campo della richiesta.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { promises as fsp, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';
import { firmaDelFile } from './firma-file.mjs';
import { creaLucchettoFraProcessi } from '../lucchetto-fra-processi.mjs';

/* Revisione blocco 9 (E-R1): il lucchetto fra processi su consents.json, come Hermes (`gateway/pairing.py:376-388`, 10 s). */
export const ATTESA_LUCCHETTO_CONSENSI_MS = 10_000;
const SCADENZA_LUCCHETTO_CONSENSI_MS = 30_000;

export const CARTELLE_MASSIME = 20;
export const ATTESA_CONSENSO_MS = 120_000;
export const ATTESA_LUNGA_MS = 25_000;
export const RICHIESTE_IN_ATTESA_MASSIME = 3;
const VERSIONE = 1;

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * R2.1 (contratto, Parte 1, «Revision 2»): `consent.requested {richiestaId, dispositivo, cartella, scadeAlle}` per lo stream della
 * finestra, dalla riga di `inAttesa()`. Il percorso intero c'è perché lo stream è solo della finestra del PC (guardia in http-app.mjs).
 */
export function eventoDiRichiesta(riga) {
  return { type: 'consent.requested', richiestaId: riga.richiestaId, dispositivo: { id: riga.dispositivoId, nome: riga.nomeDispositivo },
    cartella: { nome: riga.nome, percorso: riga.percorso }, scadeAlle: riga.scadeAlle };
}

/** Il percorso come chiave di confronto: senza barra finale, e su Windows senza maiuscole (il file system non le distingue). */
function chiave(percorso) {
  const r = resolve(percorso).replace(/[\\/]+$/u, '');
  return process.platform === 'win32' ? r.toLowerCase() : r;
}
const dentro = (percorso, cartella) => {
  const p = chiave(percorso);
  const c = chiave(cartella);
  return p === c || p.startsWith(c.endsWith(sep) ? c : c + sep);
};

/**
 * `fileConsensi`, `fileSegreto`: nella cartella dei dati. `sessionRegistry`: per le cartelle recenti e per la cartella di una
 * sessione. `cartelleAmmesse`: l'elenco esplicito dell'amministratore (`TALOS_HARNESS_UI_PROJECT_DIRS`), consentito a tutti i
 * dispositivi. `cartelleEscluse`: mai elencate né consentite (la cartella del programma, quella dei dati).
 */
export function creaCartelleDeiDispositivi({
  fileConsensi, fileSegreto,
  /* Owner 27/10/2026 (il nega vince): le cartelle BLOCCATE stanno in un file loro, accanto ai consensi. Non nello stesso file: uno
     scrittore più vecchio (la CLI 0.6.14 è già pubblicata) riscrive `consensi.json` con le sole chiavi che conosce e cancellerebbe
     i blocchi in silenzio; un file che non conosce non lo tocca mai (contratto CONTRATTO-CARTELLE-BLOCCATE, proposta (b) della CLI). */
  fileBloccate = typeof fileConsensi === 'string' && fileConsensi ? resolve(dirname(fileConsensi), 'cartelle-bloccate.json') : null,
  sessionRegistry = null, cartelleAmmesse = [], cartelleEscluse = [],
  /* Parità, punto 4 (owner 23/10/2026, terza tornata; contratto Parte 4 d'accordo col Mobile il 24/10): la cartella di serie della
     Chat dei dispositivi sul PC, nei dati di TALOS. È l'UNICA eccezione a `cartelleEscluse` (esattamente lei, niente sopra o accanto),
     non sta mai nell'elenco del Codice (`elenco`, così i dispositivi già usciti non la vedono) e si chiede con `chat.folder`.
     Claude Code dal telefono fa scegliere ogni volta una cartella (annuncio del 21/08/2026): qui la Chat ne ha una sua, consentita
     una volta. */
  cartellaChat = null,
  fs = fsp, realpath = (p) => realpathSync.native(p), stat = statSync, clock = () => Date.now(), casuale = (n) => randomBytes(n),
  /* R2.1 (24/10/2026): il timer della scadenza di una richiesta — `(fn, ms) → toglie()`. Le prove lo sostituiscono per scadere a comando. */
  programma = (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return () => clearTimeout(t); },
  /* Revisione blocco 9 (E-R1, 27/10/2026): un lavoro alla volta FRA I PROCESSI (la finestra e `talos remote` della CLI scrivono lo stesso
     file). Di serie un file `.lock` accanto ai consensi; con un fs finto (prove vecchie) nessun lucchetto, come prima. */
  lucchetto = null,
} = {}) {
  if (typeof fileConsensi !== 'string' || !fileConsensi || typeof fileSegreto !== 'string' || !fileSegreto) {
    throw errore('REMOTE_FOLDERS_FILE', 'The device folders need their data files.');
  }
  const conLucchetto = typeof lucchetto === 'function' ? lucchetto
    : fs === fsp ? creaLucchettoFraProcessi({ file: `${fileConsensi}.lock`, attesaMs: ATTESA_LUCCHETTO_CONSENSI_MS, scadenzaMs: SCADENZA_LUCCHETTO_CONSENSI_MS,
      codice: 'REMOTE_STORE_BUSY', messaggio: 'Another TALOS window is changing the device folders: try again in a moment.' })
      : (lavoro) => lavoro();
  let segreto = null;
  let consensi = null; // { [dispositivoId]: [{ percorso, at, da }] }
  let sessioniChat = {}; // Parte 4: { [sessionId]: { dispositivoId, at } } — chi ha aperto una sessione nella cartella della Chat
  let bloccate = {}; // owner 27/10: { [dispositivoId]: [{ percorso (reale al momento del blocco), at }] } — il nega vince
  let altreChiavi = {}; // le chiavi di `consensi.json` che questo server non conosce: si riscrivono com'erano, mai perse
  let coda = Promise.resolve();
  const attese = new Map(); // richiestaId → richiesta in attesa del PC
  /*
   * R2.1 del contratto (Parte 1, «Revision 2», AGREED col Mobile il 24/10/2026) — chi ascolta le richieste: lo stream della finestra
   *   (`GET /api/v1/remote/events`). Owner, 24/10, dopo la prova dal vivo (≈49 s dal tocco alla carta, fino a 20 s spesi dalla finestra
   *   che CONTROLLAVA ogni 20 s): «È troppo tempo, bisogna renderlo più istantaneo possibile». Come Hermes, che spinge
   *   `approval.request` e toglie la carta su `.settled` (`apps/desktop/src/api/canonical-protocol.ts:613`): qui `consent.requested`
   *   quando una richiesta nasce e `consent.closed` quando si chiude, per QUALUNQUE strada (consenso, rifiuto, scadenza, dimenticanza).
   */
  const ascoltatori = new Set();
  const emetti = (evento) => {
    for (const fn of [...ascoltatori]) { try { fn(evento); } catch { /* un ascoltatore che cade non ferma gli altri né la richiesta */ } }
  };

  /*
   * 27/10/2026 — `consents.json` si rilegge quando CAMBIA sul disco (impronta dello stat, `firma-file.mjs`), come Hermes
   *   `gateway/pairing.py:397-415`: la finestra e `talos remote` (CLI, T5 «remote folders») scrivono lo stesso file.
   * ⛔ Mai durante una scrittura in fila (`inScrittura`), né con un ricordo in memoria non ancora salvato (`inSospeso`,
   *   `segnaSessioneChat`): la rilettura cancellerebbe la modifica. Chi scrive rilegge all'inizio del suo lavoro in fila.
   */
  let firmaLetta = null;
  let inScrittura = 0;
  /* Revisione blocco 9 (E-R1): i ricordi della prima chat non ancora salvati. Prima la loro scrittura SALTAVA la rilettura (per non
     perderli) e riscriveva la copia in memoria, rimettendo una cartella appena revocata dal terminale. Ora si rilegge sempre, e questi
     si riapplicano sopra quello che c'è sul disco. */
  const chatInSospeso = new Map();
  const inFila = (lavoro) => {
    /* sotto il lucchetto: rileggere → cambiare → scrivere è una cosa sola anche fra processi */
    const esegui = () => conLucchetto(async () => {
      if (typeof fs.stat === 'function') await leggiConsensi();
      inScrittura += 1;
      try { return await lavoro(); } finally { inScrittura -= 1; }
    });
    const prossimo = coda.then(esegui, esegui);
    coda = prossimo.catch(() => {});
    return prossimo;
  };
  /* ⛔ Revisione a blocco 5 (24/10/2026, REV5-COL-2, verificato dal Desktop 9): il nome temporaneo era `<file>.<pid>.<Date.now()>.tmp`,
     uguale per due scritture dello stesso millisecondo — il primo `rename` portava via il file dell'altro (ENOENT). Ora 8 byte casuali,
     come Hermes (`apps/desktop/electron/desktop-boot-preference.ts:66`, `${file}.${randomUUID()}.tmp`) e `@warlock.js/fs` (suffisso
     casuale «so two concurrent writers don't collide», ricerca del 24/10/2026). `randomBytes` e non `casuale`: le prove possono rendere
     `casuale` prevedibile, e qui serve solo che due nomi non coincidano. Un temporaneo rimasto da una scrittura fallita si toglie. */
  const scriviAtomico = async (file, testo) => {
    await fs.mkdir(dirname(file), { recursive: true });
    const temporaneo = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporaneo, testo, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaneo, file);
    } catch (e) { await fs.rm(temporaneo, { force: true }).catch(() => {}); throw e; }
  };
  /* REV5-COL-2 (24/10/2026): `preparaSegreto` gira FUORI dalla fila (elenco, trova, descrivi, chiedi…). Due prime letture in parallelo su
     una cartella dati vergine facevano due segreti diversi: in memoria restava l'ultimo assegnato, sul disco l'ultimo rinominato — gli
     id delle cartelle cambiavano al riavvio (misurato: 19 giri su 20, ENOENT o segreto diverso, sonda CURA5-COL-2b). Ora una preparazione
     sola, condivisa da chi arriva mentre è in corso; se fallisce, la prossima chiamata ci riprova. */
  let preparazione = null;
  const preparaSegreto = () => {
    if (segreto) return Promise.resolve(segreto);
    preparazione ??= (async () => {
      let letto = null;
      try { letto = String(await fs.readFile(fileSegreto, 'utf8')).trim(); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
      if (letto && /^[0-9a-f]{64}$/u.test(letto)) { segreto = Buffer.from(letto, 'hex'); return segreto; }
      /* Un segreto illeggibile o assente se ne fa uno nuovo: gli id cambiano (il dispositivo ricarica l'elenco), i consensi no — stanno
         per percorso, non per id. */
      segreto = casuale(32);
      await scriviAtomico(fileSegreto, segreto.toString('hex'));
      return segreto;
    })().finally(() => { preparazione = null; });
    return preparazione;
  };
  const caricaConsensi = async () => (consensi && (inScrittura > 0 || typeof fs.stat !== 'function') ? consensi : leggiConsensi());
  const firmaDeiDue = async () => {
    const [a, b] = await Promise.all([firmaDelFile(fs, fileConsensi), fileBloccate ? firmaDelFile(fs, fileBloccate) : 'nessuno']);
    return a === null || b === null ? null : `${a}|${b}`;
  };
  const leggiJson = async (file) => {
    let grezzo = null;
    try { grezzo = await fs.readFile(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
    if (grezzo == null) return null;
    try { return JSON.parse(grezzo); } catch { throw errore('REMOTE_CONSENTS_UNREADABLE', 'The folders allowed to devices cannot be read.'); }
  };
  const leggiConsensi = async () => {
    const firma = await firmaDeiDue();
    if (consensi && firma !== null && firma === firmaLetta) return consensi;
    /* Un file illeggibile non si legge come vuoto (si perderebbero le revoche alla prima scrittura): si dice. Lo stesso per i blocchi:
       un blocco letto come «nessuno» aprirebbe una cartella che la persona ha chiuso. */
    const dati = await leggiJson(fileConsensi);
    const datiBloccate = fileBloccate ? await leggiJson(fileBloccate) : null;
    const nuoveBloccate = {};
    for (const [id, voci] of Object.entries(datiBloccate?.dispositivi ?? {})) {
      if (!Array.isArray(voci) || voci.some((v) => !v || typeof v.percorso !== 'string' || !v.percorso)) {
        throw errore('REMOTE_CONSENTS_UNREADABLE', 'The folders blocked for devices cannot be read.');
      }
      nuoveBloccate[id] = voci.map((v) => ({ percorso: v.percorso, at: Number.isFinite(v.at) ? v.at : 0 }));
    }
    if (consensi && inScrittura > 0) return consensi; // una scrittura è cominciata mentre si leggeva: vince lei
    firmaLetta = firma;
    bloccate = nuoveBloccate;
    altreChiavi = Object.fromEntries(Object.entries(dati ?? {}).filter(([k]) => !['v', 'dispositivi', 'sessioniChat'].includes(k)));
    consensi = {};
    for (const [id, voci] of Object.entries(dati?.dispositivi ?? {})) {
      if (!Array.isArray(voci)) continue;
      consensi[id] = voci.filter((v) => v && typeof v.percorso === 'string' && v.percorso)
        .map((v) => ({ percorso: v.percorso, at: Number.isFinite(v.at) ? v.at : 0, da: v.da === 'anticipo' || v.da === 'chat' ? v.da : 'domanda' }));
    }
    sessioniChat = {};
    for (const [sessionId, v] of Object.entries(dati?.sessioniChat ?? {})) {
      if (v && typeof v.dispositivoId === 'string' && v.dispositivoId) sessioniChat[sessionId] = { dispositivoId: v.dispositivoId, at: Number.isFinite(v.at) ? v.at : 0 };
    }
    for (const [sessionId, voce] of chatInSospeso) sessioniChat[sessionId] = voce; // E-R1: i ricordi non ancora salvati restano
    return consensi;
  };
  const salvaConsensi = async () => {
    /* ⛔ B-R4 (revisione del blocco 10, 27/10/2026): PRIMA i blocchi, POI i consensi. Al contrario, una revoca che doveva bloccare e il cui
       file dei blocchi non si scriveva (EPERM: un antivirus, un lettore che tiene il file) lasciava il consenso già tolto e il blocco
       assente: la sottocartella consentita da sola restava aperta, e rifare la revoca rispondeva NOT_FOUND. Così, a guasto, resta un
       blocco in più (si toglie con «Sblocca»), mai uno in meno. */
    if (fileBloccate) {
      const conBlocchi = Object.fromEntries(Object.entries(bloccate).filter(([, voci]) => voci.length));
      await scriviAtomico(fileBloccate, JSON.stringify({ v: VERSIONE, dispositivi: conBlocchi }, null, 1));
    }
    await scriviAtomico(fileConsensi, JSON.stringify({ ...altreChiavi, v: VERSIONE, dispositivi: consensi,
      ...(Object.keys(sessioniChat).length ? { sessioniChat } : {}) }, null, 1));
    firmaLetta = await firmaDeiDue(); // il file ora è il nostro: nessuna rilettura per una scrittura propria
  };

  /** Il percorso reale di una cartella che esiste, o null. */
  const reale = (percorso) => {
    if (typeof percorso !== 'string' || !percorso) return null;
    try {
      const r = realpath(percorso);
      return stat(r).isDirectory() ? r : null;
    } catch { return null; }
  };
  const esclusi = () => cartelleEscluse.map((c) => reale(c) ?? (typeof c === 'string' && c ? resolve(c) : null)).filter(Boolean);
  /* Parte 4: la cartella della Chat, esattamente lei (un percorso reale uguale, mai «dentro»), non è esclusa */
  const realeChat = () => (typeof cartellaChat === 'string' && cartellaChat ? reale(cartellaChat) : null);
  const eChat = (percorsoReale) => { const c = realeChat(); return Boolean(c && percorsoReale && chiave(percorsoReale) === chiave(c)); };
  const escluso = (percorsoReale) => !eChat(percorsoReale) && esclusi().some((c) => dentro(percorsoReale, c));
  const ammessi = () => cartelleAmmesse.map((c) => reale(c)).filter(Boolean);
  const idDi = (percorsoReale) => createHmac('sha256', segreto).update(chiave(percorsoReale)).digest('base64url').slice(0, 32);

  /** Consentita per QUESTO dispositivo: l'elenco esplicito, o un consenso il cui percorso reale è ancora lo stesso. */
  /**
   * Owner 27/10: dentro (o uguale a) una cartella BLOCCATA per questo dispositivo. Si confronta col percorso SALVATO, che è il percorso vero
   * al momento del blocco; chi chiede arriva già col suo percorso vero, quindi una giunzione VERSO la bloccata resta bloccata.
   * ⛔ B-R5 (revisione del blocco 10, 27/10/2026): non più anche col percorso vero «di oggi» della bloccata. Quel ramo contava solo quando la
   *   cartella bloccata veniva SOSTITUITA da una giunzione verso un'altra cartella: allora bloccava quell'altra, consentita e mostrata
   *   «consentita», in silenzio (prova B7 del revisore). Un blocco che nessuno ha chiesto e che la finestra non mostra.
   */
  const bloccataReale = (dispositivoId, percorsoReale) => Boolean(percorsoReale) && (bloccate[dispositivoId] ?? []).some((b) => dentro(percorsoReale, b.percorso));
  /** Il blocco che sta SOPRA (strettamente) `percorsoReale`, o null: consentire lì dentro non renderebbe la cartella usabile. */
  const bloccoSopra = (dispositivoId, percorsoReale) => (bloccate[dispositivoId] ?? []).find((b) => chiave(b.percorso) !== chiave(percorsoReale) && dentro(percorsoReale, b.percorso)) ?? null;
  const erroreBloccata = (sopra) => Object.assign(errore('FOLDER_BLOCKED', `This folder is inside "${basename(sopra.percorso) || sopra.percorso}", which is blocked for this device: unblock it first.`),
    { cartellaBloccata: { cartellaId: idDi(sopra.percorso), nome: basename(sopra.percorso) || sopra.percorso } });
  const consentitaReale = (dispositivoId, percorsoReale) => {
    if (!percorsoReale || escluso(percorsoReale) || bloccataReale(dispositivoId, percorsoReale)) return false;
    const k = chiave(percorsoReale);
    if (ammessi().some((a) => chiave(a) === k)) return true;
    return (consensi[dispositivoId] ?? []).some((v) => chiave(v.percorso) === k && reale(v.percorso) !== null && chiave(reale(v.percorso)) === k);
  };

  /** Tutte le cartelle che il dispositivo può vedere, prima del tetto: recenti, elenco esplicito, consentite a lui. */
  const candidate = (dispositivoId) => {
    const visti = new Map();
    const aggiungi = (percorso, usataAlle) => {
      const r = reale(percorso);
      if (!r || escluso(r) || eChat(r)) return; // Parte 4: la Chat mai nell'elenco del Codice
      const k = chiave(r);
      const prima = visti.get(k);
      if (prima) { if (usataAlle && (!prima.usataAlle || usataAlle > prima.usataAlle)) prima.usataAlle = usataAlle; return; }
      visti.set(k, { reale: r, usataAlle: usataAlle ?? null });
    };
    let recenti = [];
    try { recenti = typeof sessionRegistry?.cartellePiuUsate === 'function' ? sessionRegistry.cartellePiuUsate() : []; } catch { recenti = []; }
    for (const { percorso, ultimaVolta } of recenti) aggiungi(percorso, typeof ultimaVolta === 'string' ? ultimaVolta : null);
    for (const a of ammessi()) aggiungi(a, null);
    for (const v of consensi[dispositivoId] ?? []) aggiungi(v.percorso, v.at ? new Date(v.at).toISOString() : null);
    for (const b of bloccate[dispositivoId] ?? []) aggiungi(b.percorso, null); // owner 27/10: il dispositivo la vede bloccata, non «da chiedere»
    return [...visti.values()];
  };
  const righe = (dispositivoId, { tutte = false } = {}) => {
    const lista = candidate(dispositivoId).sort((a, b) => String(b.usataAlle ?? '').localeCompare(String(a.usataAlle ?? '')));
    const scelte = tutte ? lista : lista.slice(0, CARTELLE_MASSIME);
    const nomi = new Map();
    for (const c of scelte) { const n = basename(c.reale) || c.reale; nomi.set(n, (nomi.get(n) ?? 0) + 1); }
    return scelte.map((c) => {
      const nome = basename(c.reale) || c.reale;
      return {
        riga: {
          cartellaId: idDi(c.reale), nome,
          ...(nomi.get(nome) > 1 ? { dettaglio: basename(dirname(c.reale)) || null } : {}),
          usataAlle: c.usataAlle, consentita: consentitaReale(dispositivoId, c.reale),
          ...(bloccataReale(dispositivoId, c.reale) ? { bloccata: true } : {}),
        },
        reale: c.reale,
      };
    });
  };
  /** Parte 4: la riga della cartella della Chat per un dispositivo (null se non è configurata o non c'è ancora). */
  const rigaChat = (dispositivoId) => {
    const r = realeChat();
    if (!r) return null;
    return { riga: { cartellaId: idDi(r), nome: basename(r) || r, usataAlle: null, consentita: consentitaReale(dispositivoId, r), tipo: 'chat' }, reale: r };
  };
  /** Una cartella per id fra quelle che il dispositivo può vedere, Chat compresa (che nell'elenco non c'è). */
  const perId = (dispositivoId, cartellaId) => {
    const trovata = righe(dispositivoId, { tutte: true }).find((x) => x.riga.cartellaId === cartellaId);
    if (trovata) return trovata;
    const chat = rigaChat(dispositivoId);
    return chat && chat.riga.cartellaId === cartellaId ? chat : null;
  };
  /* ⛔ Revisione a blocco 5 (24/10/2026, REV5-C1, S3): una richiesta «in risposta» (la persona ha premuto «Consenti» in tempo, e il
     PC sta salvando il consenso o avviando la sessione trattenuta) NON scade più. Prima la scadenza arrivata durante l'avvio la chiudeva
     «scaduta» per il dispositivo, e poco dopo `rispondi` la chiudeva «consentita» con la sessione avviata e il consenso salvato: due
     `consent.closed` contraddittori (sonda REV5-C1; il timer di R2.1 l'aveva reso sistematico). */
  const scadute = () => {
    const ora = clock();
    for (const r of attese.values()) {
      if (!r.esito && !r.inRisposta && ora >= r.scadeAlle) chiudi(r, { esito: 'scaduta' });
    }
  };
  /* R2.1: il timer della scadenza. Un timer che scatta prima dell'orologio (i timer di Node vanno sul monotono, `clock` sull'ora del
     sistema) si riprogramma per il resto, invece di lasciare la carta sul PC fino alla prossima lettura. */
  const allaScadenza = (r) => () => {
    if (r.esito) return;
    const resto = r.scadeAlle - clock();
    if (resto > 0) { r.togliScadenza = programma(allaScadenza(r), resto); return; }
    scadute();
  };
  /** La riga di una richiesta per la carta del PC (il percorso intero si mostra solo qui, sul PC). */
  const perLaCarta = (r) => ({
    richiestaId: r.richiestaId, dispositivoId: r.dispositivoId, nomeDispositivo: r.nomeDispositivo, percorso: r.percorso, nome: r.nome,
    scadeAlle: new Date(r.scadeAlle).toISOString(),
    ...(r.bloccata ? { bloccata: true } : {}), // B-R3 (27/10/2026): la carta dice che consentendo la si sblocca
  });
  /** Toglie il blocco di quella cartella esatta (percorso salvato o vero di oggi), se c'è. */
  const togliBlocco = (dispositivoId, percorsoReale) => {
    const lista = bloccate[dispositivoId];
    if (!lista) return;
    bloccate[dispositivoId] = lista.filter((b) => chiave(b.percorso) !== chiave(percorsoReale) && chiave(reale(b.percorso) ?? b.percorso) !== chiave(percorsoReale));
  };
  const chiudi = (r, esito) => {
    if (r.esito) return; // REV5-C1 (24/10/2026): una richiesta si chiude UNA volta sola, e il primo esito resta
    r.esito = esito;
    r.togliScadenza?.();
    r.togliScadenza = null;
    for (const sveglia of r.svegli) sveglia();
    r.svegli.clear();
    /* R2.1: la carta sul PC si toglie su questo evento; `sessionId` quando il «Consenti» ha avviato la sessione trattenuta */
    emetti({ type: 'consent.closed', richiestaId: r.richiestaId, dispositivoId: r.dispositivoId, esito: esito.esito,
      ...(esito.sessionId ? { sessionId: esito.sessionId } : {}) });
  };

  return {
    /** L'elenco per il dispositivo, più recente prima, al più `CARTELLE_MASSIME`. */
    async elenco(dispositivoId) {
      await preparaSegreto(); await caricaConsensi();
      return righe(dispositivoId).map((x) => x.riga);
    },

    /** La cartella di un id, se il dispositivo la può vedere: `{ reale, riga }` o null (FOLDER_NOT_LISTED per chi chiama). */
    async trova(dispositivoId, cartellaId) {
      await preparaSegreto(); await caricaConsensi();
      if (typeof cartellaId !== 'string' || !cartellaId) return null;
      return perId(dispositivoId, cartellaId);
    },

    /**
     * Parte 4 (contratto, d'accordo col Mobile il 24/10/2026): la cartella della Chat per QUESTO dispositivo — `{ cartellaId, nome,
     * consentita }`, creata la prima volta. Null se questo PC non ne ha una (chi chiama risponde CHAT_UNAVAILABLE).
     */
    async chat(dispositivoId) {
      if (typeof cartellaChat !== 'string' || !cartellaChat) return null;
      await fs.mkdir(cartellaChat, { recursive: true });
      await preparaSegreto(); await caricaConsensi();
      const c = rigaChat(dispositivoId);
      return c ? { cartellaId: c.riga.cartellaId, nome: c.riga.nome, consentita: c.riga.consentita } : null;
    },

    /**
     * Parte 4: chi ha aperto una sessione nella cartella della Chat (dalla sessione avviata dal dispositivo). Al più 2000 voci.
     * ⛔ Non si ASPETTA la coda: la prima chat parte da `rispondi` (il «Consenti» del PC), che gira GIÀ dentro la coda — aspettare qui
     *   la propria scrittura in coda era uno stallo fino al tempo massimo della chiamata (preso da CHD-02, 120 s). Il ricordo va in
     *   memoria subito; il file si salva in coda, dopo.
     */
    async segnaSessioneChat(sessionId, dispositivoId) {
      if (typeof sessionId !== 'string' || !sessionId || typeof dispositivoId !== 'string' || !dispositivoId) return;
      await caricaConsensi();
      const voce = { dispositivoId, at: clock() };
      chatInSospeso.set(sessionId, voce); // E-R1: si riapplica a ogni rilettura finché non è sul disco
      sessioniChat[sessionId] = voce;
      void inFila(async () => {
        const voci = Object.entries(sessioniChat);
        if (voci.length > 2000) for (const [id] of voci.sort((a, b) => a[1].at - b[1].at).slice(0, voci.length - 2000)) delete sessioniChat[id];
        await salvaConsensi();
        if (chatInSospeso.get(sessionId) === voce) chatInSospeso.delete(sessionId);
      }).catch(() => {});
    },
    /** Parte 4, per le prove e la chiusura: aspetta che le scritture in coda siano su disco. */
    attendiScritture() { return inFila(async () => {}); },
    async dispositivoDellaSessioneChat(sessionId) {
      await caricaConsensi();
      return sessioniChat[sessionId]?.dispositivoId ?? null;
    },

    /** Il controllo vero, per ogni scrittura del dispositivo: la cartella (della sessione o scelta) è consentita a lui adesso? */
    async consentita(dispositivoId, percorso) {
      await caricaConsensi();
      return consentitaReale(dispositivoId, reale(percorso));
    },

    /** `{ cartellaId, nome }` di un percorso per il dispositivo (la riga dell'errore CONSENT_REQUIRED e delle sessioni). */
    async descrivi(percorso) {
      await preparaSegreto();
      const r = reale(percorso);
      if (!r || escluso(r)) return null;
      return { cartellaId: idDi(r), nome: basename(r) || r, ...(eChat(r) ? { tipo: 'chat' } : {}) };
    },

    /**
     * Una richiesta di consenso. Una sola per dispositivo e cartella alla volta (la stessa torna a chi richiede); al più
     * `RICHIESTE_IN_ATTESA_MASSIME` per dispositivo. `avvio`: facoltativo, la sessione da far partire DAL PC al «Consenti» (il corpo
     * resta qui durante l'attesa: obiezione 4 del Mobile) — torna il `sessionId`.
     */
    async chiedi({ dispositivoId, nomeDispositivo = null, cartellaId, avvio = null }) {
      await preparaSegreto(); await caricaConsensi();
      scadute();
      const trovata = perId(dispositivoId, cartellaId);
      if (!trovata) throw errore('FOLDER_NOT_LISTED', 'This folder is no longer on the computer.');
      /* ⛔ B-R3 (revisione del blocco 10, 27/10/2026): una cartella DENTRO una bloccata non si chiede — «Consenti» rispondeva «consentita»,
         lasciava un consenso appeso sotto il blocco, e la sessione non partiva. Lo stesso rifiuto di «Aggiungi cartella». */
      const sopra = bloccoSopra(dispositivoId, trovata.reale);
      if (sopra) throw erroreBloccata(sopra);
      const stessa = [...attese.values()].find((r) => !r.esito && r.dispositivoId === dispositivoId && chiave(r.percorso) === chiave(trovata.reale));
      const risposta = (r) => ({ stato: 'attesa-consenso', richiestaId: r.richiestaId, scadeAlle: new Date(r.scadeAlle).toISOString(), attesaMs: Math.max(0, r.scadeAlle - clock()) });
      if (stessa) {
        if (avvio && !stessa.avvio) stessa.avvio = avvio;
        return risposta(stessa);
      }
      if ([...attese.values()].filter((r) => !r.esito && r.dispositivoId === dispositivoId).length >= RICHIESTE_IN_ATTESA_MASSIME) {
        throw errore('RATE_LIMITED', 'There are already 3 requests waiting on the computer.');
      }
      const r = {
        richiestaId: casuale(16).toString('base64url'), dispositivoId, nomeDispositivo: typeof nomeDispositivo === 'string' ? nomeDispositivo.slice(0, 64) : null,
        percorso: trovata.reale, cartellaId, nome: trovata.riga.nome, scadeAlle: clock() + ATTESA_CONSENSO_MS, avvio, esito: null, svegli: new Set(),
        /* B-R3: la cartella chiesta È bloccata per questo dispositivo: la carta lo dice («consentendo la sblocchi») */
        ...(bloccataReale(dispositivoId, trovata.reale) ? { bloccata: true } : {}),
      };
      attese.set(r.richiestaId, r);
      /* R2.1: la scadenza si ANNUNCIA (prima si notava solo alla lettura dopo, e la carta restava sul PC fino al giro successivo) */
      r.togliScadenza = programma(allaScadenza(r), ATTESA_CONSENSO_MS);
      emetti(eventoDiRichiesta(perLaCarta(r)));
      return risposta(r);
    },

    /** Le richieste aperte, per la carta del PC (il percorso intero si mostra solo qui, sul PC). */
    inAttesa() {
      scadute();
      return [...attese.values()].filter((r) => !r.esito && !r.inRisposta).map(perLaCarta); // REV5-C1: in risposta, la carta non torna
    },

    /**
     * R2.1: ascolta le richieste che nascono e si chiudono (gli eventi di `eventoDiRichiesta` e `consent.closed`). Torna la funzione
     * che smette. Lo usa lo stream della finestra, che all'apertura manda prima l'istantanea di `inAttesa()`.
     */
    ascolta(fn) {
      if (typeof fn !== 'function') return () => {};
      ascoltatori.add(fn);
      return () => { ascoltatori.delete(fn); };
    },
    /** Quanti ascoltano adesso (per le prove: uno stream chiuso non deve restare appeso qui). */
    ascoltatori() { return ascoltatori.size; },

    /** La risposta del PC. Dopo la scadenza, o due volte, non ha effetto (CONSENT_NOT_PENDING). */
    rispondi(richiestaId, esito) {
      /* REV5-C1 (24/10/2026): la risposta conta dal momento in cui ARRIVA, non da quando la fila la serve. La richiesta si marca «in
         risposta» subito, prima di qualunque `await` (la fila compresa), se è ancora aperta e nel suo tempo: da qui `scadute()` la salta
         e la carta non torna nell'istantanea. Una seconda risposta trova la prima e non cambia niente. */
      const inArrivo = attese.get(richiestaId);
      const mia = Boolean(inArrivo && !inArrivo.esito && !inArrivo.inRisposta && clock() < inArrivo.scadeAlle);
      if (mia) inArrivo.inRisposta = true;
      /* Revisione blocco 9 (E-R1): dentro la fila — e quindi sotto il lucchetto fra processi — SOLO il salvataggio del consenso. L'avvio
         della sessione trattenuta (secondi) sta fuori: tenerci il lucchetto fermerebbe per tutto quel tempo `talos remote` della CLI. */
      let r = null;
      const salvato = inFila(async () => {
        scadute();
        r = attese.get(richiestaId);
        if (!r || r.esito || (r.inRisposta && !mia)) throw errore('CONSENT_NOT_PENDING', 'This request is no longer waiting.');
        if (esito !== 'consentita') return 'negata';
        await caricaConsensi();
        const sopraOra = bloccoSopra(r.dispositivoId, r.percorso); // B-R3: un blocco messo sopra DOPO la richiesta
        if (sopraOra) throw erroreBloccata(sopraOra);
        const lista = consensi[r.dispositivoId] ?? (consensi[r.dispositivoId] = []);
        if (!lista.some((v) => chiave(v.percorso) === chiave(r.percorso))) lista.push({ percorso: r.percorso, at: clock(), da: 'domanda' });
        togliBlocco(r.dispositivoId, r.percorso); // owner 27/10: l'ultima scelta della persona vince
        await salvaConsensi();
        return 'consentita';
      });
      return salvato.then(async (fatto) => {
        try {
          if (fatto === 'negata') { chiudi(r, { esito: 'negata' }); return r.esito; }
          let sessionId = null;
          let erroreAvvio = null;
          if (typeof r.avvio === 'function') {
            try { sessionId = (await r.avvio()) ?? null; } catch (e) { erroreAvvio = e?.code ?? 'START_FAILED'; }
          }
          chiudi(r, { esito: 'consentita', ...(sessionId ? { sessionId } : {}), ...(erroreAvvio ? { erroreAvvio } : {}) });
          return r.esito;
        } finally {
          r.inRisposta = false;
          if (!r.esito) scadute();
        }
      }, (e) => {
        /* una risposta fallita (il salvataggio del consenso) rimette la richiesta nelle mani della scadenza */
        if (r) { r.inRisposta = false; if (!r.esito) scadute(); }
        throw e;
      });
    },

    /**
     * L'attesa lunga del dispositivo (`consent.wait`): l'esito, o `{ stato: 'attesa' }` alla scadenza di questa chiamata. Solo chi
     * ha chiesto la può attendere. Richiamarla dopo una caduta ridà lo stato di adesso (idempotente).
     */
    async attendi(dispositivoId, richiestaId, { ms = ATTESA_LUNGA_MS } = {}) {
      scadute();
      const r = attese.get(richiestaId);
      if (!r || r.dispositivoId !== dispositivoId) throw errore('NOT_FOUND', 'This consent request does not exist.');
      if (r.esito) return r.esito;
      /* REV5-C1: in risposta l'esito arriva da `rispondi` anche oltre la scadenza — si aspetta lui, non si torna subito «attesa» */
      const finoA = r.inRisposta ? ms : Math.min(ms, Math.max(0, r.scadeAlle - clock()));
      await new Promise((ok) => {
        const t = setTimeout(() => { r.svegli.delete(sveglia); ok(); }, finoA);
        t.unref?.();
        const sveglia = () => { clearTimeout(t); ok(); };
        r.svegli.add(sveglia);
      });
      scadute();
      return r.esito ?? { stato: 'attesa' };
    },

    /**
     * Dal PC: una cartella consentita in anticipo a un dispositivo (per quando si è fuori casa). `da: 'chat'` (owner 23/10/2026):
     * consentita dal modello dopo la carta della persona (`remote_phone_folder_allow`); di serie resta «in anticipo».
     */
    consentiInAnticipo(dispositivoId, percorso, { da = 'anticipo', attesa = null } = {}) {
      return inFila(async () => {
        await preparaSegreto(); await caricaConsensi();
        const r = reale(percorso);
        if (!r) throw errore('FOLDER_INVALID', 'This folder does not exist.');
        /* ⛔ 24/10 (revisione avversaria F2-2): `attesa` è la cartella mostrata sulla carta. Il percorso si risolve di nuovo QUI, dentro
           la coda e subito prima di scrivere: se nel frattempo è diventato un passaggio verso un'altra cartella, non si scrive niente. */
        if (attesa && idDi(r) !== attesa) throw errore('FOLDER_CHANGED', 'The folder changed after the card was shown.');
        if (escluso(r)) throw errore('FOLDER_NOT_ALLOWED', 'This folder belongs to TALOS and cannot be given to a device.');
        /* owner 27/10 (il nega vince): consentire una cartella DENTRO una bloccata non la renderebbe usabile, e «consentita» sarebbe una
           risposta falsa. Si dice quale blocco toglie prima. Consentire la cartella bloccata stessa invece toglie il suo blocco. */
        const sopra = bloccoSopra(dispositivoId, r);
        if (sopra) throw erroreBloccata(sopra);
        const lista = consensi[dispositivoId] ?? (consensi[dispositivoId] = []);
        if (!lista.some((v) => chiave(v.percorso) === chiave(r))) lista.push({ percorso: r, at: clock(), da: da === 'chat' ? 'chat' : 'anticipo' });
        togliBlocco(dispositivoId, r); // owner 27/10: consentire di nuovo una cartella bloccata è l'ultima scelta della persona, e vince
        await salvaConsensi();
        return { cartellaId: idDi(r), nome: basename(r) || r };
      });
    },

    /** Le cartelle consentite a un dispositivo, per la finestra del PC (il percorso intero solo qui) e per l'attrezzo del modello. */
    async consensiDi(dispositivoId) {
      await preparaSegreto(); await caricaConsensi();
      return [
        ...(consensi[dispositivoId] ?? []).map((v) => ({ cartellaId: idDi(v.percorso), nome: basename(v.percorso) || v.percorso, percorso: v.percorso,
          consentitaAlle: v.at ? new Date(v.at).toISOString() : null, da: v.da, esiste: reale(v.percorso) !== null })),
        /* owner 27/10: i blocchi, per la finestra del PC («Bloccata», «Sblocca») e per l'attrezzo del modello */
        ...(bloccate[dispositivoId] ?? []).map((b) => ({ cartellaId: idDi(b.percorso), nome: basename(b.percorso) || b.percorso, percorso: b.percorso,
          bloccataAlle: b.at ? new Date(b.at).toISOString() : null, bloccata: true, esiste: reale(b.percorso) !== null })),
      ];
    },

    /**
     * R5.12 (owner 23/10/2026), per l'attrezzo del modello che consente: com'è un percorso, SENZA scrivere un consenso. `inesistente`
     * (non c'è, o non è una cartella), `esclusa` (di TALOS), oppure `ok` col percorso reale, l'id, il nome e se è già consentita
     * a quel dispositivo. Le stesse regole di `consentiInAnticipo`, che resta il controllo vero al momento di scrivere.
     */
    async verifica(percorso, dispositivoId = null) {
      await preparaSegreto(); await caricaConsensi();
      const r = reale(percorso);
      if (!r) return { esito: 'inesistente' };
      if (escluso(r)) return { esito: 'esclusa' };
      return { esito: 'ok', cartellaId: idDi(r), nome: basename(r) || r, percorso: r, consentita: dispositivoId ? consentitaReale(dispositivoId, r) : false };
    },

    /**
     * R5.12 (owner 23/10/2026), per l'attrezzo del modello che revoca: il consenso di un dispositivo indicato per id della cartella
     * o per il percorso intero salvato (con le regole di confronto dei percorsi), o null. Solo lettura.
     */
    async consensoDi(dispositivoId, cartellaOPercorso) {
      await preparaSegreto(); await caricaConsensi();
      if (typeof cartellaOPercorso !== 'string' || !cartellaOPercorso) return null;
      /* ⛔ E-R1 (revisione blocco 7, 27/10/2026): il consenso salva il percorso VERO (`reale`); un percorso che passa per una giunzione
         si confronta ANCHE col suo percorso vero, o la revoca col percorso della giunzione risponde «non consentita» e il dispositivo
         ci lavora ancora. Un percorso sparito dal disco non ha un percorso vero: resta il confronto sul testo. */
      const assoluto = isAbsolute(cartellaOPercorso);
      const veroDato = assoluto ? reale(cartellaOPercorso) : null;
      /* ⛔ C-R1 (revisione blocco 8): il percorso SCRITTO vince su quello vero. Con due consensi i cui percorsi veri si scontrano (Y
         diventata una giunzione verso X), «revoca Y» trovava X per primo e toglieva il consenso che la persona non aveva nominato. */
      const lista = consensi[dispositivoId] ?? [];
      const v = lista.find((x) => idDi(x.percorso) === cartellaOPercorso || (assoluto && chiave(x.percorso) === chiave(cartellaOPercorso)))
        ?? (veroDato !== null ? lista.find((x) => chiave(x.percorso) === chiave(veroDato)) : undefined);
      return v ? { cartellaId: idDi(v.percorso), nome: basename(v.percorso) || v.percorso, percorso: v.percorso } : null;
    },

    /** Revoca una cartella a un dispositivo: vale subito, anche per le sessioni aperte (il controllo si fa a ogni scrittura). */
    revoca(dispositivoId, cartellaId) {
      return inFila(async () => {
        await preparaSegreto(); await caricaConsensi();
        const lista = consensi[dispositivoId] ?? [];
        const tolti = lista.filter((v) => idDi(v.percorso) === cartellaId);
        const resto = lista.filter((v) => idDi(v.percorso) !== cartellaId);
        if (tolti.length === 0) throw errore('NOT_FOUND', 'This folder is not allowed to the device.');
        consensi[dispositivoId] = resto;
        /* ⛔ Owner 27/10/2026 (il nega vince, come Claude Code): se la cartella revocata resta raggiungibile — è uguale a, o sta dentro,
           un'altra cartella ancora consentita (una giunzione verso di lei, una cartella sopra) o dell'elenco esplicito — diventa
           BLOCCATA, e la risposta dice attraverso quale. Una cartella sparita dal disco non si raggiunge: si revoca e basta. */
        const vera = reale(tolti[0].percorso);
        const tramite = vera === null ? null
          : resto.map((v) => ({ v, r: reale(v.percorso) })).find(({ r }) => r !== null && dentro(vera, r))
            ?? ammessi().filter((a) => dentro(vera, a)).map((a) => ({ v: { percorso: a }, r: a }))[0] ?? null;
        if (tramite) {
          const blocchi = bloccate[dispositivoId] ?? (bloccate[dispositivoId] = []);
          if (!blocchi.some((b) => chiave(b.percorso) === chiave(vera))) blocchi.push({ percorso: vera, at: clock() });
        }
        await salvaConsensi();
        return tramite
          ? { revocata: true, bloccata: true, tramite: { cartellaId: idDi(tramite.v.percorso), nome: basename(tramite.r) || tramite.r },
            stessaCartella: chiave(vera) === chiave(tramite.r) }
          : { revocata: true }; // la forma di sempre: i campi nuovi solo quando c'è un blocco (contratto)
      });
    },

    /** Owner 27/10: toglie SOLO il blocco (la cartella non torna consentita: il consenso era stato revocato). Dal PC, con la sua carta. */
    sblocca(dispositivoId, cartellaId) {
      return inFila(async () => {
        await preparaSegreto(); await caricaConsensi();
        const lista = bloccate[dispositivoId] ?? [];
        const resto = lista.filter((b) => idDi(b.percorso) !== cartellaId);
        if (resto.length === lista.length) throw errore('NOT_FOUND', 'This folder is not blocked for the device.');
        bloccate[dispositivoId] = resto;
        await salvaConsensi();
        return { sbloccata: true };
      });
    },

    /** Dimenticare un dispositivo toglie tutti i suoi consensi e i suoi blocchi, e le sue richieste aperte si chiudono negate. */
    dimentica(dispositivoId) {
      return inFila(async () => {
        await caricaConsensi();
        for (const r of attese.values()) if (!r.esito && r.dispositivoId === dispositivoId) chiudi(r, { esito: 'negata' });
        const aveva = Boolean(consensi[dispositivoId]) || Boolean(bloccate[dispositivoId]?.length);
        delete bloccate[dispositivoId];
        if (!aveva) return { dimenticato: false };
        delete consensi[dispositivoId];
        await salvaConsensi();
        return { dimenticato: true };
      });
    },
  };
}
