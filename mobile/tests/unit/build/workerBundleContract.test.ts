// @vitest-environment node

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfigFromFile } from 'vite'

describe('attachment analysis worker build contract', () => {
    it('AV-12 configures attachment analysis workers as ES modules for parser code splitting', async () => {
        const loaded = await loadConfigFromFile(
            { command: 'build', mode: 'test' },
            resolve(process.cwd(), 'vite.config.ts'),
        )

        expect(loaded?.config.worker?.format).toBe('es')
    })
})
