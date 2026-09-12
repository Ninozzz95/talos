/**
 * U-14 — I LETTORI CONDIVISI DEL MOVIMENTO «Calm».
 *
 * Tre funzioni sole, e tutte rispondono alla stessa domanda: *il motore ha già
 * deciso che questa animazione non si fa?*
 *
 * ⛔ IL PUNTO DI QUESTO FILE È NON AVERE UN SECONDO MOTORE.
 * Il movimento dell'app è governato da `motion-v6`: le preferenze entrano in un
 * risolutore puro (`motion-v6/interaction/resolver.ts`) che pubblica una
 * quarantina di variabili CSS sulla radice della shell (`App.vue`). Quelle
 * variabili sanno già tutto:
 *
 *   - `prefers-reduced-motion: reduce`   → durata 0, reason `reduced_motion`
 *   - «Movimento interfaccia» spento     → durata 0, reason `interface_off`
 *   - profilo del movimento su «Spento»  → durata 0, reason `interface_off`
 *   - la CATEGORIA di quell'intento off  → durata 0, reason `category_off`
 *   - «Pausa quando nascosta» / risparmio dati → il governatore spegne a monte
 *
 * Quindi una animazione nuova non ha bisogno di consultare lo store, né di
 * riscrivere quelle quattro condizioni: le legge già risolte, in un numero.
 * Chiedere allo store significherebbe avere due verità che prima o poi
 * divergono; leggere il token significa averne una sola.
 *
 * ⛔ ASSENTE NON È SPENTO.
 * Un token che non c'è (prova jsdom, componente montato fuori dalla radice
 * della shell) vuol dire «non lo so», e si cade sul valore di serie — che è il
 * numero del mockup. Se «assente» valesse «spento», ogni prova unitaria
 * direbbe che il movimento funziona proprio perché non c'è niente da misurare:
 * un cancello che non respinge mai supera la prova esattamente come uno vero.
 *
 * Fonti (lette l'11/09/2026):
 * - https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
 * - https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
 */

import type { TalosMotionV6Preferences } from '../motion-v6/contracts'
import { TALOS_MOTION_V6_DEFAULTS } from '../motion-v6/defaults'
import type { TalosInteractionIntent } from '../motion-v6/interaction/intents'
import {
    createDefaultInteractionProfile,
    resolveTalosInteractionMotion,
    type TalosInteractionProfile,
} from '../motion-v6/interaction/resolver'

/**
 * ⛔⛔ IL NUMERO CHE SI VEDE DEV'ESSERE QUELLO DEL MOCKUP — E NON LO ERA.
 *
 * Misurato sul Pad (v49, `document.getAnimations()` via CDP, 12/09/2026), con
 * le preferenze di serie e «Movimento interfaccia» acceso:
 *
 *     foglio della stazione  205 ms   (mockup 440)
 *     velo                    69 ms   (mockup 220)
 *     righe delle Note        74 ms   (mockup 240)
 *     filo dei filtri        111 ms   (mockup 300)
 *
 * Circa la META', e non per caso. Il motore risolve cosi'
 * (`motion-v6/interaction/resolver.ts:263`):
 *
 *     durata = spec × (duration_scale / 100) × tuning.duration
 *
 * e `duration_scale` **di serie vale 50** (`motion-v6/defaults.ts:18`), perche'
 * il motore e' disegnato con 100 = «il doppio del normale». Sopra c'e' anche la
 * taratura del tema (`interaction/profiles.ts`: `calm` → 0,92) e il pavimento
 * degli intenti finestra. Conto completo del foglio:
 *
 *     ceil(320 / 0,72) = 445 → max(320, 445) = 445 → × 0,92 = 409 → × 0,5 = 205
 *
 * che e' esattamente il numero misurato.
 *
 * ⛔ IL 50 NON SI TOCCA. Portarlo a 100 raddoppierebbe **ogni** animazione già
 * esistente dell'app — centinaia di superfici tarate su quel valore, nessuna
 * delle quali ha chiesto niente. La scala di serie e' una scelta del motore, e
 * resta sua.
 *
 * ⇒ Si compensa dalla parte giusta: gli spec U-14 si dichiarano **nella scala
 * del mockup** e si convertono con `mockupMs()`, così che il valore RISOLTO
 * alle preferenze di serie sia il numero del mockup, al millisecondo.
 * E si passa al risolutore un profilo NOSTRO, non quello del tema: la taratura
 * per tema e i pavimenti sono giusti per il movimento nato nell'app, ma qui il
 * numero e' un dato misurato su un disegno, non una preferenza da tarare.
 *
 * Tutto il resto del risolutore resta in mezzo, ed e' il punto: i quattro
 * spegnimenti (riduzione di sistema, interruttore, profilo, categoria) e la
 * scala di durata scelta dall'utente continuano a decidere, come prima.
 */
export function mockupMs(numeroDelMockup: number): number {
    const scala = TALOS_MOTION_V6_DEFAULTS.interface.duration_scale
    // Letto dalla costante e non scritto a mano: se un giorno il motore cambia
    // la propria scala di serie, questi numeri la seguono senza che nessuno
    // debba ricordarsi di venire qui.
    return Math.round((numeroDelMockup * 100) / scala)
}

/**
 * Il movimento del mockup, voce per voce, con l'intento del motore a cui
 * appartiene — e quindi la CATEGORIA che lo spegne.
 *
 * I millisecondi sono quelli MISURATI eseguendo il mockup (inventario completo
 * in `.claude/MOTION-MOCKUP-2026-09-11.md`), nella scala del mockup: la
 * conversione la fa `mockupMs`.
 */
export const TALOS_CALM_SPECS = Object.freeze({
    /** Il foglio della stazione che sale da sotto. Finestre. */
    sheet: Object.freeze({ intent: 'window-open' as TalosInteractionIntent, ms: 440 }),
    /** …e che esce scendendo. Finestre. */
    'sheet-exit': Object.freeze({ intent: 'window-close' as TalosInteractionIntent, ms: 210 }),
    /** Il velo dietro al foglio. Finestre. */
    veil: Object.freeze({ intent: 'window-open' as TalosInteractionIntent, ms: 220 }),
    /** Una riga o una scheda che entra nell'elenco. Messaggi. */
    row: Object.freeze({ intent: 'message-insert' as TalosInteractionIntent, ms: 240 }),
    /** Il filo che scivola sotto la scelta attiva. Navigazione. */
    indicator: Object.freeze({ intent: 'tab-change' as TalosInteractionIntent, ms: 300 }),
    /** Le schede che si riordinano (FLIP). Navigazione. */
    flip: Object.freeze({ intent: 'tab-change' as TalosInteractionIntent, ms: 290 }),
    /** L'onda che parte dal dito. Feedback. */
    wave: Object.freeze({ intent: 'success' as TalosInteractionIntent, ms: 470 }),
    /** Un segno che cambia forma per dire uno stato. Finestre. */
    marker: Object.freeze({ intent: 'window-focus' as TalosInteractionIntent, ms: 130 }),
    /** Un menu che arriva. Superfici. */
    menu: Object.freeze({ intent: 'menu-open' as TalosInteractionIntent, ms: 440 }),
    /** …e che se ne va. Superfici. */
    'menu-exit': Object.freeze({ intent: 'menu-close' as TalosInteractionIntent, ms: 210 }),
    /** Il disegno dello stato vuoto che si traccia. Finestre. */
    empty: Object.freeze({ intent: 'window-open' as TalosInteractionIntent, ms: 360 }),
})

export type TalosCalmSpecName = keyof typeof TALOS_CALM_SPECS

/** Il prefisso dei token U-14. Uno solo, per poterli riconoscere a colpo d'occhio. */
export const TALOS_CALM_TOKEN_PREFIX = '--talos-motion-calm-'

/**
 * Un profilo con UN solo intento riscritto sul numero del mockup.
 *
 * Il risolutore pretende tutti e 24 gli intenti (`validProfile`), quindi si
 * parte dal profilo di serie e se ne sostituisce uno: gli altri 23 non vengono
 * mai letti per questa voce, ma devono esserci o il profilo e' invalido e il
 * piano torna «immediato» — cioe' zero, cioe' nessuna animazione, in silenzio.
 */
function profiloDi(intent: TalosInteractionIntent, ms: number): TalosInteractionProfile {
    const base = createDefaultInteractionProfile()
    const spec = base.specs[intent]
    return Object.freeze({
        id: `talos-calm-u14-${intent}`,
        specs: Object.freeze({ ...base.specs, [intent]: Object.freeze({ ...spec, durationMs: mockupMs(ms) }) }),
    })
}

export interface TalosCalmMotionRequest {
    preferences: TalosMotionV6Preferences
    reducedMotion: boolean
    paused?: boolean
}

/**
 * La durata risolta di una voce U-14, in millisecondi.
 *
 * Passa dal risolutore del motore, non da un calcolo nostro: sono le sue
 * quattro porte a dover decidere, e riscriverle qui vorrebbe dire avere due
 * verita' che prima o poi divergono.
 */
export function talosCalmDurataMs(nome: TalosCalmSpecName, request: TalosCalmMotionRequest): number {
    const voce = TALOS_CALM_SPECS[nome]
    return resolveTalosInteractionMotion({
        intent: voce.intent,
        profile: profiloDi(voce.intent, voce.ms),
        interfaceEnabled: request.preferences.interface_enabled && request.paused !== true,
        reducedMotion: request.reducedMotion,
        preferences: request.preferences.interface,
    }).durationMs
}

/**
 * Tutti i token U-14, pronti da scrivere sulla radice del documento.
 *
 * ⛔ Sulla RADICE DEL DOCUMENTO, e non sul `<div>` di `App.vue` dove vivono i
 * token del motore. È la correzione del secondo difetto visto sul Pad: il menu
 * di riga usciva a `0ms | linear` con il movimento ACCESO, e la ragione non era
 * una preferenza — e' che quel menu e' **teleportato** fuori dalla radice della
 * shell (`TalosRowActions.vue`, `Teleport to="body"`, per non finire sotto il
 * top layer di un dialogo modale). Fuori da quel sottoalbero i token del motore
 * non si ereditano, ogni `var(--talos-motion-…, 0ms)` cadeva sul proprio
 * ripiego, e `0ms | linear` e' esattamente la firma di quel ripiego.
 *
 * Un token U-14 sulla radice del documento si vede da ogni parte: dentro la
 * shell, dentro un `Teleport`, e dentro il top layer di un `<dialog>`.
 */
export function talosCalmMotionTokens(request: TalosCalmMotionRequest): Record<string, string> {
    const token: Record<string, string> = {}
    for (const nome of Object.keys(TALOS_CALM_SPECS) as TalosCalmSpecName[]) {
        token[`${TALOS_CALM_TOKEN_PREFIX}${nome}`] = `${talosCalmDurataMs(nome, request)}ms`
    }
    // Lo sfasamento fra una riga e la successiva. Qui NON si compensa niente: il
    // mockup dichiara il cursore «Sfasamento» e poi non lo legge da nessuna
    // parte (misurate sette righe in entrata, tutte con ritardo zero), quindi
    // non c'è un numero del mockup da raggiungere — è una cosa nostra, e vale
    // il numero del motore.
    const riga = TALOS_CALM_SPECS.row
    token[`${TALOS_CALM_TOKEN_PREFIX}stagger`] = `${resolveTalosInteractionMotion({
        intent: riga.intent,
        profile: profiloDi(riga.intent, riga.ms),
        interfaceEnabled: request.preferences.interface_enabled && request.paused !== true,
        reducedMotion: request.reducedMotion,
        preferences: request.preferences.interface,
    }).delayMs}ms`
    return token
}

/** Il sistema operativo chiede meno movimento. */
export function talosRiduzioneMovimento(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
        return false
    }
}

/**
 * Il valore grezzo di un token CSS su un elemento, già ripulito.
 * Stringa vuota = non c'è.
 */
export function talosTokenGrezzo(element: Element, token: string): string {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return ''
    try {
        return window.getComputedStyle(element).getPropertyValue(token).trim()
    } catch {
        return ''
    }
}

/**
 * Una durata in millisecondi, letta da un token.
 *
 * Accetta `ms` e `s`, perché il motore scrive `ms` ma nessuno ci vieta di
 * cambiare idea: leggere `'0.3s'` come 0,3 ms sarebbe un'animazione che
 * scompare senza che nessun test se ne accorga.
 * Torna `fallback` se il token non c'è o non è un numero.
 */
export function talosDurataMs(element: Element, token: string, fallback: number): number {
    const raw = talosTokenGrezzo(element, token)
    if (!raw) return fallback
    const numero = Number.parseFloat(raw)
    if (!Number.isFinite(numero)) return fallback
    return /\ds\s*$/.test(raw) && !/ms\s*$/.test(raw) ? numero * 1000 : numero
}

/**
 * Il cancello, in una riga: questa animazione si fa?
 *
 * Falso quando il sistema chiede meno movimento, oppure quando il token di
 * durata dell'intento è risolto a zero — cioè quando l'utente ha spento
 * l'interruttore, il profilo o la categoria a cui quell'intento appartiene.
 */
export function talosMotionConsentito(element: Element, token: string): boolean {
    if (talosRiduzioneMovimento()) return false
    const raw = talosTokenGrezzo(element, token)
    if (!raw) return true
    const numero = Number.parseFloat(raw)
    return !Number.isFinite(numero) || numero > 0
}

/**
 * La curva dichiarata dal motore, o quella del mockup se non c'è.
 * Il valore di serie è la curva d'entrata misurata sul mockup.
 */
export const TALOS_CALM_EASE = 'cubic-bezier(0.22, 0.8, 0.24, 1)'

export function talosCurva(element: Element, token: string, fallback = TALOS_CALM_EASE): string {
    return talosTokenGrezzo(element, token) || fallback
}

/**
 * Quante voci di un elenco si animano davvero, all'ingresso.
 *
 * È il numero del mockup: `Personality.after` (`app.js:279`) smette dopo la
 * sedicesima scheda, e prima ancora salta tutto ciò che sta fuori dallo
 * schermo. Una lista di duecento note che entrano tutte insieme non è
 * un'animazione, è un carico di lavoro.
 */
export const TALOS_ENTRATA_MASSIMA = 16

/**
 * Dopo quante posizioni lo sfasamento smette di crescere.
 *
 * ⛔ Nel mockup questo numero NON esiste, e va detto: lo slider «Sfasamento»
 * è dichiarato fra le preferenze (`app.js:446`, `motionStagger: 40`) ma
 * **nessuna animazione del mockup lo legge** — misurate sette righe in entrata,
 * tutte con ritardo zero. Qui lo usiamo davvero, e allora serve un tetto: col
 * valore di serie (40 ms) l'ottava riga parte già a 280 ms, e la ventesima
 * aspetterebbe quasi un secondo prima di comparire.
 */
export const TALOS_SFASAMENTO_MASSIMO = 8

/**
 * Lo stile d'entrata di una riga in posizione `indice`.
 *
 * Il ritardo è scritto come `calc()` sul token del motore e non come un numero
 * di millisecondi: così resta una cosa sola da cambiare, e quando l'utente
 * spegne il movimento il token va a `0ms` e l'intero `calc()` si annulla da
 * sé — senza che questo file debba saperlo. È lo stesso schema già usato dal
 * ventaglio della sidebar (`TalosMobileSpeedDial.vue`).
 *
 * Torna `undefined` oltre il tetto delle voci animate: l'elemento non porta
 * l'attributo d'intento, quindi compare e basta.
 */
export function talosSfasamento(indice: number): Record<string, string> | undefined {
    if (!Number.isFinite(indice) || indice < 0 || indice >= TALOS_ENTRATA_MASSIMA) return undefined
    const passi = Math.min(indice, TALOS_SFASAMENTO_MASSIMO)
    return { animationDelay: `calc(var(--talos-motion-stagger, 0ms) * ${passi})` }
}
