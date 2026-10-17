<script setup lang="ts">
/**
 * N15 «Continue with ChatGPT» sul mobile — MOCKUP da approvare (owner 11/10/2026). Pezzi veri del prodotto con dati finti:
 * `TalosMobileComposer`, `TalosMobileComposerSheet`, `Button`, l'icona del fornitore e il tema di serie.
 *
 * Riferimenti approvati sul desktop (`Downloads/handoff-talos-2026-09-27/mockup-*`, `foto-piano-ui-2026-10-11/`):
 * - una schermata OpenAI con due modi, che si configura nel foglio e mai aprendo la card in linea;
 * - nel compositore solo la pastiglia «● ChatGPT plan»;
 * - il pannello sopra il compositore;
 * - il benvenuto una volta sola per account;
 * - la carta del limite con le parole ufficiali.
 * Regole mobile dell'owner: azioni mai affiancate; niente controlli nativi; inglese e italiano; chiaro e scuro; anche in verticale.
 *
 * Scena dall'indirizzo: `?scena=…&tema=dark|light`; la lingua è quella del browser.
 */
import { computed } from 'vue'
import { ExternalLink, Loader2, MoreHorizontal, ShieldCheck } from '@lucide/vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import { Button } from '@/components/ui/button'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

const scena = new URLSearchParams(location.search).get('scena') ?? 'foglio-scollegato'
const it = (navigator.language || 'en').toLowerCase().startsWith('it')

const T = it
    ? {
        fornitori: 'Provider e accessi', fornitoriSotto: 'Chiavi, accessi e stato dei provider.',
        openaiRiassunto: 'Piano ChatGPT: non collegato · Chiave API: nessuna', openaiCollegato: 'Piano ChatGPT: collegato · Chiave API: nessuna',
        configura: 'Configura OpenAI', piano: 'Piano ChatGPT', pianoSotto: 'Usa il tuo abbonamento ChatGPT Plus o Pro.',
        chiave: 'Chiave API', chiaveSotto: 'Paghi quello che usi, dal tuo account della piattaforma OpenAI.',
        nonCollegato: 'Non collegato', collegato: 'Collegato', nessunaChiave: 'Nessuna chiave salvata',
        continua: 'Continue with ChatGPT',
        continuaSotto: 'Si apre chatgpt.com in una scheda del browser dentro TALOS. La tua password non passa mai da TALOS.',
        attesa: 'In attesa di ChatGPT…', attesaSotto: 'Finisci l\'accesso nella scheda del browser. TALOS resta in ascolto e riprende da solo quando torni.',
        notifica: 'Notifica di Android mentre aspetti: «TALOS sta aspettando l\'accesso a ChatGPT»', annulla: 'Annulla l\'accesso',
        email: 'tu@example.com', usoSotto: 'Stai usando il piano ChatGPT: le richieste ai modelli ChatGPT le paga il tuo abbonamento.',
        gestisci: 'Gestisci l\'utilizzo', altro: 'Altro', scollega: 'Scollega il piano ChatGPT',
        scollegaTitolo: 'Scollegare il piano ChatGPT?',
        scollegaSotto: 'TALOS revoca l\'accesso e cancella i token da questo telefono. Le chat restano. Puoi ricollegarti quando vuoi.',
        scollegaSi: 'Scollega', scollegaNo: 'Resta collegato',
        benvenuto: 'Stai usando il tuo piano ChatGPT', benvenutoSotto: 'L’utilizzo idoneo in questa app usa il tuo piano ChatGPT.',
        benvenutoLink: 'Gestisci l\'utilizzo', benvenutoCoda: 'nelle impostazioni di ChatGPT.', capito: 'Ho capito',
        pastiglia: 'Piano ChatGPT', pannelloTitolo: 'Stai usando il piano ChatGPT', ore5: 'Ultime 5 ore', giorni7: 'Ultimi 7 giorni',
        ore5Val: '2 richieste · 26,4 k token', giorni7Val: '5 richieste · 61,2 k token',
        pannelloNota: 'Contato da TALOS su questo telefono. L\'uso da ChatGPT o da altri programmi non è incluso: i numeri di OpenAI stanno in «Gestisci l\'utilizzo».',
        utente: 'Riassumimi il capitolo 3 del documento che ti ho mandato.', limite: 'Limite d’uso raggiunto',
        limiteSotto: 'Controlla il tuo piano o il limite di questa app nelle impostazioni di ChatGPT.',
        limiteAttesa: 'Riprende da solo alle 18:30 (tentativo 1 di 9).', ferma: 'Ferma l\'attesa',
    }
    : {
        fornitori: 'Providers and access', fornitoriSotto: 'Keys, sign-ins and provider status.',
        openaiRiassunto: 'ChatGPT plan: not connected · API key: none', openaiCollegato: 'ChatGPT plan: connected · API key: none',
        configura: 'Configure OpenAI', piano: 'ChatGPT plan', pianoSotto: 'Use your ChatGPT Plus or Pro subscription.',
        chiave: 'API key', chiaveSotto: 'Pay for what you use, from your OpenAI platform account.',
        nonCollegato: 'Not connected', collegato: 'Connected', nessunaChiave: 'No key saved',
        continua: 'Continue with ChatGPT',
        continuaSotto: 'Opens chatgpt.com in a browser tab inside TALOS. Your password never passes through TALOS.',
        attesa: 'Waiting for ChatGPT…', attesaSotto: 'Finish signing in in the browser tab. TALOS keeps listening and picks up on its own when you come back.',
        notifica: 'Android notification while you wait: “TALOS is waiting for your ChatGPT sign-in”', annulla: 'Cancel sign-in',
        email: 'you@example.com', usoSotto: 'Using ChatGPT plan: requests to the ChatGPT models are paid by your subscription.',
        gestisci: 'Manage usage', altro: 'More', scollega: 'Disconnect ChatGPT plan',
        scollegaTitolo: 'Disconnect your ChatGPT plan?',
        scollegaSotto: 'TALOS revokes the access and deletes the tokens from this phone. Your chats stay. You can reconnect any time.',
        scollegaSi: 'Disconnect', scollegaNo: 'Stay connected',
        benvenuto: 'You’re using your ChatGPT plan', benvenutoSotto: 'Eligible usage in this app uses your ChatGPT plan.',
        benvenutoLink: 'Manage usage', benvenutoCoda: 'in your ChatGPT settings.', capito: 'Got it',
        pastiglia: 'ChatGPT plan', pannelloTitolo: 'You’re using your ChatGPT plan', ore5: 'Last 5 hours', giorni7: 'Last 7 days',
        ore5Val: '2 requests · 26.4 k tokens', giorni7Val: '5 requests · 61.2 k tokens',
        pannelloNota: 'Counted by TALOS on this phone. Usage from ChatGPT or other apps is not included: OpenAI’s numbers are in “Manage usage”.',
        utente: 'Summarize chapter 3 of the document I sent you.', limite: 'Usage limit reached',
        limiteSotto: 'Review your plan or this app’s limit in ChatGPT settings.',
        limiteAttesa: 'Continues on its own at 18:30 (attempt 1 of 9).', ferma: 'Stop waiting',
    }

const profili: TalosMobileModelProfileView[] = [{
    id: 'chatgpt:gpt-6-luna', provider: 'openai', model: 'gpt-6-luna', display_name: 'GPT-6 Luna', status: 'healthy',
    has_secret: false, effort_levels: ['low', 'medium', 'high'], supports_thinking: true, show_in_composer: true,
    capabilities: null, probe_ok: true,
}]

const conFoglio = computed(() => scena.startsWith('foglio') || scena === 'benvenuto')
const conChat = computed(() => ['compositore', 'pannello', 'limite'].includes(scena))
const collegato = computed(() => scena !== 'foglio-scollegato' && scena !== 'foglio-attesa')
const noop = () => {}
</script>

<template>
    <main class="min-h-dvh bg-[var(--talos-background)] text-[var(--talos-text)]">
        <!-- Sfondo: la schermata dei fornitori (per i fogli) -->
        <section v-if="conFoglio" class="mx-auto flex w-full max-w-3xl flex-col gap-[var(--talos-space-section)] px-[var(--talos-space-page)] pt-10">
            <header>
                <h1 class="text-2xl font-semibold">{{ T.fornitori }}</h1>
                <p class="mt-1 text-sm text-[var(--talos-muted)]">{{ T.fornitoriSotto }}</p>
            </header>
            <article class="flex min-h-touch items-center gap-3 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]">
                <TalosMobileProviderIcon provider="openai" class="size-9 shrink-0" />
                <div class="min-w-0 flex-1">
                    <p class="font-medium">OpenAI</p>
                    <p class="truncate text-sm text-[var(--talos-muted)]">{{ collegato ? T.openaiCollegato : T.openaiRiassunto }}</p>
                </div>
            </article>
            <article v-for="nome in ['Anthropic', 'OpenRouter', 'Google Gemini']" :key="nome" class="flex min-h-touch items-center gap-3 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)] opacity-80">
                <div class="size-9 shrink-0 rounded-full bg-[var(--talos-surface-2)]" />
                <p class="font-medium">{{ nome }}</p>
            </article>
        </section>

        <!-- Foglio «Configure OpenAI»: scollegato, in attesa, collegato, conferma dell'uscita -->
        <TalosMobileComposerSheet v-if="scena.startsWith('foglio') && scena !== 'foglio-scollega'" :title="T.configura" testid="mockup-openai" @close="noop">
            <div class="flex flex-col gap-[var(--talos-space-card)] px-4 pb-2">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button type="button" class="talos-pressable flex min-h-touch flex-col items-start gap-1.5 rounded-[var(--talos-radius-card)] border-2 border-[var(--talos-accent)] bg-[var(--talos-active)] p-[var(--talos-space-card)] text-left">
                        <span class="font-semibold text-[var(--talos-accent)]">{{ T.piano }}</span>
                        <span class="text-sm">{{ T.pianoSotto }}</span>
                        <span class="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[var(--talos-surface-2)] px-2 py-0.5 text-xs">
                            <span class="size-1.5 rounded-full" :class="collegato ? 'bg-emerald-500' : 'bg-[var(--talos-muted)]'" />
                            {{ collegato ? T.collegato : T.nonCollegato }}
                        </span>
                    </button>
                    <button type="button" class="talos-pressable flex min-h-touch flex-col items-start gap-1.5 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)] text-left">
                        <span class="font-semibold">{{ T.chiave }}</span>
                        <span class="text-sm text-[var(--talos-muted)]">{{ T.chiaveSotto }}</span>
                        <span class="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--talos-muted)]">
                            <span class="size-1.5 rounded-full bg-[var(--talos-muted)]" />{{ T.nessunaChiave }}
                        </span>
                    </button>
                </div>

                <template v-if="scena === 'foglio-scollegato'">
                    <Button class="min-h-touch w-full">{{ T.continua }}</Button>
                    <p class="text-sm text-[var(--talos-muted)]">{{ T.continuaSotto }}</p>
                </template>

                <template v-else-if="scena === 'foglio-attesa'">
                    <div class="flex items-start gap-3 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]" role="status">
                        <Loader2 class="mt-0.5 size-5 shrink-0 animate-spin text-[var(--talos-accent)]" aria-hidden="true" />
                        <div>
                            <p class="font-medium">{{ T.attesa }}</p>
                            <p class="mt-1 text-sm text-[var(--talos-muted)]">{{ T.attesaSotto }}</p>
                        </div>
                    </div>
                    <p class="rounded-md border border-dashed border-[var(--talos-border)] px-3 py-2 text-xs text-[var(--talos-muted)]">{{ T.notifica }}</p>
                    <Button variant="outline" class="min-h-touch w-full">{{ T.annulla }}</Button>
                </template>

                <template v-else>
                    <div>
                        <p class="font-semibold">{{ T.email }}</p>
                        <p class="mt-1 text-sm text-[var(--talos-muted)]">{{ T.usoSotto }}</p>
                    </div>
                    <Button variant="outline" class="min-h-touch w-full justify-center gap-2">{{ T.gestisci }} <ExternalLink class="size-4" aria-hidden="true" /></Button>
                    <Button variant="ghost" class="min-h-touch w-full justify-center gap-2 text-[var(--talos-muted)]"><MoreHorizontal class="size-4" aria-hidden="true" /> {{ T.scollega }}</Button>
                </template>
            </div>
        </TalosMobileComposerSheet>

        <!-- Conferma dell'uscita: una carta che chiede, due azioni una sotto l'altra -->
        <TalosMobileComposerSheet v-if="scena === 'foglio-scollega'" :title="T.scollegaTitolo" testid="mockup-scollega" @close="noop">
            <div class="flex flex-col gap-[var(--talos-space-card)] px-4 pb-2">
                <p class="text-sm text-[var(--talos-muted)]">{{ T.scollegaSotto }}</p>
                <Button variant="destructive" class="min-h-touch w-full">{{ T.scollegaSi }}</Button>
                <Button variant="outline" class="min-h-touch w-full">{{ T.scollegaNo }}</Button>
            </div>
        </TalosMobileComposerSheet>

        <!-- Benvenuto: una volta sola per account, con le parole ufficiali -->
        <TalosMobileComposerSheet v-if="scena === 'benvenuto'" :title="T.benvenuto" testid="mockup-benvenuto" @close="noop">
            <div class="flex flex-col gap-[var(--talos-space-card)] px-4 pb-2">
                <p>{{ T.benvenutoSotto }}</p>
                <p class="text-sm text-[var(--talos-muted)]"><a class="text-[var(--talos-accent)] underline underline-offset-2">{{ T.benvenutoLink }}</a> {{ T.benvenutoCoda }}</p>
                <Button class="min-h-touch w-full">{{ T.capito }}</Button>
            </div>
        </TalosMobileComposerSheet>

        <!-- Chat: il compositore vero con la pastiglia, il pannello, la carta del limite -->
        <section v-if="conChat" class="mx-auto flex min-h-dvh w-full max-w-[52rem] flex-col px-[var(--talos-space-page)] pb-44 pt-8">
            <div class="ml-auto max-w-[80%] rounded-2xl bg-[var(--talos-accent)] px-4 py-3 text-[var(--talos-accent-foreground,#111)]">{{ T.utente }}</div>
            <div v-if="scena === 'limite'" class="mt-6 flex flex-col gap-3">
                <div class="flex items-center gap-2 text-sm"><TalosMobileProviderIcon provider="openai" class="size-6" /> Talos · GPT-6 Luna</div>
                <article class="flex flex-col gap-2 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] border-l-4 border-l-[var(--talos-accent)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]" role="status">
                    <p class="font-semibold">{{ T.limite }}</p>
                    <p class="text-sm text-[var(--talos-muted)]">{{ T.limiteSotto }}</p>
                    <p class="text-sm">{{ T.limiteAttesa }}</p>
                    <Button class="mt-1 min-h-touch w-full justify-center gap-2">{{ T.gestisci }} <ExternalLink class="size-4" aria-hidden="true" /></Button>
                    <Button variant="outline" class="min-h-touch w-full">{{ T.ferma }}</Button>
                </article>
            </div>
        </section>

        <div v-if="conChat" class="fixed inset-x-0 bottom-0 z-40 bg-[var(--talos-background)]">
            <div class="talos-docked-composer relative">
                <!-- Pannello sopra il compositore, ancorato a sinistra come la pastiglia che lo apre -->
                <div v-if="scena === 'pannello'" class="absolute bottom-full left-[calc(var(--talos-space-page)*2)] mb-2 w-[min(22rem,calc(100%-2rem))] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-window-bg)] p-[var(--talos-space-card)] shadow-lg" role="dialog" :aria-label="T.pannelloTitolo">
                    <p class="font-semibold">{{ T.pannelloTitolo }}</p>
                    <p class="text-sm text-[var(--talos-muted)]">{{ T.email }}</p>
                    <dl class="mt-3 divide-y divide-[var(--talos-border)] text-sm">
                        <div class="flex justify-between gap-3 py-2"><dt class="text-[var(--talos-muted)]">{{ T.ore5 }}</dt><dd class="font-semibold tabular-nums">{{ T.ore5Val }}</dd></div>
                        <div class="flex justify-between gap-3 py-2"><dt class="text-[var(--talos-muted)]">{{ T.giorni7 }}</dt><dd class="font-semibold tabular-nums">{{ T.giorni7Val }}</dd></div>
                    </dl>
                    <p class="mt-2 text-xs text-[var(--talos-muted)]">{{ T.pannelloNota }}</p>
                    <a class="mt-3 inline-flex min-h-touch items-center gap-1.5 text-sm text-[var(--talos-accent)] underline underline-offset-2">{{ T.gestisci }} <ExternalLink class="size-3.5" aria-hidden="true" /></a>
                </div>
                <TalosMobileComposer
                    prompt=""
                    :model-profiles="profili"
                    selected-model-profile-id="chatgpt:gpt-6-luna"
                    selected-effort="medium"
                    :thinking="false"
                    :can-send="false"
                    :sending="false"
                    :docked="true"
                    :immersive-composer="false"
                    :context-available="true"
                >
                    <button
                        type="button"
                        :aria-label="T.pastiglia"
                        aria-haspopup="dialog"
                        :aria-expanded="scena === 'pannello'"
                        class="talos-pressable flex min-h-touch min-w-touch shrink-0 items-center justify-center"
                    >
                        <!-- Owner 12/10: «la pill nel composer leggermente meno alta». Il disegno è un badge piccolo (28 px,
                             come `talos-badge--sm` del desktop); l'area da toccare resta 44 px, data dal pulsante attorno. -->
                        <span class="flex h-7 items-center gap-1.5 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs">
                            <span class="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                            <span>{{ T.pastiglia }}</span>
                        </span>
                    </button>
                </TalosMobileComposer>
            </div>
        </div>
        <span class="sr-only"><ShieldCheck /></span>
    </main>
</template>
