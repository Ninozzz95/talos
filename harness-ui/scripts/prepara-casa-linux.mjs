#!/usr/bin/env node
/*
 * Fase B «casa di esecuzione» — prepara in sviluppo i binari per Linux (Node e ripgrep) in `harness-ui/.casa-linux/linux-x64`,
 * con la cache in `harness-ui/.cache-casa-linux`. Le versioni e le impronte stanno in `src/casa-linux-binari.mjs`; il pacchetto
 * desktop usa la stessa funzione. Idempotente: un archivio già in cache si riverifica, non si riscarica.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparaCasaLinux, verificaCasaLinux, PIATTAFORMA_CASA_LINUX } from '../src/casa-linux-binari.mjs';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destinazione = join(radice, '.casa-linux', PIATTAFORMA_CASA_LINUX);
try {
  const manifesto = await preparaCasaLinux(destinazione, { cache: join(radice, '.cache-casa-linux') });
  const verifica = await verificaCasaLinux(destinazione, { controllaImpronte: true });
  if (!verifica.pronta) throw new Error(verifica.motivo);
  for (const [nome, b] of Object.entries(manifesto.binari)) console.log(`${nome}: ${b.versione} · sha256 ${b.sha256}`);
  console.log(`Casa Linux pronta in ${destinazione}`);
} catch (errore) {
  console.error(`Casa Linux non preparata: ${errore.message}`);
  process.exitCode = 1;
}
