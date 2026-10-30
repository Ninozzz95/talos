// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { dimenticaRicordo, domandaDoppiGiaFatta, ricordaEffimero, ricordaProgramma, segnaDomandaDoppi, vociVecchieDi } from '@/lib/remoto/ricordiDelPc'

/**
 * Fetta C del mockup remoto, D-REM-2 (owner via Desktop (3), 24/10/2026: «Proponi di dimenticare»). Accoppiando un PC con lo stesso
 * nome e lo stesso ponte di voci vecchie mai più tornate in linea, il dispositivo propone UNA volta di dimenticarle. Una voce che
 * risponde non si propone mai: è un altro PC col nome uguale (Happy `sync/machineChoices.ts:88-92`: «merging them would start work
 * in the wrong one»).
 */
const RELAY = 'https://relay.example/'
const pc = (pcId: string, nome: string | null, relay: string | null = RELAY) => ({ pcId, nome, relay, accoppiatoAlle: 1 })
const NUOVO = pc('b8510001', 'DESKTOP-ESEMPIO')

beforeEach(() => { localStorage.clear() })

describe('le voci vecchie di un PC appena accoppiato', () => {
    it('DOPPI-01 stesso nome, stesso ponte, spente: sono le voci vecchie', () => {
        const elenco = [NUOVO, pc('31ab0001', 'DESKTOP-ESEMPIO'), pc('65fe0001', 'DESKTOP-ESEMPIO')]
        expect(vociVecchieDi(NUOVO, elenco, () => false).map((v) => v.pcId)).toEqual(['31ab0001', '65fe0001'])
    })

    it('DOPPI-02 ⛔ verso contrario: una voce che risponde non si propone mai (è un altro PC col nome uguale)', () => {
        const elenco = [NUOVO, pc('31ab0001', 'DESKTOP-ESEMPIO'), pc('65fe0001', 'DESKTOP-ESEMPIO')]
        expect(vociVecchieDi(NUOVO, elenco, (id) => id === '65fe0001').map((v) => v.pcId)).toEqual(['31ab0001'])
    })

    it('DOPPI-03 ⛔ verso contrario: nome uguale con un ponte diverso, o nome diverso, non è una voce vecchia', () => {
        const elenco = [NUOVO, pc('31ab0001', 'DESKTOP-ESEMPIO', 'https://altro.example/'), pc('aa000001', 'PORTATILE'), pc('cc000001', null)]
        expect(vociVecchieDi(NUOVO, elenco, () => false)).toEqual([])
    })

    it('DOPPI-04 il PC nuovo non è mai fra le sue voci vecchie', () => {
        expect(vociVecchieDi(NUOVO, [NUOVO], () => false)).toEqual([])
    })

    it('DOPPI-05 la domanda si fa una volta per PC nuovo: dopo il sì o il no non torna', () => {
        expect(domandaDoppiGiaFatta(NUOVO.pcId)).toBe(false)
        segnaDomandaDoppi(NUOVO.pcId)
        expect(domandaDoppiGiaFatta(NUOVO.pcId)).toBe(true)
        expect(domandaDoppiGiaFatta('31ab0001')).toBe(false)
    })

    it('DOPPI-06 un archivio guasto vale «mai chiesto», senza rompere niente', () => {
        localStorage.setItem('talos.remoto.doppi.v1', '{guasto')
        expect(domandaDoppiGiaFatta(NUOVO.pcId)).toBe(false)
        segnaDomandaDoppi(NUOVO.pcId)
        expect(domandaDoppiGiaFatta(NUOVO.pcId)).toBe(true)
    })

    /* Revisione del blocco 3 (Desktop (3), S3) e owner 24/10/2026 «Sì, anche il programma»: il desktop e la CLI sullo stesso PC hanno
       lo stesso nome e lo stesso ponte, e la CLI di solito è spenta. Quando tutte e due le voci sanno il programma, deve combaciare. */
    it('DOPPI-07 ⛔ verso contrario: il programma diverso (desktop e CLI sullo stesso PC) non è una voce vecchia', () => {
        ricordaProgramma(NUOVO.pcId, 'TALOS desktop')
        ricordaProgramma('31ab0001', 'TALOS CLI')
        ricordaProgramma('65fe0001', 'TALOS desktop')
        const elenco = [NUOVO, pc('31ab0001', 'DESKTOP-ESEMPIO'), pc('65fe0001', 'DESKTOP-ESEMPIO')]
        expect(vociVecchieDi(NUOVO, elenco, () => false).map((v) => v.pcId)).toEqual(['65fe0001'])
    })

    it('DOPPI-08 se una delle due voci non sa il programma (accoppiata prima della fetta C) vale la regola di nome e ponte', () => {
        ricordaProgramma(NUOVO.pcId, 'TALOS desktop')
        const elenco = [NUOVO, pc('31ab0001', 'DESKTOP-ESEMPIO')]
        expect(vociVecchieDi(NUOVO, elenco, () => false).map((v) => v.pcId)).toEqual(['31ab0001'])
        localStorage.clear()
        ricordaProgramma('31ab0001', 'TALOS CLI')
        expect(vociVecchieDi(NUOVO, elenco, () => false).map((v) => v.pcId)).toEqual(['31ab0001'])
    })

    /* Owner 24/10/2026 «Sì, adesso»: le voci di un PC col portachiavi di prova (`pc.effimero`, desktop f1199ace0) si propongono per prime. */
    it('DOPPI-09 le voci «di prova» vengono per prime, le altre restano nel loro ordine', () => {
        ricordaEffimero('65fe0001', true)
        const elenco = [NUOVO, pc('31ab0001', 'DESKTOP-ESEMPIO'), pc('65fe0001', 'DESKTOP-ESEMPIO'), pc('2d230001', 'DESKTOP-ESEMPIO')]
        expect(vociVecchieDi(NUOVO, elenco, () => false).map((v) => v.pcId)).toEqual(['65fe0001', '31ab0001', '2d230001'])
    })

    /*
     * ⛔ D-MOCK-13, owner 24/10/2026 «No, solo un PC vero propone» (4177, foto 173-191): il PC «di prova» 27ba appena accoppiato
     * proponeva di dimenticare 287c, una voce VERA spenta; e il di prova f913 proponeva 27ba. Un PC di prova rinasce a ogni avvio:
     * non decide lui che cosa è vecchio.
     */
    /* Revisione del blocco 4, riserve S4: `talos.remoto.doppi.v1` cresceva di un `pcId` per accoppiamento (un PC di prova cambia
       identità a ogni avvio) e «Dimentica» non lo puliva. */
    it('DOPPI-12 dimenticato un PC, la sua domanda dei doppi se ne va con lui; ⛔ quelle degli altri restano', () => {
        segnaDomandaDoppi(NUOVO.pcId)
        segnaDomandaDoppi('31ab0001')
        dimenticaRicordo(NUOVO.pcId)
        expect(domandaDoppiGiaFatta(NUOVO.pcId)).toBe(false)
        expect(domandaDoppiGiaFatta('31ab0001')).toBe(true)
        expect(localStorage.getItem('talos.remoto.doppi.v1')).not.toContain(NUOVO.pcId)
    })

    it('DOPPI-10 ⛔ un PC «di prova» appena accoppiato o in linea non propone di dimenticare niente', () => {
        ricordaEffimero(NUOVO.pcId, true)
        ricordaEffimero('27ba0001', true)
        const elenco = [NUOVO, pc('287c0001', 'DESKTOP-ESEMPIO'), pc('27ba0001', 'DESKTOP-ESEMPIO')]
        expect(vociVecchieDi(NUOVO, elenco, () => false)).toEqual([])
    })

    it('DOPPI-11 una voce «di prova» in linea non si propone; spenta sì, per prima, quando propone un PC vero', () => {
        ricordaEffimero('27ba0001', true)
        const elenco = [NUOVO, pc('287c0001', 'DESKTOP-ESEMPIO'), pc('27ba0001', 'DESKTOP-ESEMPIO')]
        expect(vociVecchieDi(NUOVO, elenco, (id) => id === '27ba0001').map((v) => v.pcId)).toEqual(['287c0001'])
        expect(vociVecchieDi(NUOVO, elenco, () => false).map((v) => v.pcId)).toEqual(['27ba0001', '287c0001'])
    })

    /* Owner 26/10/2026 (via CLI e Desktop): in modalità n0 il QR del PC non porta più `relay=` (57 → 41 moduli). Le voci accoppiate
       prima hanno il relay di casa di n0 (`https://euc1-1.relay.n0.iroh.link./`, iroh `defaults.rs:27-33`), le nuove `null`: per il
       telefono sono lo stesso ponte, come per `relayDalQr` (senza gettone ⇒ n0). Il relay proprio resta un ponte a sé. */
    const N0_EU = 'https://euc1-1.relay.n0.iroh.link./'
    const N0_US = 'https://use1-1.relay.n0.iroh.link./'

    it('DOPPI-13 il QR senza `relay=` (n0) ritrova le voci vecchie col relay di casa di n0, di qualunque regione', () => {
        const nuovoN0 = pc('b8510001', 'DESKTOP-ESEMPIO', null)
        const elenco = [nuovoN0, pc('31ab0001', 'DESKTOP-ESEMPIO', N0_EU), pc('65fe0001', 'DESKTOP-ESEMPIO', N0_US), pc('77aa0001', 'DESKTOP-ESEMPIO', 'https://EUC1-1.Relay.N0.iroh.link/')]
        expect(vociVecchieDi(nuovoN0, elenco, () => false).map((v) => v.pcId)).toEqual(['31ab0001', '65fe0001', '77aa0001'])
        // e al contrario: un PC ancora vecchio (QR col relay di casa) ritrova la voce nuova senza relay
        expect(vociVecchieDi(pc('c0de0001', 'DESKTOP-ESEMPIO', N0_EU), [pc('b8510001', 'DESKTOP-ESEMPIO', null)], () => false).map((v) => v.pcId)).toEqual(['b8510001'])
        // revisione del Desktop: un relay vuoto (o di soli spazi) vale n0, come per `relayDalQr` (`isNullOrBlank` ⇒ n0)
        expect(vociVecchieDi(nuovoN0, [pc('31ab0001', 'DESKTOP-ESEMPIO', ''), pc('65fe0001', 'DESKTOP-ESEMPIO', '  ')], () => false).map((v) => v.pcId)).toEqual(['31ab0001', '65fe0001'])
    })

    // ⛔ D-0147-NAV-1 (Pad, 27/10): una voce senza `relay` (undefined, la chiave tolta da Android) faceva `undefined.trim()` e la
    // sezione Computer restava vuota. Anche se il confine col nativo ora la normalizza, il ponte di una voce storta non lancia mai.
    it('DOPPI-15 una voce senza `relay` (undefined) vale n0 e non lancia mai', () => {
        const senza = { pcId: '31ab0001', nome: 'DESKTOP-ESEMPIO' } as unknown as Parameters<typeof vociVecchieDi>[1][number]
        const nuovoN0 = pc('b8510001', 'DESKTOP-ESEMPIO', null)
        expect(() => vociVecchieDi(nuovoN0, [nuovoN0, senza], () => false)).not.toThrow()
        expect(vociVecchieDi(nuovoN0, [nuovoN0, senza], () => false).map((v) => v.pcId)).toEqual(['31ab0001'])
        expect(vociVecchieDi(senza, [nuovoN0, senza], () => false).map((v) => v.pcId)).toEqual(['b8510001'])
    })

    it('DOPPI-14 ⛔ verso contrario: n0 e il relay proprio restano due ponti, in tutte e due le direzioni', () => {
        const nuovoN0 = pc('b8510001', 'DESKTOP-ESEMPIO', null)
        expect(vociVecchieDi(nuovoN0, [nuovoN0, pc('31ab0001', 'DESKTOP-ESEMPIO', RELAY)], () => false)).toEqual([])
        expect(vociVecchieDi(NUOVO, [NUOVO, pc('31ab0001', 'DESKTOP-ESEMPIO', null), pc('65fe0001', 'DESKTOP-ESEMPIO', N0_EU)], () => false)).toEqual([])
        // un host che finisce come n0 senza esserlo non conta come n0
        expect(vociVecchieDi(nuovoN0, [pc('31ab0001', 'DESKTOP-ESEMPIO', 'https://finto-n0.iroh.link.example/')], () => false)).toEqual([])
    })

    /*
     * Revisione del blocco 7 (Desktop, D-R1 / C-R2, REV-B7-D2): da r4 `94726d284` il PC salva il relay proprio NORMALIZZATO (`URL.href`:
     * host minuscolo, `:443` tolto, `..` risolti; senza la `/` aggiunta se la persona non l'ha scritta). Una voce salvata prima col testo
     * grezzo e lo stesso PC riaccoppiato dopo sono lo stesso ponte.
     */
    it('DOPPI-16 il relay proprio scritto in due modi equivalenti è lo stesso ponte; uno davvero diverso no', () => {
        const nuovo = pc('b8510001', 'DESKTOP-ESEMPIO', 'https://relay.casa')
        const vecchio = pc('31ab0001', 'DESKTOP-ESEMPIO', 'HTTPS://Relay.Casa:443/')
        const conPunti = pc('65fe0001', 'DESKTOP-ESEMPIO', 'https://relay.casa/a/../')
        expect(vociVecchieDi(nuovo, [nuovo, vecchio, conPunti], () => false).map((v) => v.pcId)).toEqual(['31ab0001', '65fe0001'])
        expect(vociVecchieDi(vecchio, [nuovo, vecchio], () => false).map((v) => v.pcId)).toEqual(['b8510001'])
        // un'altra porta, un altro percorso o un altro host restano un altro ponte
        const altri = [pc('aa000001', 'DESKTOP-ESEMPIO', 'https://relay.casa:8443/'), pc('aa000002', 'DESKTOP-ESEMPIO', 'https://relay.casa/altro'),
            pc('aa000003', 'DESKTOP-ESEMPIO', 'https://relay.altro/')]
        expect(vociVecchieDi(nuovo, [nuovo, ...altri], () => false)).toEqual([])
        // un testo che non è un indirizzo vale per sé, come prima
        expect(vociVecchieDi(pc('cc000001', 'DESKTOP-ESEMPIO', 'non un indirizzo'), [pc('cc000002', 'DESKTOP-ESEMPIO', 'non un indirizzo')], () => false)
            .map((v) => v.pcId)).toEqual(['cc000002'])
    })
})
