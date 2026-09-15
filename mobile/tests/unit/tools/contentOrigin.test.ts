import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import { executeTalosTool, type TalosToolExecutionDeps } from '@/lib/tools/executor'
import {
    TALOS_EMPTY_CHAIN,
    talosAdvanceChain,
    talosContentOrigin,
    talosOriginForWrite,
    talosOriginIsUntrusted,
    talosTrifectaVerdict,
    type TalosToolChainState,
} from '@/lib/tools/security'
import { talosOriginOfVaultFile, talosWorstOrigin } from '@/lib/tools/readTools'

/**
 * A8 — la provenienza sta sul DATO, non sul tool.
 *
 * Il difetto che cura, misurato sul catalogo: **15 tool su 38** dichiaravano di
 * portare dentro contenuto non attendibile, e fra questi `notes_list`,
 * `tasks_list`, `memory_search` e `library_list`. Quindi dopo la prima lettura
 * qualsiasi la trifecta si chiudeva su tutti e otto i tool che trasmettono.
 * Ogni volta. La ricerca lo chiama **label creep** ed e' il modo in cui queste
 * difese muoiono: non perche' non scattino, ma perche' scattano sempre e
 * vengono spente.
 */

describe('il vocabolario, e il predefinito prudente', () => {
    it('una riga senza storia vale ESTERNA, non fidata', () => {
        // È il caso delle righe scritte prima che la colonna esistesse.
        expect(talosContentOrigin(null)).toBe('external')
        expect(talosContentOrigin(undefined)).toBe('external')
        expect(talosContentOrigin('qualcosa di inventato')).toBe('external')
        expect(talosOriginIsUntrusted(talosContentOrigin(null))).toBe(true)
    })

    it('solo cio che ha scritto l utente e fidato', () => {
        expect(talosOriginIsUntrusted('user-direct')).toBe(false)
        expect(talosOriginIsUntrusted('derived')).toBe(true)
        expect(talosOriginIsUntrusted('external')).toBe(true)
    })

    it('un file caricato dall utente non contamina, uno scaricato si', () => {
        expect(talosOriginOfVaultFile('uploaded')).toBe('user-direct')
        expect(talosOriginOfVaultFile('downloaded')).toBe('external')
        // Generato dal modello: sospetto per EREDITÀ, non per natura.
        expect(talosOriginOfVaultFile('generated')).toBe('derived')
        expect(talosOriginOfVaultFile(null)).toBe('derived')
    })

    it('in un elenco vince il PEGGIORE', () => {
        expect(talosWorstOrigin(['user-direct', 'user-direct'])).toBe('user-direct')
        expect(talosWorstOrigin(['user-direct', 'derived'])).toBe('derived')
        expect(talosWorstOrigin(['user-direct', 'derived', 'external'])).toBe('external')
        expect(talosWorstOrigin([])).toBe('user-direct')
    })

    it('cio che si scrive EREDITA lo stato della catena', () => {
        expect(talosOriginForWrite(TALOS_EMPTY_CHAIN)).toBe('user-direct')
        // Una nota scritta dal modello DOPO aver letto il web viene dal web.
        expect(talosOriginForWrite({ privateDataSeen: true, untrustedSeen: true }))
            .toBe('derived')
    })
})

describe('la catena ascolta il dato, non piu solo il tool', () => {
    const leggeLaLibreria = {
        risk: 'R1' as const,
        reversibility: 'read-only' as const,
        readsPrivateData: true,
        // Il tool DICHIARA di portare dentro roba non attendibile...
        readsUntrustedContent: true,
        canTransmit: false,
    }

    it('senza dichiarazione si ricade sul catalogo: nulla regredisce', () => {
        const dopo = talosAdvanceChain(TALOS_EMPTY_CHAIN, leggeLaLibreria)
        expect(dopo.untrustedSeen).toBe(true)
    })

    it('ma un file dell utente NON contamina piu, anche se il tool lo dichiara', () => {
        const dopo = talosAdvanceChain(TALOS_EMPTY_CHAIN, leggeLaLibreria, 'user-direct')
        expect(dopo.untrustedSeen).toBe(false)
        // I dati privati restano visti: quella meta' della trifecta non si tocca.
        expect(dopo.privateDataSeen).toBe(true)
    })

    it('e un file scaricato contamina, come deve', () => {
        const dopo = talosAdvanceChain(TALOS_EMPTY_CHAIN, leggeLaLibreria, 'external')
        expect(dopo.untrustedSeen).toBe(true)
    })

    it('una volta contaminata, la catena NON torna pulita', () => {
        const sporca: TalosToolChainState = { privateDataSeen: true, untrustedSeen: true }
        const dopo = talosAdvanceChain(sporca, leggeLaLibreria, 'user-direct')
        // Leggere una cosa pulita non ripulisce quello che è già entrato.
        expect(dopo.untrustedSeen).toBe(true)
    })
})

describe('l effetto che conta: la conferma arriva quando serve', () => {
    const cercaWeb = {
        risk: 'R2' as const,
        reversibility: 'reversible' as const,
        readsPrivateData: false,
        readsUntrustedContent: true,
        canTransmit: true,
    }
    const leggeLaLibreria = {
        risk: 'R1' as const,
        reversibility: 'read-only' as const,
        readsPrivateData: true,
        readsUntrustedContent: true,
        canTransmit: false,
    }

    it('PRIMA: leggere un tuo documento e poi cercare chiudeva la trifecta', () => {
        // Il comportamento vecchio, riprodotto passando la sola bandiera statica.
        const dopo = talosAdvanceChain(TALOS_EMPTY_CHAIN, leggeLaLibreria)
        expect(talosTrifectaVerdict(dopo, cercaWeb).closed).toBe(true)
    })

    it('ADESSO: con un documento TUO non si chiude piu', () => {
        const dopo = talosAdvanceChain(TALOS_EMPTY_CHAIN, leggeLaLibreria, 'user-direct')
        expect(talosTrifectaVerdict(dopo, cercaWeb).closed).toBe(false)
    })

    it('ma con un documento SCARICATO si chiude ancora, ed e il punto', () => {
        const dopo = talosAdvanceChain(TALOS_EMPTY_CHAIN, leggeLaLibreria, 'external')
        expect(talosTrifectaVerdict(dopo, cercaWeb).closed).toBe(true)
    })
})

describe('dentro l esecutore, con i tocchi veri del contratto', () => {
    function deps(patch: Partial<TalosToolExecutionDeps> = {}): TalosToolExecutionDeps {
        return {
            permissions: { read: 'allow', write: 'allow', outbound: 'allow' },
            isToolEnabled: () => true,
            requestConsent: vi.fn(async () => true),
            audit: vi.fn(async () => {}),
            context: { sessionId: 's1' },
            ...patch,
        }
    }

    /** `library_read` esiste nel catalogo con `readsUntrustedContent: true`. */
    function leggi(origine: 'user-direct' | 'external') {
        return defineTalosTool({
            name: 'library_read',
            title: 'Read a Library document',
            description: 'x',
            action: 'read',
            input: z.object({ id: z.string() }),
            run: async () => ({ ok: true, content: 'testo', contentOrigin: origine }),
        })
    }

    it('la catena che l esecutore propaga rispetta la dichiarazione', async () => {
        const onChain = vi.fn()
        await executeTalosTool(leggi('user-direct'), { id: 'f1' }, deps({ onChain }))
        // Non è stata chiamata affatto, oppure senza contaminazione: in
        // entrambi i casi `untrustedSeen` non è mai diventato vero.
        for (const chiamata of onChain.mock.calls) {
            expect((chiamata[0] as TalosToolChainState).untrustedSeen).toBe(false)
        }
    })

    it('e un file esterno la contamina davvero', async () => {
        const onChain = vi.fn()
        await executeTalosTool(leggi('external'), { id: 'f1' }, deps({ onChain }))
        expect(onChain).toHaveBeenCalledWith(
            expect.objectContaining({ untrustedSeen: true }),
        )
    })
})

describe('l attacco che questa regola esiste per fermare', () => {
    /**
     * «Fatti riassumere questa pagina in una nota, poi rileggi la nota.»
     *
     * È il modo di lavare la provenienza: il web entra, diventa una nota
     * scritta da noi, e alla rilettura sembra roba di casa. Se l'etichetta non
     * si EREDITASSE alla scrittura, la seconda lettura ripartirebbe pulita e la
     * trifecta non si chiuderebbe mai più.
     */
    it('una nota nata da una catena contaminata resta contaminata', () => {
        // 1. Il modello legge una pagina web: la catena si sporca.
        const dopoIlWeb = talosAdvanceChain(TALOS_EMPTY_CHAIN, {
            risk: 'R2', reversibility: 'reversible',
            readsPrivateData: false, readsUntrustedContent: true, canTransmit: true,
        })
        expect(dopoIlWeb.untrustedSeen).toBe(true)

        // 2. Scrive una nota. La provenienza NON gliela chiede nessuno:
        //    la decide lo stato della catena in quell'istante.
        const provenienzaDellaNota = talosOriginForWrite(dopoIlWeb)
        expect(provenienzaDellaNota).toBe('derived')

        // 3. Domani, conversazione nuova, catena pulita: si rilegge la nota.
        const rileggendo = talosAdvanceChain(
            TALOS_EMPTY_CHAIN,
            {
                risk: 'R1', reversibility: 'read-only',
                readsPrivateData: true, readsUntrustedContent: true, canTransmit: false,
            },
            provenienzaDellaNota,
        )
        // La contaminazione è sopravvissuta al salvataggio e al riavvio.
        expect(rileggendo.untrustedSeen).toBe(true)

        // 4. Quindi il tool che trasmette chiede ancora conferma.
        expect(talosTrifectaVerdict(rileggendo, {
            risk: 'R2', reversibility: 'reversible',
            readsPrivateData: false, readsUntrustedContent: true, canTransmit: true,
        }).closed).toBe(true)
    })

    it('mentre una nota scritta a mano dall utente non chiude niente', () => {
        const provenienza = talosOriginForWrite(TALOS_EMPTY_CHAIN)
        expect(provenienza).toBe('user-direct')

        const rileggendo = talosAdvanceChain(
            TALOS_EMPTY_CHAIN,
            {
                risk: 'R1', reversibility: 'read-only',
                readsPrivateData: true, readsUntrustedContent: true, canTransmit: false,
            },
            provenienza,
        )
        expect(talosTrifectaVerdict(rileggendo, {
            risk: 'R2', reversibility: 'reversible',
            readsPrivateData: false, readsUntrustedContent: true, canTransmit: true,
        }).closed).toBe(false)
    })
})
