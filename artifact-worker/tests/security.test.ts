import { existsSync } from 'node:fs'
import { glob, readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { ArtifactLimitsV1 } from '../src/contracts/artifactLimits.js'
import { generateArtifact } from '../src/generateArtifact.js'
import { validateArtifact } from '../src/validation/artifactValidator.js'

const rootUrl = new URL('../', import.meta.url)
const repositoryDockerignoreUrl = new URL('../../.dockerignore', import.meta.url)

describe('artifact worker security boundaries', () => {
  it.skipIf(!existsSync(repositoryDockerignoreUrl))(
    'admits only the pinned artifact-worker vendor tarball through the root build context',
    async () => {
      const repositoryDockerignore = await readFile(repositoryDockerignoreUrl, 'utf8')
      const rules = repositoryDockerignore.split(/\r?\n/)
      const expectedRules = [
        '**/vendor/',
        '!artifact-worker/vendor/',
        'artifact-worker/vendor/*',
        '!artifact-worker/vendor/xlsx-0.20.3.tgz',
      ]
      const indexes = expectedRules.map((rule) => rules.indexOf(rule))

      expect(indexes).not.toContain(-1)
      expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
      expect(rules.filter((rule) => rule.startsWith('!artifact-worker/vendor'))).toEqual([
        '!artifact-worker/vendor/',
        '!artifact-worker/vendor/xlsx-0.20.3.tgz',
      ])
    },
  )

  it('pins a tested, non-root, shell-free container runtime and a bounded build context', async () => {
    const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
    const dockerignore = await readFile(
      new URL('../Dockerfile.dockerignore', import.meta.url),
      'utf8',
    )
    const fontconfig = await readFile(
      new URL('../assets/fontconfig/fonts.conf', import.meta.url),
      'utf8',
    )

    expect(dockerfile).toContain(
      'node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d',
    )
    expect(dockerfile).toContain(
      'gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212 AS runtime',
    )
    expect(dockerfile).toMatch(/FROM dependencies AS test[\s\S]*npm run verify:provenance/)
    expect(dockerfile).toMatch(
      /FROM test AS production-dependencies[\s\S]*npm prune --omit=dev --ignore-scripts/,
    )
    expect(dockerfile).toMatch(
      /npm run verify:provenance[\s\\]+&& npm audit --audit-level=high[\s\\]+&& npm test/,
    )
    expect(dockerfile).toContain('COPY artifact-worker/package.json artifact-worker/package-lock.json artifact-worker/.npmrc ./')
    expect(dockerfile).toContain('COPY THIRD_PARTY_NOTICES.md /THIRD_PARTY_NOTICES.md')
    expect(dockerfile).toContain('FONTCONFIG_PATH=/app/assets/fontconfig')

    const runtime = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '))
    expect(runtime).toContain('USER 65532:65532')
    expect(runtime).toContain('ENTRYPOINT ["/nodejs/bin/node"]')
    expect(runtime).toContain('CMD ["dist/cli.js"]')
    expect(runtime).toContain('ARTIFACT_WORKER_HOST=0.0.0.0')
    expect(runtime).toContain('ARTIFACT_WORKER_TEMP_DIR=/tmp/talos-artifact-worker')
    expect(runtime).not.toMatch(/\bRUN\b/)
    expect(runtime).not.toMatch(/\bnpm\b|:debug|\/bin\/(?:ba)?sh/)

    for (const ignored of [
      '**',
      '**/node_modules',
      '**/dist',
      '**/coverage',
      '.env',
      '*.log',
      '**/.artifact-worker-tmp',
    ]) {
      expect(dockerignore).toContain(ignored)
    }
    expect(dockerignore).toContain('!artifact-worker/src/**')
    expect(dockerignore).toContain('!artifact-worker/assets/fontconfig/fonts.conf')
    expect(dockerignore).toContain('!artifact-worker/vendor/xlsx-0.20.3.tgz')
    expect(dockerignore).toContain('!THIRD_PARTY_NOTICES.md')
    expect(fontconfig).toContain('<dir>/app/assets/fonts</dir>')
    expect(fontconfig).toContain('<cachedir>/tmp/talos-fontconfig-cache</cachedir>')
    expect(fontconfig).not.toContain('/usr/share/fonts')
  })

  it('contains no worker-owned network, shell, eval, or dynamic-function execution', async () => {
    const forbidden = [
      /from ['"]node:(?:child_process|cluster|dgram|dns|http|https|net|tls|worker_threads)['"]/,
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
    ]

    for await (const path of glob('src/**/*.ts', { cwd: rootUrl })) {
      const source = await readFile(new URL(path, rootUrl), 'utf8')
      forbidden.forEach((pattern) => expect(source, `${path}: ${pattern}`).not.toMatch(pattern))
    }
  })

  it('fails closed when bytes do not match the declared format', async () => {
    const limits = ArtifactLimitsV1.parse({
      max_output_bytes: 10_000,
      max_duration_ms: 1_000,
      max_sections: 10,
      max_rows: 10,
      max_slides: 10,
      max_input_pixels: 1_000_000,
    })

    await expect(validateArtifact(Buffer.from('not a PDF'), 'pdf', limits)).rejects.toMatchObject({
      code: 'ARTIFACT_VALIDATION_FAILED',
    })
  })

  it('escapes document text before rendering the internal thumbnail SVG', async () => {
    const response = await generateArtifact({
      contract: 'talos.artifact.request.v1',
      request_id: '019f9b4f-42c3-72f4-b5bb-8b237f98f7c2',
      format: 'thumbnail',
      filename: 'escaped.png',
      document: {
        contract: 'talos.semantic_document.v1',
        title: '</text><image href="https://example.invalid/secret"/>',
        locale: 'en-US',
        author: 'TALOS',
        sections: [{ type: 'paragraph', text: '<script>alert(1)</script>' }],
      },
      limits: {
        max_output_bytes: 1_000_000,
        max_duration_ms: 10_000,
        max_sections: 10,
        max_rows: 10,
        max_slides: 10,
        max_input_pixels: 1_000_000,
      },
    })

    expect(response.status).toBe('succeeded')
    expect(response).not.toHaveProperty('temp_path')
  })
})
