// @vitest-environment jsdom
/**
 * U-14 — le prove COME CALCOLO del vocabolario di movimento «Calm».
 *
 * Tre moduli, tre domande diverse:
 *   - `useTalosCalmMotion`      → il cancello ha capito cosa dice il motore?
 *   - `useTalosTouchWave`       → il cerchio nasce dove sta il dito?
 *   - `useTalosSlidingIndicator`→ il filo sa da dove veniva?
 *
 * ⛔ Ogni prova ha anche il suo VERSO CONTRARIO. Un cancello che lascia passare
 * sempre supera una prova scritta solo sul caso legittimo esattamente come uno
 * vero: qui si prova anche che respinge, e che quando respinge lo stato finale
 * resta quello a riposo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TALOS_MOTION_V6_DEFAULTS } from '@/motion-v6/defaults'
import {
    TALOS_CALM_SPECS,
    TALOS_ENTRATA_MASSIMA,
    TALOS_SFASAMENTO_MASSIMO,
    mockupMs,
    talosCalmMotionTokens,
    talosCurva,
    talosDurataMs,
    talosMotionConsentito,
    talosRiduzioneMovimento,
    talosSfasamento,
    talosTokenGrezzo,
} from '@/composables/useTalosCalmMotion'
import {
    TALOS_WAVE_CLASS,
    TALOS_WAVE_GATE_TOKEN,
    talosWaveGeometry,
    useTalosTouchWave,
} from '@/composables/useTalosTouchWave'
import { talosIndicatorFrames } from '@/composables/useTalosSlidingIndicator'

/**
 * jsdom non porta `matchMedia`: qui la si installa a mano quando serve.
 *
 * ⛔ E il fatto che NON ci sia di suo è esattamente il caso che
 * `talosRiduzioneMovimento` deve trattare come «nessuna riduzione»: un
 * ambiente senza media query non e' un ambiente che chiede meno movimento.
 */
function chiediRiduzione(attiva: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => ({
            matches: attiva && query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
        }),
    })
}

function dimenticaRiduzione(): void {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'matchMedia')
}

/** Un elemento che risponde con i token che gli diamo, e basta. */
function conToken(token: Record<string, string>): HTMLElement {
    const el = document.createElement('div')
    for (const [nome, valore] of Object.entries(token)) el.style.setProperty(nome, valore)
    return el
}

afterEach(() => {
    vi.restoreAllMocks()
    dimenticaRiduzione()
    document.body.innerHTML = ''
})

describe('CALM-MOCKUP — alle preferenze di SERIE si vede il numero del mockup', () => {
    /**
     * ⛔ È la prova che questo lavoro esisteva per fare.
     *
     * Misurato sul Pad il 12/09/2026, prima della correzione: foglio 205 ms
     * (mockup 440), velo 69 (220), righe 74 (240), filo 111 (300). Circa la
     * metà, e per una ragione precisa: il motore risolve
     * `spec × duration_scale/100 × tuning`, e `duration_scale` di serie vale
     * **50**. La regola dell'owner per U-14 è «alla perfezione» — alle
     * preferenze di serie il numero che si vede dev'essere quello misurato sul
     * mockup.
     *
     * Queste righe leggono la costante del motore e chiedono il numero esatto.
     * Se un giorno qualcuno cambia `duration_scale`, `mockupMs` lo segue e
     * questo test resta verde: sta misurando la RELAZIONE, non un numero.
     */
    const ai_default = () => talosCalmMotionTokens({
        preferences: TALOS_MOTION_V6_DEFAULTS,
        reducedMotion: false,
    })

    it('CALM-MOCKUP-01 le sei durate chieste sono esattamente quelle del mockup', () => {
        expect(ai_default()).toMatchObject({
            '--talos-motion-calm-sheet': '440ms',
            '--talos-motion-calm-row': '240ms',
            '--talos-motion-calm-indicator': '300ms',
            '--talos-motion-calm-wave': '470ms',
            '--talos-motion-calm-marker': '130ms',
            '--talos-motion-calm-flip': '290ms',
        })
    })

    it('CALM-MOCKUP-02 e anche le altre: velo, uscite, menu, disegno vuoto', () => {
        expect(ai_default()).toMatchObject({
            '--talos-motion-calm-veil': '220ms',
            '--talos-motion-calm-sheet-exit': '210ms',
            '--talos-motion-calm-menu': '440ms',
            '--talos-motion-calm-menu-exit': '210ms',
            '--talos-motion-calm-empty': '360ms',
        })
    })

    it('CALM-MOCKUP-03 la compensazione è CALCOLATA dalla costante, non scritta a mano', () => {
        // Un `2` scritto qui funzionerebbe oggi e mentirebbe il giorno in cui
        // il motore cambia la propria scala di serie — in silenzio, perché 2 è
        // un numero perfettamente valido.
        const scala = TALOS_MOTION_V6_DEFAULTS.interface.duration_scale
        expect(mockupMs(440)).toBe(Math.round(440 * 100 / scala))
        expect(mockupMs(440) * (scala / 100)).toBe(440)
    })

    it('CALM-MOCKUP-04 ogni voce resta sotto il tetto che il risolutore accetta', () => {
        // `validSpec` rifiuta oltre 2000 ms, e un profilo invalido non fallisce
        // rumorosamente: torna un piano «immediato», cioè zero. Sarebbe
        // l'animazione che sparisce senza che nessuno se ne accorga.
        for (const voce of Object.values(TALOS_CALM_SPECS)) {
            expect(mockupMs(voce.ms)).toBeLessThanOrEqual(2000)
        }
    })

    it('CALM-MOCKUP-05 la SCALA scelta dall\'utente continua a contare', () => {
        // La compensazione non congela le durate: raddoppiare il cursore
        // raddoppia il risultato. Se questo test cadesse, avremmo scritto
        // numeri fissi travestiti da token.
        const doppio = talosCalmMotionTokens({
            preferences: {
                ...TALOS_MOTION_V6_DEFAULTS,
                interface: { ...TALOS_MOTION_V6_DEFAULTS.interface, duration_scale: 100 },
            },
            reducedMotion: false,
        })
        expect(doppio['--talos-motion-calm-sheet']).toBe('880ms')
        expect(doppio['--talos-motion-calm-row']).toBe('480ms')
    })

    it('CALM-MOCKUP-06 AL CONTRARIO: con la riduzione di sistema vanno TUTTE a zero', () => {
        const spento = talosCalmMotionTokens({
            preferences: TALOS_MOTION_V6_DEFAULTS,
            reducedMotion: true,
        })
        for (const [nome, valore] of Object.entries(spento)) {
            expect(valore, nome).toBe('0ms')
        }
    })

    it('CALM-MOCKUP-07 AL CONTRARIO: «Movimento interfaccia» spento le azzera', () => {
        const spento = talosCalmMotionTokens({
            preferences: { ...TALOS_MOTION_V6_DEFAULTS, interface_enabled: false },
            reducedMotion: false,
        })
        expect(spento['--talos-motion-calm-sheet']).toBe('0ms')
        expect(spento['--talos-motion-calm-wave']).toBe('0ms')
    })

    it('CALM-MOCKUP-08 ogni voce cade sotto la CATEGORIA giusta, una per una', () => {
        // È la prova che le sei categorie del pannello Aspetto governano
        // davvero queste animazioni, e che nessuna è finita nella categoria
        // sbagliata — dove si spegnerebbe insieme a cose che non c'entrano.
        const conCategoria = (categoria: string) => talosCalmMotionTokens({
            preferences: {
                ...TALOS_MOTION_V6_DEFAULTS,
                interface: {
                    ...TALOS_MOTION_V6_DEFAULTS.interface,
                    categories: { ...TALOS_MOTION_V6_DEFAULTS.interface.categories, [categoria]: false },
                },
            },
            reducedMotion: false,
        })
        // Finestre: il foglio, il velo, le uscite del foglio, il segno, il vuoto
        const senzaFinestre = conCategoria('windows')
        expect(senzaFinestre['--talos-motion-calm-sheet']).toBe('0ms')
        expect(senzaFinestre['--talos-motion-calm-veil']).toBe('0ms')
        expect(senzaFinestre['--talos-motion-calm-marker']).toBe('0ms')
        // …e NON tocca quelle delle altre categorie
        expect(senzaFinestre['--talos-motion-calm-wave']).toBe('470ms')
        expect(senzaFinestre['--talos-motion-calm-row']).toBe('240ms')

        expect(conCategoria('surfaces')['--talos-motion-calm-menu']).toBe('0ms')
        expect(conCategoria('navigation')['--talos-motion-calm-indicator']).toBe('0ms')
        expect(conCategoria('navigation')['--talos-motion-calm-flip']).toBe('0ms')
        expect(conCategoria('messages')['--talos-motion-calm-row']).toBe('0ms')
        expect(conCategoria('feedback')['--talos-motion-calm-wave']).toBe('0ms')
    })

    it('CALM-MOCKUP-09 «Pausa quando nascosta» spegne anche queste', () => {
        const inPausa = talosCalmMotionTokens({
            preferences: TALOS_MOTION_V6_DEFAULTS,
            reducedMotion: false,
            paused: true,
        })
        expect(inPausa['--talos-motion-calm-sheet']).toBe('0ms')
    })
})

describe('CALM-TOKEN — leggere quello che il motore ha già deciso', () => {
    it('CALM-TOKEN-01 legge una durata in millisecondi', () => {
        expect(talosDurataMs(conToken({ '--x': '240ms' }), '--x', 999)).toBe(240)
    })

    it('CALM-TOKEN-02 legge una durata in SECONDI senza scambiarla per millisecondi', () => {
        // `'0.3s'` letto con un `parseFloat` nudo varrebbe 0,3 ms: un'animazione
        // che sparisce, e nessuno se ne accorge perché 0,3 è un numero valido.
        expect(talosDurataMs(conToken({ '--x': '0.3s' }), '--x', 999)).toBe(300)
    })

    it('CALM-TOKEN-03 un token ASSENTE cade sul valore di serie, non su zero', () => {
        // È la riga che impedisce a ogni prova jsdom di dichiarare «funziona»
        // solo perché non c'è niente da misurare.
        expect(talosDurataMs(document.createElement('div'), '--non-esiste', 240)).toBe(240)
    })

    it('CALM-TOKEN-04 un token illeggibile cade sul valore di serie', () => {
        expect(talosDurataMs(conToken({ '--x': 'boh' }), '--x', 240)).toBe(240)
    })

    it('CALM-TOKEN-05 la curva viene dal motore quando c\'è, dal mockup quando non c\'è', () => {
        expect(talosCurva(conToken({ '--e': 'linear' }), '--e')).toBe('linear')
        expect(talosCurva(document.createElement('div'), '--e')).toBe('cubic-bezier(0.22, 0.8, 0.24, 1)')
    })

    it('CALM-TOKEN-06 il token grezzo di un elemento senza stile è la stringa vuota', () => {
        expect(talosTokenGrezzo(document.createElement('div'), '--niente')).toBe('')
    })
})

describe('CALM-GATE — il cancello, nei due versi', () => {
    it('CALM-GATE-01 passa quando il motore dichiara una durata', () => {
        expect(talosMotionConsentito(conToken({ '--d': '150ms' }), '--d')).toBe(true)
    })

    it('CALM-GATE-02 RESPINGE quando il motore ha risolto a zero', () => {
        // Zero è la firma di tutti e quattro gli spegnimenti del risolutore:
        // riduzione di sistema, interruttore, profilo «Spento», categoria off.
        expect(talosMotionConsentito(conToken({ '--d': '0ms' }), '--d')).toBe(false)
    })

    it('CALM-GATE-03 RESPINGE quando il sistema chiede meno movimento, token o no', () => {
        chiediRiduzione(true)
        expect(talosRiduzioneMovimento()).toBe(true)
        expect(talosMotionConsentito(conToken({ '--d': '400ms' }), '--d')).toBe(false)
    })

    it('CALM-GATE-04 passa quando il token non c\'è: assente non è spento', () => {
        expect(talosMotionConsentito(document.createElement('div'), '--mai-scritto')).toBe(true)
    })
})

describe('CALM-STAGGER — lo sfasamento che il mockup dichiarava e non usava', () => {
    it('CALM-STAGGER-01 la prima voce non aspetta', () => {
        expect(talosSfasamento(0)).toEqual({ animationDelay: 'calc(var(--talos-motion-stagger, 0ms) * 0)' })
    })

    it('CALM-STAGGER-02 il ritardo è un calc() sul token, mai un numero di ms', () => {
        // Se fosse un numero, resterebbe anche a movimento spento: la lista
        // comparirebbe a scaglioni SENZA animarsi, il peggiore dei due mondi.
        const stile = talosSfasamento(3)
        expect(stile?.animationDelay).toContain('var(--talos-motion-stagger, 0ms)')
        expect(stile?.animationDelay).not.toMatch(/\d+ms\s*\*/)
    })

    it('CALM-STAGGER-03 oltre il tetto lo sfasamento SMETTE di crescere', () => {
        const al_tetto = talosSfasamento(TALOS_SFASAMENTO_MASSIMO)
        const oltre = talosSfasamento(TALOS_SFASAMENTO_MASSIMO + 3)
        expect(oltre).toEqual(al_tetto)
        expect(oltre?.animationDelay).toContain(`* ${TALOS_SFASAMENTO_MASSIMO}`)
    })

    it('CALM-STAGGER-04 oltre il tetto delle voci animate non torna NIENTE', () => {
        // Nessuno stile vuol dire, a monte, nessun attributo d'intento: la voce
        // compare e basta. È il cap del mockup (`Personality.after`, 16).
        expect(talosSfasamento(TALOS_ENTRATA_MASSIMA)).toBeUndefined()
        expect(talosSfasamento(TALOS_ENTRATA_MASSIMA + 40)).toBeUndefined()
    })

    it('CALM-STAGGER-05 un indice assurdo non produce uno stile assurdo', () => {
        expect(talosSfasamento(-1)).toBeUndefined()
        expect(talosSfasamento(Number.NaN)).toBeUndefined()
    })
})

describe('WAVE-GEO — la geometria dell\'onda, il numero del mockup', () => {
    it('WAVE-GEO-01 il diametro è il lato più lungo per 1,7', () => {
        // `app.js:2213`: `w = Math.max(r.width, r.height) * 1.7`.
        const g = talosWaveGeometry({ left: 0, top: 0, width: 100, height: 40 }, 0, 0)
        expect(g.size).toBeCloseTo(170, 5)
    })

    it('WAVE-GEO-02 il cerchio è CENTRATO sul punto toccato', () => {
        const g = talosWaveGeometry({ left: 10, top: 20, width: 100, height: 100 }, 60, 70)
        // centro voluto = (60-10, 70-20) = (50, 50); raggio = 170/2 = 85
        expect(g.left + g.size / 2).toBeCloseTo(50, 5)
        expect(g.top + g.size / 2).toBeCloseTo(50, 5)
    })

    it('WAVE-GEO-03 toccando uno SPIGOLO l\'onda copre comunque la diagonale', () => {
        // È la ragione del fattore 1,7: con 1,0 un tocco sull'angolo di una
        // scheda quadrata lascerebbe scoperto l'angolo opposto, e l'onda
        // sembrerebbe fermarsi a metà strada.
        const lato = 100
        const g = talosWaveGeometry({ left: 0, top: 0, width: lato, height: lato }, 0, 0)
        const diagonale = Math.hypot(lato, lato)
        expect(g.size / 2).toBeGreaterThan(diagonale / 2)
    })

    it('WAVE-GEO-04 un fattore diverso cambia solo la larghezza, non il centro', () => {
        const a = talosWaveGeometry({ left: 0, top: 0, width: 80, height: 80 }, 40, 40, 1.7)
        const b = talosWaveGeometry({ left: 0, top: 0, width: 80, height: 80 }, 40, 40, 3)
        expect(a.left + a.size / 2).toBeCloseTo(b.left + b.size / 2, 5)
        expect(b.size).toBeGreaterThan(a.size)
    })
})

describe('WAVE-DOM — il cerchio nasce, e nei due versi', () => {
    function ospite(token: Record<string, string> = {}): HTMLElement {
        const el = conToken(token)
        el.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 200, height: 60, right: 200, bottom: 60, x: 0, y: 0, toJSON: () => ({}),
        }) as DOMRect
        document.body.append(el)
        return el
    }

    function tocco(el: HTMLElement, extra: Partial<PointerEvent> = {}): PointerEvent {
        const evento = new Event('pointerdown') as PointerEvent
        Object.assign(evento, { isPrimary: true, button: 0, clientX: 100, clientY: 30, ...extra })
        Object.defineProperty(evento, 'currentTarget', { value: el, configurable: true })
        return evento
    }

    it('WAVE-DOM-01 al tocco compare UN cerchio, dimensionato e posizionato', () => {
        const el = ospite()
        useTalosTouchWave().onPointerDown(tocco(el))
        const cerchi = el.querySelectorAll(`.${TALOS_WAVE_CLASS}`)
        expect(cerchi).toHaveLength(1)
        const cerchio = cerchi[0] as HTMLElement
        // lato lungo 200 * 1,7 = 340
        expect(cerchio.style.width).toBe('340px')
        expect(cerchio.style.height).toBe('340px')
        expect(cerchio.getAttribute('aria-hidden')).toBe('true')
    })

    it('WAVE-DOM-02 AL CONTRARIO: col token di Feedback a zero non nasce niente', () => {
        // Il cancello legge il token `calm`, non più quello del motore: è
        // quello che si vede anche dentro un `Teleport`.
        const el = ospite({ [TALOS_WAVE_GATE_TOKEN]: '0ms' })
        useTalosTouchWave().onPointerDown(tocco(el))
        expect(el.querySelectorAll(`.${TALOS_WAVE_CLASS}`)).toHaveLength(0)
        // E lo stato finale è identico a quello a riposo: nessun figlio in più.
        expect(el.childNodes).toHaveLength(0)
    })

    it('WAVE-DOM-03 AL CONTRARIO: con la riduzione di sistema non nasce niente', () => {
        chiediRiduzione(true)
        const el = ospite()
        useTalosTouchWave().onPointerDown(tocco(el))
        expect(el.childNodes).toHaveLength(0)
    })

    it('WAVE-DOM-04 un secondo dito o il tasto destro non disegnano niente', () => {
        const el = ospite()
        const onda = useTalosTouchWave()
        onda.onPointerDown(tocco(el, { isPrimary: false }))
        onda.onPointerDown(tocco(el, { button: 2 }))
        expect(el.childNodes).toHaveLength(0)
    })

    it('WAVE-DOM-05 il cerchio se ne VA da solo a fine animazione', () => {
        // Un cerchio dimenticato dentro una riga è una macchia permanente.
        const el = ospite()
        useTalosTouchWave().onPointerDown(tocco(el))
        const cerchio = el.querySelector(`.${TALOS_WAVE_CLASS}`) as HTMLElement
        cerchio.dispatchEvent(new Event('animationend'))
        expect(el.querySelectorAll(`.${TALOS_WAVE_CLASS}`)).toHaveLength(0)
    })

    it('WAVE-DOM-06 `clear()` toglie anche i cerchi ancora in corsa', () => {
        const el = ospite()
        const onda = useTalosTouchWave()
        onda.onPointerDown(tocco(el))
        onda.onPointerDown(tocco(el, { clientX: 150 }))
        expect(el.querySelectorAll(`.${TALOS_WAVE_CLASS}`)).toHaveLength(2)
        onda.clear()
        expect(el.childNodes).toHaveLength(0)
    })
})

describe('INDICATOR — il filo sa da dove veniva', () => {
    it('IND-01 uno spostamento a destra parte da sinistra', () => {
        // Mockup misurato: `translateX(-73.4375px) scaleX(0.669)`.
        const frames = talosIndicatorFrames({ left: 10, width: 40 }, { left: 90, width: 60 })
        expect(frames).not.toBeNull()
        expect(frames![0].transform).toBe('translateX(-80px) scaleX(0.6666666666666666)')
        expect(frames![1].transform).toBe('translateX(0) scaleX(1)')
    })

    it('IND-02 lo STIRAMENTO è il rapporto fra la larghezza vecchia e la nuova', () => {
        // Senza, il filo scivolerebbe già largo quanto la voce d'arrivo fin dal
        // primo fotogramma, e si leggerebbe come un salto e non come un moto.
        const frames = talosIndicatorFrames({ left: 0, width: 120 }, { left: 0, width: 60 })
        expect(frames![0].transform).toContain('scaleX(2)')
    })

    it('IND-03 se non si è mosso e non è cambiato, NON si anima', () => {
        expect(talosIndicatorFrames({ left: 12, width: 40 }, { left: 12.2, width: 40.1 })).toBeNull()
    })

    it('IND-04 una larghezza zero non produce una divisione per zero', () => {
        // Un filo non ancora disegnato ha larghezza 0: `scaleX(Infinity)` a
        // schermo è un lampo che copre la riga.
        expect(talosIndicatorFrames({ left: 0, width: 0 }, { left: 40, width: 30 })).toBeNull()
        expect(talosIndicatorFrames({ left: 0, width: 30 }, { left: 40, width: 0 })).toBeNull()
    })
})
