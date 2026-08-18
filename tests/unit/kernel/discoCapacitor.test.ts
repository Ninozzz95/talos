import { describe, expect, it, vi } from 'vitest'
import { Directory, Encoding } from '@capacitor/filesystem'
import { discoCapacitor, type TalosPortaFilesystem } from '@/lib/kernel/discoCapacitor'

const porta = () => ({
    readdir: vi.fn(async () => ({ files: [
        { name: 'a.ts', type: 'file', size: 12 },
        { name: 'interno', type: 'directory' },
        { name: 'senzaTaglia.ts', type: 'file' },
    ] })),
    readFile: vi.fn(async () => ({ data: 'export const a = 1\n' })),
    writeFile: vi.fn(async () => ({})),
}) satisfies TalosPortaFilesystem

describe('il disco del telefono', () => {
    it('⭐ mette la radice davanti a ogni percorso', async () => {
        const p = porta()
        const d = discoCapacitor({ filesystem: p, radice: 'progetti/mio' })
        await d.elenca('src/interno')
        expect(p.readdir).toHaveBeenCalledWith({ path: 'progetti/mio/src/interno', directory: Directory.Data })
        await d.elenca('')
        expect(p.readdir).toHaveBeenLastCalledWith({ path: 'progetti/mio', directory: Directory.Data })
    })

    it('⛔ una taglia MANCANTE vale zero, non «enorme»', async () => {
        const voci = await discoCapacitor({ filesystem: porta(), radice: 'p' }).elenca('')
        expect(voci.find((v) => v.nome === 'senzaTaglia.ts')!.byte).toBe(0)
        /*
         * ⛔ Il contrario — trattarla come enorme — farebbe scattare il tetto e
         * troncherebbe un elenco che era leggibile per intero: si perderebbe
         * ogni ASSENTE del progetto per un campo mancante.
         */
    })

    it('⭐ distingue cartelle da file', async () => {
        const voci = await discoCapacitor({ filesystem: porta(), radice: 'p' }).elenca('')
        expect(voci.filter((v) => v.cartella).map((v) => v.nome)).toEqual(['interno'])
    })

    it('⭐ legge in UTF-8, e regge anche un Blob', async () => {
        const p = porta()
        expect(await discoCapacitor({ filesystem: p, radice: 'p' }).leggi('a.ts')).toBe('export const a = 1\n')
        expect(p.readFile).toHaveBeenCalledWith({ path: 'p/a.ts', directory: Directory.Data, encoding: Encoding.UTF8 })

        const conBlob = { ...p, readFile: vi.fn(async () => ({ data: new Blob(['ciao']) })) }
        expect(await discoCapacitor({ filesystem: conBlob, radice: 'p' }).leggi('a.ts')).toBe('ciao')
    })

    it('⛔ scrive creando le cartelle che mancano', async () => {
        const p = porta()
        await discoCapacitor({ filesystem: p, radice: 'p' }).scrivi('src/nuovo/x.ts', 'ciao')
        expect(p.writeFile).toHaveBeenCalledWith({
            path: 'p/src/nuovo/x.ts', directory: Directory.Data, data: 'ciao',
            encoding: Encoding.UTF8, recursive: true,
        })
    })

    it('⛔ e una radice con la barra finale non produce percorsi doppi', async () => {
        const p = porta()
        await discoCapacitor({ filesystem: p, radice: 'progetti/mio/' }).elenca('src')
        expect(p.readdir).toHaveBeenCalledWith({ path: 'progetti/mio/src', directory: Directory.Data })
    })
})
