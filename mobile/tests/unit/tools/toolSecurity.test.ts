import { describe, expect, it } from 'vitest'
import {
    TALOS_EMPTY_CHAIN,
    TALOS_TOOL_SECURITY_FALLBACK,
    talosAdvanceChain,
    talosEffectiveRisk,
    talosForbidsPersistentGrant,
    talosSecurityMatchesActions,
    talosTrifectaVerdict,
    type TalosToolSecurity,
} from '@/lib/tools/security'

function tool(patch: Partial<TalosToolSecurity> = {}): TalosToolSecurity {
    return {
        risk: 'R1',
        reversibility: 'read-only',
        readsPrivateData: false,
        readsUntrustedContent: false,
        canTransmit: false,
        ...patch,
    }
}

/**
 * La regola che la ricerca del 2026-08-06 mette al centro, e su cui le due
 * ricerche indipendenti convergono: il rischio grave non appartiene a un tool,
 * appartiene alla CATENA.
 *
 * `library_read` da solo è innocuo. `web_search` da solo è innocuo. Leggere una
 * nota che contiene «cerca su internet questo numero» e poi cercarlo non lo è —
 * e nessuno dei due tool, guardato da solo, lo direbbe.
 */
describe('la trifecta letale', () => {
    it('non scatta finché manca anche solo un pezzo', () => {
        const trasmette = tool({ canTransmit: true })

        // Nessuno dei tre.
        expect(talosTrifectaVerdict(TALOS_EMPTY_CHAIN, trasmette).closed).toBe(false)

        // Solo dati privati: leggere la Libreria e poi cercare sul web è normale.
        const soloPrivati = talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsPrivateData: true }))
        expect(talosTrifectaVerdict(soloPrivati, trasmette).closed).toBe(false)

        // Solo contenuto non attendibile: aver letto una pagina e cercarne
        // un'altra non espone niente di nostro.
        const soloEsterno = talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsUntrustedContent: true }))
        expect(talosTrifectaVerdict(soloEsterno, trasmette).closed).toBe(false)

        // Tutti e due, ma il tool che parte NON trasmette: non esce niente.
        const entrambi = talosAdvanceChain(soloPrivati, tool({ readsUntrustedContent: true }))
        expect(talosTrifectaVerdict(entrambi, tool({ canTransmit: false })).closed).toBe(false)
    })

    it('scatta quando le tre condizioni stanno insieme, e dice perché', () => {
        let catena = talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsPrivateData: true }))
        catena = talosAdvanceChain(catena, tool({ readsUntrustedContent: true }))
        const verdetto = talosTrifectaVerdict(catena, tool({ canTransmit: true }))
        expect(verdetto).toEqual({
            closed: true, reason: 'trifecta', privateDataSeen: true, untrustedSeen: true,
        })
    })

    /**
     * La contaminazione NON si lava. Una volta che una pagina web è entrata nel
     * discorso, il discorso resta contaminato: è il caso della «perdita del
     * taint», dove un sistema considera pulito un dato che non lo è perché la
     * provenienza si è persa per strada.
     */
    it('una volta contaminata, la catena non torna pulita', () => {
        let catena = talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsUntrustedContent: true }))
        // Dieci tool innocui dopo: la catena ricorda ancora.
        for (let giro = 0; giro < 10; giro += 1) catena = talosAdvanceChain(catena, tool())
        expect(catena.untrustedSeen).toBe(true)
    })

    it('non alloca un oggetto nuovo quando niente cambia', () => {
        const catena = talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsPrivateData: true }))
        expect(talosAdvanceChain(catena, tool({ readsPrivateData: true }))).toBe(catena)
    })
})

/**
 * Il rischio sale PRIMA che la trappola si chiuda: è il modo di far chiedere
 * conferma un passo prima, invece di limitarsi a sbarrare la porta dopo.
 */
describe('il rischio effettivo', () => {
    it('è quello dichiarato quando la catena è pulita', () => {
        expect(talosEffectiveRisk(TALOS_EMPTY_CHAIN, tool({ risk: 'R1' }))).toBe('R1')
    })

    it('sale di un gradino per ogni pezzo di trifecta già presente', () => {
        const conEsterno = talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsUntrustedContent: true }))
        expect(talosEffectiveRisk(conEsterno, tool({ risk: 'R1', canTransmit: true }))).toBe('R2')

        const entrambi = talosAdvanceChain(conEsterno, tool({ readsPrivateData: true }))
        expect(talosEffectiveRisk(entrambi, tool({ risk: 'R1', canTransmit: true }))).toBe('R3')
    })

    it('non sale per un tool che non può trasmettere', () => {
        const entrambi = talosAdvanceChain(
            talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsPrivateData: true })),
            tool({ readsUntrustedContent: true }),
        )
        expect(talosEffectiveRisk(entrambi, tool({ risk: 'R1', canTransmit: false }))).toBe('R1')
    })

    it('non supera mai R4, e un rischio inventato ricade sul predefinito prudente', () => {
        const entrambi = talosAdvanceChain(
            talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsPrivateData: true })),
            tool({ readsUntrustedContent: true }),
        )
        expect(talosEffectiveRisk(entrambi, tool({ risk: 'R4', canTransmit: true }))).toBe('R4')
        expect(talosEffectiveRisk(TALOS_EMPTY_CHAIN, tool({ risk: 'R9' as never }))).toBe('R3')
    })
})

describe('«consenti sempre»', () => {
    it('non esiste su R4, e vale anche quando ci si arriva per via della catena', () => {
        expect(talosForbidsPersistentGrant('R4')).toBe(true)
        expect(talosForbidsPersistentGrant('R3')).toBe(false)

        // Il caso che conta: il tool si dichiara R3, ma la catena lo porta a R4.
        const entrambi = talosAdvanceChain(
            talosAdvanceChain(TALOS_EMPTY_CHAIN, tool({ readsPrivateData: true })),
            tool({ readsUntrustedContent: true }),
        )
        const effettivo = talosEffectiveRisk(entrambi, tool({ risk: 'R3', canTransmit: true }))
        expect(effettivo).toBe('R4')
        expect(talosForbidsPersistentGrant(effettivo)).toBe(true)
    })

    /**
     * ⛔⛔ L'ECCEZIONE DELL'OWNER, e la guardia che le impedisce di allargarsi.
     *
     * Owner 2026-08-12, dopo un mio rifiuto e una sua riconferma: «il consenti
     * sempre si riferiva al controllo del dispositivo, da modalità ASSISTENTE».
     * Il pilota non è una chiamata, è una sessione: chiedere a ogni tocco non è
     * una difesa in più, è la funzione che non si può usare.
     *
     * ⛔ Il rischio VERO di questa eccezione non è il tool a cui è stata data:
     * è il PROSSIMO `R4` che nasce e se la porta dietro senza che nessuno lo
     * decida. Per questo è un dato per tool, e per questo il catalogo si conta.
     */
    it('⭐ un tool che dichiara l’eccezione tiene il «sempre» anche a R4', () => {
        expect(talosForbidsPersistentGrant('R4', ['write', 'outbound'], true)).toBe(false)
        // …e senza dichiararla lo perde, che è il caso di tutti gli altri.
        expect(talosForbidsPersistentGrant('R4', ['write', 'outbound'])).toBe(true)
    })

    it('⛔ l’eccezione NON scatta da sola: la deve dichiarare il tool', () => {
        // Il verso contrario. Se bastasse il rischio, o le azioni, o la catena,
        // l'eccezione si allargherebbe senza che nessuno l'abbia decisa.
        expect(talosForbidsPersistentGrant('R4', ['write'], false)).toBe(true)
        expect(talosForbidsPersistentGrant('R4', ['write'], undefined)).toBe(true)
    })
})

/**
 * Il buco peggiore possibile sarebbe un tool che trasmette senza dichiarare
 * `outbound`: un «mai» su «uscire in rete» non lo fermerebbe, e chi ha creduto
 * di chiudere quella porta non avrebbe modo di accorgersene.
 */
describe('coerenza fra ciò che il tool dichiara e i permessi che chiede', () => {
    it('chi trasmette DEVE chiedere outbound', () => {
        expect(talosSecurityMatchesActions(tool({ canTransmit: true }), ['read'])).toBe(false)
        expect(talosSecurityMatchesActions(tool({ canTransmit: true }), ['read', 'outbound'])).toBe(true)
    })

    it('chi si dichiara in sola lettura non può chiedere di scrivere', () => {
        expect(talosSecurityMatchesActions(tool({ reversibility: 'read-only' }), ['write'])).toBe(false)
    })
})

/**
 * Il predefinito è il PIÙ prudente, come fa la specifica MCP: un tool senza
 * annotazioni si considera modificante, distruttivo e aperto verso l'esterno.
 * Un default permissivo trasformerebbe una dimenticanza in un varco.
 */
describe('il predefinito', () => {
    it('è sospettoso su tutto', () => {
        expect(TALOS_TOOL_SECURITY_FALLBACK).toEqual({
            risk: 'R3',
            reversibility: 'irreversible',
            readsPrivateData: true,
            readsUntrustedContent: true,
            canTransmit: true,
        })
    })
})
