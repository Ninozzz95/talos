<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useTalosWelcome } from '@/composables/useTalosWelcome'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'

/**
 * `headline`: il titolo fisso del mockup Calm («Cosa facciamo oggi?», Fase 2
 * del 12/09). Quando c'e', sostituisce la frase a orario, ma l'uovo di Pasqua
 * dei giorni speciali resta dov'era: e' una funzione, non una decorazione, e
 * la UI nuova non nasconde funzioni che ci sono (owner 12/09 16:00).
 */
const props = defineProps<{ headline?: string }>()
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
        {{ props.headline ?? title }}
    </h1>
</template>
