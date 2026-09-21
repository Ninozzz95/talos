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
 *
 * `embedded` (24/8, sidebar refactor): owner, after watching the real Claude
 * app — one physical sidebar slot, contextual content, not two panels side
 * by side. TalosTabletSidebar.vue mounts THIS component here, in place of
 * ChatsScreen, when the active station is Harness — same idiom ChatsScreen
 * already uses for its own `embedded` prop (no TalosMobileScreen chrome:
 * that shell's own H1/opaque background are right for a routed station, and
 * wrong for a panel that already lives inside the rail's translucent header).
 * Demo data lives in `@/lib/harnessDemoSessions` (not declared here anymore)
 * so the tablet redirect below (App.vue, mirroring talosTabletLeavesChatsRoute)
 * reads the SAME list a person actually sees, never a second hardcoded id.
 */
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { FlaskConical } from '@lucide/vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { HARNESS_DEMO_GROUPS, harnessDemoSessionsIn, type HarnessDemoSession } from '@/lib/harnessDemoSessions'

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const router = useRouter()
const route = useRoute()
const { t } = useTalosI18n()

function openSession(session: HarnessDemoSession): void {
    void router.push({ name: 'harness-session', params: { id: session.id } })
}

function isCurrentSession(session: HarnessDemoSession): boolean {
    return route.name === 'harness-session' && String(route.params.id ?? '') === session.id
}
</script>

<template>
    <TalosMobileScreen :title="t('navigation.harness')" :embedded="embedded" data-testid="talos-harness-screen">
        <div class="flex flex-col gap-4">
            <p
                data-testid="talos-harness-demo-notice"
                class="flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs leading-5 text-[var(--talos-muted)]"
            >
                <FlaskConical class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span>{{ t('harness.demoNotice') }}</span>
            </p>

            <div v-for="group in HARNESS_DEMO_GROUPS" :key="group">
                <template v-if="harnessDemoSessionsIn(group).length">
                    <p class="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ t(`harness.groups.${group}`) }}
                    </p>
                    <ul class="flex flex-col gap-0.5">
                        <li v-for="session in harnessDemoSessionsIn(group)" :key="session.id">
                            <button
                                type="button"
                                data-testid="talos-harness-row"
                                :data-harness-session-id="session.id"
                                :data-harness-active="isCurrentSession(session) ? 'true' : undefined"
                                :aria-current="isCurrentSession(session) ? 'page' : undefined"
                                class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--talos-active)]"
                                :class="{ 'bg-[var(--talos-active)]': isCurrentSession(session) }"
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
