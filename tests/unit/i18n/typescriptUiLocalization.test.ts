import { describe, expect, it, vi } from 'vitest'
import { useTalosMobileAttachments } from '@/composables/useTalosMobileAttachments'
import { createTalosMobileComposerDraftController } from '@/composables/useTalosMobileComposerDraft'
import { createSessionActionRunner } from '@/lib/sessionActionRunner'
import { createChatStore } from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { setupAppLockPin } from '@/services/appLock'
import { setProviderKey } from '@/services/secureKeyStore'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import { talosTestT } from '../../helpers/talosTestI18n'

const itT = talosTestT('it')

describe('TypeScript-emitted UI localization', () => {
    it('I18N-TS-01 resolves attachment and draft failures through Italian', async () => {
        const attachments = useTalosMobileAttachments({
            picker: {
                pickFiles: vi.fn().mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({
                    name: `f-${index}.txt`,
                    declaredMediaType: 'text/plain',
                    sizeBytes: 1,
                    source: { kind: 'web-blob', blob: new Blob(['x']) },
                }))),
            },
            vault: {} as never,
            translate: itT,
        } as never)

        await attachments.selectFiles()
        expect(attachments.error.value).toBe('Allega al massimo 6 file a un messaggio.')

        const draft = createTalosMobileComposerDraftController({
            load: vi.fn().mockResolvedValue(''),
            save: vi.fn().mockRejectedValue(new Error('disk full')),
            debounceMs: 60_000,
            maxWaitMs: 60_000,
            translate: itT,
        } as never)
        await draft.activateScope('chat-1')
        draft.updatePrompt('bozza')
        await draft.flush()

        expect(draft.error.value).toBe(
            'TALOS non ha potuto salvare questa bozza. Il testo resta nel compositore. disk full',
        )
    })

    it('I18N-TS-02 resolves chat storage and session-action failures through Italian', async () => {
        const repository = {
            ...createMemoryChatRepository(),
            initialize: vi.fn().mockRejectedValue(new Error('database offline')),
        }
        const chat = createChatStore(
            vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }),
            { repository, translate: itT } as never,
        )

        await chat.initialize()
        expect(chat.state.persistenceError).toBe(
            'L’archivio locale delle chat non è disponibile. database offline',
        )

        const push = vi.fn()
        const runner = createSessionActionRunner({ push }, itT)
        await runner.run('Apri chat', async () => { throw new Error('database offline') })
        expect(push).toHaveBeenCalledWith({
            message: 'Errore durante Apri chat: database offline',
            durationMs: 6000,
        })
    })

    it('I18N-TS-05 keeps validation codes stable below localized PIN and key UI', async () => {
        const backend = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(true),
        }

        const pinFailure = await setupAppLockPin('1234', backend)
            .then(() => null, (error: unknown) => error)
        expect(pinFailure).toMatchObject({ message: 'TALOS_APP_LOCK_PIN_TOO_SHORT' })
        expect(talosTranslatableErrorMessage(pinFailure, itT))
            .toBe('Il PIN deve contenere almeno 6 cifre.')

        const keyFailure = await setProviderKey('anthropic', ' ', backend)
            .then(() => null, (error: unknown) => error)
        expect(keyFailure).toMatchObject({ message: 'TALOS_PROVIDER_KEY_REQUIRED' })
        expect(talosTranslatableErrorMessage(keyFailure, itT))
            .toBe('Aggiungi la chiave API anthropic prima di continuare.')
    })
})
