// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * Mockup remoto approvato dall'owner il 23/10, tavola 3: le sessioni dei PC stanno nella lista del Codice, insieme a quelle del
 * dispositivo, con il filtro «Dove» (Tutte · Qui · un PC). Dal Computer si arriva già filtrati su quel PC (`?dove=<pcId>`). In
 * «Tutte» ogni sessione del PC porta il suo nome. Il filtro compare solo con un PC collegato. Il pulsante in basso apre la sessione
 * nuova sul PC scelto. Un PC che non risponde lo si dice (come Claude Code: «sessions on other machines may be missing»).
 */
const stato = vi.hoisted(() => ({
    routerPush: vi.fn(),
    routerReplace: vi.fn(),
    route: { name: 'harness' as string, params: {} as Record<string, string>, query: {} as Record<string, string> },
    pcs: [] as Array<{ pcId: string, nome: string | null, relay: string | null, accoppiatoAlle: number }>,
    righeDelPc: {} as Record<string, unknown[] | null>,
    cartelle: [] as Array<{ id: string, nome: string }>,
    rinomina: vi.fn(async (_pcId: string, _id: string, _nome: string) => {}),
    elimina: vi.fn(async (_pcId: string, _id: string) => {}),
    consenso: vi.fn(async (_pcId: string, _cartellaId: string, _o?: { inAttesa?: (a: unknown) => void }): Promise<unknown> => ({ esito: 'consentita', sessionId: null })),
}))
vi.mock('@/lib/harness/terminalePonte', async (originale) => ({
    ...(await originale<typeof import('@/lib/harness/terminalePonte')>()),
    talosR4Disponibile: async () => true,
    talosR4Pronto: async () => ({ disponibile: true, acceso: true, cartella: '/lavoro' }),
}))
stato.route = reactive(stato.route)
vi.mock('vue-router', () => ({
    useRoute: () => stato.route,
    useRouter: () => ({ push: stato.routerPush, replace: stato.routerReplace }),
}))
vi.mock('@/lib/harness/harnessUiSessionStatus', () => ({ fetchTalosHarnessSessionsStatus: vi.fn(async () => new Map()) }))
const NOW = new Date().toISOString()
const PRIMA = new Date(Date.now() - 60_000).toISOString()
const riga = (id: string, title: string, updated_at: string, s: Record<string, unknown> = {}, progetto?: string) => ({
    id, title, updated_at,
    stato: { conclusa: true, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: false, ultimoEsito: 'successo', ...s },
    ...(progetto ? { progetto } : {}),
})
vi.mock('@/lib/harness/r4/elencoSessioniR4', async (originale) => ({
    ...(await originale<typeof import('@/lib/harness/r4/elencoSessioniR4')>()),
    leggiSessioniR4: vi.fn(async () => [riga('qui-1', 'Sessione del dispositivo', PRIMA)]),
}))
vi.mock('@/lib/harness/r4/clienteR4', () => ({ talosClienteR4: () => ({ richiesta: vi.fn() }) }))
vi.mock('@/lib/remoto/computerRemoti', async (originale) => {
    const { ref } = await import('vue')
    const elenco = ref<typeof stato.pcs>([])
    const remoti = {
        elenco,
        aggiorna: vi.fn(async () => { elenco.value = stato.pcs }),
        riepilogo: vi.fn(async (pcId: string) => {
            const righe = stato.righeDelPc[pcId]
            return righe ? { inLinea: true, conteggi: { totale: righe.length, inCorso: 0, aspettaTe: 0 }, righe } : { inLinea: false, code: 'UNREACHABLE' }
        }),
        cartelle: vi.fn(async () => ({ ok: true, cartelle: stato.cartelle })),
        rinominaSessione: stato.rinomina,
        eliminaSessione: stato.elimina,
        chiediConsensoAlPc: stato.consenso,
    }
    return { ...(await originale<typeof import('@/lib/remoto/computerRemoti')>()), useComputerRemoti: () => remoti }
})

import HarnessScreen from '@/screens/HarnessScreen.vue'
import { doveDelCodice } from '@/lib/remoto/doveDelCodice'

const UFFICIO = { pcId: '31ab0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 1 }

beforeEach(() => {
    stato.routerPush.mockReset()
    stato.routerReplace.mockReset()
    stato.route = reactive({ name: 'harness', params: {}, query: {} })
    stato.pcs = []
    stato.righeDelPc = {}
    stato.cartelle = []
    doveDelCodice.value = null
    stato.rinomina.mockReset()
    stato.elimina.mockReset()
    stato.consenso.mockReset()
    document.body.innerHTML = ''
})

async function monta(props: Record<string, unknown> = {}) {
    const w = mount(HarnessScreen, { attachTo: document.body, props })
    await flushPromises()
    await flushPromises()
    return w
}
const righe = (w: Awaited<ReturnType<typeof monta>>) => w.findAll('[data-testid="talos-harness-row"]')

describe('Codice, tavola 3: il filtro «Dove»', () => {
    it('DOVE-01 senza PC collegati il filtro non c\'è e la lista è quella di sempre', async () => {
        const w = await monta()
        expect(w.find('[data-testid="talos-codice-dove"]').exists()).toBe(false)
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['qui-1'])
    })

    it('DOVE-02 con un PC: «Tutte» di partenza, le sessioni del PC insieme alle mie, e ognuna porta il nome del PC', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Correggi il report degli ordini', NOW, { conclusa: false }, 'TALOS-prova-remoto')]
        const w = await monta()
        expect(w.get('[data-testid="talos-codice-dove"]').text()).toContain('Where:All')
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['pc-1', 'qui-1'])
        expect(righe(w)[0]!.get('[data-testid="talos-harness-row-pc"]').text()).toContain('UFFICIO')
        expect(righe(w)[1]!.find('[data-testid="talos-harness-row-pc"]').exists()).toBe(false)
    })

    it('DOVE-03 arrivando dal Computer è già su quel PC: solo le sue sessioni, con stato e cartella', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Correggi il report', NOW, { conclusa: false }, 'TALOS-prova-remoto')]
        stato.route = reactive({ name: 'harness', params: {}, query: { dove: UFFICIO.pcId } })
        const w = await monta()
        expect(w.get('[data-testid="talos-codice-dove"]').text()).toContain('UFFICIO')
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['pc-1'])
        const meta = righe(w)[0]!.get('[data-testid="talos-harness-row-status"]').text()
        expect(meta).toContain('Running')
        expect(meta).toContain('TALOS-prova-remoto')
        // filtrati su UFFICIO, ripetere UFFICIO su ogni riga sarebbe rumore
        expect(righe(w)[0]!.find('[data-testid="talos-harness-row-pc"]').exists()).toBe(false)
    })

    it('DOVE-04 «Qui» lascia solo le sessioni del dispositivo, e la scelta resta nella rotta', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await w.get('[data-testid="talos-codice-dove-qui"]').trigger('click')
        await flushPromises()
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['qui-1'])
        expect(stato.routerReplace).toHaveBeenCalledWith({ name: 'harness', query: { dove: 'qui' } })
    })

    // revisione del blocco 3 (S3), owner 24/10 «Sì, uguali alle locali»: il ponte rinomina ed elimina (`session.rename`, `session.delete`)
    it('DOVE-05 una sessione del PC si apre nel Codice del PC, e ha il suo menu come le mie (id del menu col PC davanti)', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await righe(w)[0]!.trigger('click')
        expect(stato.routerPush).toHaveBeenCalledWith({ name: 'computer-codice', params: { pcId: UFFICIO.pcId, id: 'pc-1' } })
        expect(w.find(`[data-testid="talos-harness-actions-${UFFICIO.pcId}-pc-1"]`).exists()).toBe(true)
        expect(w.find('[data-testid="talos-harness-actions-qui-1"]').exists()).toBe(true)
    })

    async function azione(w: Awaited<ReturnType<typeof monta>>, voce: 'rename' | 'delete') {
        await w.get(`[data-testid="talos-harness-actions-${UFFICIO.pcId}-pc-1"]`).trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>(`[data-testid="talos-harness-action-${voce}"]`)!.click()
        await flushPromises()
    }

    it('DOVE-15 un PC «di prova» lo dice nella riga e nel filtro; ⛔ uno vero no', async () => {
        const { ricordaEffimero } = await import('@/lib/remoto/ricordiDelPc')
        localStorage.clear()
        const PROVA = { pcId: '2d3c0001', nome: 'PROVA', relay: null, accoppiatoAlle: 2 }
        ricordaEffimero(PROVA.pcId, true)
        stato.pcs = [UFFICIO, PROVA]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        stato.righeDelPc[PROVA.pcId] = [riga('pc-2', 'Della prova', NOW)]
        const w = await monta()
        const chip = (id: string) => righe(w).find((r) => r.attributes('data-harness-session-id') === id)!.get('[data-testid="talos-harness-row-pc"]').text()
        expect(chip('pc-2')).toContain('PROVA · test')
        expect(chip('pc-1')).not.toContain('test')
        localStorage.clear()
    })

    /* D-MOCK-9 (4177, 24/10, foto 173-185): «Nuova sessione su DESKTOP-BJ9I7OU · 27ba · di prova» andava su tre righe. Il pulsante e il
       titolo del dialogo nominano il PC col nome e, se serve, il codice breve; «di prova» resta su righe, filtro e schede. Due righe al
       massimo: il testo del pulsante si ferma a due righe e si tronca. */
    it('DOVE-17 il pulsante e il titolo della sessione nuova non dicono «di prova»; il pulsante non va oltre due righe', async () => {
        const { ricordaEffimero } = await import('@/lib/remoto/ricordiDelPc')
        localStorage.clear()
        const PROVA = { pcId: '27ba0001', nome: 'UFFICIO', relay: null, accoppiatoAlle: 2 }
        ricordaEffimero(PROVA.pcId, true)
        stato.pcs = [UFFICIO, PROVA]
        stato.righeDelPc[UFFICIO.pcId] = []
        stato.righeDelPc[PROVA.pcId] = [riga('pc-2', 'Della prova', NOW)]
        stato.route = reactive({ name: 'harness', params: {}, query: { dove: PROVA.pcId } })
        const w = await monta()
        // il filtro lo dice ancora
        expect(w.get('[data-testid="talos-codice-dove"]').text()).toContain('UFFICIO · 27ba · test')
        const nuova = w.get('[data-testid="talos-new-chat-fab"]')
        expect(nuova.text()).toBe('New session on UFFICIO · 27ba')
        expect(nuova.get('[data-testid="talos-new-chat-fab-label"]').classes()).toEqual(expect.arrayContaining(['line-clamp-2', 'min-w-0']))
        await nuova.trigger('click')
        await flushPromises()
        const titolo = document.body.querySelector('[role="dialog"] h2, [role="alertdialog"] h2')?.textContent ?? document.body.textContent ?? ''
        expect(titolo).toContain('New session on UFFICIO · 27ba')
        expect(titolo).not.toContain('test')
        w.unmount()
        // la colonna del tablet: lo stesso nome, e anche lì al più due righe
        const c = await monta({ embedded: true })
        const nuovaColonna = c.get('[data-testid="talos-harness-new"]')
        expect(nuovaColonna.text()).toBe('New session on UFFICIO · 27ba')
        expect(nuovaColonna.get('[data-testid="talos-harness-new-label"]').classes()).toEqual(expect.arrayContaining(['line-clamp-2', 'min-w-0']))
        localStorage.clear()
    })

    /* Pad 24/10/2026, foto 157 (vc181, colonna del tablet in verticale): «Da riprendere» andava a capo in due righe accanto alla
       cartella. L'etichetta era testo nudo nella riga flessibile e si restringeva; ora non si restringe e non va a capo, la cartella
       si tronca. */
    it('DOVE-16 l\'etichetta dello stato non va mai a capo; la cartella accanto si tronca', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW, { conclusa: false, interrotta: true }, 'una-cartella-dal-nome-molto-lungo')]
        stato.route = reactive({ name: 'harness', params: {}, query: { dove: UFFICIO.pcId } })
        const w = await monta()
        const etichetta = righe(w)[0]!.get('[data-testid="talos-harness-row-status-label"]')
        expect(etichetta.text()).not.toBe('')
        expect(etichetta.classes()).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']))
        const cartella = righe(w)[0]!.get('[data-testid="talos-harness-row-folder"]')
        expect(cartella.classes()).toEqual(expect.arrayContaining(['min-w-0', 'truncate']))
    })

    it('DOVE-12 «Rinomina» su una sessione del PC passa dal PC e rilegge le sue righe', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'rename')
        const campo = document.body.querySelector<HTMLInputElement>('[aria-label="Session name"]')!
        expect(campo.value).toBe('Del PC')
        stato.rinomina.mockImplementation(async () => { stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Nome nuovo', NOW)] })
        campo.value = 'Nome nuovo'
        campo.dispatchEvent(new Event('input'))
        campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        await flushPromises()
        expect(stato.rinomina).toHaveBeenCalledWith(UFFICIO.pcId, 'pc-1', 'Nome nuovo')
        expect(righe(w)[0]!.text()).toContain('Nome nuovo')
    })

    it('DOVE-13 «Elimina» su una sessione del PC chiede conferma, passa dal PC e la riga se ne va', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'delete')
        expect(stato.elimina).not.toHaveBeenCalled()
        stato.elimina.mockImplementation(async () => { stato.righeDelPc[UFFICIO.pcId] = [] })
        document.body.querySelector<HTMLElement>('[data-testid="talos-harness-delete-confirm"]')!.click()
        await flushPromises()
        expect(stato.elimina).toHaveBeenCalledWith(UFFICIO.pcId, 'pc-1')
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['qui-1'])
    })

    it("DOVE-14 ⛔ il PC rifiuta per il consenso della cartella: la frase è nella lingua dell'app, la riga resta", async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'delete')
        stato.elimina.mockRejectedValue(Object.assign(new Error('The computer must allow this device to write in this folder.'), { code: 'CONSENT_REQUIRED' }))
        document.body.querySelector<HTMLElement>('[data-testid="talos-harness-delete-confirm"]')!.click()
        await flushPromises()
        // D-MOCK-10: senza la cartella da chiedere resta un errore, e sta DENTRO il dialogo (prima stava dietro, sfocato)
        expect(dialogo()?.textContent).toContain("The computer hasn't allowed this device to write in this folder yet.")
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['pc-1', 'qui-1'])
    })

    /*
     * ⛔ D-MOCK-10 + D-MOCK-15 (4177, 24/10/2026, foto 173-199): l'errore di Rinomina/Elimina stava DIETRO il dialogo aperto e sfocato,
     * e sul PC l'attesa di 20-30 s era il solo pulsante spento. Ora: «On the computer…» nel dialogo, che resta aperto finché il PC
     * risponde, con «Cancel» sempre disponibile; l'errore dentro il dialogo. CONSENT_REQUIRED con la cartella fa eccezione (J1).
     */
    const dialogo = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
    const annullaNelDialogo = () => [...(dialogo()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes('Cancel'))
    /** Gli avvisi della lista, FUORI dal dialogo (il dialogo è portato nel body, quindi non è nel sottoalbero di `w`). */
    const avvisiDellaLista = (w: Awaited<ReturnType<typeof monta>>) => w.findAll('[role="alert"]').map((a) => a.text())

    it("DOVE-18 «Rinomina» sul PC: «On the computer…» nel dialogo durante l'attesa, «Cancel» acceso; l'errore DENTRO il dialogo", async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'rename')
        let rifiuta: (e: unknown) => void = () => {}
        stato.rinomina.mockImplementation(() => new Promise((_ok, no) => { rifiuta = no }))
        const campo = document.body.querySelector<HTMLInputElement>('[aria-label="Session name"]')!
        campo.value = 'Nome nuovo'
        campo.dispatchEvent(new Event('input'))
        campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        await flushPromises()
        expect(dialogo()?.querySelector('[data-testid="talos-harness-dialog-pc-working"]')?.textContent).toContain('On the computer…')
        expect(annullaNelDialogo()?.disabled).toBe(false)
        rifiuta(new Error('the disk is full'))
        await flushPromises()
        expect(dialogo()).not.toBeNull()
        expect(dialogo()!.querySelector('[data-testid="talos-harness-dialog-error"]')?.textContent).toContain("Couldn't rename the session: the disk is full")
        expect(dialogo()!.querySelector('[data-testid="talos-harness-dialog-pc-working"]')).toBeNull()
        expect(avvisiDellaLista(w).join(' ')).not.toContain('the disk is full')
    })

    it('DOVE-19 «Elimina» sul PC: «On the computer…» e «Cancel» acceso; «Cancel» chiude, e quando il PC risponde la lista si rilegge', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'delete')
        let fatto: () => void = () => {}
        stato.elimina.mockImplementation(() => new Promise<void>((ok) => { fatto = () => { stato.righeDelPc[UFFICIO.pcId] = []; ok() } }))
        document.body.querySelector<HTMLElement>('[data-testid="talos-harness-delete-confirm"]')!.click()
        await flushPromises()
        expect(dialogo()?.querySelector('[data-testid="talos-harness-dialog-pc-working"]')?.textContent).toContain('On the computer…')
        expect(annullaNelDialogo()?.disabled).toBe(false)
        annullaNelDialogo()!.click()
        await flushPromises()
        expect(dialogo()).toBeNull()
        fatto()
        await flushPromises()
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['qui-1'])
        expect(avvisiDellaLista(w)).toEqual([])
    })

    it("DOVE-20 «Elimina» sul PC che fallisce: l'errore DENTRO il dialogo; ⛔ dopo «Cancel» un rifiuto tardivo non apre niente", async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'delete')
        stato.elimina.mockRejectedValueOnce(new Error('the PC is busy'))
        document.body.querySelector<HTMLElement>('[data-testid="talos-harness-delete-confirm"]')!.click()
        await flushPromises()
        expect(dialogo()?.querySelector('[data-testid="talos-harness-dialog-error"]')?.textContent).toContain("Couldn't delete the session: the PC is busy")
        expect(avvisiDellaLista(w).join(' ')).not.toContain('the PC is busy')
        // «Cancel» chiude il dialogo e il suo errore
        annullaNelDialogo()!.click()
        await flushPromises()
        expect(dialogo()).toBeNull()
        // di nuovo, e «Cancel» durante l'attesa: il rifiuto che arriva dopo (anche quello del consenso) non apre niente
        await azione(w, 'delete')
        let rifiuta: (e: unknown) => void = () => {}
        stato.elimina.mockImplementation(() => new Promise((_ok, no) => { rifiuta = no }))
        document.body.querySelector<HTMLElement>('[data-testid="talos-harness-delete-confirm"]')!.click()
        await flushPromises()
        annullaNelDialogo()!.click()
        await flushPromises()
        rifiuta(serveIlConsenso())
        await flushPromises()
        expect(dialogo()).toBeNull()
        expect(w.find('[data-testid="talos-harness-consenso"]').exists()).toBe(false)
        expect(avvisiDellaLista(w)).toEqual([])
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['pc-1', 'qui-1'])
    })

    /** D-MOCK-11: il rifiuto vero del PC, nella forma che risale dal ponte (`RifiutoSessioneR4` coi `params` della cartella). */
    const serveIlConsenso = () => Object.assign(new Error('The computer must allow this device to write in this folder.'),
        { code: 'CONSENT_REQUIRED', reason: 'consent-required', params: { cartellaId: 'c-1', nome: 'talos' } })

    it('CONS-DISP-07 D-MOCK-11: «Elimina» senza consenso offre «Chiedi al PC»; «Conferma sul computer» durante l\'attesa, poi l\'azione si rifà', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'delete')
        stato.elimina.mockRejectedValueOnce(serveIlConsenso())
        document.body.querySelector<HTMLElement>('[data-testid="talos-harness-delete-confirm"]')!.click()
        await flushPromises()
        const blocco = w.find('[data-testid="talos-harness-consenso"]')
        expect(blocco.text()).toContain('The PC must allow this device to write here')
        let consenti: (v: unknown) => void = () => {}
        stato.consenso.mockImplementation(async (_pc, _c, o) => { o?.inAttesa?.({ richiestaId: 'rq-12345678', scadeAlle: Date.now() + 120_000 }); return new Promise((ok) => { consenti = ok }) })
        stato.elimina.mockImplementation(async () => { stato.righeDelPc[UFFICIO.pcId] = [] })
        await w.find('[data-testid="talos-harness-consenso-chiedi"]').trigger('click')
        await flushPromises()
        expect(stato.consenso).toHaveBeenCalledWith(UFFICIO.pcId, 'c-1', expect.anything())
        expect(w.find('[data-testid="talos-harness-consenso"]').text()).toContain('Confirm on the computer')
        consenti({ esito: 'consentita', sessionId: null })
        await flushPromises()
        expect(stato.elimina).toHaveBeenCalledTimes(2)
        expect(w.find('[data-testid="talos-harness-consenso"]').exists()).toBe(false)
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['qui-1'])
    })

    it('CONS-DISP-07b «Rinomina» senza consenso: il PC dice di no ⇒ lo si dice; il nome non cambia e non si rimanda niente', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'rename')
        const campo = document.body.querySelector<HTMLInputElement>('[aria-label="Session name"]')!
        stato.rinomina.mockRejectedValueOnce(serveIlConsenso())
        campo.value = 'Nome nuovo'
        campo.dispatchEvent(new Event('input'))
        campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        await flushPromises()
        stato.consenso.mockResolvedValue({ esito: 'negata' })
        await w.find('[data-testid="talos-harness-consenso-chiedi"]').trigger('click')
        await flushPromises()
        expect(w.find('[data-testid="talos-harness-consenso"]').text()).toContain('The PC said no for this folder')
        expect(stato.rinomina).toHaveBeenCalledTimes(1)
        // «Il PC non ha risposto» ⇒ «Riprova» richiede per la stessa cartella, poi rinomina col nome scritto
        stato.consenso.mockResolvedValue({ esito: 'scaduta' })
        await w.find('[data-testid="talos-harness-consenso-chiedi"]').trigger('click')
        await flushPromises()
        expect(w.find('[data-testid="talos-harness-consenso"]').text()).toContain('The PC didn’t answer')
        stato.consenso.mockResolvedValue({ esito: 'consentita', sessionId: null })
        await w.find('[data-testid="talos-harness-consenso-chiedi"]').trigger('click')
        await flushPromises()
        expect(stato.rinomina).toHaveBeenLastCalledWith(UFFICIO.pcId, 'pc-1', 'Nome nuovo')
    })

    /* D-MOCK-14 (4177, 24/10/2026, foto 192-199): «Elimina sessione» su una riga del PC diceva «verrà eliminata dal dispositivo». */
    it('DOVE-21 «Elimina» su una riga del PC dice «dal computer <nome · codice>»; ⛔ su una riga del dispositivo resta «dal dispositivo»', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        const w = await monta()
        await azione(w, 'delete')
        const testo = document.body.querySelector('[role="dialog"]')?.textContent ?? ''
        expect(testo).toContain('"Del PC" will be removed from the computer UFFICIO · 31ab. This cannot be undone.')
        expect(testo).not.toContain('from this device')
        ;[...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent?.includes('Cancel'))!.click()
        await flushPromises()
        await w.get('[data-testid="talos-harness-actions-qui-1"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-harness-action-delete"]')!.click()
        await flushPromises()
        expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('"Sessione del dispositivo" will be removed from this device.')
    })

    it('DOVE-06 un PC che non risponde lo si dice; le mie sessioni restano', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = null
        const w = await monta()
        expect(w.get('[data-testid="talos-codice-dove-assenti"]').text()).toContain('UFFICIO is not answering: its sessions are not listed.')
        expect(w.get('[data-testid="talos-codice-dove-assenti"]').text()).toContain('UFFICIO')
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['qui-1'])
    })

    it('DOVE-07 filtrati su un PC, il pulsante in basso apre la sessione nuova SU quel PC, nella cartella scelta', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW, {}, 'Altra')]
        stato.cartelle = [{ id: 'r4-remoto', nome: 'r4 remoto' }, { id: 'altra', nome: 'Altra' }]
        stato.route = reactive({ name: 'harness', params: {}, query: { dove: UFFICIO.pcId } })
        const w = await monta()
        const nuova = w.get('[data-testid="talos-new-chat-fab"]')
        expect(nuova.text()).toContain('New session on UFFICIO')
        await nuova.trigger('click')
        await flushPromises()
        // la cartella della sessione più recente del PC è già scelta (R-M4 Q2), come nel dettaglio del computer di prima
        const scelta = document.body.querySelector('[data-testid="talos-computer-folder"][aria-checked="true"]')
        expect(scelta?.textContent).toContain('Altra')
        document.body.querySelector<HTMLElement>('[data-testid="talos-computer-open-session"]')!.click()
        expect(stato.routerPush).toHaveBeenCalledWith({ name: 'computer-codice', params: { pcId: UFFICIO.pcId }, query: { cartella: 'altra' } })
    })

    it('DOVE-08 su «Qui» e su «Tutte» il pulsante in basso resta la sessione nuova sul dispositivo', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = []
        const w = await monta()
        const nuova = w.get('[data-testid="talos-new-chat-fab"]')
        expect(nuova.text()).not.toContain('New session on')
        await nuova.trigger('click')
        expect(stato.routerPush).toHaveBeenCalledWith({ name: 'codice-r4' })
    })

    /*
     * ⛔ D-MOCK-1 (dal Pad, vc175, 24/10): sul tablet «Apri le sessioni nel Codice» apriva la colonna su «Tutte». La rotta `harness`
     * del tablet riapre l'ultima sessione (TAB-INDIETRO-01) e perde `?dove=`; la colonna la guardava solo lì.
     */
    it('DOVE-09 la scelta «Dove» sopravvive al cambio di rotta del tablet (colonna e pagina la condividono)', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', 'Del PC', NOW)]
        stato.route = reactive({ name: 'harness', params: {}, query: { dove: UFFICIO.pcId } })
        const w = await monta({ embedded: true })
        expect(w.get('[data-testid="talos-codice-dove"]').text()).toContain('UFFICIO')
        // il tablet riapre l'ultima sessione: la rotta cambia e `?dove=` sparisce
        stato.route.name = 'codice-r4'
        stato.route.params = { id: 'qui-1' }
        stato.route.query = {}
        await flushPromises()
        expect(w.get('[data-testid="talos-codice-dove"]').text()).toContain('UFFICIO')
        expect(righe(w).map((r) => r.attributes('data-harness-session-id'))).toEqual(['pc-1'])
    })

    /* ⛔ D-MOCK-3 (dal Pad, vc175): sette PC che non rispondono erano sette righe, mezza colonna. Con più di uno, una riga sola. */
    it('DOVE-10 più PC che non rispondono stanno in una riga sola, col loro numero', async () => {
        stato.pcs = [UFFICIO, { pcId: '77cd0001', nome: 'PORTATILE', relay: null, accoppiatoAlle: 2 }]
        const w = await monta()
        const avviso = w.get('[data-testid="talos-codice-dove-assenti"]')
        expect(avviso.findAll('p')).toHaveLength(1)
        expect(avviso.text()).toContain('2 computers are not answering')
    })

    /* ⛔ D-MOCK-5 (dal Pad, vc176, 24/10): le sessioni del PC senza nome erano righe con la sola data. Il vecchio dettaglio del computer
       diceva «Sessione senza titolo» (`computer.untitledSession`): la lista del Codice lo dice anche lei. */
    it('DOVE-11 una sessione del PC senza nome si legge «Sessione senza titolo»', async () => {
        stato.pcs = [UFFICIO]
        stato.righeDelPc[UFFICIO.pcId] = [riga('pc-1', '', NOW)]
        stato.route = reactive({ name: 'harness', params: {}, query: { dove: UFFICIO.pcId } })
        const w = await monta()
        expect(righe(w)[0]!.text()).toContain('Untitled session')
    })
})
