import { describe, expect, it } from 'vitest'
import {
    TALOS_CHAT_DATABASE_UPGRADES,
    TALOS_CHAT_DATABASE_VERSION,
} from '@/persistence/chatDatabaseSchema'

/**
 * U-17 — la migrazione v10: `talos_tasks.paused`.
 *
 * ## Perché una prova a parte, e non due righe in quella dello schema
 *
 * Perché la prova dello schema controlla che le versioni siano dieci e che
 * nessuno abbia scritto `DROP DATABASE`. Questa controlla la FORMA della
 * colonna, ed è la forma che decide se l'aggiornamento sarà istantaneo o
 * riscriverà la tabella di chi ha trecento attività — e se le righe che
 * esistevano prima si troveranno in pausa senza averlo chiesto.
 *
 * Fonte, riletta il 12/09/2026 (https://www.sqlite.org/lang_altertable.html):
 * «No changes are made to table content for renames or column addition without
 * constraints … the execution time of such ALTER TABLE commands is independent
 * of the amount of data in the table», e «If a NOT NULL constraint is
 * specified, then the column must have a default value other than NULL».
 */
const v10 = TALOS_CHAT_DATABASE_UPGRADES.find((upgrade) => upgrade.toVersion === 10)
const sql = (v10?.statements ?? []).join('\n')

describe('la migrazione v10 — «metti in pausa»', () => {
    it('esiste, ed è l\'ultimo scalino', () => {
        expect(v10).toBeDefined()
        expect(TALOS_CHAT_DATABASE_VERSION).toBe(10)
        expect(TALOS_CHAT_DATABASE_UPGRADES.at(-1)?.toVersion).toBe(10)
    })

    it('aggiunge una colonna sola, sulla tabella delle attività', () => {
        expect(sql).toMatch(/ALTER TABLE talos_tasks ADD COLUMN paused INTEGER NOT NULL DEFAULT 0/)
        expect(sql.match(/ALTER TABLE/g)).toHaveLength(1)
    })

    it('⛔ NIENTE `CHECK`: un vincolo obbliga SQLite a rileggere tutta la tabella', () => {
        // Al verso contrario di ciò che sembra prudente: il CHECK renderebbe la
        // colonna più severa e l'aggiornamento più lento in proporzione ai dati.
        // La severità la dà `NOT NULL DEFAULT 0` più il codice che scrive
        // `paused ? 1 : 0`, e non c'è un terzo valore possibile.
        expect(sql).not.toMatch(/CHECK/i)
    })

    it('⛔ non tocca una riga esistente, e non cancella niente', () => {
        expect(sql).not.toMatch(/UPDATE\s+talos_tasks/i)
        expect(sql).not.toMatch(/DELETE\s+FROM/i)
        expect(sql).not.toMatch(/DROP/i)
    })

    it('⛔ non tocca l\'indice delle pianificate', () => {
        // `talos_tasks_scheduled_idx` (v6) risponde a «quali hanno una
        // ricorrenza», e la risposta non cambia quando una è in pausa: una
        // pausa è revocabile, la riga resta pianificata. Metterci dentro
        // `paused` renderebbe l'indice inutile il giorno in cui serve l'elenco
        // completo.
        expect(sql).not.toMatch(/talos_tasks_scheduled_idx/)
    })

    it('gli scalini restano incrementali e nessuno si ripete', () => {
        const versioni = TALOS_CHAT_DATABASE_UPGRADES.map((u) => u.toVersion)
        expect(versioni).toEqual([...versioni].sort((a, b) => a - b))
        expect(new Set(versioni).size).toBe(versioni.length)
    })

    it('⛔ la colonna `paused` compare in UNA sola migrazione', () => {
        // Ripetuta, fallirebbe con «duplicate column name: paused» sul
        // dispositivo di chi aggiorna — e nessun test in Node se ne
        // accorgerebbe, perché in Node quel comando non gira mai.
        const quante = TALOS_CHAT_DATABASE_UPGRADES
            .filter((u) => u.statements.join('\n').includes('ADD COLUMN paused')).length
        expect(quante).toBe(1)
    })
})
