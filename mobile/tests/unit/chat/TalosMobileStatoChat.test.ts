// @vitest-environment jsdom

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTalosI18n } from '@/i18n'
import TalosMobileStatoChat, { talosStatoDellaChat, type TalosFontiStatoChat } from '@/components/chat/TalosMobileStatoChat.vue'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import type { TalosStatoChat } from '@/lib/chat/statoChat'

/**
 * ⭐ B3 / F4-B — l'etichetta di stato di una chat nell'elenco.
 *
 * Parole brevi in minuscolo come il desktop (`session-item.js:44-63`); «conclusa»
 * e «vuota» NON parlano: il silenzio è lo stato normale (come `HarnessScreen.vue`,
 * che lascia l'ora quando non c'è niente di eccezionale da dire).
 *
 * ⛔ Le chiavi `chats.status.*` le aggiunge ai file di lingua chi li possiede in
 * questo giro: qui si FONDONO nel plugin vero, senza scrivere nei cataloghi.
 */
const IT = { waiting: 'aspetta te', running: 'in corso', queued: 'in coda', paused: 'in pausa', failed: 'fallita', interrupted: 'interrotta', rowLabel: '{title}, {status}' }
const EN = { waiting: 'waiting for you', running: 'in progress', queued: 'queued', paused: 'paused', failed: 'failed', interrupted: 'interrupted', rowLabel: '{title}, {status}' }
type Composer = { mergeLocaleMessage(locale: string, messages: object): void, locale: { value: string } }
let lingua = 'en'
beforeAll(async () => {
    const global = (await createTalosI18n()).global as unknown as Composer
    global.mergeLocaleMessage('en', { chats: { status: EN } })
    global.mergeLocaleMessage('it', { chats: { status: IT } })
    lingua = global.locale.value
    global.locale.value = 'it'
})
afterAll(async () => {
    ((await createTalosI18n()).global as unknown as Composer).locale.value = lingua
})

function monta(stato: TalosStatoChat, forma?: 'riga' | 'pastiglia') {
    return mount(TalosMobileStatoChat, { props: { stato, ...(forma ? { forma } : {}) } })
}

describe('TalosMobileStatoChat — l\'etichetta', () => {
    it.each([
        ['aspetta-te', 'aspetta te', 'attenzione'],
        ['in-corso', 'in corso', 'vivo'],
        ['in-coda', 'in coda', 'quieto'],
        ['in-pausa', 'in pausa', 'quieto'],
        ['fallita', 'fallita', 'pericolo'],
        ['interrotta', 'interrotta', 'quieto'],
    ] as const)('STATO-UI-01 «%s» si scrive «%s» con tono %s, parola e non solo colore', (stato, parola, tono) => {
        const wrapper = monta(stato)
        const etichetta = wrapper.get('[data-testid="talos-chat-status"]')
        expect(etichetta.text()).toBe(parola)
        expect(etichetta.attributes('data-stato')).toBe(stato)
        expect(etichetta.attributes('data-tone')).toBe(tono)
        // L'icona è decorazione: la parola la porta già.
        expect(etichetta.find('svg').attributes('aria-hidden')).toBe('true')
    })

    it.each(['conclusa', 'vuota'] as const)('STATO-UI-02 «%s» non mostra niente: il silenzio è normale', (stato) => {
        const wrapper = monta(stato)
        expect(wrapper.find('[data-testid="talos-chat-status"]').exists()).toBe(false)
        expect(wrapper.text()).toBe('')
    })

    it('STATO-UI-03 il tono d\'attenzione usa i token esistenti, niente colori fuori palette', () => {
        expect(monta('aspetta-te').get('[data-testid="talos-chat-status"]').classes().join(' ')).toContain('var(--talos-warning)')
        expect(monta('fallita').get('[data-testid="talos-chat-status"]').classes().join(' ')).toContain('var(--talos-danger')
        for (const quieto of ['in-coda', 'interrotta', 'in-corso'] as const) {
            const classi = monta(quieto).get('[data-testid="talos-chat-status"]').classes().join(' ')
            expect(classi).toContain('var(--talos-muted)')
            expect(classi).not.toMatch(/#[0-9a-f]{3,6}\b(?!\))/i)
        }
    })

    it('STATO-UI-04 la pastiglia (barra laterale) ha il bordo e lo sfondo del suo tono', () => {
        const classi = monta('aspetta-te', 'pastiglia').get('[data-testid="talos-chat-status"]').classes().join(' ')
        expect(classi).toContain('border-[var(--talos-warning-border)]')
        expect(classi).toContain('bg-[var(--talos-warning-soft)]')
        expect(monta('fallita', 'pastiglia').get('[data-testid="talos-chat-status"]').classes().join(' '))
            .toContain('bg-[var(--talos-danger-soft)]')
    })

    it('STATO-UI-06 CODA-PAUSA «in pausa» ha la sua parola nei cataloghi veri e l\'icona della pausa', async () => {
        const { TALOS_IT_MESSAGES } = await import('@/i18n/locales/it')
        const { TALOS_EN_MESSAGES } = await import('@/i18n/locales/en')
        expect(TALOS_IT_MESSAGES.chats.status.paused).toBe('in pausa')
        expect(TALOS_EN_MESSAGES.chats.status.paused).toBe('paused')
        expect(monta('in-pausa').get('[data-testid="talos-chat-status"] svg').classes().join(' ')).toContain('lucide-pause')
    })

    it('STATO-UI-05 «in corso» gira solo se il sistema non chiede meno movimento', () => {
        const icona = monta('in-corso').get('[data-testid="talos-chat-status"] svg')
        expect(icona.classes()).toContain('motion-safe:animate-spin')
        expect(icona.classes()).not.toContain('animate-spin')
    })
})

function sessione(id: string, last_message: TalosLocalChatSession['last_message'] = null): TalosLocalChatSession {
    return {
        id, title: id, surface: 'chat', mode: 'verified_execution', persistence_mode: 'persistent',
        active_model_profile_id: null, metadata: {}, created_at: '2026-09-24T10:00:00.000Z',
        updated_at: '2026-09-24T10:00:00.000Z', has_messages: last_message !== null, last_message,
    }
}

function fonti(parti: {
    sending?: boolean
    sendingSessionId?: string | null
    queues?: Record<string, { voci: readonly unknown[], inPausa?: boolean }>
    attiva?: string | null
    messaggi?: Array<{ role: 'user' | 'assistant' | 'system' | 'tool', state: 'persisted' | 'pending' | 'failed', metadata: Record<string, unknown> }>
    permessi?: string[]
    recuperi?: string[]
} = {}): TalosFontiStatoChat {
    return {
        chat: {
            state: { sending: parti.sending ?? false, sendingSessionId: parti.sendingSessionId ?? null, queues: parti.queues ?? {} },
            activeSession: { value: parti.attiva ? { id: parti.attiva } : null },
            messages: parti.messaggi ?? [],
        },
        pendingToolAuthorizations: { value: (parti.permessi ?? []).map((session_id) => ({ session_id })) },
        toolAuthorizationRecoveries: { value: (parti.recuperi ?? []).map((session_id) => ({ session_id })) },
    }
}

const RISPOSTA = { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: null } as const

describe('talosStatoDellaChat — dai fatti del controller', () => {
    it('STATO-FONTI-01 «in corso» solo per la chat che sta rispondendo, non per le altre', () => {
        const f = fonti({ sending: true, sendingSessionId: 'a' })
        expect(talosStatoDellaChat(f, sessione('a', RISPOSTA))).toBe('in-corso')
        expect(talosStatoDellaChat(f, sessione('b', RISPOSTA))).toBe('conclusa')
        // Un id rimasto senza invio vivo non è un giro in corso.
        expect(talosStatoDellaChat(fonti({ sending: false, sendingSessionId: 'a' }), sessione('a', RISPOSTA))).toBe('conclusa')
    })

    it('STATO-FONTI-02 «in coda» dalle voci della coda di QUELLA chat', () => {
        const f = fonti({ queues: { b: { voci: [{}, {}] }, c: { voci: [] } } })
        expect(talosStatoDellaChat(f, sessione('b', RISPOSTA))).toBe('in-coda')
        expect(talosStatoDellaChat(f, sessione('c', RISPOSTA))).toBe('conclusa')
    })

    it('STATO-FONTI-09 CODA-PAUSA una coda in pausa dallo Stop dice «in pausa», come la chat', () => {
        const f = fonti({ queues: { b: { voci: [{}], inPausa: true }, c: { voci: [{}], inPausa: false } } })
        expect(talosStatoDellaChat(f, sessione('b', RISPOSTA))).toBe('in-pausa')
        expect(talosStatoDellaChat(f, sessione('c', RISPOSTA))).toBe('in-coda')
    })

    it('STATO-FONTI-03 «aspetta te» da un permesso in attesa O da un recupero da decidere', () => {
        expect(talosStatoDellaChat(fonti({ permessi: ['a'], sending: true, sendingSessionId: 'a' }), sessione('a', RISPOSTA))).toBe('aspetta-te')
        expect(talosStatoDellaChat(fonti({ recuperi: ['a'] }), sessione('a', RISPOSTA))).toBe('aspetta-te')
        expect(talosStatoDellaChat(fonti({ permessi: ['x'] }), sessione('a', RISPOSTA))).toBe('conclusa')
    })

    it('STATO-FONTI-04 dal disco: fallita, interrotta, utente senza risposta, vuota', () => {
        const f = fonti()
        expect(talosStatoDellaChat(f, sessione('a', { role: 'system', state: 'failed', interrupted: false, model_profile_id: null }))).toBe('fallita')
        expect(talosStatoDellaChat(f, sessione('a', { ...RISPOSTA, interrupted: true }))).toBe('interrotta')
        expect(talosStatoDellaChat(f, sessione('a', { role: 'user', state: 'persisted', interrupted: false, model_profile_id: null }))).toBe('interrotta')
        expect(talosStatoDellaChat(f, sessione('a', null))).toBe('vuota')
    })

    it('STATO-FONTI-05 per la chat APERTA vince la memoria: l\'elenco non si rilegge a ogni messaggio', () => {
        // Sul disco (letto all'apertura) la chat era interrotta; poi hai riscritto e ha risposto.
        const f = fonti({ attiva: 'a', messaggi: [
            { role: 'user', state: 'persisted', metadata: {} },
            { role: 'assistant', state: 'persisted', metadata: {} },
        ] })
        expect(talosStatoDellaChat(f, sessione('a', { ...RISPOSTA, interrupted: true }))).toBe('conclusa')
        // …e al contrario un errore appena arrivato si vede subito.
        const g = fonti({ attiva: 'a', messaggi: [{ role: 'system', state: 'failed', metadata: {} }] })
        expect(talosStatoDellaChat(g, sessione('a', RISPOSTA))).toBe('fallita')
        const h = fonti({ attiva: 'a', messaggi: [{ role: 'assistant', state: 'persisted', metadata: { interrupted: true } }] })
        expect(talosStatoDellaChat(h, sessione('a', RISPOSTA))).toBe('interrotta')
    })

    it('STATO-FONTI-06 chat aperta ma messaggi non ancora caricati: si tiene il disco, non «vuota»', () => {
        const f = fonti({ attiva: 'a', messaggi: [] })
        expect(talosStatoDellaChat(f, sessione('a', { role: 'system', state: 'failed', interrupted: false, model_profile_id: null }))).toBe('fallita')
    })

    it('STATO-FONTI-08 una fonte mancante non fa cadere l\'elenco: lo stato dice meno, non rompe', () => {
        const parziale = { chat: { state: { sending: false, sendingSessionId: null } } } as unknown as TalosFontiStatoChat
        expect(() => talosStatoDellaChat(parziale, sessione('a', RISPOSTA))).not.toThrow()
        expect(talosStatoDellaChat(parziale, sessione('a', { ...RISPOSTA, interrupted: true }))).toBe('interrotta')
    })

    it('STATO-FONTI-07 un elenco senza last_message (non chiesto) non inventa niente', () => {
        const senza = { ...sessione('a'), last_message: undefined }
        expect(talosStatoDellaChat(fonti(), senza)).toBe('vuota')
    })
})
