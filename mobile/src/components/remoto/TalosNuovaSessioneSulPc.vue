<script setup lang="ts">
/**
 * Una sessione nuova sul PC, nella cartella scelta. Estratto così com'era dal dettaglio del computer (`ComputerItemScreen.vue`,
 * R-M4 Q2, owner 20/10/2026 «Sì, fra le cartelle ammesse») quando il mockup remoto approvato il 23/10 (tavole 2-3) ha tolto le
 * sessioni dalle Impostazioni del PC: ora si apre dal pulsante in basso della lista del Codice filtrata su quel PC. Con la tavola 4
 * (cartelle recenti e consenso del PC) cambierà questo componente, non chi lo apre.
 * Le cartelle sono quelle che il PC apre al dispositivo (`projects.list`: id e nome, mai il percorso). Preselezionata quella della
 * sessione più recente del PC (`progetto`), se c'è. «Apri la sessione» porta al Codice del PC con la cartella: il primo messaggio
 * crea la sessione lì.
 */
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { ATTESA_CONTROLLO_MS, useComputerRemoti, type CartellaDelPc } from '@/lib/remoto/computerRemoti'
import { fraseErroreRemoto } from '@/lib/remoto/frasiRemoto'

const props = defineProps<{ pcId: string, nome: string, progettoRecente: string | null }>()
const emit = defineEmits<{ chiudi: [] }>()

const { t, tTesto } = useTalosI18n()
const router = useRouter()
const remoti = useComputerRemoti()

const cartelle = ref<CartellaDelPc[] | null>(null)
const cartellaScelta = ref<string | null>(null)
const errore = ref<string | null>(null)

/** ⛔ RA-12 (revisione avversariale R-M4, 21/10/2026): `cartelle()` apre il ponte senza tetto; qui lo stesso tetto della schermata. */
async function entroIlTetto<T>(lavoro: Promise<T>): Promise<T | { ok: false, code: 'TIMEOUT' }> {
    let tetto: ReturnType<typeof setTimeout> | undefined
    const scaduto = new Promise<{ ok: false, code: 'TIMEOUT' }>((fatto) => {
        tetto = setTimeout(() => fatto({ ok: false, code: 'TIMEOUT' }), ATTESA_CONTROLLO_MS)
    })
    try {
        return await Promise.race([lavoro, scaduto])
    } finally {
        clearTimeout(tetto)
    }
}
const fraseDelGuasto = (code: string) => (code === 'TIMEOUT' ? 'computer.errors.timeout' : fraseErroreRemoto(code) ?? 'computer.errors.unreachable')

async function leggi(): Promise<void> {
    if (!remoti) return
    errore.value = null
    const esito = await entroIlTetto(remoti.cartelle(props.pcId))
    if (!esito.ok) {
        errore.value = fraseDelGuasto(esito.code)
        return
    }
    cartelle.value = esito.cartelle
    cartellaScelta.value = esito.cartelle.find((c) => c.nome === props.progettoRecente)?.id ?? null
}
onMounted(leggi)

function apri(): void {
    if (!cartellaScelta.value) return
    void router.push({ name: 'computer-codice', params: { pcId: props.pcId }, query: { cartella: cartellaScelta.value } })
    emit('chiudi')
}

/** Frecce dentro il gruppo (come `TalosCodiceR4ModoSheet`): il fuoco passa alla riga vicina, la scelta resta un tocco o Invio/Spazio. */
async function frecce(evento: KeyboardEvent): Promise<void> {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(evento.key)) return
    const righe = [...(evento.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    const i = righe.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    evento.preventDefault()
    await nextTick()
    righe[(i + (evento.key === 'ArrowDown' || evento.key === 'ArrowRight' ? 1 : -1) + righe.length) % righe.length].focus()
}
</script>

<template>
    <TalosMobileConfirmDialog :title="tTesto('harness.newSessionOn', { name: nome })" @close="emit('chiudi')">
        <div data-testid="talos-computer-new-session-sheet">
            <p v-if="errore" role="status" class="text-sm text-[var(--talos-muted)]">{{ t(errore) }}</p>
            <p v-else-if="cartelle === null" role="status" class="text-sm text-[var(--talos-muted)]">{{ t('computer.checking') }}</p>
            <p v-else-if="!cartelle.length" role="status" class="text-sm text-[var(--talos-muted)]">{{ t('computer.noFolders') }}</p>
            <template v-else>
                <h3 id="talos-computer-folders-title" class="text-sm font-medium text-[var(--talos-text)]">{{ t('computer.folders') }}</h3>
                <div role="radiogroup" aria-labelledby="talos-computer-folders-title" class="mt-1.5 flex flex-col gap-1.5" @keydown="frecce">
                    <button
                        v-for="(c, i) in cartelle"
                        :key="c.id"
                        type="button"
                        role="radio"
                        data-testid="talos-computer-folder"
                        :aria-checked="cartellaScelta === c.id ? 'true' : 'false'"
                        :tabindex="cartellaScelta === c.id || (!cartellaScelta && i === 0) ? 0 : -1"
                        class="talos-pressable flex min-h-touch w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm text-[var(--talos-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--talos-ring)]"
                        :class="cartellaScelta === c.id ? 'border-[var(--talos-accent)] bg-[color-mix(in_srgb,var(--talos-accent)_14%,var(--talos-panel))]' : 'border-[var(--talos-border)] bg-[var(--talos-panel)]'"
                        @click="cartellaScelta = c.id"
                    >
                        <span
                            class="inline-flex size-[1.125rem] shrink-0 rounded-full border"
                            :class="cartellaScelta === c.id ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] shadow-[inset_0_0_0_3px_var(--talos-panel)]' : 'border-[var(--talos-border)]'"
                            aria-hidden="true"
                        />
                        <!-- D-MOCK-12, tavola 4: la cartella madre solo fra due nomi uguali; la nota solo se il PC non l'ha ancora consentita -->
                        <span class="flex min-w-0 flex-1 flex-col">
                            <span class="truncate">{{ c.nome }} <span v-if="c.dettaglio" class="text-[var(--talos-muted)]">{{ c.dettaglio }}</span></span>
                            <span v-if="!c.consentita" data-testid="talos-computer-folder-first-time" class="text-xs leading-5 text-[var(--talos-muted)]">{{ t('computer.consent.firstTime') }}</span>
                        </span>
                    </button>
                </div>
            </template>
            <Button
                v-if="errore"
                type="button"
                variant="outline"
                data-testid="talos-computer-folders-retry"
                class="talos-pressable mt-[var(--talos-space-inline)] min-h-touch"
                @click="leggi()"
            >
                {{ t('computer.retry') }}
            </Button>
        </div>
        <template #footer>
            <!-- ⛔ RA-13 (revisione avversariale R-M4, 21/10/2026): «Annulla» anche senza cartelle, se no la persona restava bloccata -->
            <Button type="button" variant="ghost" data-testid="talos-computer-folders-cancel" class="min-h-touch" @click="emit('chiudi')">{{ t('common.cancel') }}</Button>
            <Button
                v-if="cartelle?.length"
                type="button"
                data-testid="talos-computer-open-session"
                class="min-h-touch"
                :disabled="!cartellaScelta"
                @click="apri()"
            >
                {{ t('computer.openSession') }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>
</template>
