import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐ 12/9 — l'avviso del collegamento nella sezione Codice, provato NEI DUE VERSI
 * (regola [[provare-sempre-anche-il-verso-contrario]]): ponte staccato ⇒ avviso
 * con i passi e UNA azione; ponte collegato ⇒ SILENZIO. Un avviso che non sa
 * tacere è rumore, e quel difetto si vede solo provando il verso che «non
 * serve».
 *
 * ⛔ `Capacitor` è finto qui perché `leggiStatoPonteCodice` lo importa al volo:
 * senza, il modulo reale proverebbe a registrare un plugin in jsdom.
 */
const capacitorMock = vi.hoisted(() => ({
    isPluginAvailable: vi.fn(() => false),
    registerPlugin: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))

import {
    TALOS_AVVISO_PONTE_DURATA_MS,
    TALOS_AVVISO_PONTE_RIGUARDA_MS,
    TALOS_AVVISO_PONTE_RIGUARDI_MAX,
    __resetAvvisoPonteCodicePerTest,
    avvisaSePonteStaccato,
    leggiStatoPonteCodice,
    type TalosStatoPonteCodice,
} from '@/lib/harness/avvisoPonteCodice'

interface ToastRegistrato {
    message: string
    action?: { label: string, run: () => void }
    durationMs?: number
}

function bancoToast() {
    const spinti: ToastRegistrato[] = []
    const chiusi: number[] = []
    let prossimo = 1
    return {
        spinti,
        chiusi,
        push: vi.fn((toast: ToastRegistrato) => { spinti.push(toast); return prossimo++ }),
        dismiss: vi.fn((id: number) => { chiusi.push(id) }),
    }
}

function bancoRouter() {
    const guardie: ((to: { name?: unknown }) => void)[] = []
    return {
        guardie,
        push: vi.fn(),
        afterEach: vi.fn((guardia: (to: { name?: unknown }) => void) => { guardie.push(guardia) }),
        vaiA(nome: string) { guardie.forEach((guardia) => guardia({ name: nome })) },
    }
}

/** La traduzione qui è l'identità: si prova QUALE chiave esce, non l'italiano. */
const t = (chiave: string) => chiave

function opzioni(stato: TalosStatoPonteCodice, banchi: { toasts: ReturnType<typeof bancoToast>, router: ReturnType<typeof bancoRouter> }) {
    return {
        router: banchi.router,
        toasts: banchi.toasts,
        t,
        sezioneDisponibile: true,
        leggiStato: vi.fn(async () => stato),
    }
}

describe('avvisoPonteCodice — lo stato letto dal ponte', () => {
    beforeEach(() => {
        __resetAvvisoPonteCodicePerTest()
        capacitorMock.isPluginAvailable.mockReset()
        capacitorMock.registerPlugin.mockReset()
    })

    it('senza il plugin dice «sconosciuto», MAI «staccato»', async () => {
        capacitorMock.isPluginAvailable.mockReturnValue(false)
        await expect(leggiStatoPonteCodice()).resolves.toBe('sconosciuto')
        expect(capacitorMock.registerPlugin).not.toHaveBeenCalled()
    })

    it('packaged+connected ⇒ collegato; packaged senza connected ⇒ staccato; senza packaged ⇒ assente', async () => {
        capacitorMock.isPluginAvailable.mockReturnValue(true)
        const risposte = [
            { packaged: true, connected: true },
            { packaged: true, connected: false },
            { packaged: false, connected: false },
        ]
        capacitorMock.registerPlugin.mockReturnValue({ bridgeStatus: vi.fn(async () => risposte[0]) })
        await expect(leggiStatoPonteCodice()).resolves.toBe('collegato')
        capacitorMock.registerPlugin.mockReturnValue({ bridgeStatus: vi.fn(async () => risposte[1]) })
        await expect(leggiStatoPonteCodice()).resolves.toBe('staccato')
        capacitorMock.registerPlugin.mockReturnValue({ bridgeStatus: vi.fn(async () => risposte[2]) })
        await expect(leggiStatoPonteCodice()).resolves.toBe('assente')
    })

    it('se il ponte lancia, lo stato resta «sconosciuto» e nessuno viene accusato', async () => {
        capacitorMock.isPluginAvailable.mockReturnValue(true)
        capacitorMock.registerPlugin.mockReturnValue({
            bridgeStatus: vi.fn(async () => { throw new Error('ponte muto') }),
        })
        await expect(leggiStatoPonteCodice()).resolves.toBe('sconosciuto')
    })
})

describe('avvisoPonteCodice — l’avviso', () => {
    let toasts: ReturnType<typeof bancoToast>
    let router: ReturnType<typeof bancoRouter>

    beforeEach(() => {
        __resetAvvisoPonteCodicePerTest()
        vi.useFakeTimers()
        toasts = bancoToast()
        router = bancoRouter()
    })

    afterEach(() => {
        vi.useRealTimers()
        __resetAvvisoPonteCodicePerTest()
    })

    it('DRITTO — ponte staccato: un avviso solo, coi passi e UNA azione che apre Controllo del telefono', async () => {
        const esito = await avvisaSePonteStaccato(opzioni('staccato', { toasts, router }))

        expect(esito).toMatchObject({ mostrato: true, stato: 'staccato' })
        expect(toasts.spinti).toHaveLength(1)
        const avviso = toasts.spinti[0]
        expect(avviso.message).toBe('harness.bridgeOffline')
        expect(avviso.durationMs).toBe(TALOS_AVVISO_PONTE_DURATA_MS)
        // Material: al massimo UNA azione, e mai «Chiudi»/«Annulla».
        expect(avviso.action?.label).toBe('harness.bridgeOfflineAction')
        avviso.action?.run()
        expect(router.push).toHaveBeenCalledWith({ name: 'settings-privilege' })
    })

    it('CONTRARIO — ponte collegato: nessun avviso', async () => {
        const esito = await avvisaSePonteStaccato(opzioni('collegato', { toasts, router }))

        expect(esito).toMatchObject({ mostrato: false, motivo: 'ponte-collegato' })
        expect(toasts.push).not.toHaveBeenCalled()
    })

    it('CONTRARIO — stato sconosciuto: nessun avviso inventato', async () => {
        const esito = await avvisaSePonteStaccato(opzioni('sconosciuto', { toasts, router }))

        expect(esito).toMatchObject({ mostrato: false, motivo: 'stato-sconosciuto' })
        expect(toasts.push).not.toHaveBeenCalled()
    })

    it('CONTRARIO — Codice non disponibile in questa build: nessun avviso, e il ponte non viene nemmeno chiesto', async () => {
        const base = opzioni('staccato', { toasts, router })
        const esito = await avvisaSePonteStaccato({ ...base, sezioneDisponibile: false })

        expect(esito).toMatchObject({ mostrato: false, motivo: 'sezione-non-disponibile' })
        expect(base.leggiStato).not.toHaveBeenCalled()
        expect(toasts.push).not.toHaveBeenCalled()
    })

    it('ponte assente dalla copia: si dice com’è, senza un pulsante che non rimedia', async () => {
        const esito = await avvisaSePonteStaccato(opzioni('assente', { toasts, router }))

        expect(esito).toMatchObject({ mostrato: true, stato: 'assente' })
        expect(toasts.spinti[0].message).toBe('harness.bridgeMissing')
        expect(toasts.spinti[0].action).toBeUndefined()
    })

    it('UNA volta per ingresso: lista e sessione nello stesso ingresso fanno UN avviso', async () => {
        await avvisaSePonteStaccato(opzioni('staccato', { toasts, router }))
        const secondo = await avvisaSePonteStaccato(opzioni('staccato', { toasts, router }))

        expect(secondo).toMatchObject({ mostrato: false, motivo: 'gia-avvisato' })
        expect(toasts.push).toHaveBeenCalledTimes(1)
    })

    it('due montaggi NELLO STESSO tick (sidebar tablet + schermata) restano UN avviso', async () => {
        const primo = avvisaSePonteStaccato(opzioni('staccato', { toasts, router }))
        const secondo = avvisaSePonteStaccato(opzioni('staccato', { toasts, router }))
        await Promise.all([primo, secondo])

        expect(toasts.push).toHaveBeenCalledTimes(1)
    })

    it('navigare DENTRO Codice non riapre la visita; uscire sì', async () => {
        await avvisaSePonteStaccato(opzioni('staccato', { toasts, router }))
        router.vaiA('harness-session')
        expect(await avvisaSePonteStaccato(opzioni('staccato', { toasts, router })))
            .toMatchObject({ motivo: 'gia-avvisato' })

        router.vaiA('chat')
        const rientro = await avvisaSePonteStaccato(opzioni('staccato', { toasts, router }))

        expect(rientro).toMatchObject({ mostrato: true })
        expect(toasts.push).toHaveBeenCalledTimes(2)
    })

    it('CONTRARIO — se il ponte torna su MENTRE l’avviso è a schermo, l’avviso se ne va', async () => {
        let stato: TalosStatoPonteCodice = 'staccato'
        const id = await avvisaSePonteStaccato({
            router,
            toasts,
            t,
            sezioneDisponibile: true,
            leggiStato: async () => stato,
        })
        expect(id.mostrato).toBe(true)

        stato = 'collegato'
        await vi.advanceTimersByTimeAsync(TALOS_AVVISO_PONTE_RIGUARDA_MS)

        expect(toasts.dismiss).toHaveBeenCalledWith(1)
    })

    it('il riguardo ha un TETTO: non diventa un battito perpetuo', async () => {
        const leggiStato = vi.fn(async (): Promise<TalosStatoPonteCodice> => 'staccato')
        await avvisaSePonteStaccato({ router, toasts, t, sezioneDisponibile: true, leggiStato })
        const dopoAvviso = leggiStato.mock.calls.length

        await vi.advanceTimersByTimeAsync(TALOS_AVVISO_PONTE_RIGUARDA_MS * (TALOS_AVVISO_PONTE_RIGUARDI_MAX + 6))

        expect(leggiStato.mock.calls.length - dopoAvviso).toBe(TALOS_AVVISO_PONTE_RIGUARDI_MAX)
        expect(toasts.dismiss).not.toHaveBeenCalled()
    })

    it('un router senza afterEach non rompe niente (i test di schermata montano con un router finto)', async () => {
        const routerNudo = { push: vi.fn() }
        const esito = await avvisaSePonteStaccato({
            router: routerNudo,
            toasts,
            t,
            sezioneDisponibile: true,
            leggiStato: async () => 'staccato',
        })

        expect(esito.mostrato).toBe(true)
    })
})

/**
 * ⛔ COD-AVVISO-01 — owner 13/10/2026, dal Pad, guardando il Codice: «questo alert è troppo strano e mi dà fastidio,
 * sistemiamolo» → scelta: «Toast corto, sopra il campo». MISURATO sulle foto del Pad (orizzontale e verticale): l'avviso
 * del 12/09 era di sette righe, restava 12 secondi e a tastiera aperta copriva il testo che si stava scrivendo, perché la
 * regione degli avvisi conosceva solo l'altezza del compositore della CHAT.
 */
describe('COD-AVVISO-01: l avviso del terminale è corto e non copre mai il campo', () => {
    it('una riga in tutte e due le lingue, un azione che dice cosa fa, sei secondi', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const radice = resolve(__dirname, '../../..')
        for (const lingua of ['it', 'en']) {
            const testo = readFileSync(resolve(radice, `src/i18n/locales/${lingua}.ts`), 'utf8')
            const frase = /bridgeOffline: '([^']*)'/.exec(testo)?.[1] ?? ''
            const azione = /bridgeOfflineAction: '([^']*)'/.exec(testo)?.[1] ?? ''
            const assente = /bridgeMissing: '([^']*)'/.exec(testo)?.[1] ?? ''
            expect(frase.length, `${lingua}: ${frase}`).toBeGreaterThan(0)
            expect(frase.length, `${lingua}: ${frase}`).toBeLessThanOrEqual(32)
            expect(assente.length, `${lingua}: ${assente}`).toBeLessThanOrEqual(48)
            expect(['Collega', 'Connect']).toContain(azione)
        }
        expect(TALOS_AVVISO_PONTE_DURATA_MS).toBe(6_000)
    })

    it('la regione degli avvisi sta sopra il compositore del Codice, che pubblica quanto spazio occupa dal fondo', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const radice = resolve(__dirname, '../../..')
        const regione = readFileSync(resolve(radice, 'src/components/shell/TalosMobileToastRegion.vue'), 'utf8')
        expect(regione).toContain('max(var(--talos-composer-height,180px),var(--talos-code-composer-height,0px))')
        const codice = readFileSync(resolve(radice, 'src/screens/HarnessSessionScreen.vue'), 'utf8')
        expect(codice).toContain("document.documentElement.style.setProperty('--talos-code-composer-height'")
        // e la toglie quando esce: fuori dal Codice quell'altezza non esiste
        expect(codice).toContain("document.documentElement.style.removeProperty('--talos-code-composer-height')")
    })
})

/**
 * ⛔ COD-CASA-AVVISO — 13/10/2026, «Codice in casa». MISURATO sul Pad a ponte scollegato: il Codice risponde, l'agente
 * esegue i comandi e il campo della scheda Terminale funziona, coi permessi dell'app. L'avviso d'ingresso «Terminale non
 * collegato» direbbe quindi una cosa FALSA: dove il Codice gira in casa non si mostra. Dove non può (APK senza Node fra le
 * librerie native, cioè la strada del ponte) resta com'era.
 */
describe('COD-CASA-AVVISO: dove il Codice gira in casa l avviso d ingresso non compare', () => {
    beforeEach(() => { __resetAvvisoPonteCodicePerTest() })
    afterEach(() => { __resetAvvisoPonteCodicePerTest() })

    it('in casa: nessun avviso, e il ponte non viene nemmeno interrogato', async () => {
        const toasts = bancoToast(); const router = bancoRouter()
        const leggiStato = vi.fn(async () => 'staccato' as const)
        const esito = await avvisaSePonteStaccato({
            router, toasts, t: (k: string) => k, sezioneDisponibile: true, leggiStato, codiceInCasa: async () => true,
        })
        expect(esito).toMatchObject({ mostrato: false, motivo: 'codice-in-casa' })
        expect(toasts.spinti).toHaveLength(0)
        expect(leggiStato).not.toHaveBeenCalled()
    })

    it('AL CONTRARIO: se in casa non può girare, o se non si riesce a saperlo, l avviso resta quello di prima', async () => {
        for (const codiceInCasa of [async () => false, async () => { throw new Error('plugin muto') }]) {
            __resetAvvisoPonteCodicePerTest()
            const toasts = bancoToast(); const router = bancoRouter()
            const esito = await avvisaSePonteStaccato({
                router, toasts, t: (k: string) => k, sezioneDisponibile: true, leggiStato: async () => 'staccato', codiceInCasa,
            })
            expect(esito).toMatchObject({ mostrato: true, stato: 'staccato' })
            expect(toasts.spinti).toHaveLength(1)
        }
    })

    it('le due schermate del Codice passano la stessa domanda al nativo', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const radice = resolve(__dirname, '../../..')
        for (const schermata of ['src/screens/HarnessSessionScreen.vue', 'src/screens/HarnessScreen.vue']) {
            expect(readFileSync(resolve(radice, schermata), 'utf8')).toContain('codiceInCasa: talosCodiceInCasa')
        }
        expect(readFileSync(resolve(radice, 'src/lib/harness/terminalePonte.ts'), 'utf8')).toContain('export async function talosCodiceInCasa(): Promise<boolean>')
    })
})
