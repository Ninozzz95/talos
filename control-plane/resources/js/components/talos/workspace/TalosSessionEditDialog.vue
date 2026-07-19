<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '../../ui/Button.vue'
import Input from '../../ui/Input.vue'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog'
import { sessionChatState } from '../../../composables/useTalosSessions'
import type { TalosSession } from '../../../lib/talosTypes'

const props = defineProps<{
    open: boolean
    mode: 'rename' | 'move'
    session: TalosSession | null
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    submit: [value: string]
}>()

const value = ref('')

const title = computed(() => props.mode === 'rename' ? 'Rename chat' : 'Move to folder')
const description = computed(() => props.mode === 'rename'
    ? 'Give this chat a name you will recognize later.'
    : 'Chats in the same folder are grouped together in the sidebar.')
const fieldLabel = computed(() => props.mode === 'rename' ? 'Chat name' : 'Folder name')
const submitLabel = computed(() => props.mode === 'rename' ? 'Save' : 'Move')

watch(() => [props.open, props.mode, props.session?.id], () => {
    if (!props.open || !props.session) return
    value.value = props.mode === 'rename'
        ? (props.session.title || 'Untitled chat')
        : sessionChatState(props.session).folder
}, { immediate: true })

function close() {
    emit('update:open', false)
}

function submit() {
    const trimmed = value.value.trim()
    if (props.mode === 'rename' && !trimmed) return
    emit('submit', trimmed)
    close()
}
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="max-w-sm">
            <DialogHeader>
                <DialogTitle>{{ title }}</DialogTitle>
                <DialogDescription>{{ description }}</DialogDescription>
            </DialogHeader>
            <form id="talos-session-edit-form" class="grid gap-3" @submit.prevent="submit">
                <label class="talos-type-label text-[var(--talos-text)]" for="talos-session-edit-value">{{ fieldLabel }}</label>
                <Input
                    id="talos-session-edit-value"
                    v-model="value"
                    :placeholder="fieldLabel"
                    autocomplete="off"
                />
                <DialogFooter class="gap-2">
                    <Button type="button" variant="outline" size="sm" @click="close">Cancel</Button>
                    <Button type="submit" size="sm">{{ submitLabel }}</Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
</template>
