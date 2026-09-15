import { describe, expect, it, vi } from 'vitest'
import {
    TALOS_LIMITI_PREDEFINITI,
    talosFraseDiFine,
    talosGuidaLoSchermo,
    type TalosPortePilota,
    type TalosSguardo,
} from '@/lib/agent/pilotaDelloSchermo'

/**
 * ⛔⛔ I QUATTRO MODI DI NON FINIRE MAI, e quello di non partire.
 *
 * Un agente che tocca lo schermo di un'altra persona senza un tetto non è un
 * agente: è un guasto che si ripete. Qui ogni tetto ha il suo caso, e ognuno
 * FALLISCE se il tetto sparisce — che è l'unica cosa che rende un tetto vero.
 *
 * ⛔ Il tempo e i passi si provano con un orologio FINTO: far scadere davvero
 * due minuti in una suite non lo fa nessuno, e un tetto che nessuno prova è un
 * commento con dentro un numero.
 */
const SCHERMO: TalosSguardo = {
    elementi: [
        { indice: 0, tipo: 'campo', etichetta: 'Cerca' },
        { indice: 1, tipo: 'tocca', etichetta: 'Invio' },
    ],
    frenoArmato: true,
    manoSulloSchermo: false,
}

function porte(su: Partial<TalosPortePilota> & { sguardo?: () => TalosSguardo | null } = {}) {
    let orologio = 0
    const base: TalosPortePilota = {
        // ⛔ Senza ordinale nella frase, la guardia degli ordinali non scatta:
        // questi casi provano i TETTI, e un obiettivo che dicesse «il primo»
        // farebbe scattare un controllo che non c'entra con quello che provano.
        obiettivo: 'cerca il meteo',
        guarda: vi.fn(async () => (su.sguardo ? su.sguardo() : SCHERMO)),
        agisci: vi.fn(async () => ({ fatto: true })),
        chiedi: vi.fn(async () => '{"azione":"tocca","indice":1,"perche":"tocco Invio"}'),
        racconta: vi.fn(),
        // Ogni giro costa un secondo finto: così il tetto del tempo si tocca
        // senza aspettare, e i passi restano contati davvero.
        adesso: vi.fn(() => (orologio += 1_000)),
    }
    return { ...base, ...su } as TalosPortePilota
}

describe('⛔ i tetti del pilota', () => {
    it('TETTO PASSI: si ferma al numero dichiarato, non uno di più', async () => {
        const p = porte()
        const corsa = await talosGuidaLoSchermo(p, {
            ...TALOS_LIMITI_PREDEFINITI,
            passi: 3,
            millisecondi: 10_000_000,
        })
        expect(corsa.fine.motivo).toBe('troppi-passi')
        expect(corsa.passi).toBe(3)
        expect(p.agisci).toHaveBeenCalledTimes(3)
    })

    it('TETTO TEMPO: scade anche se i passi basterebbero', async () => {
        const corsa = await talosGuidaLoSchermo(porte(), {
            ...TALOS_LIMITI_PREDEFINITI,
            passi: 1_000,
            // Ogni chiamata all'orologio avanza di 1 s; il giro ne fa due.
            millisecondi: 6_000,
        })
        expect(corsa.fine.motivo).toBe('tempo-scaduto')
        expect(corsa.passi).toBeLessThan(1_000)
    })

    it('TETTO FALLIMENTI: due di fila e basta — decisione dell\'owner', async () => {
        const p = porte({ agisci: vi.fn(async () => ({ fatto: false, motivo: 'rifiutata' })) })
        const corsa = await talosGuidaLoSchermo(p)
        expect(corsa.fine).toEqual({ motivo: 'troppi-fallimenti', ultimo: 'rifiutata' })
        expect(p.agisci).toHaveBeenCalledTimes(2)
    })

    it('⛔ e il contatore si AZZERA quando una riesce: due sparsi non sono due di fila', async () => {
        let giro = 0
        const p = porte({
            // no, sì, no, sì, … non deve fermarsi mai per fallimenti.
            agisci: vi.fn(async () => ({ fatto: (giro++ % 2) === 1, motivo: 'rifiutata' })),
        })
        const corsa = await talosGuidaLoSchermo(p, {
            ...TALOS_LIMITI_PREDEFINITI,
            passi: 8,
            millisecondi: 10_000_000,
        })
        expect(corsa.fine.motivo).toBe('troppi-passi')
    })

    /*
     * ⛔⛔ CAPOVOLTO PER DECISIONE DELL'OWNER — 2026-08-13:
     *
     * > «SE NECESSARIO DOBBIAMO TOGLIERE QUESTO FRENO COMPLETAMENTE, NON ME NE
     * > FREGA UN CAZZO, fai una ricerca web. gemini non fa così»
     *
     * Questo test asseriva che una mano vista FERMA la corsa. Sul dispositivo
     * quella regola non proteggeva nessuno: MISURATO con nessuno che toccava
     * il tablet, il pilota si chiudeva con `mano-sullo-schermo` a `passi=2`,
     * perché sentiva le CONSEGUENZE delle proprie azioni (TALOS digita,
     * WhatsApp reagisce, l'evento arriva oltre i 400 ms di sordità). La sonda
     * ha poi misurato ritardi di 401.663.098 ms: la sordità non era nemmeno
     * armata. ⇒ Il pilota non arrivava MAI in fondo.
     *
     * Gemini non rileva i tocchi: dà una barra di progresso con uno STOP
     * esplicito. Un rilevamento che sbaglia toglie la funzione senza dare
     * sicurezza.
     *
     * ⛔ Il segnale resta RACCOLTO — serve al comando di arresto che lo
     * sostituisce — ma smette di decidere al posto della persona.
     */
    it('⛔ la mano NON ferma più la corsa: decide la persona, non un indovinello', async () => {
        const p = porte({ sguardo: () => ({ ...SCHERMO, manoSulloSchermo: true }) })
        const corsa = await talosGuidaLoSchermo(p)
        expect(corsa.fine.motivo).not.toBe('mano-sullo-schermo')
        // E la corsa fa il suo lavoro invece di morire al primo giro.
        expect(p.chiedi).toHaveBeenCalled()
    })

    it('⛔ FRENO NON ARMATO: non si parte affatto — «non lo so» non è «nessuno ha toccato»', async () => {
        const p = porte({ sguardo: () => ({ ...SCHERMO, frenoArmato: false }) })
        const corsa = await talosGuidaLoSchermo(p)
        expect(corsa.fine.motivo).toBe('freno-non-armato')
        expect(p.agisci).not.toHaveBeenCalled()
    })

    it('l\'occhio chiuso si distingue dal freno spento', async () => {
        const corsa = await talosGuidaLoSchermo(porte({ sguardo: () => null }))
        expect(corsa.fine.motivo).toBe('occhio-chiuso')
    })

    /*
     * ⛔⛔ E LA RISPOSTA ILLEGGIBILE VALE UN TENTATIVO, non la corsa — #13.
     *
     * MISURATO sul Pad il 2026-08-15, chiesto «apri WhatsApp, cerca la chat con
     * Antonino e dimmi solo il titolo»:
     *
     * ```
     * pilota: fine={"motivo":"modello-non-capito",
     *               "scarto":"indiceFuoriElenco","dettaglio":"-1"} passi=0
     * ```
     *
     * **passi=0**: il pilota non ha fatto niente. Il modello aveva detto
     * `indice: -1` — «qui non c'è niente da toccare», convenzione che il
     * contratto non prevede — perché lo sguardo era ancora sulla schermata di
     * partenza. Un'azione che FALLISCE aveva due tentativi; una risposta che
     * non si LEGGE ne aveva zero, pur essendo il caso più facile da recuperare.
     */
    it('⛔ una risposta illeggibile RIPROVA, e la seconda buona salva la corsa', async () => {
        let giro = 0
        const p = porte({
            chiedi: vi.fn(async () => (giro++ === 0
                ? '{"azione":"tocca","indice":-1,"perche":"qui non c\'è niente"}'
                : '{"azione":"fine","testo":"trovato"}')),
        })
        const corsa = await talosGuidaLoSchermo(p)

        expect(corsa.fine, 'il -1 non deve più uccidere la corsa').toEqual({
            motivo: 'fine', testo: 'trovato',
        })
        expect(p.chiedi, 'deve aver ridomandato').toHaveBeenCalledTimes(2)
        // ⛔ E la seconda domanda NON è la prima: la storia porta lo scarto e
        // dice cosa fare invece, se no si ottiene due volte la stessa risposta.
        const rimprovero = corsa.storia.find((r) => r.includes('indiceFuoriElenco'))
        expect(rimprovero, `storia: ${JSON.stringify(corsa.storia)}`).toBeDefined()
        expect(rimprovero).toContain('-1')
        expect(rimprovero).toContain('apri_app')
    })

    it('⛔ ma il tetto resta il SUO: due risposte illeggibili di fila e stop', async () => {
        const p = porte({
            chiedi: vi.fn(async () => '{"azione":"tocca","indice":-1,"perche":"niente"}'),
        })
        const corsa = await talosGuidaLoSchermo(p)

        expect(corsa.fine).toEqual({
            motivo: 'modello-non-capito', scarto: 'indiceFuoriElenco', dettaglio: '-1',
        })
        // `fallimentiDiFila: 2` è la decisione dell'owner del 2026-08-10: due
        // tentativi, non tre. Un secondo contatore accanto al primo sarebbe un
        // tetto nuovo deciso da noi.
        expect(p.chiedi).toHaveBeenCalledTimes(2)
        expect(p.agisci, 'nessun dito ha toccato niente').not.toHaveBeenCalled()
        expect(corsa.passi, 'nessun passo: nessuno ha toccato lo schermo').toBe(0)
    })

    it('una riga che non si capisce ferma la corsa invece di far toccare a caso', async () => {
        const p = porte({ chiedi: vi.fn(async () => 'Certo! Adesso tocco il pulsante.') })
        const corsa = await talosGuidaLoSchermo(p)
        /*
         * ⛔ Il `dettaglio` è ASSERITO, non tollerato.
         *
         * MISURATO sul Pad il 2026-08-13: la corsa si chiudeva con
         * `{"motivo":"modello-non-capito","scarto":"nessunJson"}` e nient'altro
         * — e da quella riga non si distingue una risposta in PROSA (il modello
         * ha parlato invece di agire) da una risposta VUOTA (la chiamata è
         * fallita e qualcuno se l'è mangiata). Sono due difetti diversi, con
         * due cause in due strati diversi. La frase riportata li separa.
         */
        expect(corsa.fine).toEqual({
            motivo: 'modello-non-capito',
            scarto: 'nessunJson',
            dettaglio: 'Certo! Adesso tocco il pulsante.',
        })
        expect(p.agisci).not.toHaveBeenCalled()
    })

    it('«fine» chiude bene, e la storia contiene il passo', async () => {
        const p = porte({
            chiedi: vi.fn(async () => '{"azione":"fine","testo":"ho cercato il meteo"}'),
        })
        const corsa = await talosGuidaLoSchermo(p)
        expect(corsa.fine).toEqual({ motivo: 'fine', testo: 'ho cercato il meteo' })
        expect(corsa.storia).toHaveLength(1)
        expect(p.agisci).not.toHaveBeenCalled()
    })
})

describe('⭐ si racconta PRIMA di toccare', () => {
    it('la frase esce prima dell\'azione, non dopo', async () => {
        const ordine: string[] = []
        const p = porte({
            racconta: vi.fn(() => { ordine.push('detto') }),
            agisci: vi.fn(async () => { ordine.push('toccato'); return { fatto: true } }),
        })
        await talosGuidaLoSchermo(p, { ...TALOS_LIMITI_PREDEFINITI, passi: 1, millisecondi: 10_000_000 })
        // ⛔ Se un giorno si invertisse, chi ascolta scoprirebbe il tocco DOPO
        // che è arrivato — e non avrebbe più modo di dire «no, aspetta».
        expect(ordine).toEqual(['detto', 'toccato'])
    })

    it('⛔ NON legge il «perché» del modello: la frase la costruisce la voce', async () => {
        /*
         * Owner 2026-08-10: «le frasi del TTS devono essere il meno meccaniche
         * e robotiche possibile». `azione.perche` lo scrive il modello — in
         * inglese quando gli gira, lungo quanto vuole, con dentro gli indici.
         * La riga che si sente è quella di `voceDelPilota`: verbo umano,
         * etichetta a schermo, e l'apertura solo al primo passo.
         */
        const p = porte()
        await talosGuidaLoSchermo(p, { ...TALOS_LIMITI_PREDEFINITI, passi: 1, millisecondi: 1e7 })
        expect(vi.mocked(p.racconta).mock.calls[0]![0]).toBe('Ok, tocco Invio')
    })

    it('⛔ e TACE quando non c\'è niente di nuovo: il silenzio è una riga', async () => {
        // Tre scorrimenti di fila non si annunciano tre volte. Nessuno dei
        // cinque assistenti censiti lo prevede: il loro ciclo parla sempre.
        const p = porte({
            chiedi: vi.fn(async () => '{"azione":"scorri","indice":0}'),
        })
        await talosGuidaLoSchermo(p, { ...TALOS_LIMITI_PREDEFINITI, passi: 4, millisecondi: 1e7 })
        expect(vi.mocked(p.agisci)).toHaveBeenCalledTimes(4)
        expect(vi.mocked(p.racconta)).toHaveBeenCalledTimes(1)
    })
})

describe('la fine si dice a una PERSONA', () => {
    it('ogni motivo ha una frase in italiano, e nessuna contiene il codice', () => {
        const motivi = [
            { motivo: 'fine', testo: 'cercato il meteo' },
            { motivo: 'mano-sullo-schermo', passo: 2 },
            { motivo: 'freno-non-armato' },
            { motivo: 'occhio-chiuso' },
            { motivo: 'troppi-passi' },
            { motivo: 'tempo-scaduto' },
            { motivo: 'troppi-fallimenti' },
            { motivo: 'modello-non-capito', scarto: 'nessunJson' },
        ] as const
        for (const fine of motivi) {
            const frase = talosFraseDiFine(fine)
            expect(frase.length).toBeGreaterThan(5)
            // ⛔ La stessa regola del toast: niente identificativi a schermo.
            expect(frase).not.toContain(fine.motivo)
        }
    })
})
