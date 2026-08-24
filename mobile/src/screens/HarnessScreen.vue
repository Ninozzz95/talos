<script setup lang="ts">
/**
 * Harness UI (24/8) — the list, native Vue: session names/status/timestamps
 * copied verbatim from the demo data already drawn inside
 * `public/harness-ui/index.html` (#sessionList). Per the brief and the
 * owner's own note (harness-ui-routing-sessioni-come-chat.md), the
 * STRUCTURE of navigation is what must be real here — not the data behind
 * it, which stays demo until a real harness backend exists.
 *
 * Tapping a row opens `harness-session`, whose only job is the top-level
 * navigation into that same static mockup (see HarnessSessionScreen.vue) —
 * the CSP (`frame-src 'none'`) already forbids embedding it, so this is not
 * a fresh mechanism, only a real router entry reaching the one already
 * decided when the debug Settings link first shipped.
 */
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { FlaskConical } from '@lucide/vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'

const router = useRouter()
const { t } = useTalosI18n()

/**
 * Demo content, on purpose not translated per locale: these are meant to
 * read like real engineering session names (a git branch, a task title),
 * exactly as they appear inside the mockup itself — translating them would
 * invent a fact ("this session exists in Italian too") that isn't true.
 */
interface HarnessDemoSession {
    id: string
    title: string
    meta: string
    time: string
    group: 'today' | 'yesterday' | 'week'
}

const DEMO_SESSIONS: readonly HarnessDemoSession[] = [
    { id: 'refactor-auth-flow', title: 'Refactor auth flow', meta: '3 tool attivi · 1 min fa', time: '09:12', group: 'today' },
    { id: 'audit-api-permissions', title: 'Audit API permissions', meta: 'review · 8 min fa', time: '08:42', group: 'today' },
    { id: 'fix-mobile-composer', title: 'Fix mobile composer', meta: 'workspace · 9 h fa', time: '08:30', group: 'today' },
    { id: 'prepare-release-notes', title: 'Prepare release notes', meta: 'archiviata · 15 h fa', time: '15:25', group: 'yesterday' },
    { id: 'investigate-flaky-tests', title: 'Investigate flaky tests', meta: 'branch: fix/tests', time: 'Mar', group: 'week' },
]

const GROUPS = ['today', 'yesterday', 'week'] as const

function sessionsIn(group: typeof GROUPS[number]): readonly HarnessDemoSession[] {
    return DEMO_SESSIONS.filter((session) => session.group === group)
}

function openSession(session: HarnessDemoSession): void {
    void router.push({ name: 'harness-session', params: { id: session.id } })
}
</script>

<template>
    <TalosMobileScreen :title="t('navigation.harness')" data-testid="talos-harness-screen">
        <div class="flex flex-col gap-4">
            <p
                data-testid="talos-harness-demo-notice"
                class="flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs leading-5 text-[var(--talos-muted)]"
            >
                <FlaskConical class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span>{{ t('harness.demoNotice') }}</span>
            </p>

            <div v-for="group in GROUPS" :key="group">
                <template v-if="sessionsIn(group).length">
                    <p class="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ t(`harness.groups.${group}`) }}
                    </p>
                    <ul class="flex flex-col gap-0.5">
                        <li v-for="session in sessionsIn(group)" :key="session.id">
                            <button
                                type="button"
                                data-testid="talos-harness-row"
                                :data-harness-session-id="session.id"
                                class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--talos-active)]"
                                @click="openSession(session)"
                            >
                                <span class="flex min-w-0 flex-1 flex-col">
                                    <span class="truncate text-sm text-[var(--talos-text)]">{{ session.title }}</span>
                                    <span class="truncate text-2xs text-[var(--talos-muted)]">{{ session.meta }}</span>
                                </span>
                                <span class="shrink-0 text-2xs tabular-nums text-[var(--talos-muted)]">{{ session.time }}</span>
                            </button>
                        </li>
                    </ul>
                </template>
            </div>
        </div>
    </TalosMobileScreen>
</template>
