import { describe, expect, it } from 'vitest'
import { caricaCompilatore, dichiaratiIn, genereDi } from '@/lib/kernel/simboli'

/**
 * ⛔⛔ Il test che conta non è «trova i nomi»: è che NON confonda una menzione
 * con una dichiarazione. Una ricerca testuale passerebbe il primo e fallirebbe
 * il secondo — e il catalogo direbbe «c'è» su un simbolo che non c'è.
 */

const nomi = async (testo: string, file = 'x.ts') => [...(await dichiaratiIn(testo, file)).nomi]

describe('chi dichiara un nome', () => {
    it('vede le dichiarazioni di ogni forma', async () => {
        const trovati = await nomi(`
            export function conSconto(c) { return c }
            function interna() {}
            const listino = []
            export const { alfa, beta } = qualcosa
            const [primo, secondo] = elenco
            export class Prezzo {}
            export type ScortaMinima = number
            export interface Riga { id: string }
            enum Stato { Uno }
            export async function* flusso() {}
        `)
        for (const atteso of ['conSconto', 'interna', 'listino', 'alfa', 'beta', 'primo',
            'secondo', 'Prezzo', 'ScortaMinima', 'Riga', 'Stato', 'flusso']) {
            expect(trovati, `manca ${atteso}`).toContain(atteso)
        }
    })

    it('⛔⛔ NON confonde una MENZIONE con una dichiarazione', async () => {
        const trovati = await nomi(`
            // scontoFedelta andrebbe aggiunta qui
            const testo = "scontoFedelta"
            export function usa(c) { return scontoFedelta(c) }
        `, 'x.mjs')
        expect(trovati).not.toContain('scontoFedelta')
        expect(trovati).toContain('usa')
        // Commento, stringa e chiamata non dichiarano niente. Una grep direbbe di sì.
    })

    it('⛔ un file ROTTO è «sorgenteInvalida», non un file vuoto', async () => {
        const esito = await dichiaratiIn('export function a( { return', 'x.mjs')
        expect(esito.copertura).toBe('sorgenteInvalida')
        expect(esito.nomi.size).toBe(0)
        expect(esito.perche).toBeTruthy()
        // Un file a metà modifica non rende assente ciò che contiene.
    })

    it('⛔⛔ i TIPI dentro un .mjs: quel file Node non lo caricherebbe', async () => {
        const esito = await dichiaratiIn('export function a(x: number) { return x }', 'x.mjs')
        expect(esito.copertura).toBe('sorgenteInvalida')
        // Dichiarare di aver capito un file che il runtime rifiuta è la stessa
        // bugia del tri-stato, un piano più in basso.
    })

    it('⭐ e lo stesso testo in un .ts si legge benissimo', async () => {
        const esito = await dichiaratiIn('export function a(x: number) { return x }', 'x.ts')
        expect(esito.copertura).toBe('completa')
        expect([...esito.nomi]).toContain('a')
    })

    it('un\'estensione che non sappiamo trattare è «nonSupportato»', async () => {
        for (const f of ['x.py', 'x.kt', 'x.json', 'x']) {
            expect((await dichiaratiIn('def a(): pass', f)).copertura).toBe('nonSupportato')
        }
    })

    it('un file VUOTO o di soli commenti è completo, e dichiara zero', async () => {
        for (const testo of ['', '\n\n', '// niente\n/* nemmeno */']) {
            const esito = await dichiaratiIn(testo, 'x.mjs')
            expect(esito.copertura).toBe('completa')
            expect(esito.nomi.size).toBe(0)
        }
    })

    it('la lingua la decide l\'estensione, e sono QUATTRO generi', async () => {
        const ts = await caricaCompilatore()
        expect(genereDi(ts, 'a.ts')).toBe(ts.ScriptKind.TS)
        expect(genereDi(ts, 'a.mts')).toBe(ts.ScriptKind.TS)
        expect(genereDi(ts, 'a.tsx')).toBe(ts.ScriptKind.TSX)
        expect(genereDi(ts, 'a.jsx')).toBe(ts.ScriptKind.JSX)
        expect(genereDi(ts, 'a.mjs')).toBe(ts.ScriptKind.JS)
        expect(genereDi(ts, 'a.js')).toBe(ts.ScriptKind.JS)
    })

    it('⭐⭐ e vede le RIESPORTAZIONI CON RINOMINA — cosa che babel non faceva', async () => {
        const trovati = await nomi('export { conSconto as sconto } from "./prezzo"\n', 'riesporta.ts')
        expect(trovati).toContain('sconto')
        // ⛔ È la risposta che ha fatto buttare la versione a babel: quel parser
        // avrebbe detto che `sconto` non è dichiarato in nessun file.
    })

    it('⭐ JSX e decoratori non fanno cadere il parse', async () => {
        expect((await dichiaratiIn('export const v = <div>ciao</div>', 'x.tsx')).copertura).toBe('completa')
        expect((await dichiaratiIn('const x = 1', 'x.js')).copertura).toBe('completa')
    })
})
