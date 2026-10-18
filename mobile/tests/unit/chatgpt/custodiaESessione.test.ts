// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// Il ponte del Keystore non esiste in Node: la custodia qui riceve sempre un deposito finto, mai quello vero.
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {} }))

import { creaCustodiaChatgpt, creaSessioneChatgpt } from '@/services/chatgptCustodia'
import { EMITTENTE, MARGINE_DI_RINNOVO_MS, SCOPE_DEL_PIANO } from '@/lib/chatgpt/oauth'

/**
 * N15 fetta 4 (mobile, 13/10/2026) — custodia nel Keystore e rinnovo UNO alla volta. Le regole sono quelle di
 * `chatgpt-accesso.mjs` e `chatgpt-custodia.mjs` del desktop r4 `2a61e35dc`: due voci con vite diverse (la registrazione
 * sopravvive all'uscita, la sessione no); il refresh token ruota a ogni uso, quindi due rinnovi insieme ne brucerebbero uno;
 * un rinnovo finito per sempre toglie la sessione, un guasto di rete no.
 */
function deposito() {
    const mappa = new Map<string, string>()
    // Revisione 13/10/2026: il deposito finto non falliva mai, quindi niente provava che cosa succede quando il Keystore
    // non risponde (C1) o non scrive (C2). Ogni guasto si accende dalla prova.
    const guasti = { leggere: false, scrivere: false, togliere: false }
    return {
        mappa,
        guasti,
        backend: {
            get: async (k: string) => { if (guasti.leggere) throw new Error('TALOS_KEYSTORE_GET_TIMEOUT'); return mappa.get(k) ?? null },
            set: async (k: string, v: string) => { if (guasti.scrivere) throw new Error('TALOS_KEYSTORE_SET_TIMEOUT'); mappa.set(k, v) },
            remove: async (k: string) => { if (guasti.togliere) throw new Error('TALOS_KEYSTORE_REMOVE_TIMEOUT'); return mappa.delete(k) },
        },
    }
}

const ORA = 1_800_000_000_000
const SCOPERTA = { issuer: EMITTENTE, token_endpoint: 'https://auth.openai.com/api/accounts/oauth/token', jwks_uri: 'https://auth.openai.com/jwks', revocation_endpoint: 'https://auth.openai.com/revoke' }
const sessione = (extra = {}) => ({ clientId: 'oaiapp_abc123', accessToken: 'ACCESSO-1', refreshToken: 'REFRESH-1', idToken: null,
    scadeAlle: ORA + 60 * 60 * 1000, rinnovaNonPrimaDi: null, scopes: ['openid', SCOPE_DEL_PIANO], ...extra })
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
const codice = async (fn: () => Promise<unknown>) => { try { await fn() } catch (e) { return (e as { code?: string }).code ?? null } return null }

function rete(risposteToken: Array<() => Response | Promise<Response>>) {
    const chiamate: Array<{ url: string, body: string }> = []
    /** Una revoca che la prova può tenere ferma (per mettere in fila le cose nell'ordine che rompeva). */
    const revoca = { prima: (_corpo: string): Promise<void> | void => {} }
    const fetchFn = vi.fn(async (url: RequestInfo | URL, opzioni: RequestInit = {}) => {
        const u = String(url)
        if (u.endsWith('/.well-known/openid-configuration')) return json(SCOPERTA)
        chiamate.push({ url: u, body: String(opzioni.body ?? '') })
        if (u === SCOPERTA.revocation_endpoint) { await revoca.prima(String(opzioni.body ?? '')); return new Response('', { status: 200 }) }
        return risposteToken.shift()!()
    })
    return { fetchFn: fetchFn as unknown as typeof fetch, chiamate, revoca }
}

describe('N15 — custodia nel Keystore', () => {
    it('N15-CUST-01: due voci, lette come sono state scritte; una voce rotta si legge come ASSENTE; una voce ignota è un errore', async () => {
        const d = deposito()
        const custodia = creaCustodiaChatgpt({ backend: d.backend })
        expect(await custodia.leggi('sessione')).toBeNull()
        await custodia.scrivi('sessione', sessione())
        await custodia.scrivi('registrazione', { clientId: 'oaiapp_abc123', idDellHost: 'urn:uuid:1' })
        expect((await custodia.leggi('sessione'))?.refreshToken).toBe('REFRESH-1')
        // ⛔ fuori dallo spazio delle chiavi dei fornitori: il backup delle chiavi non le vede
        expect([...d.mappa.keys()].every((k) => k.startsWith('talos.chatgpt.') && !k.startsWith('talos.provider.key.'))).toBe(true)
        d.mappa.set('talos.chatgpt.sessione', '{rotto')
        expect(await custodia.leggi('sessione')).toBeNull()
        await custodia.togli('sessione')
        await custodia.togli('sessione') // non lancia se non c'era
        expect((await custodia.leggi('registrazione'))?.clientId).toBe('oaiapp_abc123')
        expect(await codice(() => custodia.leggi('altro' as never))).toBe('CHATGPT_CUSTODIA_VOCE')
    })
})

describe('N15 — il token di accesso e il rinnovo uno alla volta', () => {
    async function pronto(s = sessione(), risposte: Array<() => Response | Promise<Response>> = []) {
        const d = deposito()
        const custodia = creaCustodiaChatgpt({ backend: d.backend })
        await custodia.scrivi('registrazione', { clientId: s.clientId, idDellHost: 'urn:uuid:1' })
        await custodia.scrivi('sessione', s)
        const r = rete(risposte)
        let adesso = ORA
        const sess = creaSessioneChatgpt({ custodia, fetchFn: r.fetchFn, clock: () => adesso })
        return { custodia, sess, ...r, guasti: d.guasti, mappa: d.mappa, avanza: (ms: number) => { adesso += ms } }
    }
    const nuovi = (n: number) => () => json({ access_token: `ACCESSO-${n}`, refresh_token: `REFRESH-${n}`, token_type: 'Bearer', expires_in: 3600 })

    it('N15-SESS-01: un token che vale ancora si usa senza toccare la rete; senza sessione o senza lo scope del piano lo si dice', async () => {
        const { sess, fetchFn } = await pronto()
        expect(await sess.tokenDiAccesso()).toBe('ACCESSO-1')
        expect(fetchFn).not.toHaveBeenCalled()
        const vuoto = creaSessioneChatgpt({ custodia: creaCustodiaChatgpt({ backend: deposito().backend }), fetchFn, clock: () => ORA })
        expect(await codice(() => vuoto.tokenDiAccesso())).toBe('CHATGPT_NON_COLLEGATO')
        const senzaPiano = await pronto(sessione({ scopes: ['openid'] }))
        expect(await codice(() => senzaPiano.sess.tokenDiAccesso())).toBe('CHATGPT_PIANO_NON_ABILITATO')
    })

    it('N15-SESS-02: vicino alla scadenza due richieste insieme fanno UN solo rinnovo, e il refresh ruotato viene salvato', async () => {
        const { sess, chiamate, custodia } = await pronto(sessione({ scadeAlle: ORA + MARGINE_DI_RINNOVO_MS - 1 }), [nuovi(2), nuovi(3)])
        const [a, b] = await Promise.all([sess.tokenDiAccesso(), sess.tokenDiAccesso()])
        expect([a, b]).toEqual(['ACCESSO-2', 'ACCESSO-2'])
        expect(chiamate.filter((c) => c.url === SCOPERTA.token_endpoint)).toHaveLength(1)
        expect(chiamate[0]!.body).toContain('grant_type=refresh_token')
        expect(chiamate[0]!.body).toContain('refresh_token=REFRESH-1')
        expect((await custodia.leggi('sessione'))?.refreshToken).toBe('REFRESH-2')
        // dopo, il token nuovo vale: nessun'altra chiamata
        expect(await sess.tokenDiAccesso()).toBe('ACCESSO-2')
        expect(chiamate).toHaveLength(1)
    })

    it('N15-SESS-03: un rinnovo finito per sempre toglie la sessione (la registrazione resta) e chiede di rifare l accesso', async () => {
        const { sess, custodia } = await pronto(sessione({ scadeAlle: ORA - 1 }), [() => json({ error: 'invalid_grant' }, 400)])
        expect(await codice(() => sess.tokenDiAccesso())).toBe('CHATGPT_ACCESSO_SCADUTO')
        expect(await custodia.leggi('sessione')).toBeNull()
        expect((await custodia.leggi('registrazione'))?.clientId).toBe('oaiapp_abc123')
    })

    it('N15-SESS-04 AL CONTRARIO: un guasto di rete non butta via un token che vale ancora; scaduto, lo dice come da riprovare', async () => {
        const giu = () => { throw new TypeError('rete giù') }
        const vale = await pronto(sessione({ scadeAlle: ORA + MARGINE_DI_RINNOVO_MS - 1 }), [giu as never])
        expect(await vale.sess.tokenDiAccesso()).toBe('ACCESSO-1')
        expect((await vale.custodia.leggi('sessione'))?.refreshToken).toBe('REFRESH-1')
        const scaduto = await pronto(sessione({ scadeAlle: ORA - 1 }), [() => json({ error: 'server_error' }, 500)])
        expect(await codice(() => scaduto.sess.tokenDiAccesso())).toBe('CHATGPT_RINNOVO_FALLITO')
        expect((await scaduto.custodia.leggi('sessione'))?.refreshToken).toBe('REFRESH-1')
    })

    it('N15-SESS-05: scollegato mentre il rinnovo è in viaggio ⇒ niente si salva e il refresh appena nato viene revocato', async () => {
        let sblocca: (r: Response) => void = () => {}
        const lenta = () => new Promise<Response>((ok) => { sblocca = ok })
        const { sess, custodia, chiamate } = await pronto(sessione({ scadeAlle: ORA - 1 }), [lenta])
        const inViaggio = codice(() => sess.tokenDiAccesso())
        await vi.waitFor(() => expect(chiamate).toHaveLength(1))
        await custodia.togli('sessione')
        sblocca(nuovi(2)())
        expect(await inViaggio).toBe('CHATGPT_NON_COLLEGATO')
        expect(await custodia.leggi('sessione')).toBeNull()
        const revoca = chiamate.find((c) => c.url === SCOPERTA.revocation_endpoint)
        expect(revoca?.body).toContain('token=REFRESH-2')
    })

    it('N15-SESS-06: uscire revoca il refresh, toglie la sessione e TIENE la registrazione; nessun token nei messaggi', async () => {
        const { sess, custodia, chiamate } = await pronto()
        expect(await sess.esci()).toEqual({ revocaConfermata: true })
        expect(chiamate.find((c) => c.url === SCOPERTA.revocation_endpoint)?.body).toContain('token=REFRESH-1')
        expect(await custodia.leggi('sessione')).toBeNull()
        expect((await custodia.leggi('registrazione'))?.idDellHost).toBe('urn:uuid:1')
        const guasto = await pronto(sessione({ scadeAlle: ORA - 1 }), [() => json({ error: 'invalid_grant', error_description: 'REFRESH-1' }, 400)])
        try { await guasto.sess.tokenDiAccesso() } catch (e) { expect((e as Error).message).not.toMatch(/REFRESH|ACCESSO-/) }
    })

    /**
     * ⛔ N15-SESS-07 — revisione 13/10/2026 (C1). Dopo il rinnovo si rilegge la sessione per sapere se nel frattempo ci si è
     * scollegati. Una rilettura che FALLIVA (Keystore che non risponde) era letta come «scollegato»: il refresh appena
     * ruotato veniva revocato e nel deposito restava quello vecchio, già bruciato ⇒ accesso da rifare. «Non si legge» non è
     * «non c'è»: il token nuovo si salva.
     */
    it('N15-SESS-07: una rilettura che fallisce dopo il rinnovo non è uno scollegamento — il refresh ruotato si salva, niente revoca', async () => {
        // il Keystore smette di leggere proprio mentre il rinnovo è in viaggio, e si riprende poco dopo
        const fermo: { guasti?: { leggere: boolean } } = {}
        const p = await pronto(sessione({ scadeAlle: ORA - 1 }), [() => {
            fermo.guasti!.leggere = true
            setTimeout(() => { fermo.guasti!.leggere = false }, 15)
            return nuovi(2)()
        }])
        fermo.guasti = p.guasti
        expect(await p.sess.tokenDiAccesso()).toBe('ACCESSO-2')
        await new Promise((ok) => setTimeout(ok, 20))
        expect((await p.custodia.leggi('sessione'))?.refreshToken).toBe('REFRESH-2')
        expect(p.chiamate.find((c) => c.url === SCOPERTA.revocation_endpoint)).toBeUndefined()
    })

    /**
     * ⛔ N15-SESS-08 — revisione 13/10/2026 (C2). Il refresh è ruotato da OpenAI ma il deposito non scrive: restava salvata la
     * sessione col refresh VECCHIO (bruciato), che l'interfaccia mostrava come «Collegato» fino al rinnovo dopo. Ora, se
     * nemmeno il secondo tentativo scrive, il token nato si revoca, la sessione si toglie e — anche se pure il togliere
     * fallisce — per questa vita dell'app non risulta più collegata.
     */
    it('N15-SESS-08: scrittura fallita dopo la rotazione ⇒ nessuna sessione morta che sembra collegata', async () => {
        const { sess, chiamate, guasti } = await pronto(sessione({ scadeAlle: ORA - 1 }), [nuovi(2)])
        guasti.scrivere = true
        guasti.togliere = true
        expect(await codice(() => sess.tokenDiAccesso())).toBe('CHATGPT_CUSTODIA_FALLITA')
        expect(chiamate.find((c) => c.url === SCOPERTA.revocation_endpoint)?.body).toContain('token=REFRESH-2')
        expect((await sess.stato()).collegato).toBe(false)
        expect(await codice(() => sess.tokenDiAccesso())).toBe('CHATGPT_NON_COLLEGATO')
        expect(chiamate.filter((c) => c.url === SCOPERTA.token_endpoint)).toHaveLength(1) // il refresh bruciato non si riprova
    })

    /**
     * ⛔ N15-SESS-09 — revisione 13/10/2026 (C3). Uscire MENTRE un rinnovo è in viaggio: l'uscita leggeva il refresh vecchio,
     * il rinnovo salvava quello nuovo, e l'uscita revocava il vecchio (già ruotato) e toglieva la sessione ⇒ il refresh
     * nuovo restava valido da OpenAI dopo un'uscita «confermata». Ora l'uscita aspetta il rinnovo, che non salva niente.
     */
    it('N15-SESS-09: uscire mentre il rinnovo è in viaggio ⇒ anche il refresh appena nato viene revocato, e niente resta salvato', async () => {
        let sblocca: (r: Response) => void = () => {}
        const lenta = () => new Promise<Response>((ok) => { sblocca = ok })
        const { sess, custodia, chiamate, revoca } = await pronto(sessione({ scadeAlle: ORA - 1 }), [lenta])
        // la revoca del refresh VECCHIO resta ferma finché il rinnovo non ha finito: è l'ordine che lasciava vivo il nuovo
        let liberaRevoca: () => void = () => {}
        revoca.prima = (corpo) => (corpo.includes('token=REFRESH-1') ? new Promise<void>((ok) => { liberaRevoca = ok }) : undefined)
        const inViaggio = sess.tokenDiAccesso().then((t) => t, (e: { code?: string }) => e.code)
        await vi.waitFor(() => expect(chiamate).toHaveLength(1))
        const uscita = sess.esci()
        await new Promise((ok) => setTimeout(ok, 10))
        sblocca(nuovi(2)())
        expect(await inViaggio).toBe('CHATGPT_NON_COLLEGATO')
        await vi.waitFor(() => expect(chiamate.some((c) => c.url === SCOPERTA.revocation_endpoint && c.body.startsWith('token=REFRESH-1'))).toBe(true))
        liberaRevoca()
        await uscita
        expect(chiamate.filter((c) => c.url === SCOPERTA.revocation_endpoint).some((c) => c.body.includes('token=REFRESH-2'))).toBe(true)
        expect(await custodia.leggi('sessione')).toBeNull()
    })

    /**
     * ⛔ N15-SESS-10 — revisione 13/10/2026 (C4). Un rinnovo «finito per sempre» toglieva la sessione senza guardare se era
     * ancora QUELLA: un nuovo accesso arrivato nel frattempo (che per OpenAI invalida il refresh di prima) veniva cancellato
     * dal rinnovo vecchio che falliva.
     */
    it('N15-SESS-10: un rinnovo vecchio che fallisce per sempre non cancella la sessione di un accesso nuovo', async () => {
        let sblocca: (r: Response) => void = () => {}
        const lenta = () => new Promise<Response>((ok) => { sblocca = ok })
        const { sess, custodia, chiamate } = await pronto(sessione({ scadeAlle: ORA - 1 }), [lenta])
        const inViaggio = codice(() => sess.tokenDiAccesso())
        await vi.waitFor(() => expect(chiamate).toHaveLength(1))
        await custodia.scrivi('sessione', sessione({ accessToken: 'ACCESSO-NUOVO', refreshToken: 'REFRESH-NUOVO' }))
        sblocca(json({ error: 'invalid_grant' }, 400))
        expect(await inViaggio).toBe('CHATGPT_NON_COLLEGATO')
        expect((await custodia.leggi('sessione'))?.refreshToken).toBe('REFRESH-NUOVO')
        expect(await sess.tokenDiAccesso()).toBe('ACCESSO-NUOVO')
    })

    /**
     * ⛔ N15-SESS-11 — revisione 13/10/2026 (C5). Chi FORZA il rinnovo (il piano gli ha appena risposto 401) e si accoda a un
     * rinnovo già partito senza forzare riceveva, se la rete cadeva, lo stesso token che aveva appena visto rifiutare.
     */
    it('N15-SESS-11: chi forza il rinnovo non riceve mai indietro il token vecchio, nemmeno accodandosi a un rinnovo non forzato', async () => {
        const giu = () => { throw new TypeError('rete giù') }
        const { sess } = await pronto(sessione({ scadeAlle: ORA + MARGINE_DI_RINNOVO_MS - 1 }), [giu as never])
        const [calmo, forzato] = await Promise.allSettled([sess.tokenDiAccesso(), sess.tokenDiAccesso({ forzaRinnovo: true })])
        expect(calmo).toMatchObject({ status: 'fulfilled', value: 'ACCESSO-1' })
        expect(forzato).toMatchObject({ status: 'rejected', reason: { code: 'CHATGPT_RINNOVO_FALLITO' } })
    })

    /**
     * ⛔ N15-SESS-12 — revisione 13/10/2026 (C6). Un rinnovo che falliva PRIMA della sua prima attesa (voce salvata con un
     * client di forma sbagliata) lasciava `rinnovoInCorso` puntato per sempre alla promessa già finita: ogni rinnovo dopo,
     * anche a sessione risanata, tornava lo stesso errore fino al riavvio.
     */
    it('N15-SESS-12: un rinnovo che fallisce subito non resta incastrato — risanata la sessione, il rinnovo dopo riesce', async () => {
        const { sess, custodia } = await pronto(sessione({ scadeAlle: ORA - 1, clientId: 'rotto' }), [nuovi(2)])
        expect(await codice(() => sess.tokenDiAccesso())).toBe('CHATGPT_CLIENT_NON_VALIDO')
        await custodia.scrivi('sessione', sessione({ scadeAlle: ORA - 1 }))
        expect(await sess.tokenDiAccesso()).toBe('ACCESSO-2')
    })

    /*
     * ⛔ CHATGPT NEL CODICE (owner 18/10/2026: «Deve selezionarli esattamente come i modelli della chat», un solo accesso; ledger
     * `LEDGER-CHATGPT-NEL-CODICE-2026-10-18.md`): l'app è l'unico custode e SPINGE a r4 il token con la sua scadenza prima di ogni giro.
     * r4 rifiuta un token che scade entro 5 minuti, e un giro dura minuti: il token spinto deve valere ALMENO `almenoMs`.
     */
    const DIECI_MINUTI = 10 * 60 * 1000
    it('N15-SESS-13: accessoValido dà token e scadenza; se vale ancora almeno quanto chiesto non tocca la rete', async () => {
        const { sess, fetchFn } = await pronto()
        expect(await sess.accessoValido({ almenoMs: DIECI_MINUTI })).toEqual({ accessToken: 'ACCESSO-1', scadeAlle: ORA + 60 * 60 * 1000 })
        expect(fetchFn).not.toHaveBeenCalled()
    })

    it('N15-SESS-14: un token che vale meno di quanto chiesto si rinnova, con UN solo rinnovo anche insieme alla chat', async () => {
        const { sess, chiamate } = await pronto(sessione({ scadeAlle: ORA + 8 * 60 * 1000 }), [nuovi(2), nuovi(3)])
        const [codiceR4, chat] = await Promise.all([sess.accessoValido({ almenoMs: DIECI_MINUTI }), sess.tokenDiAccesso({ forzaRinnovo: true })])
        expect(codiceR4).toEqual({ accessToken: 'ACCESSO-2', scadeAlle: ORA + 3600 * 1000 })
        expect(chat).toBe('ACCESSO-2')
        expect(chiamate.filter((c) => c.url === SCOPERTA.token_endpoint)).toHaveLength(1)
    })

    it('N15-SESS-15: forzato non ridà il token rifiutato; un rinnovo fallito non passa un token troppo corto; nessun token nei messaggi', async () => {
        const forzato = await pronto(sessione(), [nuovi(2)])
        expect((await forzato.sess.accessoValido({ almenoMs: DIECI_MINUTI, forzaRinnovo: true })).accessToken).toBe('ACCESSO-2')
        const corto = await pronto(sessione({ scadeAlle: ORA + 8 * 60 * 1000 }), [() => { throw Object.assign(new TypeError('fetch failed'), {}) }])
        let preso: unknown = null
        try { await corto.sess.accessoValido({ almenoMs: DIECI_MINUTI }) } catch (e) { preso = e }
        expect((preso as { code?: string }).code).toBe('CHATGPT_RINNOVO_FALLITO')
        expect(String((preso as Error).message)).not.toMatch(/ACCESSO|REFRESH/u)
        // forzato (r4 ha appena rifiutato quel token) e rinnovo caduto per rete: il token vecchio, anche se lungo, NON torna
        const rifiutato = await pronto(sessione(), [() => { throw new TypeError('fetch failed') }])
        expect(await codice(() => rifiutato.sess.accessoValido({ almenoMs: DIECI_MINUTI, forzaRinnovo: true }))).toBe('CHATGPT_RINNOVO_FALLITO')
    })
})
