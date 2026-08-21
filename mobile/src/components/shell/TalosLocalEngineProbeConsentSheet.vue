<script setup lang="ts">
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'

/**
 * §1-bis della consegna 0.1.18 — la modale automatica, alla PRIMA scelta
 * esplicita di un modello locale col consenso ancora `unset`.
 *
 * Tre uscite reali, non due: «Sì» e «Non ora» sono i due bottoni del piede,
 * come ogni altra conferma dell'app; «Non chiedermelo più» è un link a
 * parte, apposta più piccolo — è un'azione rara e per sempre, e metterla
 * alla pari dei due bottoni principali la renderebbe un terzo tocco
 * accidentale sulla scelta più difficile da disfare a occhio.
 *
 * ⛔ Chiudere con la X, Indietro o lo sfondo (`@close` di
 * `TalosMobileConfirmDialog`) equivale a «Non ora»: NON scrive `declined`.
 * Un ripensamento involontario che diventasse silenziosamente permanente
 * sarebbe esattamente il «no mascherato» che il §1-bis vieta.
 */
const emit = defineEmits<{ decide: ['granted' | 'declined' | 'dismissed'] }>()

const { t } = useTalosI18n()
</script>

<template>
    <!-- ⛔ MISURATO sul Pad il 21/8: `TalosMobileConfirmDialog` disegna dentro
         un `<Teleport>`, e Vue non fa passare gli attributi di ricaduta
         attraverso una radice `<Teleport>` — un `data-testid` passato qui non
         arriva MAI a schermo. Lo stesso vale già per `TalosMobileDeleteChatDialog`,
         che infatti non lo passa: il testid condiviso `talos-confirm-dialog`
         (fisso dentro il componente) più i testid propri di ogni pulsante
         sono l'unica via reale per trovare questa scheda da un test. -->
    <TalosMobileConfirmDialog
        :title="t('privacyPermissions.localEngineProbe.modal.title')"
        :description="t('privacyPermissions.localEngineProbe.modal.body')"
        @close="emit('decide', 'dismissed')"
    >
        <button
            type="button"
            class="talos-pressable self-start rounded text-left text-xs font-medium text-[var(--talos-accent)] underline-offset-2 hover:underline"
            data-testid="talos-local-engine-probe-decline-forever"
            @click="emit('decide', 'declined')"
        >{{ t('privacyPermissions.localEngineProbe.modal.dontAskAgain') }}</button>
        <p class="text-2xs leading-4 text-[var(--talos-muted)]">
            {{ t('privacyPermissions.localEngineProbe.modal.dontAskAgainHint') }}
        </p>

        <template #footer>
            <Button
                type="button"
                variant="ghost"
                data-testid="talos-local-engine-probe-no"
                @click="emit('decide', 'dismissed')"
            >{{ t('privacyPermissions.localEngineProbe.modal.no') }}</Button>
            <Button
                type="button"
                data-testid="talos-local-engine-probe-yes"
                @click="emit('decide', 'granted')"
            >{{ t('privacyPermissions.localEngineProbe.modal.yes') }}</Button>
        </template>
    </TalosMobileConfirmDialog>
</template>
