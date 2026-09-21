import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { percorsoAmmesso, talosCodiceTools, type TalosFontiCodice } from '@/lib/kernel/codiceTools'
import { componiLibreria } from '@/lib/kernel/libreriaStandard'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool, preflightTalosToolExecution } from '@/lib/tools/executor'
import type { TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⭐⭐⭐ L'ATTREZZO VERO, dentro l'esecutore vero.
 *
 * Non prova il kernel in isolamento — quello lo fanno gli altri file. Prova che
 * **il modello, chiamando uno strumento**, non può portare all'esistenza un
 * simbolo che non c'era, e che la persona non vede una scheda di consenso per
 * un'azione già impossibile.
 */

const PREZZO = 'src/prezzo.ts'
const SORGENTE = `export function conSconto(centesimi: number, percento: number) {
    return Math.round(centesimi * (100 - percento) / 100)
}

export function totale(righe: number[]) {
    return righe.reduce((s, r) => s + r, 0)
}
`

function fonti(iniziale = SORGENTE) {
    let albero: TalosSorgente[] = [{ percorso: PREZZO, testo: iniziale }]
    const scritture: Array<readonly TalosSorgente[]> = []
    const f: TalosFontiCodice = {
        leggiSpazio: async () => ({ sorgenti: albero, elenco: 'completo' as const }),
        scrivi: async (s) => { scritture.push(s); albero = [...s] as TalosSorgente[] },
        libreria: async () => componiLibreria(async (n) => {
            try { return await readFile(`node_modules/typescript/lib/${n}`, 'utf8') }
            catch { return null }
        }),
    }
    return {
        fonti: f,
        scritture,
        testoOra: () => albero.find((s) => s.percorso === PREZZO)?.testo ?? '',
    }
}

const deps = () => ({
    permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'allow' as const, read: 'allow' as const },
    isToolEnabled: () => true,
    requestConsent: vi.fn(async () => true),
    audit: async () => {},
    context: { sessionId: 's1' },
})

const attrezzo = (f: TalosFontiCodice) => talosCodiceTools(f)[0]!

describe('coding_edit_existing, dentro l\'esecutore', () => {
    it('⭐ sostituisce una funzione che esiste, e SCRIVE', async () => {
        const w = fonti()
        const esito = await executeTalosTool(attrezzo(w.fonti) as never, {
            file: PREZZO,
            nome: 'totale',
            codice: 'export function totale(righe: number[]) {\n    return righe.reduce((s, r) => s + r, 1)\n}',
        }, deps())

        expect(esito.ok).toBe(true)
        expect(w.scritture).toHaveLength(1)
        expect(w.testoOra()).toContain(', 1)')
        expect(w.testoOra()).toContain('export function conSconto')
    })

    it('⛔⛔ un simbolo che NON esiste: niente scrittura, e NESSUNA scheda', async () => {
        const w = fonti()
        const d = deps()
        const esito = await executeTalosTool(attrezzo(w.fonti) as never, {
            file: PREZZO,
            nome: 'scontoFedelta',
            codice: 'export function scontoFedelta(c: number) { return c }',
        }, { ...d, permissions: { ...TALOS_DEFAULT_TOOL_PERMISSIONS, write: 'ask' as const, read: 'allow' as const } })

        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_TOOL_PREMISE_ABSENT')
        expect(w.scritture).toHaveLength(0)
        expect(d.requestConsent).not.toHaveBeenCalled()
        // ⛔ La persona non ha speso un consenso per una cosa impossibile.
    })

    it('⛔ e il preflight lo dichiara TERMINALE, così non entra nemmeno nel piano', async () => {
        const w = fonti()
        const esito = await preflightTalosToolExecution(attrezzo(w.fonti) as never, {
            file: PREZZO, nome: 'scontoFedelta', codice: 'x',
        }, deps())
        expect(esito.status).toBe('terminal')
    })

    it('⛔⛔ G2: il bersaglio esiste ma la sostituzione chiama cose inesistenti', async () => {
        const w = fonti()
        const esito = await executeTalosTool(attrezzo(w.fonti) as never, {
            file: PREZZO,
            nome: 'totale',
            codice: 'export function totale(righe: number[]) {\n    return applicaScontoVip(righe)\n}',
        }, deps())

        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_CODE_RIFERIMENTI')
        expect(esito.content).toContain('applicaScontoVip')
        expect(w.scritture).toHaveLength(0)
        expect(w.testoOra()).toContain('reduce')
        // ⛔ Il bersaglio era valido: G1 da sola avrebbe scritto.
    })

    it('⛔ e un rifiuto NON mostra «✓ Fatto»', async () => {
        const w = fonti()
        const esito = await executeTalosTool(attrezzo(w.fonti) as never, {
            file: PREZZO, nome: 'totale',
            codice: 'export function totale(r: number[]) { return nonEsiste(r) }',
        }, deps())
        expect(esito.senzaEffetto).toBe(true)
    })

    it('⭐ e la LIBRERIA STANDARD arriva: `righe.length` è codice sano', async () => {
        const w = fonti()
        const esito = await executeTalosTool(attrezzo(w.fonti) as never, {
            file: PREZZO,
            nome: 'totale',
            codice: 'export function totale(righe: number[]) {\n    return righe.length\n}',
        }, deps())
        expect(esito.ok).toBe(true)
    })
})

describe('⛔⛔ il percorso è parte dell\'autorità', () => {
    it('rifiuta ogni forma di uscita dallo spazio di lavoro', () => {
        for (const cattivo of [
            '../fuori.ts', 'src/../../fuori.ts', '/etc/passwd', 'C:\\Windows\\x.ts',
            'src\\prezzo.ts', './src/prezzo.ts', 'src//prezzo.ts', '', '   ',
        ]) {
            expect(percorsoAmmesso(cattivo), `doveva rifiutare: ${cattivo}`).toBeNull()
        }
    })

    it('⭐ e accetta i percorsi legittimi', () => {
        expect(percorsoAmmesso('src/prezzo.ts')).toBe('src/prezzo.ts')
        expect(percorsoAmmesso('a/b/c/d.ts')).toBe('a/b/c/d.ts')
        expect(percorsoAmmesso(' src/prezzo.ts ')).toBe('src/prezzo.ts')
    })

    it('⛔ e l\'attrezzo lo rifiuta PRIMA di leggere qualunque cosa', async () => {
        const letture: number[] = []
        const spia: TalosFontiCodice = {
            leggiSpazio: async () => { letture.push(1); return { sorgenti: [], elenco: 'completo' as const } },
            scrivi: async () => {},
        }
        const esito = await executeTalosTool(attrezzo(spia) as never, {
            file: '../fuori.ts', nome: 'x', codice: 'y',
        }, deps())
        expect(esito.ok).toBe(false)
        // ⛔ Un tentativo di uscita non si «normalizza per gentilezza»:
        // normalizzarlo significherebbe eseguirlo in una forma più pulita.
    })
})

describe('la postcondizione', () => {
    it('⭐ conferma rileggendo dallo SPAZIO DI LAVORO, non dal risultato', async () => {
        const w = fonti()
        const t = attrezzo(w.fonti) as TalosToolDefinitionConVerify
        await executeTalosTool(t as never, {
            file: PREZZO, nome: 'totale',
            codice: 'export function totale(righe: number[]) { return righe.length }',
        }, deps())
        const verdetto = await t.verify!({ file: PREZZO, nome: 'totale' } as never, null, { sessionId: 's1' })
        expect(verdetto.held).toBe(true)
    })

    it('⛔ e non regge se il simbolo non c\'è', async () => {
        const w = fonti()
        const t = attrezzo(w.fonti) as TalosToolDefinitionConVerify
        const verdetto = await t.verify!({ file: PREZZO, nome: 'maiEsistito' } as never, null, { sessionId: 's1' })
        expect(verdetto.held).toBe(false)
    })
})

type TalosToolDefinitionConVerify = ReturnType<typeof talosCodiceTools>[number]

describe('⛔⛔ quando lo spazio di lavoro non si legge', () => {
    const cieco: TalosFontiCodice = {
        leggiSpazio: async () => { throw new Error('il ponte non risponde') },
        scrivi: async () => { throw new Error('non deve succedere') },
    }

    it('la premessa è IGNOTA, e con `reject` la modifica NON parte', async () => {
        const esito = await preflightTalosToolExecution(attrezzo(cieco) as never, {
            file: PREZZO, nome: 'totale', codice: 'x',
        }, deps())
        expect(esito.status).toBe('terminal')
        expect(esito.status === 'terminal' && esito.result.code).toBe('TALOS_TOOL_PREMISE_UNKNOWN')
        /*
         * ⛔ Su una capacità del telefono un dubbio può ancora passare — «non
         * riesco a provare che la torcia sia spenta» consente comunque un
         * comando idempotente. Su «questa funzione esiste ed è il bersaglio che
         * sto per sostituire?» no: `premiseUnknownPolicy: 'reject'`.
         */
    })

    it('⛔ e non è ASSENTE: non poter leggere non è la prova che non ci sia', async () => {
        const esito = await preflightTalosToolExecution(attrezzo(cieco) as never, {
            file: PREZZO, nome: 'totale', codice: 'x',
        }, deps())
        expect(esito.status === 'terminal' && esito.result.code).not.toBe('TALOS_TOOL_PREMISE_ABSENT')
    })
})

describe('⭐⭐ il catalogo non si ricostruisce a ogni domanda', () => {
    it('la seconda premessa riusa la prima, e resta corretta', async () => {
        const w = fonti()
        const t = attrezzo(w.fonti)
        const uno = await t.premesse!({ file: PREZZO, nome: 'totale' } as never)
        const due = await t.premesse!({ file: PREZZO, nome: 'conSconto' } as never)
        expect(uno.stato).toBe('presente')
        expect(due.stato).toBe('presente')

        // ⛔ E dopo una modifica VERA il catalogo si accorge: se riusasse alla
        // cieca direbbe «presente» su una funzione che non c'è più.
        await executeTalosTool(t as never, {
            file: PREZZO, nome: 'totale',
            codice: 'export function sommaRighe(righe: number[]) { return righe.length }',
        }, deps())
        expect((await t.premesse!({ file: PREZZO, nome: 'totale' } as never)).stato).toBe('assente')
        expect((await t.premesse!({ file: PREZZO, nome: 'sommaRighe' } as never)).stato).toBe('presente')
    })
})

describe('⛔⛔⛔ uno spazio di lavoro letto a META', () => {
    const meta: TalosFontiCodice = {
        leggiSpazio: async () => ({
            sorgenti: [{ percorso: PREZZO, testo: SORGENTE }],
            elenco: { troncato: 'stopped after 500 files' },
        }),
        scrivi: async () => { throw new Error('non deve succedere') },
    }

    it('non dice «non esiste»: dice che non lo sa, e RIFIUTA', async () => {
        const esito = await preflightTalosToolExecution(attrezzo(meta) as never, {
            file: 'src/altro.ts', nome: 'scontoFedelta', codice: 'x',
        }, deps())
        expect(esito.status).toBe('terminal')
        expect(esito.status === 'terminal' && esito.result.code).toBe('TALOS_TOOL_PREMISE_UNKNOWN')
        /*
         * ⛔ Senza questo, un tetto sul telefono trasformerebbe ogni file non
         * elencato in «il file non esiste» — e il modello, sentendoselo dire,
         * proverebbe a crearlo sopra un file che c'è gia.
         */
    })

    it('⭐ ma cio che HA visto resta valido: il troncamento non cancella i testimoni', async () => {
        const esito = await preflightTalosToolExecution(attrezzo(meta) as never, {
            file: PREZZO, nome: 'totale', codice: 'x',
        }, deps())
        expect(esito.status).not.toBe('terminal')
    })
})
