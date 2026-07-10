<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Camera, Globe2, ScanSearch, X } from '@lucide/vue'
import Button from '../../../ui/Button.vue'
import Input from '../../../ui/Input.vue'
import { useTalosBrowse } from '../../../../composables/useTalosBrowse'

const {
    activeSession, events, latestScreenshot, latestSnapshot,
    loadingCollection, loadingSession, mutating,
    collectionError, sessionError, mutationError,
    loadSessions, selectSession, createSession, navigate, captureScreenshot, captureSnapshot, closeSession,
} = useTalosBrowse()
const url = ref('')
const canOperate = computed(() => Boolean(activeSession.value && !['closed', 'expired', 'failed'].includes(activeSession.value.status)))
const canNavigate = computed(() => canOperate.value && activeSession.value?.capabilities.includes('navigate'))
const canCaptureScreenshot = computed(() => canOperate.value && activeSession.value?.capabilities.includes('screenshot'))
const canCaptureSnapshot = computed(() => canOperate.value && activeSession.value?.capabilities.includes('snapshot'))
const terminal = computed(() => ['closed', 'expired', 'failed'].includes(activeSession.value?.status ?? ''))

onMounted(() => { void loadSessions().then((sessions) => sessions[0] && selectSession(sessions[0].id)).catch(() => undefined) })

async function start() { await createSession().catch(() => undefined) }
async function submitNavigate() { await navigate(url.value).catch(() => undefined) }
</script>

<template>
    <section data-testid="talos-browse-panel" class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div v-if="collectionError || sessionError || mutationError" role="alert" class="border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-3 py-2 text-sm text-[var(--talos-danger)]">
            {{ mutationError ?? sessionError ?? collectionError }}
        </div>
        <div v-if="!activeSession" class="flex flex-1 flex-col items-start justify-center gap-3 text-sm text-[var(--talos-muted)]">
            <p>No read-only browser session is active.</p>
            <Button :disabled="mutating || loadingCollection || loadingSession" @click="start"><Globe2 class="size-4" />Start session</Button>
        </div>
        <template v-else>
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span class="border border-[var(--talos-border)] px-2 py-1 font-semibold uppercase text-[var(--talos-muted)]">{{ activeSession.status }}</span>
                <span class="text-[var(--talos-muted)]">{{ activeSession.mode }}: {{ activeSession.capabilities.join(', ') }}</span>
            </div>
            <div v-if="terminal" class="flex items-center justify-between gap-2 border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-2 text-sm"><span>This session is {{ activeSession.status }}.</span><Button size="sm" @click="start">Restart session</Button></div>
            <form class="flex gap-2" @submit.prevent="submitNavigate">
                <Input v-model="url" aria-label="Browser URL" type="url" placeholder="https://" :disabled="!canNavigate || mutating" />
                <Button type="submit" size="sm" :disabled="!url || !canNavigate || mutating">Navigate</Button>
            </form>
            <div class="text-sm"><div class="font-medium">{{ activeSession.current_title || 'No page loaded' }}</div><div class="truncate text-xs text-[var(--talos-muted)]">{{ activeSession.current_url || 'Navigate to a permitted public URL.' }}</div></div>
            <div class="flex flex-wrap gap-2"><Button size="sm" variant="secondary" :disabled="!canCaptureScreenshot || mutating" @click="captureScreenshot().catch(() => undefined)"><Camera class="size-4" />Capture screenshot</Button><Button size="sm" variant="secondary" :disabled="!canCaptureSnapshot || mutating" @click="captureSnapshot().catch(() => undefined)"><ScanSearch class="size-4" />Capture snapshot</Button><Button size="sm" variant="destructive" :disabled="terminal || mutating" @click="closeSession().catch(() => undefined)"><X class="size-4" />Close</Button></div>
            <div data-testid="talos-browse-scroll-region" class="min-h-20 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
            <img v-if="latestScreenshot" :src="latestScreenshot" alt="Browser screenshot evidence" class="max-h-48 w-full border border-[var(--talos-border)] object-contain" />
            <section v-if="latestSnapshot" class="max-h-48 overflow-auto border border-[var(--talos-border)] p-2 text-xs">
                <div class="mb-2 font-semibold text-[var(--talos-warning)]">Untrusted snapshot evidence</div>
                <div class="mb-2 text-[var(--talos-muted)]">{{ latestSnapshot.snapshot.text_digest }}</div>
                <div v-for="node in latestSnapshot.snapshot.nodes" :key="node.ref" class="border-t border-[var(--talos-border)] py-1">{{ node.role }} {{ node.name }} <span class="text-[var(--talos-muted)]">{{ node.ref }}{{ node.level ? ` level ${node.level}` : '' }}</span></div>
            </section>
            <section class="border-t border-[var(--talos-border)] pt-2 text-xs"><div class="mb-1 font-semibold">Persisted events</div><div v-for="event in events" :key="event.id" class="py-1">{{ event.type ?? event.event_type }} <span class="text-[var(--talos-muted)]">{{ event.created_at }}</span></div></section>
            </div>
        </template>
    </section>
</template>
