import { describe, expect, it } from 'vitest'
import {
    type TalosFileMandabile,
    talosScegliApp,
    talosScegliFile,
} from '@/lib/tools/fileDaMandare'

const NOTA: TalosFileMandabile = {
    id: 'f1', nome: 'nota-talos.txt', tipo: 'text/plain', percorso: 'talos-vault/files/f1.txt',
}
const FOTO: TalosFileMandabile = {
    id: 'f2', nome: 'photo-1786534572843.jpg', tipo: 'image/jpeg', percorso: 'talos-vault/files/f2.jpg',
}
const METEO: TalosFileMandabile = {
    id: 'f3', nome: 'Web search - meteo Roma oggi.md', tipo: 'text/markdown', percorso: 'talos-vault/files/f3.md',
}
const TUTTI = [NOTA, FOTO, METEO]

describe('talosScegliFile', () => {
    it('trova il file col nome esatto', () => {
        expect(talosScegliFile(TUTTI, 'nota-talos.txt')).toEqual({ esito: 'trovato', file: NOTA })
    })

    it('trova ignorando maiuscole, accenti e punteggiatura', () => {
        expect(talosScegliFile(TUTTI, 'NOTA TALOS')).toEqual({ esito: 'trovato', file: NOTA })
        expect(talosScegliFile(TUTTI, 'meteo Roma')).toEqual({ esito: 'trovato', file: METEO })
    })

    it('trova quando la persona dice PIÙ del nome del file', () => {
        expect(talosScegliFile(TUTTI, 'mandami la nota talos per favore'))
            .toEqual({ esito: 'trovato', file: NOTA })
    })

    /*
     * ⛔ TRE ESITI, non due. `ambiguo` e `nessuno` portano a due cose diverse
     * da dire, e confonderle significa mandare un file a caso a una persona
     * vera — che non si annulla. È la stessa lezione dell'elenco vero dentro
     * un `ok:false`, che faceva inventare al modello app non installate.
     */
    it('dice AMBIGUO quando più d’uno corrisponde, con i nomi veri', () => {
        const doppio = [NOTA, { ...NOTA, id: 'f9', nome: 'nota-talos (1).txt' }]
        const scelta = talosScegliFile(doppio, 'nota')
        expect(scelta.esito).toBe('ambiguo')
        if (scelta.esito === 'ambiguo') expect(scelta.fra).toHaveLength(2)
    })

    it('dice NESSUNO e porta con sé cosa c’è, per non far inventare', () => {
        const scelta = talosScegliFile(TUTTI, 'bilancio 2019')
        expect(scelta.esito).toBe('nessuno')
        if (scelta.esito === 'nessuno') expect(scelta.cePero).toHaveLength(3)
    })

    it('non trova niente da una richiesta vuota', () => {
        expect(talosScegliFile(TUTTI, '   ').esito).toBe('nessuno')
        expect(talosScegliFile([], 'nota').esito).toBe('nessuno')
    })

    /*
     * ⛔ Il caso che ha motivato gli scalini: «nota» esatto batte «annotazioni»
     * che pure la contiene. Chi ha detto il nome preciso ha già scelto.
     */
    it('il nome esatto batte una corrispondenza più larga', () => {
        const con = [{ ...NOTA, nome: 'nota' }, { ...NOTA, id: 'f8', nome: 'annotazioni.pdf' }]
        const scelta = talosScegliFile(con, 'nota')
        expect(scelta.esito).toBe('trovato')
        if (scelta.esito === 'trovato') expect(scelta.file.nome).toBe('nota')
    })
})

describe('talosScegliApp', () => {
    const APP = [
        { nome: 'WhatsApp', pacchetto: 'com.whatsapp' },
        { nome: 'Telegram X', pacchetto: 'org.thunderdog.challegram' },
        { nome: 'Gmail', pacchetto: 'com.google.android.gm' },
    ]

    it('sceglie dall’ETICHETTA, che è ciò che dice la persona', () => {
        expect(talosScegliApp(APP, 'whatsapp')?.pacchetto).toBe('com.whatsapp')
        expect(talosScegliApp(APP, 'WhatsApp')?.pacchetto).toBe('com.whatsapp')
    })

    /*
     * ⛔ IL CASO VERO del 13/8: il registro scritto a mano diceva
     * `org.telegram.messenger`, ma sul Pad c'è Telegram X. Chi dice «telegram»
     * intende quello che ha installato — e il telefono sa qual è.
     */
    it('trova Telegram X quando la persona dice solo «telegram»', () => {
        expect(talosScegliApp(APP, 'telegram')?.pacchetto).toBe('org.thunderdog.challegram')
    })

    it('accetta anche un id di pacchetto detto per intero', () => {
        expect(talosScegliApp(APP, 'com.google.android.gm')?.nome).toBe('Gmail')
    })

    it('rende null invece di indovinare', () => {
        expect(talosScegliApp(APP, 'signal')).toBeNull()
        expect(talosScegliApp(APP, '')).toBeNull()
        expect(talosScegliApp([], 'whatsapp')).toBeNull()
    })
})

/*
 * ⛔⛔ IL SEGNO «✓ Fatto» SU UNA COSA NON FATTA — misurato sul Pad il
 * 2026-08-13, e curato lo stesso giorno.
 *
 * A «manda il file nota-talos su WhatsApp», `invia_file` ha trovato DUE file
 * con lo stesso nome e ha fatto la cosa giusta: ha chiesto quale. Non e'
 * partito niente. Eppure sotto la risposta compariva «✓ Fatto: Invio di un
 * file», perche' la chiamata era riuscita e il chip legge `succeeded`.
 *
 * E' la stessa bugia curata poche ore prima nel testo del modello, spostata
 * nell'interfaccia. La cura: un tool che ELENCA o CHIEDE dichiara
 * `senzaEffetto`, e la traccia lo salta.
 */
describe('il segno «Fatto» racconta solo gli effetti nel mondo', () => {
    it('salta le righe riuscite ma SENZA effetto', async () => {
        const { talosAzioniEseguite } = await import('@/lib/tools/tracciaAzione')
        const righe = [
            { tool: 'invia_file', action: 'write', requiredActions: ['write'], status: 'succeeded', senzaEffetto: true, input: {} },
            { tool: 'app_azione', action: 'write', requiredActions: ['write'], status: 'succeeded', input: {} },
        ] as never
        expect(talosAzioniEseguite(righe)).toEqual([{ tool: 'app_azione' }])
    })

    it('un invio VERO resta un «Fatto»', async () => {
        const { talosAzioniEseguite } = await import('@/lib/tools/tracciaAzione')
        const righe = [
            { tool: 'invia_file', action: 'write', requiredActions: ['write'], status: 'succeeded', input: {} },
        ] as never
        expect(talosAzioniEseguite(righe)).toEqual([{ tool: 'invia_file' }])
    })
})
