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
  fileConsensi, fileSegreto, sessionRegistry = null, cartelleAmmesse = [], cartelleEscluse = [],
  /* Parità, punto 4 (owner 23/10/2026, terza tornata; contratto Parte 4 d'accordo col Mobile il 24/10): la cartella di serie della
     Chat dei dispositivi sul PC, nei dati di TALOS. È l'UNICA eccezione a `cartelleEscluse` (esattamente lei, niente sopra o accanto),
     non sta mai nell'elenco del Codice (`elenco`, così i dispositivi già usciti non la vedono) e si chiede con `chat.folder`.
     Claude Code dal telefono fa scegliere ogni volta una cartella (annuncio del 21/08/2026): qui la Chat ne ha una sua, consentita
     una volta. */
  cartellaChat = null,
  fs = fsp, realpath = (p) => realpathSync.native(p), stat = statSync, clock = () => Date.now(), casuale = (n) => randomBytes(n),
  /* R2.1 (24/10/2026): il timer della scadenza di una richiesta — `(fn, ms) → toglie()`. Le prove lo sostituiscono per scadere a comando. */
  programma = (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return () => clearTimeout(t); },
} = {}) {
  if (typeof fileConsensi !== 'string' || !fileConsensi || typeof fileSegreto !== 'string' || !fileSegreto) {
    throw errore('REMOTE_FOLDERS_FILE', 'The device folders need their data files.');
  }
  let segreto = null;
  let consensi = null; // { [dispositivoId]: [{ percorso, at, da }] }
  let sessioniChat = {}; // Parte 4: { [sessionId]: { dispositivoId, at } } — chi ha aperto una sessione nella cartella della Chat
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

  const inFila = (lavoro) => {
    const prossimo = coda.then(lavoro, lavoro);
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
  const caricaConsensi = async () => {
    if (consensi) return consensi;
    let grezzo = null;
    try { grezzo = await fs.readFile(fileConsensi, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
    let dati = null;
    if (grezzo != null) {
      /* Un file illeggibile non si legge come vuoto (si perderebbero le revoche alla prima scrittura): si dice. */
      try { dati = JSON.parse(grezzo); } catch { throw errore('REMOTE_CONSENTS_UNREADABLE', 'The folders allowed to devices cannot be read.'); }
    }
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
    return consensi;
  };
  const salvaConsensi = () => scriviAtomico(fileConsensi, JSON.stringify({ v: VERSIONE, dispositivi: consensi,
    ...(Object.keys(sessioniChat).length ? { sessioniChat } : {}) }, null, 1));

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
  const consentitaReale = (dispositivoId, percorsoReale) => {
    if (!percorsoReale || escluso(percorsoReale)) return false;
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
  });
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
      sessioniChat[sessionId] = { dispositivoId, at: clock() };
      const voci = Object.entries(sessioniChat);
      if (voci.length > 2000) for (const [id] of voci.sort((a, b) => a[1].at - b[1].at).slice(0, voci.length - 2000)) delete sessioniChat[id];
      void inFila(() => salvaConsensi()).catch(() => {});
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
      return inFila(async () => {
        scadute();
        const r = attese.get(richiestaId);
        if (!r || r.esito || (r.inRisposta && !mia)) throw errore('CONSENT_NOT_PENDING', 'This request is no longer waiting.');
        try {
          if (esito !== 'consentita') { chiudi(r, { esito: 'negata' }); return r.esito; }
          await caricaConsensi();
          const lista = consensi[r.dispositivoId] ?? (consensi[r.dispositivoId] = []);
          if (!lista.some((v) => chiave(v.percorso) === chiave(r.percorso))) lista.push({ percorso: r.percorso, at: clock(), da: 'domanda' });
          await salvaConsensi();
          let sessionId = null;
          let erroreAvvio = null;
          if (typeof r.avvio === 'function') {
            try { sessionId = (await r.avvio()) ?? null; } catch (e) { erroreAvvio = e?.code ?? 'START_FAILED'; }
          }
          chiudi(r, { esito: 'consentita', ...(sessionId ? { sessionId } : {}), ...(erroreAvvio ? { erroreAvvio } : {}) });
          return r.esito;
        } finally {
          /* una risposta fallita (il salvataggio del consenso) rimette la richiesta nelle mani della scadenza */
          r.inRisposta = false;
          if (!r.esito) scadute();
        }
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
        const lista = consensi[dispositivoId] ?? (consensi[dispositivoId] = []);
        if (!lista.some((v) => chiave(v.percorso) === chiave(r))) lista.push({ percorso: r, at: clock(), da: da === 'chat' ? 'chat' : 'anticipo' });
        await salvaConsensi();
        return { cartellaId: idDi(r), nome: basename(r) || r };
      });
    },

    /** Le cartelle consentite a un dispositivo, per la finestra del PC (il percorso intero solo qui) e per l'attrezzo del modello. */
    async consensiDi(dispositivoId) {
      await preparaSegreto(); await caricaConsensi();
      return (consensi[dispositivoId] ?? []).map((v) => ({ cartellaId: idDi(v.percorso), nome: basename(v.percorso) || v.percorso, percorso: v.percorso,
        consentitaAlle: v.at ? new Date(v.at).toISOString() : null, da: v.da, esiste: reale(v.percorso) !== null }));
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
      const v = (consensi[dispositivoId] ?? []).find((x) => idDi(x.percorso) === cartellaOPercorso
        || (isAbsolute(cartellaOPercorso) && chiave(x.percorso) === chiave(cartellaOPercorso)));
      return v ? { cartellaId: idDi(v.percorso), nome: basename(v.percorso) || v.percorso, percorso: v.percorso } : null;
    },

    /** Revoca una cartella a un dispositivo: vale subito, anche per le sessioni aperte (il controllo si fa a ogni scrittura). */
    revoca(dispositivoId, cartellaId) {
      return inFila(async () => {
        await preparaSegreto(); await caricaConsensi();
        const lista = consensi[dispositivoId] ?? [];
        const resto = lista.filter((v) => idDi(v.percorso) !== cartellaId);
        if (resto.length === lista.length) throw errore('NOT_FOUND', 'This folder is not allowed to the device.');
        consensi[dispositivoId] = resto;
        await salvaConsensi();
        return { revocata: true };
      });
    },

    /** Dimenticare un dispositivo toglie tutti i suoi consensi, e le sue richieste aperte si chiudono negate. */
    dimentica(dispositivoId) {
      return inFila(async () => {
        await caricaConsensi();
        for (const r of attese.values()) if (!r.esito && r.dispositivoId === dispositivoId) chiudi(r, { esito: 'negata' });
        if (!consensi[dispositivoId]) return { dimenticato: false };
        delete consensi[dispositivoId];
        await salvaConsensi();
        return { dimenticato: true };
      });
    },
  };
}
