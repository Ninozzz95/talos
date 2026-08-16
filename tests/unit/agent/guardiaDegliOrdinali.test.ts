/**
 * ⭐⭐⭐ «IL PRIMO CONTATTO» DEV'ESSERE IL PRIMO — e la guardia che lo controlla.
 *
 * Owner 2026-08-15: «se io voglio chiedere a TALOS mentre sono su WhatsApp di
 * cliccare sul **primo contatto**».
 *
 * GUI-Owl (`arXiv 2508.15144`) dichiara gli ordinali un **problema aperto**:
 *
 * > *«The document does not address ordinal references ("first contact") or
 * > icon-button grounding strategies.»*
 *
 * Il pezzo che mancava non era il ragionamento: era che gli indici **non erano
 * nemmeno in ordine di schermo** — misurato 0 su 19. Adesso lo sono, quindi
 * «il primo» si può calcolare, e qui si controlla che il modello lo rispetti.
 *
 * ## ⛔ La guardia CONTROLLA, non sceglie
 *
 * Il modello propone. Se la persona ha detto «il primo» e l'indice proposto non
 * è il primo della lista, non si tocca: si rimanda indietro **dicendo quale
 * sarebbe**. Scegliere al posto suo sarebbe togliergli il lavoro; lasciarlo
 * fare sarebbe aprire la chat sbagliata.
 */
import { describe, expect, it, vi } from 'vitest'
import {
    talosGuidaLoSchermo,
    type TalosPortePilota,
    type TalosSguardo,
} from '@/lib/agent/pilotaDelloSchermo'

/** Una lista di chat, come la vede l'occhio dopo l'ordinamento visivo. */
const CHAT: TalosSguardo = {
    elementi: [
        { indice: 0, tipo: 'tocca', etichetta: 'Cerca', inLista: false },
        { indice: 1, tipo: 'tocca', etichetta: 'Mario', inLista: true, posizione: 0 },
        { indice: 2, tipo: 'tocca', etichetta: 'Giulia', inLista: true, posizione: 1 },
        { indice: 3, tipo: 'tocca', etichetta: 'Paolo', inLista: true, posizione: 2 },
    ],
    frenoArmato: true,
    manoSulloSchermo: false,
}

function porte(obiettivo: string, risposte: readonly string[]): TalosPortePilota {
    let orologio = 0
    let giro = 0
    return {
        obiettivo,
        guarda: vi.fn(async () => CHAT),
        agisci: vi.fn(async () => ({ fatto: true })),
        chiedi: vi.fn(async () => risposte[Math.min(giro++, risposte.length - 1)]!),
        racconta: vi.fn(),
        adesso: vi.fn(() => (orologio += 1_000)),
    }
}

const tocca = (indice: number) => `{"azione":"tocca","indice":${indice},"perche":"x"}`
const fine = '{"azione":"fine","testo":"fatto"}'

describe('⭐ la guardia degli ordinali', () => {
    it('⛔ FERMA il modello che sceglie il TERZO quando è stato chiesto il primo', async () => {
        const p = porte('apri il primo contatto', [tocca(3), tocca(1), fine])
        const corsa = await talosGuidaLoSchermo(p)
        // La prima proposta non è stata eseguita: si è agito una volta sola.
        expect(p.agisci).toHaveBeenCalledTimes(1)
        expect(vi.mocked(p.agisci).mock.calls[0]![0].indice).toBe(1)
        expect(corsa.storia.some((r) => r.includes('NON eseguita'))).toBe(true)
    })

    it('⭐ dice al modello QUALE sarebbe, invece di rimandarlo al buio', async () => {
        const p = porte('apri il primo contatto', [tocca(3), fine])
        const corsa = await talosGuidaLoSchermo(p)
        const rimprovero = corsa.storia.find((r) => r.includes('NON eseguita'))
        expect(rimprovero).toContain('"Mario"')
        expect(rimprovero).toContain('primo')
    })

    it('⛔ NON scatta quando il modello ha ragione', async () => {
        const p = porte('apri il primo contatto', [tocca(1), fine])
        await talosGuidaLoSchermo(p)
        expect(p.agisci).toHaveBeenCalledTimes(1)
        expect(vi.mocked(p.agisci).mock.calls[0]![0].indice).toBe(1)
    })

    it('⛔ NON scatta senza un ordinale nella frase della persona', async () => {
        const p = porte('apri la chat di Paolo', [tocca(3), fine])
        await talosGuidaLoSchermo(p)
        expect(p.agisci).toHaveBeenCalledTimes(1)
        expect(vi.mocked(p.agisci).mock.calls[0]![0].indice).toBe(3)
    })

    it('⛔ NON scatta su un elemento FUORI dalla lista', async () => {
        // «Cerca» non è in lista: «il primo» lì è un modo di dire, non una posizione.
        const p = porte('tocca il primo campo', [tocca(0), fine])
        await talosGuidaLoSchermo(p)
        expect(p.agisci).toHaveBeenCalledTimes(1)
        expect(vi.mocked(p.agisci).mock.calls[0]![0].indice).toBe(0)
    })

    it('⛔⛔ NON scatta sul DOPPIONE contenitore/figlio con la stessa etichetta', async () => {
        /*
         * MISURATO sul Play Store: gli indici 0 e 1 avevano la stessa identica
         * etichetta — il contenitore cliccabile e il figlio che porta il nome.
         * Sono la stessa cosa vista due volte, e bloccarli darebbe un allarme a
         * ogni singolo passo.
         */
        const doppione: TalosSguardo = {
            ...CHAT,
            elementi: [
                { indice: 0, tipo: 'tocca', etichetta: 'Mario', inLista: true },
                { indice: 1, tipo: 'tocca', etichetta: 'Mario', inLista: true },
            ],
        }
        let orologio = 0
        let giro = 0
        const risposte = [tocca(1), fine]
        const p: TalosPortePilota = {
            obiettivo: 'apri il primo contatto',
            guarda: vi.fn(async () => doppione),
            agisci: vi.fn(async () => ({ fatto: true })),
            chiedi: vi.fn(async () => risposte[Math.min(giro++, risposte.length - 1)]!),
            racconta: vi.fn(),
            adesso: vi.fn(() => (orologio += 1_000)),
        }
        await talosGuidaLoSchermo(p)
        expect(p.agisci).toHaveBeenCalledTimes(1)
    })

    it('⛔ se il modello insiste sbagliando, la corsa si chiude invece di girare', async () => {
        const p = porte('apri il primo contatto', [tocca(3)])
        const corsa = await talosGuidaLoSchermo(p)
        expect(corsa.fine.motivo).toBe('troppi-fallimenti')
        expect(p.agisci).not.toHaveBeenCalled()
    })
})
