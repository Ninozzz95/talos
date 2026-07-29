import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../css/app.css', import.meta.url), 'utf8')

describe('TALOS semantic UI scale CSS contract', () => {
    it('derives owned spacing, typography, header, and button geometry from the UI scale token', () => {
        expect(css).toContain('--talos-ui-scale: 1;')
        expect(css).toMatch(/--talos-space-4:\s*calc\(16px \* var\(--talos-density,\s*1\) \* var\(--talos-ui-scale,\s*1\)\)/)
        expect(css).toMatch(/--talos-text-body:\s*calc\(14px \* var\(--talos-ui-scale,\s*1\)\)/)
        expect(css).toMatch(/\.talos-workspace-header\s*\{[^}]*min-height:\s*var\(--talos-ui-header-height\)/s)
        expect(css).toMatch(/\.talos-ui-button\[data-size="sm"\]\s*\{[^}]*height:\s*var\(--talos-ui-control-height-sm\)/s)
    })

    it('does not implement UI scale through root zoom or transform scaling', () => {
        expect(css).not.toMatch(/\.talos-(?:shell|workspace)\s*\{[^}]*(?:zoom\s*:|transform\s*:\s*scale\(var\(--talos-ui-scale)/s)
    })
})
