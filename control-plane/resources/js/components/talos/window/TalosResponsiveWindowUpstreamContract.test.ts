import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : ''

describe('TALOS responsive window upstream provenance', () => {
    it('uses the pinned shadcn-vue Drawer and Dialog implementations instead of local focus plumbing', () => {
        const packageJson = read(join(root, 'package.json'))
        const lock = read(join(root, 'package-lock.json'))
        const drawerIndex = read(join(root, 'resources/js/components/ui/drawer/index.js'))
        const dialogIndex = read(join(root, 'resources/js/components/ui/dialog/index.js'))
        const adapter = read(join(root, 'resources/js/components/talos/window/TalosMobileToolSheet.vue'))
        const dependencyPatch = read(join(root, 'patches/reka-ui+2.10.1.patch'))
        const notices = read(join(root, '../THIRD_PARTY_NOTICES.md'))
        const architecture = read(join(root, '../docs/architecture/talos-window-interaction-engine.md'))

        expect(packageJson).toContain('"shadcn-vue": "2.7.4"')
        expect(packageJson).toContain('"reka-ui": "2.10.1"')
        expect(packageJson).toContain('"patch-package": "8.0.1"')
        expect(packageJson).toContain('"postinstall": "npm run patch:dependencies"')
        expect(packageJson).toContain('"prebuild": "npm run patch:dependencies"')
        expect(packageJson).toContain('"predev": "npm run patch:dependencies"')
        expect(packageJson).not.toContain('"vaul-vue"')
        expect(lock).not.toContain('node_modules/vaul-vue')
        expect(drawerIndex).toContain('from "reka-ui"')
        expect(dialogIndex).toContain('DialogContent')
        expect(adapter).toContain("../../ui/drawer")
        expect(adapter).toContain("../../ui/dialog")
        expect(adapter).not.toContain("document.addEventListener('keydown'")
        expect(adapter).not.toContain('focusableElements')
        expect(dependencyPatch).toContain('const restoreOthers = () =>')
        expect(dependencyPatch).toContain('undo = void 0')
        expect(dependencyPatch).toContain('onUnmounted(restoreOthers)')
        expect(notices).toContain('patch-package 8.0.1')
        expect(notices).toContain('Reka UI modal accessibility cleanup patch')
        expect(architecture).toContain('Dependency patch gate')
    })
})
