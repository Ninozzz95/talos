import { describe, expect, it } from 'vitest'
import {
    TALOS_PLAN_RISK_THRESHOLD,
    talosBuildPlan,
    talosPlanAdmits,
    talosPlanLiveSteps,
    talosPlanNeedsApproval,
    talosPlanRisk,
    talosPlanWithout,
    type TalosPlanCandidate,
} from '@/lib/tools/plan'
import type { TalosToolSecurity } from '@/lib/tools/security'

/**
 * B1 — il modello del piano, e le QUATTRO decisioni dell'owner del 2026-08-07.
 *
 * 1. Il piano compare **sulla soglia di rischio**, non sul numero di tool.
 * 2. I passi si **tolgono**, non si riscrivono.
 * 3. Una deviazione **ferma e ripropone**.
 * 4. L'approvazione si lega all'**impronta degli argomenti**.
 */

function sicurezza(patch: Partial<TalosToolSecurity> = {}): TalosToolSecurity {
    return {
        risk: 'R1',
        reversibility: 'read-only',
        readsPrivateData: true,
        readsUntrustedContent: false,
        canTransmit: false,
        ...patch,
    }
}

function passo(patch: Partial<TalosPlanCandidate> = {}): TalosPlanCandidate {
    return {
        id: 'p1',
        tool: 'notes_list',
        title: 'List notes',
        input: {},
        digest: 'aaa',
        security: sicurezza(),
        actions: ['read'],
        allowed: true,
        asks: true,
        critical: false,
        ...patch,
    }
}

describe('decisione 1 — la soglia e il rischio, non il conteggio', () => {
    it('«leggi questa nota e riassumila»: tre letture innocue, nessun piano', () => {
        const candidati = [
            passo({ id: 'a', tool: 'notes_list' }),
            passo({ id: 'b', tool: 'library_read' }),
            passo({ id: 'c', tool: 'time_now', security: sicurezza({ risk: 'R0' }) }),
        ]
        expect(talosPlanNeedsApproval(candidati)).toBe(false)
    })

    it('un passo IRREVERSIBILE fa comparire il piano da solo', () => {
        const candidati = [
            passo({ id: 'a' }),
            passo({
                id: 'b',
                tool: 'notes_delete',
                security: sicurezza({ risk: 'R2', reversibility: 'irreversible' }),
            }),
        ]
        expect(talosPlanNeedsApproval(candidati)).toBe(true)
    })

    it('e anche il rischio del GRUPPO, quando raggiunge la soglia', () => {
        const candidati = [
            passo({ id: 'a', security: sicurezza({ risk: TALOS_PLAN_RISK_THRESHOLD }) }),
            passo({ id: 'b' }),
        ]
        expect(talosPlanNeedsApproval(candidati)).toBe(true)
    })

    it('un passo solo non fa mai un piano: sarebbe una scheda di consenso travestita', () => {
        const candidati = [passo({
            id: 'a',
            security: sicurezza({ risk: 'R4', reversibility: 'irreversible' }),
        })]
        expect(talosPlanNeedsApproval(candidati)).toBe(false)
    })

    it('i critici non contano per la soglia: hanno la loro conferma, una per una', () => {
        const candidati = [
            passo({ id: 'a' }),
            passo({
                id: 'b',
                critical: true,
                security: sicurezza({ risk: 'R4', reversibility: 'irreversible' }),
            }),
        ]
        // Resta un solo passo non critico: nessun piano.
        expect(talosPlanNeedsApproval(candidati)).toBe(false)
        // E il critico NON entra nel piano costruito.
        expect(talosBuildPlan('x', candidati).steps.map((step) => step.id)).toEqual(['a'])
    })

    it('il rischio del gruppo si calcola sulla CATENA, non sui singoli', () => {
        // Nessuno dei due, da solo, e' oltre R1. Ma il primo porta dentro
        // contenuto non attendibile e il secondo puo' trasmettere: in catena
        // il secondo sale.
        const candidati = [
            passo({ id: 'a', security: sicurezza({ risk: 'R1', readsUntrustedContent: true }) }),
            passo({ id: 'b', security: sicurezza({ risk: 'R1', canTransmit: true }) }),
        ]
        expect(talosPlanRisk(candidati)).not.toBe('R1')
        expect(talosPlanNeedsApproval(candidati)).toBe(true)
    })
})

describe('decisione 2 — i passi si tolgono', () => {
    it('togliere un passo lo marca, e non lo cancella dall elenco', () => {
        const piano = talosBuildPlan('x', [passo({ id: 'a' }), passo({ id: 'b' })])
        const dopo = talosPlanWithout(piano, 'b')

        expect(dopo.steps).toHaveLength(2)
        expect(dopo.steps.find((step) => step.id === 'b')?.state).toBe('removed')
        expect(talosPlanLiveSteps(dopo).map((step) => step.id)).toEqual(['a'])
    })

    it('e il rischio SCENDE se il pezzo pericoloso era quello tolto', () => {
        const piano = talosBuildPlan('x', [
            passo({ id: 'a', security: sicurezza({ risk: 'R1' }) }),
            passo({ id: 'b', security: sicurezza({ risk: 'R3' }) }),
        ])
        expect(piano.risk).toBe('R3')
        expect(talosPlanWithout(piano, 'b').risk).toBe('R1')
    })

    it('un passo negato dal permesso resta VISIBILE, e non parte', () => {
        const piano = talosBuildPlan('x', [
            passo({ id: 'a' }),
            passo({ id: 'b', allowed: false }),
        ])
        // Si vede: nascondere darebbe l'impressione che non fosse stato chiesto.
        expect(piano.steps.map((step) => step.id)).toEqual(['a', 'b'])
        expect(piano.steps[1]!.state).toBe('denied')
        // Ma non e' fra quelli che partono.
        expect(talosPlanLiveSteps(piano).map((step) => step.id)).toEqual(['a'])
    })
})

describe('decisione 4 — l approvazione si lega all impronta', () => {
    const piano = talosBuildPlan('x', [
        passo({ id: 'a', tool: 'web_search', digest: 'impronta-della-pasta' }),
        passo({ id: 'b', tool: 'notes_list', digest: 'bbb' }),
    ])

    it('stessi argomenti: passa', () => {
        const esito = talosPlanAdmits(piano, 'web_search', 'impronta-della-pasta')
        expect(esito.admitted).toBe(true)
    })

    it('⛔ argomenti CAMBIATI: non passa, e lo dice per nome', () => {
        // Lo scenario vero: un'iniezione che colpisce FRA la proposta e
        // l'esecuzione userebbe un consenso dato per altro.
        const esito = talosPlanAdmits(piano, 'web_search', 'impronta-del-numero-di-carta')
        expect(esito.admitted).toBe(false)
        expect(esito).toMatchObject({ reason: 'arguments-changed' })
    })

    it('tool mai proposto: e una deviazione', () => {
        const esito = talosPlanAdmits(piano, 'notes_delete', 'qualunque')
        expect(esito).toEqual({ admitted: false, reason: 'not-in-plan' })
    })

    it('passo tolto dall utente: non passa, e non e la stessa cosa di una deviazione', () => {
        const senza = talosPlanWithout(piano, 'a')
        const esito = talosPlanAdmits(senza, 'web_search', 'impronta-della-pasta')
        expect(esito).toEqual({ admitted: false, reason: 'removed' })
    })

    it('e un passo negato dal permesso non parte nemmeno se il modello ci riprova', () => {
        const conNegato = talosBuildPlan('x', [
            passo({ id: 'a', tool: 'web_search', digest: 'ddd', allowed: false }),
        ])
        expect(talosPlanAdmits(conNegato, 'web_search', 'ddd').admitted).toBe(false)
    })
})

describe('la SECONDA PORTA — owner 2026-08-07: «porte, non muri»', () => {
    const contaminata = { privateDataSeen: true, untrustedSeen: true }
    const pulita = { privateDataSeen: false, untrustedSeen: false }

    function pianoConversazione() {
        return talosBuildPlan(
            'x',
            [passo({ id: 'a', tool: 'web_search', digest: 'la-pasta' })],
            pulita,
            'conversation',
        )
    }

    it('PER TURNO, argomenti nuovi: si ferma — e deve', () => {
        const perTurno = talosBuildPlan(
            'x',
            [passo({ id: 'a', tool: 'web_search', digest: 'la-pasta' })],
            pulita,
            'turn',
        )
        expect(talosPlanAdmits(perTurno, 'web_search', 'un-altra-cosa'))
            .toMatchObject({ admitted: false, reason: 'arguments-changed' })
    })

    it('PER CONVERSAZIONE, argomenti nuovi: passa — altrimenti la porta non aprirebbe su niente', () => {
        const piano = pianoConversazione()
        expect(talosPlanAdmits(piano, 'web_search', 'un-altra-cosa', pulita).admitted).toBe(true)
    })

    it('⛔ ma DECADE nel momento in cui entra contenuto non fidato', () => {
        const piano = pianoConversazione()
        const esito = talosPlanAdmits(piano, 'web_search', 'la-pasta', contaminata)

        expect(esito).toEqual({ admitted: false, reason: 'chain-contaminated' })
    })

    it('e decade ANCHE su un passo che corrisponde perfettamente', () => {
        // Il pericolo non e' l'argomento sbagliato: e' l'argomento giusto
        // eseguito dopo che qualcun altro ha parlato dentro la conversazione.
        const piano = pianoConversazione()
        expect(talosPlanAdmits(piano, 'web_search', 'la-pasta', contaminata).admitted).toBe(false)
    })

    it('se la catena era GIA contaminata quando hai approvato, non decade', () => {
        // Hai approvato sapendolo: non si puo' revocare per una condizione che
        // c'era gia' e che la scheda ti aveva mostrato.
        const piano = talosBuildPlan(
            'x',
            [passo({ id: 'a', tool: 'web_search', digest: 'la-pasta' })],
            contaminata,
            'conversation',
        )
        expect(talosPlanAdmits(piano, 'web_search', 'altro', contaminata).admitted).toBe(true)
    })

    it('un tool MAI proposto resta fuori anche per conversazione', () => {
        const piano = pianoConversazione()
        expect(talosPlanAdmits(piano, 'notes_delete', 'x', pulita))
            .toEqual({ admitted: false, reason: 'not-in-plan' })
    })

    it('e un passo TOLTO resta tolto anche per conversazione', () => {
        const senza = talosPlanWithout(pianoConversazione(), 'a')
        expect(talosPlanAdmits(senza, 'web_search', 'qualunque', pulita))
            .toEqual({ admitted: false, reason: 'removed' })
    })

    it('il predefinito e per TURNO: la porta si apre, non si trova aperta', () => {
        expect(talosBuildPlan('x', [passo()]).scope).toBe('turn')
    })
})

describe('il piano e un GUADAGNO netto, mai un costo', () => {
    /**
     * MISURATO sul Pad il 2026-08-07: per disegnare un gatto il modello chiama
     * `library_search`, `library_read` e `generate_image` — cioe' TRE schede
     * con i permessi su «chiedi ogni volta». Il piano non ne aggiunge una: ne
     * toglie due.
     *
     * Ma chi ha messo tutto su «consenti sempre» ha gia' detto «non
     * chiedermelo», e mostrargli un piano contraddirebbe la sua impostazione —
     * sarebbe una seconda grammatica dei permessi mascherata da comodita'.
     */
    const pesante = sicurezza({ risk: 'R2', canTransmit: true })

    it('con i permessi su CHIEDI: tre schede diventano un piano', () => {
        const candidati = [
            passo({ id: 'a', tool: 'library_search', asks: true }),
            passo({ id: 'b', tool: 'library_read', asks: true }),
            passo({ id: 'c', tool: 'generate_image', asks: true, security: pesante }),
        ]
        expect(talosPlanNeedsApproval(candidati)).toBe(true)
    })

    it('⛔ con tutto su CONSENTI SEMPRE: nessun piano, perche non c e niente da risparmiare', () => {
        const candidati = [
            passo({ id: 'a', tool: 'library_search', asks: false }),
            passo({ id: 'b', tool: 'library_read', asks: false }),
            passo({ id: 'c', tool: 'generate_image', asks: false, security: pesante }),
        ]
        expect(talosPlanNeedsApproval(candidati)).toBe(false)
    })

    it('basta UN passo che avrebbe chiesto perche il piano valga la pena', () => {
        const candidati = [
            passo({ id: 'a', asks: false }),
            passo({ id: 'b', asks: true, security: pesante }),
        ]
        expect(talosPlanNeedsApproval(candidati)).toBe(true)
    })

    it('e nemmeno un passo irreversibile fa comparire il piano se nessuno chiedeva', () => {
        // Chi ha detto «consenti sempre» sulle scritture ha accettato anche
        // questo. La difesa che resta e' quella che NON si puo' disattivare:
        // R4 e la trifecta, che passano dall'esecutore.
        const candidati = [
            passo({ id: 'a', asks: false }),
            passo({
                id: 'b',
                asks: false,
                security: sicurezza({ risk: 'R2', reversibility: 'irreversible' }),
            }),
        ]
        expect(talosPlanNeedsApproval(candidati)).toBe(false)
    })
})

describe('DURATA e ARGOMENTI sono due assi, non uno', () => {
    /**
     * ⛔ Il difetto che questa separazione ha evitato, per iscritto.
     *
     * «Per questa richiesta» deve MORIRE col turno ma ACCETTARE argomenti
     * nuovi — i passi successivi dello stesso strumento ne avranno di diversi.
     * Con un asse solo non era esprimibile: messo su `conversation` per
     * allentare l'impronta, sarebbe sopravvissuto al turno. Cioe' «per questa
     * richiesta» sarebbe diventato «per sempre», che e' la bugia peggiore che
     * una scheda di consenso possa dire.
     */
    const pulita = { privateDataSeen: false, untrustedSeen: false }
    const sporca = { privateDataSeen: true, untrustedSeen: true }

    function perQuestaRichiesta() {
        return {
            ...talosBuildPlan('t', [passo({ tool: 'web_search', digest: 'la-prima' })], pulita, 'turn'),
            state: 'approved' as const,
            matchArguments: false,
        }
    }

    it('vive quanto il TURNO: e la promessa della scheda', () => {
        expect(perQuestaRichiesta().scope).toBe('turn')
    })

    it('ma accetta argomenti NUOVI: altrimenti non aprirebbe su niente', () => {
        expect(talosPlanAdmits(perQuestaRichiesta(), 'web_search', 'la-seconda', pulita).admitted)
            .toBe(true)
    })

    it('⛔ e decade sulla contaminazione, perche non guarda gli argomenti', () => {
        // L'accoppiamento non negoziabile: se non guardi cosa passa, devi
        // almeno guardare da dove viene il discorso.
        expect(talosPlanAdmits(perQuestaRichiesta(), 'web_search', 'la-prima', sporca))
            .toEqual({ admitted: false, reason: 'chain-contaminated' })
    })

    it('un piano normale per turno resta STRETTO sugli argomenti', () => {
        const normale = {
            ...talosBuildPlan('n', [passo({ tool: 'web_search', digest: 'la-prima' })], pulita, 'turn'),
            state: 'approved' as const,
        }
        expect(normale.matchArguments).toBe(true)
        expect(talosPlanAdmits(normale, 'web_search', 'la-seconda', pulita))
            .toMatchObject({ admitted: false, reason: 'arguments-changed' })
    })

    it('e un tool mai chiesto resta fuori anche «per questa richiesta»', () => {
        expect(talosPlanAdmits(perQuestaRichiesta(), 'notes_delete', 'x', pulita))
            .toEqual({ admitted: false, reason: 'not-in-plan' })
    })
})
