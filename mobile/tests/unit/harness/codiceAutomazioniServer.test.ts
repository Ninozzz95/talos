import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Il server importa il kernel col percorso del telefono: `vitest.config.ts` lo mappa sul kernel del repository.
import * as moduloArchivio from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/automation-store.mjs'
import * as moduloPianificatore from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/automation-scheduler.mjs'
import * as moduloHttp from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/http-app.mjs'

// I tipi che TypeScript ricava dal JSDoc dei .mjs sono più stretti del contratto provato qui: si dichiarano a mano.
type Voce = Record<string, unknown> & { id: string }
type Archivio = {
    crea(richiesta: Record<string, unknown>): Promise<Voce>
    imposta(id: string, attiva: boolean): Promise<Voce | null>
    leggi(id: string): Promise<Voce | null>
    registraEsecuzione(id: string, opzioni?: { sessionId?: string }): Promise<Voce | null>
}
const { createAutomationStore } = moduloArchivio as unknown as { createAutomationStore(o: Record<string, unknown>): Archivio }
const { createAutomationScheduler } = moduloPianificatore as unknown as {
    createAutomationScheduler(o: Record<string, unknown>): { unTick(): Promise<void> }
}
const { requireAutomationCreateBody } = moduloHttp as unknown as { requireAutomationCreateBody(corpo: unknown): Record<string, unknown> }

/**
 * ⭐ AUT-2 (owner 24/09/2026: «Richiesta scritta», dossier `.claude/ricerche/2026-09-24-automazioni-codice-10x4.md`).
 *
 * Misurato: il pianificatore sapeva eseguire solo `sessionRegistry.avvia(taskId)` — attività del banco di prova — e sul
 * telefono il banco è vuoto: nessuna automazione si poteva creare. Tutti i concorrenti (Hermes, ChatGPT, Claude Code,
 * Gemini, Copilot, Manus, OpenClaw) pianificano un'istruzione scritta. Qui: l'automazione porta la richiesta e parte come
 * una sessione vera del Codice (`avviaLibero`, cartella di progetto, «Workspace write»), ricorda la sua ultima sessione
 * (senza, dall'app non si vedrebbe niente) e si ferma da sola se fallisce (Temporal, «pause on failure»).
 */

const cartelle: string[] = []
afterEach(() => { for (const c of cartelle.splice(0)) rmSync(c, { recursive: true, force: true }) })

function nuovoArchivio(ora = new Date('2026-09-24T10:00:00.000Z')) {
    const cartella = mkdtempSync(join(tmpdir(), 'codice-automazioni-'))
    cartelle.push(cartella)
    let adesso = ora
    const store = createAutomationStore({ cartella, clock: () => adesso })
    return { store, avanza: (minuti: number) => { adesso = new Date(adesso.getTime() + minuti * 60_000) }, adesso: () => adesso }
}

type Evento = { type: string, message?: string }

/** Un registro delle sessioni finto: registra le partenze e permette di mandare eventi alla sessione avviata. */
function registroFinto(esito: Record<string, unknown> = { sessionId: 's-1' }) {
    const partenze: unknown[] = []
    const ascoltatori = new Map<string, (e: Evento) => void>()
    return {
        partenze,
        avviaLibero: (opzioni: unknown) => { partenze.push(opzioni); return esito },
        avvia: (taskId: string) => { partenze.push({ taskId }); return esito },
        iscriviti: (sessionId: string, ascoltatore: (e: Evento) => void) => {
            ascoltatori.set(sessionId, ascoltatore)
            return () => ascoltatori.delete(sessionId)
        },
        manda: (sessionId: string, evento: Evento) => ascoltatori.get(sessionId)?.(evento),
        ascolta: (sessionId: string) => ascoltatori.has(sessionId),
    }
}

describe('le automazioni come richiesta scritta (server del Codice)', () => {
    it('AUT-S-01 si crea con la richiesta, la cartella e il modello; nasce in pausa; il nome viene dalla prima riga', async () => {
        const { store } = nuovoArchivio()
        const voce = await store.crea({
            consegna: 'Riassumi i file nuovi della cartella\ne scrivi un indice.', cartellaId: 'workspace',
            modello: 'openrouter:z-ai/glm-5.3-flash', intervalloMinuti: 5, limiteAlGiorno: 1,
        })
        expect(voce).toMatchObject({
            consegna: 'Riassumi i file nuovi della cartella\ne scrivi un indice.', cartellaId: 'workspace',
            modello: 'openrouter:z-ai/glm-5.3-flash', nome: 'Riassumi i file nuovi della cartella', attiva: false,
            ultimaSessioneId: null, ultimoErrore: null,
        })
        expect(voce.taskId ?? null).toBeNull()
    })

    it('AUT-S-02 i tetti: richiesta vuota o troppo lunga, cartella mancante, e mai le due forme insieme', async () => {
        const { store } = nuovoArchivio()
        const base = { cartellaId: 'workspace', intervalloMinuti: 5 }
        await expect(store.crea({ ...base, consegna: '   ' })).rejects.toThrow()
        await expect(store.crea({ ...base, consegna: 'x'.repeat(4001) })).rejects.toThrow()
        await expect(store.crea({ consegna: 'Fai qualcosa', intervalloMinuti: 5 })).rejects.toThrow()
        await expect(store.crea({ ...base, consegna: 'Fai qualcosa', taskId: 'sconto-a-scaglioni' })).rejects.toThrow()
        // La forma del banco di prova (desktop) resta com'era.
        await expect(store.crea({ taskId: 'sconto-a-scaglioni', intervalloMinuti: 5 })).resolves.toMatchObject({ taskId: 'sconto-a-scaglioni' })
    })

    it('AUT-S-03 al suo turno parte come una sessione vera del Codice e ricorda quale', async () => {
        const { store, avanza } = nuovoArchivio()
        const voce = await store.crea({ consegna: 'Controlla la cartella', cartellaId: 'workspace', modello: 'm-1', intervalloMinuti: 5, limiteAlGiorno: 2 })
        await store.imposta(voce.id, true)
        const registro = registroFinto({ sessionId: 's-7' })
        const orologio = { ora: new Date('2026-09-24T10:00:00.000Z') }
        const pianificatore = createAutomationScheduler({ store, sessionRegistry: registro as never, clock: () => orologio.ora })

        orologio.ora = new Date('2026-09-24T10:06:00.000Z')
        avanza(6)
        await pianificatore.unTick()

        expect(registro.partenze).toEqual([{
            cartellaId: 'workspace', consegna: 'Controlla la cartella', modello: 'm-1', mobile: true, permessi: 'Workspace write',
        }])
        const dopo = await store.leggi(voce.id)
        expect(dopo).toMatchObject({ ultimaSessioneId: 's-7', eseguiteOggi: 1, attiva: true, ultimoErrore: null })
        expect(registro.ascolta('s-7')).toBe(true)
    })

    it('AUT-S-04 se non riesce a partire si mette in pausa col motivo, e la partenza fallita non si conta', async () => {
        const { store, avanza } = nuovoArchivio()
        const voce = await store.crea({ consegna: 'Controlla', cartellaId: 'workspace', intervalloMinuti: 5 })
        await store.imposta(voce.id, true)
        const registro = registroFinto({ erroreAvvio: 'Modello non valido', code: 'QUERY_INVALID' })
        const orologio = { ora: new Date('2026-09-24T10:06:00.000Z') }
        avanza(6)
        await createAutomationScheduler({ store, sessionRegistry: registro as never, clock: () => orologio.ora }).unTick()

        const dopo = await store.leggi(voce.id)
        expect(dopo).toMatchObject({ attiva: false, prossimaEsecuzione: null, ultimoErrore: 'Modello non valido', eseguiteOggi: 0 })
    })

    it('AUT-S-05 se il giro finisce in errore si mette in pausa col motivo; riaccesa a mano, il motivo sparisce', async () => {
        const { store, avanza } = nuovoArchivio()
        const voce = await store.crea({ consegna: 'Controlla', cartellaId: 'workspace', intervalloMinuti: 5 })
        await store.imposta(voce.id, true)
        const registro = registroFinto({ sessionId: 's-9' })
        const orologio = { ora: new Date('2026-09-24T10:06:00.000Z') }
        avanza(6)
        await createAutomationScheduler({ store, sessionRegistry: registro as never, clock: () => orologio.ora }).unTick()

        registro.manda('s-9', { type: 'RunError', message: 'Credito esaurito' })
        await new Promise((ok) => setTimeout(ok, 30))
        expect(await store.leggi(voce.id)).toMatchObject({ attiva: false, ultimoErrore: 'Credito esaurito', ultimaSessioneId: 's-9' })
        expect(registro.ascolta('s-9')).toBe(false)

        await store.imposta(voce.id, true)
        expect(await store.leggi(voce.id)).toMatchObject({ attiva: true, ultimoErrore: null })
    })

    it('AUT-S-06 un giro concluso bene smette di essere ascoltato e lascia l’automazione attiva', async () => {
        const { store, avanza } = nuovoArchivio()
        const voce = await store.crea({ consegna: 'Controlla', cartellaId: 'workspace', intervalloMinuti: 5 })
        await store.imposta(voce.id, true)
        const registro = registroFinto({ sessionId: 's-10' })
        avanza(6)
        await createAutomationScheduler({ store, sessionRegistry: registro as never, clock: () => new Date('2026-09-24T10:06:00.000Z') }).unTick()

        registro.manda('s-10', { type: 'RunFinished' })
        await new Promise((ok) => setTimeout(ok, 30))
        expect(registro.ascolta('s-10')).toBe(false)
        expect(await store.leggi(voce.id)).toMatchObject({ attiva: true, ultimoErrore: null })
    })

    // ⭐ 24/09/2026 (AUT-2c, trovato sul Pad): raggiunto il limite, la prossima esecuzione annunciata era «fra 5 minuti»
    // mentre il pianificatore aspetta il cambio di giorno — la riga e la scheda dicevano un orario falso.
    it('AUT-S-08 raggiunto il limite, la prossima esecuzione è quella vera: il cambio di giorno, o dopo se l’intervallo è più lungo', async () => {
        // GIORNO-LOCALE-01 (owner 25/09/2026): il cambio di giorno è la mezzanotte del telefono; ore in ora locale.
        for (const [intervalloMinuti, limiteAlGiorno, attesa] of [
            [5, 1, new Date(2026, 8, 25, 0, 0).toISOString()],
            [900, 1, new Date(2026, 8, 25, 1, 6).toISOString()],
            [5, 2, new Date(2026, 8, 24, 10, 11).toISOString()],
        ] as const) {
            const { store } = nuovoArchivio(new Date(2026, 8, 24, 10, 6))
            const voce = await store.crea({ consegna: 'Controlla', cartellaId: 'workspace', intervalloMinuti, limiteAlGiorno })
            await store.registraEsecuzione(voce.id, { sessionId: 's-8' })
            expect((await store.leggi(voce.id))?.prossimaEsecuzione, `${intervalloMinuti} min, max ${limiteAlGiorno}`).toBe(attesa)
        }
    })

    /*
     * GIORNO-LOCALE-01 (owner 25/09/2026, «giorno locale»): il conteggio degli avvii era sul giorno UTC — in Italia
     * d'estate si azzerava alle 02:00. Ora sul giorno del telefono: mezzanotte locale. Le ore si costruiscono in ora
     * LOCALE (`new Date(anno, mese, giorno, ore)`), così la prova vale in qualunque fuso giri.
     */
    it('GIORNO-LOCALE-01 il contatore si azzera a mezzanotte locale, e al limite la ripresa è la mezzanotte locale', async () => {
        const { store } = nuovoArchivio(new Date(2026, 8, 24, 23, 30))
        const voce = await store.crea({ consegna: 'Controlla', cartellaId: 'workspace', intervalloMinuti: 5, limiteAlGiorno: 1 } as never)
        await store.imposta(voce.id, true)
        const dopo = await store.registraEsecuzione(voce.id)
        expect(dopo).toMatchObject({ giornoContatore: '2026-09-24', eseguiteOggi: 1 })
        expect(new Date(dopo!.prossimaEsecuzione!).getTime()).toBe(new Date(2026, 8, 25, 0, 0).getTime())
    })

    it('GIORNO-LOCALE-02 dopo la mezzanotte locale il pianificatore riparte da zero', async () => {
        const { store } = nuovoArchivio(new Date(2026, 8, 24, 23, 30))
        const voce = await store.crea({ consegna: 'Controlla', cartellaId: 'workspace', intervalloMinuti: 5, limiteAlGiorno: 1 } as never)
        await store.imposta(voce.id, true)
        await store.registraEsecuzione(voce.id)
        const registro = registroFinto({ sessionId: 's-12' })
        await createAutomationScheduler({ store, sessionRegistry: registro as never, clock: () => new Date(2026, 8, 24, 23, 50) }).unTick()
        expect(registro.partenze).toHaveLength(0)
        await createAutomationScheduler({ store, sessionRegistry: registro as never, clock: () => new Date(2026, 8, 25, 0, 5) }).unTick()
        expect(registro.partenze).toHaveLength(1)
    })

    // AUT-S-09 (25/09/2026, owner «Salvato alla creazione»): il livello di ragionamento viaggia con l'automazione.
    it('AUT-S-09 il livello si accetta, si salva e arriva alla partenza', async () => {
        expect(requireAutomationCreateBody({ consegna: 'Fai', cartellaId: 'w', intervalloMinuti: 5, reasoning: { effort: 'high' } }))
            .toMatchObject({ reasoning: { effort: 'high' } })
        expect(() => requireAutomationCreateBody({ consegna: 'Fai', cartellaId: 'w', intervalloMinuti: 5, reasoning: { effort: 'turbo' } })).toThrow()
        const { store, avanza } = nuovoArchivio()
        const voce = await store.crea({ consegna: 'Controlla', cartellaId: 'workspace', modello: 'm-1', reasoning: { effort: 'high' }, intervalloMinuti: 5 } as never)
        expect(voce).toMatchObject({ reasoning: { effort: 'high' } })
        await store.imposta(voce.id, true)
        const registro = registroFinto({ sessionId: 's-11' })
        avanza(6)
        await createAutomationScheduler({ store, sessionRegistry: registro as never, clock: () => new Date('2026-09-24T10:06:00.000Z') }).unTick()
        expect(registro.partenze[0]).toMatchObject({ modello: 'm-1', reasoning: { effort: 'high' } })
    })

    it('AUT-S-07 il corpo HTTP: una delle due forme, mai tutte e due, e niente chiavi estranee', () => {
        expect(requireAutomationCreateBody({ consegna: 'Fai', cartellaId: 'workspace', modello: 'm', intervalloMinuti: 5, limiteAlGiorno: 1, nome: 'n' }))
            .toEqual({ consegna: 'Fai', cartellaId: 'workspace', modello: 'm', intervalloMinuti: 5, limiteAlGiorno: 1, nome: 'n' })
        expect(requireAutomationCreateBody({ taskId: 't', intervalloMinuti: 5 })).toMatchObject({ taskId: 't', intervalloMinuti: 5 })
        expect(() => requireAutomationCreateBody({ consegna: 'Fai', taskId: 't', cartellaId: 'w', intervalloMinuti: 5 })).toThrow()
        expect(() => requireAutomationCreateBody({ consegna: 'Fai', cartellaId: 'w', intervalloMinuti: 5, extra: 1 })).toThrow()
        expect(() => requireAutomationCreateBody({ consegna: 3, cartellaId: 'w', intervalloMinuti: 5 })).toThrow()
    })
})
