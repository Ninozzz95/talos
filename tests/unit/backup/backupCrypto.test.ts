import { describe, expect, it } from 'vitest'
import {
    TALOS_BACKUP_KDF,
    TalosBackupCryptoError,
    talosBackupDigest,
    talosDecryptBackup,
    talosEncryptBackup,
} from '@/lib/backup/backupCrypto'

/**
 * La protezione del backup, provata sul giro completo.
 *
 * Un backup TALOS contiene **le chiavi dei provider e ogni chat privata**, e
 * finisce nei Download. Le prove qui sotto guardano le tre cose che rendono
 * inutile una cifratura: una passphrase vuota accettata, un ripiego silenzioso
 * su un algoritmo più debole, e un file che si apre con la passphrase sbagliata.
 */

describe('il giro completo', () => {
    it('cifra e ridà indietro esattamente ciò che aveva ricevuto', async () => {
        const chiaro = new TextEncoder().encode('{"sessions":[{"id":"s1","title":"Q3"}]}')
        const { envelope, ciphertext } = await talosEncryptBackup(chiaro, 'una passphrase lunga')

        expect(envelope.kdf).toBe('argon2id')
        expect(envelope.cipher).toBe('AES-256-GCM')
        // Il cifrato non deve somigliare al chiaro, nemmeno per lunghezza esatta:
        // GCM aggiunge il tag di autenticazione.
        expect(ciphertext.byteLength).toBeGreaterThan(chiaro.byteLength)

        const riletto = await talosDecryptBackup(envelope, ciphertext, 'una passphrase lunga')
        expect(new TextDecoder().decode(riletto)).toBe(new TextDecoder().decode(chiaro))
    }, 30_000)

    /**
     * ⛔ La passphrase sbagliata NON apre, e non apre a metà.
     *
     * AES-GCM è autenticato: il tag non torna e la decifratura fallisce prima di
     * restituire un solo byte. È il motivo per cui si usa GCM e non CBC — con
     * CBC un file corrotto restituirebbe spazzatura che sembra dati.
     */
    it('con la passphrase sbagliata non apre', async () => {
        const { envelope, ciphertext } = await talosEncryptBackup(
            new TextEncoder().encode('segreto'),
            'quella giusta',
        )
        await expect(talosDecryptBackup(envelope, ciphertext, 'quella sbagliata'))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_OPEN_FAILED' })
    }, 30_000)

    it('e con il file manomesso nemmeno', async () => {
        const { envelope, ciphertext } = await talosEncryptBackup(
            new TextEncoder().encode('segreto'),
            'la passphrase',
        )
        const manomesso = new Uint8Array(ciphertext)
        manomesso[0] = manomesso[0]! ^ 0xff
        await expect(talosDecryptBackup(envelope, manomesso, 'la passphrase'))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_OPEN_FAILED' })
    }, 30_000)
})

describe('⛔ quello che NON si accetta', () => {
    it('una passphrase vuota è un rifiuto, non un backup in chiaro', async () => {
        await expect(talosEncryptBackup(new TextEncoder().encode('x'), ''))
            .rejects.toBeInstanceOf(TalosBackupCryptoError)
    })

    /**
     * ⛔ Un algoritmo che non conosciamo non si apre «alla meglio».
     *
     * È la regola che manca a chi degrada in silenzio: sul dispositivo, il
     * 2026-08-07, un banner diceva «security scanner
     * enabled but not available — command scanning will use pattern matching
     * only» e proseguiva. Un sistema che abbassa da solo la propria difesa e va
     * avanti ha smesso di difendere senza dirlo.
     */
    it('un KDF sconosciuto non viene aperto lo stesso', async () => {
        const { ciphertext, envelope } = await talosEncryptBackup(
            new TextEncoder().encode('x'),
            'p',
        )
        await expect(talosDecryptBackup(
            { ...envelope, kdf: 'pbkdf2' as never },
            ciphertext,
            'p',
        )).rejects.toMatchObject({ code: 'TALOS_BACKUP_ALGORITHM_UNKNOWN' })
    }, 30_000)

    it('e nemmeno una cifratura sconosciuta', async () => {
        const { ciphertext, envelope } = await talosEncryptBackup(
            new TextEncoder().encode('x'),
            'p',
        )
        await expect(talosDecryptBackup(
            { ...envelope, cipher: 'AES-256-CBC' as never },
            ciphertext,
            'p',
        )).rejects.toMatchObject({ code: 'TALOS_BACKUP_ALGORITHM_UNKNOWN' })
    }, 30_000)
})

describe('i parametri, che sono una scelta e non un caso', () => {
    /**
     * OWASP 2026 mette Argon2id al primo posto e raccomanda come minimo
     * m = 19456 KiB, t = 2, p = 1. Su un telefono la memoria è la risorsa che
     * manca: alzare `m` oltre il minimo raccomandato significa un backup che
     * fallisce sul dispositivo di qualcun altro.
     */
    it('sono quelli minimi raccomandati da OWASP 2026', () => {
        expect(TALOS_BACKUP_KDF.memoryKiB).toBe(19_456)
        expect(TALOS_BACKUP_KDF.iterations).toBe(2)
        expect(TALOS_BACKUP_KDF.parallelism).toBe(1)
    })

    it('la chiave è a 256 bit e il nonce a 96, che è ciò che GCM vuole', () => {
        expect(TALOS_BACKUP_KDF.keyBytes).toBe(32)
        expect(TALOS_BACKUP_KDF.nonceBytes).toBe(12)
    })

    /** Due backup identici non devono produrre due file identici. */
    it('il sale e il nonce cambiano a ogni backup', async () => {
        const chiaro = new TextEncoder().encode('stesso contenuto')
        const primo = await talosEncryptBackup(chiaro, 'stessa passphrase')
        const secondo = await talosEncryptBackup(chiaro, 'stessa passphrase')
        expect(primo.envelope.salt).not.toBe(secondo.envelope.salt)
        expect(primo.envelope.nonce).not.toBe(secondo.envelope.nonce)
    }, 60_000)
})

describe('l\'impronta di una sezione', () => {
    it('è stabile e lunga 64 caratteri esadecimali', async () => {
        const uno = await talosBackupDigest('{"a":1}')
        const due = await talosBackupDigest('{"a":1}')
        expect(uno).toBe(due)
        expect(uno).toMatch(/^[0-9a-f]{64}$/)
    })

    it('e cambia se cambia un solo carattere', async () => {
        expect(await talosBackupDigest('{"a":1}')).not.toBe(await talosBackupDigest('{"a":2}'))
    })
})
