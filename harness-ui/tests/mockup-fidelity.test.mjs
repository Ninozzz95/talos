import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const copyRoot = path.resolve(here, '..', 'mockup-originale')

const EXPECTED = Object.freeze({
  'README.md': ['c16a6a43550d406db0964e5aae2c047055b0a07af100fd243aa97107bf045fe1', 2243],
  'RESEARCH.md': ['7172c557574f3f750fa80cf0063dcfb2b08f50a9e3b58c428e1d31ca7575bb08', 10076],
  'UI_REVIEW.md': ['742bea46c50c03d4f04798c3e7535ff44387ce9e674a02837d38cb2126f9b91f', 3479],
  'app.js': ['f29b235715949f4b2cda2d49a71a69669fc8820909a33dee08bdaf0e1a93b2bd', 42020],
  'index.html': ['5dda79b91c843fa43e2c1798d0a397fd5b1ca1536f9cc2a49cb3cbec3c2daaf7', 37745],
  'preview-desktop.png': ['ff696e0010c97f03650d8255d6c67951ddee4e64eb24d3becccf1fd8d0cd9393', 221190],
  'preview-laptop.png': ['aa209369f8c501f9c553b6356a4f921e4abfdb9b3f91a2f2190beb76deb9ccf9', 146433],
  'preview-mobile-capabilities.png': ['ed754117631578ae4aa412dd34a514ac940edb53adb2a42b2214f3b19ea5fe9b', 61386],
  'preview-mobile-narrow.png': ['9f3e28eb8063190347895d0f4ae9b59e3788524ef3b5a4c54b2c28eab4d11a38', 54770],
  'preview-mobile-review.png': ['8e619e1037b623b588cdd229d2cf84f6bcf15a5bcd33c4189cade42a3e73fd23', 58320],
  'preview-mobile.png': ['e72579b5d9fa0aa0ab97febd1168320ed98835fbb0afc0a7e7a6f55a46e3a22e', 77101],
  'preview-tablet.png': ['fe5954c6d00616acd61cbcc78f15038d3f58a7184cdd4a2e898540575dc45cbf', 106526],
  'references/claude-mobile-reference.jpg': ['08db00db2273c47bbcc8ed5192e2fad33d6702f67b53e3a4f6342b9230c03b02', 12832],
  'references/deepseek-harness-reference.png': ['1495407b7978053a396328bff3e9b6123e5c57242e12eda5a225dd0d0334a97c', 347771],
  'references/openclaw-workbench-reference.png': ['6cbf44a42dbf7698cad262a7457cb4bf5df7ad445a12431fe3bca740704c9362', 1904472],
  'references/talos-current-reference.jpg': ['233787c4d843fae05010883503eb553b8a047d813c4af9ffd188a63a1b0e46e5', 168297],
  'styles.css': ['126032f8525f319ece368828b36f2a1ba233e051672ae390d155badb178b3e07', 59103],
  'talos-harness-standalone.html': ['caa4fe700ae31e39611d832e093fd77a98f0215a00a4ebaa12288685b2b39a10', 138835],
})

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute))
    else files.push(path.relative(root, absolute).split(path.sep).join('/'))
  }
  return files.sort()
}

test('source manifest contains exactly the 18 approved files', async () => {
  assert.equal((await stat(copyRoot)).isDirectory(), true)
  assert.deepEqual(await listFiles(copyRoot), Object.keys(EXPECTED).sort())
})

test('every copied byte matches the recorded SHA-256', async () => {
  for (const [relative, [expectedHash, expectedBytes]] of Object.entries(EXPECTED)) {
    const content = await readFile(path.join(copyRoot, ...relative.split('/')))
    assert.equal(content.byteLength, expectedBytes, `${relative} byte count`)
    assert.equal(createHash('sha256').update(content).digest('hex'), expectedHash, `${relative} SHA-256`)
  }
})
