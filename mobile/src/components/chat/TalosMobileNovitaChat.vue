<script setup lang="ts">
/**
 * ⭐ A3-84 seconda parte (owner 25/09/2026, «finché non la apri») — «nuova risposta» su una chat che ha risposto
 * mentre eri altrove. Accanto allo stato, mai al suo posto: una chat può essere in pausa E avere una risposta nuova.
 *
 * Un pallino d'accento e una parola: il colore da solo non basta (WCAG 1.4.1, «Use of Color»). Le due forme sono
 * quelle di `TalosMobileStatoChat.vue`: `riga` nell'elenco Chat, `pastiglia` nella barra laterale.
 */
import { useTalosI18n } from '@/i18n'

const props = withDefaults(defineProps<{ forma?: 'riga' | 'pastiglia' }>(), { forma: 'riga' })
const { t } = useTalosI18n()
</script>

<template>
    <span
        data-testid="talos-chat-new"
        class="inline-flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap leading-none font-medium text-[var(--talos-accent)]"
        :class="props.forma === 'pastiglia'
            ? 'min-h-5 rounded-[var(--talos-radius-control)] border border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] px-1.5 text-3xs'
            : 'text-2xs'"
    >
        <span class="size-1.5 shrink-0 rounded-full bg-[var(--talos-accent)]" aria-hidden="true" />{{ t('chats.newReply') }}
    </span>
</template>
