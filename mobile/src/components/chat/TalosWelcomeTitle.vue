<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useTalosWelcome } from '@/composables/useTalosWelcome'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'

const { locale, t } = useTalosI18n()
const { chat } = useChatController()
const TalosWelcomeEasterEgg = defineAsyncComponent(
    () => import('@/components/chat/TalosWelcomeEasterEgg.vue'),
)
const sessionId = computed(() => chat.activeSession.value?.id ?? null)
const {
    title,
    easterEgg,
} = useTalosWelcome({
    locale,
    sessionId,
    fallbackTitle: () => t('chat.welcomeHeadline'),
})
</script>

<template>
    <h1 class="talos-welcome-title">
        <TalosWelcomeEasterEgg
            v-if="easterEgg"
            :kind="easterEgg"
        />
        {{ title }}
    </h1>
</template>
