<script setup lang="ts">
import { computed } from 'vue'
import { ShieldCheck, ShieldAlert } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import type { TalosSkill } from '../../../lib/talosTypes'

const props = defineProps<{
    skill: TalosSkill | null
    planningEnabled: boolean
    exclusionReason?: string | null
}>()

const allowedToolsText = computed(() => props.skill?.allowed_tools?.join(', ') || 'none')
</script>

<template>
    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
        <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
            <ShieldCheck v-if="planningEnabled" class="h-4 w-4 text-[var(--talos-success)]" />
            <ShieldAlert v-else class="h-4 w-4 text-[var(--talos-warning)]" />
            <h3>Skill audit</h3>
            <TalosGuideInfoButton guide-id="brain.skill_audit" compact side="bottom" />
        </div>

        <div v-if="skill" class="mt-3 space-y-3">
            <div class="flex flex-wrap gap-2">
                <Badge :tone="planningEnabled ? 'success' : 'neutral'">{{ planningEnabled ? 'planning' : 'excluded' }}</Badge>
                <Badge v-if="!planningEnabled && exclusionReason" tone="warning">{{ exclusionReason }}</Badge>
                <Badge :tone="skill.eval_status === 'passed' ? 'success' : skill.eval_status === 'failed' ? 'danger' : 'warning'">
                    {{ skill.eval_status }}
                </Badge>
                <Badge :tone="skill.review_status === 'approved' ? 'success' : skill.review_status === 'quarantined' ? 'danger' : 'neutral'">
                    {{ skill.review_status }}
                </Badge>
                <Badge :tone="skill.risk_level === 'high' || skill.risk_level === 'critical' ? 'danger' : skill.risk_level === 'medium' ? 'warning' : 'success'">
                    {{ skill.risk_level }}
                </Badge>
            </div>
            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">allowed_tools</div>
                <div class="mt-1 font-mono text-xs text-[var(--talos-text)]">{{ allowedToolsText }}</div>
            </div>
        </div>

        <p v-else class="mt-3 text-sm leading-6 text-[var(--talos-muted)]">
            Select a skill to inspect its evaluation, review status, risk, and allowed tool boundary.
        </p>
    </div>
</template>
