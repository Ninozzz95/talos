/**
 * N12 — il modello del riconoscimento vocale locale: **Parakeet TDT 0.6B v3 int8**, nel formato di sherpa-onnx.
 *
 * Decisioni dell'owner del 12/10/2026: questo motore, scaricato al primo uso (~670 MB), in ibrido col riconoscitore di oggi.
 *
 * ⛔ I fatti qui sotto sono FISSATI ALLA FONTE, misurati il 13/10/2026 dall'API di Hugging Face
 * (`/api/models/<deposito>/tree/main`, impronte = `lfs.oid`; `tokens.txt` scaricato e misurato): revisione, nomi, grandezze e
 * sha256. Gli indirizzi puntano alla revisione, mai a `main`: un file cambiato alla fonte non entra da solo. Un file con
 * un'impronta diversa non è il modello e non si usa, nemmeno col nome e la grandezza giusti.
 *
 * Licenza del modello: CC-BY-4.0 (NVIDIA). Va nelle Note legali insieme a sherpa-onnx (Apache-2.0) e onnxruntime (MIT).
 */
export interface TalosFileDelModelloVocale {
    nome: string
    byte: number
    sha256: string
    indirizzo: string
}

const DEPOSITO = 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'
const REVISIONE = '2bda32ec70b097a55adaa07d9a7173915b43cc78'
const file = (nome: string, byte: number, sha256: string): TalosFileDelModelloVocale => Object.freeze({
    nome, byte, sha256, indirizzo: `https://huggingface.co/${DEPOSITO}/resolve/${REVISIONE}/${nome}`,
})

const FILE: readonly TalosFileDelModelloVocale[] = Object.freeze([
    file('encoder.int8.onnx', 652_184_281, 'acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247'),
    file('decoder.int8.onnx', 11_845_275, '179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e'),
    file('joiner.int8.onnx', 6_355_277, '3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3'),
    file('tokens.txt', 93_939, 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d'),
])

export const TALOS_MODELLO_PARAKEET = Object.freeze({
    id: 'parakeet-tdt-0.6b-v3-int8',
    nome: 'Parakeet TDT 0.6B v3',
    deposito: DEPOSITO,
    revisione: REVISIONE,
    licenza: 'CC-BY-4.0',
    file: FILE,
    byteTotali: FILE.reduce((somma, f) => somma + f.byte, 0),
})

/** Ciò che si è misurato di un file sul telefono. */
export interface TalosFileMisurato { byte: number, sha256: string | null }

export function fileDelModelloVerificato(atteso: TalosFileDelModelloVocale, misurato: TalosFileMisurato | null | undefined): boolean {
    return !!misurato && misurato.byte === atteso.byte
        && typeof misurato.sha256 === 'string' && misurato.sha256.toLowerCase() === atteso.sha256
}

/** Il modello si usa solo se TUTTI i suoi file sono sul telefono e verificati. */
export function modelloParakeetCompleto(misurati: Readonly<Record<string, TalosFileMisurato | undefined>>): boolean {
    return TALOS_MODELLO_PARAKEET.file.every((f) => fileDelModelloVerificato(f, misurati[f.nome]))
}
