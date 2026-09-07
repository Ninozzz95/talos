import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

const rootUrl = new URL('../', import.meta.url)
const expectedSheetJsSha256 = '8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8'
const expectedSheetJsBytes = 2_409_319
const expectedFontSha256 = '68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5'
const expectedFontBytes = 16_467_736
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

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, rootUrl), 'utf8'))
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch`)
  }
}

const packageJson = await readJson('package.json')
const lock = await readJson('package-lock.json')

requireEqual(packageJson.engines?.node, '>=24.18.0 <25', 'Node engine')
requireEqual(packageJson.packageManager, 'npm@11.16.0', 'npm pin')
requireEqual(packageJson.allowScripts?.['esbuild@0.28.1'], true, 'esbuild install-script policy')
requireEqual(packageJson.allowScripts?.fsevents, false, 'fsevents install-script policy')
requireEqual(packageJson.allowScripts?.['tesseract.js'], false, 'tesseract install-script policy')

for (const [path, integrity] of Object.entries(expectedIntegrities)) {
  requireEqual(lock.packages?.[path]?.integrity, integrity, `${path} integrity`)
}

const npmrc = await readFile(new URL('.npmrc', rootUrl), 'utf8')
requireEqual(npmrc.trim(), 'strict-allow-scripts=true', 'strict install-script policy')

const tarballUrl = new URL('vendor/xlsx-0.20.3.tgz', rootUrl)
const tarball = await readFile(tarballUrl)
requireEqual((await stat(tarballUrl)).size, expectedSheetJsBytes, 'SheetJS byte count')
requireEqual(
  createHash('sha256').update(tarball).digest('hex'),
  expectedSheetJsSha256,
  'SheetJS SHA-256',
)

const fontUrl = new URL('assets/fonts/NotoSansCJKjp-Regular.otf', rootUrl)
const font = await readFile(fontUrl)
requireEqual((await stat(fontUrl)).size, expectedFontBytes, 'Noto Sans CJK byte count')
requireEqual(
  createHash('sha256').update(font).digest('hex'),
  expectedFontSha256,
  'Noto Sans CJK SHA-256',
)

process.stdout.write(`${JSON.stringify({
  ok: true,
  package_count: Object.keys(expectedIntegrities).length,
  sheetjs_sha256: expectedSheetJsSha256,
})}\n`)
