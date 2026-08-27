import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import capacitorConfig from '../../../capacitor.config'
import {
    TALOS_CHAT_DATABASE_NAME,
    TALOS_CHAT_DATABASE_UPGRADES,
    TALOS_CHAT_DATABASE_VERSION,
} from '@/persistence/chatDatabaseSchema'

describe('TALOS chat database schema', () => {
    it('AV-02 preserves version one and adds the independent Vault and authority schema in version two', () => {
        expect(TALOS_CHAT_DATABASE_NAME).toBe('talos_mobile')
        expect(TALOS_CHAT_DATABASE_VERSION).toBe(8)
        expect(TALOS_CHAT_DATABASE_UPGRADES).toHaveLength(8)
        expect(TALOS_CHAT_DATABASE_UPGRADES[0]?.toVersion).toBe(1)
        expect(TALOS_CHAT_DATABASE_UPGRADES[1]?.toVersion).toBe(2)
        expect(TALOS_CHAT_DATABASE_UPGRADES[2]?.toVersion).toBe(3)
        expect(TALOS_CHAT_DATABASE_UPGRADES[3]?.toVersion).toBe(4)
        expect(TALOS_CHAT_DATABASE_UPGRADES[4]?.toVersion).toBe(5)
        // La 6 insegna alle attività a ripetersi: tre colonne aggiunte a
        // `talos_tasks`, nessuna tabella riscritta.
        expect(TALOS_CHAT_DATABASE_UPGRADES[5]?.toVersion).toBe(6)
        // La 7 dà una provenienza al CONTENUTO, riga per riga: quattro colonne
        // nullabili, nessuna tabella riscritta. Serve a togliere i falsi
        // allarmi della difesa contro l'iniezione — misurato: 15 tool su 38
        // tingevano la conversazione, quindi la trifecta si chiudeva dopo
        // qualsiasi lettura.
        expect(TALOS_CHAT_DATABASE_UPGRADES[6]?.toVersion).toBe(7)
        // La 8 dà al Tool Forge un registro vero: due tabelle per lo stato
        // installato e la storia delle versioni, una append-only per
        // l'audit — sostituisce un blob JSON in Preferences che non
        // garantiva niente sotto scritture concorrenti.
        expect(TALOS_CHAT_DATABASE_UPGRADES[7]?.toVersion).toBe(8)

        const sql = TALOS_CHAT_DATABASE_UPGRADES.flatMap((upgrade) => upgrade.statements).join('\n')
        for (const table of [
            'talos_chat_sessions',
            'talos_chat_messages',
            'talos_chat_attachments',
            'talos_chat_tool_activities',
            'talos_chat_state',
            'talos_vault_files',
            'talos_file_authority_grants',
            'talos_memories',
            'talos_tasks',
            'talos_notes',
            'talos_research_runs',
            'talos_research_events',
            'talos_forge_tools',
            'talos_forge_tool_versions',
            'talos_forge_audit',
        ]) {
            expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
        }

        const v2 = TALOS_CHAT_DATABASE_UPGRADES[1]?.statements.join('\n') ?? ''
        expect(v2).toContain('ALTER TABLE talos_chat_attachments RENAME TO talos_chat_attachments_v1')
        expect(v2).toContain("'legacy:' || id")
        expect(v2).toContain("'legacy-grant:' || id")
        expect(v2).toContain('FOREIGN KEY (vault_file_id) REFERENCES talos_vault_files(id)')
        expect(v2).toContain('FOREIGN KEY (grant_id) REFERENCES talos_file_authority_grants(id)')
        expect(v2).toContain('UNIQUE (message_id, vault_file_id)')
        expect(v2).toContain('DROP TABLE talos_chat_attachments_v1')
        expect(sql).toContain('REFERENCES talos_chat_sessions(id) ON DELETE CASCADE')
        expect(sql).toContain('REFERENCES talos_chat_messages(id) ON DELETE CASCADE')
        expect(sql).toContain('CHECK (role IN')
        expect(sql).toContain('CHECK (state IN')
        expect(sql).toContain('talos_chat_messages_session_order_idx')
        expect(sql).toContain('talos_chat_sessions_updated_idx')

        // F4 Memory station: v3 adds the desktop-parity memory registry —
        // untrusted by construction, status/kind/scope constrained.
        const v3 = TALOS_CHAT_DATABASE_UPGRADES[2]?.statements.join('\n') ?? ''
        expect(v3).toContain('CREATE TABLE IF NOT EXISTS talos_memories')
        expect(v3).toContain("CHECK (status IN ('active', 'disabled', 'quarantined', 'rejected'))")
        expect(v3).toContain("CHECK (kind IN ('preference', 'project_fact', 'procedure', 'policy_note', 'rejected'))")
        expect(v3).toContain("CHECK (scope_type IN ('global', 'project', 'session'))")
        expect(v3).toContain("trust_level TEXT NOT NULL DEFAULT 'untrusted'")
        expect(v3).toContain('talos_memories_status_scope_idx')

        // F5 stations: v4 adds run-linked local tasks and untrusted notes.
        const v4 = TALOS_CHAT_DATABASE_UPGRADES[3]?.statements.join('\n') ?? ''
        expect(v4).toContain('CREATE TABLE IF NOT EXISTS talos_tasks')
        expect(v4).toContain("CHECK (status IN ('todo', 'doing', 'done'))")
        expect(v4).toContain("CHECK (priority IN ('low', 'normal', 'high'))")
        expect(v4).toContain('CREATE TABLE IF NOT EXISTS talos_notes')
        expect(v4).toContain("trust_level TEXT NOT NULL DEFAULT 'untrusted'")

        // R-1: v5 adds the research journal and the row that lists it.
        //
        // The UNIQUE is the assertion that matters. A write acknowledged after
        // the process died is replayed on the next boot, and without it the
        // same step would be counted twice — in a figure the user is shown and
        // is paying for. It is asserted here, in the schema, because that is
        // the only place it cannot be forgotten by a caller.
        const v5 = TALOS_CHAT_DATABASE_UPGRADES[4]?.statements.join('\n') ?? ''
        expect(v5).toContain('CREATE TABLE IF NOT EXISTS talos_research_events')
        expect(v5).toContain('UNIQUE (run_id, seq)')
        expect(v5).toContain('CREATE TABLE IF NOT EXISTS talos_research_runs')
        expect(v5).toContain("CHECK (depth IN ('quick', 'deep', 'exhaustive'))")
        // R1b: a run has to be able to say it moved to a server.
        expect(v5).toContain("CHECK (engine IN ('device', 'cloud'))")
        // The journal is append-only BY CONSTRUCTION: nothing in the migration
        // gives anyone an UPDATE or DELETE path into it.
        expect(v5).not.toMatch(/UPDATE\s+talos_research_events/i)
        expect(v5).not.toMatch(/DELETE\s+FROM\s+talos_research_events/i)

        // Tool Forge Fase 3: v8 replaces the Preferences JSON blob with a
        // real registry, transactions instead of a read-modify-write race.
        const v8 = TALOS_CHAT_DATABASE_UPGRADES[7]?.statements.join('\n') ?? ''
        expect(v8).toContain('CREATE TABLE IF NOT EXISTS talos_forge_tools')
        expect(v8).toContain("CHECK (enabled IN (0, 1))")
        expect(v8).toContain('CREATE TABLE IF NOT EXISTS talos_forge_tool_versions')
        expect(v8).toContain('UNIQUE (tool_id, version)')
        expect(v8).toContain('FOREIGN KEY (tool_id) REFERENCES talos_forge_tools(id) ON DELETE CASCADE')
        expect(v8).toContain('CREATE TABLE IF NOT EXISTS talos_forge_audit')
        expect(v8).toContain("CHECK (kind IN ('install', 'enable', 'disable', 'rollback', 'remove'))")
        // Stesso principio di talos_research_events sopra: l'audit è
        // append-only BY CONSTRUCTION, nessun UPDATE/DELETE nella migrazione.
        expect(v8).not.toMatch(/UPDATE\s+talos_forge_audit/i)
        expect(v8).not.toMatch(/DELETE\s+FROM\s+talos_forge_audit/i)
    })

    it('keeps upgrades incremental and free of destructive database deletion', () => {
        const versions = TALOS_CHAT_DATABASE_UPGRADES.map((upgrade) => upgrade.toVersion)
        expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
        const sql = TALOS_CHAT_DATABASE_UPGRADES.flatMap((upgrade) => upgrade.statements).join('\n')
        expect(sql).not.toMatch(/DROP\s+DATABASE/i)
        expect(sql).not.toMatch(/DELETE\s+FROM\s+talos_chat_sessions/i)
    })

    it('pins the official web runtime asset and native encryption configuration', () => {
        const sqlite = capacitorConfig.plugins?.CapacitorSQLite as Record<string, unknown> | undefined
        expect(sqlite?.androidIsEncryption).toBe(true)
        const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
            dependencies?: Record<string, string>
        }
        const packageLock = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')) as {
            packages?: Record<string, { version?: string; integrity?: string }>
        }
        expect(packageJson.dependencies?.['sql.js']).toBe('1.11.0')
        expect(packageLock.packages?.['node_modules/sql.js']).toMatchObject({
            version: '1.11.0',
            integrity: 'sha512-GsLUDU3vhOo14Pd5ME0y2te49JQyby6HuoCuadevEV+CGgTUjmYRrm7B7lhRyzOgrmcWmspUfyjNb6sOAEqdsA==',
        })
        const wasm = readFileSync(resolve(process.cwd(), 'public/assets/sql-wasm.wasm'))
        expect(wasm.byteLength).toBe(652_953)
        expect(createHash('sha256').update(wasm).digest('hex')).toBe(
            '083460b3e9d428ebbbbaa03918ba55da33d810e0fb3470d4b5d8677b462b2c2b',
        )
    })

    it('excludes databases and shared preferences from every Android backup path', () => {
        const manifest = readFileSync(resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8')
        expect(manifest).toContain('android:allowBackup="false"')
        // F5.1 #29: Android 11+ package visibility — the RecognitionService
        // MUST be queryable or dictation dies silently on device.
        expect(manifest).toContain('android.speech.RecognitionService')
        expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"')
        expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"')

        const extraction = readFileSync(resolve(process.cwd(), 'android/app/src/main/res/xml/data_extraction_rules.xml'), 'utf8')
        expect(extraction).toContain('<cloud-backup')
        expect(extraction).toContain('<device-transfer>')
        expect(extraction.match(/<exclude domain="database" path="\."\s*\/>/g)).toHaveLength(2)
        expect(extraction.match(/<exclude domain="sharedpref" path="\."\s*\/>/g)).toHaveLength(2)
        expect(extraction.match(/<exclude domain="file" path="talos-vault\/"\s*\/>/g)).toHaveLength(2)

        const legacy = readFileSync(resolve(process.cwd(), 'android/app/src/main/res/xml/backup_rules.xml'), 'utf8')
        expect(legacy).toContain('<full-backup-content>')
        expect(legacy).toContain('<exclude domain="database" path="." />')
        expect(legacy).toContain('<exclude domain="sharedpref" path="." />')
        expect(legacy).toContain('<exclude domain="file" path="talos-vault/" />')
    })
})
