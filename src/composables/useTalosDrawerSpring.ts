/**
 * ⭐⭐⭐ IL GESTO DELLA SIDEBAR, portato dal mockup «Talos Calm Finale» così com'è.
 *
 * Decisione owner U-1 (11/09/2026, `LEDGER-UI-CALM-2026-09-11.md`): la sidebar
 * del mockup entra nell'app con il suo contratto dei gesti —
 *
 *   - il dito muove il pannello: durante il trascinamento nessun easing, nessun
 *     ritardo, nessuna dipendenza dal numero di eventi (`paint(startOffset + dx)`);
 *   - il rilascio decide: la posizione proiettata con la velocità degli ultimi
 *     90 ms (`x + vx · 160`) contro metà larghezza;
 *   - `pointercancel` e `lostpointercapture` tornano alla posizione valida di
 *     partenza, mai a metà strada;
 *   - riduzione movimento: la molla non parte, si dipinge direttamente l'arrivo.
 *     Il movimento DIRETTO (il dito) resta sempre disponibile.
 *
 * ## La fisica è quella del mockup, numero per numero
 *
 * `scalarSpring` in `src/app.js` del pacchetto (righe 2238-2264): soluzione
 * esatta di una molla criticamente smorzata, indipendente dal frame rate —
 * `x(t) = to + (Δ + c·t)·e^(−ω·t)`, `c = v₀ + ω·Δ`, ω = 23 (26 se «quiet»,
 * 32 se «fast»), velocità iniziale limitata a ±2.600 px/s, fermata quando
 * |x−to| < 0,15 px e |v| < 5 px/s, oppure a 1,1 s.
 *
 * ⛔ Perché una molla e non un `cubic-bezier`: la forma chiusa dà posizione E
 * velocità come funzioni pure del tempo, quindi un gesto può interrompere
 * l'animazione e ripartire dalla velocità corrente senza un salto — è il caso
 * «critically damped» che torna a riposo il più in fretta possibile senza
 * superare l'arrivo. Fonti lette l'11/09/2026: Ryan Juckett, «Damped Springs»
 * (https://www.ryanjuckett.com/damped-springs/) per la derivazione dei tre
 * casi; la libreria `wobble` (https://github.com/skevy/wobble) per la stessa
 * scelta nelle UI: «closed-form solutions … particularly advantageous for
 * building continuous/interruptible gestures».
 *
 * ## Perché è un modulo a sé e non dentro il componente
 *
 * Perché si prova senza un browser: il tempo e lo scheduler si iniettano, e
 * una molla che converge, un rilascio che decide, un annullamento che torna
 * sono tre calcoli — non tre gesti da rifare a mano sul Pad ogni volta.
 */

export interface TalosSpringOptions {
    /** px/s all'avvio — la velocità del dito al rilascio. */
    velocity?: number
    /** `quiet` = ω 26, `fast` = ω 32, altrimenti 23 — come nel mockup. */
    feel?: 'default' | 'quiet' | 'fast'
    /** Vero = niente molla, si dipinge subito l'arrivo (riduzione movimento). */
    reduced?: boolean
    /**
     * ⭐ U-15 (owner 12/09/2026): la molla SEGUE il cursore «Durata
     * transizioni», come nel mockup — `scalarSpring` in `src/app.js:2241-2260`
     * fa `factor = max(.25, duration(1000)/1000)`, poi `ω / factor` e
     * fermata a `t > 1.1 · factor`. Qui `timeScale` è quel `factor`: 1 alle
     * preferenze di serie (la sensazione approvata in U-1 non cambia), 2 con
     * il cursore al doppio, mai sotto 0,25.
     */
    timeScale?: number
    /** Iniettabili per le prove. */
    now?: () => number
    schedule?: (cb: (t: number) => void) => number
    cancelSchedule?: (id: number) => void
}

export interface TalosSpringHandle {
    readonly playState: 'running' | 'finished' | 'idle'
    cancel(): void
    finish(): void
}

const VELOCITA_MASSIMA = 2600

function omegaDi(feel: TalosSpringOptions['feel']): number {
    return feel === 'fast' ? 32 : feel === 'quiet' ? 26 : 23
}

function schedulerPredefinito(): Pick<Required<TalosSpringOptions>, 'now' | 'schedule' | 'cancelSchedule'> {
    const raf = typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 16) as unknown as number
    const caf = typeof globalThis.cancelAnimationFrame === 'function'
        ? globalThis.cancelAnimationFrame.bind(globalThis)
        : (id: number) => clearTimeout(id)
    return { now: () => performance.now(), schedule: raf, cancelSchedule: caf }
}

/**
 * Molla criticamente smorzata da `from` a `to`. `paint` riceve ogni posizione;
 * `finish` è chiamato UNA volta, all'arrivo — mai se annullata.
 *
 * Torna `null` quando non c'è niente da animare (riduzione movimento, o
 * spostamento sotto 0,05 px): in quel caso `paint(to)` e `finish` sono già
 * stati chiamati, sincroni.
 */
export function talosScalarSpring(
    from: number,
    to: number,
    paint: (x: number) => void,
    finish?: () => void,
    options: TalosSpringOptions = {},
): TalosSpringHandle | null {
    const { now, schedule, cancelSchedule } = { ...schedulerPredefinito(), ...options }
    const timeScale = Math.max(0.25, Number.isFinite(options.timeScale ?? 1) ? (options.timeScale ?? 1) : 1)
    const omega = omegaDi(options.feel) / timeScale
    const delta = from - to
    const velocity = Math.max(-VELOCITA_MASSIMA, Math.min(VELOCITA_MASSIMA, options.velocity ?? 0))
    const coefficient = velocity + omega * delta

    if (options.reduced || Math.abs(delta) < 0.05) {
        paint(to)
        finish?.()
        return null
    }

    let frame = 0
    let live = true
    const started = now()
    const handle: TalosSpringHandle & { playState: 'running' | 'finished' | 'idle' } = {
        playState: 'running',
        cancel() {
            if (!live) return
            live = false
            cancelSchedule(frame)
            handle.playState = 'idle'
        },
        finish() {
            if (!live) return
            live = false
            cancelSchedule(frame)
            paint(to)
            handle.playState = 'finished'
            finish?.()
        },
    }
    paint(from)
    const tick = (at: number): void => {
        if (!live) return
        const t = Math.max(0, at - started) / 1000
        const exp = Math.exp(-omega * t)
        const x = to + (delta + coefficient * t) * exp
        const v = (coefficient - omega * (delta + coefficient * t)) * exp
        paint(x)
        if ((Math.abs(x - to) < 0.15 && Math.abs(v) < 5) || t > 1.1 * timeScale) handle.finish()
        else frame = schedule(tick)
    }
    frame = schedule(tick)
    return handle
}

export interface TalosPointerSample { x: number, y: number, t: number }

/**
 * Tiene gli ultimi 90 ms di posizioni (al massimo 12): è la finestra su cui il
 * mockup misura la velocità del rilascio.
 */
export function talosSamplePointer(samples: TalosPointerSample[], x: number, y: number, t: number): void {
    samples.push({ x, y, t })
    while (samples.length > 2 && t - samples[0]!.t > 90) samples.shift()
    if (samples.length > 12) samples.shift()
}

/** Velocità in px/ms sull'asse, limitata a ±2,6 — zero se l'ultimo campione è vecchio (>90 ms). */
export function talosVelocityAt(samples: readonly TalosPointerSample[], t: number, axis: 'x' | 'y'): number {
    if (samples.length < 2) return 0
    const last = samples[samples.length - 1]!
    if (t - last.t > 90) return 0
    const first = samples.find((s) => last.t - s.t <= 90) ?? samples[0]!
    const dt = last.t - first.t
    if (dt <= 0) return 0
    return Math.max(-2.6, Math.min(2.6, (last[axis] - first[axis]) / dt))
}

/**
 * ⭐ Il rilascio decide: aperto se la posizione PROIETTATA supera metà larghezza.
 *
 * `x` è l'offset attuale del pannello (0 = aperto, −width = chiuso). Con meno
 * di 18 px di spostamento la velocità non conta: un tocco che trema non è
 * un'intenzione. Numeri del mockup (`pointerUp`, tipo `drawer`).
 */
export function talosDrawerShouldOpen(x: number, dx: number, vxPxPerMs: number, width: number): boolean {
    const projected = x + (Math.abs(dx) >= 18 ? vxPxPerMs * 160 : 0)
    return projected > -width * 0.5
}

/** Vero quando il sistema chiede meno movimento — e `true` dove `matchMedia` non esiste (jsdom): lì non si anima. */
export function talosPrefersReducedMotion(): boolean {
    if (typeof globalThis.matchMedia !== 'function') return true
    try {
        return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
        return true
    }
}

export interface TalosDrawerGestureState {
    /** Il pointer che possiede il gesto, o `null` per un tocco senza pointer id. */
    pointer: number | null
    startX: number
    startY: number
    dx: number
    dy: number
    /** Offset del pannello all'inizio del gesto (0 aperto, −width chiuso). */
    startOffset: number
    /** Vero appena il gesto è riconosciuto come orizzontale: da lì il dito comanda. */
    locked: boolean
    samples: TalosPointerSample[]
}

export function talosDrawerGestureStart(pointer: number | null, x: number, y: number, startOffset: number, t: number): TalosDrawerGestureState {
    const state: TalosDrawerGestureState = { pointer, startX: x, startY: y, dx: 0, dy: 0, startOffset, locked: false, samples: [] }
    talosSamplePointer(state.samples, x, y, t)
    return state
}

/**
 * Aggiorna il gesto con una nuova posizione. Torna cosa fare:
 *  - `ignore`: ancora non si sa se è un trascinamento (sotto le soglie);
 *  - `abandon`: è uno scorrimento VERTICALE, il gesto lascia il campo;
 *  - `drag`: il pannello segue il dito, offset = `startOffset + dx`.
 *
 * Soglie del mockup: 8 px verticali prevalenti = abbandona; 9 px orizzontali,
 * e più orizzontali che verticali (×1,25), = aggancia.
 */
export function talosDrawerGestureMove(state: TalosDrawerGestureState, x: number, y: number, t: number): 'ignore' | 'abandon' | 'drag' {
    state.dx = x - state.startX
    state.dy = y - state.startY
    talosSamplePointer(state.samples, x, y, t)
    if (!state.locked) {
        if (Math.abs(state.dy) > 8 && Math.abs(state.dy) > Math.abs(state.dx)) return 'abandon'
        if (Math.abs(state.dx) < 9 || Math.abs(state.dx) < Math.abs(state.dy) * 1.25) return 'ignore'
        state.locked = true
    }
    return 'drag'
}
