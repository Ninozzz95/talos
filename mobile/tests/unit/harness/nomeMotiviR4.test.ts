import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { agentiDelPannelloR4, nomeBreveR4, nomeDellAgenteR4, NOME_IN_UNA_FRASE_R4, NOME_MASSIMO_R4 } from '@/lib/harness/r4/agentiR4'
import { chiDellAgenteR4 } from '@/lib/harness/r4/figlieR4'
import { fraseDelMotivoR4 } from '@/lib/harness/r4/fraseDelMotivoR4'
import { motivoErroreFileR4 } from '@/lib/harness/r4/alberoR4'
import { messaggioErroreModelloR4 } from '@/lib/harness/r4/modelloR4'
import { testoDelServerR4 } from '@/lib/harness/r4/testiServerR4'

/**
 * ⛔ K3 pin r4 701c6c0d2 (ledger `LEDGER-K3-PIN-R4-701-2026-10-17.md`). Golden calcolato dal codice VERO del desktop r4 @ 701c6c0d2
 * (`nome-motivi-701c6c0d2.json`):
 *   · L3-17 «un nome solo ovunque» (`grafo/run-dalle-deleghe.js` `nomeDellAgente`, `nomeBreve`; `grafo-agenti.js` `modelloGrafoAgenti`),
 *     con la revisione del bugfixer: un nome fatto solo di caratteri invisibili ripiega sul compito (`a680d311c`);
 *   · #44 i motivi dei rifiuti (`errori.js` `fraseDelMotivo`, buste dei moduli veri del server `public-problem.mjs`).
 */
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'nome-motivi-701c6c0d2.json'), 'utf8'))

describe('il nome di un agente come il desktop @ 701c6c0d2 (L3-17)', () => {
    it('NOME-R4-00 il golden è del pin, e le costanti sono le sue', () => {
        expect(golden.origine.commit).toBe('701c6c0d2d711879b53aa21bddad5a06d33538e7')
        expect({ NOME_MASSIMO: NOME_MASSIMO_R4, NOME_IN_UNA_FRASE: NOME_IN_UNA_FRASE_R4 }).toEqual(golden.costanti)
    })

    it('NOME-R4-01 `nomeDellAgente`: il nome del server, poi il compito corto, poi il compito; uno fatto solo di invisibili vale vuoto', () => {
        expect(golden.agenti.map((a: unknown) => nomeDellAgenteR4(a))).toEqual(golden.nomi)
        expect(golden.agenti.map((a: unknown) => nomeDellAgenteR4(a, NOME_IN_UNA_FRASE_R4))).toEqual(golden.nomiInUnaFrase)
        expect(golden.brevi.map((t: unknown) => nomeBreveR4(t))).toEqual(golden.nomiBrevi)
        expect(golden.brevi.map((t: unknown) => nomeBreveR4(t, NOME_IN_UNA_FRASE_R4))).toEqual(golden.nomiBrevi60)
    })

    it('NOME-R4-02 il pannello Agenti chiama ogni agente come il diagramma del desktop (`agentiPerInspector`: `taskCorto || nome del nodo`)', () => {
        for (const lingua of ['it', 'en'] as const) {
            const nodo = new Map(golden.nodi[lingua].map((n: { id: string; nome: string }) => [n.id, n.nome]))
            const pannello = agentiDelPannelloR4({ corrente: { sessionId: 'radice', nome: 'Sessione madre' }, sessioni: [], figli: golden.figli, richieste: [] }, lingua)
            const attesi = golden.figli.map((f: { sessionId: string; taskCorto?: string }) => ({ id: f.sessionId, nome: f.taskCorto || nodo.get(f.sessionId) }))
            expect(pannello.map((a) => ({ id: a.sessionId, nome: a.taskCorto })), lingua).toEqual(attesi)
        }
    })

    it('NOME-R4-03 chi chiede, sulla carta di una figlia: il nome dell\'agente o nessuno, mai un nome invisibile', () => {
        expect(golden.agenti.map((a: unknown) => chiDellAgenteR4(a))).toEqual(golden.nomi.map((n: string) => n || null))
    })
})

describe('la frase del motivo di un rifiuto come il desktop @ 701c6c0d2 (#44)', () => {
    it('MOT-R4-01 ogni busta: la frase del motivo nella lingua, o vuoto quando il server non l\'ha pubblicata per la persona', () => {
        for (const lingua of ['it', 'en'] as const) expect(golden.buste.map((b: unknown) => fraseDelMotivoR4(b, lingua)), lingua).toEqual(golden.frasi[lingua])
    })

    it('MOT-R4-02 il pannello file dice il motivo: «Non puoi spostare un elemento dentro sé stesso…», non «Spostamento non riuscito»', () => {
        const i = golden.buste.findIndex((b: { reason?: string; code?: string }) => b?.code === 'QUERY_INVALID' && b.reason === 'move-into-itself')
        expect(motivoErroreFileR4({ ok: false, error: golden.buste[i] }, 'sposta', 'it')).toBe(golden.frasi.it[i])
        expect(motivoErroreFileR4({ ok: false, error: golden.buste[i] }, 'sposta', 'en')).toBe(golden.frasi.en[i])
        // senza motivo resta com'era: l'azione non riuscita, mai «Invalid query»
        expect(motivoErroreFileR4({ ok: false, error: { code: 'QUERY_INVALID', message: 'Invalid query' } }, 'sposta', 'it')).toBe(motivoErroreFileR4(null, 'sposta', 'it'))
    })

    it('MOT-R4-03 la chiave che manca, col nome del fornitore, è la frase del desktop', () => {
        const i = golden.buste.findIndex((b: { reason?: string }) => b?.reason === 'provider-key-missing-named')
        expect(messaggioErroreModelloR4(golden.buste[i], 'it')).toBe(golden.frasi.it[i])
        expect(messaggioErroreModelloR4(golden.buste[i], 'en')).toBe(golden.frasi.en[i])
    })
})

describe('la carta d\'approvazione di una scrittura su un segreto (K1 del desktop, pin 701c6c0d2)', () => {
    it('APPR-SEG-01 «server.approval.write.secret» e «…keychain» si dicono nella lingua, col percorso', () => {
        expect(testoDelServerR4('server.approval.write.secret', { percorso: '.env' }, 'RISERVA', 'it'))
            .toBe('Questa scrittura modifica un file che può contenere chiavi o password (.env): vuoi che la faccia?')
        expect(testoDelServerR4('server.approval.write.keychain', null, 'RISERVA', 'en'))
            .toBe('This write changes the system keychain, where passwords are kept: do you want me to do it?')
    })
})
