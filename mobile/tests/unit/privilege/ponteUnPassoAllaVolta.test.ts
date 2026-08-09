import { describe, expect, it } from 'vitest'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import {
    talosCodiceValido,
    talosPonteGuida,
    talosPonteMotivo,
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
