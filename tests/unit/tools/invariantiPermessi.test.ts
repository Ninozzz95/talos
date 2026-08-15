import { describe, expect, it } from 'vitest'
import { TALOS_TOOL_SECURITY } from '@/lib/tools/securityCatalog'
import {
    TALOS_TOOL_SECURITY_FALLBACK,
    talosEffectiveRisk,
    talosForbidsPersistentGrant,
    talosTrifectaVerdict,
    type TalosToolChainState,
} from '@/lib/tools/security'
import {
    talosBuildPlan,
    talosPlanReplacesConsent,
    type TalosPlanCandidate,
} from '@/lib/tools/plan'
import {
    TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    resolveTalosToolAuthorization,
    type TalosToolAuthorizationDecision,
} from '@/lib/tools/toolAuthorizations'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'

/**
 * ⛔ Gli INVARIANTI dei permessi, su TUTTI i tool e TUTTE le combinazioni.
 *
 * Owner 2026-08-07: «assicurati di testare tutte le possibilità immaginabili.
 * Abbiamo tantissimi tool, tantissime cose: non possiamo testarne un paio e
 * dire che vanno bene tutti.»
 *
 * Ha ragione, e la risposta non è toccare mille schermate: è enumerare le
 * combinazioni **meccanicamente** sulle funzioni vere. Gli assi sono cinque —
 * il tool, lo stato della catena, la decisione, lo stato del piano, e se gli
 * argomenti corrispondono — e il prodotto si percorre tutto.
 *
 * Questi test non descrivono un comportamento: fissano delle **promesse**. E
 * quando una cade, il messaggio dice per QUALE tool e in quale catena, invece
 * di dire soltanto «falso non è vero».
 */

const TOOLS = TALOS_AGENT_TOOL_CONTROLS.map((riga) => riga.id)

/** Le quattro combinazioni possibili della catena. Non una, non due. */
const CATENE: ReadonlyArray<{ nome: string, stato: TalosToolChainState }> = [
    { nome: 'pulita', stato: { privateDataSeen: false, untrustedSeen: false } },
    { nome: 'solo privati', stato: { privateDataSeen: true, untrustedSeen: false } },
    { nome: 'solo non fidato', stato: { privateDataSeen: false, untrustedSeen: true } },
    { nome: 'contaminata', stato: { privateDataSeen: true, untrustedSeen: true } },
]

const DECISIONI: readonly TalosToolAuthorizationDecision[] = [
    'allow_once', 'allow_turn', 'always_allow', 'deny',
]

const IMPRONTA = 'a'.repeat(64)
const ALTRA = 'b'.repeat(64)

function sicurezzaDi(tool: string) {
    return TALOS_TOOL_SECURITY[tool as keyof typeof TALOS_TOOL_SECURITY]
        ?? TALOS_TOOL_SECURITY_FALLBACK
}

function pianoCon(tool: string, opzioni: {
    approvato: boolean
    argomentiStretti: boolean
    catena: TalosToolChainState
}) {
    const candidato: TalosPlanCandidate = {
        id: 'p1',
        tool,
        title: tool,
        input: {},
        digest: IMPRONTA,
        security: sicurezzaDi(tool),
        actions: ['read'],
        allowed: true,
        asks: true,
        critical: false,
    }
    const base = talosBuildPlan('x', [candidato], opzioni.catena, 'turn')
    return {
        ...base,
        state: opzioni.approvato ? ('approved' as const) : ('proposed' as const),
        matchArguments: opzioni.argomentiStretti,
    }
}

function richiestaDi(tool: string, decisione: TalosToolAuthorizationDecision) {
    return {
        schema_version: 1,
        id: 'r1',
        checkpoint_id: 'k',
        session_id: 's',
        send_id: 'i',
        model_profile_id: null,
        call_id: 'c1',
        tool,
        actions: ['read', 'write', 'outbound'],
        input: {},
        input_digest: IMPRONTA,
        allow_persistent: true,
        decision: decisione,
        created_at: '2026-08-07T00:00:00.000Z',
    } as never
}

describe('INVARIANTE 1 — un permesso NEGATO non si apre mai', () => {
    it('per nessun tool, nessuna decisione', () => {
        const cedimenti: string[] = []
        for (const tool of TOOLS) {
            for (const decisione of DECISIONI) {
                const esito = resolveTalosToolAuthorization({
                    tool,
                    requiredActions: ['read', 'write', 'outbound'],
                    // Tutto negato: nessuna strada deve aprirsi.
                    permissions: { read: 'deny', write: 'deny', outbound: 'deny' },
                    grants: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
                    callId: 'c1',
                    inputDigest: IMPRONTA,
                    request: richiestaDi(tool, decisione),
                })
                if (esito.status === 'allowed') cedimenti.push(tool + '/' + decisione)
            }
        }
        expect(cedimenti).toEqual([])
    })
})

describe('INVARIANTE 2 — R4 chiede SEMPRE, anche dentro un piano approvato', () => {
    it('per ogni tool e ogni catena', () => {
        const cedimenti: string[] = []
        for (const tool of TOOLS) {
            for (const catena of CATENE) {
                const piano = pianoCon(tool, {
                    approvato: true, argomentiStretti: false, catena: catena.stato,
                })
                const salta = talosPlanReplacesConsent(
                    piano,
                    { tool, digest: IMPRONTA, risk: 'R4' },
                    catena.stato,
                )
                if (salta) cedimenti.push(tool + '/' + catena.nome)
            }
        }
        expect(cedimenti).toEqual([])
    })

    it('e il divieto di permesso permanente vale su R4 e solo su R4', () => {
        expect(talosForbidsPersistentGrant('R4')).toBe(true)
        for (const livello of ['R0', 'R1', 'R2', 'R3'] as const) {
            expect(talosForbidsPersistentGrant(livello)).toBe(false)
        }
    })
})

describe('INVARIANTE 3 — la trifecta chiusa chiede SEMPRE', () => {
    it('per ogni tool e ogni catena, anche con un piano approvato', () => {
        const cedimenti: string[] = []
        for (const tool of TOOLS) {
            for (const catena of CATENE) {
                const piano = pianoCon(tool, {
                    approvato: true, argomentiStretti: false, catena: catena.stato,
                })
                const salta = talosPlanReplacesConsent(
                    piano,
                    { tool, digest: IMPRONTA, reason: 'trifecta' },
                    catena.stato,
                )
                if (salta) cedimenti.push(tool + '/' + catena.nome)
            }
        }
        expect(cedimenti).toEqual([])
    })

    it('e si chiude esattamente quando i tre lati ci sono, per ogni tool', () => {
        for (const tool of TOOLS) {
            const sicurezza = sicurezzaDi(tool)
            for (const catena of CATENE) {
                const verdetto = talosTrifectaVerdict(catena.stato, sicurezza)
                const attesa = sicurezza.canTransmit
                    && catena.stato.privateDataSeen
                    && catena.stato.untrustedSeen
                expect(verdetto.closed, tool + '/' + catena.nome).toBe(attesa)
            }
        }
    })
})

describe('INVARIANTE 4 — un tool FUORI dal piano non passa mai', () => {
    it('per ogni coppia di tool diversi, e ogni catena', () => {
        const cedimenti: string[] = []
        for (const nelPiano of TOOLS) {
            for (const catena of CATENE) {
                const piano = pianoCon(nelPiano, {
                    approvato: true, argomentiStretti: false, catena: catena.stato,
                })
                for (const altro of TOOLS) {
                    if (altro === nelPiano) continue
                    const salta = talosPlanReplacesConsent(
                        piano, { tool: altro, digest: IMPRONTA }, catena.stato,
                    )
                    if (salta) cedimenti.push(nelPiano + ' lascia passare ' + altro)
                }
            }
        }
        expect(cedimenti).toEqual([])
    })
})

describe('INVARIANTE 5 — un piano NON approvato non salta niente', () => {
    it('per ogni tool e ogni catena', () => {
        const cedimenti: string[] = []
        for (const tool of TOOLS) {
            for (const catena of CATENE) {
                const piano = pianoCon(tool, {
                    approvato: false, argomentiStretti: false, catena: catena.stato,
                })
                const salta = talosPlanReplacesConsent(
                    piano, { tool, digest: IMPRONTA }, catena.stato,
                )
                if (salta) cedimenti.push(tool + '/' + catena.nome)
            }
        }
        expect(cedimenti).toEqual([])
    })
})

describe('INVARIANTE 6 — argomenti stretti: un digest diverso non passa mai', () => {
    it('per ogni tool e ogni catena', () => {
        const cedimenti: string[] = []
        for (const tool of TOOLS) {
            for (const catena of CATENE) {
                const piano = pianoCon(tool, {
                    approvato: true, argomentiStretti: true, catena: catena.stato,
                })
                const salta = talosPlanReplacesConsent(
                    piano, { tool, digest: ALTRA }, catena.stato,
                )
                if (salta) cedimenti.push(tool + '/' + catena.nome)
            }
        }
        expect(cedimenti).toEqual([])
    })
})

describe('INVARIANTE 7 — argomenti larghi: decade quando entra il non fidato', () => {
    it('per ogni tool, se la catena si contamina DOPO l approvazione', () => {
        const pulita = { privateDataSeen: false, untrustedSeen: false }
        const sporca = { privateDataSeen: true, untrustedSeen: true }
        const cedimenti: string[] = []
        for (const tool of TOOLS) {
            const piano = pianoCon(tool, {
                approvato: true, argomentiStretti: false, catena: pulita,
            })
            // Prima passa; dopo la contaminazione non deve piu'.
            if (!talosPlanReplacesConsent(piano, { tool, digest: IMPRONTA }, pulita)) {
                cedimenti.push(tool + ' non passava nemmeno con la catena pulita')
            }
            if (talosPlanReplacesConsent(piano, { tool, digest: IMPRONTA }, sporca)) {
                cedimenti.push(tool + ' passa ancora da contaminato')
            }
        }
        expect(cedimenti).toEqual([])
    })
})

describe('INVARIANTE 8 — il rischio effettivo non SCENDE mai per via della catena', () => {
    it('per ogni tool e ogni catena', () => {
        const scala = ['R0', 'R1', 'R2', 'R3', 'R4']
        const cedimenti: string[] = []
        for (const tool of TOOLS) {
            const sicurezza = sicurezzaDi(tool)
            for (const catena of CATENE) {
                const effettivo = talosEffectiveRisk(catena.stato, sicurezza)
                if (scala.indexOf(effettivo) < scala.indexOf(sicurezza.risk)) {
                    cedimenti.push(tool + '/' + catena.nome + ': ' + sicurezza.risk + ' -> ' + effettivo)
                }
            }
        }
        expect(cedimenti).toEqual([])
    })
})

describe('la copertura è REALE, non simbolica', () => {
    it('gli invarianti girano su tutti i tool del catalogo, non su un campione', () => {
        // Se un giorno il catalogo cresce e questo numero non si muove, vuol
        // dire che i cicli qui sopra hanno smesso di vedere qualcosa.
        // Il pavimento sale quando il catalogo cresce: serve a dire «gli
        // invarianti girano su TUTTI», non a fissare un numero.
        expect(TOOLS.length).toBeGreaterThanOrEqual(38)
        expect(new Set(TOOLS).size).toBe(TOOLS.length)
    })

    it('e ogni tool del catalogo ha la sua riga di sicurezza', () => {
        const senza = TOOLS.filter(
            (tool) => !(tool in TALOS_TOOL_SECURITY),
        )
        expect(senza).toEqual([])
    })
})

/**
 * ⛔⛔ IL «SEMPRE» NON SI TOGLIE A CHI SOLO LEGGE — decisione dell'owner.
 *
 * 2026-08-10, screenshot della scheda di `web_read`: «manca consenti sempre».
 * Non era un difetto di rendering: `web_read` è R2, ma dopo una ricerca la
 * CATENA lo porta a R4 e la regola toglieva il «sempre». Owner: «voglio che
 * consenti sempre appaia SEMPRE per le ricerche web, nessuno escluso in
 * lettura».
 *
 * ⛔ E il confine resta dov'era per tutto il resto: una lettura autorizzata per
 * sempre è una porta a un'iniezione, ma qualunque cosa quella pagina convinca
 * il modello a FARE passa da un tool che scrive — e quello il «sempre» non ce
 * l'ha. Questi due casi provano proprio quel confine.
 */
describe('⛔ il «sempre» e la lettura', () => {
    it('a R4, chi SOLO LEGGE tiene il «consenti sempre»', () => {
        expect(talosForbidsPersistentGrant('R4', ['read'])).toBe(false)
        expect(talosForbidsPersistentGrant('R4', ['read', 'outbound'])).toBe(false)
    })

    it('⛔ ma chi SCRIVE lo perde: è lì che la difesa morde', () => {
        expect(talosForbidsPersistentGrant('R4', ['write'])).toBe(true)
        expect(talosForbidsPersistentGrant('R4', ['write', 'outbound'])).toBe(true)
    })

    it('e sotto R4 non si toglie niente a nessuno', () => {
        expect(talosForbidsPersistentGrant('R2', ['write'])).toBe(false)
        expect(talosForbidsPersistentGrant('R3', ['write'])).toBe(false)
    })
})
