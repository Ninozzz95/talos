import { describe, expect, it } from 'vitest'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

/**
 * ⛔ D-REM-13 (23/10/2026, pubblicato nella 0.1.44): la sezione Computer senza PC diceva «Sul PC scrivi talos remote nel
 * terminale». Quel comando non esiste nel CLI (0.6.12 e 0.6.13, `cli/src/args.ts` SUBCOMMANDS, verificato dalla sessione CLI):
 * scriverlo apre una sessione e manda «remote» al modello come primo messaggio, cioè un giro pagato che non collega niente.
 * Le porte vere del desktop sono l'icona dei dispositivi nella testata (r4 `public/index.html:272`, `#telefoniRemoto`) e
 * Impostazioni › Dispositivi collegati (`impostazioni.js:24`). Le frasi nascono in inglese.
 */
describe('la frase della sezione Computer senza PC', () => {
    it('CVZ-01 in inglese porta alle porte vere del desktop e non nomina un comando che non esiste', () => {
        const frase = TALOS_EN_MESSAGES.computer.emptyHint
        expect(frase).not.toMatch(/talos\s+remote/i)
        expect(frase).toContain('device icon')
        expect(frase).toContain('Settings › Connected devices')
    })

    it('CVZ-02 in italiano lo stesso, con le parole del desktop', () => {
        const frase = TALOS_IT_MESSAGES.computer.emptyHint
        expect(frase).not.toMatch(/talos\s+remote/i)
        expect(frase).toContain('icona del dispositivo')
        expect(frase).toContain('Impostazioni › Dispositivi collegati')
    })
})
