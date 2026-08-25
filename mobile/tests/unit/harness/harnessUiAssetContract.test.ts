// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function harnessAsset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

describe('Harness UI static asset contract', () => {
    it('HARNESS-NATIVE-TOP-LAYER-HITTEST-01 keeps embedded dialogs below global navigation', () => {
        const html = harnessAsset('index.html')
        const css = harnessAsset('styles.css')
        const js = harnessAsset('app.js')

        expect(html).toContain('id="harnessDialogBackdrop"')
        expect(css).toContain('.harness-dialog-backdrop')
        expect(js).not.toContain('.showModal(')
        expect(js).toContain('showEmbeddedDialog(commandDialog)')
        expect(js).toContain('showEmbeddedDialog(sheetDialog)')
    })
})
