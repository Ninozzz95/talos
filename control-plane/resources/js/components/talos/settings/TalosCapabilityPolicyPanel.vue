<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { KeyRound, Loader2, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2, X } from '@lucide/vue'
import { Button } from '../../ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '../../ui/alert-dialog'
import Chip from '../../ui/Chip.vue'
import Input from '../../ui/Input.vue'
import TalosThemedSelect from '../ui/TalosThemedSelect.vue'
import { useTalosToast } from '../../../composables/useTalosToast'
import {
    useTalosCapabilityPolicies,
    type TalosCapabilityGrantScope,
    type TalosCapabilityPolicy,
    type TalosCapabilityPolicyAction,
    type TalosCapabilityPolicyDecision,
} from '../../../composables/useTalosCapabilityPolicies'

const props = defineProps<{
    activeTalosSessionId?: string | null
}>()

const {
    contract,
    meta,
    loadState,
    policyError,
    conflictMessage,
    pendingOperation,
    mutating,
    loadPolicies,
    updateDecision,
    createGrant,
    revokeGrant,
    masterEnable,
    revokeAll,
} = useTalosCapabilityPolicies()
const toast = useTalosToast()

const localError = ref<string | null>(null)
const acknowledgedRisk = reactive<Record<string, boolean>>({})
const grantCapability = ref<string | null>(null)
const grantScope = ref<TalosCapabilityGrantScope>('once')
const grantActions = ref<TalosCapabilityPolicyAction[]>([])
const grantScopeId = ref('')
const grantToolId = ref('')
const grantTtl = ref(3600)
const grantRiskAcknowledged = ref(false)

const decisions: Array<{ value: TalosCapabilityPolicyDecision; label: string; description: string }> = [
    { value: 'deny', label: 'Deny', description: 'Block this capability.' },
    { value: 'ask', label: 'Ask', description: 'Require an explicit grant.' },
    { value: 'allow', label: 'Allow', description: 'Permit the baseline capability.' },
]
const grantScopes = [
    { value: 'once', label: 'Once' },
    { value: 'session', label: 'Session' },
    { value: 'device', label: 'Device' },
    { value: 'account', label: 'Account' },
]

const metadataByCapability = computed(() => new Map((meta.value?.catalog ?? []).map((entry) => [entry.capability, entry])))
const policies = computed(() => contract.value?.policies ?? [])
const faults = computed(() => meta.value?.faults ?? [])
const displayedError = computed(() => conflictMessage.value ?? localError.value ?? policyError.value)
const loading = computed(() => loadState.value === 'loading')
const selectedPolicy = computed(() => policies.value.find((policy) => policy.capability === grantCapability.value) ?? null)
const selectedPolicyRequiresAck = computed(() => selectedPolicy.value ? highRisk(selectedPolicy.value) : false)
const canSubmitGrant = computed(() => {
    if (!selectedPolicy.value || grantActions.value.length === 0) return false
    if (selectedPolicyRequiresAck.value && !grantRiskAcknowledged.value) return false
    if (grantScope.value === 'session') return Boolean(grantScopeId.value.trim()) && grantTtl.value >= 60 && grantTtl.value <= 86400
    if (grantScope.value === 'device') return Boolean(grantScopeId.value.trim())
    return true
})

function highRisk(policy: TalosCapabilityPolicy) {
    return policy.risk === 'high' || policy.risk === 'critical'
}

function metadata(policy: TalosCapabilityPolicy) {
    return metadataByCapability.value.get(policy.capability)
}

function label(policy: TalosCapabilityPolicy) {
    return metadata(policy)?.label ?? policy.capability
}

function description(policy: TalosCapabilityPolicy) {
    return metadata(policy)?.description ?? 'Server-managed TALOS capability.'
}

function grantsFor(capability: string) {
    return (contract.value?.grants ?? []).filter((grant) => grant.capability === capability)
}

function formatDate(value?: string | null) {
    if (!value) return 'Never'
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}

function operationPending(operation: string) {
    return pendingOperation.value === operation
}

async function refresh() {
    localError.value = null
    try {
        await loadPolicies()
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not load capability policies.'
    }
}

async function changeDecision(policy: TalosCapabilityPolicy, decision: TalosCapabilityPolicyDecision) {
    if (decision === policy.decision) return
    localError.value = null
    const riskAcknowledged = decision === 'allow' && highRisk(policy) && acknowledgedRisk[policy.capability] === true
    try {
        await updateDecision(policy.capability, decision, riskAcknowledged)
        acknowledgedRisk[policy.capability] = false
        toast.success(`${label(policy)} is now ${decision}.`)
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not update this decision.'
        toast.error(localError.value)
    }
}

function openGrantForm(policy: TalosCapabilityPolicy) {
    grantCapability.value = policy.capability
    grantScope.value = 'once'
    grantActions.value = [...policy.actions]
    grantScopeId.value = ''
    grantToolId.value = ''
    grantTtl.value = 3600
    grantRiskAcknowledged.value = false
    localError.value = null
}

function closeGrantForm() {
    grantCapability.value = null
}

function updateGrantScope(value: string) {
    grantScope.value = value as TalosCapabilityGrantScope
    grantScopeId.value = value === 'session' ? props.activeTalosSessionId ?? '' : ''
}

function toggleGrantAction(action: TalosCapabilityPolicyAction, checked: boolean) {
    grantActions.value = checked
        ? [...new Set([...grantActions.value, action])]
        : grantActions.value.filter((candidate) => candidate !== action)
}

async function submitGrant() {
    const policy = selectedPolicy.value
    if (!policy || !canSubmitGrant.value) return
    localError.value = null
    try {
        await createGrant(policy.capability, {
            scope: grantScope.value,
            actions: [...grantActions.value],
            ...(['session', 'device'].includes(grantScope.value) ? { scope_id: grantScopeId.value.trim() } : {}),
            ...(grantToolId.value.trim() ? { tool_id: grantToolId.value.trim() } : {}),
            ...(grantScope.value === 'session' ? { session_ttl_seconds: grantTtl.value } : {}),
            ...(selectedPolicyRequiresAck.value ? { risk_acknowledged: grantRiskAcknowledged.value } : {}),
        })
        toast.success(`Grant created for ${label(policy)}.`)
        closeGrantForm()
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not create this grant.'
        toast.error(localError.value)
    }
}

async function revoke(grantId: string) {
    localError.value = null
    try {
        await revokeGrant(grantId)
        toast.success('Capability grant revoked.')
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not revoke this grant.'
        toast.error(localError.value)
    }
}

async function enableMasterSet() {
    localError.value = null
    try {
        await masterEnable()
        toast.success('Eligible low-risk capabilities enabled.')
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not enable the eligible capability set.'
        toast.error(localError.value)
    }
}

async function revokeEverything() {
    localError.value = null
    try {
        await revokeAll()
        toast.success('Capability grants revoked and baseline allows reset.')
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not revoke all capability access.'
        toast.error(localError.value)
    }
}

onMounted(refresh)
</script>

<template>
    <section data-testid="talos-capability-policy-panel" class="space-y-4" aria-labelledby="talos-capability-policy-title">
        <div class="flex flex-col gap-3 border-b border-[var(--talos-border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex min-w-0 items-start gap-3">
                <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                <div>
                    <h3 id="talos-capability-policy-title" class="text-sm font-semibold text-[var(--talos-text)]">Capability policies</h3>
                    <p class="mt-1 max-w-2xl text-xs leading-5 text-[var(--talos-muted)]">
                        Baseline decisions and temporary grants are enforced by Laravel on every operation. This browser stores no authorization state.
                    </p>
                </div>
            </div>
            <Button type="button" variant="ghost" size="icon" :disabled="loading || mutating" aria-label="Refresh capability policies" @click="refresh">
                <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                <RefreshCw v-else class="h-4 w-4" />
            </Button>
        </div>

        <div class="flex flex-wrap gap-2">
            <AlertDialog>
                <AlertDialogTrigger as-child>
                    <Button type="button" size="sm" variant="secondary" :disabled="!contract || mutating">
                        <ShieldCheck class="h-4 w-4" />
                        Enable eligible set
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Enable the eligible capability set?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This audited batch enables only the low-risk capabilities listed below. It does not create a master boolean or enable excluded capabilities.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div class="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <div class="font-semibold text-[var(--talos-text)]">Eligible</div>
                            <p class="mt-1 text-xs text-[var(--talos-muted)]">{{ meta?.master_enable.eligible.join(', ') || 'None' }}</p>
                        </div>
                        <div>
                            <div class="font-semibold text-[var(--talos-text)]">Excluded</div>
                            <p class="mt-1 text-xs text-[var(--talos-muted)]">{{ meta?.master_enable.excluded.join(', ') || 'None' }}</p>
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction @click="enableMasterSet">Enable eligible</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
                <AlertDialogTrigger as-child>
                    <Button type="button" size="sm" variant="destructive" :disabled="!contract || mutating">
                        <Trash2 class="h-4 w-4" />
                        Revoke all
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke all capability access?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Active grants will be revoked and baseline Allow decisions return to Ask. Explicit Deny decisions remain unchanged.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction @click="revokeEverything">Revoke all</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>

        <p v-if="displayedError" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]" role="alert">
            {{ displayedError }}
        </p>
        <div v-if="faults.length" class="space-y-2" aria-label="Capability policy faults">
            <p v-for="fault in faults" :key="`${fault.code}:${fault.policy_id ?? fault.grant_id ?? fault.capability}`" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]" role="status">
                <strong>{{ fault.code }}</strong>: {{ fault.message }}
            </p>
        </div>

        <div v-if="loading && !contract" class="inline-flex items-center gap-2 text-sm text-[var(--talos-muted)]" role="status">
            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
            Loading capability policies
        </div>

        <div v-else-if="contract" class="space-y-3">
            <article
                v-for="policy in policies"
                :key="policy.capability"
                :data-capability-policy="policy.capability"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4"
            >
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ label(policy) }}</h4>
                            <Chip :code="policy.risk" />
                            <Chip :code="policy.source" />
                        </div>
                        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ description(policy) }}</p>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                            <span v-for="action in policy.actions" :key="action" class="rounded border border-[var(--talos-border)] bg-[var(--talos-panel)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--talos-muted)]">{{ action }}</span>
                        </div>
                    </div>

                    <fieldset class="min-w-0" :disabled="loading || mutating">
                        <legend class="sr-only">{{ label(policy) }} baseline decision</legend>
                        <div class="grid grid-cols-3 overflow-hidden rounded-md border border-[var(--talos-border)]" role="radiogroup" :aria-label="`${label(policy)} baseline decision`">
                            <label v-for="decision in decisions" :key="decision.value" class="relative cursor-pointer border-r border-[var(--talos-border)] last:border-r-0 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                                <input
                                    class="peer sr-only"
                                    type="radio"
                                    role="radio"
                                    :name="`decision-${policy.capability}`"
                                    :value="decision.value"
                                    :data-decision="decision.value"
                                    :checked="policy.decision === decision.value"
                                    :disabled="decision.value === 'allow' && highRisk(policy) && acknowledgedRisk[policy.capability] !== true"
                                    @change="changeDecision(policy, decision.value)"
                                >
                                <span class="block px-3 py-2 text-center text-xs font-semibold text-[var(--talos-muted)] outline-none peer-checked:bg-[var(--talos-active)] peer-checked:text-[var(--talos-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-[var(--talos-ring-soft)]">
                                    {{ decision.label }}
                                </span>
                            </label>
                        </div>
                        <label v-if="highRisk(policy)" class="mt-2 flex max-w-xs cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                            <input v-model="acknowledgedRisk[policy.capability]" type="checkbox" class="mt-1 accent-[var(--talos-accent)]" :disabled="loading || mutating" :aria-label="`Acknowledge ${policy.capability} risk`">
                            I understand that Allow grants ongoing {{ policy.risk }}-risk access.
                        </label>
                    </fieldset>
                </div>

                <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--talos-border)] pt-3">
                    <div class="text-[11px] text-[var(--talos-muted)]">
                        Updated: {{ formatDate(policy.updated_at) }} · Last used: {{ formatDate(policy.last_used_at) }}
                    </div>
                    <Button type="button" size="sm" variant="outline" :disabled="loading || mutating" :aria-label="`Create grant for ${policy.capability}`" @click="openGrantForm(policy)">
                        <Plus class="h-3.5 w-3.5" />
                        Grant access
                    </Button>
                </div>

                <div v-if="grantsFor(policy.capability).length" class="mt-3 space-y-2" :aria-label="`${label(policy)} grants`">
                    <div v-for="grant in grantsFor(policy.capability)" :key="grant.id" class="flex flex-col gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div class="min-w-0 text-xs text-[var(--talos-muted)]">
                            <div class="flex flex-wrap items-center gap-2">
                                <KeyRound class="h-3.5 w-3.5 text-[var(--talos-accent)]" />
                                <span class="font-mono text-[var(--talos-text)]">{{ grant.scope }}</span>
                                <Chip :code="grant.status" />
                                <span>{{ grant.actions.join(', ') }}</span>
                            </div>
                            <div class="mt-1">Granted {{ formatDate(grant.granted_at) }}<span v-if="grant.expires_at"> · Expires {{ formatDate(grant.expires_at) }}</span></div>
                        </div>
                        <Button v-if="grant.status === 'active'" type="button" variant="ghost" size="icon" :disabled="loading || mutating" :aria-label="`Revoke grant ${grant.id}`" @click="revoke(grant.id)">
                            <Trash2 class="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <form v-if="grantCapability === policy.capability" data-testid="talos-capability-grant-form" class="mt-4 space-y-3 rounded-md border border-[var(--talos-accent)]/40 bg-[var(--talos-panel)] p-3" @submit.prevent="submitGrant">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-sm font-semibold text-[var(--talos-text)]">New grant</div>
                            <p class="mt-0.5 text-xs text-[var(--talos-muted)]">Grant a bounded action set without changing the baseline decision.</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" aria-label="Close grant form" @click="closeGrantForm"><X class="h-4 w-4" /></Button>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                        <label class="block">
                            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Scope</span>
                            <TalosThemedSelect :model-value="grantScope" class="mt-2" :items="grantScopes" aria-label="Capability grant scope" @update:model-value="updateGrantScope" />
                        </label>
                        <label class="block">
                            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Tool ID (optional)</span>
                            <Input v-model="grantToolId" class="mt-2" aria-label="Grant tool identifier" placeholder="tool-id" />
                        </label>
                        <label v-if="grantScope === 'session'" class="block">
                            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Session ID</span>
                            <Input v-model="grantScopeId" class="mt-2" aria-label="Session identifier" />
                        </label>
                        <label v-if="grantScope === 'session'" class="block">
                            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">TTL seconds</span>
                            <Input v-model.number="grantTtl" type="number" min="60" max="86400" class="mt-2" aria-label="Session grant TTL seconds" />
                        </label>
                        <label v-if="grantScope === 'device'" class="block sm:col-span-2">
                            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Device ID</span>
                            <Input v-model="grantScopeId" class="mt-2" aria-label="Device identifier" placeholder="trusted-device-id" />
                        </label>
                    </div>

                    <fieldset>
                        <legend class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Granted actions</legend>
                        <div class="mt-2 flex flex-wrap gap-3">
                            <label v-for="action in policy.actions" :key="action" class="flex cursor-pointer items-center gap-2 text-xs text-[var(--talos-text)]">
                                <input type="checkbox" class="accent-[var(--talos-accent)]" :checked="grantActions.includes(action)" @change="toggleGrantAction(action, ($event.target as HTMLInputElement).checked)">
                                {{ action }}
                            </label>
                        </div>
                    </fieldset>

                    <label v-if="selectedPolicyRequiresAck" class="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-2 text-xs leading-5 text-[var(--talos-text)]">
                        <input v-model="grantRiskAcknowledged" type="checkbox" class="mt-1 accent-[var(--talos-accent)]" aria-label="Acknowledge grant risk">
                        I explicitly approve this {{ policy.risk }}-risk grant and its selected scope.
                    </label>

                    <div class="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" @click="closeGrantForm">Cancel</Button>
                        <Button data-testid="talos-capability-grant-submit" type="submit" size="sm" :disabled="!canSubmitGrant || loading || mutating">
                            <Loader2 v-if="operationPending(`grant:${policy.capability}`)" class="h-4 w-4 animate-spin" />
                            <Plus v-else class="h-4 w-4" />
                            Create grant
                        </Button>
                    </div>
                </form>
            </article>
        </div>

        <div v-else-if="loadState === 'error'" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-4 text-sm text-[var(--talos-text)]">
            <div class="flex items-center gap-2 font-semibold"><ShieldAlert class="h-4 w-4" /> Capability policy unavailable</div>
            <p class="mt-1 text-xs leading-5">TALOS will not display or mutate unverified authorization state.</p>
        </div>
    </section>
</template>
