import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    cartellePerSpostareR4,
    categoriaFileR4,
    genitoreR4,
    motivoErroreFileR4,
    nomeValidoR4,
    percorsoFiglioR4,
    righeAlberoR4,
    riassuntoRicercaR4,
    riportaAperteR4,
    vociAlberoR4,
} from '@/lib/harness/r4/alberoR4'

/*
 * ⛔ K3-FILE (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, owner 15/10 sera «Albero completo»): l'albero dei file del pannello
 * ▤ del Codice su r4. Le risposte sono quelle VERE di r4 @ 2161afb32 registrate sul Pad (cartella di prova creata e tolta). Le regole
 * sono quelle del desktop: voci come le ordina il server (cartelle prima), freccia solo sulle cartelle, categoria per estensione
 * (`categoriaFileAlbero`, `legacy/app.js:19292`), le parole di `app.files.*`.
 */
const registrato = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'albero-701c6c0d2.json'), 'utf8'))
const passo = (nome: string) => registrato.passi.find((p: { nome: string }) => p.nome === nome)

describe('l\'albero dei file del Codice su r4 (K3-FILE)', () => {
    it('ALB-01 le voci vere restano nell\'ordine del server; una voce storta o un nome che è un percorso non entrano', () => {
        const radice = vociAlberoR4(passo('radice').risposta)
        expect(radice.map((v) => v.nome)).toEqual(passo('radice').risposta.data.voci.map((v: { nome: string }) => v.nome))
        expect(radice.findIndex((v) => !v.cartella)).toBeGreaterThan(radice.findLastIndex((v) => v.cartella))
        expect(vociAlberoR4({ ok: true, data: { voci: [{ nome: 'a', cartella: false }, { nome: 'x/y', cartella: false }, { nome: 3 }, null, { nome: '..', cartella: true }] } }).map((v) => v.nome)).toEqual(['a'])
        expect(vociAlberoR4(passo('errore-albero-fuori').risposta)).toEqual([])
    })

    it('ALB-02 le righe visibili: le cartelle aperte mostrano i figli col loro livello, le chiuse no', () => {
        const livelli = new Map([
            ['', vociAlberoR4({ data: { voci: [{ nome: 'prova-albero', cartella: true }, { nome: 'NOTA.md', cartella: false }] } })],
            ['prova-albero', vociAlberoR4(passo('cartella-di-prova').risposta)],
            ['prova-albero/sotto', vociAlberoR4({ data: { voci: [{ nome: 'slug.mjs', cartella: false }] } })],
        ])
        const chiusa = righeAlberoR4(livelli, new Set())
        expect(chiusa.map((r) => [r.percorso, r.livello, r.aperta])).toEqual([['prova-albero', 0, false], ['NOTA.md', 0, null]])
        const aperte = righeAlberoR4(livelli, new Set(['prova-albero', 'prova-albero/sotto']))
        expect(aperte.map((r) => `${'  '.repeat(r.livello)}${r.nome}`)).toEqual(['prova-albero', '  sotto', '    slug.mjs', '  nota prova.md', 'NOTA.md'])
        expect(aperte.find((r) => r.nome === 'slug.mjs')!.categoria).toBe('code')
        // una cartella aperta ma non ancora letta: la riga c'è, i figli no (si caricano)
        expect(righeAlberoR4(new Map([['', livelli.get('')!]]), new Set(['prova-albero'])).map((r) => [r.nome, r.caricamento])).toEqual([['prova-albero', true], ['NOTA.md', false]])
    })

    it('ALB-03 percorsi, categoria, nome valido (un nome, non un percorso) come chiede r4', () => {
        expect(percorsoFiglioR4('', 'a.md')).toBe('a.md')
        expect(percorsoFiglioR4('x/y', 'a.md')).toBe('x/y/a.md')
        expect(genitoreR4('x/y/a.md')).toBe('x/y')
        expect(genitoreR4('a.md')).toBe('')
        expect(['slug.mjs', 'App.VUE', 'a.kt', 'nota.md', 'senza', 'archivio.tar.gz'].map(categoriaFileR4)).toEqual(['code', 'code', 'code', 'file', 'file', 'file'])
        expect(nomeValidoR4('  nota.md ')).toEqual({ ok: true, nome: 'nota.md' })
        for (const [nome, motivo] of [['', 'vuoto'], ['   ', 'vuoto'], ['a/b.md', 'percorso'], ['a\\b', 'percorso'], ['.', 'percorso'], ['..', 'percorso'], ['x'.repeat(256), 'lungo']] as const) {
            expect(nomeValidoR4(nome), nome.slice(0, 12)).toEqual({ ok: false, motivo })
        }
    })

    // pin r4 701c6c0d2 (#44): i rifiuti veri portano il MOTIVO, e il perché è la sua frase (`fraseDelMotivo` del desktop); prima tutti
    // «Invalid query», qui l'azione non riuscita. Un QUERY_INVALID senza motivo resta l'azione non riuscita.
    it('ALB-04 il perché di un rifiuto nelle parole del desktop: il motivo del server; un «Invalid query» senza motivo diventa l\'azione non riuscita', () => {
        expect(motivoErroreFileR4(passo('errore-esiste').risposta, 'crea', 'it')).toBe('Esiste già un file con questo nome')
        expect(motivoErroreFileR4(passo('errore-rinomina-su-esistente').risposta, 'rinomina', 'en')).toBe('A file with this name already exists')
        expect(motivoErroreFileR4(passo('errore-anteprima-mancante').risposta, 'apri', 'it')).toBe('File non trovato')
        expect(motivoErroreFileR4(passo('errore-nome-percorso').risposta, 'rinomina', 'it')).toBe('Nome nuovo non valido: serve un nome di file, non un percorso')
        expect(motivoErroreFileR4(passo('errore-sposta-in-se').risposta, 'sposta', 'en')).toBe('You cannot move an item into itself or one of its descendants')
        expect(motivoErroreFileR4(passo('errore-elimina-radice').risposta, 'elimina', 'it')).toBe('Percorso non valido')
        expect(motivoErroreFileR4(passo('errore-albero-mancante').risposta, 'albero', 'it')).toBe('Cartella non trovata')
        const senzaMotivo = { ok: false, error: { code: 'QUERY_INVALID', message: 'Invalid query', explanation: 'An unexpected problem occurred during the operation.' } }
        expect(motivoErroreFileR4(senzaMotivo, 'elimina', 'it')).toBe('Eliminazione non riuscita')
        expect(motivoErroreFileR4(senzaMotivo, 'sposta', 'en')).toBe('Move failed')
        expect(motivoErroreFileR4(null, 'duplica', 'it')).toBe('Copia non riuscita')
        expect(motivoErroreFileR4(passo('errore-anteprima-cartella').risposta, 'apri', 'en')).toBe('Not a file — open a folder from the tree, not from here')
        expect(motivoErroreFileR4(senzaMotivo, 'apri', 'en')).toBe('Operation failed.')
        for (const lingua of ['it', 'en']) expect(motivoErroreFileR4(passo('errore-nome-percorso').risposta, 'crea', lingua)).not.toMatch(/query/iu)
    })

    it('ALB-05 «Sposta in…»: mai la cartella stessa, i suoi discendenti o la cartella dove già sta', () => {
        const cartelle = ['', 'prova-albero', 'prova-albero/sotto', 'prova-albero/sotto/giù', 'altro', 'prova-alberone']
        expect(cartellePerSpostareR4('prova-albero/sotto', true, cartelle)).toEqual(['', 'altro', 'prova-alberone'])
        expect(cartellePerSpostareR4('prova-albero/nota.md', false, cartelle)).toEqual(['', 'prova-albero/sotto', 'prova-albero/sotto/giù', 'altro', 'prova-alberone'])
        expect(cartellePerSpostareR4('NOTA.md', false, cartelle)).not.toContain('')
    })

    it('ALB-06 la ricerca: i risultati veri, «nessun file», l\'elenco incompleto e le cartelle saltate a parole', () => {
        const trovati = riassuntoRicercaR4(passo('cerca').risposta, 'nota', 'it')
        expect(trovati.risultati.map((r) => r.percorso)).toEqual(passo('cerca').risposta.data.risultati.map((r: { percorso: string }) => r.percorso))
        expect(trovati.avvisi).toEqual([])
        expect(riassuntoRicercaR4(passo('cerca-niente').risposta, 'zzz', 'it').avvisi).toEqual(['Nessun file con «zzz» in questa cartella.'])
        // la rotta toglie `motivoChiave`: la frase inglese del server si riconosce fra le sue (`server.workspaceSearch.*`) e si traduce
        const parziale = (motivo: string, lingua: string, extra: Record<string, unknown> = {}) => riassuntoRicercaR4({ ok: true, data: { risultati: [{ percorso: 'a', nome: 'a', cartella: false }], troncato: true, motivo, saltate: ['.git', 'node_modules'], ...extra } }, 'a', lingua).avvisi
        expect(parziale('the search took too long', 'it')).toEqual(['L\'elenco non è completo: la ricerca ha impiegato troppo. Scrivi qualche lettera in più.', 'Non ho guardato dentro .git e node_modules.'])
        expect(parziale('the folder is very large', 'en')[0]).toBe('The list is not complete: the folder is very large. Type a few more letters.')
        expect(parziale('qualcos\'altro', 'en')[0]).toBe('The list is not complete: the search stopped early. Type a few more letters.')
        expect(parziale('x', 'it', { motivoChiave: 'server.workspaceSearch.moreResults' })[0]).toContain('ci sono più risultati di quanti se ne mostrano')
    })

    it('ALB-07 una cartella aperta rinominata o spostata resta aperta, con le sue sottocartelle; le altre non cambiano', () => {
        const aperte = new Set(['src', 'src/lib', 'src/lib/x', 'srcx', 'docs'])
        expect([...riportaAperteR4(aperte, 'src', 'codice')].sort()).toEqual(['codice', 'codice/lib', 'codice/lib/x', 'docs', 'srcx'])
        expect([...riportaAperteR4(aperte, 'src/lib', 'docs/lib')].sort()).toEqual(['docs', 'docs/lib', 'docs/lib/x', 'src', 'srcx'])
        expect([...riportaAperteR4(aperte, 'src', null)].sort()).toEqual([...aperte].sort())
    })
})
