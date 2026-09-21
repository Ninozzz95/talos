import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { talosFitVerdict, talosFormatBytes, talosSetWarnings } from '@/lib/models/presentation'
import {
    talosLocalModels,
    talosSearchLocalModels,
    talosOpenModelRepo,
    talosExamineRepo,
    talosDownloadSet,
    talosRefreshDeviceCapacity,
    talosRefreshTransfer,
    talosRefreshLeftovers,
    talosRefreshHuggingFaceToken,
} from '@/stores/localModels'

/**
 * The second door.
 *
 * Every feature in TALOS has two: a place you can go and a tool the model can
 * call, and the outcome lands in both. A feature with one door is designed
 * half-way — someone who asks "can my phone run Qwen3?" in the middle of a
 * conversation should not be told to go and look somewhere else.
 *
 * These call the SAME store the Model Lab section calls, deliberately and not
 * through an injected seam. A download started from chat therefore appears in
 * the section, its progress bar and its notification, because there is only one
 * of everything and no wiring that could be got wrong.
 *
 * What comes back is data, never instructions: codes and numbers, so the model
 * puts the verdict into its own words rather than reading ours aloud.
 */

export interface TalosLocalModelToolContext {
    /** Where the sizes come from. Injected so tests need no formatter. */
    formatBytes?(bytes: number): string
}

const format = talosFormatBytes

/** A repository id, as the Hub writes them. Validated, never interpolated raw. */
const REPO = z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/name')

function describeSet(set: {
    label: string
    paths: readonly string[]
    totalBytes: number
    sha256: readonly (string | null)[]
    incomplete: boolean
    expectedShards: number
    foundShards: number
    security: string | null
}) {
    const warnings = talosSetWarnings(set)
    return {
        id: set.paths[0],
        quantisation: set.label,
        size: format(set.totalBytes),
        sizeBytes: set.totalBytes,
        parts: set.paths.length,
        // Stated rather than omitted: the model needs to know it cannot promise
        // a verified download for this one.
        verifiable: !warnings.unverifiable,
        ...(warnings.incomplete ? { unusable: 'missing-parts', ...warnings.incomplete } : {}),
        ...(warnings.flagged ? { flagged: warnings.flagged } : {}),
    }
}

export function createTalosLocalModelTools(): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'local_models_search',
            title: 'Searching for models that run on this phone',
            description: 'Search Hugging Face for GGUF models that can run locally on this device. '
                + 'Returns repository ids, how widely used they are, and whether a licence must be '
                + 'accepted first. Use before local_model_inspect.',
            // It sends the query to huggingface.co. The default policy refuses
            // outbound, which is the correct default and not an oversight: this
            // tool appears once the user has allowed the model to reach out.
            action: 'outbound',
            input: z.object({
                query: z.string().min(1).max(120).describe('What to look for, e.g. "qwen3 4b"'),
            }),
            async run(input) {
                // The saved token, or the chat door reaches the Hub anonymously
                // while the Model Lab door — the same feature — succeeds. Gated
                // repositories and rate limits then fail in one place and work
                // in the other, which is the worst kind of inconsistency
                // because it looks like the model's fault.
                await talosRefreshHuggingFaceToken()
                await talosSearchLocalModels(input.query)
                const state = talosLocalModels
                if (state.searchFailure) {
                    return {
                        ok: false,
                        code: state.searchFailure,
                        content: `Hugging Face could not be searched: ${state.searchFailure}`,
                    }
                }
                return {
                    ok: true,
                    content: JSON.stringify({
                        models: state.results.map((model) => ({
                            repo: model.id,
                            downloads: model.downloads,
                            // Known here so nothing is offered that cannot be
                            // had; the licence can only be accepted in a browser.
                            gated: model.gated,
                        })),
                    }),
                }
            },
        }),

        defineTalosTool({
            name: 'local_model_inspect',
            title: 'Checking whether a model fits this phone',
            description: 'For one Hugging Face repository, list the model files it holds and say '
                + 'whether each one will run on THIS device, how fast, and why not when it will not. '
                + 'Reads the model header from the network. Always call this before offering to download.',
            action: 'outbound',
            input: z.object({
                repo: REPO.describe('Repository id, e.g. "unsloth/Qwen3-4B-GGUF"'),
                revision: z.string().max(120).optional().describe('Defaults to main'),
            }),
            async run(input) {
                await talosRefreshHuggingFaceToken()
                await talosRefreshDeviceCapacity()
                await talosOpenModelRepo(input.repo, input.revision ?? 'main')
                const state = talosLocalModels
                if (!state.repo || state.repo.sets.length === 0) {
                    return {
                        ok: false,
                        code: state.searchFailure ?? 'no-gguf',
                        content: state.searchFailure
                            ? `That repository could not be read: ${state.searchFailure}`
                            : 'That repository holds no GGUF files a phone can open.',
                    }
                }

                /*
                 * Read the headers, so the answer is about the models rather
                 * than about their file names.
                 *
                 * ⛔ UNA lettura per MODELLO, non per versione: questo ciclo
                 * ne faceva una per ognuna delle 18-29 versioni di un
                 * repository tipico, in fila, e ognuna costa due richieste
                 * perché l'intestazione vera supera i 7 MiB. Misurato: ~153 MB
                 * scaricati uno alla volta prima di poter dire una parola.
                 * Vedi `talosExamineRepo`.
                 */
                await talosExamineRepo()

                const device = state.device
                return {
                    ok: true,
                    content: JSON.stringify({
                        repo: state.repo.id,
                        device: device === null ? null : {
                            model: device.deviceModel,
                            freeMemory: format(device.availableRamBytes),
                            freeStorage: device.freeStorageBytes === null
                                ? null
                                : format(device.freeStorageBytes),
                            // Null means the probe refused; the model must not
                            // report a speed we did not measure.
                            measuredBandwidth: device.memoryBandwidthBytesPerSecond !== null,
                        },
                        context: state.context,
                        models: state.repo.sets.map((set) => {
                            const described = describeSet(set)
                            if (set.examination.state !== 'read') {
                                return {
                                    ...described,
                                    verdict: 'unknown',
                                    reason: set.examination.state === 'unreadable'
                                        ? set.examination.reason
                                        : 'not-read',
                                }
                            }
                            const verdict = talosFitVerdict(set.examination.fit, state.context)
                            return {
                                ...described,
                                // Codes, not sentences: the model explains this
                                // in the user's language, which is the point of
                                // it being a tool rather than a screen.
                                verdict: set.examination.fit.band,
                                reason: set.examination.fit.reason,
                                tokensPerSecond: verdict.tokensPerSecond,
                                ...(verdict.counterOfferContext
                                    ? { fitsAtContext: verdict.counterOfferContext }
                                    : {}),
                                trainedContext: set.examination.trainedContext,
                            }
                        }),
                    }),
                }
            },
        }),

        defineTalosTool({
            name: 'local_model_download',
            title: 'Downloading a model to this phone',
            description: 'Start downloading one model file set onto this device. Call '
                + 'local_model_inspect first and tell the user what it will cost them in space and '
                + 'data before asking. The app runs up to two downloads at once and keeps later '
                + 'requests in a durable queue.',
            action: 'write',
            requiredActions: ['write', 'outbound'],
            /**
             * Asked EVERY time, and no saved grant can stand in for it.
             *
             * Owner's rule, and it is the right one: this spends gigabytes of
             * someone's storage and possibly of their mobile data allowance. A
             * permission granted once for a 400 MB model must not silently
             * authorise a 14 GB one an hour later.
             */
            confirmation: 'always',
            input: z.object({
                repo: REPO,
                revision: z.string().max(120).optional(),
                file: z.string().min(1).max(400).describe('The id from local_model_inspect'),
            }),
            async run(input) {
                const state = talosLocalModels
                const revision = input.revision ?? 'main'
                const existingTransferIds = new Set(
                    state.transfer.items.map((transfer) => transfer.id),
                )
                // Open it if the model jumped straight here, so a download can
                // never be started against a set nobody has looked at — and
                // re-open when the REVISION differs, not only the repository.
                // Ignoring it meant the revision the human approved in the
                // consent sheet was not the revision that downloaded.
                if (state.repo?.id !== input.repo || state.repo?.revision !== revision) {
                    await talosOpenModelRepo(input.repo, revision)
                }
                const set = state.repo?.sets.find((candidate) => candidate.paths[0] === input.file)
                if (!set) {
                    return { ok: false, code: 'no-such-file', content: 'That repository has no such model file.' }
                }

                // By key, so the store hands the WHOLE set to the job — the tool
                // never passes a single path, which is what made a split model
                // download one shard and then delete it.
                const result = await talosDownloadSet(input.file)
                if (!result.ok) {
                    return {
                        ok: false,
                        code: result.reason,
                        content: `The download did not start: ${result.reason}`,
                    }
                }
                const startedTransfer = state.transfer.items.find(
                    (transfer) => !existingTransferIds.has(transfer.id),
                ) ?? state.transfer.items.find((transfer) => (
                    transfer.repo === input.repo
                    && transfer.revision === revision
                    && transfer.paths.includes(input.file)
                ))
                return {
                    ok: true,
                    content: JSON.stringify({
                        started: true,
                        size: format(set.totalBytes),
                        verifiable: !talosSetWarnings(set).unverifiable,
                        // The caveat that costs money if it goes unsaid.
                        tiedToCurrentNetwork:
                            startedTransfer?.networkBound ?? state.transfer.networkBound,
                    }),
                }
            },
        }),

        defineTalosTool({
            name: 'local_models_status',
            title: 'Checking on a model download',
            description: 'Report what is downloading onto this device right now and how far it has '
                + 'got. Reads local state only; no network.',
            action: 'read',
            input: z.object({}),
            async run() {
                await talosRefreshTransfer()
                // Actually LOADED, not read out of a store nothing in the chat
                // path ever populates: this answered "nothing is wasting space"
                // while gigabytes sat reserved, because only the Model Lab
                // screen had ever asked.
                await talosRefreshLeftovers()
                const { transfer, leftovers } = talosLocalModels
                const downloads = transfer.items.map((item) => ({
                    id: item.id,
                    model: item.modelName,
                    phase: item.phase,
                    active: item.active,
                    done: format(item.haveBytes),
                    total: format(item.totalBytes),
                    percent: item.totalBytes > 0
                        ? Math.round((item.haveBytes / item.totalBytes) * 100)
                        : 0,
                    tiedToCurrentNetwork: item.networkBound,
                    failure: item.failure,
                }))
                const firstActive = downloads.find((item) => item.active)
                return {
                    ok: true,
                    content: JSON.stringify({
                        downloading: firstActive
                            ? {
                                model: firstActive.model,
                                done: firstActive.done,
                                total: firstActive.total,
                                percent: firstActive.percent,
                            }
                            : null,
                        downloads,
                        maximumActive: 2,
                        // Space held by attempts nobody is watching. Worth
                        // surfacing here too: the user may only ever ask.
                        abandonedDownloads: leftovers.totalBytes > 0
                            ? { holding: format(leftovers.totalBytes) }
                            : null,
                    }),
                }
            },
        }),
    ] as TalosToolDefinition<never>[]
}
