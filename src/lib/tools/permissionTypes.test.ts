import { describe, expect, it } from 'vitest'

import {
    TALOS_DEFAULT_TOOL_PERMISSIONS,
    parseTalosChosenToolActions,
    talosEffectiveToolPermissions,
    type TalosToolPermissions,
} from '@/lib/tools/permissionTypes'

/**
 * The rule that keeps a default from freezing into a decision.
 *
 * Every test here stands for a way the defect it fixes actually appeared, or a
 * way the fix could become a new defect of its own.
 */
describe('talosEffectiveToolPermissions', () => {
    const stored = (patch: Partial<TalosToolPermissions>): TalosToolPermissions => ({
        ...TALOS_DEFAULT_TOOL_PERMISSIONS,
        ...patch,
    })

    /**
     * The owner's decision of 2026-08-01, pinned. Everything asks, because the
     * card that does the asking now exists — and because `deny` is
     * indistinguishable from a considered "never", so it is the wrong shape for
     * a default. If this line changes, the tests below change meaning.
     */
    it('documents that every action asks by default', () => {
        expect(TALOS_DEFAULT_TOOL_PERMISSIONS).toEqual({
            read: 'ask',
            write: 'ask',
            outbound: 'ask',
            // ⭐ La quarta, dal 2026-08-20: `npm test` esegue codice arbitrario,
            // e con tre parole sole non avevamo modo di nominarlo.
            execute: 'ask',
        })
    })

    /**
     * The defect itself. Settings persists all three whether or not the screen
     * was ever opened, so the old defaults are sitting on every existing device.
     * Without this, changing a default would only reach people who installed the
     * app afterwards.
     */
    it('gives an unchosen value the default of today, not the one it was installed with', () => {
        const effective = talosEffectiveToolPermissions({
            stored: { ...stored({}), read: 'allow', outbound: 'deny' },
            chosen: [],
        })
        expect(effective).toEqual(TALOS_DEFAULT_TOOL_PERMISSIONS)
    })

    /**
     * The other half, and the one that matters more: a value the user CHOSE is
     * not a default to be revised. If this ever passes as 'ask', the word
     * "never" has been taken away from them.
     */
    it('never revises a value the user chose', () => {
        const effective = talosEffectiveToolPermissions({
            stored: { ...stored({}), read: 'allow', write: 'allow', outbound: 'deny' },
            chosen: ['outbound', 'read'],
        })
        expect(effective.outbound).toBe('deny')
        expect(effective.read).toBe('allow')
        // `write` was never chosen, so it follows today's default.
        expect(effective.write).toBe('ask')
    })

    it('leaves a value that already matches the default exactly as it is', () => {
        const source = stored({})
        expect(talosEffectiveToolPermissions({ stored: source, chosen: [] })).toBe(source)
    })

    it('returns the same object when nothing changes, so callers can compare cheaply', () => {
        const source = stored({ outbound: 'allow' })
        expect(talosEffectiveToolPermissions({ stored: source, chosen: ['outbound'] })).toBe(source)
    })

    /**
     * A chosen value that happens to equal the default must still be left
     * alone — otherwise "chosen" would quietly stop meaning anything the day
     * the default moved onto it.
     */
    it('treats a chosen value equal to the default as chosen, not as inherited', () => {
        const effective = talosEffectiveToolPermissions({
            stored: stored({ outbound: 'ask' }),
            chosen: ['outbound'],
        })
        expect(effective.outbound).toBe('ask')
    })
})

describe('parseTalosChosenToolActions', () => {
    it('reads a valid list', () => {
        expect(parseTalosChosenToolActions(['outbound', 'read'])).toEqual(['outbound', 'read'])
    })

    it('drops unknown entries instead of failing the whole list', () => {
        expect(parseTalosChosenToolActions(['outbound', 'nonsense', 7, null])).toEqual(['outbound'])
    })

    it('de-duplicates', () => {
        expect(parseTalosChosenToolActions(['write', 'write'])).toEqual(['write'])
    })

    /**
     * Missing state means "nothing chosen yet", which is the state every
     * existing installation is in — and the one where today's default applies.
     * Reading it as anything else would silently exempt everyone already using
     * the app from the change.
     */
    it('reads absent or malformed state as nothing chosen', () => {
        expect(parseTalosChosenToolActions(undefined)).toEqual([])
        expect(parseTalosChosenToolActions(null)).toEqual([])
        expect(parseTalosChosenToolActions('outbound')).toEqual([])
        expect(parseTalosChosenToolActions({ outbound: true })).toEqual([])
    })

    /*
     * ⭐⭐⭐ LA MIGRAZIONE, ed e la sola cosa che questo cambio poteva rompere.
     *
     * Chi ha installato l'app prima del 2026-08-20 ha nei valori salvati SOLO
     * tre chiavi: `execute` non c'e. Le due cose che devono valere insieme:
     *
     *   · il potere nuovo si applica come `ask`, cioe si CHIEDE;
     *   · e non risulta SCELTO, perche a quella persona non e mai stata posta
     *     la domanda. Trasformare un default in una decisione e esattamente il
     *     difetto che questo file esiste per impedire, e vale anche al
     *     contrario: una decisione che nessuno ha preso non si inventa.
     */
    it('⛔ chi ha salvato TRE poteri si ritrova il quarto ad ASK, e non come sua scelta', () => {
        const vecchio = { read: 'allow', write: 'allow', outbound: 'allow' } as TalosToolPermissions
        const effective = talosEffectiveToolPermissions({
            stored: vecchio,
            chosen: ['read', 'write', 'outbound'],
        })
        expect(effective.execute).toBe('ask')
        // ⛔ E i tre che aveva scelto restano suoi: nessuno li tocca.
        expect(effective.read).toBe('allow')
        expect(effective.write).toBe('allow')
        expect(effective.outbound).toBe('allow')
    })

    it('⛔ e una vecchia lista di scelte non puo far apparire `execute` fra le scelte', () => {
        expect(parseTalosChosenToolActions(['read', 'write', 'outbound']))
            .not.toContain('execute')
        // ⭐ Ma se un giorno la persona la sceglie davvero, la lista la accetta.
        expect(parseTalosChosenToolActions(['execute'])).toEqual(['execute'])
    })
})