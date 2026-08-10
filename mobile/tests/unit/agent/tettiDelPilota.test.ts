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

    it('⛔ LA MANO VINCE SU TUTTO: si smette senza finire il passo', async () => {
        const p = porte({ sguardo: () => ({ ...SCHERMO, manoSulloSchermo: true }) })
        const corsa = await talosGuidaLoSchermo(p)
        expect(corsa.fine).toEqual({ motivo: 'mano-sullo-schermo', passo: 0 })
        expect(p.agisci).not.toHaveBeenCalled()
        expect(p.chiedi).not.toHaveBeenCalled()
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

    it('una riga che non si capisce ferma la corsa invece di far toccare a caso', async () => {
        const p = porte({ chiedi: vi.fn(async () => 'Certo! Adesso tocco il pulsante.') })
        const corsa = await talosGuidaLoSchermo(p)
        expect(corsa.fine).toEqual({ motivo: 'modello-non-capito', scarto: 'nessunJson' })
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

    it('usa il PERCHÉ del modello quando c\'è, e ripiega quando è vuoto', async () => {
        const conPerche = porte()
        await talosGuidaLoSchermo(conPerche, { ...TALOS_LIMITI_PREDEFINITI, passi: 1, millisecondi: 1e7 })
        expect(vi.mocked(conPerche.racconta).mock.calls[0]![0]).toBe('tocco Invio')

        const senza = porte({ chiedi: vi.fn(async () => '{"azione":"tocca","indice":1}') })
        await talosGuidaLoSchermo(senza, { ...TALOS_LIMITI_PREDEFINITI, passi: 1, millisecondi: 1e7 })
        expect(vi.mocked(senza.racconta).mock.calls[0]![0]).toContain('tocca')
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
