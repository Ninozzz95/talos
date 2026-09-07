import { readFile } from 'node:fs/promises'

import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib'

import type { SemanticDocument } from '../contracts/semanticDocument.js'

const fontUrl = new URL('../../assets/fonts/NotoSansCJKjp-Regular.otf', import.meta.url)
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48

function linesForText(font: PDFFont, text: string, size: number, maximumWidth: number): string[] {
  const lines: string[] = []
  let current = ''

  for (const character of text) {
    const candidate = `${current}${character}`
    if (current.length > 0 && font.widthOfTextAtSize(candidate, size) > maximumWidth) {
      lines.push(current)
      current = character
    } else {
      current = candidate
    }
  }

  if (current.length > 0) {
    lines.push(current)
  }

  return lines.length > 0 ? lines : ['']
}

function sectionText(section: SemanticDocument['sections'][number]): string[] {
  if (section.type === 'heading' || section.type === 'paragraph') {
    return [section.text]
  }
  if (section.type === 'bullets') {
    return section.items.map((item, index) => `${section.ordered ? `${index + 1}.` : '-'} ${item}`)
  }

  return [
    section.columns.map((column) => column.label).join(' | '),
    ...section.rows.map((row) => section.columns
      .map((column) => String(row[column.key] ?? ''))
      .join(' | ')),
  ]
}

export async function generatePdf(
  document: SemanticDocument,
  signal?: AbortSignal,
): Promise<Buffer> {
  signal?.throwIfAborted()
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await readFile(fontUrl), { subset: true })
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const drawLines = (values: string[], size: number, color = rgb(0.12, 0.16, 0.2)): void => {
    for (const value of values) {
      for (const line of linesForText(font, value, size, PAGE_WIDTH - (MARGIN * 2))) {
        if (y < MARGIN + size) {
          page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
          y = PAGE_HEIGHT - MARGIN
        }
        page.drawText(line, { x: MARGIN, y, size, font, color })
        y -= size * 1.45
      }
      y -= size * 0.35
    }
  }

  drawLines([document.title], 20, rgb(0.03, 0.35, 0.42))
  for (const section of document.sections) {
    signal?.throwIfAborted()
    drawLines(sectionText(section), section.type === 'heading' ? 15 : 10)
  }

  signal?.throwIfAborted()
  return Buffer.from(await pdf.save({ useObjectStreams: false }))
}
