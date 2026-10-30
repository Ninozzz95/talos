import { nextTick, type Ref } from 'vue'
import { TALOS_CALM_SPECS, talosCurva, talosDurataMs, talosMotionConsentito, talosRiduzioneMovimento } from './useTalosCalmMotion'

/**
 * ⭐ D2 (owner 28/10/2026, dal Pad): «L'animazione di quando va in compatto e esteso e viceversa non deve essere scattosa, deve essere
 * una transizione sobria e smooth». Il compositore passa da UNA riga (a riposo) alla griglia aperta: un cambio di layout che il CSS
 * non sa interpolare (da flex a grid; `interpolate-size` non fa auto→auto). Ricerca:
 * `.claude/ragionamento/RICERCA-TRANSIZIONE-COMPOSITORE-2026-10-28.md` (LibreChat `Bar.tsx:304-312`, Happy, Material 3 short3/short4).
 *
 * Un FLIP fatto a mano, tre gesti:
 *   1. la scheda anima la sua ALTEZZA, dalla vecchia alla nuova (il vecchio FLIP del 12/09 spostava la scheda intera senza
 *      animarla: il contenuto saltava e poi scivolava, cioè ancora uno scatto);
 *   2. i comandi che restano (+, campo, microfono, Accoda, invio: `data-talos-flip`) scivolano dalla posizione vecchia. Le posizioni
 *      sono misurate rispetto al bordo BASSO della scheda: il compositore sta in un dock fissato in basso, e la tastiera che si apre
 *      sposta tutta la WebView in un colpo solo — misurate sullo schermo, i comandi «volerebbero» di tutta l'altezza della tastiera;
 *   3. le parti che nascono (`data-talos-flip-nuovo`: la fila del modello, la colonna in alto) entrano in dissolvenza con 4 px di
 *      salita, ed escono in dissolvenza (`esci`, da agganciare a una `<Transition :css="false">`).
 * Movimento ridotto del sistema: niente altezza né spostamenti, solo la dissolvenza breve delle parti che nascono ed escono.
 * Movimento spento dall'utente (token a 0): niente di niente.
 *
 * ⛔ Fuori dal pezzo d'avvio (28/10/2026, OK del Desktop): questo file si carica con `import()` dal compositore, a compositore inattivo
 * o al primo tocco; finché non c'è il compositore cambia forma a scatto, come prima del blocco 6. Per questo qui niente `watch` né
 * `onBeforeUnmount`, che vivono solo durante il setup: il compositore chiama `cambia` dal suo `watch` e `chiudi` quando si smonta.
 */
const TOKEN_APRI = '--talos-motion-calm-composer'
const TOKEN_CHIUDI = '--talos-motion-calm-composer-exit'
const TOKEN_RITARDO = '--talos-motion-calm-stagger'
const RESTANO = '[data-talos-flip]'
const NASCONO = '[data-talos-flip-nuovo]'
const DISSOLVENZA_RIDOTTA = 90
/*
 * Chiudendo, la fila del modello sparisce PRIMA (60 ms, curva che cala subito) e la scheda comincia a stringersi 30 ms dopo: con
 * 90 ms e nessun ritardo, a metà corsa il testo del campo che scende passava sopra «GPT-6-Luna» che svaniva (banco, 28/10).
 */
const USCITA = 60
const RITARDO_CHIUSURA = 30
/** Un fotogramma a 60 Hz: oltre due di ritardo, il tempo perso si restituisce alle animazioni. */
const FOTOGRAMMA = 16.7

interface Posto { x: number; dalFondo: number; w: number }
interface Foto { altezza: number; restano: Map<string, Posto>; nascono: Map<string, Posto> }

function posto(el: Element, scheda: DOMRect): Posto {
    const r = el.getBoundingClientRect()
    return { x: r.left - scheda.left, dalFondo: scheda.bottom - r.bottom, w: r.width }
}

function fotografa(scheda: HTMLElement): Foto {
    const s = scheda.getBoundingClientRect()
    const restano = new Map<string, Posto>()
    const nascono = new Map<string, Posto>()
    for (const el of scheda.querySelectorAll<HTMLElement>(RESTANO)) restano.set(el.dataset.talosFlip!, posto(el, s))
    for (const el of scheda.querySelectorAll<HTMLElement>(NASCONO)) nascono.set(el.dataset.talosFlipNuovo!, posto(el, s))
    return { altezza: s.height, restano, nascono }
}

export interface TalosComposerFlip {
    /** Da chiamare dal `watch` (flush `pre`) del compositore, PRIMA che il DOM cambi: la prima misura è quella vecchia. */
    cambia: (ora: boolean) => Promise<void>
    /** Per `<Transition :css="false" @leave>` sulle parti che nascono: escono in dissolvenza, ferme dove erano. */
    esci: (el: Element, done: () => void) => void
    /** Il compositore si smonta: si ferma tutto e non resta nessuno stile scritto a mano. */
    chiudi: () => void
}

export function creaRegistaDelCompositore({ scheda, primaDellaMisura }: {
    scheda: Ref<HTMLElement | null>
    /** L'auto-altezza del campo: gira FRA le due misure, così l'arrivo è quello vero (un solo regista, mai due). */
    primaDellaMisura: () => void
}): TalosComposerFlip {
    let giro = 0
    let correnti: Animation[] = []
    /** Dove stavano le parti che nascono prima del cambio: chi esce resta lì mentre sparisce. */
    let ultimaFoto: Foto | null = null

    function ferma(): void {
        for (const a of correnti) a.cancel()
        correnti = []
        const el = scheda.value
        if (el) { el.style.height = ''; el.style.overflow = ''; el.style.display = ''; el.style.flexDirection = ''; el.style.justifyContent = '' }
        if (el) delete el.dataset.talosComposerAnim
    }

    function puoAnimare(el: HTMLElement): boolean {
        return typeof el.animate === 'function'
    }

    async function cambia(ora: boolean): Promise<void> {
        const el = scheda.value
        if (!el) { primaDellaMisura(); return }
        const mio = ++giro
        // «First»: la geometria VISIBILE adesso — se un giro corre ancora, comprese la sua altezza e le sue traslazioni.
        const prima = fotografa(el)
        ultimaFoto = prima
        ferma()
        await nextTick()
        primaDellaMisura()
        // `promptTall` può accendere «Espandi» (la colonna in alto): un secondo giro di layout dopo il primo
        await nextTick()
        if (mio !== giro || !scheda.value) return
        const dopo = fotografa(el)
        if (!puoAnimare(el)) return
        const token = ora ? TOKEN_APRI : TOKEN_CHIUDI
        const ridotto = talosRiduzioneMovimento()
        if (!ridotto && !talosMotionConsentito(el, token)) return
        const curva = talosCurva(el, '--talos-motion-calm-ease')
        if (ridotto) {
            // solo dissolvenza breve di chi nasce: niente altezza, niente spostamenti (Desktop 28/10)
            for (const nuovo of el.querySelectorAll<HTMLElement>(NASCONO)) {
                if (prima.nascono.has(nuovo.dataset.talosFlipNuovo!)) continue
                const dissolvenza = nuovo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DISSOLVENZA_RIDOTTA, easing: 'linear' })
                correnti.push(dissolvenza)
                // finita, esce dall'elenco: niente da cancellare al giro dopo (revisione del Desktop, 28/10)
                const via = () => { correnti = correnti.filter((x) => x !== dissolvenza) }
                void dissolvenza.finished.then(via, via)
            }
            return
        }
        const durata = talosDurataMs(el, token, ora ? TALOS_CALM_SPECS.composer.ms : TALOS_CALM_SPECS['composer-exit'].ms)
        // la scheda: una colonna allineata in BASSO mentre corre, così ciò che non ci sta esce dal lato che si sta scoprendo
        el.dataset.talosComposerAnim = ora ? 'apri' : 'chiudi'
        el.style.overflow = 'clip'
        el.style.display = 'flex'
        el.style.flexDirection = 'column'
        el.style.justifyContent = 'flex-end'
        const tempi: KeyframeAnimationOptions = ora ? { duration: durata, easing: curva } : { duration: durata, easing: curva, delay: RITARDO_CHIUSURA, fill: 'backwards' }
        const altezza = el.animate([{ height: `${prima.altezza}px` }, { height: `${dopo.altezza}px` }], tempi)
        correnti.push(altezza)
        // chi resta, e chi «nasce» ma c'era già (lo scudo a riposo con «Accesso pieno»): scivola dal posto vecchio
        for (const comando of el.querySelectorAll<HTMLElement>(`${RESTANO}, ${NASCONO}`)) {
            const chiave = comando.dataset.talosFlip
            const da = chiave ? prima.restano.get(chiave) : prima.nascono.get(comando.dataset.talosFlipNuovo!)
            const a = chiave ? dopo.restano.get(chiave) : dopo.nascono.get(comando.dataset.talosFlipNuovo!)
            if (!da || !a) continue
            const dx = da.x - a.x
            const dy = a.dalFondo - da.dalFondo
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
            correnti.push(comando.animate(
                [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
                tempi,
            ))
        }
        if (ora) {
            const ritardo = Math.min(talosDurataMs(el, TOKEN_RITARDO, 40), durata / 2)
            for (const nuovo of el.querySelectorAll<HTMLElement>(NASCONO)) {
                if (prima.nascono.has(nuovo.dataset.talosFlipNuovo!)) continue
                correnti.push(nuovo.animate(
                    [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
                    { duration: durata - ritardo, delay: ritardo, easing: curva, fill: 'backwards' },
                ))
            }
        }
        const fine = () => {
            if (mio !== giro) return
            ferma()
        }
        void altezza.finished.then(fine, fine)
        guardaIFotogrammi(mio)
    }

    /*
     * ⛔ Il guardiano dei fotogrammi (Pad 28/10/2026, vc326, Codice): l'altezza si anima sul thread principale, e al blur la tastiera
     * che si chiude fa ridisegnare la pagina in un compito lungo (55-60 ms misurati). L'orologio delle animazioni intanto corre: quando
     * i fotogrammi ripartivano la corsa era quasi finita e si vedeva 126→68 in un fotogramma, cioè lo scatto. Qui un fotogramma in
     * ritardo restituisce alle animazioni il tempo perso: un blocco del telefono mette in PAUSA il movimento, non lo spezza.
     */
    function guardaIFotogrammi(mio: number): void {
        if (typeof requestAnimationFrame !== 'function') return
        let ultimo = -1
        const passo = (ora: number) => {
            if (mio !== giro || !correnti.length) return
            if (ultimo >= 0) {
                const perso = ora - ultimo - FOTOGRAMMA
                if (perso > FOTOGRAMMA) {
                    for (const a of correnti) {
                        if (a.playState === 'running' && typeof a.currentTime === 'number') a.currentTime = Math.max(0, a.currentTime - perso)
                    }
                }
            }
            ultimo = ora
            requestAnimationFrame(passo)
        }
        requestAnimationFrame(passo)
    }

    function esci(nodo: Element, done: () => void): void {
        const el = nodo as HTMLElement
        const card = scheda.value
        const dove = ultimaFoto?.nascono.get(el.dataset.talosFlipNuovo ?? '')
        if (!card || !dove || !puoAnimare(el) || (!talosRiduzioneMovimento() && !talosMotionConsentito(card, TOKEN_CHIUDI))) { done(); return }
        // fuori dal flusso, ferma dove stava (misurata PRIMA del cambio): la riga a riposo si compone subito sotto di lei
        el.style.position = 'absolute'
        el.style.left = `${dove.x}px`
        el.style.bottom = `${dove.dalFondo}px`
        el.style.width = `${dove.w}px`
        el.style.pointerEvents = 'none'
        const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: USCITA, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'forwards' })
        correnti.push(a)
        void a.finished.then(done, done)
    }

    return { cambia, esci, chiudi: () => { giro++; ferma() } }
}
