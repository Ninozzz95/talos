<script setup lang="ts">
import { computed, ref } from 'vue'
import { TALOS_MOBILE_MODEL_PROFILES, talosComposerEffortLadder, talosEffortLabel } from '@/lib/talosModels'

// Model Lab catalog (mirror desktop models/TalosModelCatalog.vue): provider filter +
// search + a card grid showing provider·model, composer visibility, and the effort
// ladder. Local stub data (real catalog after M2 / desktop FV2-06.0 P0).
const search = ref('')
const provider = ref('all')

const providers = computed(() => ['all', ...new Set(TALOS_MOBILE_MODEL_PROFILES.map((p) => p.provider))])
const filtered = computed(() => TALOS_MOBILE_MODEL_PROFILES.filter((p) =>
    (provider.value === 'all' || p.provider === provider.value)
    && (search.value === '' || `${p.display_name} ${p.model}`.toLowerCase().includes(search.value.toLowerCase())),
))
</script>

<template>
    <div data-testid="talos-model-catalog" class="flex flex-col gap-3">
        <header>
            <p class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">Provider catalog</p>
            <h2 class="text-base font-semibold text-[var(--talos-text)]">Models, effort and composer visibility</h2>
        </header>
        <div class="flex flex-wrap items-center gap-2">
            <button
                v-for="prov in providers"
                :key="prov"
                type="button"
                :data-provider-filter="prov"
                class="rounded-md border px-2 py-1 text-xs"
                :class="provider === prov ? 'border-[var(--talos-accent)] text-[var(--talos-accent)]' : 'border-[var(--talos-border)] text-[var(--talos-muted)]'"
                @click="provider = prov"
            >{{ prov }}</button>
            <input
                v-model="search"
                type="search"
                aria-label="Search models"
                placeholder="Search…"
                class="ml-auto min-w-0 flex-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-1 text-sm text-[var(--talos-text)] placeholder:text-[var(--talos-muted)]"
            />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
            <article
                v-for="model in filtered"
                :key="model.id"
                data-testid="talos-catalog-card"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
            >
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <p class="truncate font-medium text-[var(--talos-text)]">{{ model.display_name }}</p>
                        <p class="truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ model.provider }} · {{ model.model }}</p>
                    </div>
                    <span class="shrink-0 text-[10px] uppercase tracking-wide text-[var(--talos-muted)]">{{ model.show_in_composer ? 'in composer' : 'hidden' }}</span>
                </div>
                <div class="mt-2 flex flex-wrap gap-1">
                    <span
                        v-for="level in talosComposerEffortLadder(model)"
                        :key="level"
                        class="rounded border border-[var(--talos-border)] px-1.5 py-0.5 text-[10px] text-[var(--talos-muted)]"
                    >{{ talosEffortLabel(level) }}</span>
                </div>
            </article>
        </div>
        <p v-if="!filtered.length" class="text-sm text-[var(--talos-muted)]">No models match.</p>
    </div>
</template>
