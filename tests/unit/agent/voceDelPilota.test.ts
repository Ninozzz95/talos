import { describe, expect, it } from 'vitest'
import {
    TALOS_PAROLE_AL_MASSIMO,
    talosFraseDaDire,
    type TalosPassoDaDire,
} from '@/lib/agent/voceDelPilota'

/**
 * ⛔⛔ LA VOCE NON DEVE SUONARE COME UN REGISTRO LETTO AD ALTA VOCE.
 *
 * Owner 2026-08-10: «le frasi che dovrebbe dire il TTS devono essere il meno
 * meccaniche e robotiche possibile». Lo stato dell'arte dei concorrenti —
 * Google, Alexa, Mycroft, Rabbit, OpenAI — è **pescare a caso da una lista**.
 * Questi casi provano le quattro cose che facciamo in più, e ognuno cade se
 * quella cosa sparisce.
 */
const passo = (p: Partial<TalosPassoDaDire> & { numero: number }): TalosPassoDaDire => ({
    azione: { azione: 'tocca', indice: 1 },
    ...p,
})

describe('⭐ 1. ROTAZIONE, non sorteggio', () => {
    it('⛔ due passi uguali di fila NON possono avere lo stesso verbo', () => {
        // Il sorteggio lo permette una volta su quattro; la rotazione mai.
        const uno = talosFraseDaDire(passo({ numero: 1, etichetta: 'Chrome' }))
        const due = talosFraseDaDire(passo({ numero: 2, etichetta: 'Impostazioni' }))
        expect(uno).not.toBe(due)
        expect(uno?.toLowerCase()).toContain('tocco')
        expect(due?.toLowerCase()).toContain('apro')
    })

    it('e la rotazione gira su tutti i verbi prima di tornare al primo', () => {
        const dette = [1, 2, 3, 4, 5].map((numero) => talosFraseDaDire(passo({
            numero,
            etichetta: `Voce ${numero}`,
        }))!)
        const verbi = dette.map((f) => f.toLowerCase().split(' voce ')[0]!)
        // quattro verbi diversi, poi si ricomincia — mai due uguali attaccati
        expect(new Set(verbi.slice(0, 4)).size).toBe(4)
        for (let i = 1; i < verbi.length; i += 1) expect(verbi[i]).not.toBe(verbi[i - 1])
    })

    it('è DETERMINISTICA: una voce che non si può provare non si può difendere', () => {
        const a = talosFraseDaDire(passo({ numero: 7, etichetta: 'Cerca' }))
        const b = talosFraseDaDire(passo({ numero: 7, etichetta: 'Cerca' }))
        expect(a).toBe(b)
    })
})

describe('⭐ 2. BREVITÀ PROGRESSIVA', () => {
    it('il primo passo apre, i successivi sono frammenti', () => {
        expect(talosFraseDaDire(passo({ numero: 1, etichetta: 'Chrome' })))
            .toBe('Ok, tocco Chrome')
        expect(talosFraseDaDire(passo({ numero: 2, etichetta: 'Chrome' })))
            .toBe('Apro Chrome')
    })

    it(`⛔ e nessuna frase supera ${TALOS_PAROLE_AL_MASSIMO} parole`, () => {
        // Non è stile: chi ascolta ferma TALOS toccando lo schermo, e può farlo
        // solo finché la frase non è finita. Una riga lunga si mangia la
        // finestra in cui la persona può dire «no».
        const lunga = talosFraseDaDire(passo({
            numero: 3,
            azione: { azione: 'scrivi', indice: 0, testo: 'meteo di Catania per i prossimi sette giorni con vento e umidità' },
            etichetta: 'meteo di Catania per i prossimi sette giorni con vento e umidità',
        }))!
        expect(lunga.split(/\s+/).length).toBeLessThanOrEqual(TALOS_PAROLE_AL_MASSIMO)
    })
})

describe('⭐ 3. IL SILENZIO È UNA RIGA', () => {
    it('⛔ tre scorrimenti di fila non si annunciano tre volte', () => {
        const scorri = { azione: 'scorri' as const }
        expect(talosFraseDaDire(passo({ numero: 1, azione: scorri }))).toBe('Ok, scorro')
        expect(talosFraseDaDire(passo({ numero: 2, azione: scorri, precedente: 'scorri' })))
            .toBeNull()
        expect(talosFraseDaDire(passo({ numero: 3, azione: scorri, precedente: 'scorri' })))
            .toBeNull()
    })

    it('ma due tocchi su cose DIVERSE si dicono tutti e due', () => {
        // Il silenzio vale per «niente di nuovo», non per «ho già parlato».
        const detta = talosFraseDaDire(passo({
            numero: 2,
            etichetta: 'Impostazioni',
            precedente: 'tocca',
            etichettaPrecedente: 'Chrome',
        }))
        expect(detta).toBe('Apro Impostazioni')
    })

    it('e «fine» non si dice qui: la chiude la frase di chiusura', () => {
        expect(talosFraseDaDire(passo({ numero: 4, azione: { azione: 'fine' } }))).toBeNull()
    })
})

describe('⭐ 4. SI DICE LA COSA, NON IL MECCANISMO', () => {
    it('⛔ un nome di pacchetto NON si pronuncia', () => {
        // «com punto android punto chrome» non lo capisce nessuno.
        const detta = talosFraseDaDire(passo({
            numero: 1,
            azione: { azione: 'apri_app', testo: 'com.android.chrome' },
        }))!
        expect(detta).not.toContain('com.android.chrome')
        expect(detta).toBe('Ok, apro')
    })

    it('⛔ e nemmeno un indice o un\'etichetta fatta di soli simboli', () => {
        const detta = talosFraseDaDire(passo({ numero: 2, etichetta: '»»' }))!
        expect(detta).toBe('Apro')
        expect(JSON.stringify(detta)).not.toContain('indice')
    })

    it('il testo scritto si sente come testo, fra virgolette', () => {
        expect(talosFraseDaDire(passo({
            numero: 1,
            azione: { azione: 'scrivi', indice: 0, testo: 'meteo Catania' },
            etichetta: 'meteo Catania',
        }))).toBe('Ok, scrivo «meteo Catania»')
    })

    it('le azioni senza bersaglio hanno una frase intera loro', () => {
        expect(talosFraseDaDire(passo({ numero: 1, azione: { azione: 'home' } })))
            .toBe('Ok, vado alla schermata iniziale')
        expect(talosFraseDaDire(passo({ numero: 2, azione: { azione: 'indietro' } })))
            .toBe('Faccio un passo indietro')
        expect(talosFraseDaDire(passo({ numero: 3, azione: { azione: 'attendi' } })))
            .toBe('Aspetto che carichi')
    })
})
