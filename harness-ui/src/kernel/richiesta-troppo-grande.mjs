/*
 * ⛔⛔ L'ULTIMA RICHIESTA DELLA PERSONA NON SI ACCORCIA MAI IN SILENZIO — regola N del §4.2 (decisione dell'owner del 22/10/2026, presa
 *   nella sessione della CLI: «se l'ultimo messaggio da solo non entra, niente si paga: il giro si ferma con un messaggio chiaro, il
 *   testo torna nella casella e c'è un solo pulsante "Invia come allegato"»).
 *
 * Il caso misurato dalla CLI (`review613-6/paste-overflow`): un log incollato nella richiesta nuova, più grande di quanto la finestra
 *   regga con sistema e attrezzi. Nessun riassunto può aiutare (la richiesta nuova sta nel pavimento), e la compattazione pagava lo
 *   stesso prima che il fornitore rifiutasse.
 *
 * Stato dell'arte, alla fonte (rapporto della CLI `research-overflow-0613/REPORT.md` §4.2):
 * - Kilo (`compaction-chunks.ts:81-108`) riscrive col modello il messaggio che non entra: paga, e la richiesta non è più quella della
 *   persona.
 * - Hermes (`gateway/run_turn_persistence.py:289-310`) evita il ciclo di crescita NON salvando il messaggio: la persona lo perde.
 * - gemini-cli (`AppContainer.tsx:1348-1376`) rimette il testo nella casella.
 * ⇒ One-up: il giro si ferma PRIMA di qualunque chiamata pagata con un errore tipizzato; la richiesta resta nel giornale marcata «non
 *   inviata» ed esce dalle proiezioni (la storia del giro fallito non la porta); «Invia come allegato» la manda come inizio + fine con il
 *   testo intero in un file della sessione che `leggi` apre senza chiedere — senza modello e senza perdere niente.
 *
 * ⛔ Il bersaglio prima della chiamata è la FINESTRA dichiarata (F2a della revisione 9 della CLI, 23/10/2026; prima era la linea
 *   d'emergenza, 0,90): sistema, attrezzi e richiesta nuova stanno tutti nel pavimento, e solo oltre la finestra il rifiuto è certo — fra
 *   0,90 e 1 la richiesta può entrare, e se il fornitore la rifiuta decide la strada del contesto pieno, coi suoi numeri. Senza una
 *   finestra dichiarata qui non si decide (il tetto di compattazione non è la finestra): decide il rifiuto del fornitore (pezzo C del §4).
 * ⛔ Contratto con la CLI (22/10/2026): `code: 'REQUEST_TOO_LARGE'`, dati `{ tokensRichiesta, tokensCornice, finestra, fonte }` in alto
 *   e in `messageParams`; l'evento durevole `talos.richiesta-non-inviata { at, indice }` PRIMA del RunError (agent-service);
 *   l'opzione `allegaSeTroppoGrande`. In più, additivo: `allegabile` (una richiesta con immagini o corta non si manda come allegato,
 *   e il pulsante non va offerto).
 */
import { eNotaDiTalos, eRichiestaVera, stimaConPezzi, stimaDegliAttrezzi } from './compattazione-desktop.mjs'
import { testoSemplice } from './richieste-vecchie.mjs'

export const CODICE_RICHIESTA_TROPPO_GRANDE = 'REQUEST_TOO_LARGE'
export const CHIAVE_RICHIESTA_TROPPO_GRANDE = 'server.run.requestTooLarge'
/* Sotto questa lunghezza inizio (6.000) + fine (2.000) coprono quasi tutto: l'allegato non toglierebbe niente. La stessa soglia della
   regola K (`pianoRichiesteVecchie`, `caratteriMassimi`). */
export const CARATTERI_MINIMI_PER_ALLEGARE = 9_000

const numero = (n) => Number(n).toLocaleString('en-US')

/* R13-1 (revisione 13 della CLI, 23/10/2026): sul rifiuto del fornitore ciò che porta oltre la finestra è spesso lo spazio per la risposta
   (la riserva, R11-8). Senza dirlo la frase sommava «11.005 + 11.628» contro 24.000 — una somma che entra. Con la riserva la chiave è
   l'altra, e il dato in più (`riserva`) è additivo: chi non lo conosce legge la frase di prima. */
export const CHIAVE_RICHIESTA_TROPPO_GRANDE_CON_RISPOSTA = 'server.run.requestTooLargeReply'

export class RichiestaTroppoGrande extends Error {
  constructor({ tokensRichiesta, tokensCornice, finestra, fonte = 'stima', indice = null, allegabile = false, messaggiDelGiro = null, riserva = 0 }) {
    const conRisposta = Number.isSafeInteger(riserva) && riserva > 0
    super(`Your message is about ${numero(tokensRichiesta)} tokens; with the system and tools (about ${numero(tokensCornice)})`
      + (conRisposta ? ` and room for the reply (about ${numero(riserva)})` : '')
      + ` it does not fit this model's ${numero(finestra)}-token window. `
      + (fonte === 'stima' ? 'Nothing was summarized or sent.' : 'Nothing was summarized.'))
    this.name = 'RichiestaTroppoGrande'
    this.code = CODICE_RICHIESTA_TROPPO_GRANDE
    this.dati = Object.freeze({ tokensRichiesta, tokensCornice, finestra, fonte, allegabile, ...(conRisposta ? { riserva } : {}) })
    this.chiave = conRisposta ? CHIAVE_RICHIESTA_TROPPO_GRANDE_CON_RISPOSTA : CHIAVE_RICHIESTA_TROPPO_GRANDE
    this.params = { ...this.dati }
    this.indice = indice
    /* la storia del giro SENZA la richiesta: il kernel non la sostituisce (`!Array.isArray(errore.messaggiDelGiro)`) e il registro la salva
       come storia del giro fallito — così la richiesta esce dalle proiezioni dei giri dopo */
    if (Array.isArray(messaggiDelGiro)) this.messaggiDelGiro = messaggiDelGiro
  }
}

/**
 * La richiesta NUOVA della persona: l'ultimo messaggio che non è di sistema né una nota di TALOS, se è una richiesta vera. Una richiesta
 * già seguita da una risposta o da un attrezzo non è nuova (−1): la regola N vale solo per ciò che sta per partire la prima volta.
 */
export function indiceRichiestaNuova(messaggi) {
  const lista = Array.isArray(messaggi) ? messaggi : []
  for (let i = lista.length - 1; i >= 0; i -= 1) {
    const m = lista[i]
    if (m?.role === 'system' || eNotaDiTalos(m)) continue
    return eRichiestaVera(m) ? i : -1
  }
  return -1
}

/**
 * Quanto pesano la richiesta nuova e la cornice fissa che parte con lei: i messaggi di sistema (anche gli effimeri del giro) e gli schemi
 * degli attrezzi. Le immagini a 1.500 token l'una (`stimaConPezzi`). `null` se non c'è una richiesta nuova.
 */
export function pesoDellaRichiestaNuova(messaggi, { attrezzi = [], effimeri = [] } = {}) {
  const indice = indiceRichiestaNuova(messaggi)
  if (indice === -1) return null
  const tokensRichiesta = stimaConPezzi([messaggi[indice]])
  const tokensCornice = stimaConPezzi(messaggi.filter((m) => m?.role === 'system')) + stimaConPezzi(Array.isArray(effimeri) ? effimeri : [])
    + stimaDegliAttrezzi(attrezzi)
  return { indice, tokensRichiesta, tokensCornice }
}

/** Il testo che si può mandare come allegato: solo testo (niente immagini) e abbastanza lungo perché inizio + fine tolgano qualcosa. */
export function testoAllegabile(m) {
  const testo = testoSemplice(m)
  return testo !== null && testo.length > CARATTERI_MINIMI_PER_ALLEGARE ? testo : null
}
