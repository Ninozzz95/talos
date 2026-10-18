/**
 * N15 fetta 4 — «Continue with ChatGPT» sul telefono: la CUSTODIA dei token e il rinnovo UNO alla volta.
 *
 * Regole portate da `chatgpt-custodia.mjs` e `chatgpt-accesso.mjs` del desktop r4 `2a61e35dc` (stessi codici d'errore):
 *   · due voci con vite diverse (fonte: siwc/token-sharing-open-source/profiles-and-sessions — «Signing out keeps the
 *     account-to-client mapping and the host ID for a later sign-in»): `registrazione` sopravvive all'uscita, `sessione` no;
 *   · il refresh token RUOTA a ogni uso: due rinnovi insieme ne brucerebbero uno ⇒ uno alla volta, chi arriva aspetta lo stesso;
 *   · un rinnovo finito per sempre toglie la sessione (`CHATGPT_ACCESSO_SCADUTO`); un guasto di rete no, e non butta via un
 *     token che vale ancora;
 *   · scollegato mentre un rinnovo è in viaggio: niente si salva e il refresh appena nato si revoca.
 *
 * Differenza dal desktop, solo di deposito: qui è l'Android Keystore (`@aparajita/capacitor-secure-storage`, lo stesso delle
 * chiavi dei fornitori), che non ha il limite di 1280 caratteri del Credential Manager di Windows ⇒ niente pezzi, e le
 * operazioni sono asincrone. ⛔ Prefisso `talos.chatgpt.`, diverso da `talos.provider.key.`: il backup delle chiavi dei
 * fornitori non vede e non esporta i token del piano. ⛔ Mai in Preferences o localStorage, mai nei messaggi d'errore.
 *
 * ⛔ Revisione del 13/10/2026 (`.claude/ragionamento/REVIEW-N15-ACCESSO-2026-10-13.md`), tutto con la sua prova rossa:
 *   · una terza voce, `attesa`, che vive SOLO mentre un accesso è aperto: verificatore, stato, nonce e indirizzo di ritorno,
 *     cioè ciò che serve a finirlo se Android ricrea l'attività (mai un token, mai un codice) — vedi `riprendi`;
 *   · l'ascolto ha un CANALE suo (`chatgpt`) e un numero per tentativo: OpenRouter e ChatGPT non si chiudono la porta a
 *     vicenda, e un tentativo vecchio non chiude quella del nuovo;
 *   · «non si legge» (il Keystore non risponde) non è «non c'è» — vedi `leggiCerto`.
 */
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { talosBridgeCall } from '@/lib/talosBridge'
import type { SecureKeyBackend } from '@/services/secureKeyStore'
import {
    EMITTENTE, INDIRIZZO_SCOPERTA, PERCORSO_RITORNO, corpoDelRinnovo, corpoDelloScambio, creaNonce, creaPkce, creaStato, indirizzoDiAutorizzazione,
    indirizzoDiRitorno, leggiRispostaToken, leggiRitorno, nuovoIdDellHost, pianoAbilitato, quandoRinnovare, rinnovoDefinitivamenteFallito, verificaIdToken,
} from '@/lib/chatgpt/oauth'

/**
 * Quanto può durare un accesso, come sul desktop (`chatgpt-accesso.mjs`, `TETTO_TENTATIVO_MS`). ⛔ Misurato sul Pad il 13/10/2026:
 * con 180 s l'ascolto si chiudeva mentre la persona sceglieva l'account e dava il consenso, e OpenAI rimandava il browser a una
 * porta chiusa («Connessione negata»): il codice d'accesso andava perso.
 */
export const TETTO_TENTATIVO_MS = 10 * 60 * 1000

/** Dove la persona vede e gestisce i consumi del piano (siwc/ui-ux-guidelines: «Manage usage»). */
export const INDIRIZZO_CONSUMI_CHATGPT = 'https://chatgpt.com/settings/usage'

/**
 * Il canale dell'ascolto di ChatGPT dentro il plugin. OpenRouter usa quello senza nome: due canali, due porte, e ciò che
 * arriva su uno non è mai ritirabile dall'altro.
 */
export const CANALE_ASCOLTO_CHATGPT = 'chatgpt'

/** Quante richieste estranee si ignorano prima di arrendersi: un ascolto che ripete all'infinito la stessa non deve girare a vuoto. */
const ESTRANEI_MASSIMI = 64

/** L'ascolto su 127.0.0.1 dentro l'app: il plugin `TalosOAuthLoopback`, lo stesso del login OpenRouter. */
export interface TalosChatgptAscolto {
    /**
     * `timeoutMs`: quanto resta aperta la porta (senza, il tempo corto di OpenRouter, 180 s). `path`: il solo percorso che è un
     * ritorno — ogni altra richiesta si ignora e l'ascolto continua. `channel`: quale ascolto. `id`: il numero di QUESTO ascolto.
     */
    open(opzioni?: { timeoutMs?: number, path?: string, channel?: string, returnState?: string }): Promise<{ port: number, id?: number }>
    awaitCallback(opzioni?: { channel?: string }): Promise<{ target: string }>
    /** Ciò che è arrivato mentre nessuno aspettava (attività ricreata). */
    pendingCallback?(opzioni?: { channel?: string }): Promise<{ target: string }>
    /** Con `id`, chiude solo se l'ascolto del canale è ancora quello. */
    close(opzioni?: { channel?: string, id?: number }): Promise<void>
}

export type TalosChatgptEsitoAccesso =
    | { ok: true, email: string | null, pianoAbilitato: boolean }
    | { ok: false, codice: string, codiceOpenAi?: string | null }

const PREFISSO = 'talos.chatgpt.'
export const VOCI_CHATGPT = Object.freeze(['registrazione', 'sessione', 'attesa'] as const)
export type TalosChatgptVoce = typeof VOCI_CHATGPT[number]

export interface TalosChatgptSessioneSalvata {
    clientId: string
    accessToken: string
    refreshToken: string
    idToken: string | null
    scadeAlle: number
    rinnovaNonPrimaDi: number | null
    scopes: string[]
    [altro: string]: unknown
}

/** Ciò che serve a FINIRE un accesso aperto. ⛔ Mai un token e mai un codice: quelli non esistono ancora quando si scrive. */
interface TalosChatgptAttesa { verifier: string, stato: string, nonce: string, ritorno: string, creatoAlle: number }

type Errore = Error & { code: string, stato?: number, codiceOpenAi?: string | null }
function errore(messaggio: string, code: string, extra: Record<string, unknown> = {}): Errore {
    return Object.assign(new Error(messaggio), { code, ...extra })
}

const depositoVero: SecureKeyBackend = {
    get: (chiave) => talosBridgeCall('TALOS_KEYSTORE_GET', () => SecureStorage.get(chiave) as Promise<unknown>),
    set: (chiave, valore) => talosBridgeCall('TALOS_KEYSTORE_SET', () => SecureStorage.set(chiave, valore)),
    remove: (chiave) => talosBridgeCall('TALOS_KEYSTORE_REMOVE', () => SecureStorage.remove(chiave)),
}

export interface TalosChatgptCustodia {
    leggi(voce: TalosChatgptVoce): Promise<Record<string, any> | null>
    /** Come `leggi`, ma un deposito che NON RISPONDE lancia `CHATGPT_CUSTODIA_ILLEGGIBILE` invece di sembrare vuoto. */
    leggiCerto?(voce: TalosChatgptVoce): Promise<Record<string, any> | null>
    scrivi(voce: TalosChatgptVoce, oggetto: Record<string, unknown>): Promise<void>
    togli(voce: TalosChatgptVoce): Promise<void>
}

export function creaCustodiaChatgpt({ backend = depositoVero }: { backend?: SecureKeyBackend } = {}): TalosChatgptCustodia {
    const controlla = (voce: string) => {
        if (!(VOCI_CHATGPT as readonly string[]).includes(voce)) throw errore('Unknown ChatGPT keystore entry.', 'CHATGPT_CUSTODIA_VOCE')
    }
    /**
     * ⛔ Revisione 13/10/2026 (C1). Due guasti diversi. Una voce ROTTA (o che il Keystore non sa più decifrare) è persa per
     * sempre: vale «assente», e la persona rifà l'accesso. Un deposito che NON RISPONDE in tempo (`talosBridgeCall` rifiuta con
     * `…_TIMEOUT` dopo 10 s) è un guasto di un momento: chi deve decidere qualcosa di irreversibile non può leggerlo come «assente».
     */
    async function leggiCerto(voce: TalosChatgptVoce): Promise<Record<string, any> | null> {
        controlla(voce)
        let grezzo: unknown
        try { grezzo = await backend.get(`${PREFISSO}${voce}`) } catch (guasto) {
            if (String((guasto as Error)?.message ?? '').endsWith('_TIMEOUT')) throw errore('The secure storage did not answer.', 'CHATGPT_CUSTODIA_ILLEGGIBILE')
            return null
        }
        if (typeof grezzo !== 'string' || grezzo === '') return null
        try {
            const oggetto: unknown = JSON.parse(grezzo)
            return oggetto && typeof oggetto === 'object' && !Array.isArray(oggetto) ? oggetto as Record<string, any> : null
        } catch { return null }
    }
    return {
        /** L'oggetto salvato, o `null` se la voce non c'è o non si legge: la persona rifà l'accesso, non resta con mezzo token. */
        async leggi(voce) {
            controlla(voce)
            try { return await leggiCerto(voce) } catch { return null }
        },
        leggiCerto,
        async scrivi(voce, oggetto) {
            controlla(voce)
            if (!oggetto || typeof oggetto !== 'object') throw errore('Nothing to store.', 'CHATGPT_CUSTODIA_VOCE')
            try { await backend.set(`${PREFISSO}${voce}`, JSON.stringify(oggetto)) }
            catch { throw errore('The credentials could not be stored safely.', 'CHATGPT_CUSTODIA_FALLITA') }
        },
        /** Toglie la voce. Non lancia se non c'era. */
        async togli(voce) {
            controlla(voce)
            try { await backend.remove(`${PREFISSO}${voce}`) } catch { /* già assente */ }
        },
    }
}

const https = (valore: unknown): valore is string => typeof valore === 'string' && valore.startsWith('https://')

export function creaSessioneChatgpt({ custodia, fetchFn = globalThis.fetch, clock = Date.now, loopback = null, apriBrowser = null, custode = null, tettoMs = TETTO_TENTATIVO_MS }: {
    custodia: TalosChatgptCustodia
    fetchFn?: typeof fetch
    clock?: () => number
    /** Servono solo per `accedi`: senza, il servizio rinnova ed esce ma non apre accessi. */
    loopback?: TalosChatgptAscolto | null
    apriBrowser?: ((indirizzo: string) => Promise<boolean>) | null
    /**
     * Chi tiene viva l'app mentre la persona è nella scheda del browser (servizio in primo piano con la sua notifica).
     * Misurato sul Pad l'11/10/2026: dopo ~60 s dietro la scheda Android abbassa la priorità dell'app e può chiuderla.
     */
    custode?: { inizia(): void, finisci(): void } | null
    tettoMs?: number
}) {
    if (!custodia) throw errore('The ChatGPT sign-in needs a custody.', 'CHATGPT_CUSTODIA_ASSENTE')
    /** Un tentativo d'accesso: se il suo ascolto è aperto, e con quale numero (assente = quello rimasto nel canale, dopo una ripresa). */
    type Tentativo = { aperto: boolean, id?: number }
    /** Ciò che un rinnovo dà a chi lo aspetta: `fresco` falso = la rete è caduta e questo è il token di prima, che vale ancora. */
    /** `scadeAlle` è quella di `token` (ChatGPT nel Codice, 18/10: r4 vuole il token con la SUA scadenza). */
    type Rinnovato = { token: string, scadeAlle: number, fresco: boolean, guasto?: unknown }
    let scoperta: { token: string, jwks: string, revoca: string | null } | null = null
    let rinnovoInCorso: Promise<Rinnovato> | null = null
    /** Un solo accesso vivo alla volta: un secondo «Continue with ChatGPT» chiude il primo (l'ascolto è una porta). */
    let tentativo: Tentativo | null = null
    /** Di chi sono il custode acceso e la voce `attesa`: chi esce spegne e toglie solo i SUOI (revisione 13/10/2026, A4). */
    let custodeDi: Tentativo | null = null
    let attesaDi: Tentativo | null = null
    /** Cresce a ogni uscita e a ogni accesso riuscito: un rinnovo partito prima sa di non essere più quello buono (C3, C4). */
    let epoca = 0
    /** Il refresh che sappiamo bruciato e che il deposito non ha voluto togliere: per questa vita dell'app non è una sessione (C2). */
    let morta: string | null = null
    const ascoltatori = new Set<(esito?: TalosChatgptEsitoAccesso) => void>()
    const avvisa = (esito?: TalosChatgptEsitoAccesso) => { for (const f of [...ascoltatori]) { try { f(esito) } catch { /* chi ascolta non ferma l'accesso */ } } }

    const annullato = () => errore('The sign-in was cancelled.', 'CHATGPT_ACCESSO_ANNULLATO')
    // «Tempo scaduto» è solo il tempo: dell'ascolto o nostro. Un ascolto che muore per altro si dice col suo nome (D1).
    const scaduto = () => errore('The sign-in was not completed in time.', 'CHATGPT_TEMPO_SCADUTO')
    const interrotto = () => errore('The sign-in listener stopped before the answer arrived.', 'CHATGPT_ASCOLTO_INTERROTTO')
    const nonCollegato = () => errore('No ChatGPT account is connected.', 'CHATGPT_NON_COLLEGATO')

    const leggiCerto = (voce: TalosChatgptVoce) => (custodia.leggiCerto ? custodia.leggiCerto(voce) : custodia.leggi(voce))
    async function leggiSessione(): Promise<TalosChatgptSessioneSalvata | null> {
        const s = await custodia.leggi('sessione') as TalosChatgptSessioneSalvata | null
        return s && !(morta !== null && s.refreshToken === morta) ? s : null
    }

    const chiedi = async (indirizzo: string, opzioni?: RequestInit): Promise<Response> => {
        try { return await fetchFn(indirizzo, opzioni) } catch { throw errore('OpenAI could not be reached.', 'CHATGPT_RETE') }
    }
    async function leggiScoperta() {
        if (scoperta) return scoperta
        const r = await chiedi(INDIRIZZO_SCOPERTA, { headers: { accept: 'application/json' } })
        const d = r.ok ? await r.json().catch(() => null) as Record<string, unknown> | null : null
        if (!d || d.issuer !== EMITTENTE || !https(d.token_endpoint) || !https(d.jwks_uri)) {
            throw errore('OpenAI published an unexpected sign-in configuration.', 'CHATGPT_RISPOSTA_INATTESA')
        }
        scoperta = { token: d.token_endpoint, jwks: d.jwks_uri, revoca: https(d.revocation_endpoint) ? d.revocation_endpoint : null }
        return scoperta
    }
    async function rinnova(corpo: string): Promise<unknown> {
        const { token } = await leggiScoperta()
        const r = await chiedi(token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: corpo })
        const dati = await r.json().catch(() => null) as Record<string, unknown> | null
        if (r.ok) return dati
        const codice = typeof dati?.error === 'string' ? dati.error : null
        // ⛔ il messaggio non porta mai ciò che OpenAI ha risposto (potrebbe ripetere un token): solo stato e codice, a parte.
        throw errore('The ChatGPT session could not be renewed.', rinnovoDefinitivamenteFallito(codice) ? 'CHATGPT_ACCESSO_SCADUTO' : 'CHATGPT_RINNOVO_FALLITO',
            { stato: r.status, codiceOpenAi: codice })
    }
    async function scambia(corpo: string): Promise<unknown> {
        const { token } = await leggiScoperta()
        const r = await chiedi(token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: corpo })
        const dati = await r.json().catch(() => null) as Record<string, unknown> | null
        if (r.ok) return dati
        throw errore('OpenAI did not accept the sign-in.', r.status >= 500 ? 'CHATGPT_RETE' : 'CHATGPT_SCAMBIO_RIFIUTATO',
            { stato: r.status, codiceOpenAi: typeof dati?.error === 'string' ? dati.error : null })
    }
    /** Chiude l'ascolto di QUEL tentativo, una volta sola: col suo numero, così non può chiudere quello di un tentativo più nuovo. */
    async function chiudiAscolto(t: Tentativo): Promise<void> {
        if (!t.aperto) return
        t.aperto = false
        await loopback?.close({ channel: CANALE_ASCOLTO_CHATGPT, ...(t.id === undefined ? {} : { id: t.id }) }).catch(() => {})
    }
    async function chiudiTentativo(): Promise<void> {
        const t = tentativo
        tentativo = null
        if (t) return chiudiAscolto(t)
        // Nessun accesso vivo in QUESTA pagina: può essercene uno rimasto aperto da un'attività ricreata e non ancora ripreso.
        if (loopback && await custodia.leggi('attesa')) {
            await custodia.togli('attesa')
            await loopback.close({ channel: CANALE_ASCOLTO_CHATGPT }).catch(() => {})
        }
    }
    /** Un token che nessuno userà si revoca: il refresh ruota, e quello appena nato non deve restare valido da nessuna parte. */
    async function revocaInSilenzio(refreshToken: string, clientId: string): Promise<boolean> {
        try {
            const { revoca } = await leggiScoperta()
            if (!revoca) return false
            const r = await chiedi(revoca, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: clientId }).toString() })
            return r.status === 200
        } catch { return false }
    }

    /**
     * Aspetta IL ritorno: quello col percorso giusto e lo stato di questo accesso. ⛔ Revisione 13/10/2026 (A1): prima vinceva la
     * prima richiesta qualunque, e un'altra app che bussava alla porta chiudeva l'accesso. Ora ciò che non è nostro si ignora e
     * si torna ad ascoltare fino alla scadenza. Lo stato sbagliato non viene mai accettato: semplicemente non decide niente.
     */
    async function aspettaIlRitorno(mio: Tentativo, dati: TalosChatgptAttesa, clientIdSalvato: string | null, restaMs: number) {
        let sveglia: ReturnType<typeof setTimeout> | undefined
        const tetto = new Promise<never>((_, rifiuta) => { sveglia = setTimeout(() => rifiuta(scaduto()), Math.max(1, restaMs)) })
        tetto.catch(() => {})
        try {
            for (let estranei = 0; estranei < ESTRANEI_MASSIMI; estranei++) {
                let target: string
                try {
                    const arrivo = loopback!.awaitCallback({ channel: CANALE_ASCOLTO_CHATGPT })
                    arrivo.catch(() => {}) // se il tetto vince, il rifiuto che arriva alla chiusura non resta senza padrone
                    target = (await Promise.race([arrivo, tetto])).target
                } catch (guasto) {
                    // «Annullato» è solo ciò che ha voluto la persona (o un nuovo tentativo che ha preso il posto).
                    if (tentativo !== mio) throw annullato()
                    const g = guasto as { code?: string, message?: string }
                    const tempo = g?.code === 'CHATGPT_TEMPO_SCADUTO' || `${g?.code ?? ''} ${g?.message ?? ''}`.includes('TALOS_OAUTH_TIMEOUT')
                    throw tempo ? scaduto() : interrotto()
                }
                if (tentativo !== mio) throw annullato()
                try { return leggiRitorno(target, { statoAtteso: dati.stato, clientIdSalvato }) } catch (guasto) {
                    const codice = (guasto as { code?: string })?.code
                    if (codice !== 'CHATGPT_STATO_DIVERSO' && codice !== 'CHATGPT_RITORNO_SCONOSCIUTO') throw guasto
                }
            }
            throw interrotto()
        } finally { clearTimeout(sveglia) }
    }

    /** Dal ritorno alla sessione custodita: scambio, identità verificata, custodia. Lo stesso per l'accesso vivo e per la ripresa. */
    async function completa(mio: Tentativo, registrazione: Record<string, any>, dati: TalosChatgptAttesa, restaMs: number): Promise<TalosChatgptEsitoAccesso> {
        const clientIdSalvato: string | null = registrazione.clientId ?? null
        const letto = await aspettaIlRitorno(mio, dati, clientIdSalvato, restaMs)
        /*
         * ⛔ MISURATO sul Pad il 13/10/2026: ciò che serve a riprendere si toglieva QUI, prima dello scambio. Se Android ricrea
         * l'attività proprio al ritorno (lo fa: la riportiamo davanti noi), la pagina muore con lo scambio a metà e a quella
         * nuova non resta niente — «non collegato», in silenzio. Ora resta finché il tentativo non è finito (lo toglie
         * `porta`). Se il codice era già stato speso, la ripresa riceve il rifiuto di OpenAI e lo DICE: un codice vale un
         * uso, e lo garantisce OpenAI, non la nostra cancellazione.
         */
        /**
         * ⛔ Revisione 13/10/2026 (A7): da qui il refresh token ESISTE da OpenAI. Qualunque cosa vada storta dopo — altro account,
         * chiavi non scaricabili, identità non valida, deposito che non scrive, annullato — lo si revoca, non lo si abbandona.
         */
        let nato: { refreshToken: string, clientId: string } | null = null
        try {
            const t = leggiRispostaToken(await scambia(corpoDelloScambio({ clientId: letto.clientId, codice: letto.codice, verifier: dati.verifier, ritorno: dati.ritorno })),
                { ora: clock(), scopesPrecedenti: letto.scopes })
            nato = { refreshToken: t.refreshToken, clientId: letto.clientId }
            if (!t.idToken) throw errore('OpenAI sent no identity.', 'CHATGPT_ID_TOKEN_NON_VALIDO')
            const { jwks } = await leggiScoperta()
            const rj = await chiedi(jwks, { headers: { accept: 'application/json' } })
            // Le chiavi che non si scaricano sono un guasto di RETE, non un'identità falsa.
            if (!rj.ok) throw errore('OpenAI signing keys could not be fetched.', 'CHATGPT_RETE')
            const chiavi = await rj.json().catch(() => null) as { keys?: unknown[] } | null
            if (!chiavi) throw errore('OpenAI published its signing keys in an unknown shape.', 'CHATGPT_RISPOSTA_INATTESA')
            const chi = await verificaIdToken(t.idToken, { jwks: chiavi, clientId: letto.clientId, nonce: dati.nonce, ora: clock() })
            /*
             * Un altro account è un rifiuto solo MENTRE uno è collegato: è la protezione contro uno scambio non voluto.
             * Owner 13/10/2026: «dopo Scollega vale qualsiasi account» — prima il legame restava nella registrazione anche dopo
             * l'uscita, e l'altro account veniva rifiutato con «scollega il precedente», che era già scollegato.
             */
            const collegata = await leggiSessione()
            if (collegata?.refreshToken && typeof collegata.sub === 'string' && collegata.sub !== chi.sub) {
                throw errore('A different ChatGPT account answered.', 'CHATGPT_ALTRO_ACCOUNT')
            }
            if (tentativo !== mio) throw annullato() // annullato (o sostituito da un altro tentativo) mentre lo scambio era in viaggio
            await custodia.scrivi('registrazione', { clientId: letto.clientId, idDellHost: registrazione.idDellHost, sub: chi.sub, email: chi.email })
            await custodia.scrivi('sessione', { clientId: letto.clientId, sub: chi.sub, accessToken: t.accessToken, refreshToken: t.refreshToken,
                idToken: t.idToken, scadeAlle: t.scadeAlle, rinnovaNonPrimaDi: t.rinnovaNonPrimaDi, scopes: t.scopes })
            nato = null
            epoca += 1
            morta = null
            return { ok: true, email: chi.email, pianoAbilitato: t.pianoAbilitato }
        } catch (guasto) {
            if (nato) await revocaInSilenzio(nato.refreshToken, nato.clientId)
            throw guasto
        }
    }

    /**
     * Porta un tentativo fino in fondo e ne lascia pulito SOLO il suo: il posto, il custode, la voce `attesa`, l'ascolto.
     * Non lancia: torna `{ ok:false, codice }`, così l'interfaccia ha sempre una frase da dire.
     */
    async function porta(mio: Tentativo, lavoro: () => Promise<TalosChatgptEsitoAccesso>): Promise<TalosChatgptEsitoAccesso> {
        let esito: TalosChatgptEsitoAccesso
        try { esito = await lavoro() } catch (guasto) {
            const g = guasto as { code?: string, codiceOpenAi?: string | null }
            esito = { ok: false, codice: g?.code ?? 'CHATGPT_ERRORE', codiceOpenAi: g?.codiceOpenAi ?? null }
        }
        if (tentativo === mio) tentativo = null
        if (custodeDi === mio) { custodeDi = null; custode?.finisci() }
        if (attesaDi === mio) { attesaDi = null; await custodia.togli('attesa') }
        await chiudiAscolto(mio)
        avvisa(esito)
        return esito
    }

    /**
     * Il rinnovo, uno alla volta. ⛔ Revisione 13/10/2026: una rilettura fallita non è uno scollegamento (C1); una scrittura
     * fallita dopo la rotazione non lascia una sessione morta che sembra collegata (C2); un rinnovo partito prima di un'uscita
     * o di un nuovo accesso non salva e non cancella niente (C3, C4); chi forza non riceve il token di prima (C5, in `tokenDiAccesso`).
     */
    /** Il rinnovo in corso, o uno nuovo: chi arriva intanto si accoda (chat e Codice insieme fanno UN rinnovo). */
    function rinnovoUnico(s: TalosChatgptSessioneSalvata): Promise<Rinnovato> {
        if (!rinnovoInCorso) {
            // ⛔ Revisione 13/10/2026 (C6): il posto si libera DOPO averlo preso. Liberandolo nel `finally` del lavoro, un rinnovo
            // che falliva prima della sua prima attesa lo liberava prima dell'assegnazione, e la promessa finita restava lì per sempre.
            const lavoro = rinnovaSessione(s)
            rinnovoInCorso = lavoro
            const libera = () => { if (rinnovoInCorso === lavoro) rinnovoInCorso = null }
            void lavoro.then(libera, libera)
        }
        return rinnovoInCorso
    }

    async function rinnovaSessione(s: TalosChatgptSessioneSalvata): Promise<Rinnovato> {
        const miaEpoca = epoca
        try {
            const t = leggiRispostaToken(await rinnova(corpoDelRinnovo({ clientId: s.clientId, refreshToken: s.refreshToken })),
                { ora: clock(), scopesPrecedenti: s.scopes })
            // scollegato (o ricollegato) mentre il rinnovo era in viaggio? Lo dice l'epoca; il deposito lo conferma SE risponde.
            let cambiata = epoca !== miaEpoca
            if (!cambiata) {
                try { cambiata = (await leggiCerto('sessione'))?.refreshToken !== s.refreshToken } catch { cambiata = false }
            }
            if (cambiata) {
                await revocaInSilenzio(t.refreshToken, s.clientId)
                throw nonCollegato()
            }
            const nuova = { ...s, accessToken: t.accessToken, refreshToken: t.refreshToken, idToken: t.idToken ?? s.idToken,
                scadeAlle: t.scadeAlle, rinnovaNonPrimaDi: t.rinnovaNonPrimaDi, scopes: t.scopes }
            try { await custodia.scrivi('sessione', nuova) } catch {
                try { await custodia.scrivi('sessione', nuova) } catch (guasto) {
                    // Il refresh di prima è bruciato e quello nuovo non si può tenere: meglio «non collegato» che un collegato finto.
                    morta = s.refreshToken
                    await revocaInSilenzio(t.refreshToken, s.clientId)
                    await custodia.togli('sessione')
                    throw guasto
                }
            }
            return { token: t.accessToken, scadeAlle: t.scadeAlle, fresco: true }
        } catch (guasto) {
            const codice = (guasto as { code?: string })?.code
            if (codice === 'CHATGPT_ACCESSO_SCADUTO') {
                // Si toglie la sessione solo se è ancora QUELLA che non si rinnova più, non quella di un accesso arrivato intanto.
                let stessa = epoca === miaEpoca
                if (stessa) {
                    try { stessa = (await leggiCerto('sessione'))?.refreshToken === s.refreshToken } catch { /* non risponde: in questa vita dell'app nessuno l'ha cambiata */ }
                }
                if (!stessa) throw nonCollegato()
                morta = s.refreshToken
                await custodia.togli('sessione')
                throw guasto
            }
            if (codice === 'CHATGPT_NON_COLLEGATO' || codice === 'CHATGPT_CUSTODIA_FALLITA') throw guasto
            const daRiprovare = codice === 'CHATGPT_RETE' ? errore('The ChatGPT session could not be renewed.', 'CHATGPT_RINNOVO_FALLITO') : guasto
            // un rinnovo non riuscito per rete non butta via un token che vale ancora
            if (clock() < s.scadeAlle) return { token: s.accessToken, scadeAlle: s.scadeAlle, fresco: false, guasto: daRiprovare }
            throw daRiprovare
        }
    }

    return {
        /** Ciò che l'interfaccia può sapere. Mai un token. */
        async stato() {
            const reg = await custodia.leggi('registrazione')
            const s = await leggiSessione()
            const collegato = Boolean(s?.refreshToken)
            return { collegato, email: (reg?.email as string | undefined) ?? null, pianoAbilitato: collegato && pianoAbilitato(s?.scopes),
                scadeAlle: (s?.scadeAlle as number | undefined) ?? null, accessoInCorso: Boolean(tentativo), consumi: INDIRIZZO_CONSUMI_CHATGPT }
        },

        /**
         * Chi vuole sapere quando un accesso parte o finisce (con il suo esito) e quando si esce: il riquadro che si rimonta a
         * metà di un accesso non ha altro modo di accorgersene (revisione 13/10/2026, E1). Torna la funzione che smette di ascoltare.
         */
        quandoCambia(ascoltatore: (esito?: TalosChatgptEsitoAccesso) => void): () => void {
            ascoltatori.add(ascoltatore)
            return () => { ascoltatori.delete(ascoltatore) }
        },

        /**
         * L'accesso dall'inizio alla fine: apre l'ascolto, apre la scheda, aspetta il ritorno, scambia, verifica, custodisce.
         * `consenso` true solo quando la persona vuole abilitare il piano dopo un accesso che non l'aveva concesso.
         * Non lancia: torna `{ ok:false, codice }`, così l'interfaccia ha sempre una frase da dire.
         */
        async accedi({ consenso = false }: { consenso?: boolean } = {}): Promise<TalosChatgptEsitoAccesso> {
            if (!loopback || !apriBrowser) return { ok: false, codice: 'CHATGPT_NON_DISPONIBILE' }
            // ⛔ Revisione 13/10/2026 (A4): il posto si prende SUBITO, prima di ogni attesa. Prendendolo dopo l'apertura della porta,
            // due tocchi insieme passavano tutti e due, e quello che usciva chiudeva la porta e il custode dell'altro.
            const precedente = tentativo
            const mio: Tentativo = { aperto: false }
            tentativo = mio
            avvisa()
            const ancoraMio = () => { if (tentativo !== mio) throw annullato() }
            return porta(mio, async () => {
                if (precedente) await chiudiAscolto(precedente)
                // ⛔ C1: una registrazione che non si legge NON è una registrazione assente — scriverci sopra un id nuovo perderebbe il client emesso.
                let registrazione = await leggiCerto('registrazione')
                ancoraMio()
                if (!registrazione?.idDellHost) {
                    registrazione = { idDellHost: nuovoIdDellHost() }
                    await custodia.scrivi('registrazione', registrazione) // l'id dell'host si tiene dalla PRIMA richiesta, anche se l'accesso non si chiude
                }
                const sessione = await custodia.leggi('sessione')
                ancoraMio()
                let ascolto: { port: number, id?: number }
                // Lo stato nasce PRIMA della porta: l'ascolto lo riceve (`returnState`) per riportare TALOS davanti alla scheda
                // quando arriva il ritorno di QUESTO accesso (owner 13/10/2026). Chi accetta o rifiuta l'accesso resta qui.
                const stato = creaStato()
                try { ascolto = await loopback.open({ timeoutMs: tettoMs, path: PERCORSO_RITORNO, channel: CANALE_ASCOLTO_CHATGPT, returnState: stato }) }
                catch { throw errore('The sign-in listener could not be opened.', 'CHATGPT_PORTA') }
                mio.aperto = true
                mio.id = ascolto.id
                ancoraMio()
                const { verifier, challenge } = await creaPkce()
                const dati: TalosChatgptAttesa = { verifier, stato, nonce: creaNonce(), ritorno: indirizzoDiRitorno(ascolto.port), creatoAlle: clock() }
                // ⛔ PRIMA di aprire la scheda (A5): da qui Android può ricreare l'attività, e questo è ciò che non si può ricostruire.
                // Se non si riesce a scriverlo l'accesso va avanti lo stesso: si perde solo la ripresa.
                attesaDi = mio
                await custodia.scrivi('attesa', { ...dati }).catch(() => {})
                ancoraMio()
                const aperto = await apriBrowser(indirizzoDiAutorizzazione({ clientId: registrazione.clientId ?? null, idDellHost: registrazione.idDellHost,
                    ritorno: dati.ritorno, stato: dati.stato, nonce: dati.nonce, challenge, idTokenPrecedente: sessione?.idToken ?? null, email: registrazione.email ?? null,
                    consenso: Boolean(consenso) && Boolean(registrazione.clientId) }))
                if (!aperto) throw errore('The browser tab could not be opened.', 'CHATGPT_BROWSER')
                ancoraMio()
                custode?.inizia()
                custodeDi = mio
                return completa(mio, registrazione, dati, tettoMs)
            })
        },

        /**
         * ⭐ Riprende un accesso rimasto a metà perché Android ha ricreato l'attività mentre la scheda era davanti (revisione
         * 13/10/2026, A5 — lo stesso guasto misurato per OpenRouter il 10/08). La pagina è nuova: verificatore, stato e nonce si
         * rileggono dalla voce `attesa`, il ritorno si ritira dal canale di ChatGPT (se è già arrivato) o si torna ad aspettarlo.
         * ⛔ Torna `null` quando non c'è niente da riprendere: è il caso NORMALE, e non è un errore da mostrare.
         */
        async riprendi(): Promise<TalosChatgptEsitoAccesso | null> {
            if (!loopback || tentativo) return null
            const dati = await custodia.leggi('attesa') as TalosChatgptAttesa | null
            if (!dati || tentativo) return null // un accesso vivo ha già in mano il suo ritorno
            const intera = [dati.verifier, dati.stato, dati.nonce, dati.ritorno].every((v) => typeof v === 'string' && v !== '')
            const resta = Number(dati.creatoAlle) + tettoMs - clock()
            if (!intera || !(resta > 0)) { // rotta, o più vecchia dell'ascolto: non c'è più niente da aspettare
                await custodia.togli('attesa')
                await loopback.close({ channel: CANALE_ASCOLTO_CHATGPT }).catch(() => {})
                return null
            }
            let registrazione: Record<string, any> | null
            // il deposito non risponde: niente si tocca, si riprova al prossimo ritorno in primo piano
            try { registrazione = await leggiCerto('registrazione') } catch { return { ok: false, codice: 'CHATGPT_CUSTODIA_ILLEGGIBILE' } }
            if (tentativo) return null
            const mio: Tentativo = { aperto: true }
            tentativo = mio
            attesaDi = mio
            avvisa()
            return porta(mio, async () => {
                if (!registrazione?.idDellHost) throw interrotto()
                // Il servizio in primo piano dell'altra vita è rimasto acceso senza padrone: si riprende qui, e alla fine si spegne.
                custode?.inizia()
                custodeDi = mio
                return completa(mio, registrazione, dati, resta)
            })
        },

        /** Chiude il tentativo in corso (la persona ha cambiato idea). */
        async annulla(): Promise<void> { await chiudiTentativo() },

        /**
         * Il token con cui chiamare il piano, rinnovato se sta per scadere. Lancia `CHATGPT_NON_COLLEGATO`,
         * `CHATGPT_PIANO_NON_ABILITATO`, `CHATGPT_ACCESSO_SCADUTO` (rifare l'accesso) o `CHATGPT_RINNOVO_FALLITO` / `CHATGPT_RETE` (riprovare).
         */
        async tokenDiAccesso({ forzaRinnovo = false }: { forzaRinnovo?: boolean } = {}): Promise<string> {
            const s = await leggiSessione()
            if (!s?.refreshToken || !s.accessToken) throw nonCollegato()
            if (!pianoAbilitato(s.scopes)) throw errore('Using the ChatGPT plan is not enabled for this sign-in.', 'CHATGPT_PIANO_NON_ABILITATO')
            const daRinnovare = forzaRinnovo || clock() >= quandoRinnovare({ scadeAlle: s.scadeAlle, rinnovaNonPrimaDi: s.rinnovaNonPrimaDi })
            if (!daRinnovare) return s.accessToken
            const esito = await rinnovoUnico(s)
            // C5: chi ha forzato (il piano gli ha appena rifiutato quel token) non lo riceve indietro, nemmeno se si è accodato.
            if (esito.fresco || !forzaRinnovo) return esito.token
            throw esito.guasto
        },

        /**
         * ⛔ CHATGPT NEL CODICE (owner 18/10/2026, un solo accesso; ledger `LEDGER-CHATGPT-NEL-CODICE-2026-10-18.md`): il token e la SUA
         * scadenza, per spingerli a r4 prima di un giro. Vale almeno `almenoMs` (r4 rifiuta sotto i 5 minuti, e un giro dura minuti),
         * altrimenti si rinnova con lo STESSO rinnovo unico della chat. Un rinnovo fallito non passa un token troppo corto. Errori come
         * `tokenDiAccesso`, mai col token nel messaggio.
         */
        async accessoValido({ almenoMs, forzaRinnovo = false }: { almenoMs: number, forzaRinnovo?: boolean }): Promise<{ accessToken: string, scadeAlle: number }> {
            const s = await leggiSessione()
            if (!s?.refreshToken || !s.accessToken) throw nonCollegato()
            if (!pianoAbilitato(s.scopes)) throw errore('Using the ChatGPT plan is not enabled for this sign-in.', 'CHATGPT_PIANO_NON_ABILITATO')
            const corto = s.scadeAlle - clock() < almenoMs
            const daRinnovare = forzaRinnovo || corto || clock() >= quandoRinnovare({ scadeAlle: s.scadeAlle, rinnovaNonPrimaDi: s.rinnovaNonPrimaDi })
            if (!daRinnovare) return { accessToken: s.accessToken, scadeAlle: s.scadeAlle }
            const esito = await rinnovoUnico(s)
            if (forzaRinnovo && !esito.fresco) throw esito.guasto
            if (esito.scadeAlle - clock() < almenoMs) {
                throw esito.guasto ?? errore('The ChatGPT session could not be renewed.', 'CHATGPT_RINNOVO_FALLITO')
            }
            return { accessToken: esito.token, scadeAlle: esito.scadeAlle }
        },

        /** Esce: revoca il refresh token e toglie la sessione. `revocaConfermata` falso = tolta qui, da scollegare anche in ChatGPT. */
        async esci(): Promise<{ revocaConfermata: boolean }> {
            // ⛔ Revisione 13/10/2026 (C3): un rinnovo in viaggio si lascia FINIRE prima di leggere che cosa revocare. L'epoca cambiata
            // gli dice di non salvare niente e di revocare il refresh che gli nasce; così non ne resta uno vivo dopo l'uscita.
            epoca += 1
            await chiudiTentativo()
            await rinnovoInCorso?.catch(() => {})
            const s = await custodia.leggi('sessione') as TalosChatgptSessioneSalvata | null
            const revocaConfermata = s?.refreshToken && s.clientId ? await revocaInSilenzio(s.refreshToken, s.clientId) : false
            await custodia.togli('sessione')
            // Scollegare dimentica A CHI era legato TALOS (owner 13/10/2026): resta l'identità dell'installazione, non l'account.
            const reg = await custodia.leggi('registrazione')
            if (reg && (reg.sub !== undefined || reg.email !== undefined)) {
                const { sub: _sub, email: _email, ...resto } = reg
                await custodia.scrivi('registrazione', resto).catch(() => {})
            }
            avvisa()
            return { revocaConfermata }
        },
    }
}
