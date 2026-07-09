<script setup lang="ts">
const criteria = ['usefulness', 'correctness', 'evidence', 'formatting', 'speed', 'cost']

const props = defineProps<{
    modelValue: Record<string, number | null>
}>()

const emit = defineEmits<{
    'update:modelValue': [value: Record<string, number | null>]
}>()

function updateCriterion(criterion: string, event: Event) {
    const target = event.target instanceof HTMLSelectElement ? event.target : null
    const nextValue = target?.value ? Number(target.value) : null

    emit('update:modelValue', {
        ...props.modelValue,
        [criterion]: nextValue,
    })
}
</script>

<template>
    <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
        <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Scorecard</div>
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
            <div v-for="criterion in criteria" :key="criterion" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">{{ criterion }}</div>
                <select
                    class="mt-2 h-8 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 text-xs font-semibold text-[var(--talos-text)]"
                    :aria-label="`Score ${criterion}`"
                    :value="modelValue[criterion] ?? ''"
                    @change="updateCriterion(criterion, $event)"
                >
                    <option value="">Not scored</option>
                    <option v-for="score in [1, 2, 3, 4, 5]" :key="score" :value="score">{{ score }} / 5</option>
                </select>
            </div>
        </div>
    </section>
</template>
