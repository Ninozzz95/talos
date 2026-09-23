<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { useChatController } from '@/stores/chatController'
import { useTalosI18n } from '@/i18n'

const props = defineProps<{ messageId: string; lastMessageId: string; hasLater: boolean }>()
const emit = defineEmits<{ close: [] }>()
const controller = useChatController()
const sessionId = controller.chat.activeSession.value?.id
const { t } = useTalosI18n()
const busy = ref(false)
const error = ref('')
async function edit(): Promise<void> {
    if (busy.value || !sessionId) return
    busy.value = true
    error.value = ''
    try {
        await controller.editUserMessage(sessionId, props.messageId, props.lastMessageId)
        emit('close')
    } catch {
        error.value = t('chat.editMessageFailed')
    } finally {
        busy.value = false
    }
}
onMounted(() => { if (!props.hasLater) void edit() })
</script>

<template>
    <TalosMobileConfirmDialog
        v-if="hasLater || error"
        :title="$t('chat.editMessage')"
        :description="$t(hasLater ? 'chat.editMessageConfirm' : 'chat.editMessageDraft')"
        @close="busy ? undefined : emit('close')"
    >
        <p v-if="error" role="alert" data-testid="talos-message-edit-error">{{ error }}</p>
        <template #footer>
            <Button variant="outline" data-testid="talos-message-edit-cancel" :disabled="busy" @click="emit('close')">{{ $t('common.cancel') }}</Button>
            <Button data-testid="talos-message-edit-confirm" :disabled="busy" @click="edit">{{ $t('chat.editMessage') }}</Button>
        </template>
    </TalosMobileConfirmDialog>
</template>
