import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { talosFitVerdict, talosFormatBytes, talosSetWarnings } from '@/lib/models/presentation'
import {
    talosLocalModels,
    talosSearchLocalModels,
    talosOpenModelRepo,
    talosExamineSet,
    talosDownloadSet,
    talosRefreshDeviceCapacity,
    talosRefreshTransfer,
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

                // Read every header, so the answer is about the models rather
                // than about their file names.
                for (const set of state.repo.sets) {
                    if (!set.incomplete) await talosExamineSet(set.paths[0]!)
                }

                const device = state.device
                return {
                    ok: true,
                    content: JSON.stringify({
                        repo: state.repo.id,
                        device: device === null ? null : {
                            model: device.deviceModel,
                            freeMemory: format(device.availableRamBytes),
                            freeStorage: format(device.freeStorageBytes),
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
                + 'data before asking. Only one download runs at a time.',
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
                // Open it if the model jumped straight here, so a download can
                // never be started against a set nobody has looked at.
                if (state.repo?.id !== input.repo) {
                    await talosOpenModelRepo(input.repo, input.revision ?? 'main')
                }
                const set = state.repo?.sets.find((candidate) => candidate.paths[0] === input.file)
                if (!set) {
                    return { ok: false, code: 'no-such-file', content: 'That repository has no such model file.' }
                }

                const result = await talosDownloadSet(input.file)
                if (!result.ok) {
                    return {
                        ok: false,
                        code: result.reason,
                        content: `The download did not start: ${result.reason}`,
                    }
                }
                return {
                    ok: true,
                    content: JSON.stringify({
                        started: true,
                        size: format(set.totalBytes),
                        verifiable: !talosSetWarnings(set).unverifiable,
                        // The caveat that costs money if it goes unsaid.
                        tiedToCurrentNetwork: state.transfer.networkBound,
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
                const { transfer, leftovers } = talosLocalModels
                return {
                    ok: true,
                    content: JSON.stringify({
                        downloading: transfer.active
                            ? {
                                model: transfer.modelName,
                                done: format(transfer.haveBytes),
                                total: format(transfer.totalBytes),
                                percent: transfer.totalBytes > 0
                                    ? Math.round((transfer.haveBytes / transfer.totalBytes) * 100)
                                    : 0,
                            }
                            : null,
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
