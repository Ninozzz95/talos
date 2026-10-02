import { describe, expect, it } from 'vitest'
// Il server importa il kernel col percorso del telefono: `vitest.config.ts` lo mappa sul kernel del repository.
import { createSessionRegistry } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/session-registry.mjs'
import * as moduloHttp from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/http-app.mjs'
import * as moduloConfig from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/config.mjs'
import * as moduloServizio from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/agent-service.mjs'

/**
 * ⛔⛔ P4-quater (02/10/2026) — il confine del Codice nel server del Pad. Il kernel lo prova `scripts/harness-talos/
 * scritturaFuori.test.mjs`; qui si prova che il server glielo passa. Prima: «Workspace write» (il predefinito, e quello delle
 * automazioni) arrivava al kernel SENZA livello (`session-registry.mjs`, `livelloAccesso = … : undefined`) e senza nessuna
 * cartella protetta. Decisioni dell'owner: come il desktop (`75108d7ee`) — fuori si chiede, «Consenti in questa cartella per
 * la sessione», le sessioni senza interfaccia ricevono subito un no spiegato; e «+1 su Hermes»: l'area di TALOS chiusa.
 */
const { requireApprovaBody } = moduloHttp as unknown as {
    requireApprovaBody(corpo: unknown): { requestId: string, approvato: boolean, ambito?: string }
}
const { cartelleDiTalos } = moduloConfig as unknown as {
    cartelleDiTalos(o: Record<string, unknown>): string[]
}
const { avviaSessione } = moduloServizio as unknown as { avviaSessione(o: Record<string, unknown>): Promise<unknown> }

type Evento = Record<string, unknown> & { type: string }
type Ricevuti = Record<string, unknown> & {
    livelloAccesso?: string
    chiediApprovazioneFn?: (azione: Record<string, unknown>) => Promise<boolean>
    consensiSessione?: { cartelleFuori?: string[] }
}

function registroDiProva(extra: Record<string, unknown> = {}) {
    const ricevuti: Ricevuti[] = []
    const registro = createSessionRegistry({
        cartellaStore: '/finta',
        chiave: 'chiave-finta-mai-usata-in-rete',
        registraRigaFn: async () => undefined,
        registraRigaSyncFn: () => undefined,
        elencaSessioniPersistiteFn: async () => [],
        cartelleProgetto: [{ id: '0', percorso: '/area/workspace', nome: 'workspace' }],
        cartelleProtette: ['/area'],
        radiceSessioniReali: '/sessioni',
        preparaEsecuzioneLiberaFn: () => ({ cartella: '/area/workspace', task: { consegna: 'ciao' }, comandoProva: null }),
        // Il giro resta «in corso»: la domanda si prova mentre il kernel la sta aspettando.
        avviaSessioneFn: (argomenti: Ricevuti) => { ricevuti.push(argomenti); return new Promise(() => {}) },
        ...extra,
    } as never) as unknown as {
        avviaLibero(o: Record<string, unknown>): { sessionId?: string, erroreAvvio?: string }
        rispondiApprovazione(s: string, r: string, a: boolean, o?: Record<string, unknown>): { ok?: true, erroreAvvio?: string, code?: string }
        iscriviti(s: string, f: (e: Evento) => void): () => void
    }
    return { registro, ricevuti }
}

function avvia(registro: ReturnType<typeof registroDiProva>['registro'], corpo: Record<string, unknown> = {}) {
    const esito = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true, ...corpo })
    expect(esito.erroreAvvio).toBeUndefined()
    const eventi: Evento[] = []
    registro.iscriviti(esito.sessionId as string, (e) => eventi.push(e))
    return { sessionId: esito.sessionId as string, eventi }
}

const FUORI = { verificato: true, cartella: '/fuori', chiave: 'locale|/fuori', frase: 'Vuole scrivere fuori dalla cartella della sessione, in /fuori.' }

describe('P4-quater — il server passa il confine al kernel', () => {
    it('REG-FUORI-01 ogni permesso diventa il livello giusto; «Workspace write» chiede (solo fuori) e porta i confini', () => {
        const { registro, ricevuti } = registroDiProva()
        for (const permessi of [undefined, 'Workspace write', 'Read only', 'On request', 'Full access']) {
            avvia(registro, permessi === undefined ? {} : { permessi, ...(permessi === 'Full access' ? {} : {}) })
        }
        const [predefinito, scrittura, lettura, richiesta, pieno] = ricevuti
        expect(predefinito?.livelloAccesso).toBe('scrittura-progetto')
        expect(scrittura?.livelloAccesso).toBe('scrittura-progetto')
        expect(typeof scrittura?.chiediApprovazioneFn).toBe('function')
        expect(lettura?.livelloAccesso).toBe('lettura')
        expect(richiesta?.livelloAccesso).toBeUndefined()
        expect(typeof richiesta?.chiediApprovazioneFn).toBe('function')
        expect(pieno?.livelloAccesso).toBeUndefined()
        expect(pieno?.chiediApprovazioneFn).toBeUndefined()
        for (const r of ricevuti) {
            expect(r.cartelleProtette).toEqual(['/area'])
            expect(r.cartelleConsentite).toEqual(expect.arrayContaining(['/area/workspace', '/sessioni']))
            expect(r.consensiSessione).toEqual({})
        }
    })

    it('REG-FUORI-02 una sessione senza interfaccia (automazione) riceve subito un no, e la cronologia dice perché', async () => {
        const { registro, ricevuti } = registroDiProva()
        const { eventi } = avvia(registro, { senzaInterfaccia: true })
        const chiedi = ricevuti[0]?.chiediApprovazioneFn
        expect(typeof chiedi).toBe('function')
        await expect(chiedi?.({ tipo: 'scrivi', percorso: '../x', fuoriDalProgetto: FUORI })).resolves.toBe(false)
        // Anche le altre domande: nessuno può rispondere, e una domanda appesa fermerebbe l'automazione per sempre.
        await expect(chiedi?.({ tipo: 'scrivi', percorso: '../casa/.ssh/config', suDomanda: { frase: 'x' } })).resolves.toBe(false)
        const risolte = eventi.filter((e) => e.type === 'ApprovalResolved')
        expect(risolte).toHaveLength(2)
        expect(risolte[0]).toMatchObject({ approvato: false, motivo: 'nessuna-interfaccia' })
        expect(eventi.filter((e) => e.type === 'ApprovalRequested')).toHaveLength(2)
    })

    it('REG-FUORI-03 «Consenti in questa cartella per la sessione» ricorda la cartella misurata dal kernel, solo col sì', async () => {
        const { registro, ricevuti } = registroDiProva()
        const { sessionId, eventi } = avvia(registro)
        const chiedi = ricevuti[0]?.chiediApprovazioneFn
        const risposta = chiedi?.({ tipo: 'scrivi', percorso: '../fuori/a.txt', fuoriDalProgetto: FUORI })
        const richiesta = eventi.find((e) => e.type === 'ApprovalRequested') as Evento & { requestId: string }
        // Un «no» con l'ambito, o un ambito sconosciuto, è rifiutato PRIMA di risolvere: la domanda resta in attesa.
        expect(registro.rispondiApprovazione(sessionId, richiesta.requestId, false, { ambito: 'cartella' })).toMatchObject({ code: 'QUERY_INVALID' })
        expect(registro.rispondiApprovazione(sessionId, richiesta.requestId, true, { ambito: 'disco' })).toMatchObject({ code: 'QUERY_INVALID' })
        expect(registro.rispondiApprovazione(sessionId, richiesta.requestId, true, { ambito: 'cartella' })).toEqual({ ok: true })
        await expect(risposta).resolves.toBe(true)
        // Lo stesso oggetto che il kernel tiene in mano: il consenso vale già per la prossima scrittura del giro.
        expect(ricevuti[0]?.consensiSessione).toEqual({ cartelleFuori: ['locale|/fuori'] })
        expect(eventi.find((e) => e.type === 'ApprovalResolved')).toMatchObject({ approvato: true, ambito: 'cartella' })
    })

    it('REG-FUORI-04 una domanda senza cartella verificata non si può consentire «per la cartella»', async () => {
        const { registro, ricevuti } = registroDiProva()
        const { sessionId, eventi } = avvia(registro)
        void ricevuti[0]?.chiediApprovazioneFn?.({ tipo: 'scrivi', percorso: '../x', fuoriDalProgetto: { verificato: false, cartella: null, chiave: null, frase: 'non verificato' } })
        const richiesta = eventi.find((e) => e.type === 'ApprovalRequested') as Evento & { requestId: string }
        expect(registro.rispondiApprovazione(sessionId, richiesta.requestId, true, { ambito: 'cartella' })).toMatchObject({ code: 'QUERY_INVALID' })
        expect(registro.rispondiApprovazione(sessionId, richiesta.requestId, true)).toEqual({ ok: true })
    })

    it('HTTP-FUORI-01 la rotta di approvazione accetta «ambito: cartella» solo insieme a un sì', () => {
        expect(requireApprovaBody({ requestId: 'r', approvato: true })).toEqual({ requestId: 'r', approvato: true })
        expect(requireApprovaBody({ requestId: 'r', approvato: true, ambito: 'cartella' })).toEqual({ requestId: 'r', approvato: true, ambito: 'cartella' })
        for (const corpo of [
            { requestId: 'r', approvato: false, ambito: 'cartella' },
            { requestId: 'r', approvato: true, ambito: 'disco' },
            { requestId: 'r', approvato: true, ambito: 'cartella', extra: 1 },
        ]) expect(() => requireApprovaBody(corpo)).toThrow()
    })

    it('AREA-SRV-01 le cartelle di TALOS del server: stato, radice del server, radice del kernel e la cartella di node', () => {
        // Sul Pad la cartella di node È l'area intera (/data/local/tmp/talos), quindi l'area è chiusa per costruzione.
        expect(cartelleDiTalos({
            cartellaStato: '/data/local/tmp/talos/state',
            radiceServer: '/data/local/tmp/talos/AVM',
            radiceKernel: '/data/local/tmp/talos/AVM-harness',
            eseguibile: '/data/local/tmp/talos/node',
        })).toEqual([
            '/data/local/tmp/talos/state', '/data/local/tmp/talos/AVM', '/data/local/tmp/talos/AVM-harness', '/data/local/tmp/talos',
        ])
        // Fuori dal ponte (sviluppo sul PC) lo stato può mancare: non diventa una stringa vuota.
        expect(cartelleDiTalos({ radiceServer: '/srv', radiceKernel: '/k', eseguibile: '/usr/bin/node' })).toEqual(['/srv', '/k', '/usr/bin'])
    })

    it('SRV-FUORI-01 agent-service passa al kernel consenso, area e cartelle consentite', async () => {
        const ricevuti: Record<string, unknown>[] = []
        const consensiSessione = {}
        await avviaSessione({
            cartella: '/area/workspace', task: { consegna: 'x' }, modello: 'm', chiave: 'chiave-finta-mai-usata-in-rete',
            onEvento: () => undefined, politicaRagionamentoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
            consensiSessione, cartelleProtette: ['/area'], cartelleConsentite: ['/area/workspace'],
            talosLavoraFn: async (argomenti: Record<string, unknown>) => {
                ricevuti.push(argomenti)
                return { comeFinita: 'concluso', messaggiFinali: [] }
            },
        })
        expect(ricevuti[0]?.consensiSessione).toBe(consensiSessione)
        expect(ricevuti[0]?.cartelleProtette).toEqual(['/area'])
        expect(ricevuti[0]?.cartelleConsentite).toEqual(['/area/workspace'])
    })
})
