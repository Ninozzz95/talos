import { describe, expect, it } from 'vitest'
import { talosSessioneDaAprire } from '@/lib/barra/consegna'

/**
 * ⛔ IL PASSAGGIO DI CONSEGNE — e questi casi mordono sul fallire CHIUSO.
 *
 * Owner 2026-08-11: «quando faccio "apri in TALOS" si deve aprire la chat
 * aggiornata col testo che ho inviato». L'id viaggia nell'indirizzo perché barra
 * e app sono due WebView diverse.
 *
 * ⛔ Un indirizzo è un dato che arriva da FUORI: qualunque app può mandare un
 * intent alla nostra. Se questa funzione fosse permissiva, un indirizzo altrui
 * potrebbe far saltare la persona su una conversazione che non stava guardando —
 * e nel mezzo di una dettatura sarebbe anche peggio. Per questo la maggior parte
 * dei casi qui sotto verificano ciò che NON deve passare.
 */
describe('⛔ la consegna dalla barra all\'app', () => {
    it('⭐ l\'indirizzo giusto consegna l\'id', () => {
        expect(talosSessioneDaAprire('talos://chat?sessione=abc-123')).toBe('abc-123')
    })

    it('⭐ l\'id passa anche con altri parametri intorno', () => {
        expect(talosSessioneDaAprire('talos://chat?voce=1&sessione=xyz&nodi=9')).toBe('xyz')
    })

    it('⛔ uno SCHEMA diverso non passa, anche se il resto è identico', () => {
        expect(talosSessioneDaAprire('https://chat?sessione=abc')).toBeNull()
    })

    it('⛔ un altro indirizzo NOSTRO non passa: la barra non è la chat', () => {
        expect(talosSessioneDaAprire('talos://barra?voce=1&sessione=abc')).toBeNull()
    })

    it('⛔ senza id non si apre niente invece di aprire a caso', () => {
        expect(talosSessioneDaAprire('talos://chat')).toBeNull()
        expect(talosSessioneDaAprire('talos://chat?sessione=')).toBeNull()
        expect(talosSessioneDaAprire('talos://chat?sessione=%20%20')).toBeNull()
    })

    it('⛔ spazzatura e vuoto falliscono chiusi, non lanciano', () => {
        expect(talosSessioneDaAprire('non un indirizzo')).toBeNull()
        expect(talosSessioneDaAprire('')).toBeNull()
        expect(talosSessioneDaAprire(null)).toBeNull()
        expect(talosSessioneDaAprire(undefined)).toBeNull()
    })
})
