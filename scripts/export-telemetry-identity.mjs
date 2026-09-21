// Derive the bundled offline Telemetry identity ONLY from the committed
// desktop canonical source in this lane (never from uncommitted bytes).
// Validates through the mobile contract parser before writing, and prints
// source/output SHA-256 provenance. Canonical command: no arguments.
//
// The desktop source uses extensionless relative imports (resolved by Vite in
// the desktop build). A self-contained resolve hook appends `.ts` so Node's
// native type-stripping runs the exact committed source with no bundler and
// no extra files.
import module from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

module.register(
    'data:text/javascript,' + encodeURIComponent(`
        import { existsSync } from 'node:fs'
        export async function resolve(specifier, context, nextResolve) {
            try {
                return await nextResolve(specifier, context)
            } catch (error) {
                const relative = specifier.startsWith('./') || specifier.startsWith('../')
                if (relative && !/\\.[a-z0-9]+$/i.test(specifier)) {
                    const candidate = new URL(specifier + '.ts', context.parentURL)
                    if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
                }
                throw error
            }
        }
    `),
    import.meta.url,
)

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = path.resolve(HERE, '..', '..', 'control-plane', 'resources', 'js', 'motion-v6', 'themeIdentity.ts')
const OUT = path.resolve(HERE, '..', 'src', 'theme', 'telemetry.identity.json')

const { TALOS_THEME_IDENTITIES_V6, exportTalosThemeIdentity } = await import('../../control-plane/resources/js/motion-v6/themeIdentity.ts')
const { parseTalosMobileDesignTokens } = await import('@talos-mobile/design-tokens')

const telemetry = TALOS_THEME_IDENTITIES_V6.find((identity) => identity.id === 'telemetry')
if (!telemetry) throw new Error('telemetry identity not present in TALOS_THEME_IDENTITIES_V6')

const exported = exportTalosThemeIdentity(telemetry)
const validated = parseTalosMobileDesignTokens(exported)
mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(validated, null, 4) + '\n')

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
console.log(JSON.stringify({
    source: 'control-plane/resources/js/motion-v6/themeIdentity.ts',
    source_sha256: sha(SOURCE),
    output: 'mobile/src/theme/telemetry.identity.json',
    output_sha256: sha(OUT),
    id: validated.id,
}))
