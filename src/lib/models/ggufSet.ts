import { talosParseGgufFileName } from '@/lib/models/huggingFace'
import type { TalosHuggingFaceFile } from '@/lib/models/huggingFace'

/**
 * Turn a repository's files into the things a person actually chooses.
 *
 * A repository is a flat list of files and a large model is several of them:
 * `…-00001-of-00003.gguf` and its siblings are ONE model, and any two of the
 * three are nothing at all. Offering them as separate rows — which is what a
 * file listing does, and what these apps show — invites someone to download a
 * third of a model over mobile data and discover it at load time.
 *
 * So the unit here is the SET: one row per quantisation, the whole size, and
 * an incomplete set refused by name rather than offered and failed later.
 */

export interface TalosGgufSet {
    /** What a person picks: the quantisation, or the file name when there is none. */
    label: string
    quantisation: string | null
    /** In shard order. The first is the one whose header is worth reading. */
    paths: string[]
    /**
     * Each piece's own length, in the same order.
     *
     * The download job needs these and not just the sum: it fetches one file at
     * a time, and asking for `totalBytes` of the first shard is what made it run
     * past the end of that file, take the 416 as "this changed upstream" and
     * delete everything it had downloaded.
     */
    sizes: number[]
    totalBytes: number
    /**
     * Every piece's sha256, in the same order.
     *
     * Null anywhere means that piece cannot be verified — which is a fact about
     * the repository, stated, never a reason to skip checking the others.
     */
    sha256: Array<string | null>
    /** True when the repository is missing pieces this set needs. */
    incomplete: boolean
    /** How many are there, and how many were found — for saying so plainly. */
    expectedShards: number
    foundShards: number
    /** Hugging Face's own malware verdict on any piece, when it has one. */
    security: string | null
}

/**
 * The verdict a set inherits from its pieces: the worst one, not the first.
 *
 * The Hub's own scan says `safe` when it looked and found nothing; anything else
 * is a finding, and silence means it has not looked — which is neither a pass
 * nor a warning. Ordered worst first so a single flagged shard cannot hide
 * behind a clean one.
 */
function worstVerdict(verdicts: ReadonlyArray<string | null>): string | null {
    const flagged = verdicts.filter((verdict): verdict is string =>
        verdict !== null && verdict !== 'safe')
    if (flagged.length > 0) {
        return flagged.find((verdict) => verdict === 'unsafe') ?? flagged[0]!
    }
    return verdicts.some((verdict) => verdict === 'safe') ? 'safe' : null
}

/** `…-00002-of-00003.gguf` and `…-00003-of-00003.gguf` belong to one model. */
function setKeyOf(path: string): string {
    return path.replace(/-\d{5}-of-\d{5}\.gguf$/i, '.gguf')
}

/**
 * Preserve a publisher's variant suffix after the quantisation.
 *
 * `Q4_K_M` and `Q4_K_M-hip-optimized` are different upstream files. Reducing
 * both to the quantisation makes two rows, two sizes and two hashes look like
 * accidental duplicates. Shard coordinates have already been removed by
 * `setKeyOf`, so anything left after the final quantisation marker is stable
 * publisher metadata rather than a part number.
 */
function variantSuffixOf(path: string, quantisation: string): string | null {
    const name = setKeyOf(path).split('/').pop() ?? ''
    const stem = name.replace(/\.gguf$/i, '')
    const marker = `-${quantisation.toLocaleLowerCase('en-US')}`
    const markerIndex = stem.toLocaleLowerCase('en-US').lastIndexOf(marker)
    if (markerIndex < 0) return null
    const suffix = stem.slice(markerIndex + marker.length).replace(/^[-_.]+/, '').trim()
    return suffix === '' ? null : suffix
}

/**
 * ⭐⭐ QUALE MODELLO È — non quale versione.
 *
 * Un repository GGUF tiene lo **stesso** modello a qualità diverse: 18 file per
 * `bartowski/Llama-3.2-3B-Instruct-GGUF`, 26 per `unsloth/Qwen3-4B-GGUF`, 29
 * per `unsloth/gemma-3-4b-it-GGUF`. Leggere l'intestazione di ognuno vuol dire
 * pagare diciassette volte la stessa risposta.
 *
 * MISURATO l'11 agosto su tre qualità dello stesso modello (IQ3_M, Q4_0, Q8_0):
 *
 * | campo                 | IQ3_M   | Q4_0    | Q8_0    |
 * |-----------------------|---------|---------|---------|
 * | blocchi               | 28      | 28      | 28      |
 * | embedding             | 3072    | 3072    | 3072    |
 * | contesto addestrato   | 131072  | 131072  | 131072  |
 * | teste / teste KV      | 24 / 8  | 24 / 8  | 24 / 8  |
 * | numero di tensori     | 255     | 255     | 255     |
 * | **inizio dei pesi**   | 7.837.984 | 7.837.984 | 7.837.984 |
 *
 * Cambia **solo** `general.file_type`, che sta già nel nome del file. E siccome
 * l'inizio dei pesi è identico **byte per byte**, il peso dei pesi di ogni altra
 * versione si ricava dalla sua dimensione senza approssimare niente.
 *
 * ⛔ La chiave è il nome PRIMA della qualità, non il repository: certi
 * pubblicatori mettono più modelli nello stesso posto, e trattarli come uno
 * darebbe la forma del 4B a un 8B. Senza una qualità riconosciuta si torna al
 * percorso intero — un gruppo per conto suo, cioè il vecchio comportamento.
 */
export function talosModelloDiUnSet(set: TalosGgufSet): string {
    const percorso = set.paths[0] ?? ''
    const nome = setKeyOf(percorso)
    if (!set.quantisation) return nome
    const minuscolo = nome.toLocaleLowerCase('en-US')
    const segno = `-${set.quantisation.toLocaleLowerCase('en-US')}`
    const dove = minuscolo.lastIndexOf(segno)
    return dove < 0 ? nome : nome.slice(0, dove)
}

function humanVariantSuffix(suffix: string): string {
    const acronyms: Readonly<Record<string, string>> = {
        cuda: 'CUDA',
        hip: 'HIP',
        metal: 'Metal',
        rocm: 'ROCm',
        vulkan: 'Vulkan',
    }
    return suffix
        .split(/[-_.]+/)
        .filter(Boolean)
        .map((part) => acronyms[part.toLocaleLowerCase('en-US')] ?? part)
        .join(' ')
}

/**
 * Group a repository's GGUF files into the models it actually holds.
 *
 * @param files what `pathsInfo` returned — sizes and hashes, not names alone.
 */
export function talosGroupGgufFiles(files: readonly TalosHuggingFaceFile[]): TalosGgufSet[] {
    const groups = new Map<string, TalosHuggingFaceFile[]>()

    for (const file of files) {
        const parsed = talosParseGgufFileName(file.path.split('/').pop() ?? '')
        if (parsed === null) continue
        const key = setKeyOf(file.path)
        const existing = groups.get(key)
        if (existing) existing.push(file)
        else groups.set(key, [file])
    }

    const sets: TalosGgufSet[] = []
    for (const [key, members] of groups) {
        const ordered = [...members].sort((left, right) => {
            const leftIndex = talosParseGgufFileName(left.path.split('/').pop() ?? '')?.shardIndex ?? 1
            const rightIndex = talosParseGgufFileName(right.path.split('/').pop() ?? '')?.shardIndex ?? 1
            return leftIndex - rightIndex
        })

        const first = ordered[0]!
        const parsed = talosParseGgufFileName(first.path.split('/').pop() ?? '')
        const expectedShards = parsed?.shardCount ?? 1
        const name = key.split('/').pop() ?? key
        const variantSuffix = parsed?.quantisation
            ? variantSuffixOf(key, parsed.quantisation)
            : null

        sets.push({
            label: parsed?.quantisation
                ? `${parsed.quantisation}${variantSuffix ? ` · ${humanVariantSuffix(variantSuffix)}` : ''}`
                : name.replace(/\.gguf$/i, ''),
            quantisation: parsed?.quantisation ?? null,
            paths: ordered.map((file) => file.path),
            sizes: ordered.map((file) => file.sizeBytes),
            // The sum, because that is what the phone has to find room for. The
            // size of one shard is not a smaller model, it is a broken one.
            totalBytes: ordered.reduce((sum, file) => sum + file.sizeBytes, 0),
            sha256: ordered.map((file) => file.sha256),
            incomplete: ordered.length !== expectedShards,
            expectedShards,
            foundShards: ordered.length,
            // The WORST verdict on any piece governs the set: a clean shard
            // beside a flagged one is not a clean model.
            //
            // This took the first non-null verdict instead, which is the exact
            // opposite whenever the first shard is clean — the comment promised
            // one thing and the code did another. Found by an adversarial
            // review, 2026-08-01.
            security: worstVerdict(ordered.map((file) => file.security)),
        })
    }

    // Largest last: quantisations read naturally small-to-large, and the
    // smallest is the one most likely to run on the phone reading the list.
    return sets.sort((left, right) => left.totalBytes - right.totalBytes)
}
