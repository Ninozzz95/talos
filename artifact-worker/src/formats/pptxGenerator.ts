import PptxGenJSModule from 'pptxgenjs'

import type { SemanticDocument } from '../contracts/semanticDocument.js'

interface PptxSlideAdapter {
  background: { color: string }
  addText(text: unknown, options?: unknown): unknown
}

interface PptxPresentationAdapter {
  layout: string
  author: string
  subject: string
  title: string
  company: string
  lang: string
  theme: unknown
  addSlide(): PptxSlideAdapter
  write(options: { outputType: 'nodebuffer'; compression: true }): Promise<unknown>
}

function firstParagraph(document: SemanticDocument): string {
  const paragraph = document.sections.find((section) => section.type === 'paragraph')
  return paragraph?.type === 'paragraph' ? paragraph.text : document.title
}

export async function generatePptx(
  document: SemanticDocument,
  signal?: AbortSignal,
): Promise<Buffer> {
  const PptxGenJSConstructor = PptxGenJSModule as unknown as new () => PptxPresentationAdapter
  const presentation = new PptxGenJSConstructor()
  presentation.layout = 'LAYOUT_WIDE'
  presentation.author = document.author
  presentation.subject = 'TALOS verified artifact'
  presentation.title = document.title
  presentation.company = 'TALOS'
  presentation.lang = document.locale
  presentation.theme = {
    headFontFace: 'Noto Sans CJK JP',
    bodyFontFace: 'Noto Sans CJK JP',
    lang: document.locale,
  }

  const slides = document.slides ?? [{
    title: document.title,
    body: firstParagraph(document),
  }]

  for (const source of slides) {
    signal?.throwIfAborted()
    const slide = presentation.addSlide()
    slide.background = { color: 'F7FAFC' }
    slide.addText(source.title, {
      x: 0.65,
      y: 0.55,
      w: 12,
      h: 0.7,
      fontFace: 'Noto Sans CJK JP',
      fontSize: 26,
      bold: true,
      color: '075A6A',
      margin: 0,
    })
    if (source.body !== undefined) {
      slide.addText(source.body, {
        x: 0.65,
        y: 1.6,
        w: 12,
        h: 1.4,
        fontFace: 'Noto Sans CJK JP',
        fontSize: 15,
        color: '1F2937',
        breakLine: false,
        margin: 0,
        valign: 'top',
      })
    }
    if (source.bullets !== undefined && source.bullets.length > 0) {
      slide.addText(source.bullets.map((text) => ({
        text,
        options: { bullet: { indent: 18 } },
      })), {
        x: 0.75,
        y: 3.1,
        w: 11.6,
        h: 3.6,
        fontFace: 'Noto Sans CJK JP',
        fontSize: 15,
        color: '1F2937',
        breakLine: true,
        margin: 0,
        valign: 'top',
      })
    }
  }

  signal?.throwIfAborted()
  const output = await presentation.write({ outputType: 'nodebuffer', compression: true })
  return Buffer.from(output as Uint8Array)
}
