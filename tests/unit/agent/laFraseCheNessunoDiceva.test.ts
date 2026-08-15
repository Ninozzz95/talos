import { describe, expect, it, vi } from 'vitest'
import { talosRacconto } from '@/lib/tools/schermoTools'
import { talosFraseDiFine, type TalosCorsaDelPilota } from '@/lib/agent/pilotaDelloSchermo'

/**
 * ⛔⛔ LA FRASE PER LA PERSONA ESISTEVA, ED ERA CODICE MORTO.
 *
 * Owner 2026-08-11, in chat: «schermoCambiato». Non l'avevamo scritto noi in
 * italiano — l'ha copiato il modello dal racconto tecnico che gli passiamo.
 *
 * Cercando i chiamanti di `talosFraseDiFine` — la frase in italiano, scritta,
 * provata, esportata **due volte** — non ne aveva **nessuno**. Quando il pilota
 * si fermava, l'unica voce che restava era quella del modello, che ripete a
 * modo suo un testo pieno di parole che nessuno dice ad alta voce.
 *
 * ⇒ Ora la frase si dice davvero (`corsaDelloSchermo`), e in più la si passa al
 * modello già pronta: vietare senza dare un'alternativa è il modo più sicuro di
 * farsi disobbedire.
 */

const corsa = (fine: TalosCorsaDelPilota['fine']): TalosCorsaDelPilota => ({
    fine,
    storia: ['1. tocca 3 (Chrome)'],
    passi: 1,
    millisecondi: 4_000,
})

describe('⛔ il racconto al modello porta la frase GIÀ PRONTA', () => {
    it('la frase italiana c\'è, ed è quella che direbbe TALOS', () => {
        const testo = talosRacconto(corsa({ motivo: 'troppi-fallimenti', ultimo: 'schermoCambiato' }))
        expect(testo).toContain(talosFraseDiFine({ motivo: 'troppi-fallimenti' }))
    })

    it('⛔ e il divieto di mostrare il motivo interno è esplicito', () => {
        const testo = talosRacconto(corsa({ motivo: 'tempo-scaduto' }))
        expect(testo).toMatch(/never show them the internal reason/i)
    })

    it('il motivo tecnico resta per il MODELLO: senza, non saprebbe se riprovare', () => {
        // ⛔ Toglierlo sarebbe l'errore opposto — il modello riproverebbe alla
        // cieca proprio quando la persona ha appena messo la mano sul vetro.
        expect(talosRacconto(corsa({ motivo: 'mano-sullo-schermo', passo: 1 })))
            .toContain('mano-sullo-schermo')
    })

    it('⛔ ma a fine RIUSCITA non si aggiunge niente: lo racconta la risposta', () => {
        const testo = talosRacconto(corsa({ motivo: 'fine', testo: 'aperto Chrome' }))
        expect(testo).not.toMatch(/never show them the internal reason/i)
        expect(testo).toContain('aperto Chrome')
    })
})

describe('⛔ e la frase si DICE, non resta scritta', () => {
    async function corsaMontata(fine: TalosCorsaDelPilota['fine']) {
        vi.resetModules()
        const dette: string[] = []
        vi.doMock('@/lib/device/ponteSchermo', () => ({
            TalosSchermoBridge: { guarda: async () => null },
            talosArmaIlFreno: async () => ({ armato: true, motivo: 'pronto' }),
        }))
        vi.doMock('@/lib/agent/pilotaDelloSchermo', async () => {
            const vero = await vi.importActual<
                typeof import('@/lib/agent/pilotaDelloSchermo')
            >('@/lib/agent/pilotaDelloSchermo')
            return { ...vero, talosGuidaLoSchermo: async () => corsa(fine) }
        })
        const { talosCorsaDelloSchermo } = await import('@/lib/agent/corsaDelloSchermo')
        await talosCorsaDelloSchermo({
            obiettivo: 'apri Chrome',
            completa: (async () => '') as never,
            apriApp: async () => ({ done: true }),
            elencoApp: async () => '',
            parla: (frase) => { dette.push(frase) },
        })
        return dette
    }

    it('⭐ quando si ferma male, TALOS lo DICE in italiano', async () => {
        // ⛔ È questa la riga che morde: togliendo la chiamata a
        // `talosFraseDiFine`, qui non arriva niente — che è esattamente lo
        // stato in cui il codice è vissuto finché l'owner non l'ha visto.
        const dette = await corsaMontata({ motivo: 'troppi-fallimenti' })
        expect(dette).toContain('Ho provato due volte e non ha funzionato: mi fermo qui.')
    })

    it('e quando ha finito bene TACE: lo racconta già la risposta', async () => {
        const dette = await corsaMontata({ motivo: 'fine', testo: 'aperto Chrome' })
        expect(dette).toEqual([])
    })

    it('⛔ nessuna frase detta alla persona contiene un motivo interno', async () => {
        const motivi: TalosCorsaDelPilota['fine'][] = [
            { motivo: 'mano-sullo-schermo', passo: 2 },
            { motivo: 'freno-non-armato' },
            { motivo: 'occhio-chiuso' },
            { motivo: 'troppi-passi' },
            { motivo: 'tempo-scaduto' },
            { motivo: 'troppi-fallimenti', ultimo: 'schermoCambiato' },
            { motivo: 'modello-non-capito', scarto: 'non-json' as never },
        ]
        for (const fine of motivi) {
            const frase = talosFraseDiFine(fine)
            // Niente trattini-di-codice, niente maiuscole in mezzo, niente
            // parole che esistono solo dentro questo repository.
            expect(frase, fine.motivo).not.toMatch(/[a-z]+[A-Z]|schermoCambiato|-[a-z]+-/)
            expect(frase.endsWith('.'), fine.motivo).toBe(true)
        }
    })
})
