import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

function sourceFiles(root: string): string[] {
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const path = join(root, entry.name)
        if (entry.isDirectory()) return sourceFiles(path)
        return /\.(?:ts|vue)$/u.test(entry.name) ? [path] : []
    })
}

describe('localization import boundary', () => {
    it('I18N-09 keeps vue-i18n behind the AVM-owned dynamic adapter', () => {
        const sourceRoot = resolve(process.cwd(), 'src')
        const directImports = sourceFiles(sourceRoot)
            .filter((file) => /\bfrom\s+['"]vue-i18n['"]/u.test(readFileSync(file, 'utf8')))
            .map((file) => relative(sourceRoot, file).replaceAll('\\', '/'))

        expect(directImports).toEqual([])
        expect(readFileSync(resolve(sourceRoot, 'i18n/index.ts'), 'utf8'))
            .toMatch(/\bimport\(['"]vue-i18n['"]\)/u)
    })
})
