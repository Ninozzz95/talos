import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    commitTalosDatabaseKey,
    mintTalosDatabaseKey,
    protectTalosDatabaseKey,
    unlockTalosDatabaseKey,
} from '@/services/databaseKey'

/**
 * ⛔⛔⛔ IL RECORD CHE AVVOLGE LA CHIAVE DEL DATABASE.
 *
 * Se sbaglio qui non si rompe una funzione: qualcuno non entra più nelle proprie
 * chat, con il PIN giusto in mano. Ogni prova qui sotto esiste per un modo
 * diverso di arrivare a quel risultato.
 */

const PIN = '482913'
const WRAPPED_KEY = 'talos.db.key.wrapped.v1'
const PLAIN_KEY = 'talos.db.key.v1'

function magazzino(iniziale: Record<string, string> = {}) {
    const dati = { ...iniziale }
    return {
        dati,
        backend: {
            get: vi.fn(async (k: string) => dati[k] ?? null),
            set: vi.fn(async (k: string, v: string) => { dati[k] = v }),
            remove: vi.fn(async (k: string) => { delete dati[k] }),
        },
    }
}

/** Il v1: PBKDF2-SHA256, esattamente come lo scriveva la versione precedente. */
async function scriviV1(chiave: string, pin: string, iterazioni = 210_000) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const materiale = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'],
    )
    const kek = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iterazioni },
        materiale, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    )
    const payload = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource }, kek, new TextEncoder().encode(chiave),
    )
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
    return JSON.stringify({
        salt: b64(salt), iv: b64(iv), payload: b64(new Uint8Array(payload)), iterations: iterazioni,
    })
}

describe('il PIN scrive sempre il formato NUOVO', () => {
    beforeEach(() => vi.clearAllMocks())

    it('⭐ protect scrive un record v2 con argon2id', async () => {
        const m = magazzino()
        const chiave = mintTalosDatabaseKey()
        await commitTalosDatabaseKey(chiave, m.backend)
        await protectTalosDatabaseKey(PIN, m.backend)

        const record = JSON.parse(m.dati[WRAPPED_KEY]!) as Record<string, unknown>
        expect(record.version).toBe(2)
        expect(record.kdf).toBe('argon2id')
        expect(m.dati[PLAIN_KEY]).toBeUndefined()
        // ⛔ La copia in chiaro sparisce DOPO che quella avvolta esiste.
    })

    it('⭐ e si riapre con lo stesso PIN', async () => {
        const m = magazzino()
        const chiave = mintTalosDatabaseKey()
        await commitTalosDatabaseKey(chiave, m.backend)
        await protectTalosDatabaseKey(PIN, m.backend)
        expect(await unlockTalosDatabaseKey(PIN, m.backend)).toBe(chiave)
    })

    it('⛔ e non con un altro', async () => {
        const m = magazzino()
        await commitTalosDatabaseKey(mintTalosDatabaseKey(), m.backend)
        await protectTalosDatabaseKey(PIN, m.backend)
        await expect(unlockTalosDatabaseKey('000000', m.backend)).rejects.toThrow(/UNLOCK_FAILED/)
    })
})

describe('⛔⛔ l\'intestazione è AUTENTICATA', () => {
    it('abbassare i parametri dichiarati rende il record inapribile', async () => {
        const m = magazzino()
        await commitTalosDatabaseKey(mintTalosDatabaseKey(), m.backend)
        await protectTalosDatabaseKey(PIN, m.backend)

        const record = JSON.parse(m.dati[WRAPPED_KEY]!) as { params: { memoryKiB: number } }
        record.params.memoryKiB = 8_192
        m.dati[WRAPPED_KEY] = JSON.stringify(record)

        await expect(unlockTalosDatabaseKey(PIN, m.backend)).rejects.toThrow(/UNLOCK_FAILED/)
        /*
         * ⛔ Senza AAD, chi puo toccare il record puo dichiarare una protezione
         * piu debole di quella con cui e stato scritto. Con l'AAD la promessa e
         * il contenuto vivono insieme: cambiata la promessa, il contenuto non
         * si apre.
         */
    })

    it('⛔ e parametri assurdi vengono rifiutati PRIMA di chiedere memoria', async () => {
        const m = magazzino()
        await commitTalosDatabaseKey(mintTalosDatabaseKey(), m.backend)
        await protectTalosDatabaseKey(PIN, m.backend)

        const record = JSON.parse(m.dati[WRAPPED_KEY]!) as { params: { memoryKiB: number } }
        record.params.memoryKiB = 4_000_000
        m.dati[WRAPPED_KEY] = JSON.stringify(record)

        const partito = Date.now()
        await expect(unlockTalosDatabaseKey(PIN, m.backend)).rejects.toThrow()
        expect(Date.now() - partito).toBeLessThan(5_000)
        // ⛔ Il criterio è il TEMPO: un rifiuto che arriva dopo aver provato ad
        // allocare quattro gigabyte non e un rifiuto, e un blocco.
    })
})

describe('⛔⛔⛔ chi ha già un PIN deve continuare a entrare', () => {
    it('un record v1 si apre ancora', async () => {
        const chiave = mintTalosDatabaseKey()
        const m = magazzino({ [WRAPPED_KEY]: await scriviV1(chiave, PIN) })
        expect(await unlockTalosDatabaseKey(PIN, m.backend)).toBe(chiave)
    })

    it('⭐ e sale a v2 da solo, allo sblocco', async () => {
        const chiave = mintTalosDatabaseKey()
        const m = magazzino({ [WRAPPED_KEY]: await scriviV1(chiave, PIN) })
        await unlockTalosDatabaseKey(PIN, m.backend)

        const dopo = JSON.parse(m.dati[WRAPPED_KEY]!) as Record<string, unknown>
        expect(dopo.version).toBe(2)
        // ⛔ E il PIN continua ad aprirlo: la migrazione non deve essere una
        // porta che si chiude alle spalle di chi la attraversa.
        expect(await unlockTalosDatabaseKey(PIN, m.backend)).toBe(chiave)
    })

    it('⛔⛔ e se la migrazione FALLISCE lo sblocco riesce lo stesso', async () => {
        const chiave = mintTalosDatabaseKey()
        const m = magazzino({ [WRAPPED_KEY]: await scriviV1(chiave, PIN) })
        m.backend.set = vi.fn(async () => { throw new Error('il magazzino e chiuso') })

        expect(await unlockTalosDatabaseKey(PIN, m.backend)).toBe(chiave)
        /*
         * ⛔ La persona ha dato il PIN GIUSTO. Un fallimento della migrazione che
         * diventa un fallimento dello sblocco la chiuderebbe fuori dal proprio
         * database per un miglioramento che non aveva chiesto.
         */
    })

    it('⛔ un record v1 con iterazioni assurde non blocca l\'app', async () => {
        const chiave = mintTalosDatabaseKey()
        const m = magazzino({ [WRAPPED_KEY]: await scriviV1(chiave, PIN) })
        const rotto = JSON.parse(m.dati[WRAPPED_KEY]!) as Record<string, unknown>
        rotto.iterations = 2_000_000_000
        m.dati[WRAPPED_KEY] = JSON.stringify(rotto)

        const partito = Date.now()
        expect(await unlockTalosDatabaseKey(PIN, m.backend)).toBe(chiave)
        expect(Date.now() - partito).toBeLessThan(10_000)
        /*
         * ⛔ E il risultato giusto non e un rifiuto: e che il campo manomesso
         * venga IGNORATO e si usi il valore che questa versione scrive. Il
         * record si apre, in fretta, con il PIN giusto.
         *
         * Avevo scritto il test aspettandomi un rifiuto — e sarebbe stato
         * peggio: un attaccante che cambia un numero non guadagna niente (senza
         * PIN non decifra), ma otterrebbe di chiudere fuori la persona. Il
         * limite serve alla DISPONIBILITA, non alla riservatezza, e riportare
         * il valore dentro i limiti e esattamente la cosa che la protegge.
         */
    })
})

describe('⛔ e la chiave decifrata deve essere quella che ci aspettiamo', () => {
    it('una stringa che non e una chiave viene rifiutata', async () => {
        const m = magazzino({ [WRAPPED_KEY]: await scriviV1('non-sono-una-chiave', PIN) })
        await expect(unlockTalosDatabaseKey(PIN, m.backend)).rejects.toThrow(/UNLOCK_FAILED/)
        /*
         * ⛔ Senza questo controllo, una stringa qualunque finirebbe a SQLCipher,
         * che aprirebbe un database illeggibile: sembrerebbe una perdita di dati
         * invece di un errore.
         */
    })
})
