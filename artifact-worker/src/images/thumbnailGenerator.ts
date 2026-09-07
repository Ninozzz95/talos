import sharp from 'sharp'

import type { SemanticDocument } from '../contracts/semanticDocument.js'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function summary(document: SemanticDocument): string {
  const paragraph = document.sections.find((section) => section.type === 'paragraph')
  const text = paragraph?.type === 'paragraph' ? paragraph.text : document.author
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

export async function generateThumbnail(
  document: SemanticDocument,
  maxInputPixels: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  signal?.throwIfAborted()
  const svg = `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#0b0f11"/>
      <rect x="64" y="64" width="8" height="502" fill="#6ad4d4"/>
      <text x="112" y="165" fill="#63f08e" font-family="Arial, sans-serif" font-size="28">TALOS VERIFIED ARTIFACT</text>
      <text x="112" y="255" fill="#f7fafc" font-family="Arial, sans-serif" font-size="48" font-weight="700">${escapeXml(document.title)}</text>
      <foreignObject x="112" y="310" width="960" height="190">
        <div xmlns="http://www.w3.org/1999/xhtml" style="color:#cbd5e1;font-family:Arial,sans-serif;font-size:24px;line-height:1.45">${escapeXml(summary(document))}</div>
      </foreignObject>
      <text x="112" y="545" fill="#94a3b8" font-family="Arial, sans-serif" font-size="20">${escapeXml(document.author)}</text>
    </svg>`

  return sharp(Buffer.from(svg), {
    failOn: 'warning',
    limitInputPixels: maxInputPixels,
    sequentialRead: true,
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}
