import { describe, expect, it } from 'vitest'

/**
 * I due pannelli in cima allo schermo si aprono con un movimento, come tutto
 * il resto.
 *
 * Owner 2026-08-06, provando sul dispositivo: «i pannelli notifiche e download
 * non hanno animazioni di apertura o chiusura». Comparivano e sparivano di
 * scatto, in un'app dove ogni altra superficie sale.
 *
 * Il motore del movimento dichiara `menu-open` da sempre e lo usano già il
 * ventaglio della sidebar e i menu: questi due semplicemente non lo
 * chiamavano. La cura è un attributo, non una regola nuova — e questo test
 * guarda il sorgente perché è lì che il difetto viveva: un componente che si
 * dimentica di dichiarare l'intento non rompe nulla, sta solo fermo.
 */
describe('i pannelli in cima si aprono con il movimento del motore', () => {
    it.each([
        ['centro download', '@/components/shell/TalosMobileDownloadCenterTrigger.vue?raw'],
        ['centro notifiche', '@/components/shell/TalosMobileNotificationBell.vue?raw'],
    ])('%s dichiara l\'intento del motore', async (_nome, modulo) => {
        const sorgente = (await import(/* @vite-ignore */ modulo)).default as string
        expect(sorgente).toContain('data-talos-motion-intent="menu-open"')
    })

    /**
     * L'intento sta sul CONTENUTO del pannello, non sul grilletto: è il
     * pannello che arriva, e mettere il movimento sul pulsante lo farebbe
     * saltellare a ogni apertura.
     */
    it('l\'intento sta sul contenuto, non sul pulsante che lo apre', async () => {
        const sorgente = (await import('@/components/shell/TalosMobileNotificationBell.vue?raw')).default as string
        const posizioneIntento = sorgente.indexOf('data-talos-motion-intent="menu-open"')
        const posizioneContenuto = sorgente.indexOf('data-testid="talos-notification-centre"')
        expect(posizioneIntento).toBeGreaterThan(posizioneContenuto)
    })
})
