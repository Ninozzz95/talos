// La coppia Ed25519 dell'aggiornamento automatico del mobile (owner 22/10/2026: chiave SEPARATA da quella del desktop).
//
//   node scripts/aggiornamento/crea-chiave.mjs <file-della-chiave-privata-FUORI-dal-repo>
//
// Scrive la privata (PEM PKCS#8, permessi 0600) nel file indicato, che non deve esistere, e la pubblica in
// android/app/src/main/assets/aggiornamenti-pubblica.pem. ⛔ La privata non si stampa MAI: va caricata così com'è nel segreto
// TALOS_MOBILE_UPDATE_SIGN_KEY del repository pubblico (`gh secret set TALOS_MOBILE_UPDATE_SIGN_KEY --repo Ninozzz95/talos < file`).
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const qui = dirname(fileURLToPath(import.meta.url))
const radice = resolve(qui, '../..')
export const PUBBLICA = resolve(radice, 'android/app/src/main/assets/aggiornamenti-pubblica.pem')

export function creaChiave(filePrivata, filePubblica = PUBBLICA) {
    const privata = resolve(filePrivata)
    if (!relative(radice, privata).startsWith('..')) throw new Error('la chiave privata va FUORI dal repository')
    if (existsSync(privata)) throw new Error('il file della chiave privata esiste già: non si sovrascrive')
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    writeFileSync(privata, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' })
    writeFileSync(filePubblica, publicKey.export({ type: 'spki', format: 'pem' }))
    return { pubblica: filePubblica }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const destinazione = process.argv[2]
    if (!destinazione) {
        console.error('uso: node scripts/aggiornamento/crea-chiave.mjs <file-della-chiave-privata-fuori-dal-repo>')
        process.exit(2)
    }
    const { pubblica } = creaChiave(destinazione)
    console.log(`chiave privata scritta (non stampata); pubblica in ${relative(radice, pubblica)}`)
}
