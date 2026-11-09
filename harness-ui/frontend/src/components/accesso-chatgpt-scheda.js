/*
 * ⭐ Decisione 116, variante C (owner 04/11/2026; forma `FORMA-116-RINNOVO-C-2026-11-04.md`, §3 e §8) — la scheda «Accedi e riprendi»
 *   del PC, la parte che non tocca il DOM della chat:
 *   - quale scheda per quale codice del piano (`schedaPerCodice`): l'accesso che non vale più ⇒ «Accedi e riprendi»; ChatGPT che non si
 *     raggiunge per rinnovare ⇒ «Riprova». Mai un codice né «Testo del server» a schermo (lo dice la spiegazione, `errori.js`);
 *   - quando nasce dall'attrezzo del modello (`chatgpt_account` `sign_in`): la riga dell'attrezzo riuscita, chiave = `toolCallId`;
 *   - la ripresa UNA volta dopo l'accesso riuscito (`creaRipresaDopoAccesso`), solo se nessun giro è in corso; accesso annullato ⇒
 *     nessuna; due accessi ⇒ una;
 *   - le schede dei giri già passati (`creaSchedeAccesso`): restano nella storia come FRASE, senza pulsanti; i gesti valgono solo per
 *     l'ultimo giro (allineamento col telefono, Desktop 04/11 14:41). Vale dal vivo e alla rigiocata dopo un reload: il RunStarted
 *     del giro dopo la chiude, come la carta del rifiuto (FE-051).
 */

import { t } from './lingua.js';
import { creaNotaErrore } from './conversazione.js';

/**
 * La scheda nata dall'attrezzo del modello (§8; precisazione del Desktop 04/11 15:07, decisa col Mobile): la vestizione del piano
 *   («Piano ChatGPT») e i gesti, NIENTE frase — «TALOS ha provato a rinnovare…» sarebbe falsa, nessun rinnovo è stato tentato — e nessun
 *   testo nuovo. Chiave = `toolCallId`: la rigiocata non la raddoppia (chi la monta lo controlla).
 */
export function creaSchedaDallAttrezzo({ document: doc = globalThis.document, azioni = [], toolCallId = '' } = {}) {
  const nota = creaNotaErrore({ badge: t('errori.turno.vestizione.pianoChatgpt.badge'), titolo: t('errori.turno.vestizione.pianoChatgpt.titolo'), tono: 'warning',
    spiegazione: { cosa: '', rimedi: [], senzaFrase: true, senzaTestoDelServer: true } }, { document: doc, azioni });
  nota.dataset.schedaAccessoAttrezzo = String(toolCallId ?? '');
  return nota;
}

/** Il codice del piano ⇒ la scheda: `'accedi'` | `'riprova'` | `null` (gli altri codici restano la nota di sempre). */
export function schedaPerCodice(codice) {
  if (codice === 'CHATGPT_ACCESSO_NON_VALIDO' || codice === 'CHATGPT_ACCESSO_SCADUTO') return 'accedi';
  if (codice === 'CHATGPT_RETE' || codice === 'CHATGPT_RINNOVO_FALLITO') return 'riprova';
  return null;
}

/**
 * La riga dell'attrezzo che fa nascere la scheda: `chatgpt_account` con `action: "sign_in"`, riuscita (né errore né carta negata), e col
 * segno `schedaChatgpt: true` sul `ToolCallResult` (Desktop 15:31, OK di Mobile, CLI e Performance): il nucleo lo mette SOLO quando la
 * risposta «esegui» dell'ospite lo porta. «Nothing to do» con l'accesso valido (D1 di R116), un ospite che dà solo testo (la CLI) o un
 * ospite vecchio: niente segno, niente scheda.
 */
export function schedaDallAttrezzo({ nome, argomenti, fallita = false, negata = false, schedaChatgpt = false } = {}) {
  if (nome !== 'chatgpt_account' || fallita || negata || schedaChatgpt !== true) return false;
  const azione = typeof argomenti?.action === 'string' ? argomenti.action.trim().toLowerCase() : '';
  return azione === 'sign_in';
}

/**
 * La ripresa dopo l'accesso: `arma({ sessionId })` quando c'è una scheda «Accedi e riprendi» viva; `accessoRiuscito({ sessionId })` la
 * fa partire UNA volta (con `ripresaDopo: 'accesso-rifatto'`), solo per la stessa conversazione; `annulla()` quando l'accesso non è
 * riuscito o la scheda si è chiusa. Torna `true` solo se ha ripreso.
 * - D4 (R116): nessuna conversazione aperta (`sessionId` vuoto) o un'altra ⇒ nessuna ripresa, e si disarma.
 * - D5 (R116): l'accesso riesce mentre un giro è in corso ⇒ la ripresa RESTA armata e si segna l'accesso fatto; `giroFinito` (al
 *   RunFinished/RunError della stessa conversazione) la fa partire allora, una volta. Se parte prima un altro giro, il suo RunStarted
 *   chiude la scheda (`creaSchedeAccesso().giroNuovo`) e disarma: nessuna ripresa (forma §8, «solo se nessun giro è in corso»).
 */
export function creaRipresaDopoAccesso({ riprendi, giroInCorso = () => false } = {}) {
  let armata = null;
  async function prova(sessionId) {
    const presa = armata;
    if (!presa) return false;
    if (!sessionId || (presa.sessionId && presa.sessionId !== sessionId)) { armata = null; return false; }
    if (giroInCorso()) { presa.accessoFatto = true; return false; }
    armata = null; // subito: un secondo accesso, o un secondo «focus», non riprende due volte
    await riprendi('accesso-rifatto');
    return true;
  }
  return {
    arma({ sessionId = null } = {}) { armata = { sessionId, accessoFatto: false }; },
    armata() { return armata !== null; },
    annulla() { armata = null; },
    accessoRiuscito({ sessionId = null } = {}) { return prova(sessionId); },
    /** Il giro della conversazione è finito: se l'accesso era riuscito mentre correva, la ripresa parte adesso (una volta). */
    giroFinito({ sessionId = null } = {}) { return armata?.accessoFatto === true ? prova(sessionId) : Promise.resolve(false); },
  };
}

/**
 * D2 (R116; forma §3): l'esito dell'accesso si legge dallo STATO, non da un solo ritorno sulla finestra. Si rilegge `leggiStato()` a ogni
 * ritorno del fuoco e ogni `ogniMs` finché `accessoInCorso` è vero (al più `entroMs`, la vita del tentativo); quando non è più in corso
 * `alTermine(stato)` si chiama UNA volta e si smette di ascoltare. Una lettura che non riesce non decide niente: si rilegge dopo.
 * `ascoltaFuoco(fn)` aggancia e rende la funzione che stacca. Torna `{ ferma }` (un nuovo accesso ferma il vecchio).
 */
export function seguiEsitoAccesso({ leggiStato, alTermine, ascoltaFuoco = () => () => {}, ogniMs = 2_000, entroMs = 15 * 60_000,
  ora = () => Date.now(), timer = globalThis } = {}) {
  const inizio = ora();
  let finito = false;
  let inLettura = false;
  let prossimo = null;
  let stacca = () => {};
  const ferma = () => { finito = true; stacca(); if (prossimo !== null) timer.clearTimeout(prossimo); prossimo = null; };
  async function controlla() {
    if (finito || inLettura) return;
    inLettura = true;
    let stato = null;
    try { stato = await leggiStato(); } catch { stato = null; }
    inLettura = false;
    if (finito) return;
    if (stato && typeof stato === 'object' && stato.accessoInCorso !== true) { ferma(); await alTermine(stato); return; }
    if (ora() - inizio >= entroMs) { ferma(); return; }
    if (prossimo !== null) timer.clearTimeout(prossimo);
    prossimo = timer.setTimeout(() => { prossimo = null; void controlla(); }, ogniMs);
  }
  stacca = ascoltaFuoco(() => { void controlla(); }) ?? (() => {});
  prossimo = timer.setTimeout(() => { prossimo = null; void controlla(); }, ogniMs);
  return { ferma, controlla };
}

/** La scheda di un giro passato: resta la frase, i pulsanti se ne vanno (anche dal DOM: un elemento nascosto è ancora cliccabile da tastiera). */
export function chiudiSchedaAccesso(nota) {
  if (!nota) return;
  for (const riga of nota.querySelectorAll?.('.talos-system-note__azioni') ?? []) riga.remove();
  if (nota.dataset) nota.dataset.schedaAccessoChiusa = '';
}

/**
 * Le schede «Accedi e riprendi» / «Riprova» della conversazione aperta: al più una VIVA, quella dell'ultimo giro. `apri` la registra
 * (e arma la ripresa se è «Accedi»); `giroNuovo` — a ogni RunStarted, dal vivo e alla rigiocata — la chiude e disarma.
 */
export function creaSchedeAccesso({ ripresa = null } = {}) {
  let viva = null;
  const chiudi = () => {
    if (!viva) return;
    chiudiSchedaAccesso(viva.nota);
    viva = null;
    ripresa?.annulla();
  };
  return {
    apri(nota, { tipo, sessionId = null } = {}) {
      if (viva && viva.nota !== nota) chiudi();
      viva = { nota, tipo };
      if (tipo === 'accedi') ripresa?.arma({ sessionId }); else ripresa?.annulla();
    },
    giroNuovo: chiudi,
    viva() { return viva?.nota ?? null; },
    /** Cambio di conversazione: il DOM se ne va con lei, la ripresa non deve partire per un'altra. */
    dimentica() { viva = null; ripresa?.annulla(); },
  };
}
