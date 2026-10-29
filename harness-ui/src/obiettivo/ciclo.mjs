/*
 * ⭐⭐⭐ /goal, fase G4 — IL CICLO: che cosa succede all'obiettivo dopo ogni giro. Qui solo la DECISIONE, pura (niente disco,
 * niente orologio, niente giri): chi chiama porta la verifica appena fatta, quella di prima e i fatti del giro.
 *
 * Decisioni dell'owner (14/10/2026 notte, quattro consigliate; ledger del /goal §18):
 *   · tetti di serie 20 giri (Hermes `hermes_cli/goals.py:32`) + token (il numero dalle misure del banco G7: finché non c'è,
 *     `TOKEN_MASSIMI_DI_SERIE = null`, cioè nessun tetto di token — detto, non nascosto); vale il primo che si raggiunge;
 *   · tutte le prove verdi e nessun criterio a giudizio ⇒ «fatto»; con criteri a giudizio ⇒ «fatto con N da guardare» finché la
 *     G5 non porta il giudice;
 *   · 3 giri di fila senza progresso ⇒ pausa «nessun progresso» (Orca; il «bloccato a 3» di Codex).
 * Il progresso è misurato sul mondo, non sulle parole (arXiv 2609.00006 R18: «ship the cheap caps»): cambia l'esito di una prova,
 * cambia l'uscita di una prova rossa, oppure il giro ha scritto un file con un attrezzo di scrittura.
 */

import { canonicalHash } from '../workflow/canonical-json.mjs';

/** I giri di un obiettivo, al più (Hermes `DEFAULT_MAX_TURNS = 20`, `goals.py:32`). */
export const GIRI_MASSIMI_DI_SERIE = 20;
/** I token di un obiettivo, al più. ⛔ `null` finché il banco G7 non dà la misura (owner 14/10): nessun tetto di token, e si dice. */
export const TOKEN_MASSIMI_DI_SERIE = null;
/** Giri di fila senza progresso prima della pausa (owner 14/10). */
export const GIRI_SENZA_PROGRESSO_MASSIMI = 3;

/** Il conto del ciclo dopo un giro: un giro in più, i suoi token, e i giri senza progresso (azzerati da un progresso). */
export function contoDopoIlGiro(ciclo, { token = 0, progresso }) {
  const prima = ciclo && typeof ciclo === 'object' ? ciclo : {};
  const n = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
  return {
    giri: n(prima.giri) + 1,
    token: n(prima.token) + n(token),
    senzaProgresso: progresso ? 0 : n(prima.senzaProgresso) + 1,
  };
}

/*
 * ⛔ G4-REV-01 (revisione del bugfixer, 14/10): ogni esecutore di prove stampa i TEMPI (node --test `duration_ms 212.4`, jest
 * `Time: 1.23 s`, pytest `in 0.12s`) e spesso l'ora: la coda di un rosso cambiava a ogni giro anche se non era cambiato niente, ogni
 * giro era «progresso» e la pausa dopo tre giri senza progresso non arrivava mai. Prima di confrontare si tolgono date, ore e numeri
 * con un'unità di tempo; i CONTEGGI restano (`ℹ fail 3` → `ℹ fail 2` è progresso vero).
 */
const DATA_E_ORA = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/gu;
/* un'ora, ma non la riga:colonna di un file (`a.js:12:34` è un posto nel codice, e se cambia è progresso) */
const ORA = /(?<![:\w.])\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\b/gu;
const DURATA = /\b\d+(?:[.,]\d+)?[ \t]?(?:ns|µs|μs|us|ms|s|sec|secs|seconds?|m|min|mins|minutes?|h|hrs?|hours?)\b/giu;
const DOPO_UNA_PAROLA_DI_TEMPO = /\b(duration(?:_ms)?|elapsed|time|took|durata)(\W{0,6})\d+(?:[.,]\d+)?/giu;
/*
 * ⛔ G4-REV-06 (seconda revisione, 14/10): non solo i tempi cambiano a ogni esecuzione. Anche un percorso sotto una cartella
 * TEMPORANEA (`mkdtemp`: `…\Temp\talos-g4-AbC123\out.json`, `/tmp/x-9f2k`), una PORTA d'ascolto (`127.0.0.1:53412`, `port 61022`),
 * un SEME (`Seed: 1844674`) e un PID. ⛔ Limite dichiarato: un altro valore casuale stampato dalle prove (un id, un hash) resta
 * «progresso»; il tetto dei 20 giri resta la rete sotto.
 */
const PERCORSO_TEMPORANEO = /(?:[A-Za-z]:\\[^\s'"`]*?\\(?:temp|tmp)\\|\/(?:tmp|var\/folders|private\/var\/folders)\/)[^\s'"`]*/giu;
const PORTA = /\b(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[::1?\]|::1?)(:)\d{2,5}\b/giu;
const PAROLA_CON_NUMERO_CASUALE = /\b(port|seed|pid)(\W{0,3})\d+\b/giu;
/* ⛔ G4-REV-08 (terza revisione, 14/10): il caso COMUNE del limite dichiarato — pytest stampa l'indirizzo dell'oggetto in ogni
   asserzione fallita (`<User object at 0x7f3b2c1d9e50>`), e molti servizi un UUID per richiesta. Si tolgono anche loro (un
   indirizzo ha almeno 6 cifre esadecimali: `0xff` di un valore atteso resta). */
const INDIRIZZO = /\b0x[0-9a-f]{6,}\b/giu;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
export function codaSenzaTempi(coda) {
  if (typeof coda !== 'string') return coda ?? null;
  return coda.replace(PERCORSO_TEMPORANEO, '<tmp>').replace(UUID, '<uuid>').replace(INDIRIZZO, '<0x>').replace(PORTA, '$1$2<porta>').replace(PAROLA_CON_NUMERO_CASUALE, '$1$2<n>')
    .replace(DATA_E_ORA, '<data>').replace(DOPO_UNA_PAROLA_DI_TEMPO, '$1$2<n>').replace(DURATA, '<durata>').replace(ORA, '<ora>');
}
/* L'impronta di ciò che una verifica dice di ogni criterio: l'esito e, per i rossi, l'uscita senza i tempi. */
function improntaDegliEsiti(verifica) {
  return new Map((verifica?.verdetti ?? []).map((v) => [`${v.id}#${v.impronta ?? ''}`, canonicalHash({ esito: v.esito, coda: v.esito === 'rosso' ? codaSenzaTempi(v.uscita?.coda ?? null) : null, motivo: v.motivo?.tipo ?? null })]));
}
/* I motivi di «non verificabile» che il MODELLO non può cambiare lavorando: rimandarlo a sistemarli spende giri per niente
   (G4-REV-04). `command-not-found` e `could-not-run` restano fuori: uno script mancante il modello può scriverlo. */
const FUORI_DAL_MODELLO = new Set(['workspace-missing', 'workspace-not-here', 'plan-mode', 'permission-denied', 'permission-needed', 'stopped', 'folder-blocked']);

/**
 * C'è stato progresso fra la verifica di prima e quella di adesso? Sì se il giro ha scritto file, se un criterio ha cambiato
 * esito o (da rosso) uscita, o se c'è un criterio nuovo. Senza una verifica di prima (il primo giro) è sempre progresso: non si
 * ferma un obiettivo appena nato.
 */
export function ceProgresso(prima, dopo, { scritture = 0 } = {}) {
  if (Number.isSafeInteger(scritture) && scritture > 0) return true;
  if (!prima?.verdetti) return true;
  const a = improntaDegliEsiti(prima);
  for (const [chiave, impronta] of improntaDegliEsiti(dopo)) if (a.get(chiave) !== impronta) return true;
  return false;
}

/**
 * Che cosa fa il ciclo dopo un giro e la sua verifica.
 * @param {{ obiettivo: object, verifica: object, ciclo: {giri:number, token:number, senzaProgresso:number},
 *   tetti?: {giri?: number|null, token?: number|null} }} dati
 * @returns {{ azione: 'fatto', daGuardare: number } | { azione: 'tetto', tipo: 'giri'|'token' }
 *   | { azione: 'pausa', tipo: 'nessun-progresso'|'da-giudicare'|'non-verificabile'|'giudice-guasto', dettaglio?: string } | { azione: 'fermo' }
 *   | { azione: 'continua' }}
 *   `fermo` = l'obiettivo non è (più) attivo: la verifica l'ha messo in pausa (`prove-rosse`) o qualcuno l'ha fermato.
 */
/**
 * G5c — la decisione per un obiettivo SENZA contratto (il pavimento): niente prove a comando, solo il giudizio del testo
 * (`giudizioDelTesto`). Verde ⇒ «fatto» (poi il confutatore, come per ogni «fatto»); giudice guasto ⇒ pausa; altrimenti i tetti e il
 * progresso della G4, poi «continua».
 * @param {{ obiettivo: object, ciclo: {giri:number, token:number, senzaProgresso:number}, tetti?: object, giudice?: {guasto:string}|null }} dati
 */
export function decidiSenzaContratto({ obiettivo, ciclo, tetti = {}, giudice = null }) {
  if (obiettivo?.stato !== 'attivo') return { azione: 'fermo' };
  if (giudice?.guasto) return { azione: 'pausa', tipo: 'giudice-guasto', dettaglio: giudice.guasto };
  if (obiettivo.giudizioDelTesto?.esito === 'verde') return { azione: 'fatto', daGuardare: 0 };
  const giriMassimi = tetti.giri === undefined ? GIRI_MASSIMI_DI_SERIE : tetti.giri;
  const tokenMassimi = tetti.token === undefined ? TOKEN_MASSIMI_DI_SERIE : tetti.token;
  if (Number.isSafeInteger(giriMassimi) && ciclo.giri >= giriMassimi) return { azione: 'tetto', tipo: 'giri' };
  if (Number.isSafeInteger(tokenMassimi) && ciclo.token >= tokenMassimi) return { azione: 'tetto', tipo: 'token' };
  if (ciclo.senzaProgresso >= GIRI_SENZA_PROGRESSO_MASSIMI) return { azione: 'pausa', tipo: 'nessun-progresso' };
  return { azione: 'continua' };
}

export function decidiDopoIlGiro({ obiettivo, verifica, ciclo, tetti = {}, giudice = null }) {
  if (obiettivo?.stato !== 'attivo') return { azione: 'fermo' };
  const verdetti = verifica?.verdetti ?? [];
  const daProvare = verdetti.filter((v) => v.esito !== 'da-giudicare');
  /* G5: il giudice c'era ma non è arrivato a un giudizio (3 risposte illeggibili o 5 guasti di trasporto di fila, Hermes
     `goals.py:43,46`) ⇒ pausa col suo motivo, MAI «fatto con N da guardare» (ZCode fallisce aperto: il verso sbagliato) */
  if (giudice?.guasto && verdetti.some((v) => v.esito === 'da-giudicare')) return { azione: 'pausa', tipo: 'giudice-guasto', dettaglio: giudice.guasto };
  /* ⛔ G4-REV-02 (owner 14/10 notte, consigliata): «tutte le prove verdi» è vero A VUOTO quando le prove sono zero. Un contratto di
     soli giudizi non diventa «fatto»: pausa «da giudicare», decide la persona finché la G5 non porta il giudice (Hermes non fa mai
     «done» a vuoto: `hermes_cli/goals.py:114-169`). */
  if (verdetti.length > 0 && daProvare.length === 0) return { azione: 'pausa', tipo: 'da-giudicare' };
  // ⛔ «fatto» vuole TUTTE le prove verdi: un «non verificabile» non è un sì (piano G3)
  if (verdetti.length > 0 && daProvare.every((v) => v.esito === 'verde')) return { azione: 'fatto', daGuardare: verdetti.length - daProvare.length };
  /* G4-REV-04: nessun rosso, e ciò che resta non si può verificare per un motivo che il modello non può cambiare (permesso, Piano,
     cartella non qui) ⇒ pausa subito col motivo: rimandarlo spenderebbe giri pagati per niente */
  const bloccati = daProvare.filter((v) => v.esito === 'non-verificabile' && FUORI_DAL_MODELLO.has(v.motivo?.tipo));
  if (bloccati.length > 0 && daProvare.every((v) => v.esito === 'verde' || bloccati.includes(v))) return { azione: 'pausa', tipo: 'non-verificabile', dettaglio: bloccati[0].motivo.tipo };
  const giriMassimi = tetti.giri === undefined ? GIRI_MASSIMI_DI_SERIE : tetti.giri;
  const tokenMassimi = tetti.token === undefined ? TOKEN_MASSIMI_DI_SERIE : tetti.token;
  if (Number.isSafeInteger(giriMassimi) && ciclo.giri >= giriMassimi) return { azione: 'tetto', tipo: 'giri' };
  if (Number.isSafeInteger(tokenMassimi) && ciclo.token >= tokenMassimi) return { azione: 'tetto', tipo: 'token' };
  if (ciclo.senzaProgresso >= GIRI_SENZA_PROGRESSO_MASSIMI) return { azione: 'pausa', tipo: 'nessun-progresso' };
  return { azione: 'continua' };
}
