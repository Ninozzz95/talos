import { describe, expect, it } from 'vitest'
import { parseTalosMobileSettings } from '@/stores/settings'

/**
 * ⭐⭐⭐ QUELLO CHE VEDE CHI INSTALLA L'APP OGGI — e nessuna migrazione glielo
 * riscrive.
 *
 * Owner 2026-08-17, guardando l'app, quattro rilievi. Tre sono valori
 * predefiniti, e ha detto esattamente per chi valgono: **«stavo parlando delle
 * installazioni nuove, non default per i già installati»**. Quindi nessuna
 * migrazione: chi ha già scelto tiene la sua scelta, e chi installa adesso
 * trova questi.
 *
 * ## ⛔ Perché serve una prova e non basta cambiare la costante
 *
 * In questo file di migrazioni ce ne sono sette, e due toccano proprio questi
 * campi:
 *
 *   `type_defaults_v1`   scrive `ui_font_scale` con la costante predefinita
 *   `composer_split_v1`  può riscrivere `composer_shape` da un valore vecchio
 *
 * Su un'installazione fresca la prima ricopia la costante (quindi segue) e la
 * seconda è disarmata da `defaults_v3 !== true` (quindi tace) — ma questo è un
 * RAGIONAMENTO, e un ragionamento su sette migrazioni invecchia alla prossima.
 *
 * ⛔ È già successo, ed è in memoria come «il default irraggiungibile»: una
 * migrazione del 25 luglio zittiva la decisione del 27, e il valore che l'owner
 * aveva scelto non lo produceva NESSUN percorso. Il difetto non era nella
 * costante: era nel fatto che nessuno chiedeva al parser cosa uscisse davvero.
 *
 * ⇒ Qui glielo si chiede, partendo da niente — che è precisamente ciò che
 * trova un'installazione nuova.
 */
describe('⭐⭐⭐ i predefiniti di un\'installazione NUOVA', () => {
    /*
     * ⛔ `null` e non `'{}'`: alla primissima apertura la chiave non esiste
     * proprio. Le due strade possono divergere, e quella che conta è questa.
     */
    const appenaInstallata = () => parseTalosMobileSettings(null)

    it('⛔ i testi dell interfaccia partono a PREDEFINITA, non grande', () => {
        expect(appenaInstallata().shell.ui_font_scale).toBe('default')
        expect(appenaInstallata().chat_layout.bubble_scale).toBe('xcompact')
    })

    it('⛔ il compositore parte COMPATTO', () => {
        expect(appenaInstallata().shell.composer_shape).toBe('compact')
    })

    it('⛔ l icona dell app segue il tema, senza doverlo chiedere', () => {
        expect(appenaInstallata().shell.launcher_icon_follows_theme).toBe(true)
    })

    /*
     * ⛔⛔ E LA STRADA DELL'OGGETTO VUOTO, che è l'altra faccia dello stesso
     * difetto: un'installazione che ha scritto una preferenza qualsiasi ha una
     * chiave, e da lì in poi passa per il ramo delle migrazioni. Se le due
     * strade dessero valori diversi, il predefinito dipenderebbe da quale
     * schermata la persona ha aperto per prima.
     */
    it('⛔ e lo stesso arrivando da uno stato SALVATO ma vuoto', () => {
        const daVuoto = parseTalosMobileSettings('{}')
        expect(daVuoto.shell.ui_font_scale).toBe('default')
        expect(daVuoto.chat_layout.bubble_scale).toBe('xcompact')
        expect(daVuoto.shell.composer_shape).toBe('compact')
        expect(daVuoto.shell.launcher_icon_follows_theme).toBe(true)
    })

    /*
     * ⛔ IL VERSO CONTRARIO, ed è quello che rende onesta la richiesta
     * dell'owner: chi ha GIÀ scelto non si tocca. Se questa diventasse rossa
     * vorrebbe dire che il cambio di predefinito è diventato una migrazione —
     * cioè esattamente ciò che ha detto di non volere.
     */
    it('⛔⛔ ma una scelta GIA FATTA resta dov e', () => {
        const scelto = parseTalosMobileSettings(JSON.stringify({
            type_defaults_v1: true,
            defaults_v3: true,
            composer_split_v1: true,
            shell: {
                ui_font_scale: 'large',
                composer_shape: 'standard',
                launcher_icon_follows_theme: false,
            },
        }))
        expect(scelto.shell.ui_font_scale).toBe('large')
        expect(scelto.shell.composer_shape).toBe('standard')
        expect(scelto.shell.launcher_icon_follows_theme).toBe(false)
    })
})
