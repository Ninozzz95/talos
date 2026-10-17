/*
 * F7-2 (owner 27/09/2026, «Mostra l'AGPL con "Avanti"») — il testo della pagina di licenza dell'installer.
 * TALOS è AGPL-3.0-only: una licenza che DÀ permessi, non un contratto da accettare. In testa un riassunto di cosa permette
 * e cosa chiede; sotto, il testo inglese che fa fede, IDENTICO a `LICENSE` alla radice del repository (lo controlla
 * `tests/licenza-installer.test.mjs`). UTF-8 con BOM e a capo CRLF: la pagina di licenza di NSIS mostra un .txt in un
 * controllo RichEdit, e senza BOM gli accenti non si leggono.
 *
 * Owner 12/10/2026, «inglese di default e italiano solo se il sistema è in italiano»: DUE file, uno per lingua, coi nomi che
 * electron-builder 26.16.1 riconosce da solo nella cartella delle risorse (`app-builder-lib/out/util/license.js:41-45`,
 * `license_<lingua>_<REGIONE>.txt`) e che diventano `LicenseLangString MUILicense <lcid>` (`nsisLicense.js:63-75`). L'opzione
 * `nsis.license` NON c'è più: se ci fosse, vincerebbe un file solo per tutte le lingue (`nsisLicense.js:33-54`).
 * Uso: node scripts/genera-licenza-installer.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const SEPARATORE = '-'.repeat(72);
/** Il riassunto per lingua: l'inglese è la sorgente, l'italiano la sua traduzione (regola 03/10/2026). */
export const RIASSUNTI = Object.freeze({
  en_US: [
    'TALOS is free software, distributed under the GNU Affero General Public License, version 3 (AGPL-3.0-only).',
    '',
    'You do not have to accept anything to install and use it: this license gives you permissions.',
    '',
    '- You can use TALOS for any purpose, including for work.',
    '- You can read its source code, study it and change it.',
    '- You can give copies to others, with or without changes.',
    '',
    'What it asks in return, only if you redistribute it or let others use it:',
    '',
    '- if you give others TALOS or a modified version of it, you must also give the source code, under the same license;',
    '- if you modify TALOS and let others use it over a network, you must offer them the source code of your version.',
    '',
    'TALOS comes with no warranty (sections 15 and 16 of the license).',
    '',
    'This is a summary, not the license. The text that counts is the one below.',
  ],
  it_IT: [
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
  ],
});
export const fileDellaLicenza = (lingua) => `license_${lingua}.txt`;

export function testoLicenzaInstaller(licenza, lingua = 'en_US') {
  const riassunto = RIASSUNTI[lingua];
  if (!riassunto) throw new Error(`nessun riassunto per la lingua ${lingua}`);
  const corpo = [...riassunto, '', SEPARATORE, '', licenza.replace(/\r\n/gu, '\n').trimEnd()].join('\n');
  return `﻿${corpo.replace(/\n/gu, '\r\n')}\r\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const licenza = readFileSync(join(root, '..', '..', 'LICENSE'), 'utf8');
  for (const lingua of Object.keys(RIASSUNTI)) {
    writeFileSync(join(root, 'assets', fileDellaLicenza(lingua)), testoLicenzaInstaller(licenza, lingua), 'utf8');
    console.log(`assets/${fileDellaLicenza(lingua)} scritto dal LICENSE del repository.`);
  }
}
