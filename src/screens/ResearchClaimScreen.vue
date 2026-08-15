<script setup lang="ts">
/**
 * One claim, and exactly what it rests on.
 *
 * This is the page no competitor has. The research of 2026-08-03 checked all
 * five and found the same gap in every one: they attach citations, and none of
 * them says whether the cited page actually supports the sentence. OpenAI
 * admits weak confidence calibration, Anthropic admits the source may carry
 * context the answer omits, X admits Grok can summarise wrongly — and the
 * interface offers the reader nothing to act on.
 *
 * We kept the passage. So this page can show the sentence, the verdict, the
 * exact words from the page it was checked against, and who did the checking.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight, Quote } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useTalosResearchRun } from '@/composables/useTalosResearchRun'

const route = useRoute()
const router = useRouter()
const { t } = useTalosI18n()

const runId = computed(() => String(route.params.id ?? ''))
const index = computed(() => Number.parseInt(String(route.params.index ?? ''), 10))
const { report, loading, missing } = useTalosResearchRun(() => runId.value)

const claim = computed(() => report.value?.claims[index.value] ?? null)
const source = computed(() => (claim.value ? report.value?.sources[claim.value.sourceIndex] ?? null : null))

/**
 * The verdict as a word and a tone, never a colour alone.
 *
 * "Non usare solo colore per buono/cattivo" is one of the fourteen things the
 * research says not to copy: the state has to survive being read by someone who
 * cannot see the difference.
 */
const tone = computed(() => {
    switch (claim.value?.checks.claimSupported) {
        case 'yes': return 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)]'
        case 'no': return 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)]'
        default: return 'border-[var(--talos-border)] bg-[var(--talos-panel)]'
    }
})

function openSource(): void {
    if (!claim.value) return
    void router.push({
        name: 'research-source',
        params: { id: runId.value, index: String(claim.value.sourceIndex) },
    })
}
</script>

<template>
    <TalosMobileScreen :title="t('research.claimTitle')" data-testid="talos-research-claim-screen">
        <div class="flex flex-col gap-4">
            <p v-if="loading" class="text-sm text-[var(--talos-muted)]">{{ t('research.loading') }}</p>
            <p v-else-if="missing || !claim" data-testid="talos-research-claim-missing" class="rounded-xl border border-[var(--talos-border)] p-4 text-sm text-[var(--talos-muted)]">
                {{ t('research.missing') }}
            </p>

            <template v-else>
                <p class="text-base leading-6 text-[var(--talos-text)]">{{ claim.text }}</p>

                <p data-testid="talos-research-verdict" class="rounded-xl border p-3 text-sm leading-5 text-[var(--talos-text)]" :class="tone">
                    {{ t(`research.support.${claim.checks.claimSupported}`) }}
                </p>

                <!-- The passage, kept at collection time. Nobody else can show
                     this, because nobody else stored it — which is also why a
                     re-check is possible here and impossible there. -->
                <section data-testid="talos-research-passage" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                    <p class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                        <Quote class="size-3.5" aria-hidden="true" /> {{ t('research.passageTitle') }}
                    </p>
                    <p v-if="claim.passage" class="text-sm leading-6 text-[var(--talos-text)]">{{ claim.passage }}</p>
                    <p v-else class="text-sm leading-5 text-[var(--talos-muted)]">{{ t('research.quoteMissing') }}</p>
                </section>

                <button
                    v-if="source"
                    type="button"
                    data-testid="talos-research-claim-source"
                    class="talos-pressable flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left"
                    @click="openSource()"
                >
                    <span class="min-w-0 flex-1">
                        <span class="block text-2xs uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.fromSource') }}</span>
                        <span class="mt-1 block truncate text-sm text-[var(--talos-text)]">{{ source.title || source.url }}</span>
                        <span class="mt-1 block font-mono text-2xs text-[var(--talos-muted)]">
                            {{ source.obtained === 'snippet' ? t('research.onlySnippet') : t('research.pageRead') }}
                        </span>
                    </span>
                    <ChevronRight class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                </button>
            </template>
        </div>
    </TalosMobileScreen>
</template>
