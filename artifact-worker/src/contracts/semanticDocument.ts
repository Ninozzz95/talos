import { z } from 'zod'

const MAX_TEXT_LENGTH = 20_000
const MAX_TITLE_LENGTH = 240
const MAX_LIST_ITEMS = 500
const MAX_TABLE_COLUMNS = 64
const MAX_SHEETS = 32

const boundedText = z.string().min(1).max(MAX_TEXT_LENGTH)
const boundedTitle = z.string().min(1).max(MAX_TITLE_LENGTH)
const cellValue = z.union([z.string().max(MAX_TEXT_LENGTH), z.number().finite(), z.boolean(), z.null()])

const headingSection = z.strictObject({
  type: z.literal('heading'),
  level: z.number().int().min(1).max(6),
  text: boundedTitle,
})

const paragraphSection = z.strictObject({
  type: z.literal('paragraph'),
  text: boundedText,
})

const bulletsSection = z.strictObject({
  type: z.literal('bullets'),
  ordered: z.boolean(),
  items: z.array(boundedText).min(1).max(MAX_LIST_ITEMS),
})

const tableColumn = z.strictObject({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  label: boundedTitle,
})

const tableSection = z.strictObject({
  type: z.literal('table'),
  columns: z.array(tableColumn).min(1).max(MAX_TABLE_COLUMNS),
  rows: z.array(z.record(z.string(), cellValue)).max(5_000),
}).superRefine((table, context) => {
  const columnKeys = table.columns.map((column) => column.key)
  if (new Set(columnKeys).size !== columnKeys.length) {
    context.addIssue({
      code: 'custom',
      path: ['columns'],
      message: 'Table column keys must be unique',
    })
    return
  }

  const allowedKeys = new Set(columnKeys)
  table.rows.forEach((row, rowIndex) => {
    const keys = Object.keys(row)
    if (keys.some((key) => !allowedKeys.has(key))) {
      context.addIssue({
        code: 'custom',
        path: ['rows', rowIndex],
        message: 'Table rows may only contain declared columns',
      })
    }
  })
})

const section = z.discriminatedUnion('type', [
  headingSection,
  paragraphSection,
  bulletsSection,
  tableSection,
])

const slide = z.strictObject({
  title: boundedTitle,
  body: boundedText.optional(),
  bullets: z.array(boundedText).max(MAX_LIST_ITEMS).optional(),
}).refine((value) => value.body !== undefined || (value.bullets?.length ?? 0) > 0, {
  message: 'A slide requires body text or bullets',
})

const sheet = z.strictObject({
  name: z.string().min(1).max(31).refine((value) => !/[:\\/?*[\]]/.test(value), {
    message: 'Worksheet name contains a reserved character',
  }),
  columns: z.array(boundedTitle).min(1).max(MAX_TABLE_COLUMNS),
  rows: z.array(z.array(cellValue).max(MAX_TABLE_COLUMNS)).max(5_000),
}).superRefine((value, context) => {
  value.rows.forEach((row, rowIndex) => {
    if (row.length !== value.columns.length) {
      context.addIssue({
        code: 'custom',
        path: ['rows', rowIndex],
        message: 'Worksheet rows must match the declared column count',
      })
    }
  })
})

export const SemanticDocumentV1 = z.strictObject({
  contract: z.literal('talos.semantic_document.v1'),
  title: boundedTitle,
  locale: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  author: boundedTitle,
  sections: z.array(section).min(1).max(200),
  slides: z.array(slide).max(100).optional(),
  sheets: z.array(sheet).max(MAX_SHEETS).optional(),
})

export type SemanticDocument = z.infer<typeof SemanticDocumentV1>
