import { describe, expect, it } from 'vitest'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import {
    TALOS_TENTATIVI_DOPO_CADUTA,
    TALOS_TENTATIVI_DOPO_SCOSSA,
    talosCodiceValido,
    talosPonteGuida,
    talosPonteMotivo,
    talosPonteRiaggancioAutomatico,
    type TalosPonteRiaggancio,
    type TalosPonteStato,
} from '@/lib/privilege/pontePasso'

function stato(parziale: Partial<TalosPonteStato> = {}): TalosPonteStato {
    return {
        packaged: true,
        connected: false,
        reconnectFailed: false,
        ...parziale,
    }
}

describe('il ponte mostra UN passo alla volta', () => {
    it('senza i binari non promette niente, e non chiede un codice', () => {
        const g = talosPonteGuida(stato({ packaged: false }))
        expect(g.passo).toBe('unavailable')
        expect(g.actionKey).toBeNull()
        expect(g.wantsCode).toBe(false)
    })

    it('collegato: nessun passo da fare, e lo dice', () => {
        const g = talosPonteGuida(stato({ connected: true }))
        expect(g.passo).toBe('ready')
        expect(g.ready).toBe(true)
        expect(g.actionKey).toBeNull()
    })

    it('⛔ prima si PROVA a ricollegarsi, e NON si chiede il codice', () => {
        // È il caso di tutti i giorni: l'accoppiamento dura, il collegamento no.
        // Chiedere il codice qui manderebbe a cercare una finestrella inutile.
        const g = talosPonteGuida(stato())
        expect(g.passo).toBe('reconnect')
        expect(g.wantsCode).toBe(false)
        expect(g.actionKey).toBe('ponte.reconnectAction')
    })

    it('solo DOPO che il ricollegamento è fallito si chiede il codice', () => {
        const g = talosPonteGuida(stato({ reconnectFailed: true }))
        expect(g.passo).toBe('pair')
        expect(g.wantsCode).toBe(true)
        expect(g.actionKey).toBe('ponte.pairAction')
    })

    it('⛔ e la strada CONSIGLIATA è la finestra flottante, non il campo', () => {
        /*
         * Non è preferenza estetica: il campo nella pagina NON PUÒ funzionare.
         * Misurato il 2026-08-08 alle 22:24 — uscire da Impostazioni per venire
         * a scrivere qui chiude la finestrella di sistema e uccide l'annuncio
         * `_adb-tls-pairing._tcp`. Se un giorno questa riga sparisse, resterebbe
         * una schermata che chiede una cosa impossibile.
         */
        const g = talosPonteGuida(stato({ reconnectFailed: true }))
        expect(g.floatKey).toBe('ponte.floatAction')
        expect(g.floatNeedsPermission).toBe(false)
    })

    it('⛔ NON esiste piu un passo «concedi la finestra flottante»', () => {
        /*
         * Owner 2026-08-09: «appena entro in dev settings la finestra
         * flottante viene coperta» — e poi, vista la notifica funzionare: «se
         * la notifica funziona, la finestra flottante se ne deve andare
         * definitivamente».
         *
         * PROVATO sul Pad con le opzioni sviluppatore in primo piano: notifica
         * viva, pulsante «Accoppia», campo di scrittura aperto, tastiera su.
         * SYSTEM_ALERT_WINDOW e' uscito dal manifest.
         *
         * ⇒ Un passo che chiede un permesso che non usiamo piu' sarebbe la
         * peggiore delle cose: insegna a concedere senza leggere.
         */
        const g = talosPonteGuida(stato({ reconnectFailed: true }))
        expect(g.floatNeedsPermission).toBe(false)
        expect(g.floatKey).toBe('ponte.floatAction')
    })

    it('negli altri passi la finestra flottante non si propone', () => {
        // Offrirla a chi deve solo ricollegarsi sarebbe chiedere un permesso
        // invasivo per un passo che non ne ha bisogno.
        for (const s of [stato(), stato({ connected: true }), stato({ packaged: false })]) {
            expect(talosPonteGuida(s).floatKey).toBeNull()
        }
    })

    it('«collegato» vince su «ricollegamento fallito»: lo stato vivo batte la memoria', () => {
        // Un fallimento di mezz'ora fa non deve nascondere un telefono che
        // adesso è collegato — è la stessa regola per cui non teniamo flag.
        const g = talosPonteGuida(stato({ connected: true, reconnectFailed: true }))
        expect(g.passo).toBe('ready')
    })
})

describe('⭐ TALOS si riaggancia DA SOLO — e la frase a schermo diventa vera', () => {
    function riaggancio(parziale: Partial<TalosPonteRiaggancio> = {}): TalosPonteRiaggancio {
        return {
            packaged: true,
            connected: false,
            tentativiRimasti: TALOS_TENTATIVI_DOPO_CADUTA,
            inCorso: false,
            ...parziale,
        }
    }

    it('ponte giù col credito pieno: ci prova, senza che nessuno prema niente', () => {
        /*
         * ⛔ MISURATO sul Pad il 2026-08-09: staccato il ponte, uscito e
         * rientrato nella pagina, **undici** letture di stato in ventitré
         * secondi e ZERO tentativi. E il tocco che mancava valeva 1.169 ms.
         */
        expect(talosPonteRiaggancioAutomatico(riaggancio())).toEqual({ tenta: true, rimasti: 0 })
    })

    it('⛔ finito il credito NON ci riprova: la sentinella batte ogni 2 s', () => {
        // Senza il tetto sarebbe un `adb connect` ogni due secondi per sempre.
        expect(talosPonteRiaggancioAutomatico(riaggancio({ tentativiRimasti: 0 })))
            .toEqual({ tenta: false, rimasti: 0 })
    })

    it('collegato: niente da tentare', () => {
        expect(talosPonteRiaggancioAutomatico(riaggancio({ connected: true })).tenta).toBe(false)
    })

    it('senza binari non si tenta: non c\'è niente da eseguire', () => {
        expect(talosPonteRiaggancioAutomatico(riaggancio({ packaged: false })).tenta).toBe(false)
    })

    it('⛔ senza binari il credito NON si consuma: non è un tentativo, è un\'assenza', () => {
        // Se lo consumasse, installare i binari a metà sessione lascerebbe TALOS
        // senza tentativi proprio quando comincia ad averne uno da fare.
        expect(talosPonteRiaggancioAutomatico(riaggancio({ packaged: false, tentativiRimasti: 3 })).rimasti)
            .toBe(3)
    })

    it('con un\'operazione già in volo non se ne apre una seconda', () => {
        // Il caso vero: la persona ha premuto «Ricollega» e la sentinella
        // scatta nello stesso istante.
        const esito = talosPonteRiaggancioAutomatico(riaggancio({ inCorso: true, tentativiRimasti: 2 }))
        expect(esito.tenta).toBe(false)
        expect(esito.rimasti, 'e il credito resta intatto: non ha tentato niente').toBe(2)
    })

    it('⛔ IL VERSO CONTRARIO — il ponte torna su, e la caduta DOPO ha il suo tentativo', () => {
        /*
         * È la metà che si dimentica, e in questo progetto si è già dimenticata
         * una volta: la sentinella guardava l'arrivo del ponte e non la caduta,
         * e il difetto si è visto solo sul dispositivo.
         *
         * Qui si percorre la vita intera: cade, tenta, resta giù, non ritenta,
         * torna su, ricade — e ritenta.
         */
        let credito = TALOS_TENTATIVI_DOPO_CADUTA
        const giro = (stato: Partial<TalosPonteRiaggancio>) => {
            const esito = talosPonteRiaggancioAutomatico(riaggancio({ ...stato, tentativiRimasti: credito }))
            credito = esito.rimasti
            return esito.tenta
        }

        expect(giro({ connected: false }), 'prima caduta: ci prova').toBe(true)
        expect(giro({ connected: false }), 'ancora giù: non insiste').toBe(false)
        expect(giro({ connected: true }), 'collegato: niente da fare').toBe(false)
        expect(credito, 'il credito si è RICARICATO').toBe(TALOS_TENTATIVI_DOPO_CADUTA)
        expect(giro({ connected: false }), 'caduta nuova: ci riprova').toBe(true)
    })

    it('⛔ e senza il riarmo il giro sopra fallirebbe — la prova che il test morde', () => {
        // Un credito che non si ricarica mai: l'ultima riga del giro
        // diventerebbe `false`, cioè TALOS non ci riproverebbe MAI più.
        expect(talosPonteRiaggancioAutomatico(riaggancio({ tentativiRimasti: 0 })).tenta).toBe(false)
    })

    it('⛔⛔ LA SCOSSA vale più di una caduta: il Debug wireless riacceso cambia PORTA', () => {
        /*
         * MISURATO sul Pad il 2026-08-10, ed è il difetto che ha creato questo
         * numero: riacceso il Debug wireless, TALOS NON tornava su in 40 s.
         *
         * `adbd` riparte su una porta nuova. Il primo tentativo la sbaglia per
         * forza — l'annuncio nuovo non esiste ancora — e con un credito da un
         * colpo solo quel fallimento chiudeva la porta per sempre.
         */
        expect(TALOS_TENTATIVI_DOPO_SCOSSA).toBeGreaterThan(TALOS_TENTATIVI_DOPO_CADUTA)

        let credito = TALOS_TENTATIVI_DOPO_SCOSSA
        const tentativi: boolean[] = []
        for (let i = 0; i < 5; i++) {
            const esito = talosPonteRiaggancioAutomatico(riaggancio({ tentativiRimasti: credito }))
            credito = esito.rimasti
            tentativi.push(esito.tenta)
        }
        expect(tentativi.filter(Boolean).length, 'tre tentativi, poi si ferma')
            .toBe(TALOS_TENTATIVI_DOPO_SCOSSA)
        expect(tentativi.at(-1), 'e non insiste all\'infinito').toBe(false)
    })
})

describe('il codice a sei cifre', () => {
    it.each(['380569', ' 380569 ', '000000'])('accetta %s', (c) => {
        expect(talosCodiceValido(c)).toBe(true)
    })

    it.each(['38056', '3805699', '', 'abcdef', '38 569', '3805a9'])('rifiuta %s', (c) => {
        expect(talosCodiceValido(c)).toBe(false)
    })
})

describe('i motivi sono scritti in ENTRAMBE le lingue', () => {
    const chiavi = [
        'pairing-not-announced',
        'connect-not-announced',
        'bad-code',
        'connect-refused',
        'bridge-not-packaged',
        'bridge-timeout',
        'overlay-not-allowed',
        undefined,
        'un-motivo-che-non-esiste',
    ]

    it.each(chiavi)('«%s» ha una frase in italiano e in inglese', (reason) => {
        const chiave = talosPonteMotivo(reason).replace(/^ponte\./, '')
        /*
         * ⛔ Un motivo senza traduzione non fallisce: mostra la CHIAVE.
         * «ponte.reasonTimeout» a schermo è la stessa classe di difetto del nome
         * interno del tool nella scheda di consenso, chiuso col compito #23.
         */
        const it = (TALOS_IT_MESSAGES.ponte as Record<string, string>)[chiave]
        const en = (TALOS_EN_MESSAGES.ponte as Record<string, string>)[chiave]
        expect(it, `manca in italiano: ${chiave}`).toBeTruthy()
        expect(en, `manca in inglese: ${chiave}`).toBeTruthy()
    })

    it('ogni chiave usata dalla guida esiste nei due dizionari', () => {
        const usate = new Set<string>()
        for (const s of [
            stato({ packaged: false }),
            stato({ connected: true }),
            stato(),
            stato({ reconnectFailed: true }),
        ]) {
            const g = talosPonteGuida(s)
            usate.add(g.titleKey)
            usate.add(g.bodyKey)
            if (g.actionKey) usate.add(g.actionKey)
        }
        // Anche quelle scritte a mano nel template.
        usate.add('ponte.openDeveloper')
        usate.add('ponte.codeLabel')
        usate.add('ponte.fallbackNote')
        usate.add('ponte.floatTitle')
        usate.add('ponte.floatInstruction')
        for (const s of [stato({ reconnectFailed: true })]) {
            const f = talosPonteGuida(s).floatKey
            if (f) usate.add(f)
        }

        for (const chiave of usate) {
            const corta = chiave.replace(/^ponte\./, '')
            expect((TALOS_IT_MESSAGES.ponte as Record<string, string>)[corta], chiave).toBeTruthy()
            expect((TALOS_EN_MESSAGES.ponte as Record<string, string>)[corta], chiave).toBeTruthy()
        }
    })
})
