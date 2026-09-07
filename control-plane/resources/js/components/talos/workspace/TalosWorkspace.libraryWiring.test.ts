import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosWorkspace.vue', import.meta.url), 'utf8')

describe('TalosWorkspace Library integration', () => {
    it('passes the settings owner fence and governed attachment callback to the window layer', () => {
        expect(source).toContain(':settings-owner-key="workspaceSettings?.id ?? null"')
        expect(source).toContain('@attach-library-file="handleAttachVaultFile"')
    })

    it('resolves a Library file through the owned file endpoint before granting access', () => {
        expect(source).toContain('`/api/talos/files/${encodeURIComponent(fileId)}`')
        expect(source).toContain('await attachmentTray.attachVaultFile(vaultFile as never)')
    })

    it('opens chat media for an owned active session without relying on loaded message metadata', () => {
        expect(source).toMatch(/function openChatMedia\(\) \{[\s\S]*?if \(activeSession\.value\) chatMediaOpen\.value = true/)
        expect(source).not.toContain('const chatMediaAttachments = computed')
    })
})
