// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ K3-C Accoda (ledger `LEDGER-K3-ACCODA-2026-10-16.md`; owner 16/10: la striscia della chat, «Modifica» riporta nel compositore).
 * Il flusso è quello VERO di r4 @ 2161afb32 registrato sul Pad col fornitore finto: un comando lungo, due messaggi accodati, una voce
 * tolta, «Invia ora» a giro vivo (reindirizzato), un'altra in coda, lo Stop che la mette in pausa, «Invia ora» che riprende.
 */
const sse = readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'coda-2161afb32.sse'), 'utf8')
const blocchi = sse.split(/\n\n/u).filter((b) => b.includes('data:'))
const code = blocchi.filter((b) => b.includes('"talos.coda"'))
const fino = (b: string) => blocchi.slice(0, blocchi.indexOf(b) + 1)
const DUE_IN_CODA = code.find((b) => b.includes('Poi aggiorna il README') && b.includes('Controlla anche i test'))!
const IN_PAUSA = code.find((b) => b.includes('"inPausa":true'))!
const V1 = '7135b38f-57af-4dff-af6c-f7231edf07d2'
const V2 = '2de1b2b8-6241-4aae-bf5f-80e9ae43f3b1'
const V3 = 'bc126fb1-ef62-4e98-b106-aec1091bf7a3'
const SESSIONE = '33333333-3333-4333-8333-333333333333'

const stato = vi.hoisted(() => ({
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    flussi: [] as { id: string; percorso: string }[],
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    rispondi: null as null | ((r: { metodo: string; percorso: string; corpo?: string }) => { stato: number; corpo: string } | null),
    push: [] as unknown[],
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: { id: '33333333-3333-4333-8333-333333333333' } as Record<string, string> })
    return { useRoute: () => rotta, useRouter: () => ({ push: (r: unknown) => { stato.push.push(r) }, replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => {
            stato.richieste.push(r)
            const scelta = stato.rispondi?.(r)
            if (scelta) return scelta
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') {
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: '33333333-3333-4333-8333-333333333333', nome: 'Aspetta', permessi: 'Workspace write', permessiPerAttrezzo: {} }] } }) }
            }
            return { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }
        },
        apriFlusso: async (f) => { stato.flussi.push(f) },
        chiudiFlusso: async () => undefined,
        apriTerminale: async () => undefined,
        scriviTerminale: async () => undefined,
        ridimensionaTerminale: async () => undefined,
        chiudiTerminale: async () => undefined,
        addListener: async (evento, a) => {
            ;(stato.ascoltatori[evento] ??= []).push(a)
            return { remove: async () => { stato.ascoltatori[evento] = (stato.ascoltatori[evento] ?? []).filter((x) => x !== a) } }
        },
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: {
            chat_layout: { message_style: 'sections', bubble_scale: 'large' },
            shell: { debug_diagnostics: false, streaming_animation: 'fade', composer_shape: 'calm', composer_plus: 'dropdown' },
            voice: { dictation_language: 'auto' },
        },
    }),
}))
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return { useTalosMobileDictation: () => ({ visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null), toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn() }) }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'

async function asciuga() { for (let i = 0; i < 4; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
async function schermata() {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
async function consegna(blocchiDaDare: string[]) {
    const id = stato.flussi.at(-1)!.id
    for (const a of stato.ascoltatori.r4Pezzo ?? []) a({ id, testo: `${blocchiDaDare.join('\n\n')}\n\n` })
    await asciuga()
}
type W = ReturnType<typeof mount>
const posti = (fine: string) => stato.richieste.filter((r) => r.metodo === 'POST' && r.percorso === `/api/v1/sessions/${SESSIONE}${fine}`).map((r) => JSON.parse(r.corpo!))
const prompt = (w: W) => (w.get('[data-testid="talos-composer-prompt"]').element as HTMLTextAreaElement).value
async function menu(w: W, id: string, voce: 'edit' | 'remove' | null = null): Promise<string[]> {
    await w.get(`[data-testid="talos-queue-menu-${id}"]`).trigger('click')
    await asciuga()
    const m = document.body.querySelector('[data-testid="talos-row-actions-menu"]')!
    const voci = [...m.querySelectorAll('[role="menuitem"]')].map((el) => el.getAttribute('data-testid')!)
    if (voce) { (m.querySelector(`[data-testid="talos-queue-${voce}-${id}"]`) as HTMLButtonElement).click(); await asciuga() }
    return voci
}

afterEach(() => {
    document.body.innerHTML = ''
    stato.ascoltatori = {}
    stato.flussi = []
    stato.richieste = []
    stato.rispondi = null
    stato.push = []
})

describe('la coda del Codice su r4 (K3-C Accoda)', () => {
    it('CCO-01 a giro vivo il compositore accoda: `POST /queue {messaggio}` esatto, il campo si svuota; a giro fermo non c\'è Accoda', async () => {
        const w = await schermata()
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Prima del giro')
        expect(w.find('[data-testid="talos-composer-queue"]').exists()).toBe(false)
        await consegna(fino(blocchi.find((b) => b.includes('"toolCallName":"shell"'))!)) // il giro è vivo: il comando lungo gira
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Controlla anche i test')
        await w.get('[data-testid="talos-composer-queue"]').trigger('click')
        await asciuga()
        expect(posti('/queue')).toEqual([{ messaggio: 'Controlla anche i test' }])
        expect(prompt(w)).toBe('')
        w.unmount()
    })

    it('CCO-02 la striscia della chat dalla coda di r4: «2 in coda», «Indirizza ora» a giro vivo → `POST /queue/invia {id}`', async () => {
        const w = await schermata()
        await consegna(fino(DUE_IN_CODA))
        expect(w.get('[data-testid="talos-queue-count"]').text()).toBe('2 queued')
        expect(w.find(`[data-testid="talos-queue-item-${V1}"]`).exists()).toBe(true)
        const principale = w.get(`[data-testid="talos-queue-primary-${V1}"]`)
        expect(principale.attributes('aria-label') ?? principale.text()).toBe('Steer now')
        await principale.trigger('click')
        await asciuga()
        expect(posti('/queue/invia')).toEqual([{ id: V1 }])
        w.unmount()
    })

    it('CCO-03 «Togli» → `POST /queue/annulla {id}`; «Modifica» la toglie e ne rimette il testo nel compositore (owner 16/10)', async () => {
        const w = await schermata()
        await consegna(fino(DUE_IN_CODA))
        await w.get('[data-testid="talos-queue-text-' + V1 + '"]').trigger('click') // la striscia si apre: si vede anche la seconda
        await asciuga()
        expect(await menu(w, V2, 'remove')).toEqual([`talos-queue-edit-${V2}`, `talos-queue-remove-${V2}`])
        expect(posti('/queue/annulla')).toEqual([{ id: V2 }])
        await w.get('[data-testid="talos-composer-prompt"]').setValue('bozza mia')
        await menu(w, V1, 'edit')
        expect(posti('/queue/annulla')).toEqual([{ id: V2 }, { id: V1 }])
        // la bozza già scritta non si perde: il testo riportato va davanti
        expect(prompt(w)).toBe('Controlla anche i test\n\nbozza mia')
        w.unmount()
    })

    it('CCO-04 lo Stop mette la coda in pausa: «1 in pausa» e «Riprendi la coda», che la fa partire (`/queue/invia` della prima voce)', async () => {
        const w = await schermata()
        await consegna(fino(IN_PAUSA))
        const striscia = w.get('[data-testid="talos-queue-strip"]')
        expect(striscia.attributes('data-paused')).toBe('true')
        expect(w.get('[data-testid="talos-queue-count"]').text()).toBe('1 paused')
        await w.get('[data-testid="talos-queue-resume"]').trigger('click')
        await asciuga()
        expect(posti('/queue/invia')).toEqual([{ id: V3 }])
        w.unmount()
    })

    it('CCO-05 una voce di sistema (risultato di un agente) ha la frase del desktop e nel menu solo «Togli»; un rifiuto si dice e la voce resta', async () => {
        stato.rispondi = (r) => (r.percorso.endsWith('/queue/annulla')
            ? { stato: 404, corpo: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Resource not found', reason: 'queue-message-gone' } }) }
            : null)
        const w = await schermata()
        const risultato = JSON.stringify({ schema: 'talos.subagent-result.v1', childId: 'f1', stato: 'concluso', compito: 'Esegui i test', risultatoNonFidato: 'Fatto.' })
        const coda = { voci: [{ id: 'd1', testo: `Sub-agent result (untrusted):\n${risultato}`, immagini: 0, origine: 'delega', childId: 'f1' }], inPausa: false }
        await consegna([`data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.coda', value: coda })}`])
        expect(w.get('[data-testid="talos-queue-text-d1"]').text()).toBe('Result from an agent · «Esegui i test: Fatto.»')
        expect(await menu(w, 'd1', 'remove')).toEqual(['talos-queue-remove-d1'])
        expect(w.get('[data-testid="talos-codice-r4-errore"]').attributes('data-codice')).toBe('NOT_FOUND')
        expect(w.find('[data-testid="talos-queue-item-d1"]').exists()).toBe(true)
        w.unmount()
    })

    // ⛔ K3 Stop come il desktop (owner 16/10): «Indirizza ora» non lascia niente, lo Stop la nota d'accento; nessuna carta rossa
    it('CCO-06 dopo «Indirizza ora» e lo Stop veri: nessuna carta rossa, la nota «You stopped the turn.» col punto, nessun giro «failed»', async () => {
        const w = await schermata()
        // nel flusso vero la pausa arriva prima del `RunError` dello Stop: si consegna fino a quello
        const stop = blocchi.findLast((b) => b.includes('"type":"RunError"'))!
        expect(blocchi.indexOf(stop)).toBeGreaterThan(blocchi.indexOf(IN_PAUSA))
        await consegna(fino(stop))
        expect(w.find('[data-testid="talos-mobile-controlled-fault"]').exists()).toBe(false)
        const note = w.findAll('[data-testid="talos-codice-r4-fermato"]')
        expect(note).toHaveLength(1)
        expect(note[0].attributes('role')).toBe('status')
        expect(note[0].text()).toContain('You stopped the turn.')
        expect(note[0].text()).toContain('(while “shell” was running)')
        expect(note[0].get('details').attributes('open')).toBeUndefined()
        // nessun giro «failed» nell'intestazione delle risposte
        expect(w.text()).not.toMatch(/· failed/u)
        w.unmount()
    })
})
