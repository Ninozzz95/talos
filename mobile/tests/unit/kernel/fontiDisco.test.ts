import { describe, expect, it } from 'vitest'
import { fontiDaDisco, type TalosDisco } from '@/lib/kernel/fontiDisco'

/** Un disco finto: una mappa percorso → testo, con guasti su richiesta. */
function disco(file: Record<string, string>, guasti: { cartelle?: string[], file?: string[] } = {}) {
    const scritture: Array<{ percorso: string, testo: string }> = []
    const d: TalosDisco = {
        elenca: async (cartella) => {
            if (guasti.cartelle?.includes(cartella)) throw new Error('permission denied')
            const prefisso = cartella ? `${cartella}/` : ''
            const visti = new Map<string, { cartella: boolean, byte: number }>()
            for (const p of Object.keys(file)) {
                if (!p.startsWith(prefisso)) continue
                const resto = p.slice(prefisso.length)
                if (!resto) continue
                const taglio = resto.indexOf('/')
                if (taglio === -1) visti.set(resto, { cartella: false, byte: file[p]!.length })
                else visti.set(resto.slice(0, taglio), { cartella: true, byte: 0 })
            }
            return [...visti].map(([nome, v]) => ({ nome, ...v }))
        },
        leggi: async (percorso) => {
            if (guasti.file?.includes(percorso)) throw new Error('unreadable')
            return file[percorso]!
        },
        scrivi: async (percorso, testo) => { scritture.push({ percorso, testo }); file[percorso] = testo },
    }
    return { d, scritture }
}

const PROGETTO = {
    'src/a.ts': 'export const alfa = 1\n',
    'src/interno/b.ts': 'export const beta = 2\n',
    'README.md': '# non e codice\n',
    'node_modules/libreria/x.ts': 'export const nonMio = 3\n',
    '.git/config': 'roba\n',
}

describe('la sorgente da disco', () => {
    it('⭐ scende nelle cartelle e tiene i percorsi relativi', async () => {
        const { d } = disco({ ...PROGETTO })
        const letto = await fontiDaDisco(d).leggiSpazio()
        expect(letto.sorgenti.map((s) => s.percorso).sort()).toEqual(['src/a.ts', 'src/interno/b.ts'])
        expect(letto.elenco).toBe('completo')
    })

    it('⛔ salta cio che il progetto ha SCARICATO o PRODOTTO, non cio che ha scritto', async () => {
        const { d } = disco({ ...PROGETTO })
        const letto = await fontiDaDisco(d).leggiSpazio()
        expect(letto.sorgenti.some((s) => s.percorso.includes('node_modules'))).toBe(false)
        // ⛔ E saltarle non tronca l'elenco: sono escluse per DECISIONE, non
        // per incapacita. Confonderle costerebbe ogni ASSENTE del progetto.
        expect(letto.elenco).toBe('completo')
    })
})

describe('⛔⛔ i tetti si DICHIARANO', () => {
    it('troppi file: elenco troncato, e si dice quanti', async () => {
        const { d } = disco({ 'a.ts': 'export const a = 1\n', 'b.ts': 'export const b = 2\n' })
        const letto = await fontiDaDisco(d, { tettoFile: 1 }).leggiSpazio()
        expect(letto.elenco).not.toBe('completo')
        expect(letto.elenco !== 'completo' && letto.elenco.troncato).toContain('1')
    })

    it('troppi byte: idem', async () => {
        const { d } = disco({ 'a.ts': 'x'.repeat(100), 'b.ts': 'y'.repeat(100) })
        const letto = await fontiDaDisco(d, { tettoByte: 150 }).leggiSpazio()
        expect(letto.elenco).not.toBe('completo')
    })

    it('⭐ e sotto il tetto non si dichiara niente', async () => {
        const { d } = disco({ 'a.ts': 'export const a = 1\n' })
        expect((await fontiDaDisco(d, { tettoFile: 10, tettoByte: 1000 }).leggiSpazio()).elenco).toBe('completo')
    })
})

describe('⛔⛔⛔ CARTELLA illeggibile e FILE illeggibile sono cose diverse', () => {
    it('una CARTELLA che non si legge tronca TUTTO', async () => {
        const { d } = disco({ ...PROGETTO }, { cartelle: ['src/interno'] })
        const letto = await fontiDaDisco(d).leggiSpazio()
        expect(letto.elenco).not.toBe('completo')
        expect(letto.elenco !== 'completo' && letto.elenco.troncato).toContain('src/interno')
        /*
         * ⛔ Saltarla in silenzio direbbe «qui non c'e niente» di un posto in
         * cui non si e guardato. Non si sa nemmeno QUANTI file contenga.
         */
    })

    it('⭐ ma un FILE che non si legge NON tronca: l ignoranza e circoscritta', async () => {
        const { d } = disco({ ...PROGETTO }, { file: ['src/interno/b.ts'] })
        const letto = await fontiDaDisco(d).leggiSpazio()
        expect(letto.elenco).toBe('completo')
        expect(letto.sorgenti.find((s) => s.percorso === 'src/interno/b.ts')!.testo).toBeNull()
        /*
         * ⭐ Qui si sa che il file esiste e quale sia: solo le domande sul suo
         * ambito diventano IGNOTE. Troncare tutto per un file sarebbe buttare
         * via la conoscenza che si ha.
         */
    })
})

describe('⛔⛔ si riscrive SOLO cio che e cambiato', () => {
    it('un albero identico non produce nessuna scrittura', async () => {
        const { d, scritture } = disco({ ...PROGETTO })
        const fonti = fontiDaDisco(d)
        const letto = await fonti.leggiSpazio()
        await fonti.scrivi(letto.sorgenti)
        expect(scritture).toHaveLength(0)
    })

    it('⭐ e una funzione cambiata produce UNA scrittura sola', async () => {
        const { d, scritture } = disco({ ...PROGETTO })
        const fonti = fontiDaDisco(d)
        const letto = await fonti.leggiSpazio()
        await fonti.scrivi(letto.sorgenti.map((s) => (
            s.percorso === 'src/a.ts' ? { ...s, testo: 'export const alfa = 99\n' } : s
        )))
        expect(scritture).toEqual([{ percorso: 'src/a.ts', testo: 'export const alfa = 99\n' }])
        // ⛔ Sul telefono ogni scrittura passa dal ponte nativo: 452 scritture
        // per una funzione sola e la differenza fra un attesa e un app rotta.
    })

    it('⛔ e la seconda volta che cambia si riscrive ancora', async () => {
        const { d, scritture } = disco({ ...PROGETTO })
        const fonti = fontiDaDisco(d)
        const letto = await fonti.leggiSpazio()
        const con = (t: string) => letto.sorgenti.map((s) => (s.percorso === 'src/a.ts' ? { ...s, testo: t } : s))
        await fonti.scrivi(con('export const alfa = 2\n'))
        await fonti.scrivi(con('export const alfa = 3\n'))
        expect(scritture.map((s) => s.testo)).toEqual(['export const alfa = 2\n', 'export const alfa = 3\n'])
        // ⛔ Il confronto e con l'ultima LETTURA: due modifiche diverse
        // arrivano entrambe sul disco, senza che la prima nasconda la seconda.
    })

    it('⛔ un file illeggibile non si riscrive col suo `null`', async () => {
        const { d, scritture } = disco({ ...PROGETTO }, { file: ['src/a.ts'] })
        const fonti = fontiDaDisco(d)
        await fonti.scrivi((await fonti.leggiSpazio()).sorgenti)
        expect(scritture).toHaveLength(0)
    })
})

describe('⛔⛔⛔ la scrittura non parla al posto del disco', () => {
    it('se il file cambia DA FUORI, la scrittura successiva arriva lo stesso', async () => {
        const contenuto = { 'src/a.ts': 'export const alfa = 1\n' }
        const { d, scritture } = disco(contenuto)
        const fonti = fontiDaDisco(d)
        const letto = await fonti.leggiSpazio()
        const nuovo = letto.sorgenti.map((s) => ({ ...s, testo: 'export const alfa = 2\n' }))

        await fonti.scrivi(nuovo)
        // qualcuno apre il file con un altro editor e lo cambia
        contenuto['src/a.ts'] = 'export const alfa = 999 // scritto da una persona\n'
        await fonti.scrivi(nuovo)

        expect(scritture).toHaveLength(2)
        expect(contenuto['src/a.ts']).toBe('export const alfa = 2\n')
        /*
         * ⛔ Se la memoria si aggiornasse a ogni scrittura, la seconda verrebbe
         * saltata: TALOS si crederebbe già a posto, lascerebbe intatta la
         * modifica della persona e direbbe «fatto». È l'errore piu insidioso di
         * tutti, perche il file sul disco è plausibile e nessuno lo controlla.
         */
    })
})
