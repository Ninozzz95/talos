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

/** `…-00002-of-00003.gguf` and `…-00003-of-00003.gguf` belong to one model. */
function setKeyOf(path: string): string {
    return path.replace(/-\d{5}-of-\d{5}\.gguf$/i, '.gguf')
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

        sets.push({
            label: parsed?.quantisation ?? name.replace(/\.gguf$/i, ''),
            quantisation: parsed?.quantisation ?? null,
            paths: ordered.map((file) => file.path),
            // The sum, because that is what the phone has to find room for. The
            // size of one shard is not a smaller model, it is a broken one.
            totalBytes: ordered.reduce((sum, file) => sum + file.sizeBytes, 0),
            sha256: ordered.map((file) => file.sha256),
            incomplete: ordered.length !== expectedShards,
            expectedShards,
            foundShards: ordered.length,
            // The worst verdict on any piece governs the set: a clean shard
            // beside a flagged one is not a clean model.
            security: ordered.map((file) => file.security).find((verdict) => verdict !== null) ?? null,
        })
    }

    // Largest last: quantisations read naturally small-to-large, and the
    // smallest is the one most likely to run on the phone reading the list.
    return sets.sort((left, right) => left.totalBytes - right.totalBytes)
}
