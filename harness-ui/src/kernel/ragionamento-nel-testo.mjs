/**
 * L1 del motore locale (owner 20/10/2026): il ragionamento che il modello scrive DENTRO il testo.
 *
 * ⛔ Misurato sulla sessione vera `e00ae242` (LFM2.5-24B-A2B, llama-server b10517): il modello ragiona DUE volte. Il primo
 *   blocco il server lo separa bene (`reasoning_content`, 128 pezzi); il secondo arriva in `delta.content` come
 *   `"<think>"`, `"The"`, … `"</think>"` — pezzi separati — e finiva a schermo e nella storia mandata al giro dopo.
 *   Il parser di llama.cpp riconosce i segmenti di ragionamento per il formato del modello che conosce; un template più
 *   nuovo del motore (LFM2.5 è del 13/10, b10517 del 20/08) passa da lì scoperto. ⇒ Questa è la seconda delle tre difese:
 *   server (`--reasoning-format`), kernel (qui), controllo del template al caricamento.
 *
 * Forma presa da Hermes, `agent/think_scrubber.py` (clone `65ad529`, 23/09/2026): un solo elenco di nomi
 * (`think_scrubber.py:23-28`), confronto senza maiuscole, un tag spezzato fra due delta tenuto da parte finché non si sa
 * (`:114-118`). ⛔ Ma PIÙ STRETTO di Hermes, sui tre vincoli chiesti dalla CLI il 20/10 (Hermes toglie una coppia chiusa
 * OVUNQUE, `:89-99`, e butta un blocco mai chiuso, `:120-129`):
 *   1. un blocco si toglie SOLO in apertura della risposta (prima, solo spazi) o subito dopo un altro blocco: un `<think>`
 *      scritto più avanti — un modello che spiega i tag, scrive XML, HTML o un prompt — resta testo, byte per byte;
 *   2. quindi mai dentro un blocco di codice: per arrivarci serve un testo non vuoto prima, e lì il filtro è già spento;
 *   3. un blocco aperto e mai chiuso a fine risposta NON fa sparire il resto: `chiudi()` lo restituisce come testo, col tag
 *      d'apertura, e lo dice (`nonChiuso`). Una risposta tagliata a metà ragionamento resta leggibile, invece di vuota.
 * ⭐ Diverso da Hermes anche qui: lì il testo nascosto si perde; `scrivi` restituisce le due parti, così il chiamante lo
 *   manda al riquadro del ragionamento quando il fornitore non ne ha dato uno nativo (`stream_delivery.py:55-56`, #89647).
 */

export const NOMI_DEL_RAGIONAMENTO = Object.freeze(['think', 'thinking', 'reasoning', 'thought', 'reasoning_scratchpad', '思考', '反思', '推理', '推敲'])
const APERTURE = NOMI_DEL_RAGIONAMENTO.map((nome) => `<${nome}>`)

/** Lo spazio iniziale di `testo` (spazi, tabulazioni, a capo). */
const spazioIniziale = (testo) => /^[ \t\r\n]*/u.exec(testo)[0]

/*
 * ⛔ Revisione avversaria del 20/10 (D1): MAI un indice trovato su `testo.toLowerCase()` usato per tagliare `testo`. «İ» (U+0130)
 *   diventa «i̇», due unità invece di una, e il taglio scivolava: `<think>İstanbul</think>Answer` dava il testo `nswer`.
 *   ⇒ Si confronta un PEZZO dell'originale lungo quanto il tag (`iniziaCon`), e la chiusura si cerca con una regex `i` SENZA `u`:
 *   in quel modo un carattere oltre l'ASCII non si piega mai su una lettera ASCII (ECMA-262, Canonicalize: «If … cu's code unit
 *   value ≥ 128 and … < 128, return ch»), quindi solo i tag veri, in qualunque maiuscola, e l'indice è quello dell'originale.
 *   Per l'apertura vale lo stesso: si piegano SOLO le maiuscole ASCII. `toLowerCase()` piega anche il segno Kelvin (U+212A) su
 *   «k», e `<thinK>` passava per `<think>` (trovato dal mutante sopravvissuto della seconda revisione).
 */
const minuscoleAscii = (testo) => testo.replace(/[A-Z]/gu, (c) => c.toLowerCase())
const iniziaCon = (testo, tag) => testo.length >= tag.length && minuscoleAscii(testo.slice(0, tag.length)) === tag
const potrebbeEssereInizioDi = (testo, tag) => testo.length < tag.length && tag.startsWith(minuscoleAscii(testo))
const escapeRegex = (testo) => testo.replace(/[.*+?^${}()|[\]\\]/gu, (c) => `\\${c}`)

/**
 * Il filtro per un flusso: `scrivi(delta)` → `{ testo, ragionamento }`; `chiudi()` → `{ testo, nonChiuso, daRitirare }`, il testo
 * rimasto da parte. Uno per risposta: lo stato non passa da una risposta all'altra.
 */
export function creaFiltroRagionamentoNelTesto() {
    let fase = 'inizio' // 'inizio' (in apertura o dopo un blocco) · 'dentro' (dentro un blocco) · 'testo' (filtro spento)
    let daParte = ''
    let spazioSospeso = '' // D2: lo spazio in apertura aspetta di sapere se dopo arriva testo vero
    let blocchiTolti = 0
    let chiusura = ''
    let cercaChiusura = null
    let aperturaVista = ''
    let ragionamentoDelBlocco = ''

    function scrivi(delta) {
        if (typeof delta !== 'string' || delta === '') return { testo: '', ragionamento: '' }
        if (fase === 'testo') return { testo: delta, ragionamento: '' }
        let resto = daParte + delta
        daParte = ''
        let testo = ''
        let ragionamento = ''
        while (resto) {
            if (fase === 'testo') { testo += resto; break }
            if (fase === 'inizio') {
                const spazio = spazioIniziale(resto)
                spazioSospeso += spazio
                resto = resto.slice(spazio.length)
                if (!resto) break
                const tag = APERTURE.find((t) => iniziaCon(resto, t))
                if (tag) {
                    aperturaVista = resto.slice(0, tag.length)
                    chiusura = `</${tag.slice(1)}`
                    cercaChiusura = new RegExp(escapeRegex(chiusura), 'i')
                    ragionamentoDelBlocco = ''
                    fase = 'dentro'
                    resto = resto.slice(tag.length)
                    continue
                }
                if (APERTURE.some((t) => potrebbeEssereInizioDi(resto, t))) { daParte = resto; break }
                // Testo vero: lo spazio tenuto da parte esce davanti a lui, e da qui il filtro è spento.
                testo += spazioSospeso
                spazioSospeso = ''
                fase = 'testo'
                continue
            }
            // dentro: si cerca SOLO la chiusura del tag che ha aperto, sull'originale
            const trovata = cercaChiusura.exec(resto)
            if (!trovata) {
                let n = Math.min(resto.length, chiusura.length - 1)
                while (n > 0 && !potrebbeEssereInizioDi(resto.slice(-n), chiusura)) n -= 1
                const pezzo = n ? resto.slice(0, -n) : resto
                daParte = n ? resto.slice(-n) : ''
                ragionamento += pezzo
                ragionamentoDelBlocco += pezzo
                break
            }
            ragionamento += resto.slice(0, trovata.index)
            resto = resto.slice(trovata.index + trovata[0].length)
            blocchiTolti += 1
            fase = 'inizio'
        }
        return { testo, ragionamento }
    }

    function chiudi() {
        const coda = daParte
        const spazio = spazioSospeso
        daParte = ''
        spazioSospeso = ''
        if (fase === 'dentro') {
            fase = 'testo'
            // `daRitirare`: la parte già data come ragionamento da `scrivi`, che ora torna testo e non va contata due volte.
            return { testo: spazio + aperturaVista + ragionamentoDelBlocco + coda, nonChiuso: true, daRitirare: ragionamentoDelBlocco }
        }
        fase = 'testo'
        // D2: una risposta fatta SOLO di blocchi (e a capo) è vuota, come per Hermes (`chat_completion_helpers.py:3673`, «think-only»).
        // Senza nessun blocco tolto, lo spazio torna com'era: un testo legittimo di soli spazi passa identico.
        if (!coda && blocchiTolti > 0) return { testo: '', nonChiuso: false, daRitirare: '' }
        return { testo: spazio + coda, nonChiuso: false, daRitirare: '' }
    }

    return { scrivi, chiudi }
}

/** Lo stesso filtro su un testo intero (risposta non in streaming, o un messaggio già completo). */
export function separaRagionamentoNelTesto(testo) {
    if (typeof testo !== 'string' || testo === '') return { testo, ragionamento: '', nonChiuso: false }
    const filtro = creaFiltroRagionamentoNelTesto()
    const parte = filtro.scrivi(testo)
    const coda = filtro.chiudi()
    // Un blocco mai chiuso torna testo per intero: il suo ragionamento non va contato due volte.
    if (coda.nonChiuso) return { testo: parte.testo + coda.testo, ragionamento: parte.ragionamento.slice(0, parte.ragionamento.length - coda.daRitirare.length), nonChiuso: true }
    return { testo: parte.testo + coda.testo, ragionamento: parte.ragionamento, nonChiuso: false }
}
