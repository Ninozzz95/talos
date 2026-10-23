<script setup lang="ts">
/**
 * ⛔ K3-C3b-1 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): il contenuto del pannello ▤ del Codice su r4, schede «Contesto» e
 * «File», con le righe e le parole del desktop r4 (`pannelloR4.ts`, copia fissata di `inspector.js` @ fc5e25d62). Lo stesso componente
 * sta nel foglio del telefono e nella colonna del tablet (owner 15/10: «Foglio sul telefono, colonna sul tablet»).
 * Regola del desktop: ogni riga viene dai dati; dove il dato non c'è, «—» o niente, mai un numero finto.
 * K3-C3b-2a: la scheda «Processi» (`TalosCodiceR4Processi.vue`), col numero dei comandi vivi accanto al nome, come il desktop
 * (`contaProcessiAttivi`; a zero il numero non c'è).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TalosCodiceR4Processi from './TalosCodiceR4Processi.vue'
import TalosCodiceR4Agenti from './TalosCodiceR4Agenti.vue'
import TalosCodiceR4File from './TalosCodiceR4File.vue'
import { campoDellaMemoriaR4, creaMemoriaPannelloR4, type MemoriaPannelloR4 } from '@/lib/harness/r4/memoriaPannelloR4'
import { agentiDelPannelloR4, contaAgentiAttiviR4, testoAgentiR4, type AgenteR4 } from '@/lib/harness/r4/agentiR4'
import { contaProcessiAttiviR4, processiDagliEventiR4, STATI_PROCESSO_R4, type AzioneProcessoR4, type RisorsaR4 } from '@/lib/harness/r4/processiR4'
import { useTalosI18n } from '@/i18n'
import {
    anteprimaIndiceGiriR4, giriDelPannelloR4, limiteCheAgisceR4, riassuntoFileR4, righeAmbienteR4, righeFileR4, righeFinestraR4,
    righeFinestraSulLimiteR4, righeGiriR4, testoPannelloR4, type PannelloR4,
} from '@/lib/harness/r4/pannelloR4'
import './codiceR4.css'

const props = defineProps<{
    pannello: PannelloR4
    caricaPolitica: () => Promise<Record<string, unknown> | null>
    caricaCache: () => Promise<Record<string, unknown> | null>
    /** Cambia a ogni giro finito: politica e cache si rileggono. */
    giriFiniti: number
    azioneProcesso: (azione: AzioneProcessoR4, id: string) => Promise<{ ok: true } | { ok: false; motivo: string | null }>
    caricaRisorse: () => Promise<Map<string, RisorsaR4> | null>
    /** K3-C3b-2b: l'elenco delle sessioni di r4 e i figli di questa (`GET /api/v1/sessions`, `GET /:id/children`). */
    caricaSessioni: () => Promise<Record<string, unknown>[] | null>
    caricaFigli: () => Promise<AgenteR4[] | null>
    /** L'id della sessione aperta: gli eventi non lo portano (il `threadId` non lo è). */
    sessioneId: string | null
    /** K3-FILE: l'albero della cartella della sessione (rotte /tree di r4). Senza, la scheda File mostra solo i file toccati. */
    caricaAlbero?: InstanceType<typeof TalosCodiceR4File>['$props']['caricaAlbero']
    cercaFile?: InstanceType<typeof TalosCodiceR4File>['$props']['cercaFile']
    apriFile?: InstanceType<typeof TalosCodiceR4File>['$props']['apriFile']
    azioneFile?: InstanceType<typeof TalosCodiceR4File>['$props']['azioneFile']
    /** Pad 16/10: la memoria del pannello (scheda, e lo stato della scheda File), una per sessione, tenuta dalla schermata. */
    memoria?: MemoriaPannelloR4
    /**
     * ⛔ RA-11 (revisione avversariale R-M4, 21/10/2026): sulla sessione di un PC l'albero della cartella e le azioni sui processi si
     * fanno dal PC (il ponte remoto li rifiuta): la scheda File lo dice invece dell'albero, i Processi spengono le azioni col perché.
     */
    soloDalPc?: string
}>()
const emit = defineEmits<{ apriDelega: [sessionId: string]; allega: [percorsi: string[]] }>()
const { locale } = useTalosI18n()
// Pad 16/10: la scheda scelta resta passando dalla colonna al foglio (la memoria la tiene la schermata)
const memoriaLocale = creaMemoriaPannelloR4()
const scheda = campoDellaMemoriaR4(() => props.memoria, memoriaLocale, 'scheda')
const politica = ref<Record<string, unknown> | null>(null)
const cache = ref<Record<string, unknown> | null>(null)

async function rileggi(): Promise<void> {
    const [p, c] = await Promise.all([props.caricaPolitica(), props.caricaCache()])
    politica.value = p
    cache.value = c
}
onMounted(rileggi)
watch(() => props.giriFiniti, rileggi)

const t = (chiave: string) => testoPannelloR4(chiave, locale.value)
const ambiente = computed(() => righeAmbienteR4(props.pannello.contesto, locale.value))
const finestra = computed(() => {
    const limite = limiteCheAgisceR4({ politica: politica.value })
    return righeFinestraSulLimiteR4({ usage: props.pannello.ultimaRichiesta, limite, cacheSessione: cache.value }, locale.value)
        ?? righeFinestraR4(props.pannello.ultimaRichiesta, null, null, cache.value, locale.value)
})
const giri = computed(() => giriDelPannelloR4(props.pannello))
const righeGiri = computed(() => righeGiriR4(giri.value, locale.value))
const file = computed(() => righeFileR4(props.pannello.file))

/*
 * I processi dagli eventi dei comandi. `adesso` avanza ogni 5 s solo mentre c'è un comando vivo: il «Nessuna uscita da N secondi»
 * e il passaggio a «In attesa» dipendono dall'ora, non da un evento (il desktop ridisegna allo stesso modo durante un giro).
 */
const adesso = ref(Date.now())
/** L'elenco delle sessioni di r4 (letto qui sotto per gli Agenti): dice anche fin dove gli eventi sono di un server di prima. */
const sessioniLette = ref<Record<string, unknown>[]>([])
/*
 * K3 «Non più seguito» (`legacy/app.js:11970` @ 701c6c0d2): un comando in sfondo di prima di un riavvio di r4 non lo segue più
 * nessuno. `sequenzaAlRipristino` della sessione (`null` per una sessione di questo server) chiude quelle righe in «perso».
 */
const sfondiNonSeguitiFinoA = computed(() => {
    const n = sessioniLette.value.find((s) => s.sessionId === props.sessioneId)?.sequenzaAlRipristino
    return Number.isSafeInteger(n) ? n as number : null
})
const processi = computed(() => processiDagliEventiR4(props.pannello.attrezzi, {
    adesso: adesso.value, giroCorrente: props.pannello.giriVisti || null, giroVivo: props.pannello.giroVivo,
    sfondiNonSeguitiFinoA: sfondiNonSeguitiFinoA.value,
}).filter((p) => !p.tolto))
const attivi = computed(() => contaProcessiAttiviR4(processi.value))
let orologio: ReturnType<typeof setInterval> | null = null
watch(() => processi.value.some((p) => STATI_PROCESSO_R4[p.stato].vivo), (vivo) => {
    if (orologio) clearInterval(orologio)
    orologio = vivo ? setInterval(() => { adesso.value = Date.now() }, 5_000) : null
    adesso.value = Date.now()
}, { immediate: true })
onBeforeUnmount(() => { if (orologio) clearInterval(orologio) })
const nomeScheda = (s: 'contesto' | 'file' | 'processi' | 'agenti') => t(s === 'contesto' ? 'modello.inspector.context' : s === 'file'
    ? 'modello.inspector.files' : s === 'processi' ? 'modello.inspector.processes' : 'modello.inspector.agents')

/*
 * K3-C3b-2b: gli agenti. L'elenco delle sessioni e i figli si rileggono all'apertura, a ogni giro finito e quando una figlia nasce o
 * finisce (come il desktop rilegge l'elenco su `created`/`completed`); le istantanee dal vivo (`talos.agenti`) entrano subito.
 * Una lettura non riuscita lascia gli agenti di prima e lo dice («Dati non aggiornati»).
 */
const figliLetti = ref<AgenteR4[]>([])
const erroreAgenti = ref<string | null>(null)
async function rileggiAgenti(): Promise<void> {
    const [s, f] = await Promise.all([props.caricaSessioni(), props.caricaFigli()])
    if (s) sessioniLette.value = s
    if (f) figliLetti.value = f
    erroreAgenti.value = s && f ? null : testoAgentiR4('processi.process.tryAgain', locale.value)
}
onMounted(rileggiAgenti)
watch(() => props.giriFiniti, rileggiAgenti)
const inDiretta = computed(() => props.pannello.agentiInDiretta.filter((v) => v.radice === props.sessioneId).map((v) => v.agente))
watch(() => inDiretta.value.map((a) => `${a.sessionId}:${a.conclusa === true}`).join('|'), (ora, prima) => { if (ora !== prima) void rileggiAgenti() })
const agenti = computed(() => {
    const radice = props.sessioneId
    if (!radice) return []
    const nota = sessioniLette.value.find((s) => s.sessionId === radice) ?? {}
    return agentiDelPannelloR4({
        corrente: { ...nota, sessionId: radice },
        sessioni: [...sessioniLette.value, ...inDiretta.value].filter((a) => a?.passoWorkflow == null),
        figli: figliLetti.value,
        richieste: props.pannello.richieste.filter((r) => Number.isFinite(r.at)),
    }, locale.value)
})
const agentiAttivi = computed(() => contaAgentiAttiviR4(agenti.value))
</script>

<template>
    <div data-testid="talos-codice-r4-pannello-contenuto" class="flex min-h-0 flex-col">
        <div class="talos-codice-r4-schede" role="tablist" :aria-label="t('modello.inspector.columnSections')">
            <button
                v-for="s in (['contesto', 'file', 'agenti', 'processi'] as const)"
                :key="s"
                type="button"
                role="tab"
                :data-scheda="s"
                :aria-selected="scheda === s"
                class="talos-codice-r4-scheda"
                @click="scheda = s"
            >{{ nomeScheda(s) }}<span v-if="s === 'processi' && attivi > 0" data-testid="talos-codice-r4-processi-numero" class="talos-codice-r4-scheda-numero">{{ attivi }}</span><span v-if="s === 'agenti' && agentiAttivi > 0" data-testid="talos-codice-r4-agenti-numero" class="talos-codice-r4-scheda-numero">{{ agentiAttivi }}</span></button>
        </div>
        <div v-if="scheda === 'contesto'" role="tabpanel" data-testid="talos-codice-r4-pannello-contesto" class="flex flex-col gap-4 py-3">
            <section class="talos-codice-r4-sezione">
                <h3>{{ t('modello.inspector.environment') }}</h3>
                <dl>
                    <div v-for="r in ambiente" :key="r[0]" class="talos-codice-r4-kv"><dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd></div>
                </dl>
            </section>
            <section class="talos-codice-r4-sezione" data-testid="talos-codice-r4-finestra">
                <h3><span>{{ t('modello.inspector.contextWindow') }}</span><span class="talos-codice-r4-sezione-destra">{{ finestra.titoloDestra }}</span></h3>
                <dl>
                    <div v-for="r in finestra.righe" :key="r[0]" class="talos-codice-r4-kv" :data-classe="r[2] || null">
                        <dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd>
                    </div>
                </dl>
                <p v-if="finestra.perche" class="talos-codice-r4-nota">{{ finestra.perche }}</p>
            </section>
            <section class="talos-codice-r4-sezione">
                <h3><span>{{ t('modello.inspector.turnIndex') }}</span><span class="talos-codice-r4-sezione-destra">{{ anteprimaIndiceGiriR4(giri, locale) }}</span></h3>
                <p v-if="righeGiri.length === 0" class="talos-codice-r4-nota">{{ t('processi.inspector.turnsNone') }}</p>
                <dl v-else>
                    <div v-for="r in righeGiri" :key="r[0]" class="talos-codice-r4-kv" :data-classe="r[2] || null"><dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd></div>
                </dl>
            </section>
        </div>
        <TalosCodiceR4Agenti
            v-else-if="scheda === 'agenti'"
            role="tabpanel"
            :agenti="agenti"
            :errore="erroreAgenti"
            @apri="(id) => emit('apriDelega', id)"
        />
        <TalosCodiceR4Processi
            v-else-if="scheda === 'processi'"
            role="tabpanel"
            :processi="processi"
            :azione="azioneProcesso"
            :carica-risorse="caricaRisorse"
            :solo-dal-pc="soloDalPc"
        />
        <div v-else role="tabpanel" data-testid="talos-codice-r4-pannello-file" class="flex flex-col gap-2 py-3">
            <p class="talos-codice-r4-nota">{{ riassuntoFileR4(pannello.file, locale) }}</p>
            <p v-if="file.length === 0" class="talos-codice-r4-nota">{{ t('processi.inspector.filesNone') }}</p>
            <dl v-else class="talos-codice-r4-sezione">
                <div v-for="r in file" :key="r[0]" class="talos-codice-r4-kv" :data-file="r[0]"><dt class="font-mono">{{ r[0] }}</dt><dd>{{ r[1] }}</dd></div>
            </dl>
            <p v-if="soloDalPc" data-testid="talos-codice-r4-file-solo-dal-pc" class="talos-codice-r4-nota" role="status">{{ $t('computer.filesOnlyFromPc') }}</p>
            <TalosCodiceR4File
                v-else-if="caricaAlbero && cercaFile && apriFile"
                :carica-albero="caricaAlbero"
                :cerca-file="cercaFile"
                :apri-file="apriFile"
                :azione-file="azioneFile"
                :giri-finiti="giriFiniti"
                :memoria="memoria?.file"
                @allega="(percorsi) => emit('allega', percorsi)"
            />
        </div>
    </div>
</template>
