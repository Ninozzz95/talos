/*
 * talos-relay — le impostazioni, il gettone e il file di configurazione di iroh-relay (R5.9).
 *
 * Chi passa (owner 18/10/2026, «Gettone nell'indirizzo»): `access.shared_token`. Il gettone si crea al primo avvio, sta in un
 * file privato della cartella dati, e finisce nell'indirizzo che la persona incolla in TALOS (`https://dominio/?token=…`). Il PC
 * lo stacca dall'indirizzo e lo manda nell'header `Authorization`; lo passa al telefono nel QR. Il PC accetta comunque solo i
 * telefoni accoppiati: il gettone decide solo chi usa la banda di questo server.
 *
 * Le chiavi del file sono quelle di `iroh-relay/src/main.rs` al tag v1.3.0 (letto il 18/10/2026): `enable_metrics` (di serie
 * true: qui false, niente porta 9090 su una macchina esposta), `enable_quic_addr_discovery` (aiuta la foratura del NAT, come i
 * relay di n0), `access.shared_token`, e la tabella `[tls]` con `cert_mode` `LetsEncrypt` (vuole `hostname` e `contact`) o
 * `Manual` (`manual_cert_path`, `manual_key_path`). In `--dev` iroh-relay ignora la tabella TLS e parla HTTP in chiaro: solo
 * per provare sulla propria macchina.
 */

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const PORTA_DEV = 3340;

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

export function cartellaDati(env = process.env) {
  return resolve(env.TALOS_RELAY_DIR || join(homedir(), '.talos-relay'));
}

async function scriviPrivato(percorso, testo) {
  await writeFile(percorso, testo, { mode: 0o600 });
  await chmod(percorso, 0o600).catch(() => {});
}

/** Il gettone: lo crea la prima volta, poi è sempre lo stesso finché non si ruota. */
export async function gettone(cartella, { nuovo = false } = {}) {
  const file = join(cartella, 'token');
  if (!nuovo) {
    const letto = await readFile(file, 'utf8').then((s) => s.trim()).catch(() => '');
    if (letto) return letto;
  }
  await mkdir(cartella, { recursive: true });
  const creato = randomBytes(32).toString('base64url');
  await scriviPrivato(file, `${creato}\n`);
  return creato;
}

const NOME_HOST = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

/** Le impostazioni salvate, aggiornate da quelle date sulla riga di comando, e controllate. */
export async function impostazioni(cartella, date = {}) {
  const file = join(cartella, 'settings.json');
  const salvate = await readFile(file, 'utf8').then(JSON.parse).catch(() => ({}));
  const i = { ...salvate };
  for (const k of ['dominio', 'email', 'certificato', 'chiave', 'porta', 'dev']) if (date[k] !== undefined) i[k] = date[k];
  if (date.certificato !== undefined || date.chiave !== undefined) {
    if (!date.certificato || !date.chiave) throw errore('RELAY_ARGS', 'Give both --cert and --key, or neither.');
  }
  if (i.dev) {
    const porta = Number(i.porta ?? PORTA_DEV);
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw errore('RELAY_ARGS', '--port must be a number between 1 and 65535.');
    i.porta = porta;
  } else {
    if (!i.dominio) throw errore('RELAY_ARGS', 'Give the domain name that points to this machine: --domain relay.example.com');
    if (!NOME_HOST.test(i.dominio)) throw errore('RELAY_ARGS', `"${i.dominio}" is not a domain name.`);
    if (!i.certificato && !(typeof i.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(i.email))) {
      throw errore('RELAY_ARGS', "Let's Encrypt needs a contact address: --email you@example.com (or give your own certificate with --cert and --key).");
    }
  }
  await mkdir(cartella, { recursive: true });
  await writeFile(file, `${JSON.stringify(i, null, 2)}\n`);
  return i;
}

const stringa = (s) => JSON.stringify(String(s));

/** Il testo TOML per iroh-relay. */
export function testoConfigurazione(i, { gettone: g, cartella }) {
  const righe = [
    '# Written by talos-relay at every start: edit the settings with talos-relay, not here.',
    'enable_relay = true',
    'enable_metrics = false',
    `enable_quic_addr_discovery = ${i.dev ? 'false' : 'true'}`,
  ];
  if (i.dev) righe.push(`http_bind_addr = ${stringa(`127.0.0.1:${i.porta}`)}`);
  righe.push(`access.shared_token = [${stringa(g)}]`);
  if (!i.dev) {
    righe.push('', '[tls]');
    if (i.certificato) {
      righe.push('cert_mode = "Manual"', `manual_cert_path = ${stringa(resolve(i.certificato))}`, `manual_key_path = ${stringa(resolve(i.chiave))}`);
    } else {
      righe.push('cert_mode = "LetsEncrypt"', `hostname = ${stringa(i.dominio)}`, `contact = ${stringa(i.email)}`, `cert_dir = ${stringa(join(cartella, 'certs'))}`);
    }
  }
  return `${righe.join('\n')}\n`;
}

export async function scriviConfigurazione(cartella, i, g) {
  const file = join(cartella, 'iroh-relay.toml');
  await scriviPrivato(file, testoConfigurazione(i, { gettone: g, cartella }));
  return file;
}

/** L'indirizzo da incollare in TALOS. */
export function indirizzo(i, g) {
  const base = i.dev ? `http://127.0.0.1:${i.porta}/` : `https://${i.dominio}/`;
  return `${base}?token=${encodeURIComponent(g)}`;
}
