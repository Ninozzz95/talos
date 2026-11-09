/*
 * Il BATTITO del ragionamento (Performance, 30/10/2026; forma chiusa con Desktop, CLI e Mobile, PROPOSTA-RAGIONAMENTO-E-RILETTURE
 *   «AGGIORNAMENTO A» e revisione D di eee86ca23): mentre il modello ragiona, la riga «Sta ragionando · <argomento> · 12 s».
 * ⛔ L'ARGOMENTO non si calcola qui: è `argomentoDelRagionamento` del 13/09 (`argomento-del-ragionamento.mjs`, condiviso con la
 *   pagina del PC), con le sue lezioni misurate — titolo solo se il grassetto occupa la riga intera («**407**: …» è enfasi), altrimenti
 *   l'ultima frase FINITA di almeno tre parole, mai mezza; segni di elenco e di markdown tolti. Una prima stesura di questo file aveva
 *   un doppione più debole (`titoloDelRagionamento`): ritirato su revisione del Desktop.
 * ⛔ Qui si aggiunge solo ciò che serve al FILO: segreti oscurati PRIMA del taglio (condizione della CLI: tagliata prima, una chiave a
 *   cavallo del limite perderebbe la forma e passerebbe a metà) e il limite di 60 caratteri (il pezzo `dettaglio` della riga del
 *   telefono non si accorcia, `TalosRigaInCorso.vue:64`).
 * ⛔ I casi testo → titolo sul filo stanno in `tests/fixtures/titolo-del-ragionamento.json`, FIXTURE COMUNE: la Chat del telefono
 *   (che non passa da r4 e non ha il battito) prova la stessa regola sugli stessi casi (riga COD-225 del Mobile).
 */
import { oscuraFormeDiSegreto } from '../forme-di-segreto.mjs'
import { argomentoDelRagionamento } from './argomento-del-ragionamento.mjs'

export const LUNGHEZZA_MASSIMA_DEL_TITOLO = 60
export const NOME_DEL_BATTITO = 'talos.ragionamento-in-corso'
export const INTERVALLO_DEL_BATTITO_MS = 5_000
/* l'argomento è dell'ultima parte: basta la coda del ragionamento, e un modello che manda il ragionamento grezzo (GLM: decine di
   migliaia di pezzi in un giro) non fa crescere la memoria del giro */
const CODA_DEL_RAGIONAMENTO = 16_384

/** Il titolo che viaggia nel battito: l'argomento del ragionamento, segreti oscurati, entro il limite; `null` = solo i secondi. */
export function titoloDelBattito(testo, { lunghezzaMassima = LUNGHEZZA_MASSIMA_DEL_TITOLO } = {}) {
    const argomento = argomentoDelRagionamento(testo, { massimo: Number.POSITIVE_INFINITY })
    if (argomento === null) return null
    const lettere = [...oscuraFormeDiSegreto(argomento)]
    return lettere.length > lunghezzaMassima ? `${lettere.slice(0, Math.max(1, lunghezzaMassima - 1)).join('').trimEnd()}…` : lettere.join('')
}

/*
 * Il battito (revisione D R1, OK di CLI e Mobile, 30/10 sera): `CUSTOM talos.ragionamento-in-corso { giro, at, titolo }`,
 *   calcolato UNA volta dal codice condiviso che traduce i pezzi del modello (`agent-service.mjs`, mai `server.mjs`: la CLI non ha server)
 *   e letto uguale da CLI, desktop e telefono. `titolo: null` = la riga mostra solo i secondi.
 * ⛔ Le tre condizioni della CLI: NON durevole (il registro lo consegna a chi è connesso e non lo scrive: `consegnaEvento`, elenco degli
 *   effimeri) · al più uno ogni ~5 s per giro · una riga sola, entro il limite, segreti oscurati (sopra). Il «Ha ragionato per N s»
 *   finale si ricostruisce dagli eventi di ragionamento di sempre.
 * ⛔ Il primo pezzo batte subito; poi, finché arrivano pezzi, un battito ogni 5 s anche a titolo invariato (è anche il «sto ancora
 *   ragionando» che la CLI voleva). Un timer lo manda allo scadere: un titolo nuovo non resta indietro se il riassunto tace (arriva a
 *   parti, con silenzi lunghi). Il timer non tiene vivo il processo e muore col giro: finito il ragionamento (primo testo, primo
 *   attrezzo, risposta) il giro non batte più.
 * ⛔ PERCORSO CALDO (seconda revisione D di 8a2a5e0c9, misurato col banco di Performance): `ragionamento()` gira a OGNI pezzo, e GLM ne
 *   manda decine di migliaia per giro. La prima stesura calcolava il titolo a ogni pezzo finché non cambiava e copiava fino a 16 KB a ogni
 *   pezzo: 30.000 pezzi col titolo fermo = 25.007 calcoli dell'argomento e 192 ms. Ora un pezzo costa una `push`: il titolo si calcola
 *   solo dentro `batti` (una volta ogni 5 s), e la coda si compatta solo quando supera il doppio del necessario.
 */
export function creaBattitoDelRagionamento({ emetti, ora = Date.now, intervalloMs = INTERVALLO_DEL_BATTITO_MS, imposta = setTimeout, cancella = clearTimeout, titoloFn = titoloDelBattito }) {
    const giri = new Map()
    const nuovoStato = (chiuso) => ({ pezzi: [], caratteri: 0, ultimoMs: null, timer: null, chiuso })
    const coda = (stato) => {
        const testo = stato.pezzi.join('').slice(-CODA_DEL_RAGIONAMENTO)
        stato.pezzi = [testo]
        stato.caratteri = testo.length
        return testo
    }
    const batti = (giro, stato) => {
        stato.timer = null
        stato.ultimoMs = ora()
        const titolo = titoloFn(coda(stato))
        /* un osservatore che lancia non decide il giro, e dal timer farebbe cadere il processo */
        try { emetti({ type: 'CUSTOM', name: NOME_DEL_BATTITO, value: { giro, at: new Date(stato.ultimoMs).toISOString(), titolo } }) } catch { /* il prossimo battito riprova */ }
    }
    return {
        /** Un pezzo di ragionamento del giro `giro`. */
        ragionamento(giro, delta) {
            let stato = giri.get(giro)
            if (stato?.chiuso) return
            if (!stato) { stato = nuovoStato(false); giri.set(giro, stato) }
            if (typeof delta === 'string' && delta) {
                stato.pezzi.push(delta)
                stato.caratteri += delta.length
                if (stato.caratteri > 2 * CODA_DEL_RAGIONAMENTO) coda(stato)
            }
            if (stato.ultimoMs === null) { batti(giro, stato); return }
            if (stato.timer) return
            stato.timer = imposta(() => { if (!stato.chiuso) batti(giro, stato) }, Math.max(0, stato.ultimoMs + intervalloMs - ora()))
            stato.timer?.unref?.()
        },
        /** Il giro ha smesso di ragionare: niente più battiti per lui. */
        chiudi(giro) {
            const stato = giri.get(giro)
            if (stato) { stato.chiuso = true; if (stato.timer) cancella(stato.timer); stato.timer = null; stato.pezzi = []; stato.caratteri = 0 }
            else giri.set(giro, nuovoStato(true))
        },
        /** Fine della sessione di lavoro, o cambio di fornitore (lo stesso giro può ripartire da capo e ragionare di nuovo): timer giù, memoria vuota. */
        chiudiTutti() { for (const stato of giri.values()) if (stato.timer) cancella(stato.timer); giri.clear() },
    }
}
