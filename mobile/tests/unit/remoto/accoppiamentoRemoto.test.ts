import { describe, expect, it, vi } from 'vitest'
import { avviaAccoppiamento, type PluginRemoto } from '@/lib/remoto/accoppiamentoRemoto'
import { codiceDiAccoppiamento } from '@/lib/remoto/filoRemoto'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M2/R-M3 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): l'accoppiamento visto dal
 * telefono, sopra il plugin nativo `TalosRemoto`. Il PC: `servizio.mjs` `accoppia` @ aeab15222 — pair.hello → pair.code
 * {codice, pc} → (pair.cancel) → pair.ok {dispositivo, pc} | error {code}. Il telefono calcola il codice da sé e lo confronta.
 */
const GETTONE = 'AAAAAAAAAAAAAAAAAAAAAA'
const QR = `talos-remote:1?pc=pc-uno&relay=${encodeURIComponent('https://relay.casa.example/?token=abc')}&t=${GETTONE}&exp=2000000000`

function pluginFinto() {
    const inviati: Record<string, unknown>[] = []
    const ascolti: Record<string, (e: never) => void> = {}
    const plugin: PluginRemoto = {
        accoppia: vi.fn(async () => ({ canale: 'c1', telefonoId: 'tel-uno' })),
        concludiAccoppiamento: vi.fn(async () => {}),
        collega: vi.fn(async () => ({ canale: 'c2' })),
        invia: vi.fn(async ({ json }) => { inviati.push(JSON.parse(json)) }),
        chiudi: vi.fn(async () => {}),
        addListener: vi.fn(async (evento: string, cb: (e: never) => void) => {
            ascolti[evento] = cb
            return { remove: async () => { delete ascolti[evento] } }
        }) as PluginRemoto['addListener'],
    }
    const arriva = (m: unknown) => (ascolti['remoto-messaggio'] as (e: unknown) => void)?.({ canale: 'c1', json: JSON.stringify(m) })
    const cade = (motivo = 'DISCONNECTED') => (ascolti['remoto-chiuso'] as (e: unknown) => void)?.({ canale: 'c1', motivo })
    return { plugin, inviati, arriva, cade, ascolti }
}
const attesa = () => new Promise((r) => setTimeout(r, 0))
/** Il telefono saluta dopo aver calcolato il codice (`crypto.subtle`, asincrono): sotto carico più di due giri. Si aspetta il saluto. */
async function salutato(inviati: Record<string, unknown>[]) {
    await vi.waitFor(() => { if (!inviati.some((m) => m.t === 'pair.hello')) throw new Error('nessun pair.hello') })
}
const ora = () => 1_900_000_000_000

describe("l'accoppiamento dal telefono", () => {
    it('ACC-01 pair.hello col gettone, codice uguale ⇒ «conferma sul computer», poi pair.ok ⇒ chiave ricordata', async () => {
        const f = pluginFinto()
        const codici: unknown[] = []
        const giro = avviaAccoppiamento(f.plugin, QR, { nome: 'Pad', ora, onCodice: (c) => codici.push(c) })
        await salutato(f.inviati)
        expect(f.plugin.accoppia).toHaveBeenCalledWith({ pcId: 'pc-uno', relay: 'https://relay.casa.example/?token=abc' })
        expect(f.inviati[0]).toEqual({ v: 1, t: 'pair.hello', gettone: GETTONE, nome: 'Pad', piattaforma: 'android' })
        const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        f.arriva({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno', nome: 'Studio', programma: 'TALOS desktop' } })
        await attesa()
        expect(codici).toEqual([{ codice, pc: { id: 'pc-uno', nome: 'Studio', programma: 'TALOS desktop' } }])
        f.arriva({ v: 1, t: 'pair.ok', dispositivo: { id: 'd1', nome: 'Pad' }, pc: { id: 'pc-uno', nome: 'Studio', programma: 'TALOS desktop', vapid: 'BBB' } })
        await expect(giro.esito).resolves.toEqual({ pcId: 'pc-uno', nome: 'Studio', programma: 'TALOS desktop', vapid: 'BBB', effimero: false })
        // R-M5 (21/10): la VAPID del PC va al nativo, che la ricorda col PC per registrare la sveglia
        expect(f.plugin.concludiAccoppiamento).toHaveBeenCalledWith({ canale: 'c1', nome: 'Studio', vapid: 'BBB' })
        expect(f.ascolti['remoto-messaggio']).toBeUndefined()
    })

    /* Desktop f1199ace0 (24/10/2026): `pc.effimero: true` solo col portachiavi di PROVA; mai `false`, assente negli altri casi. */
    it('ACC-07 pair.ok con pc.effimero true ⇒ esito «di prova»; un valore che non è proprio true non lo è', async () => {
        for (const [valore, atteso] of [[true, true], ['true', false], [1, false], [undefined, false]] as const) {
            const f = pluginFinto()
            const giro = avviaAccoppiamento(f.plugin, QR, { nome: 'Pad', ora })
            await salutato(f.inviati)
            const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
            f.arriva({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno', nome: 'Studio' } })
            await attesa()
            f.arriva({ v: 1, t: 'pair.ok', pc: { nome: 'Studio', effimero: valore } })
            expect((await giro.esito).effimero, String(valore)).toBe(atteso)
        }
    })

    it('ACC-02 codice DIVERSO da quello calcolato qui ⇒ pair.cancel, canale chiuso, CODE_MISMATCH; niente si ricorda', async () => {
        const f = pluginFinto()
        const giro = avviaAccoppiamento(f.plugin, QR, { nome: 'Pad', ora })
        await salutato(f.inviati)
        const giusto = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        f.arriva({ v: 1, t: 'pair.code', codice: giusto === '000000' ? '111111' : '000000', pc: { id: 'pc-uno' } })
        await expect(giro.esito).rejects.toMatchObject({ code: 'CODE_MISMATCH' })
        expect(f.inviati.at(-1)).toEqual({ v: 1, t: 'pair.cancel' })
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c1' })
        expect(f.plugin.concludiAccoppiamento).not.toHaveBeenCalled()
    })

    it('ACC-03 il PC rifiuta (o è scaduto, o il gettone non vale) ⇒ il suo codice', async () => {
        for (const code of ['PAIR_REJECTED', 'PAIR_EXPIRED', 'PAIR_TOKEN_INVALID', 'PAIR_LOCKED']) {
            const f = pluginFinto()
            const giro = avviaAccoppiamento(f.plugin, QR, { nome: 'Pad', ora })
            await attesa(); await attesa()
            f.arriva({ v: 1, t: 'error', code })
            await expect(giro.esito, code).rejects.toMatchObject({ code })
            expect(f.plugin.concludiAccoppiamento).not.toHaveBeenCalled()
        }
    })

    it('ACC-04 la connessione cade prima di pair.ok ⇒ DISCONNECTED; «Annulla» del telefono ⇒ pair.cancel e CANCELLED', async () => {
        const f = pluginFinto()
        const giro = avviaAccoppiamento(f.plugin, QR, { nome: 'Pad', ora })
        await salutato(f.inviati)
        f.cade()
        await expect(giro.esito).rejects.toMatchObject({ code: 'DISCONNECTED' })
        // la chiave d'accoppiamento che il nativo tiene in attesa dopo la fine (TRAS-05) si butta subito
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c1' })

        const g = pluginFinto()
        const secondo = avviaAccoppiamento(g.plugin, QR, { nome: 'Pad', ora })
        await salutato(g.inviati)
        await secondo.annulla()
        await expect(secondo.esito).rejects.toMatchObject({ code: 'CANCELLED' })
        expect(g.inviati.at(-1)).toEqual({ v: 1, t: 'pair.cancel' })
        expect(g.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c1' })
    })

    it('ACC-06 «Annulla» mentre ci si sta ancora collegando: la connessione appena aperta si chiude, CANCELLED', async () => {
        const f = pluginFinto()
        let apri: (v: { canale: string, telefonoId: string }) => void = () => {}
        f.plugin.accoppia = vi.fn(() => new Promise((r) => { apri = r }))
        const giro = avviaAccoppiamento(f.plugin, QR, { nome: 'Pad', ora })
        await attesa()
        await giro.annulla()
        apri({ canale: 'c1', telefonoId: 'tel-uno' })
        await expect(giro.esito).rejects.toMatchObject({ code: 'CANCELLED' })
        expect(f.plugin.chiudi).toHaveBeenCalledWith({ canale: 'c1' })
        expect(f.inviati.some((m) => m.t === 'pair.hello')).toBe(false)
    })

    it('ACC-05 un QR scaduto o storto non apre nessuna connessione', async () => {
        const f = pluginFinto()
        // scaduto anche col margine degli orologi (ACC-SKEW-01)
        await expect(avviaAccoppiamento(f.plugin, QR, { nome: 'Pad', ora: () => 2_000_000_000_000 + 120_001 }).esito).rejects.toMatchObject({ code: 'PAIR_EXPIRED' })
        await expect(avviaAccoppiamento(f.plugin, 'https://talos-code.com', { nome: 'Pad', ora }).esito).rejects.toMatchObject({ code: 'BAD_MESSAGE' })
        expect(f.plugin.accoppia).not.toHaveBeenCalled()
    })

    /*
     * ⛔ D-0147-QR-SKEW (Pad, 27/10): la scadenza la scrive il PC col SUO orologio, il telefono la guardava col proprio. PC 2 minuti
     * indietro ⇒ un QR da 5 minuti ne durava 3 e il Pad diceva «scaduto» a un QR che il PC accettava ancora. Il PC la fa rispettare da
     * sé (le offerte scadute spariscono, `accoppiamento.mjs:88`, e risponde `PAIR_TOKEN_INVALID`); il telefono tiene 120 s di margine.
     */
    it('ACC-SKEW-01 un telefono fino a 120 s avanti sul PC prova lo stesso: decide il PC', async () => {
        const f = pluginFinto()
        const giro = avviaAccoppiamento(f.plugin, QR, { nome: 'Pad', ora: () => 2_000_000_000_000 + 119_000 })
        await salutato(f.inviati)
        expect(f.plugin.accoppia).toHaveBeenCalledTimes(1)
        f.arriva({ v: 1, t: 'error', code: 'PAIR_TOKEN_INVALID' })
        await expect(giro.esito).rejects.toMatchObject({ code: 'PAIR_TOKEN_INVALID' })
    })
})
