import { describe, expect, it } from 'vitest'
import {
    arrivaIstantanea,
    creaStatoImpostazioniR4,
    fineScrittura,
    inizioScrittura,
    istantaneaR4,
} from '@/lib/harness/r4/impostazioniDalVivoR4'

/**
 * ⛔ IMPOSTAZIONI-DAL-VIVO (owner 27/10/2026: «da remoto il dispositivo collegato deve poter istantaneamente e robustamente cambiare
 * tutte le impostazioni e sul pc devono essere visibili subito … tutte queste cose devono essere assolutamente testate e robuste»).
 * Contratto F del censimento (Desktop, r4 `f573cdc93`): ogni cambio annuncia la FOTOGRAFIA intera con una `versione` che cresce.
 * Regola del dispositivo, come la finestra del PC (`applicaIstantaneaImpostazioni`): si scarta ciò che non è più nuovo di quel che
 * si è applicato; mentre una scrittura propria è in volo si trattiene l'ultima arrivata; alla risposta vale la sua fotografia, poi
 * quella trattenuta se è più nuova.
 */
const FOTO = {
    modello: 'chatgpt:gpt-6-luna', modelId: 'gpt-6-luna', provider: 'chatgpt', runtimeId: null, modelloPlanner: null,
    reasoning: { effort: 'high' }, permessi: 'Full access', permessiPerAttrezzo: { coordinazione: 'sempre', shell: 'chiedi' },
    modalitaOperativa: 'piano', fallbackProviders: [], doveGiranoIComandi: 'wsl2', comandiNellaConversazione: true, nome: 'ciao-2',
    versione: 1_761_570_000_000,
}
const foto = (versione: number, cambi: Record<string, unknown> = {}) => istantaneaR4({ ...FOTO, ...cambi, versione })!

describe('IMPOSTAZIONI-DAL-VIVO — la fotografia e la regola del dispositivo', () => {
    it('IDV-01 la fotografia si legge campo per campo', () => {
        expect(istantaneaR4(FOTO)).toEqual({
            modello: 'chatgpt:gpt-6-luna', reasoning: { effort: 'high' }, permessi: 'Full access',
            permessiPerAttrezzo: { coordinazione: 'sempre', shell: 'chiedi' }, modalitaOperativa: 'piano', nome: 'ciao-2',
            doveGiranoIComandi: 'wsl2', comandiNellaConversazione: true, versione: 1_761_570_000_000,
        })
    })

    it('IDV-02 i vuoti restano vuoti; un valore di modo sconosciuto è Normale, come il desktop', () => {
        expect(istantaneaR4({ versione: 3, modello: null, reasoning: null, permessi: null, permessiPerAttrezzo: {}, modalitaOperativa: 'workflow', nome: null })).toEqual({
            modello: null, reasoning: null, permessi: null, permessiPerAttrezzo: {}, modalitaOperativa: 'normale', nome: null,
            doveGiranoIComandi: null, comandiNellaConversazione: false, versione: 3,
        })
    })

    it('IDV-03 una fotografia storta non diventa stato: senza versione intera, nulla', () => {
        for (const storta of [null, 'x', [], {}, { ...FOTO, versione: '7' }, { ...FOTO, versione: 1.5 }, { ...FOTO, versione: -1 }]) {
            expect(istantaneaR4(storta)).toBeNull()
        }
        // un permesso per attrezzo non testuale si toglie, gli altri restano
        expect(istantaneaR4({ ...FOTO, permessiPerAttrezzo: { shell: 'chiedi', x: 3 } })!.permessiPerAttrezzo).toEqual({ shell: 'chiedi' })
    })

    it('IDV-04 si applica solo ciò che è più nuovo di quel che si è applicato', () => {
        let s = creaStatoImpostazioniR4()
        let r = arrivaIstantanea(s, foto(10))
        expect(r.applica?.versione).toBe(10)
        s = r.stato
        r = arrivaIstantanea(s, foto(10))
        expect(r.applica).toBeNull()
        r = arrivaIstantanea(r.stato, foto(9))
        expect(r.applica).toBeNull()
        r = arrivaIstantanea(r.stato, foto(11))
        expect(r.applica?.versione).toBe(11)
    })

    it('IDV-05 con una scrittura propria in volo si trattiene l\'ultima arrivata, e non si applica niente', () => {
        let s = inizioScrittura(arrivaIstantanea(creaStatoImpostazioniR4(), foto(10)).stato)
        let r = arrivaIstantanea(s, foto(12, { modello: 'b' }))
        expect(r.applica).toBeNull()
        r = arrivaIstantanea(r.stato, foto(11, { modello: 'a' }))
        expect(r.applica).toBeNull()
        expect(r.stato.trattenuta?.versione).toBe(12)
        s = r.stato
        // la risposta della propria scrittura (13) vale; la trattenuta (12) è più vecchia e cade
        const fine = fineScrittura(s, foto(13, { modello: 'mio' }))
        expect(fine.applica?.modello).toBe('mio')
        expect(fine.stato).toEqual({ applicata: 13, inVolo: 0, trattenuta: null })
    })

    it('IDV-06 alla risposta, la trattenuta più nuova della risposta vince', () => {
        let s = inizioScrittura(creaStatoImpostazioniR4())
        s = arrivaIstantanea(s, foto(20, { modello: 'dal-pc' })).stato
        const fine = fineScrittura(s, foto(19, { modello: 'mio' }))
        expect(fine.applica?.modello).toBe('dal-pc')
        expect(fine.stato.applicata).toBe(20)
    })

    it('IDV-07 una risposta senza fotografia (PC più vecchio, o rifiuto) lascia passare la trattenuta', () => {
        let s = inizioScrittura(arrivaIstantanea(creaStatoImpostazioniR4(), foto(5)).stato)
        s = arrivaIstantanea(s, foto(6)).stato
        expect(fineScrittura(s, null).applica?.versione).toBe(6)
        expect(fineScrittura(inizioScrittura(creaStatoImpostazioniR4()), null).applica).toBeNull()
    })

    it('IDV-08 due scritture in volo: si trattiene finché non tornano tutte e due', () => {
        let s = inizioScrittura(inizioScrittura(creaStatoImpostazioniR4()))
        s = arrivaIstantanea(s, foto(30)).stato
        const prima = fineScrittura(s, foto(31))
        expect(prima.applica).toBeNull()
        expect(prima.stato.inVolo).toBe(1)
        expect(prima.stato.trattenuta?.versione).toBe(31)
        const seconda = fineScrittura(prima.stato, foto(32))
        expect(seconda.applica?.versione).toBe(32)
        expect(seconda.stato).toEqual({ applicata: 32, inVolo: 0, trattenuta: null })
    })
})
