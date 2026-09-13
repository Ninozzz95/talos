<script setup lang="ts">
/**
 * One source, with the thing the category never shows: how deeply it was read.
 *
 * The research of 2026-08-03 checked all five products for exactly this and
 * found nothing. Every citation looks the same whether the page was read whole,
 * skimmed as a search snippet, or never reached at all. Its recommendation is
 * the first item under L3: make reading depth a first-class fact.
 *
 * So it is stated in words and not implied by an icon — "pagina intera" or
 * "solo frammento" — and the claims that rest on this source are listed
 * underneath, because the useful question about a weak source is which
 * sentences depend on it.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight, ExternalLink } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useTalosResearchRun } from '@/composables/useTalosResearchRun'
import { talosPublishedOn } from '@/lib/publishedDate'

const route = useRoute()
const router = useRouter()
const { t, locale } = useTalosI18n()

const runId = computed(() => String(route.params.id ?? ''))
const index = computed(() => Number.parseInt(String(route.params.index ?? ''), 10))
const { report, loading, missing } = useTalosResearchRun(() => runId.value)

const source = computed(() => report.value?.sources[index.value] ?? null)

/** Which claims lean on this page — the question worth asking about a weak one. */
const dependants = computed(() => (report.value?.claims ?? [])
    .map((claim, at) => ({ claim, at }))
    .filter((entry) => entry.claim.sourceIndex === index.value))

function openClaim(at: number): void {
    void router.push({ name: 'research-claim', params: { id: runId.value, index: String(at) } })
}
</script>

<template>
    <TalosMobileScreen :title="t('research.sourceTitle')" data-testid="talos-research-source-screen">
        <div class="flex flex-col gap-4">
            <p v-if="loading" class="text-sm text-[var(--talos-muted)]">{{ t('research.loading') }}</p>
            <p v-else-if="missing || !source" data-testid="talos-research-source-missing" class="rounded-xl border border-[var(--talos-border)] p-4 text-sm text-[var(--talos-muted)]">
                {{ t('research.missing') }}
            </p>

            <template v-else>
                <p class="text-base leading-6 text-[var(--talos-text)]">{{ source.title || source.url }}</p>

                <a
                    :href="source.url"
                    target="_blank"
                    rel="noreferrer noopener"
                    data-testid="talos-research-source-url"
                    class="talos-pressable flex min-h-touch items-center gap-2 break-all rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 font-mono text-2xs text-[var(--talos-accent)]"
                >
                    <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
                    {{ source.url }}
                </a>

                <!-- Reading depth, said in words. Nobody else exposes it, and an
                     icon alone would make it look like decoration. -->
                <dl data-testid="talos-research-depth" class="grid grid-cols-2 gap-3 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                    <div>
                        <dt class="text-2xs uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.readingDepth') }}</dt>
                        <dd class="mt-1 text-sm text-[var(--talos-text)]">
                            {{ source.obtained === 'snippet' ? t('research.onlySnippet') : t('research.pageRead') }}
                        </dd>
                    </div>
                    <div>
                        <dt class="text-2xs uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.publishedAt') }}</dt>
                        <dd class="mt-1 text-sm text-[var(--talos-text)]">{{ source.publishedAt ? talosPublishedOn(source.publishedAt, locale) : t('research.noDate') }}</dd>
                    </div>
                </dl>

                <!-- A source nobody cited is a FACT, not an absence: the run
                     fetched this page and built nothing on it. Hiding the
                     section left the page ending in blank space, which on the
                     device read as truncated rather than as an answer. -->
                <p v-if="dependants.length === 0" data-testid="talos-research-source-unused" class="text-xs leading-5 text-[var(--talos-muted)]">
                    {{ t('research.noClaimsOnThisSource') }}
                </p>

                <section v-else class="flex flex-col gap-2">
                    <p class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ t(dependants.length === 1 ? 'research.claimsOnThisSourceOne' : 'research.claimsOnThisSourceMany', { count: dependants.length }) }}
                    </p>
                    <button
                        v-for="entry in dependants"
                        :key="entry.at"
                        type="button"
                        data-testid="talos-research-source-claim"
                        class="talos-pressable flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left"
                        @click="openClaim(entry.at)"
                    >
                        <span class="min-w-0 flex-1">
                            <span class="block text-sm leading-5 text-[var(--talos-text)]">{{ entry.claim.text }}</span>
                            <span class="mt-1 block text-2xs text-[var(--talos-muted)]">{{ t(`research.support.${entry.claim.checks.claimSupported}`) }}</span>
                        </span>
                        <ChevronRight class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                    </button>
                </section>
            </template>
        </div>
    </TalosMobileScreen>
</template>
