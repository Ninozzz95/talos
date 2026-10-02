// @vitest-environment jsdom

/*
 * ⛔⛔ 70-B (30/09/2026 notte, owner «Riuso della chat» e «Sì, come la chat») — la scheda di un artefatto del Codice
 * apre la stessa finestra isolata della chat (`TalosArtifactBridge`) e salva nella Libreria con la stessa via
 * (`saveArtifactToLibrary`). L'HTML arriva dal server del Codice col segreto del 70-A.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ponte = vi.hoisted(() => ({
    create: vi.fn(async () => ({ id: 'nativo-1' })),
    open: vi.fn(async () => ({ opened: true })),
}))
vi.mock('@/lib/device/artifactPlugin', () => ({ TalosArtifactBridge: ponte }))

const segreto = vi.hoisted(() => ({
    intestazioniServerCodice: vi.fn(async (opzioni?: { rinnova?: boolean }) => ({ Authorization: `Bearer ${(opzioni?.rinnova ? '2' : '1').repeat(64)}` })),
}))
vi.mock('@/lib/harness/harnessUiSegreto', () => segreto)
vi.mock('@/lib/harness/harnessUiApiBase', () => ({ talosHarnessUiApiBase: () => 'http://localhost:4174' }))

const libreria = vi.hoisted(() => ({ saveArtifactToLibrary: vi.fn(async () => ({ ok: true, fileId: 'f1' })) }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => libreria }))

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
const busta = (html: string) => new Response(JSON.stringify({ ok: true, data: { html } }), { status: 200, headers: { 'Content-Type': 'application/json' } })

async function modulo() {
    vi.resetModules()
    return import('@/lib/harness/harnessUiArtefatti')
}

describe('ART70-TS — gli artefatti del Codice passano dalla finestra e dalla Libreria della chat', () => {
    beforeEach(() => {
        ponte.create.mockClear(); ponte.open.mockClear(); libreria.saveArtifactToLibrary.mockClear(); segreto.intestazioniServerCodice.mockClear()
        ponte.open.mockResolvedValue({ opened: true })
        vi.stubGlobal('fetch', vi.fn(async () => busta('<p>grafico</p>')))
    })
    afterEach(() => vi.unstubAllGlobals())

    it('ART70-TS-01 legge l’HTML dal server col segreto; un 401 rilegge il segreto una volta', async () => {
        const { leggiHtmlArtefattoCodice } = await modulo()
        vi.mocked(fetch)
            .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { code: 'AUTH_REQUIRED' } }), { status: 401 }))
            .mockResolvedValueOnce(busta('<p>grafico</p>'))
        expect(await leggiHtmlArtefattoCodice(ID)).toEqual({ ok: true, html: '<p>grafico</p>' })
        const chiamate = vi.mocked(fetch).mock.calls
        expect(chiamate[0][0]).toBe(`http://localhost:4174/api/v1/artifacts/${ID}`)
        expect(new Headers((chiamate[1][1] as RequestInit).headers).get('Authorization')).toBe(`Bearer ${'2'.repeat(64)}`)
    })

    it('ART70-TS-02 «Apri» fa UNA copia nativa per artefatto e apre la finestra isolata della chat', async () => {
        const { apriArtefattoCodice } = await modulo()
        expect(await apriArtefattoCodice(ID, 'Vendite')).toEqual({ ok: true })
        expect(await apriArtefattoCodice(ID, 'Vendite')).toEqual({ ok: true })
        expect(ponte.create).toHaveBeenCalledTimes(1)
        expect(ponte.create).toHaveBeenCalledWith({ title: 'Vendite', html: '<p>grafico</p>' })
        expect(ponte.open).toHaveBeenCalledWith({ id: 'nativo-1' })
        expect(ponte.open).toHaveBeenCalledTimes(2)
    })

    it('ART70-TS-03 la finestra non si apre: esito onesto, e al tocco dopo si rifà la copia', async () => {
        const { apriArtefattoCodice } = await modulo()
        ponte.open.mockRejectedValueOnce(new Error('TALOS_ARTIFACT_NOT_FOUND'))
        expect(await apriArtefattoCodice(ID, 'Vendite')).toEqual({ ok: false, motivo: 'OPEN_FAILED' })
        expect(await apriArtefattoCodice(ID, 'Vendite')).toEqual({ ok: true })
        expect(ponte.create).toHaveBeenCalledTimes(2)
    })

    it('ART70-TS-04 «Salva» usa la stessa copia e la via della chat verso la Libreria', async () => {
        const { apriArtefattoCodice, salvaArtefattoCodice } = await modulo()
        await apriArtefattoCodice(ID, 'Vendite')
        expect(await salvaArtefattoCodice(ID, 'Vendite')).toEqual({ ok: true })
        expect(ponte.create).toHaveBeenCalledTimes(1)
        expect(libreria.saveArtifactToLibrary).toHaveBeenCalledWith('nativo-1', 'Vendite')
        libreria.saveArtifactToLibrary.mockResolvedValueOnce({ ok: false, reason: 'TALOS_X' } as never)
        expect(await salvaArtefattoCodice(ID, 'Vendite')).toEqual({ ok: false, motivo: 'SAVE_FAILED' })
    })

    it('ART70-TS-05 un artefatto che il server non ha più: NOT_FOUND, nessuna copia, nessuna finestra', async () => {
        const { apriArtefattoCodice } = await modulo()
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND' } }), { status: 404 }))
        expect(await apriArtefattoCodice(ID, 'Vendite')).toEqual({ ok: false, motivo: 'NOT_FOUND' })
        expect(ponte.create).not.toHaveBeenCalled()
        expect(ponte.open).not.toHaveBeenCalled()
    })
})

/*
 * ⛔ OSS-70B-1 e OSS-70B-3 (30/09/2026 notte). Owner: «Codice · titolo della sessione» e «Riconoscere la stessa pagina».
 * Il salvataggio dal Codice porta la sessione e il modello; la scheda chiede se la pagina è già nella Libreria.
 */
describe('OSS70B-TS — il Codice dice da dove viene e riconosce la pagina già salvata', () => {
    beforeEach(() => {
        ponte.create.mockClear(); ponte.open.mockClear(); libreria.saveArtifactToLibrary.mockClear()
        ;(libreria as unknown as { libraryFileWithSameContent: ReturnType<typeof vi.fn> }).libraryFileWithSameContent = vi.fn(async () => null)
        // ⛔ E5 (01/10/2026): qui c'era un elenco finto delle sessioni con un campo `modello` che il server vero non manda.
        vi.stubGlobal('fetch', vi.fn(async () => busta('<p>grafico</p>')))
    })
    afterEach(() => vi.unstubAllGlobals())

    it('OSS70B-TS-01 salva con la sessione del Codice e il modello dell’evento dell’artefatto, senza chiedere altro al server', async () => {
        const { salvaArtefattoCodice } = await modulo()
        expect(await salvaArtefattoCodice(ID, 'Vendite', { modello: 'z-ai/glm-5.3-flash', sessione: { id: 'cod-1', titolo: 'mi disegni un grafico' } })).toEqual({ ok: true })
        expect(libreria.saveArtifactToLibrary).toHaveBeenCalledWith('nativo-1', 'Vendite', {
            codice: { sessionId: 'cod-1', title: 'mi disegni un grafico' }, model: 'z-ai/glm-5.3-flash',
        })
        expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).includes('/api/v1/artifacts/'))).toBe(true)
    })

    it('OSS70B-TS-02 lo stato dice «salvato» solo se nella Libreria c’è la stessa pagina', async () => {
        const { statoArtefattoCodice } = await modulo()
        const cerca = (libreria as unknown as { libraryFileWithSameContent: ReturnType<typeof vi.fn> }).libraryFileWithSameContent
        expect(await statoArtefattoCodice(ID)).toEqual({ salvato: false })
        cerca.mockResolvedValueOnce('file-1')
        expect(await statoArtefattoCodice(ID)).toEqual({ salvato: true })
        expect(cerca).toHaveBeenLastCalledWith('<p>grafico</p>')
    })
})
