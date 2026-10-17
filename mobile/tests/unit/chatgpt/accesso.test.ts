// @vitest-environment node
import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {} }))

import { creaCustodiaChatgpt, creaSessioneChatgpt } from '@/services/chatgptCustodia'
import { CLIENT_DI_REGISTRAZIONE, EMITTENTE, SCOPE_DEL_PIANO } from '@/lib/chatgpt/oauth'

/**
 * N15 fetta 3 (mobile, 13/10/2026) — l'accesso dall'inizio alla fine sul telefono: ascolto su 127.0.0.1 dentro l'app
 * (`TalosOAuthLoopback`, lo stesso del login OpenRouter, misurato sul Pad l'11/10: vivo 95 s dietro la scheda), scheda del
 * browser, ritorno, scambio, verifica dell'identità, custodia. Regole di `chatgpt-accesso.mjs` del desktop r4 `2a61e35dc`.
 * ⛔ Ogni prova ha il suo verso contrario: stato sbagliato, altro account, annullato, browser che non si apre.
 */
const ORA = 1_800_000_000_000
const CLIENT = 'oaiapp_abc123'
const SCOPERTA = { issuer: EMITTENTE, token_endpoint: 'https://auth.openai.com/api/accounts/oauth/token', jwks_uri: 'https://auth.openai.com/jwks', revocation_endpoint: 'https://auth.openai.com/revoke' }
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const chiavi = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...chiavi.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }
function idToken(corpo: Record<string, unknown>) {
    const dati = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64(corpo)}`
    return `${dati}.${sign('sha256', Buffer.from(dati), chiavi.privateKey).toString('base64url')}`
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

/**
 * Il plugin nativo, finto ma con la sua FORMA (revisione 13/10/2026): un ascolto per CANALE, ognuno col suo numero. Il finto
 * di prima era una promessa sola per banco: non poteva mostrare né i due flussi (ChatGPT e OpenRouter) che si chiudevano la
 * porta a vicenda, né un tentativo vecchio che chiudeva quella del nuovo. Qui `open` chiude solo l'ascolto dello STESSO
 * canale, `close` con un numero vecchio non fa niente, e ciò che arriva quando nessuno aspetta resta da parte.
 */
type Canale = { id: number, aperto: boolean, fine: string | null, arrivati: string[], attesa: { ok: (v: { target: string }) => void, ko: (e: Error) => void } | null }
const rifiutoNativo = (codice: string) => Object.assign(new Error(codice), { code: codice })
function nativoFinto() {
    const canali = new Map<string, Canale>()
    let prossimo = 0
    let ultimo = ''
    const finisci = (c: Canale | undefined, codice: string) => {
        if (!c || !c.aperto) return
        c.aperto = false; c.fine = codice
        c.attesa?.ko(rifiutoNativo(codice)); c.attesa = null
    }
    return {
        canali,
        ultimoCanale: () => ultimo,
        open(o?: { timeoutMs?: number, path?: string, channel?: string }) {
            ultimo = o?.channel ?? ''
            finisci(canali.get(ultimo), 'TALOS_OAUTH_CANCELLED')
            prossimo += 1
            canali.set(ultimo, { id: prossimo, aperto: true, fine: null, arrivati: [], attesa: null })
            return { port: 45224 + prossimo, id: prossimo }
        },
        awaitCallback(o?: { channel?: string }) {
            return new Promise<{ target: string }>((ok, ko) => {
                const c = canali.get(o?.channel ?? '')
                if (c?.arrivati.length) return ok({ target: c.arrivati.shift()! })
                if (!c || !c.aperto) return ko(rifiutoNativo(c?.fine === 'TALOS_OAUTH_TIMEOUT' ? 'TALOS_OAUTH_TIMEOUT' : 'TALOS_OAUTH_NOT_LISTENING'))
                c.attesa?.ko(rifiutoNativo('TALOS_OAUTH_CANCELLED'))
                c.attesa = { ok, ko }
            })
        },
        pendingCallback(o?: { channel?: string }) { return { target: canali.get(o?.channel ?? '')?.arrivati.shift() ?? '' } },
        close(o?: { channel?: string, id?: number }) {
            const c = canali.get(o?.channel ?? '')
            if (c && (o?.id === undefined || o.id === c.id)) finisci(c, 'TALOS_OAUTH_CANCELLED')
        },
        /** Una richiesta arriva alla porta di quel canale: a chi aspetta, o da parte. */
        bussa(canale: string, target: string) {
            const c = canali.get(canale)
            if (!c || !c.aperto) throw new Error('Connessione negata: nessuno ascolta su questo canale')
            if (c.attesa) { const a = c.attesa; c.attesa = null; a.ok({ target }) } else c.arrivati.push(target)
        },
        scade(canale: string) { finisci(canali.get(canale), 'TALOS_OAUTH_TIMEOUT') },
        guasta(canale: string) { finisci(canali.get(canale), 'TALOS_OAUTH_CALLBACK_FAILED') },
        /** L'attività ricreata: l'ascolto resta, chi aspettava di là non c'è più. */
        ricrea() { for (const c of canali.values()) c.attesa = null },
    }
}

function banco({ sub = 'utente-1', email = 'x@y.z' as string | null, scope = `openid ${SCOPE_DEL_PIANO}`, apre = true, portaRotta = false, tettoMs = undefined as number | undefined,
    jwksStato = 200, condiviso = undefined as { mappa: Map<string, string>, nativo: ReturnType<typeof nativoFinto> } | undefined } = {}) {
    const mappa = condiviso?.mappa ?? new Map<string, string>()
    /** Il deposito che si può guastare: una lettura o una scrittura che lancia, come un Keystore che non risponde. */
    const guasti = { leggere: (_k: string) => false, scrivere: (_k: string) => false }
    const custodia = creaCustodiaChatgpt({ backend: {
        get: async (k) => { if (guasti.leggere(k)) throw new Error('TALOS_KEYSTORE_GET_TIMEOUT'); return mappa.get(k) ?? null },
        set: async (k, v) => { if (guasti.scrivere(k)) throw new Error('TALOS_KEYSTORE_SET_TIMEOUT'); mappa.set(k, v) },
        remove: async (k) => mappa.delete(k),
    } })
    const nativo = condiviso?.nativo ?? nativoFinto()
    const loopback = {
        open: vi.fn(async (opzioni?: { timeoutMs?: number, path?: string, channel?: string }) => { if (portaRotta) throw new Error('porta'); return nativo.open(opzioni) }),
        awaitCallback: vi.fn((opzioni?: { channel?: string }) => nativo.awaitCallback(opzioni)),
        pendingCallback: vi.fn(async (opzioni?: { channel?: string }) => nativo.pendingCallback(opzioni)),
        close: vi.fn(async (opzioni?: { channel?: string, id?: number }) => { nativo.close(opzioni) }),
    }
    const aperti: string[] = []
    const apriBrowser = vi.fn(async (url: string) => { aperti.push(url); return apre })
    const chiamate: Array<{ url: string, body: string }> = []
    let nonceVisto = ''
    let sbloccaScambio: (() => void) | null = null
    let scambioLento = false
    const fetchFn = vi.fn(async (url: RequestInfo | URL, opzioni: RequestInit = {}) => {
        const u = String(url)
        if (u.endsWith('/.well-known/openid-configuration')) return json(SCOPERTA)
        if (u === SCOPERTA.jwks_uri) return json({ keys: [JWK] }, jwksStato)
        chiamate.push({ url: u, body: String(opzioni.body ?? '') })
        if (u === SCOPERTA.revocation_endpoint) return new Response('', { status: 200 })
        if (scambioLento) await new Promise<void>((ok) => { sbloccaScambio = ok })
        return json({ access_token: 'ACCESSO-1', refresh_token: 'REFRESH-1', token_type: 'Bearer', expires_in: 3600, scope,
            id_token: idToken({ iss: EMITTENTE, aud: CLIENT, exp: ORA / 1000 + 600, nonce: nonceVisto, sub, email }) })
    }) as unknown as typeof fetch
    const custode = { inizia: vi.fn(), finisci: vi.fn() }
    const sess = creaSessioneChatgpt({ custodia, fetchFn, clock: () => ORA, loopback, apriBrowser, custode, ...(tettoMs === undefined ? {} : { tettoMs }) })
    /** Il ritorno che la scheda farebbe per l'ULTIMO indirizzo aperto: stato e nonce letti da lì. */
    const ritorno = (cambia: (p: URLSearchParams) => void = () => {}, da: string = aperti[aperti.length - 1]!) => {
        const aperto = new URL(da)
        nonceVisto = aperto.searchParams.get('nonce')!
        const p = new URLSearchParams({ state: aperto.searchParams.get('state')!, code: 'CODICE-1', client_id: CLIENT, scope })
        cambia(p)
        return `/auth/callback?${p}`
    }
    /** Una richiesta qualunque alla porta dell'accesso in corso (il canale dell'ultima `open`). */
    const bussa = (target: string) => nativo.bussa(nativo.ultimoCanale(), target)
    /** Il browser «torna»: legge stato e nonce dall'indirizzo aperto e chiama l'ascolto come farebbe la scheda. */
    let tornati = 0
    const torna = async (cambia: (p: URLSearchParams) => void = () => {}) => {
        // aspetta una scheda NUOVA: al secondo accesso quella di prima è già tornata
        await vi.waitFor(() => expect(aperti.length).toBeGreaterThan(tornati))
        tornati = aperti.length
        bussa(ritorno(cambia))
    }
    return { sess, custodia, loopback, nativo, apriBrowser, aperti, chiamate, torna, ritorno, bussa, mappa, custode, guasti,
        scadeLAscolto: () => nativo.scade(nativo.ultimoCanale()), lento: () => { scambioLento = true }, sblocca: () => sbloccaScambio?.() }
}

describe('N15 — l accesso col piano ChatGPT sul telefono', () => {
    it('N15-ACC-01: primo accesso — registrazione dinamica, ritorno su 127.0.0.1, scambio senza segreto, identità verificata, custodia', async () => {
        const b = banco()
        expect(await b.sess.stato()).toMatchObject({ collegato: false, email: null, pianoAbilitato: false, accessoInCorso: false })
        const esito = b.sess.accedi()
        await b.torna()
        expect(await esito).toEqual({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        const aperto = new URL(b.aperti[0]!)
        expect(aperto.origin + aperto.pathname).toBe('https://auth.openai.com/api/accounts/authorize')
        expect(aperto.searchParams.get('client_id')).toBe(CLIENT_DI_REGISTRAZIONE)
        expect(aperto.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:45225/auth/callback')
        expect(aperto.searchParams.get('code_challenge_method')).toBe('S256')
        const scambio = b.chiamate.find((c) => c.url === SCOPERTA.token_endpoint)!
        expect(scambio.body).toContain('grant_type=authorization_code')
        expect(scambio.body).toContain('code=CODICE-1')
        expect(scambio.body).not.toContain('client_secret')
        expect(await b.custodia.leggi('registrazione')).toMatchObject({ clientId: CLIENT, sub: 'utente-1', email: 'x@y.z' })
        expect((await b.custodia.leggi('registrazione'))?.idDellHost).toMatch(/^urn:uuid:/)
        expect(await b.custodia.leggi('sessione')).toMatchObject({ clientId: CLIENT, refreshToken: 'REFRESH-1' })
        expect(b.loopback.close).toHaveBeenCalled()
        // ciò che l'interfaccia può sapere: mai un token
        const stato = await b.sess.stato()
        expect(stato).toMatchObject({ collegato: true, email: 'x@y.z', pianoAbilitato: true, accessoInCorso: false })
        expect(JSON.stringify(stato)).not.toMatch(/ACCESSO-1|REFRESH-1/)
        // il secondo accesso usa il client emesso e suggerisce l'account
        const dopo = b.sess.accedi()
        await b.torna()
        await dopo
        const secondo = new URL(b.aperti[1]!)
        expect(secondo.searchParams.get('client_id')).toBe(CLIENT)
        expect(secondo.searchParams.get('login_hint')).toBe('x@y.z')
    })

    // Revisione 13/10/2026 (A1): lo stato sbagliato resta «non nostro» — niente scambio — ma non chiude più il tentativo: si
    // continua ad ascoltare (N15-ACC-08). Qui la persona annulla, e il resto della prova è quello di sempre.
    it('N15-ACC-02 AL CONTRARIO: un ritorno con lo stato sbagliato non è nostro — niente scambio, niente sessione, l id dell host resta', async () => {
        const b = banco()
        const esito = b.sess.accedi()
        await b.torna((p) => p.set('state', 'ALTRO'))
        await new Promise((ok) => setTimeout(ok, 20))
        expect((await b.sess.stato()).accessoInCorso).toBe(true)
        await b.sess.annulla()
        expect(await esito).toMatchObject({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO' })
        expect(b.chiamate.find((c) => c.url === SCOPERTA.token_endpoint)).toBeUndefined()
        expect(await b.custodia.leggi('sessione')).toBeNull()
        expect((await b.custodia.leggi('registrazione'))?.idDellHost).toMatch(/^urn:uuid:/)
        // e «accesso negato» si dice col suo nome
        const c = banco()
        const negato = c.sess.accedi()
        await c.torna((p) => { p.delete('code'); p.set('error', 'access_denied') })
        expect(await negato).toMatchObject({ ok: false, codice: 'CHATGPT_ACCESSO_NEGATO' })
    })

    it('N15-ACC-03: se risponde un ALTRO account MENTRE uno è collegato, la sessione di prima non viene sostituita', async () => {
        const b = banco()
        const primo = b.sess.accedi(); await b.torna(); await primo
        // stesso telefono (stesso deposito, stesso ascolto), ma dalla scheda risponde un altro account
        const altro = banco({ sub: 'utente-2', email: 'altro@y.z', condiviso: { mappa: b.mappa, nativo: b.nativo } })
        const esito = altro.sess.accedi()
        await altro.torna()
        expect(await esito).toMatchObject({ ok: false, codice: 'CHATGPT_ALTRO_ACCOUNT' })
        expect((await altro.custodia.leggi('sessione'))?.refreshToken).toBe('REFRESH-1')
        expect((await altro.custodia.leggi('registrazione'))?.email).toBe('x@y.z')
    })

    /**
     * N15-ACC-15 — decisione dell'owner del 13/10/2026: «dopo Scollega vale qualsiasi account». Prima TALOS ricordava
     * l'account anche dopo l'uscita e rifiutava l'altro con «scollega il precedente», che era già scollegato: un vicolo cieco.
     */
    it('N15-ACC-15: dopo «Scollega» entra chi accede — anche un altro account, senza suggerire a OpenAI quello di prima', async () => {
        const b = banco()
        const primo = b.sess.accedi(); await b.torna(); await primo
        await b.sess.esci()
        const dimenticato = await b.custodia.leggi('registrazione')
        expect(dimenticato?.sub).toBeUndefined()
        expect(dimenticato?.email).toBeUndefined()
        // l'identità dell'installazione resta: non si chiede a OpenAI un'altra registrazione
        expect(dimenticato?.idDellHost).toBeTruthy()
        expect(dimenticato?.clientId).toBeTruthy()
        const altro = banco({ sub: 'utente-2', email: 'altro@y.z', condiviso: { mappa: b.mappa, nativo: b.nativo } })
        const esito = altro.sess.accedi()
        await vi.waitFor(() => expect(altro.aperti).toHaveLength(1))
        expect(new URL(altro.aperti[0]!).searchParams.get('login_hint')).toBeNull()
        await altro.torna()
        expect(await esito).toEqual({ ok: true, email: 'altro@y.z', pianoAbilitato: true })
        expect((await altro.sess.stato()).email).toBe('altro@y.z')
    })

    it('N15-ACC-04: annullare chiude l ascolto; annullare MENTRE lo scambio è in viaggio non salva niente e revoca il refresh nato', async () => {
        const b = banco()
        const esito = b.sess.accedi()
        await vi.waitFor(() => expect(b.aperti).toHaveLength(1))
        expect((await b.sess.stato()).accessoInCorso).toBe(true)
        await b.sess.annulla()
        expect(await esito).toMatchObject({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO' })
        expect((await b.sess.stato()).accessoInCorso).toBe(false)

        const c = banco()
        c.lento()
        const inViaggio = c.sess.accedi()
        await c.torna()
        await vi.waitFor(() => expect(c.chiamate.some((x) => x.url === SCOPERTA.token_endpoint)).toBe(true))
        await c.sess.annulla()
        c.sblocca()
        expect(await inViaggio).toMatchObject({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO' })
        expect(await c.custodia.leggi('sessione')).toBeNull()
        expect(c.chiamate.find((x) => x.url === SCOPERTA.revocation_endpoint)?.body).toContain('token=REFRESH-1')
    })

    it('N15-ACC-05: la porta che non si apre e il browser che non parte si dicono per nome, e l ascolto non resta appeso', async () => {
        const senzaPorta = banco({ portaRotta: true })
        expect(await senzaPorta.sess.accedi()).toMatchObject({ ok: false, codice: 'CHATGPT_PORTA' })
        const senzaBrowser = banco({ apre: false })
        expect(await senzaBrowser.sess.accedi()).toMatchObject({ ok: false, codice: 'CHATGPT_BROWSER' })
        expect(senzaBrowser.loopback.close).toHaveBeenCalled()
        // un accesso riuscito SENZA lo scope del piano resta un accesso: l'inferenza è ferma, la scelta è della persona
        const senzaPiano = banco({ scope: 'openid' })
        const esito = senzaPiano.sess.accedi()
        await senzaPiano.torna()
        expect(await esito).toEqual({ ok: true, email: 'x@y.z', pianoAbilitato: false })
    })

    /**
     * N15-ACC-06 — MISURATO sul Pad l'11/10/2026: con la scheda davanti, dopo ~60 s Android abbassa la priorità dell'app
     * (`oom_score_adj` 700 → 900) e sotto pressione di memoria può chiuderla, ascolto compreso. Mentre si aspetta il ritorno
     * un servizio in primo piano la tiene viva, con la notifica del mockup; va rilasciato in OGNI uscita.
     */
    it('N15-ACC-06: il servizio in primo piano parte quando la scheda è aperta e si rilascia sempre — riuscito, annullato, fallito', async () => {
        const riuscito = banco()
        const esito = riuscito.sess.accedi()
        await vi.waitFor(() => expect(riuscito.aperti).toHaveLength(1))
        expect(riuscito.custode.inizia).toHaveBeenCalledTimes(1)
        expect(riuscito.custode.finisci).not.toHaveBeenCalled()
        await riuscito.torna()
        await esito
        expect(riuscito.custode.finisci).toHaveBeenCalledTimes(1)

        const annullato = banco()
        const a = annullato.sess.accedi()
        await vi.waitFor(() => expect(annullato.aperti).toHaveLength(1))
        await annullato.sess.annulla()
        await a
        expect(annullato.custode.finisci).toHaveBeenCalledTimes(1)

        // AL CONTRARIO: se la scheda non si apre non c'è niente da aspettare, e niente resta acceso
        const senzaBrowser = banco({ apre: false })
        await senzaBrowser.sess.accedi()
        expect(senzaBrowser.custode.inizia).not.toHaveBeenCalled()
        const sbagliato = banco()
        const s2 = sbagliato.sess.accedi()
        await sbagliato.torna((p) => { p.delete('code'); p.set('error', 'server_error') })
        await s2
        expect(sbagliato.custode.inizia).toHaveBeenCalledTimes(1)
        expect(sbagliato.custode.finisci).toHaveBeenCalledTimes(1)
    })

    /**
     * ⛔ N15-ACC-07 — TROVATO DAL VIVO sul Pad il 13/10/2026, col piano dell'owner. L'ascolto nativo si chiudeva da solo dopo
     * 180 s (tempo pensato per OpenRouter); la scelta dell'account e il consenso sono durati di più, OpenAI ha rimandato il
     * browser a `127.0.0.1:38525` e ha trovato «Connessione negata»: il codice d'accesso è andato perso. E l'app restava su
     * «In attesa di ChatGPT…» senza accorgersene. ⇒ Stesso tetto del desktop (10 minuti, `TETTO_TENTATIVO_MS`), chiesto
     * all'ascolto all'apertura, e una scadenza dal nostro lato che si dice a parole.
     */
    it('N15-ACC-07: l ascolto si apre per 10 minuti come sul desktop; se scade (da lui o da noi) lo si dice, non si resta «in attesa»', async () => {
        const b = banco()
        const esito = b.sess.accedi()
        await vi.waitFor(() => expect(b.aperti).toHaveLength(1))
        expect(b.loopback.open).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 10 * 60 * 1000 }))
        // N15-ACC-RITORNO (13/10/2026): l'ascolto riceve lo stato di QUESTO accesso — lo stesso della pagina aperta — per
        // riportare TALOS davanti alla scheda quando arriva il suo ritorno
        const statoAperto = new URL(b.aperti[0]!).searchParams.get('state')
        expect(statoAperto).toBeTruthy()
        expect(b.loopback.open).toHaveBeenCalledWith(expect.objectContaining({ returnState: statoAperto }))
        // l'ascolto nativo si chiude da solo, senza che nessuno abbia annullato
        b.scadeLAscolto()
        expect(await esito).toMatchObject({ ok: false, codice: 'CHATGPT_TEMPO_SCADUTO' })
        expect(b.custode.finisci).toHaveBeenCalledTimes(1)
        expect((await b.sess.stato()).accessoInCorso).toBe(false)

        // e se l'ascolto non dice niente, scade il nostro tetto
        const muto = banco({ tettoMs: 40 })
        expect(await muto.sess.accedi()).toMatchObject({ ok: false, codice: 'CHATGPT_TEMPO_SCADUTO' })
        expect(muto.loopback.close).toHaveBeenCalled()
        // AL CONTRARIO: annullare resta «annullato», non «tempo scaduto»
        const voluto = banco()
        const a = voluto.sess.accedi()
        await vi.waitFor(() => expect(voluto.aperti).toHaveLength(1))
        await voluto.sess.annulla()
        expect(await a).toMatchObject({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO' })
    })

    /**
     * ⛔ N15-ACC-08 — revisione 13/10/2026 (A1). Vinceva la PRIMA richiesta, qualunque fosse: un'altra app del telefono che
     * bussava alla porta (`GET /`, o il percorso giusto con uno stato inventato) chiudeva il tentativo, e il ritorno vero
     * trovava «Connessione negata». Ora chi non è il nostro ritorno si ignora e si continua ad ascoltare fino alla scadenza;
     * lo stato sbagliato non viene MAI accettato — semplicemente non decide più niente.
     */
    it('N15-ACC-08: una richiesta estranea (percorso sbagliato, o stato sbagliato) non chiude l accesso; il ritorno vero dopo riesce', async () => {
        const b = banco()
        const esito = b.sess.accedi()
        await vi.waitFor(() => expect(b.aperti).toHaveLength(1))
        expect(b.loopback.open).toHaveBeenCalledWith(expect.objectContaining({ path: '/auth/callback' }))
        b.bussa('/')
        b.bussa('/favicon.ico')
        b.bussa(b.ritorno((p) => p.set('state', 'INVENTATO')))
        await new Promise((ok) => setTimeout(ok, 20))
        expect(b.chiamate.find((c) => c.url === SCOPERTA.token_endpoint)).toBeUndefined() // lo stato inventato non scambia niente
        await b.torna()
        expect(await esito).toEqual({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        expect(b.chiamate.filter((c) => c.url === SCOPERTA.token_endpoint)).toHaveLength(1)
    })

    /**
     * ⛔ N15-ACC-09 — revisione 13/10/2026 (A3, D1). ChatGPT e OpenRouter usavano la STESSA porta nativa: «Accedi con
     * OpenRouter» durante l'attesa di ChatGPT chiudeva l'ascolto di ChatGPT (che diceva «tempo scaduto», falso) e ChatGPT,
     * finendo, chiudeva quello appena aperto da OpenRouter. Ora ognuno ha il suo canale; e un ascolto che muore senza che
     * sia scaduto si dice col suo nome.
     */
    it('N15-ACC-09: OpenRouter e ChatGPT non si chiudono la porta a vicenda; un ascolto interrotto non è «tempo scaduto»', async () => {
        const b = banco()
        const esito = b.sess.accedi()
        await vi.waitFor(() => expect(b.aperti).toHaveLength(1))
        // OpenRouter apre, aspetta e poi chiude come ha sempre fatto: senza opzioni
        b.nativo.open()
        const openRouter = b.nativo.awaitCallback()
        openRouter.catch(() => {})
        b.nativo.bussa('chatgpt', b.ritorno())
        expect(await esito).toMatchObject({ ok: true })
        // ChatGPT ha finito: l'ascolto di OpenRouter è ancora lì e riceve il suo ritorno
        expect(b.nativo.canali.get('')?.aperto).toBe(true)
        b.nativo.bussa('', '/talos-openrouter?code=OR')
        expect((await openRouter).target).toBe('/talos-openrouter?code=OR')
        // A6: il ritorno di ChatGPT non è mai finito fra le cose che OpenRouter può ritirare
        expect(b.nativo.pendingCallback().target).toBe('')

        const c = banco()
        const interrotto = c.sess.accedi()
        await vi.waitFor(() => expect(c.aperti).toHaveLength(1))
        c.nativo.guasta('chatgpt')
        expect(await interrotto).toMatchObject({ ok: false, codice: 'CHATGPT_ASCOLTO_INTERROTTO' })
    })

    /**
     * ⛔ N15-ACC-10 — revisione 13/10/2026 (A4). Un secondo «Continue with ChatGPT» prende il posto del primo; ma il primo,
     * uscendo, chiudeva la porta «corrente» e rilasciava il custode condiviso: se usciva dopo che il secondo aveva aperto,
     * lo lasciava ad aspettare su una porta chiusa e senza servizio in primo piano. Ora chi esce chiude solo il SUO ascolto.
     */
    it('N15-ACC-10: un tentativo sostituito non chiude la porta del nuovo e non gli spegne il custode, nemmeno se partono insieme', async () => {
        const b = banco()
        const primo = b.sess.accedi()
        await vi.waitFor(() => expect(b.aperti).toHaveLength(1))
        const secondo = b.sess.accedi()
        expect(await primo).toMatchObject({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO' })
        await vi.waitFor(() => expect(b.aperti).toHaveLength(2))
        await vi.waitFor(() => expect(b.custode.inizia).toHaveBeenCalledTimes(2))
        await new Promise((ok) => setTimeout(ok, 20))
        expect(b.nativo.canali.get('chatgpt')?.aperto).toBe(true)
        // il custode del primo si rilascia PRIMA che parta quello del secondo, mai dopo
        expect(b.custode.finisci).toHaveBeenCalledTimes(1)
        expect(b.custode.finisci.mock.invocationCallOrder[0]!).toBeLessThan(b.custode.inizia.mock.invocationCallOrder[1]!)
        b.bussa(b.ritorno())
        expect(await secondo).toMatchObject({ ok: true })

        // due tocchi nello stesso istante: uno solo resta, e arriva in fondo
        const c = banco()
        const [x, y] = [c.sess.accedi(), c.sess.accedi()]
        expect(await x).toMatchObject({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO' })
        await vi.waitFor(() => expect(c.custode.inizia).toHaveBeenCalledTimes(1))
        await new Promise((ok) => setTimeout(ok, 20))
        expect(c.nativo.canali.get('chatgpt')?.aperto).toBe(true)
        c.bussa(c.ritorno())
        expect(await y).toMatchObject({ ok: true })
        expect(c.custode.finisci).toHaveBeenCalledTimes(1)
    })

    /**
     * ⛔ N15-ACC-11 — revisione 13/10/2026 (A7). Dopo uno scambio RIUSCITO il refresh token esiste già da OpenAI (vale 30
     * giorni). Se poi l'accesso falliva — altro account, chiavi non scaricabili, deposito che non scrive — il token restava
     * valido e nessuno lo aveva più: si revocava solo dopo un «Annulla». E le chiavi non raggiunte si dicevano «identità non
     * valida» invece di «rete».
     */
    it('N15-ACC-11: ogni fallimento DOPO lo scambio revoca il refresh appena nato; le chiavi non raggiunte sono un guasto di rete', async () => {
        const revocato = (x: ReturnType<typeof banco>) => x.chiamate.find((c) => c.url === SCOPERTA.revocation_endpoint)?.body ?? ''
        const b = banco()
        const primo = b.sess.accedi(); await b.torna(); await primo
        // un altro account risponde mentre il primo è collegato (stesso telefono: stesso deposito)
        const altro = banco({ sub: 'utente-2', condiviso: { mappa: b.mappa, nativo: b.nativo } })
        const esito = altro.sess.accedi()
        await altro.torna()
        expect(await esito).toMatchObject({ ok: false, codice: 'CHATGPT_ALTRO_ACCOUNT' })
        expect(revocato(altro)).toContain('token=REFRESH-1')

        const senzaChiavi = banco({ jwksStato: 503 })
        const s = senzaChiavi.sess.accedi()
        await senzaChiavi.torna()
        expect(await s).toMatchObject({ ok: false, codice: 'CHATGPT_RETE' })
        expect(revocato(senzaChiavi)).toContain('token=REFRESH-1')
        expect(await senzaChiavi.custodia.leggi('sessione')).toBeNull()

        const nonScrive = banco()
        nonScrive.guasti.scrivere = (k) => k.endsWith('.sessione')
        const n = nonScrive.sess.accedi()
        await nonScrive.torna()
        expect(await n).toMatchObject({ ok: false, codice: 'CHATGPT_CUSTODIA_FALLITA' })
        expect(revocato(nonScrive)).toContain('token=REFRESH-1')
        expect((await nonScrive.sess.stato()).collegato).toBe(false)
    })

    /**
     * ⛔ N15-ACC-12 — revisione 13/10/2026 (C1). Una voce che NON SI LEGGE (il Keystore non risponde entro 10 s) era trattata
     * come una voce che non c'è: l'accesso creava un id dell'host nuovo e lo scriveva sopra la registrazione, perdendo il
     * client emesso e l'account. «Assente» e «illeggibile» sono due cose: la seconda ferma l'accesso e non tocca niente.
     */
    it('N15-ACC-12: una registrazione illeggibile non è una registrazione assente — niente id nuovo sopra, niente scheda, lo si dice', async () => {
        const b = banco()
        const primo = b.sess.accedi(); await b.torna(); await primo
        const prima = b.mappa.get('talos.chatgpt.registrazione')
        b.guasti.leggere = (k) => k.endsWith('.registrazione')
        expect(await b.sess.accedi()).toMatchObject({ ok: false, codice: 'CHATGPT_CUSTODIA_ILLEGGIBILE' })
        expect(b.mappa.get('talos.chatgpt.registrazione')).toBe(prima)
        expect(b.aperti).toHaveLength(1)
    })

    /**
     * ⛔ N15-ACC-13 — revisione 13/10/2026 (A5, A6). Android può ricreare l'attività mentre la scheda è davanti (misurato per
     * OpenRouter il 10/08): verificatore, stato e nonce vivevano solo nella memoria della pagina, e il ritorno arrivava a
     * una casa vuota. Ora ciò che serve a FINIRE l'accesso sta nel Keystore finché l'accesso è aperto (mai un token), il
     * nativo tiene da parte il ritorno nel canale di ChatGPT, e la pagina nuova lo riprende.
     */
    /**
     * ⛔ N15-ACC-14 — MISURATO sul Pad il 13/10/2026 (dimensione del testo cambiata con la scheda davanti): l'attività viene
     * ricreata proprio AL RITORNO. La pagina vecchia ha già ricevuto il ritorno e muore con lo scambio a metà; prima, ciò che
     * serviva a riprendere era già stato tolto, e la pagina nuova non trovava niente: «non collegato», in silenzio. Ora resta
     * finché il tentativo non è finito, il nativo ridà il ritorno (`LOOPBACK-RIPRESA-01`) e la pagina nuova chiude l'accesso.
     */
    it('N15-ACC-14: l attività ricreata AL RITORNO, con lo scambio a metà — la pagina nuova riprende lo stesso', async () => {
        const vecchia = banco()
        vecchia.lento()
        void vecchia.sess.accedi()
        await vecchia.torna()
        // la pagina vecchia ha il ritorno in mano ed è ferma nello scambio
        await vi.waitFor(() => expect(vecchia.chiamate.length).toBeGreaterThan(0))
        expect(vecchia.mappa.has('talos.chatgpt.attesa')).toBe(true)
        // muore lì; il nativo ridà il ritorno alla pagina nuova
        const nuova = banco({ condiviso: { mappa: vecchia.mappa, nativo: vecchia.nativo } })
        vecchia.nativo.ricrea()
        vecchia.nativo.bussa('chatgpt', nuova.ritorno(() => {}, vecchia.aperti[0]!))
        expect(await nuova.sess.riprendi()).toEqual({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        expect(nuova.mappa.has('talos.chatgpt.attesa')).toBe(false)
    })

    it('N15-ACC-13: l attività ricreata durante l accesso — la pagina nuova riprende e chiude, senza token messi da parte', async () => {
        const vecchia = banco()
        void vecchia.sess.accedi()
        await vi.waitFor(() => expect(vecchia.aperti).toHaveLength(1))
        const daParte = vecchia.mappa.get('talos.chatgpt.attesa') ?? ''
        expect(daParte).toContain('verifier')
        expect(daParte).not.toMatch(/ACCESSO|REFRESH|access_token|refresh_token/u)
        // l'attività muore: chi aspettava non c'è più. Il browser torna DOPO, e il nativo tiene il ritorno da parte.
        vecchia.nativo.ricrea()
        const nuova = banco({ condiviso: { mappa: vecchia.mappa, nativo: vecchia.nativo } })
        expect((await nuova.sess.stato()).accessoInCorso).toBe(false)
        vecchia.nativo.bussa('chatgpt', nuova.ritorno(() => {}, vecchia.aperti[0]!))
        expect(await nuova.sess.riprendi()).toEqual({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        expect((await nuova.custodia.leggi('sessione'))?.refreshToken).toBe('REFRESH-1')
        expect(nuova.mappa.has('talos.chatgpt.attesa')).toBe(false)
        expect(nuova.custode.finisci).toHaveBeenCalledTimes(1) // la notifica rimasta dall'altra vita si spegne
        // un codice vale un uso: una seconda ripresa non trova niente
        expect(await nuova.sess.riprendi()).toBeNull()

        // AL CONTRARIO: niente da riprendere è il caso normale, e non è un errore
        expect(await banco().sess.riprendi()).toBeNull()
        // e se il ritorno non è ancora arrivato, la pagina nuova torna ad ASPETTARE (con «Annulla»), non lo perde
        const lenta = banco()
        void lenta.sess.accedi()
        await vi.waitFor(() => expect(lenta.aperti).toHaveLength(1))
        lenta.nativo.ricrea()
        const dopo = banco({ condiviso: { mappa: lenta.mappa, nativo: lenta.nativo } })
        const ripresa = dopo.sess.riprendi()
        await vi.waitFor(async () => expect((await dopo.sess.stato()).accessoInCorso).toBe(true))
        lenta.nativo.bussa('chatgpt', dopo.ritorno(() => {}, lenta.aperti[0]!))
        expect(await ripresa).toMatchObject({ ok: true })
    })
})
