import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fase = process.env.BC43_FASE || 'dopo';
const foto = fileURLToPath(new URL('../../../.claude/foto-bc43-2026-09-12/', import.meta.url));
const banco = JSON.parse(readFileSync(`${foto}/stato-banco.json`, 'utf8'))[fase];
if (!banco || banco.chiuso || new URL(banco.url).port === '4174') throw new Error('Manca il banco BC43 isolato');
process.env.TALOS_URL_CANCELLO = banco.url;
export default defineConfig({
  testDir: '../parity', testMatch: ['bc43-scorrevole-chat.spec.mjs', 'nessun-errore-a-runtime.spec.mjs'],
  outputDir: `${banco.temporanea}/playwright`, timeout: 45_000, expect: { timeout: 10_000 },
  workers: 1, fullyParallel: false, retries: 0, forbidOnly: true, reporter: 'list',
  use: { baseURL: banco.url, channel: 'chrome', headless: true, locale: 'it-IT', viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
});
