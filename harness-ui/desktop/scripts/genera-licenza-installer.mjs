/*
 * F7-2 (owner 27/09/2026, «Mostra l'AGPL con "Avanti"») — il testo della pagina di licenza dell'installer.
 * TALOS è AGPL-3.0-only: una licenza che DÀ permessi, non un contratto da accettare. In testa un riassunto in italiano di
 * cosa permette e cosa chiede; sotto, il testo inglese che fa fede, IDENTICO a `LICENSE` alla radice del repository (lo
 * controlla `tests/licenza-installer.test.mjs`). UTF-8 con BOM e a capo CRLF: la pagina di licenza di NSIS mostra un .txt
 * in un controllo RichEdit, e senza BOM gli accenti non si leggono.
 * Uso: node scripts/genera-licenza-installer.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const SEPARATORE = '-'.repeat(72);
export const RIASSUNTO = [
  'TALOS è software libero, distribuito con la licenza GNU Affero General Public License, versione 3 (AGPL-3.0-only).',
  '',
  'Per installarlo e usarlo non devi accettare niente: questa licenza ti dà dei permessi.',
  '',
  '- Puoi usare TALOS per qualunque scopo, anche per lavoro.',
  '- Puoi leggerne il codice sorgente, studiarlo e modificarlo.',
  '- Puoi darne copie ad altri, con o senza modifiche.',
  '',
  'Cosa ti chiede in cambio, solo se lo ridistribuisci o lo fai usare ad altri:',
  '',
  '- se dai ad altri TALOS o una sua versione modificata, devi dare anche il codice sorgente, con la stessa licenza;',
  '- se modifichi TALOS e lo fai usare ad altri attraverso una rete, devi offrire loro il codice sorgente della tua versione.',
  '',
  'TALOS è fornito senza alcuna garanzia (sezioni 15 e 16 della licenza).',
  '',
  'Questo è un riassunto, non la licenza. Il testo che fa fede è quello inglese qui sotto.',
];

export function testoLicenzaInstaller(licenza) {
  const corpo = [...RIASSUNTO, '', SEPARATORE, '', licenza.replace(/\r\n/gu, '\n').trimEnd()].join('\n');
  return `﻿${corpo.replace(/\n/gu, '\r\n')}\r\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const licenza = readFileSync(join(root, '..', '..', 'LICENSE'), 'utf8');
  writeFileSync(join(root, 'assets', 'licenza-installer.txt'), testoLicenzaInstaller(licenza), 'utf8');
  console.log('assets/licenza-installer.txt scritto dal LICENSE del repository.');
}
