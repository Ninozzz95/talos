import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    TALOS_TOOL_ACTIONS,
    talosEffectiveToolPermissions,
} from '@/lib/tools/permissionTypes'

/**
 * ⭐⭐ IL CONSENSO ALL'AUTONOMIA — chiesto PRIMA, una volta, e che non evapora.
 *
 * ## La decisione
 *
 * Owner 2026-08-12: «all'attivazione fai partire una modale che avverte l'utente
 * che questo assistente sarà autonomo… e con il suo consenso modificherai tutti
 * i permessi in accesso, accetta sempre. In questo modo non abbiamo bisogno di
 * toccare nulla durante la modalità assistente… l'assistente deve essere
 * controllato senza toccare lo schermo».
 *
 * Il punto è strutturale, non estetico: una scheda di consenso che compare
 * mentre parli a mani libere contraddice la funzione stessa. Il consenso non
 * sparisce — si sposta dove costa zero.
 */

const RADICE = resolve(__dirname, '../../..')
const leggi = (f: string): string => readFileSync(resolve(RADICE, f), 'utf8')

describe('⛔ il sì all\'autonomia non evapora', () => {
    it('⛔⛔ un «allow» che nessuno ha SCELTO viene riportato al default', () => {
        /*
         * La prova che rende obbligatoria la registrazione della scelta, e non è
         * una grep: è il comportamento vero di `talosEffectiveToolPermissions`.
         * Scrivere i tre `allow` senza registrarli vorrebbe dire che il primo
         * avvio successivo li riporta ad `ask` — il consenso appena dato
         * sparirebbe senza che nessuno lo tocchi.
         */
        const senzaScelta = talosEffectiveToolPermissions({
            stored: { read: 'allow', write: 'allow', outbound: 'allow' },
            chosen: [],
        })
        expect(senzaScelta).toEqual({ read: 'ask', write: 'ask', outbound: 'ask' })

        const conScelta = talosEffectiveToolPermissions({
            stored: { read: 'allow', write: 'allow', outbound: 'allow' },
            chosen: TALOS_TOOL_ACTIONS,
        })
        expect(conScelta).toEqual({ read: 'allow', write: 'allow', outbound: 'allow' })
    })

    it('la modale scrive i TRE permessi, e passa da setToolPermissions', () => {
        const schermata = leggi('src/screens/PrivilegeScreen.vue')

        // ⛔ `setToolPermissions` registra la scelta da solo — è scritto nel suo
        // commento: «toccare un permesso è sceglierlo». Passare di lì è ciò che
        // impedisce al consenso di evaporare al riavvio.
        expect(schermata).toContain(
            "impostazioni.setToolPermissions({ read: 'allow', write: 'allow', outbound: 'allow' })",
        )
        // E l'ordine: prima si scrive il consenso, POI si accende la parola.
        expect(schermata).toMatch(
            /setToolPermissions\([\s\S]{0,120}?\n\s*parola\.value = await talosAccendiLaParola\(\)/,
        )
    })

    it('si chiede solo se non è già stato dato, e guarda le SCELTE non i valori', () => {
        const schermata = leggi('src/screens/PrivilegeScreen.vue')

        /*
         * ⛔ Un `allow` ereditato NON è un consenso. Guardare i tre valori
         * farebbe saltare la modale a chi non ha mai deciso niente — cioè
         * darebbe per acquisito proprio il sì che stiamo andando a chiedere.
         */
        expect(schermata).toContain('impostazioni.state.tools_chosen.includes(azione)')
        expect(schermata).toContain("impostazioni.state.tools[azione] === 'allow'")
        expect(schermata).toMatch(/if \(!autonomiaGiaConcessa\.value\) \{[\s\S]{0,120}?consensoAperto\.value = true/)
    })

    it('⛔ e il verso contrario: SPEGNERE non chiede niente', () => {
        const schermata = leggi('src/screens/PrivilegeScreen.vue')

        // Togliere una capacità non ha bisogno di un permesso. Una conferma per
        // smettere è attrito messo esattamente dove non serve — ed è il verso
        // che si dimentica di provare.
        expect(schermata).toMatch(
            /if \(parola\.value\.on\) \{[\s\S]{0,400}?await talosSpegniLaParola\(\)[\s\S]{0,60}?return/,
        )
    })

    it('nessun interruttore nuovo: la grammatica dei permessi resta una sola', () => {
        const schermata = leggi('src/screens/PrivilegeScreen.vue')
        const modale = leggi('src/components/talos/permissions/TalosConsensoAutonomia.vue')

        /*
         * ⛔ Regola del progetto: `allow / ask / deny` su `read / write /
         * outbound`, e basta. Un booleano «modalità autonoma» accanto ai tre
         * valori sarebbe una seconda verità sullo stesso fatto — il modo
         * documentato in cui qui i permessi si sono già rotti una volta.
         */
        for (const sorgente of [schermata, modale]) {
            expect(sorgente).not.toMatch(/autonom\w*(Mode|Enabled|Attiva)\s*[:=]\s*(true|false|ref\()/)
            expect(sorgente).not.toContain('setSecurity({ autonom')
        }
    })

    it('il testo dice cosa fa, dichiara la macchina, e nomina la via d\'uscita', () => {
        const it = leggi('src/i18n/locales/it.ts')
        const en = leggi('src/i18n/locales/en.ts')

        for (const lingua of [it, en]) {
            expect(lingua).toContain('autonomia: {')
            expect(lingua).toContain('promessaAgisce:')
            expect(lingua).toContain('promessaVoce:')
            expect(lingua).toContain('promessaRevoca:')
        }
        // ⛔ Art. 50 dell'AI Act, in vigore dal 2 agosto 2026: chi fa assistenti
        // vocali deve dichiarare che si sta interagendo con un'IA.
        expect(it).toContain('intelligenza artificiale, non una persona')
        expect(en).toContain('artificial intelligence, not a person')
        // ⛔ E la via d'uscita si nomina PRIMA di chiedere il sì, non dopo.
        expect(it).toContain('puoi togliere questo consenso quando vuoi')
        expect(en).toContain('you can withdraw this consent any time')
    })
})
