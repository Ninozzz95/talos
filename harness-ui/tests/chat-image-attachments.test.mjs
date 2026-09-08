import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatImageStore, imageMessageContent } from '../src/chat-image-attachments.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const input = { nome: 'controllo.png', dataUrl: `data:image/png;base64,${png}`, larghezza: 1, altezza: 1 };
async function isolated(fn) { const rootDir = await mkdtemp(join(tmpdir(), 'talos-chat-images-')); try { await fn(createChatImageStore({ rootDir }), rootDir); } finally { await rm(rootDir, { recursive: true, force: true }); } }

test('IMAGE-01 — upload conserva i pixel dopo riavvio senza esporre percorsi', () => isolated(async (store, rootDir) => {
  const image = await store.upload(input);
  assert.equal(image.tipo, 'immagine');
  assert.equal(image.path, undefined);
  assert.match(image.url, /^\/api\/v1\/chat-images\/[a-f0-9]{64}$/);
  const reopened = await createChatImageStore({ rootDir }).read(image.id);
  assert.equal(reopened.bytes.toString('base64'), png);
  assert.deepEqual(await store.validateReferences([image]), [image]);
}));

test('IMAGE-02 — MIME falso, URL remota, base64 guasto e percorso rifiutati', () => isolated(async store => {
  for (const dataUrl of ['https://example.com/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,' + png, 'data:image/png;base64,!!']) {
    await assert.rejects(store.upload({ ...input, dataUrl }), { code: 'QUERY_INVALID' });
  }
  await assert.rejects(store.read('../secret'));
  await assert.rejects(store.validateReferences([{ id: 'a'.repeat(64) }]));
}));

test('IMAGE-03 — risolve al confine rete, preserva storico e immagini di turni precedenti', () => isolated(async store => {
  const image = await store.upload(input);
  const messages = [{ role: 'user', content: imageMessageContent('Cosa vedi?', [image]) }, { role: 'assistant', content: 'Vedo.' }, { role: 'user', content: 'E il colore?' }];
  const original = structuredClone(messages);
  const resolved = await store.resolveMessages(messages);
  assert.equal(resolved[0].content[1].image_url.url, input.dataUrl);
  assert.deepEqual(messages, original);
  assert.deepEqual(resolved.slice(1), messages.slice(1));
  assert.equal(imageMessageContent('solo testo', []), 'solo testo');
}));

test('IMAGE-02-LIMITS limiti espliciti per immagine, messaggio e cronologia', () => isolated(async store => {
  const max=5*1024*1024;
  const bytes=Buffer.alloc(max);Buffer.from(png,'base64').copy(bytes);
  const large={nome:'limite.png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')};
  const image=await store.upload(large);
  await assert.rejects(store.upload({...large,dataUrl:'data:image/png;base64,'+Buffer.concat([bytes,Buffer.of(0)]).toString('base64')}), /grande|validi/);
  await assert.rejects(store.validateReferences(Array(11).fill(image)),/10 immagini/);
  await assert.rejects(store.validateReferences([image,image,image]),{code:'PAYLOAD_LIMIT'});
  const history=[{role:'user',content:imageMessageContent('Prima',[image,image])},{role:'user',content:imageMessageContent('Dopo',[image])}];
  const original=structuredClone(history);
  await assert.rejects(store.resolveMessages(history),{code:'PAYLOAD_LIMIT'});
  assert.deepEqual(history,original);
}));

test('IMAGE-02b — corruzione su disco non degrada a sola notifica nominale', () => isolated(async (store, rootDir) => {
  const image = await store.upload(input);
  await writeFile(join(rootDir, image.id + '.png'), 'danneggiato');
  await assert.rejects(store.resolveMessages([{ role: 'user', content: imageMessageContent('controlla', [image]) }]));
}));
