import { parseOffice } from 'officeparser'

import type { ArtifactFormat } from '../contracts/artifactProtocol.js'

export async function reopenOfficeArtifact(
  bytes: Buffer,
  format: Extract<ArtifactFormat, 'docx' | 'pptx'>,
  signal?: AbortSignal,
): Promise<void> {
  const warnings: unknown[] = []
  const ast = await parseOffice(bytes, {
    ...(signal === undefined ? {} : { abortSignal: signal }),
    fileType: format,
    ocr: false,
    extractAttachments: false,
    includeRawContent: false,
    ignoreComments: true,
    ignoreHeadersAndFooters: false,
    ignoreNotes: false,
    ignoreSlideMasters: true,
    onWarning: (warning) => {
      warnings.push(warning)
    },
    decompressionLimits: {
      maxUncompressedBytes: 25_000_000,
      maxZipEntries: 2_000,
      maxTableCells: 100_000,
    },
  })

  if (ast.content.length === 0 || ast.toText().trim().length === 0 || warnings.length > 0) {
    throw new Error('Office artifact did not reopen cleanly')
  }
}
