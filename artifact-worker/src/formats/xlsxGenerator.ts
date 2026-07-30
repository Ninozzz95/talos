import * as XLSX from 'xlsx'

import type { SemanticDocument } from '../contracts/semanticDocument.js'

export async function generateXlsx(
  document: SemanticDocument,
  signal?: AbortSignal,
): Promise<Buffer> {
  const workbook = XLSX.utils.book_new()
  const sheets = document.sheets ?? [{
    name: 'Report',
    columns: ['Section', 'Content'],
    rows: document.sections.map((section, index) => [
      `Section ${index + 1}`,
      section.type === 'heading' || section.type === 'paragraph'
        ? section.text
        : section.type === 'bullets'
          ? section.items.join('\n')
          : `${section.rows.length} table rows`,
    ]),
  }]

  for (const source of sheets) {
    signal?.throwIfAborted()
    const worksheet = XLSX.utils.aoa_to_sheet([
      source.columns,
      ...source.rows.map((row) => row.map((value) => value)),
    ], { cellDates: false })
    worksheet['!cols'] = source.columns.map(() => ({ wch: 24 }))
    XLSX.utils.book_append_sheet(workbook, worksheet, source.name)
  }

  signal?.throwIfAborted()
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true,
    cellDates: false,
  }) as Buffer
}
