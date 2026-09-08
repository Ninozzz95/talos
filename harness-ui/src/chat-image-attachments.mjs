import { randomUUID } from 'node:crypto';
import { createGeneratedImageStore } from './generated-image-store.mjs';

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_IMAGES_MAX_BYTES = 12 * 1024 * 1024;
const ID = /^[a-f0-9]{64}$/;
const URL_PREFIX = '/api/v1/chat-images/';
function invalid(message, code = 'QUERY_INVALID') { return Object.assign(new Error(message), { code }); }

function decodeImage(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(CHAT_IMAGE_MAX_BYTES / 3) * 4 + 64) throw invalid('Immagine troppo grande: massimo 5 MiB.', 'PAYLOAD_LIMIT');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw invalid('Allega un’immagine PNG, JPEG o WebP valida.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > CHAT_IMAGE_MAX_BYTES || bytes.toString('base64') !== match[2]) throw invalid('I dati dell’immagine non sono validi.');
  const mime = match[1];
  const signature = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!signature) throw invalid('Il formato dichiarato non corrisponde all’immagine.');
  return { bytes, mimeType: mime };
}

/** Stored content stays small; native bytes are materialized only by the provider adapter. */
export function imageMessageContent(text, immagini = []) {
  if (!immagini.length) return text;
  return [ ...(text ? [{ type: 'text', text }] : []), ...immagini.map(image => ({ type: 'image_url', image_url: { url: `${URL_PREFIX}${image.id}` } })) ];
}

export function createChatImageStore({ rootDir, fsImpl } = {}) {
  const disk = createGeneratedImageStore({ rootDir, fsImpl });
  const metadata = value => ({ id: value.id, tipo: 'immagine', nome: value.source.slice(value.source.indexOf(':') + 1), mimeType: value.mimeType, byte: typeof value.bytes === 'number' ? value.bytes : value.bytes.length, url: `${URL_PREFIX}${value.id}` });
  return Object.freeze({
    async upload(input) {
      if (!input || typeof input.nome !== 'string' || !input.nome.trim() || input.nome.length > 240 || /[\0\r\n]/.test(input.nome)) throw invalid('Nome immagine non valido.');
      const image = decodeImage(input.dataUrl);
      const saved = await disk.persistGeneratedImage({ ...image, source: `${randomUUID()}:${input.nome}` });
      return metadata(saved);
    },
    read: id => disk.readGeneratedImage(id),
    async validateReferences(images) {
      if (images === undefined) return [];
      if (!Array.isArray(images) || images.length > 10) throw invalid('Massimo 10 immagini per messaggio.');
      const result = [];
      let total = 0;
      for (const image of images) {
        if (!image || !ID.test(image.id)) throw invalid('Riferimento immagine non valido.');
        const saved = await disk.readGeneratedImage(image.id);
        total += saved.bytes.length;
        if (total > CHAT_IMAGES_MAX_BYTES) throw invalid('Le immagini del messaggio superano 12 MiB.', 'PAYLOAD_LIMIT');
        result.push(metadata(saved));
      }
      return result;
    },
    async resolveMessages(messages) {
      let total = 0;
      return Promise.all(messages.map(async message => {
        if (!Array.isArray(message.content)) return message;
        const content = [];
        for (const part of message.content) {
          const url = part?.type === 'image_url' ? part.image_url?.url : null;
          if (typeof url !== 'string' || !url.startsWith(URL_PREFIX)) { content.push(part); continue; }
          const saved = await disk.readGeneratedImage(url.slice(URL_PREFIX.length));
          total += saved.bytes.length;
          if (total > CHAT_IMAGES_MAX_BYTES) throw invalid('Le immagini nella conversazione superano 12 MiB. Avvia una nuova conversazione per allegarne altre.', 'PAYLOAD_LIMIT');
          content.push({ ...part, image_url: { ...part.image_url, url: `data:${saved.mimeType};base64,${saved.bytes.toString('base64')}` } });
        }
        return { ...message, content };
      }));
    },
  });
}
