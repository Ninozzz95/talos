/*
 * ⭐ 01/10/2026 — LA FIRMA DEL MANIFESTO DEGLI AGGIORNAMENTI, in un posto solo: la CI firma, l'app verifica.
 *
 * Owner, 01/10/2026: «un controllo automatico se ci sono aggiornamenti, aggiornare l'app … come fa Codex, Hermes e Claude …
 * estremamente seamless, automatizzato e user friendly»; sulla sicurezza: «Firma Ed25519 fatta da noi».
 * ⛔ Perché nostra: electron-updater 6.8.9 verifica lo sha512 del file contro `latest.yml`, ma `latest.yml` stesso è protetto
 *   solo da HTTPS e da chi può scrivere la release; e con un installer non firmato salta anche la verifica Authenticode
 *   (`out/NsisUpdater.js:84-100`: senza `publisherName` ritorna `null`). La firma dei manifesti di electron-builder esiste
 *   solo nella 27, che è una alpha (npm, 01/10/2026: `next` = 27.0.0-alpha.9). Stesso disegno, fatto qui: Ed25519 sul
 *   manifesto, chiave pubblica dentro l'app, verifica PRIMA di scaricare (docs electron-builder «Signed Update Manifests»).
 * ⇒ Node `crypto.sign(null, dati, chiave)` / `crypto.verify(null, dati, chiave, firma)`: per Ed25519 l'algoritmo è `null`
 *   (documentazione Node v24, crypto.sign / crypto.verify, letta il 01/10/2026).
 * ⛔ La verifica NON lancia mai: chiave rotta, firma non base64, tipo di chiave sbagliato ⇒ `false`. Chi la chiama non deve
 *   poter scambiare un'eccezione per un «sì».
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export const NOME_MANIFESTO = 'latest.yml';
export const NOME_FIRMA = 'latest.yml.sig';

/** Lo sha512 in base64, la forma che electron-builder scrive in `latest.yml`. */
export function sha512Base64(dati) {
  return createHash('sha512').update(dati).digest('base64');
}

/**
 * Legge SOLO i campi di primo livello che servono (`version`, `path`, `sha512`, `size` del primo file) da un `latest.yml` di
 * electron-builder. Rigoroso: un campo mancante, doppio o malformato ⇒ eccezione. Il resto lo legge electron-updater; a noi
 * serve sapere di quale file e di quale impronta parla il manifesto che abbiamo VERIFICATO.
 */
export function leggiManifesto(testo) {
  const righe = String(testo).split(/\r?\n/u);
  const campi = new Map();
  for (const riga of righe) {
    const m = /^([a-zA-Z0-9]+):[ \t]*(.*)$/u.exec(riga);
    if (!m) continue;
    if (campi.has(m[1])) throw Error(`Manifesto non valido: il campo «${m[1]}» compare due volte.`);
    campi.set(m[1], m[2].trim().replace(/^'(.*)'$/u, '$1').replace(/^"(.*)"$/u, '$1'));
  }
  const version = campi.get('version');
  const path = campi.get('path');
  const sha512 = campi.get('sha512');
  if (!version || !/^\d+\.\d+\.\d+$/u.test(version)) throw Error('Manifesto non valido: versione assente o non x.y.z.');
  if (!path || /[\\/]|\.\./u.test(path)) throw Error('Manifesto non valido: «path» assente o non è un nome di file semplice.');
  if (!sha512 || !/^[A-Za-z0-9+/]{86}==$/u.test(sha512)) throw Error('Manifesto non valido: «sha512» assente o non è uno sha512 in base64.');
  /* ⛔ Il primo file. `size` è FACOLTATIVO: il `latest.yml` vero di electron-builder 26 con `differentialPackage: false` porta
     solo `url` e `sha512` (misurato il 01/10/2026 su una build locale: 322 byte, nessun `size`). Se c'è, deve essere un numero. */
  const primo = /^files:[ \t]*\n[ \t]+- url: *['"]?([^'"\r\n]+)['"]?[ \t]*\n((?:[ \t]+[a-zA-Z0-9]+:.*\n?)*)/mu.exec(righe.join('\n'));
  if (!primo) throw Error('Manifesto non valido: manca il primo file con «url».');
  if (primo[1] !== path) throw Error('Manifesto non valido: il primo file non è quello di «path».');
  const misura = /^[ \t]+size: *(.*)$/mu.exec(primo[2]);
  if (misura && !/^\d+$/u.test(misura[1].trim())) throw Error('Manifesto non valido: «size» non è un numero.');
  const shaFile = /^[ \t]+sha512: *(.*)$/mu.exec(primo[2]);
  if (!shaFile || shaFile[1].trim() !== sha512) throw Error('Manifesto non valido: lo sha512 del primo file non è quello di primo livello.');
  return { version, path, sha512, size: misura ? Number(misura[1].trim()) : null };
}

/** Firma i byte esatti del manifesto con la chiave privata Ed25519 (PEM PKCS#8). Torna la firma in base64. */
export function firmaManifesto(dati, chiavePrivataPem) {
  const chiave = createPrivateKey(chiavePrivataPem);
  if (chiave.asymmetricKeyType !== 'ed25519') throw Error('La chiave che firma gli aggiornamenti deve essere Ed25519.');
  return sign(null, Buffer.from(dati), chiave).toString('base64');
}

/** Vero solo se `firmaBase64` è una firma Ed25519 valida dei byte ESATTI del manifesto. Mai un'eccezione. */
export function verificaFirmaManifesto(dati, firmaBase64, chiavePubblicaPem) {
  try {
    const testo = String(firmaBase64 ?? '').trim();
    if (!/^[A-Za-z0-9+/]{86}==$/u.test(testo)) return false;
    const chiave = createPublicKey(chiavePubblicaPem);
    if (chiave.asymmetricKeyType !== 'ed25519') return false;
    return verify(null, Buffer.from(dati), chiave, Buffer.from(testo, 'base64'));
  } catch {
    return false;
  }
}

/** La chiave pubblica che corrisponde a una privata: serve alla CI per controllare che firmi con la chiave che l'app conosce. */
export function chiavePubblicaDa(chiavePrivataPem) {
  return createPublicKey(createPrivateKey(chiavePrivataPem)).export({ type: 'spki', format: 'pem' }).toString();
}
