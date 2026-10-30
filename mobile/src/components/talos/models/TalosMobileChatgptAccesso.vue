<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ExternalLink, Loader2, MoreHorizontal } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import { talosChatgpt } from '@/services/chatgptAccesso'
import { talosConsumiChatgpt } from '@/services/chatgptConsumi'
import { openTalosLinkOnce } from '@/services/inAppBrowserService'

/**
 * N15 — «Continue with ChatGPT» nel pannello di OpenAI, come nel mockup approvato dall'owner il 12/10/2026
 * (`mobile/mockup/n15`): stato, pulsante a tutta larghezza, attesa con «Annulla», account collegato con «Gestisci
 * l'utilizzo», uscita con conferma. ⛔ Azioni sempre una sotto l'altra, mai affiancate (regola dell'owner).
 *
 * ⛔ Nessuna funzione finta: finché il fornitore del piano non è collegato alla chat (fetta 5 del ledger), lo dice una
 * riga in chiaro. Qui si collega e si scollega l'ACCOUNT, davvero: ascolto su 127.0.0.1, scheda, scambio, Keystore.
 *
 * Il servizio arriva come proprietà solo per le prove; di serie è l'istanza unica dell'app.
 */
type ServizioIntero = ReturnType<typeof talosChatgpt>
type Servizio = Pick<ServizioIntero, 'stato' | 'accedi' | 'annulla' | 'esci'> & Partial<Pick<ServizioIntero, 'riprendi' | 'quandoCambia'>>
type Esito = Awaited<ReturnType<ServizioIntero['accedi']>>
type Conto = Pick<ReturnType<typeof talosConsumiChatgpt>, 'benvenutoDaMostrare' | 'segnaBenvenuto' | 'azzera'>
/**
 * ⛔ CHATGPT NEL CODICE (ledger `LEDGER-CHATGPT-NEL-CODICE-2026-10-18.md`): l'accesso è uno, quello della chat; uscendo, anche il
 * Codice lo perde (r4, se è acceso, dimentica il token). Di serie a richiesta, come il resto del Codice; nelle prove, finto.
 */
async function dimenticaNelCodiceDiSerie(): Promise<void> {
    const [{ talosR4Acceso }, { talosClienteR4 }, { dimenticaAccessoChatgptR4 }] = await Promise.all([
        import('@/lib/harness/terminalePonte'), import('@/lib/harness/r4/clienteR4'), import('@/lib/harness/r4/modelloR4'),
    ])
    await dimenticaAccessoChatgptR4(talosR4Acceso, talosClienteR4)
}
const props = withDefaults(defineProps<{
    servizio?: Servizio, apri?: (indirizzo: string) => Promise<unknown>, consumi?: Conto, dimenticaNelCodice?: () => Promise<void>,
}>(), {
    servizio: undefined,
    apri: undefined,
    consumi: undefined,
    dimenticaNelCodice: undefined,
})
/** `cambiato`: lo stato del piano può essere diverso (accesso riuscito, uscita); chi sta sopra lo rilegge. */
const emit = defineEmits<{ cambiato: [] }>()
const { t } = useTalosI18n()
const servizio = (): Servizio => props.servizio ?? talosChatgpt()
const conto = (): Conto => props.consumi ?? talosConsumiChatgpt()

const stato = ref<Awaited<ReturnType<Servizio['stato']>> | null>(null)
/** L'accesso partito da QUESTO riquadro, finché la sua chiamata non torna. */
const avviato = ref(false)
/**
 * ⛔ Revisione 13/10/2026 (E1): «in attesa» è ciò che dice il SERVIZIO, non solo ciò che ricorda il riquadro. Il riquadro si
 * smonta quando la sezione di OpenAI si richiude: rimontato, non sapeva più dell'accesso in corso e mostrava «Continue with
 * ChatGPT» senza «Annulla», con la porta e la notifica ancora vive.
 */
const inAttesa = computed(() => avviato.value || stato.value?.accessoInCorso === true)
const inUscita = ref(false)
const chiedeConferma = ref(false)
const errore = ref<string | null>(null)
const avviso = ref<string | null>(null)
/**
 * Il benvenuto del mockup approvato, con le parole ufficiali: una volta sola per ACCOUNT, dopo un accesso che ha davvero
 * abilitato il piano. `null` = chiuso; altrimenti l'account a cui è mostrato (serve a segnarlo come letto).
 */
const benvenuto = ref<{ email: string | null } | null>(null)
async function forseBenvenuto(esito: Esito): Promise<void> {
    if (!esito.ok || !esito.pianoAbilitato || benvenuto.value) return
    if (await conto().benvenutoDaMostrare(esito.email)) benvenuto.value = { email: esito.email }
}
function capito(): void {
    const chi = benvenuto.value
    benvenuto.value = null
    if (chi) void conto().segnaBenvenuto(chi.email)
}

async function aggiorna(): Promise<void> {
    try { stato.value = await servizio().stato() } catch { stato.value = null }
}

/** I guasti che hanno una frase loro (EN+IT in `chatgptPlan.errors`); ogni altro dice il suo codice, mai niente di inventato. */
const GUASTI_CON_FRASE = new Set(['CHATGPT_ACCESSO_NEGATO', 'CHATGPT_BROWSER', 'CHATGPT_PORTA', 'CHATGPT_RETE', 'CHATGPT_ALTRO_ACCOUNT',
    'CHATGPT_STATO_DIVERSO', 'CHATGPT_CUSTODIA_FALLITA', 'CHATGPT_TEMPO_SCADUTO', 'CHATGPT_CUSTODIA_ILLEGGIBILE', 'CHATGPT_ASCOLTO_INTERROTTO'])
function fraseDelGuasto(codice: string): string {
    return GUASTI_CON_FRASE.has(codice) ? t(`chatgptPlan.errors.${codice}`) : t('chatgptPlan.errors.other', { code: codice })
}
/** Dice l'esito di un accesso. «Annullato» l'ha voluto la persona: non è un errore da mostrarle. */
function mostra(esito: Esito): void {
    errore.value = !esito.ok && esito.codice !== 'CHATGPT_ACCESSO_ANNULLATO' ? fraseDelGuasto(esito.codice) : null
}

/** Il servizio dice che un accesso è partito o finito (anche uno partito da un riquadro che non c'è più), o che si è usciti. */
async function quandoIlServizioCambia(esito?: Esito): Promise<void> {
    if (esito) { mostra(esito); void forseBenvenuto(esito) }
    await aggiorna()
    emit('cambiato')
}

/**
 * ⭐ Revisione 13/10/2026 (A5): dopo un'attività ricreata la pagina è nuova e l'accesso è rimasto a metà. Si chiede al
 * servizio di riprenderlo al montaggio e ogni volta che la pagina torna visibile; «niente da riprendere» non mostra niente.
 */
async function riprendi(): Promise<void> {
    const esito = await servizio().riprendi?.().catch(() => null)
    if (!esito) return
    mostra(esito)
    void forseBenvenuto(esito)
    await aggiorna()
    emit('cambiato')
}
function quandoTorna(): void {
    if (document.visibilityState === 'visible') void riprendi()
}

let smettiDiAscoltare: (() => void) | undefined
onMounted(() => {
    smettiDiAscoltare = servizio().quandoCambia?.((esito) => { void quandoIlServizioCambia(esito) })
    document.addEventListener('visibilitychange', quandoTorna)
    void aggiorna()
    void riprendi()
})
onBeforeUnmount(() => {
    smettiDiAscoltare?.()
    document.removeEventListener('visibilitychange', quandoTorna)
})

async function accedi(consenso = false): Promise<void> {
    if (inAttesa.value) return
    errore.value = null
    avviso.value = null
    avviato.value = true
    try {
        const esito = await servizio().accedi({ consenso })
        mostra(esito)
        void forseBenvenuto(esito)
    } finally {
        avviato.value = false
        await aggiorna()
        emit('cambiato')
    }
}

async function annulla(): Promise<void> {
    await servizio().annulla()
}

async function esci(): Promise<void> {
    if (inUscita.value) return
    inUscita.value = true
    try {
        const { revocaConfermata } = await servizio().esci()
        // il conto locale era di quell'account
        conto().azzera()
        // un r4 che non risponde non ferma l'uscita: il giro dopo chiede il token al custode, che dice «non collegato» e lo toglie
        void (props.dimenticaNelCodice ?? dimenticaNelCodiceDiSerie)().catch(() => undefined)
        avviso.value = revocaConfermata ? null : t('chatgptPlan.disconnectedHere')
    } finally {
        inUscita.value = false
        chiedeConferma.value = false
        await aggiorna()
        emit('cambiato')
    }
}

function gestisci(): void {
    const indirizzo = stato.value?.consumi
    if (!indirizzo) return
    void (props.apri ?? ((u: string) => openTalosLinkOnce(u, 'system_browser')))(indirizzo)
}
</script>

<template>
    <section
        data-testid="talos-chatgpt-plan"
        :aria-label="t('chatgptPlan.title')"
        class="mb-[var(--talos-space-control)] flex flex-col gap-[var(--talos-space-control)] rounded-[var(--talos-radius-card)] border-2 border-[var(--talos-accent)] bg-[var(--talos-active)] p-[var(--talos-space-card)]"
    >
        <div class="flex flex-col items-start gap-1.5">
            <span class="font-semibold text-[var(--talos-accent)]">{{ t('chatgptPlan.title') }}</span>
            <span class="text-sm text-[var(--talos-text)]">{{ t('chatgptPlan.subtitle') }}</span>
            <span data-testid="talos-chatgpt-status" class="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[var(--talos-surface-2)] px-2 py-0.5 text-xs text-[var(--talos-text)]">
                <span class="size-1.5 rounded-full" :class="stato?.collegato ? 'bg-[var(--talos-success)]' : 'bg-[var(--talos-muted)]'" aria-hidden="true" />
                {{ stato?.collegato ? t('chatgptPlan.connected') : t('chatgptPlan.notConnected') }}
            </span>
        </div>

        <p v-if="errore" data-testid="talos-chatgpt-error" role="alert" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-[var(--talos-space-control)] text-sm text-[var(--talos-text)]">{{ errore }}</p>
        <p v-if="avviso" data-testid="talos-chatgpt-notice" role="status" class="text-sm text-[var(--talos-muted)]">{{ avviso }}</p>

        <!-- In attesa del ritorno dalla scheda -->
        <template v-if="inAttesa">
            <div data-testid="talos-chatgpt-waiting" role="status" class="flex items-start gap-3 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]">
                <Loader2 class="mt-0.5 size-5 shrink-0 animate-spin text-[var(--talos-accent)]" aria-hidden="true" />
                <div>
                    <p class="font-medium text-[var(--talos-text)]">{{ t('chatgptPlan.waiting') }}</p>
                    <p class="mt-1 text-sm text-[var(--talos-muted)]">{{ t('chatgptPlan.waitingHint') }}</p>
                </div>
            </div>
            <Button data-testid="talos-chatgpt-cancel" variant="outline" class="min-h-touch w-full" @click="annulla">{{ t('chatgptPlan.cancel') }}</Button>
        </template>

        <!-- Collegato -->
        <template v-else-if="stato?.collegato">
            <template v-if="chiedeConferma">
                <div data-testid="talos-chatgpt-confirm" class="flex flex-col gap-[var(--talos-space-control)]">
                    <p class="font-semibold text-[var(--talos-text)]">{{ t('chatgptPlan.disconnectTitle') }}</p>
                    <p class="text-sm text-[var(--talos-muted)]">{{ t('chatgptPlan.disconnectBody') }}</p>
                    <Button data-testid="talos-chatgpt-disconnect-yes" variant="destructive" class="min-h-touch w-full" :disabled="inUscita" @click="esci">{{ t('chatgptPlan.disconnectYes') }}</Button>
                    <Button data-testid="talos-chatgpt-disconnect-no" variant="outline" class="min-h-touch w-full" :disabled="inUscita" @click="chiedeConferma = false">{{ t('chatgptPlan.disconnectNo') }}</Button>
                </div>
            </template>
            <template v-else>
                <div>
                    <p v-if="stato.email" data-testid="talos-chatgpt-email" class="break-all font-semibold text-[var(--talos-text)]">{{ stato.email }}</p>
                    <p class="mt-1 text-sm text-[var(--talos-muted)]">{{ stato.pianoAbilitato ? t('chatgptPlan.using') : t('chatgptPlan.signedInNoPlan') }}</p>
                    <p v-if="stato.pianoAbilitato" data-testid="talos-chatgpt-in-chat" class="mt-1 text-xs text-[var(--talos-muted)]">{{ t('chatgptPlan.chatReady') }}</p>
                </div>
                <Button v-if="!stato.pianoAbilitato" data-testid="talos-chatgpt-enable" class="min-h-touch w-full" @click="accedi(true)">{{ t('chatgptPlan.enablePlan') }}</Button>
                <Button data-testid="talos-chatgpt-manage" variant="outline" class="min-h-touch w-full justify-center gap-2" @click="gestisci">
                    {{ t('chatgptPlan.manageUsage') }} <ExternalLink class="size-4" aria-hidden="true" />
                </Button>
                <Button data-testid="talos-chatgpt-disconnect" variant="ghost" class="min-h-touch w-full justify-center gap-2 text-[var(--talos-muted)]" @click="chiedeConferma = true">
                    <MoreHorizontal class="size-4" aria-hidden="true" /> {{ t('chatgptPlan.disconnect') }}
                </Button>
            </template>
        </template>

        <!-- Non collegato -->
        <template v-else>
            <Button data-testid="talos-chatgpt-continue" class="min-h-touch w-full" @click="accedi()">{{ t('chatgptPlan.continueWith') }}</Button>
            <p class="text-sm text-[var(--talos-muted)]">{{ t('chatgptPlan.continueHint') }}</p>
        </template>
    </section>
    <TalosMobileComposerSheet v-if="benvenuto" :title="t('chatgptPlan.welcomeTitle')" testid="talos-chatgpt-welcome" @close="capito">
        <div class="flex flex-col gap-[var(--talos-space-card)] px-4 pb-2">
            <p class="text-[var(--talos-text)]">{{ t('chatgptPlan.welcomeBody') }}</p>
            <p class="text-sm text-[var(--talos-muted)]">
                <button type="button" data-testid="talos-chatgpt-welcome-manage" class="talos-pressable text-[var(--talos-accent)] underline underline-offset-2" @click="gestisci">{{ t('chatgptPlan.manageUsage') }}</button>
                {{ t('chatgptPlan.welcomeTail') }}
            </p>
            <Button data-testid="talos-chatgpt-welcome-ok" class="min-h-touch w-full" @click="capito">{{ t('chatgptPlan.gotIt') }}</Button>
        </div>
    </TalosMobileComposerSheet>
</template>
