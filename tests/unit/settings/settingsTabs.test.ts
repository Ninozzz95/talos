import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_SETTINGS_GROUPS,
    TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB,
    TALOS_MOBILE_SETTINGS_TABS,
} from '@/components/talos/settings/settingsTabs'

describe('TALOS mobile settings registry', () => {
    it('keeps the models compatibility id and places its routed row first in Intelligence', () => {
        expect(TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB).toBe('models')
        expect(TALOS_MOBILE_SETTINGS_TABS.some((tab) => tab.id === 'models')).toBe(true)
        expect(TALOS_MOBILE_SETTINGS_GROUPS.flatMap((group) => group.tabIds)).toContain('models')
        expect(TALOS_MOBILE_SETTINGS_GROUPS[0]?.tabIds[0]).toBe('models')
    })

    /**
     * Mobile-only categories, and why each one cannot come from the desktop.
     *
     * The parity contract below is about DRIFT: a desktop category quietly
     * disappearing or being renamed. A category the desktop cannot have is a
     * different thing, and hiding it inside the parity list would make the
     * contract stop catching what it exists to catch.
     */
    const MOBILE_ONLY: Record<string, string> = {
        // Android runtime permissions have no desktop counterpart at all, and
        // the app will be distributed, where explaining them is expected.
        privacy: 'Android runtime permissions do not exist on the desktop.',
        // The localized mobile shell ships before the desktop locale runtime.
        language: 'This release owns Android per-app and mobile UI languages.',
    }

    it('adds a mobile-only category only with a reason', () => {
        const desktopIds = TALOS_MOBILE_SETTINGS_TABS
            .map((tab) => tab.id)
            .filter((id) => !(id in MOBILE_ONLY))
        expect(desktopIds).toHaveLength(13)
        for (const id of Object.keys(MOBILE_ONLY)) {
            expect(TALOS_MOBILE_SETTINGS_TABS.some((tab) => tab.id === id)).toBe(true)
        }
    })

    /**
     * ⛔ `backup` e' entrato qui, e NON in MOBILE_ONLY, di proposito.
     *
     * MOBILE_ONLY e' per le categorie che il desktop **non puo' avere** — i
     * permessi runtime di Android, la lingua per-app. Il backup il desktop lo
     * puo' avere eccome, e lo deve avere: e' la parita' che D21 impone («mobile
     * prima, e a ogni fase chiusa un ticket formale per il desktop»).
     *
     * Metterlo fra i mobile-only avrebbe nascosto un debito dentro l'elenco che
     * esiste per far emergere i debiti. Sta qui, e finche' il desktop non ce
     * l'ha questa riga E' il ticket.
     */
    /**
     * ⛔ 2026-08-10: entra `voice`, e come `backup` sta QUI e non fra i
     * mobile-only. Una stazione della voce il desktop la puo' avere e la deve
     * avere — questa riga E' il ticket, finche' non ce l'ha.
     *
     * Perche' e' nata: owner, «l'impostazione della voce si trova su aspetto.
     * Deve avere un'impostazione fuori». E la misura che gli da' ragione: in
     * fondo ad Aspetto il selettore mostrava **0 voci** mentre il motore ne
     * aveva **473** ed era fermo sulla generica. Un pannello nascosto dentro
     * un altro e' un pannello che nessuno apre.
     */
    it('exposes the exact thirteen desktop settings categories in order (F4-#25: no Shortcuts on a phone)', () => {
        expect(TALOS_MOBILE_SETTINGS_TABS
            .map((tab) => tab.id)
            .filter((id) => !(id in MOBILE_ONLY))).toEqual([
            'models',
            'ai_defaults',
            'search',
            'browser',
            'integrations',
            'email',
            'reminders',
            'appearance',
            'voice',
            'backup',
            'account',
            'agent_tools',
            'system',
        ])
        expect(TALOS_MOBILE_SETTINGS_TABS
            .filter((tab) => !(tab.id in MOBILE_ONLY))
            .map((tab) => tab.label)).toEqual([
            'Models',
            'AI Defaults',
            'Search',
            'Browser',
            'Integrations',
            'Email',
            'Reminders',
            'Appearance',
            'Voice',
            'Backup and restore',
            'Account',
            'Agent Tools',
            'System',
        ])
    })

    it('marks only real local panels available in this slice', () => {
        const available = TALOS_MOBILE_SETTINGS_TABS.filter((tab) => tab.availability === 'available')
        // F2-T6: Account became a REAL local panel (replay intro + app lock).
        // Privacy is mobile-only (see MOBILE_ONLY) and is a real local panel:
        // it reads live device state rather than gating on a missing service.
        // 2026-08-01: Search joined them, and it had been the odd one out —
        // gated on a worker it never needed, while the source picker and its
        // key sat under AI Defaults doing the job.
        expect(available.map((tab) => tab.id))
            // 2026-08-07: Backup joined them. It is a real local panel — it reads
            // the durable repository and writes through the system file picker —
            // and it exists because the APK signing key was lost: reinstalling
            // means uninstalling, and uninstalling without an export means
            // losing the chats, the Library, the memories and the keys.
            // 2026-08-10: Voice joined them, ed e' un pannello locale vero —
            // legge le voci del motore del telefono e ne applica una.
            .toEqual(['models', 'ai_defaults', 'search', 'browser', 'appearance', 'voice', 'language', 'privacy', 'backup', 'account', 'agent_tools'])
    })
})
