<script setup lang="ts">
import { useTalosI18n } from '@/i18n'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — mentre TALOS riassume, nella conversazione: una frase che dice cosa succede e una
 * barra senza percentuale (la durata non si conosce). Le parole del desktop («Riassumo la conversazione…»).
 */
const { t } = useTalosI18n()
</script>

<template>
    <div role="status" aria-live="polite" data-testid="talos-compaction-progress" class="talos-compaction-progress text-xs leading-5">
        <span>{{ t('chat.compaction.inProgress') }}</span>
        <span class="talos-compaction-bar" aria-hidden="true"><span /></span>
    </div>
</template>

<style scoped>
.talos-compaction-progress {
    display: grid;
    gap: 0.5rem;
    margin-block: 0.75rem;
    color: var(--talos-muted);
}
.talos-compaction-bar {
    position: relative;
    display: block;
    width: min(15rem, 100%);
    height: 2px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--talos-border);
}
.talos-compaction-bar > span {
    position: absolute;
    inset-block: 0;
    left: 0;
    width: 36%;
    border-radius: inherit;
    background: var(--talos-accent);
    animation: talos-compaction-slide 1.4s ease-in-out infinite;
}
@keyframes talos-compaction-slide {
    from { transform: translateX(-100%); }
    to { transform: translateX(280%); }
}
/* ⛔ La regola globale del movimento ridotto (`style.css`) fermerebbe la barra sull'ultimo fotogramma, fuori dal binario. */
@media (prefers-reduced-motion: reduce) {
    .talos-compaction-bar > span {
        animation: none;
        transform: none;
        width: 100%;
        opacity: 0.55;
    }
}
</style>
