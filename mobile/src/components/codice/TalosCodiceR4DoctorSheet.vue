<script setup lang="ts">
/**
 * ⛔ K3-C2b (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): il foglio «Doctor» del Codice su r4. Le voci sono quelle del
 * Doctor del desktop (`controlliDoctorR4`, copia fissata di r4 `doctor.js` provata contro il golden), con le sue parole: esito in una
 * riga, voci ordinate per gravità (Guasto, Avviso, Nota, OK), «Ricontrolla». Sul telefono la shell è «sul dispositivo».
 */
import { computed, onMounted, ref } from 'vue'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosRigaInCorso from '@/components/chat/TalosRigaInCorso.vue'
import { useTalosSogliaSecondi } from '@/composables/useTalosSogliaSecondi'
import { useTalosI18n } from '@/i18n'
import { ErroreDoctorR4, controlliDoctorR4, esitoDoctorR4, gravitaDoctorR4, testoDoctorR4, type GravitaDoctorR4, type VoceDoctorR4 } from '@/lib/harness/r4/doctorR4'
import './codiceR4.css'

const props = defineProps<{ carica: () => Promise<unknown> }>()
const emit = defineEmits<{ close: [] }>()
const { locale } = useTalosI18n()

const stato = ref<'carica' | 'pronto' | 'guasto' | 'non-valida'>('carica')
const risposta = ref<unknown>(null)
const motivo = ref('')
// «Ricontrolla» rimette `carica`: l'attesa ricomincia da zero
const { inizio: inizioAttesa, chiave: chiaveAttesa } = useTalosSogliaSecondi({ attivo: () => stato.value === 'carica' })

/** Le voci nella lingua di adesso: se la lingua cambia, il Doctor la segue senza rileggere r4. */
const voci = computed<VoceDoctorR4[]>(() => {
    if (stato.value !== 'pronto') return []
    try { return controlliDoctorR4(risposta.value, locale.value) } catch { return [] }
})
const esito = computed(() => esitoDoctorR4(voci.value, locale.value))
const testoDoctor = (chiave: string) => testoDoctorR4(chiave, locale.value)

const ICONE: Record<GravitaDoctorR4, typeof Info> = { danger: CircleAlert, warning: TriangleAlert, info: Info, success: CircleCheck }

async function controlla(): Promise<void> {
    stato.value = 'carica'
    const dati = await props.carica()
    if (dati === null || dati === undefined) {
        stato.value = 'guasto'
        return
    }
    try {
        controlliDoctorR4(dati, locale.value)
        risposta.value = dati
        stato.value = 'pronto'
    } catch (errore) {
        motivo.value = errore instanceof ErroreDoctorR4 ? errore.message : testoDoctor('varie.doctor.error.invalidResponse')
        stato.value = 'non-valida'
    }
}

onMounted(controlla)
</script>

<template>
    <TalosMobileComposerSheet :title="$t('harness.r4Doctor')" testid="talos-codice-r4-doctor-foglio" @close="emit('close')">
        <div class="flex flex-col gap-2 pb-2">
            <!-- owner 29/10 sera (mockup «Caricamenti vivi» v6): la rotella arancione accanto al testo, i secondi dopo 2 s; la regione
                 `status` è quella della riga (un `div`: la riga è un blocco e non sta dentro un `p`) -->
            <div v-if="stato === 'carica'" class="talos-codice-r4-nota">
                <TalosRigaInCorso :key="chiaveAttesa" compatta segno="giro" :testo="testoDoctor('varie.doctor.summary.checking')" :inizio="inizioAttesa" />
            </div>
            <p v-else-if="stato === 'guasto'" class="talos-codice-r4-nota" role="alert">{{ $t('harness.r4LoadFailed') }}</p>
            <p v-else-if="stato === 'non-valida'" class="talos-codice-r4-nota" role="alert">{{ motivo }}</p>
            <p v-else class="talos-codice-r4-nota" role="status">{{ esito }}</p>
            <ul v-if="voci.length" class="talos-codice-r4-elenco" role="list">
                <li v-for="voce in voci" :key="voce.id" :data-doctor-id="voce.id" :data-gravita="voce.gravita" class="talos-codice-r4-voce-doctor">
                    <component :is="ICONE[voce.gravita]" class="talos-codice-r4-doctor-icona" aria-hidden="true" />
                    <span class="talos-codice-r4-azione-testo">
                        <strong>{{ voce.titolo }}</strong>
                        <small class="talos-codice-r4-doctor-gravita">{{ gravitaDoctorR4(voce.gravita, locale) }}</small>
                        <small v-for="(riga, i) in voce.righe" :key="i" class="break-words [overflow-wrap:anywhere]">{{ riga }}</small>
                    </span>
                </li>
            </ul>
            <div class="flex justify-end px-3">
                <button
                    type="button"
                    data-testid="talos-codice-r4-doctor-ancora"
                    class="talos-pressable min-h-touch rounded-full border border-[var(--talos-border)] px-4 text-sm text-[var(--talos-text)] disabled:opacity-50"
                    :disabled="stato === 'carica'"
                    @click="controlla"
                >{{ stato === 'carica' ? testoDoctor('varie.doctor.refresh.checking') : testoDoctor('varie.doctor.refresh.checkAgain') }}</button>
            </div>
        </div>
    </TalosMobileComposerSheet>
</template>
