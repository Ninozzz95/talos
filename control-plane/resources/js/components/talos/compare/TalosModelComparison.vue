<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, GitCompare, Loader2, RefreshCw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosComparisonLane from './TalosComparisonLane.vue'
import TalosComparisonScorecard from './TalosComparisonScorecard.vue'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import { useTalosModelComparisons } from '../../../composables/useTalosModelComparisons'
import type { TalosBenchmarkGroup } from '../../../lib/talosTypes'

const emit = defineEmits<{
    benchmarkPromoted: [group: TalosBenchmarkGroup]
}>()

const {
    usableModelProfiles,
    loadingModelProfiles,
    modelProfileError,
    loadModelProfiles,
} = useTalosModelProfiles()

const {
    currentComparison,
    runningComparison,
    votingComparison,
    promotingComparison,
    comparisonError,
    createModelComparison,
    voteModelComparison,
    promoteModelComparison,
} = useTalosModelComparisons()

const prompt = ref('')
const mode = ref<'blind' | 'parallel' | 'shuffle'>('blind')
const taskType = ref<'chat' | 'agent' | 'search' | 'research'>('chat')
const timeoutSeconds = ref(60)
const slotA = ref('')
const slotB = ref('')
const slotC = ref('')
const scorecard = ref<Record<string, number | null>>({
    usefulness: null,
    correctness: null,
    evidence: null,
    formatting: null,
    speed: null,
    cost: null,
})
const actionMessage = ref('')
const actionError = ref<string | null>(null)

const visibleError = computed(() => actionError.value || comparisonError.value || modelProfileError.value)
const selectedProfileIds = computed(() => [slotA.value, slotB.value, slotC.value].filter(Boolean))
const canStart = computed(() => {
    return prompt.value.trim().length > 0
        && new Set(selectedProfileIds.value).size === selectedProfileIds.value.length
        && selectedProfileIds.value.length >= 2
        && !runningComparison.value
})
const comparison = computed(() => currentComparison.value)
const canVote = computed(() => Boolean(comparison.value && comparison.value.blind && !comparison.value.revealed))
const canPromote = computed(() => Boolean(comparison.value && comparison.value.lanes.length >= 2 && !promotingComparison.value))
const completedScorecard = computed<Record<string, number>>(() => Object.fromEntries(
    Object.entries(scorecard.value).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
))

async function refreshProfiles() {
    try {
        const profiles = await loadModelProfiles()
        slotA.value = slotA.value || profiles.find((profile) => profile.status !== 'disabled' && profile.has_secret)?.id || ''
        slotB.value = slotB.value || profiles.find((profile) => profile.id !== slotA.value && profile.status !== 'disabled' && profile.has_secret)?.id || ''
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not load model profiles.'
    }
}

async function startComparison() {
    if (!canStart.value) {
        actionError.value = 'Select two or three distinct server-side model profiles.'
        return
    }

    actionError.value = null
    actionMessage.value = ''

    try {
        await createModelComparison({
            prompt: prompt.value.trim(),
            mode: mode.value,
            task_type: taskType.value,
            blind: mode.value === 'blind',
            timeout_seconds: timeoutSeconds.value,
            model_profile_ids: selectedProfileIds.value,
        })
        actionMessage.value = 'Model comparison completed.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not run this comparison.'
    }
}

async function voteLane(laneId: string) {
    if (!comparison.value) {
        return
    }

    actionError.value = null
    actionMessage.value = ''

    try {
        await voteModelComparison(comparison.value.id, {
            lane_id: laneId,
            reason: Object.keys(completedScorecard.value).length > 0 ? 'Selected from TALOS scorecard.' : null,
            scorecard: completedScorecard.value,
        })
        actionMessage.value = 'Vote recorded and model identities revealed.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not record the vote.'
    }
}

async function promoteComparison() {
    if (!comparison.value) {
        return
    }

    actionError.value = null
    actionMessage.value = ''

    try {
        const group = await promoteModelComparison(comparison.value.id)
        emit('benchmarkPromoted', group)
        actionMessage.value = 'Model comparison promoted to benchmark evidence.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not promote this comparison.'
    }
}

onMounted(() => {
    void refreshProfiles()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <GitCompare class="h-4 w-4 text-[var(--talos-accent)]" />
                        Blind model evidence
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Model Compare V4</h3>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                        Compare two or three server-side profiles, vote before reveal, then promote persisted lanes to benchmark evidence.
                    </p>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingModelProfiles || runningComparison" @click="refreshProfiles">
                    <Loader2 v-if="loadingModelProfiles" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Profiles
                </Button>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>
            <div v-if="actionMessage" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-muted)]">
                {{ actionMessage }}
            </div>

            <section class="grid gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <label class="grid gap-1">
                    <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Prompt</span>
                    <textarea
                        v-model="prompt"
                        class="min-h-[96px] resize-y rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-3 text-sm leading-6 text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                        aria-label="Comparison prompt"
                        placeholder="Ask each model for the same answer. TALOS blinds identities until the vote."
                    />
                </label>

                <div class="grid gap-2 md:grid-cols-4">
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Mode</span>
                        <select v-model="mode" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-sm text-[var(--talos-text)]" aria-label="Comparison mode">
                            <option value="blind">Blind</option>
                            <option value="parallel">Parallel</option>
                            <option value="shuffle">Shuffle</option>
                        </select>
                    </label>
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Task</span>
                        <select v-model="taskType" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-sm text-[var(--talos-text)]" aria-label="Comparison task type">
                            <option value="chat">Chat</option>
                            <option value="agent">Agent</option>
                            <option value="search">Search</option>
                            <option value="research">Research</option>
                        </select>
                    </label>
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Timeout</span>
                        <input v-model.number="timeoutSeconds" type="number" min="5" max="300" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-sm text-[var(--talos-text)]" aria-label="Comparison timeout">
                    </label>
                    <div class="flex items-end">
                        <Button type="button" class="w-full" size="sm" :disabled="!canStart" @click="startComparison">
                            <Loader2 v-if="runningComparison" class="h-4 w-4 animate-spin" />
                            Start blind comparison
                        </Button>
                    </div>
                </div>

                <div class="grid gap-2 md:grid-cols-3">
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Model slot A</span>
                        <select v-model="slotA" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-sm text-[var(--talos-text)]" aria-label="Model slot A">
                            <option value="">Select profile</option>
                            <option v-for="profile in usableModelProfiles" :key="profile.id" :value="profile.id">{{ profile.display_name }}</option>
                        </select>
                    </label>
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Model slot B</span>
                        <select v-model="slotB" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-sm text-[var(--talos-text)]" aria-label="Model slot B">
                            <option value="">Select profile</option>
                            <option v-for="profile in usableModelProfiles" :key="profile.id" :value="profile.id">{{ profile.display_name }}</option>
                        </select>
                    </label>
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Model slot C</span>
                        <select v-model="slotC" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-sm text-[var(--talos-text)]" aria-label="Model slot C">
                            <option value="">Optional</option>
                            <option v-for="profile in usableModelProfiles" :key="profile.id" :value="profile.id">{{ profile.display_name }}</option>
                        </select>
                    </label>
                </div>
            </section>

            <TalosComparisonScorecard v-model="scorecard" />

            <section v-if="comparison" class="space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-2">
                        <Badge :tone="comparison.status.includes('error') ? 'warning' : 'success'">{{ comparison.status }}</Badge>
                        <Badge :tone="comparison.revealed ? 'success' : 'neutral'">{{ comparison.revealed ? 'revealed' : 'blind' }}</Badge>
                    </div>
                    <Button type="button" variant="secondary" size="sm" :disabled="!canPromote" @click="promoteComparison">
                        <Loader2 v-if="promotingComparison" class="h-4 w-4 animate-spin" />
                        Promote to benchmark
                    </Button>
                </div>

                <div class="grid gap-3 xl:grid-cols-2">
                    <TalosComparisonLane
                        v-for="lane in comparison.lanes"
                        :key="lane.id"
                        :lane="lane"
                        :revealed="comparison.revealed"
                        :can-vote="canVote"
                        :voting="votingComparison"
                        @vote="voteLane"
                    />
                </div>
            </section>
        </div>
    </Surface>
</template>
