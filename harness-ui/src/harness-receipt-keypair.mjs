/**
 * harness-receipt-keypair.mjs — la chiave Ed25519 che firma le ricevute del
 * kernel (`talosHarness.mjs`, `creaRicevutaOperazione`/`firma`).
 *
 * ⭐⭐⭐ 29/8, FASE D — il pezzo dichiarato aperto fin dal primo incremento
 * della firma: "decidere dove vivono le chiavi e chi verifica: una
 * decisione separata, non presa qui". Presa qui, ora.
 *
 * ⛔ Stesso disegno di `control-plane/scripts/browser-action-keypair.mjs`
 * (AVM, letto prima di scrivere questo file — REGOLA ZERO, cercato nel
 * proprio codebase prima di inventare un pattern nuovo): provisioning
 * persistito su un file `.env`, PEM codificato in base64, tre variabili
 * (privata/pubblica/id). NON lo stesso algoritmo — quello è EC P-256 per
 * un token JWT con scadenza; questo è Ed25519 per una ricevuta d'audit
 * permanente, lo stesso RFC 8032 già usato da `generaChiaviFirmaRicevute()`
 * nel kernel — e NON lo stesso file: due concetti diversi (una capability
 * che autorizza un'azione PRIMA che avvenga, contro una ricevuta che
 * attesta un'azione GIÀ avvenuta) restano due file, come `TalosDisco`/
 * `discoNode.ts`/`discoCapacitor.ts` restano tre file per lo stesso
 * concetto su runtime diversi — non una libreria condivisa forzata.
 *
 * ⛔ Perché una chiave PERSISTITA e non una generata a ogni avvio (come fa
 * `control-plane/scripts/dev-stack.mjs` per il suo token JWT effimero):
 * una ricevuta d'audit deve restare verificabile MOLTO dopo che il
 * processo che l'ha firmata è morto — un riavvio del server non deve
 * invalidare ogni firma emessa prima. Il token JWT del dev-stack vive
 * solo per la durata di una sessione locale fra due processi che
 * ripartono insieme; questa chiave no.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIVATE_KEY_ENV = 'TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64';
const PUBLIC_KEY_ENV = 'TALOS_HARNESS_RECEIPT_PUBLIC_KEY_B64';
const KEY_ID_ENV = 'TALOS_HARNESS_RECEIPT_KEY_ID';
const RECEIPT_KEY_ENV_NAMES = [PRIVATE_KEY_ENV, PUBLIC_KEY_ENV, KEY_ID_ENV];
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function generateHarnessReceiptKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  });
  const keypair = {
    keyId: `talos-harness-receipt-${randomUUID()}`,
    privateKeyBase64: Buffer.from(privateKey, 'utf8').toString('base64'),
    publicKeyBase64: Buffer.from(publicKey, 'utf8').toString('base64'),
  };

  assertValidHarnessReceiptKeypair(keypair);

  return keypair;
}

export async function ensureHarnessReceiptKeypairEnvFile(envFile) {
  const absolutePath = path.resolve(envFile);
  const contents = await readFile(absolutePath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
  const parsed = parseEnv(contents);
  const configured = {
    keyId: parsed.get(KEY_ID_ENV)?.trim() ?? '',
    privateKeyBase64: parsed.get(PRIVATE_KEY_ENV)?.trim() ?? '',
    publicKeyBase64: parsed.get(PUBLIC_KEY_ENV)?.trim() ?? '',
  };
  const presentCount = Object.values(configured).filter((value) => value !== '').length;

  if (presentCount > 0 && presentCount < 3) {
    throw new Error('Refusing partial TALOS harness receipt keypair configuration.');
  }
  if (presentCount === 3) {
    assertValidHarnessReceiptKeypair(configured);
    await chmod(absolutePath, 0o600).catch((error) => {
      if (process.platform !== 'win32') throw error;
    });

    return { created: false, keypair: configured };
  }

  const keypair = generateHarnessReceiptKeypair();
  const updated = setEnvValues(contents, new Map([
    [PRIVATE_KEY_ENV, keypair.privateKeyBase64],
    [PUBLIC_KEY_ENV, keypair.publicKeyBase64],
    [KEY_ID_ENV, keypair.keyId],
  ]));
  const temporaryPath = `${absolutePath}.tmp-${process.pid}-${randomUUID()}`;

  try {
    await writeFile(temporaryPath, updated, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, absolutePath);
    await chmod(absolutePath, 0o600).catch((error) => {
      if (process.platform !== 'win32') throw error;
    });
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }

  return { created: true, keypair };
}

function assertValidHarnessReceiptKeypair(keypair) {
  if (!KEY_ID_PATTERN.test(keypair.keyId)) throw configurationError();

  const privatePem = decodeCanonicalBase64(keypair.privateKeyBase64);
  const publicPem = decodeCanonicalBase64(keypair.publicKeyBase64);
  if (!privatePem.startsWith('-----BEGIN PRIVATE KEY-----\n')
    || !privatePem.trimEnd().endsWith('-----END PRIVATE KEY-----')
    || !publicPem.startsWith('-----BEGIN PUBLIC KEY-----\n')
    || !publicPem.trimEnd().endsWith('-----END PUBLIC KEY-----')) {
    throw configurationError();
  }

  try {
    const privateKey = createPrivateKey(privatePem);
    const publicKey = createPublicKey(publicPem);
    if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519') {
      throw configurationError();
    }

    const expectedPublic = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
    const suppliedPublic = publicKey.export({ format: 'der', type: 'spki' });
    if (expectedPublic.length !== suppliedPublic.length
      || !timingSafeEqual(expectedPublic, suppliedPublic)) {
      throw configurationError();
    }
  } catch {
    throw configurationError();
  }
}

function decodeCanonicalBase64(value) {
  if (typeof value !== 'string'
    || value === ''
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw configurationError();
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw configurationError();

  return decoded.toString('utf8');
}

function parseEnv(contents) {
  const values = new Map();
  const occurrences = new Map();
  for (const line of contents.split(/\r?\n/u)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match) continue;
    const [, name, value] = match;
    occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
    values.set(name, value);
  }
  for (const name of RECEIPT_KEY_ENV_NAMES) {
    if ((occurrences.get(name) ?? 0) > 1) {
      throw new Error(`Refusing duplicate ${name} entries in the environment file.`);
    }
  }

  return values;
}

function setEnvValues(contents, values) {
  const eol = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents === '' ? [] : contents.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();

  for (const [name, value] of values) {
    const index = lines.findIndex((line) => line.startsWith(`${name}=`));
    const replacement = `${name}=${value}`;
    if (index >= 0) lines[index] = replacement;
    else lines.push(replacement);
  }

  return `${lines.join(eol)}${eol}`;
}

function configurationError() {
  return new Error('TALOS harness receipt keypair must be a matching Ed25519 PKCS8/SPKI pair with a valid key id.');
}

async function runCli() {
  const [, , flag, target, ...rest] = process.argv;
  if (flag !== '--env-file' || typeof target !== 'string' || target.trim() === '' || rest.length > 0) {
    throw new Error('Usage: node src/harness-receipt-keypair.mjs --env-file <path>');
  }

  const result = await ensureHarnessReceiptKeypairEnvFile(target);
  process.stdout.write(`Harness receipt keypair is ready (${result.created ? 'created' : 'existing'}).\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Harness receipt keypair provisioning failed.'}\n`);
    process.exitCode = 1;
  });
}
