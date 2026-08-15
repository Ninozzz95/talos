import { describe, expect, it } from 'vitest'
import {
    filterLibraryFiles,
    isTalosLibraryFileShared,
    parseVaultOrigin,
    parseVaultOriginSession,
} from '@/lib/vaultLibrary'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * Owner 2026-07-26: tapping the chat header opens the media of THAT chat —
 * WhatsApp's "Media, links and docs", which no AI chat app has.
 *
 * "That chat's media" is deliberately the UNION of two things, because either
 * one alone lies to the user:
 *  - files whose ORIGIN is this chat (uploaded here, or generated here by the
 *    model — a generated file is never a message attachment, so an attachment
 *    query alone would hide every document TALOS itself produced);
 *  - files ATTACHED in this chat, which includes ones picked from the global
 *    Library and therefore carry another chat's origin.
 *
 * The origin lives in an untyped `metadata` bag and is read with an inline cast
 * at four call sites today. These parsers give it one home.
 */
function file(id: string, metadata: Record<string, unknown>, name = `${id}.txt`): TalosLocalVaultFile {
    return {
        id,
        display_name: name,
        media_type: 'text/plain',
        size_bytes: 10,
        private_uri: `file://${id}`,
        status: 'available',
        trust: 'untrusted',
        sha256: null,
        extracted_text: 'totale 2196 euro',
        failure_code: null,
        metadata,
        created_at: `2026-07-2${id.length}T10:00:00.000Z`,
        updated_at: '2026-07-26T10:00:00.000Z',
    } as TalosLocalVaultFile
}

const uploadedHere = file('a', { origin: 'uploaded', origin_session_id: 's1' })
const generatedHere = file('bb', { origin: 'generated', origin_session_id: 's1' })
const fromAnotherChat = file('ccc', { origin: 'uploaded', origin_session_id: 's2' })
const orphan = file('dddd', {})

const ALL = [uploadedHere, generatedHere, fromAnotherChat, orphan]

describe('per-chat library filter', () => {
    it('keeps only what belongs to the asked-for chat', () => {
        const ids = filterLibraryFiles(ALL, { query: '', origin: 'all', sessionId: 's1' }).map((f) => f.id)
        expect(ids.sort()).toEqual(['a', 'bb'])
    })

    it('includes files ATTACHED here even when they came from another chat', () => {
        // Picking a document out of the global Library and sending it in this
        // chat makes it this chat's media, whatever its origin says.
        const ids = filterLibraryFiles(ALL, {
            query: '', origin: 'all', sessionId: 's1', alsoFileIds: ['ccc'],
        }).map((f) => f.id)
        expect(ids.sort()).toEqual(['a', 'bb', 'ccc'])
    })

    it('does not smuggle a file in twice when it is both attached and native here', () => {
        const ids = filterLibraryFiles(ALL, {
            query: '', origin: 'all', sessionId: 's1', alsoFileIds: ['a'],
        }).map((f) => f.id)
        expect(ids).toHaveLength(2)
    })

    it('without a session id it is the global Library, exactly as before', () => {
        expect(filterLibraryFiles(ALL, { query: '', origin: 'all' })).toHaveLength(4)
        expect(filterLibraryFiles(ALL, { query: '', origin: 'generated' }).map((f) => f.id)).toEqual(['bb'])
    })

    it('still searches inside the documents, within the chat', () => {
        expect(filterLibraryFiles(ALL, { query: '2196', origin: 'all', sessionId: 's1' })).toHaveLength(2)
        expect(filterLibraryFiles(ALL, { query: 'nonesuch', origin: 'all', sessionId: 's1' })).toHaveLength(0)
    })

    it('newest first, so the gallery reads like the chat it belongs to', () => {
        const dates = filterLibraryFiles(ALL, { query: '', origin: 'all' }).map((f) => f.created_at)
        expect(dates).toEqual([...dates].sort().reverse())
    })
})

describe('metadata parsers', () => {
    it('reads the origin chat, and admits when there is not one', () => {
        expect(parseVaultOriginSession({ origin_session_id: 's1' })).toBe('s1')
        expect(parseVaultOriginSession({})).toBeNull()
        expect(parseVaultOriginSession(null)).toBeNull()
        // A non-string must not become a session id by accident.
        expect(parseVaultOriginSession({ origin_session_id: 42 })).toBeNull()
    })

    it('treats an unset per-file opt-out as SHARED, matching the injection filter', () => {
        // The gate is `!== false`, so absent means shared. A toggle that read
        // this as "off" would silently withdraw every legacy document from the
        // model the moment the UI shipped.
        expect(isTalosLibraryFileShared({})).toBe(true)
        expect(isTalosLibraryFileShared({ library_shared: true })).toBe(true)
        expect(isTalosLibraryFileShared({ library_shared: false })).toBe(false)
        expect(isTalosLibraryFileShared(undefined)).toBe(true)
    })

    it('fails closed on origin, as the injection path does', () => {
        expect(parseVaultOrigin({ origin: 'generated' })).toBe('generated')
        expect(parseVaultOrigin({ origin: 'nonsense' })).toBe('uploaded')
    })

    it('an attached file still obeys the origin filter it is asked for', () => {
        // `alsoFileIds` admits by id; it must not also smuggle a file past the
        // uploaded/generated filter the caller asked for.
        const ids = filterLibraryFiles(ALL, {
            query: '', origin: 'generated', sessionId: 's1', alsoFileIds: ['ccc'],
        }).map((f) => f.id)
        expect(ids).toEqual(['bb'])
    })
})
