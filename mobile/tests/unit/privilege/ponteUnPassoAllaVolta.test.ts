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
    return { packaged: true, connected: false, reconnectFailed: false, ...parziale }
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

        for (const chiave of usate) {
            const corta = chiave.replace(/^ponte\./, '')
            expect((TALOS_IT_MESSAGES.ponte as Record<string, string>)[corta], chiave).toBeTruthy()
            expect((TALOS_EN_MESSAGES.ponte as Record<string, string>)[corta], chiave).toBeTruthy()
        }
    })
})
