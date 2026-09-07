import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx'

import type { SemanticDocument } from '../contracts/semanticDocument.js'

const headingLevels: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

function valueText(value: string | number | boolean | null): string {
  if (value === null) {
    return ''
  }
  return String(value)
}

export async function generateDocx(
  document: SemanticDocument,
  signal?: AbortSignal,
): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun(document.title)],
    }),
  ]

  for (const section of document.sections) {
    signal?.throwIfAborted()

    if (section.type === 'heading') {
      const heading = headingLevels[section.level]
      if (heading === undefined) {
        throw new Error('Unsupported heading level')
      }
      children.push(new Paragraph({
        heading,
        children: [new TextRun(section.text)],
      }))
    } else if (section.type === 'paragraph') {
      children.push(new Paragraph(section.text))
    } else if (section.type === 'bullets') {
      section.items.forEach((item, index) => {
        children.push(new Paragraph({
          text: item,
          ...(section.ordered
            ? { numbering: { reference: 'talos-numbering', level: 0 } }
            : { bullet: { level: 0 } }),
          spacing: { after: index === section.items.length - 1 ? 160 : 40 },
        }))
      })
    } else {
      const header = new TableRow({
        tableHeader: true,
        children: section.columns.map((column) => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: column.label, bold: true })] })],
        })),
      })
      const rows = section.rows.map((row) => new TableRow({
        children: section.columns.map((column) => new TableCell({
          children: [new Paragraph(valueText(row[column.key] ?? null))],
        })),
      }))
      children.push(new Table({ rows: [header, ...rows] }))
    }
  }

  const file = new Document({
    creator: document.author,
    title: document.title,
    numbering: {
      config: [{
        reference: 'talos-numbering',
        levels: [{
          level: 0,
          format: 'decimal',
          text: '%1.',
          alignment: 'start',
        }],
      }],
    },
    sections: [{ children }],
  })

  signal?.throwIfAborted()
  return Packer.toBuffer(file)
}
