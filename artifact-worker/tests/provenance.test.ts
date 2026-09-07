import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const rootUrl = new URL('../', import.meta.url)

const expectedIntegrities = Object.freeze({
  'node_modules/@pdf-lib/fontkit': 'sha512-KjMd7grNapIWS/Dm0gvfHEilSyAmeLvrEGVcqLGi0VYebuqqzTbgF29efCx7tvx+IEbG3zQciRSWl3GkUSvjZg==',
  'node_modules/docx': 'sha512-ilXFf9Moz47ABjFpDiA5s1w9lpb4EFSp7+5iiJSbfyYDM+bpZdAgLlSr7fW4aXhVe/E+F6QCv0EvRVFEd5CsWg==',
  'node_modules/fastify': 'sha512-A9L0ziuWGQHgEEVgF3davQ9vbD93IuX+lo2IsxapQmu5b/Y/ynn9m9K5JHt9dvyJXOFc5iN0Zk5GHEOqnzhWjg==',
  'node_modules/file-type': 'sha512-ww5Mhre0EE+jmBvOXTmXAbEMuZE7uX4a3+oRCQFNj8w++g3ev913N6tXQz0XTXbueQ5TWQfm6BdaViEHHn8bhA==',
  'node_modules/officeparser': 'sha512-3OFFz4k3EhMWqz0sLVrerviQOTGl6qP3O9mNLW+N3CCiY4r7BtJWgDDrc8KmRJtsn/bDkMfhnYAoBNMpl1DC4w==',
  'node_modules/pdf-lib': 'sha512-V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==',
  'node_modules/pptxgenjs': 'sha512-TeJISr8wouAuXw4C1F/mC33xbZs/FuEG6nH9FG1Zj+nuPcGMP5YRHl6X+j3HSUnS1f3at6k75ZZXPMZlA5Lj9A==',
  'node_modules/sharp': 'sha512-ej0zVHuZGHCiABXcNxeYhpRnPNPAcvbG8RMdBAhDAxLKkCRVSpK3Iyu7qbqw3JMzoj0REeM6f3tJLtVwl0023Q==',
  'node_modules/xlsx': 'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==',
  'node_modules/zod': 'sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==',
  'node_modules/@types/node': 'sha512-Dh8vAsV36ig5wa9OX4pXvMc9D3Veibfw2wix0CUwYODLD8nkj9UsLjASr49nPg+2eKzxhBV+v7L8pXvT4e639Q==',
  'node_modules/tsx': 'sha512-GQHnkIfxyx1wYCOS/wonik5MVRZU9hi1TEZmzGZSCJB1y9YgoZ8H6itNE/u4suE+yLmOzuE4E5S4TZ/ZX2wcWQ==',
  'node_modules/typescript': 'sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==',
  'node_modules/vitest': 'sha512-R9jUTe5S4Qb0HCd4TNqpC7oGcrMssMRGXLW80ubjWsW9VH5GF8y1Y0SFLY9AbqSk6nt0PnOx4H4WNJYZ13GUPw==',
})

async function jsonFile(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(path, rootUrl), 'utf8')) as Record<string, unknown>
}

describe('artifact worker provenance', () => {
  it('keeps generated output ignored while admitting only the pinned vendored source', async () => {
    const repositoryIgnore = await readFile(new URL('../.gitignore', rootUrl), 'utf8')
    const rules = repositoryIgnore.split(/\r?\n/)
    const expectedRules = [
      'artifact-worker/dist/',
      '!artifact-worker/vendor/',
      'artifact-worker/vendor/*',
      '!artifact-worker/vendor/xlsx-0.20.3.tgz',
    ]
    const ruleIndexes = expectedRules.map((rule) => rules.indexOf(rule))

    expect(ruleIndexes).not.toContain(-1)
    expect(ruleIndexes).toEqual([...ruleIndexes].sort((left, right) => left - right))
    expect(ruleIndexes[1]).toBeGreaterThan(rules.indexOf('vendor/'))
  })

  it('publishes exact direct runtime, container, vendored source, and font notices', async () => {
    const notices = await readFile(new URL('../THIRD_PARTY_NOTICES.md', rootUrl), 'utf8')

    for (const dependency of [
      '@pdf-lib/fontkit 1.1.1',
      'docx 9.7.1',
      'Fastify 5.10.0',
      'file-type 22.0.1',
      'officeparser 7.5.0',
      'pdf-lib 1.17.1',
      'PptxGenJS 4.0.1',
      'sharp 0.35.3',
      'SheetJS CE 0.20.3',
      'Zod 4.4.3',
    ]) {
      expect(notices).toContain(dependency)
    }
    expect(notices).toContain(
      'sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d',
    )
    expect(notices).toContain(
      'sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212',
    )
    expect(notices).toContain(
      '8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8',
    )
    expect(notices).toContain(
      '68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5',
    )
    expect(notices).toContain('SIL Open Font License Version 1.1')
  })

  it('pins the runtime and direct dependency graph exactly', async () => {
    const packageJson = await jsonFile('package.json')
    const lock = await jsonFile('package-lock.json')
    const packages = lock.packages as Record<string, { integrity?: string }>

    expect(packageJson.engines).toEqual({ node: '>=24.18.0 <25' })
    expect(packageJson.packageManager).toBe('npm@11.16.0')
    for (const [path, integrity] of Object.entries(expectedIntegrities)) {
      expect(packages[path]?.integrity, path).toBe(integrity)
    }
  })

  it('verifies the official SheetJS tarball bytes independently', async () => {
    const tarballUrl = new URL('vendor/xlsx-0.20.3.tgz', rootUrl)
    const bytes = await readFile(tarballUrl)

    expect((await stat(tarballUrl)).size).toBe(2_409_319)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8',
    )
  })

  it('verifies the pinned Unicode PDF font independently', async () => {
    const fontUrl = new URL('assets/fonts/NotoSansCJKjp-Regular.otf', rootUrl)
    const bytes = await readFile(fontUrl)

    expect((await stat(fontUrl)).size).toBe(16_467_736)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5',
    )
  })

  it('fails closed on unreviewed dependency lifecycle scripts', async () => {
    const packageJson = await jsonFile('package.json')
    const npmrc = await readFile(new URL('.npmrc', rootUrl), 'utf8')

    expect(packageJson.allowScripts).toEqual({
      'esbuild@0.28.1': true,
      'fsevents': false,
      'tesseract.js': false,
    })
    expect(npmrc.trim()).toBe('strict-allow-scripts=true')
  })

  it('provides a deterministic standalone provenance verifier', async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['scripts/verify-provenance.mjs'],
      { cwd: new URL('.', rootUrl) },
    )

    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      package_count: Object.keys(expectedIntegrities).length,
      sheetjs_sha256: '8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8',
    })
  })
})
