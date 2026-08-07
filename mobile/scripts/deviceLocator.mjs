/**
 * Trovare un comando sullo schermo, con la stessa severità di Playwright.
 *
 * ## Perché è stato riscritto
 *
 * La prima versione indovinava due volte: prendeva **il più piccolo** fra i
 * candidati, e se il bersaglio conteneva un campo di testo mirava quello. Due
 * euristiche, e sul Pad hanno sbagliato entrambe — un tocco finito sui chip del
 * modello invece che sul campo, perché il centro di un contenitore grande non è
 * il suo comando.
 *
 * Indovinare non è localizzare. Playwright non indovina: fa **cinque controlli**
 * e in caso di ambiguità **fallisce dicendolo**, invece di scegliere per te.
 * Qui sono implementati gli stessi, con le definizioni della loro
 * documentazione (playwright.dev/docs/actionability):
 *
 * 1. **Visibile** — riquadro non vuoto e niente `visibility: hidden`.
 *    `opacity: 0` conta come visibile: è la loro definizione, e ha senso —
 *    un elemento trasparente riceve i tocchi lo stesso.
 * 2. **Stabile** — stesso riquadro per **due fotogrammi consecutivi**. Serve
 *    contro le animazioni: mirare un bersaglio che si sta muovendo è mirare
 *    dove era.
 * 3. **Riceve gli eventi** — `elementFromPoint` sul punto d'azione restituisce
 *    proprio lui o un suo discendente. È il controllo che manca a chiunque usi
 *    solo le coordinate: se sopra c'è una tendina, il tocco va alla tendina.
 * 4. **Abilitato** — niente `[disabled]`, niente `<fieldset disabled>`, niente
 *    `[aria-disabled=true]` sopra di lui.
 * 5. **Modificabile** — solo per chi deve ricevere testo: niente `[readonly]`.
 *
 * ## E la modalità STRETTA
 *
 * Se il criterio corrisponde a più di un elemento **non si sceglie**: si
 * fallisce elencandoli. È il contrario di quello che facevo, ed è la ragione
 * per cui i framework seri lo fanno — un test che tocca «uno dei tre» passa
 * finché un giorno tocca quello sbagliato, e nessuno capisce perché.
 *
 * ## ⛔ Il limite: quello che CDP non può vedere
 *
 * Il controllo del bersaglio legge il DOM, quindi copre l'occlusione **dentro
 * l'app**. Una finestra flottante di un'ALTRA app — misurato il 2026-08-07 con
 * **Whisper**, un trascrittore di terze parti — sta sopra tutto, non compare in
 * nessun DOM, e si prende il tocco.
 *
 * Non c'è modo di accorgersene da qui. Ciò che si può fare, e che `fill` fa, è
 * **rileggere il risultato**: se dopo l'azione il campo non contiene quello che
 * ho scritto, qualcosa si è messo in mezzo e ci si ferma. Vale la stessa
 * regola di sempre — l'esito, non la chiamata.
 *
 * ## Il punto d'azione
 *
 * Il centro dell'**intersezione fra il riquadro e lo schermo**, non il centro
 * del riquadro: un elemento per metà fuori vista ha il centro fuori vista, e
 * toccare lì è toccare il nulla. È la definizione di *in-view center point*
 * della specifica WebDriver.
 */

/** Il codice che gira DENTRO la pagina. Una stringa, perché viaggia via CDP. */
export const LOCALIZZA = (criterio) => `
(async () => {
    const criterio = ${JSON.stringify(criterio)}
    const rapporto = window.devicePixelRatio || 1

    const visibile = (elemento) => {
        const r = elemento.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return false
        const stile = getComputedStyle(elemento)
        // Definizione di Playwright: \`opacity: 0\` E' visibile. Un elemento
        // trasparente riceve i tocchi lo stesso, quindi escluderlo mentirebbe.
        return stile.visibility !== 'hidden' && stile.display !== 'none'
    }

    const abilitato = (elemento) => {
        if (elemento.closest('[aria-disabled="true"]')) return false
        if (elemento.disabled === true) return false
        const insieme = elemento.closest('fieldset[disabled]')
        if (insieme && !elemento.closest('fieldset[disabled] > legend:first-of-type')) return false
        return true
    }

    const modificabile = (elemento) => (
        abilitato(elemento)
        && elemento.readOnly !== true
        && elemento.getAttribute('aria-readonly') !== 'true'
    )

    /** Il centro dell'INTERSEZIONE col viewport, non il centro del riquadro. */
    const punto = (elemento) => {
        const r = elemento.getBoundingClientRect()
        const sinistra = Math.max(r.left, 0)
        const destra = Math.min(r.right, window.innerWidth)
        const alto = Math.max(r.top, 0)
        const basso = Math.min(r.bottom, window.innerHeight)
        if (destra <= sinistra || basso <= alto) return null
        return { x: (sinistra + destra) / 2, y: (alto + basso) / 2 }
    }

    const fotogramma = () => new Promise((r) => requestAnimationFrame(() => r()))

    /** L'altezza utile: con la tastiera aperta NON e' \`innerHeight\`. */
    const altezzaUtile = () => Math.round(
        (window.visualViewport && window.visualViewport.height) || window.innerHeight,
    )

    /**
     * ⛔ Il riquadro fermo NON basta. Playwright confronta due fotogrammi
     * consecutivi, che coprono un'animazione CSS; la TASTIERA di Android e' un
     * altro ordine di grandezza — scorre per ~300 ms, cioe' una ventina di
     * fotogrammi — e in quel tempo il riquadro puo' essere gia' fermo mentre il
     * layout sta ancora salendo.
     *
     * Successo il 2026-08-07: il tocco su «Invia messaggio» e' partito verso
     * coordinate giuste al momento della localizzazione e arrivato, un decimo
     * di secondo dopo, su quello che nel frattempo occupava quel punto.
     *
     * Quindi si guarda anche l'ALTEZZA UTILE: finche' cambia, il layout si sta
     * muovendo, e non importa quanto sia fermo il singolo riquadro.
     */
    const stabile = async (elemento) => {
        const primo = elemento.getBoundingClientRect()
        const primaAltezza = altezzaUtile()
        await fotogramma()
        await fotogramma()
        const secondo = elemento.getBoundingClientRect()
        return primo.x === secondo.x && primo.y === secondo.y
            && primo.width === secondo.width && primo.height === secondo.height
            && primaAltezza === altezzaUtile()
    }

    const etichettaDi = (elemento) => (
        elemento.getAttribute('aria-label')
        || elemento.innerText
        || elemento.value
        || elemento.getAttribute('placeholder')
        || elemento.tagName
    ).trim().replace(/\\s+/g, ' ').slice(0, 60)

    // ── I candidati
    let candidati
    if (criterio.selettore) {
        candidati = [...document.querySelectorAll(criterio.selettore)]
    } else {
        const cercato = (criterio.testo || '').trim().toLowerCase()
        const tutti = [...document.querySelectorAll(
            'button, a, [role=button], [role=option], [role=tab], [role=switch], input, textarea, [contenteditable="true"], [data-testid]'
        )]
        candidati = tutti.filter((elemento) => {
            const suo = (elemento.getAttribute('aria-label') || elemento.innerText
                || elemento.value || elemento.getAttribute('placeholder') || '')
                .trim().toLowerCase()
            if (!suo.includes(cercato)) return false
            // ⛔ Il piu' INTERNO fra quelli che contengono il testo, non il piu'
            // piccolo: se un antenato corrisponde solo perche' contiene questo,
            // non e' un candidato — e' il contenitore.
            return !tutti.some((altro) => altro !== elemento && elemento.contains(altro)
                && ((altro.getAttribute('aria-label') || altro.innerText || altro.value
                    || altro.getAttribute('placeholder') || '').trim().toLowerCase().includes(cercato)))
        })
    }

    const visibili = candidati.filter(visibile)
    if (visibili.length === 0) {
        return { esito: 'assente', quanti: candidati.length }
    }
    // ⛔ MODALITA' STRETTA: piu' di uno non si sceglie, si dice.
    if (visibili.length > 1 && criterio.indice === undefined) {
        return {
            esito: 'ambiguo',
            quanti: visibili.length,
            candidati: visibili.slice(0, 8).map((elemento) => ({
                etichetta: etichettaDi(elemento),
                testid: elemento.getAttribute('data-testid') || '',
            })),
        }
    }
    const scelto = visibili[criterio.indice ?? 0]
    if (!scelto) return { esito: 'assente', quanti: visibili.length }

    scelto.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    await fotogramma()

    if (!abilitato(scelto)) return { esito: 'disabilitato', etichetta: etichettaDi(scelto) }
    if (criterio.perScrivere && !modificabile(scelto)) {
        return { esito: 'non-modificabile', etichetta: etichettaDi(scelto) }
    }
    if (!(await stabile(scelto))) return { esito: 'in-movimento', etichetta: etichettaDi(scelto) }

    const p = punto(scelto)
    if (!p) return { esito: 'fuori-vista', etichetta: etichettaDi(scelto) }

    // ⛔ Il controllo che manca a chi usa solo le coordinate.
    const colpito = document.elementFromPoint(p.x, p.y)
    const suo = colpito === scelto || scelto.contains(colpito) || (colpito && colpito.contains(scelto))
    if (!suo) {
        return {
            esito: 'coperto',
            etichetta: etichettaDi(scelto),
            copertoDa: colpito ? etichettaDi(colpito) : 'niente',
        }
    }

    return {
        esito: 'pronto',
        x: Math.round(p.x * rapporto),
        y: Math.round(p.y * rapporto),
        etichetta: etichettaDi(scelto),
    }
})()`

/** Le frasi, in una lingua che si legge. Il codice interno resta nel codice. */
export function spiega(risultato, criterio) {
    const cosa = criterio.selettore ?? `«${criterio.testo}»`
    switch (risultato?.esito) {
        case 'assente':
            return `${cosa}: non c'è niente di visibile che corrisponda`
                + (risultato.quanti ? ` (${risultato.quanti} nel DOM, ma nascosti)` : '')
        case 'ambiguo':
            return `${cosa}: corrisponde a ${risultato.quanti} elementi, e non scelgo io.\n`
                + risultato.candidati.map((riga, indice) =>
                    `  [${indice}] ${riga.testid ? `[${riga.testid}] ` : ''}${riga.etichetta}`).join('\n')
                + `\nUsa --sel con un data-testid, oppure --nth <numero>.`
        case 'disabilitato':
            return `${cosa}: «${risultato.etichetta}» è disabilitato`
        case 'non-modificabile':
            return `${cosa}: «${risultato.etichetta}» non accetta testo`
        case 'in-movimento':
            return `${cosa}: «${risultato.etichetta}» si sta ancora muovendo`
        case 'fuori-vista':
            return `${cosa}: «${risultato.etichetta}» è fuori dallo schermo`
        case 'coperto':
            return `${cosa}: «${risultato.etichetta}» è coperto da «${risultato.copertoDa}»`
        default:
            return `${cosa}: non localizzato`
    }
}
