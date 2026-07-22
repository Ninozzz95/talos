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
        expect(TALOS_CHAT_DATABASE_VERSION).toBe(2)
        expect(TALOS_CHAT_DATABASE_UPGRADES).toHaveLength(2)
        expect(TALOS_CHAT_DATABASE_UPGRADES[0]?.toVersion).toBe(1)
        expect(TALOS_CHAT_DATABASE_UPGRADES[1]?.toVersion).toBe(2)

        const sql = TALOS_CHAT_DATABASE_UPGRADES.flatMap((upgrade) => upgrade.statements).join('\n')
        for (const table of [
            'talos_chat_sessions',
            'talos_chat_messages',
            'talos_chat_attachments',
            'talos_chat_tool_activities',
            'talos_chat_state',
            'talos_vault_files',
            'talos_file_authority_grants',
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
    })

    it('keeps upgrades incremental and free of destructive database deletion', () => {
        const versions = TALOS_CHAT_DATABASE_UPGRADES.map((upgrade) => upgrade.toVersion)
        expect(versions).toEqual([1, 2])
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
