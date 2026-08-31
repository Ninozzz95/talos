import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const root = dirname(fileURLToPath(import.meta.url));

test('model card renderer builds nodes and routes images through the local proxy', async () => {
  const source = await readFile(join(root, '..', 'public', 'app.js'), 'utf8');
  const start = source.indexOf('function renderizzaModelCardReadme');
  const end = source.indexOf('function renderizzaHfDetailModelLab', start);
  assert.ok(start >= 0 && end > start);
  const renderer = source.slice(start, end);
  assert.match(renderer, /document\.createElement\('img'\)/u);
  assert.match(renderer, /API\(`\/api\/v1\/huggingface\/image\?url=/u);
  assert.match(renderer, /renderizzaMarkdownSemplice\(detail\.readme\)/u);
  assert.doesNotMatch(renderer, /innerHTML|src\s*=\s*image\.url|javascript:/iu);
});

test('static UI keeps the main security headers and never adds an inline script sink', async () => {
  const html = await readFile(join(root, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /styles\.css/u);
  assert.match(html, /app\.js/u);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]/iu);
});
