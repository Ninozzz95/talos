import { execFile } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = path.resolve(__dirname, '..', '..', '..')
const SCRIPT = path.resolve(MOBILE_ROOT, 'scripts', 'assert-runtime.mjs')

function runScript(args: string[]): Promise<{ code: number | null; stderr: string }> {
    return new Promise((resolve) => {
        execFile(process.execPath, [SCRIPT, ...args], (error, _stdout, stderr) => {
            resolve({ code: error ? (error as NodeJS.ErrnoException & { code: number }).code as number : 0, stderr })
        })
    })
}

function runNode(code: string): Promise<{ code: number; stderr: string }> {
    return new Promise((resolve) => {
        execFile(process.execPath, ['-e', code], { cwd: MOBILE_ROOT }, (error, _stdout, stderr) => {
            resolve({ code: error ? ((error as NodeJS.ErrnoException & { code?: number }).code ?? 1) as number : 0, stderr })
        })
    })
}

describe('assert-runtime preflight', () => {
    it('unsupported node or npm versions are rejected before install', async () => {
        const node22 = await runScript(['--node-version=22.12.0'])
        expect(node22.code).toBe(1)
        expect(node22.stderr).toContain('unsupported node 22.12.0; required >=24.18.0 <25')

        const npm10 = await runScript(['--npm-version=10.9.0'])
        expect(npm10.code).toBe(1)
        expect(npm10.stderr).toContain('unsupported npm 10.9.0; required >=11.16.0 <12')
    })

    it('accepts the frozen supported runtime range', async () => {
        const pinned = await runScript(['--node-version=24.18.0', '--npm-version=11.16.0'])
        expect(pinned.code).toBe(0)

        const real = await runScript([])
        expect(real.code).toBe(0)
    })

    it('rejects the upper bounds fail-closed', async () => {
        const node25 = await runScript(['--node-version=25.0.0'])
        expect(node25.code).toBe(1)

        const npm12 = await runScript(['--npm-version=12.0.0'])
        expect(npm12.code).toBe(1)
    })
})

describe('vue-tsc classic TypeScript entrypoint', () => {
    it('keeps the vue-tsc classic TypeScript compiler entrypoint resolvable', async () => {
        // vue-tsc@3.3.7 does `require.resolve('typescript/lib/tsc')`. The
        // classic TypeScript compiler must export that entrypoint, or the
        // charter build gate (vue-tsc -b) fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
        const result = await runNode("require.resolve('typescript/lib/tsc')")
        expect(result.code).toBe(0)
    })
})
