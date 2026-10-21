#!/usr/bin/env node
/*
 * talos-relay — il server relay della persona per il controllo remoto di TALOS, con un comando (R5.9, owner 18/10/2026).
 *
 * Scarica il binario ufficiale di iroh-relay fissato a versione e impronta, scrive la sua configurazione (gettone condiviso,
 * metriche spente, certificato Let's Encrypt o il proprio) e lo avvia. Stampa l'indirizzo da incollare in TALOS, sul computer, in
 * «Telefoni collegati» › «Il mio server».
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { VERSIONE } from '../src/binari.mjs';
import { installa } from '../src/installa.mjs';
import { cartellaDati, gettone, impostazioni, indirizzo, scriviConfigurazione } from '../src/configurazione.mjs';

const AIUTO = `talos-relay — your own relay server for TALOS remote control (iroh-relay ${VERSIONE})

Usage:
  talos-relay --domain relay.example.com --email you@example.com
      Starts the relay with a free Let's Encrypt certificate. The domain must point to this machine,
      and TCP ports 80 and 443 and UDP port 7842 must be reachable from the internet.
  talos-relay --domain relay.example.com --cert fullchain.pem --key privkey.pem
      Starts the relay with your own certificate.
  talos-relay --dev [--port 3340]
      Plain HTTP on 127.0.0.1, only to try it on this machine.
  talos-relay
      Starts again with the settings of the last run.
  talos-relay address        Prints the address to paste in TALOS.
  talos-relay rotate-token   Makes a new token. Paste the new address in TALOS and pair the phones again.

Options:
  --dir <path>   Where talos-relay keeps its files (default ~/.talos-relay, or TALOS_RELAY_DIR).
  -h, --help     This help.  -v, --version  The iroh-relay version.

Only clients that know the token can use the relay; TALOS on the computer still accepts only the phones you paired.`;

const ADDRESS_TEXT = (a) => `\nPaste this address in TALOS on the computer (Paired phones › My own server):\n\n  ${a}\n\nKeep it private: whoever has it can use this relay.\n`;

async function principale(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      domain: { type: 'string' }, email: { type: 'string' }, cert: { type: 'string' }, key: { type: 'string' },
      dev: { type: 'boolean' }, port: { type: 'string' }, dir: { type: 'string' },
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.help) { console.log(AIUTO); return 0; }
  if (values.version) { console.log(`talos-relay, iroh-relay ${VERSIONE}`); return 0; }
  const comando = positionals[0] ?? 'start';
  if (!['start', 'address', 'rotate-token'].includes(comando) || positionals.length > 1) {
    console.error(`Unknown command "${positionals.join(' ')}". Run talos-relay --help.`);
    return 2;
  }
  const cartella = values.dir ? cartellaDati({ TALOS_RELAY_DIR: values.dir }) : cartellaDati();

  if (comando === 'address' || comando === 'rotate-token') {
    const salvate = await readFile(`${cartella}/settings.json`, 'utf8').then(JSON.parse).catch(() => null);
    if (!salvate) { console.error('talos-relay has not been started here yet: start it once with --domain (or --dev).'); return 1; }
    const g = await gettone(cartella, { nuovo: comando === 'rotate-token' });
    console.log(ADDRESS_TEXT(indirizzo(salvate, g)));
    if (comando === 'rotate-token') console.log('Restart talos-relay to use the new token.');
    return 0;
  }

  const date = {
    dominio: values.domain, email: values.email, certificato: values.cert, chiave: values.key,
    dev: values.dev === undefined ? undefined : values.dev, porta: values.port,
  };
  if (values.dev === undefined && values.domain !== undefined) date.dev = false;
  const i = await impostazioni(cartella, date);
  const g = await gettone(cartella);
  const { eseguibile, scaricato } = await installa(cartella, { avvisa: (m) => console.log(m) });
  if (scaricato) console.log(`Downloaded and verified iroh-relay ${VERSIONE}.`);
  const config = await scriviConfigurazione(cartella, i, g);
  console.log(ADDRESS_TEXT(indirizzo(i, g)));

  const figlio = spawn(eseguibile, [...(i.dev ? ['--dev'] : []), '--config-path', config], { stdio: 'inherit' });
  const ferma = () => { if (figlio.exitCode === null) figlio.kill('SIGTERM'); };
  process.on('SIGINT', ferma);
  process.on('SIGTERM', ferma);
  return await new Promise((risolvi) => {
    figlio.on('error', (e) => { console.error(`Could not start iroh-relay: ${e.message}`); risolvi(1); });
    figlio.on('exit', (codice, segnale) => risolvi(codice ?? (segnale ? 0 : 1)));
  });
}

principale(process.argv.slice(2)).then(
  (codice) => { process.exitCode = codice; },
  (e) => { console.error(e?.message ?? String(e)); process.exitCode = 1; },
);
