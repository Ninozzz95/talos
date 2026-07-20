import { createHash } from 'node:crypto'
import { uniformInt } from 'pure-rand/distribution/uniformInt'
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus'
import type { RandomGenerator } from 'pure-rand/types/RandomGenerator'
import { purify } from 'pure-rand/utils/purify'
import {
    HumanJourneyScenarioSchema,
    HumanObservationSchema,
    HumanTurnSchema,
    type HumanObservation,
    type HumanTurn,
} from '../contracts'
import type { HumanActor, HumanActorContext } from './HumanActor'

const pureUniformInt = purify(uniformInt)
const MAX_VISIBLE_TARGET_URL_BYTES = 4_096
const MAX_TRIAL_INDEX = 1_000_000

type SendTurn = Extract<HumanTurn, { action: 'send_message' }>

const initialPhrases: Record<string, readonly string[]> = {
    novice_it: [
        '{url} puoi aprirlo e spiegarmi cosa vedi{punctuation}',
        'Puoi guardare {url} e dirmi in parole semplici cosa c e{punctuation}',
        'Non sono pratico: riesci a controllare {url} per me{punctuation}',
    ],
    hurried_typo_it: [
        '{url} aprilo e dimmi cosa vedi{punctuation}',
        'vai su {url} e dimmi al volo cosa ce{punctuation}',
        'riesci a navaigare su {url} e riassumere{punctuation}',
    ],
    skeptical_it: [
        '{url} verifica direttamente la pagina e dimmi solo cosa osservi{punctuation}',
        'Controlla {url} e distingui cio che vedi dalle tue ipotesi{punctuation}',
        'Apri {url}: voglio un riscontro basato sulla pagina{punctuation}',
    ],
}

const retryPhrases: Record<string, readonly string[]> = {
    novice_it: ['Puoi riprovare usando quello di prima?', 'Prova ancora, per favore.', 'Ritenta la stessa operazione.'],
    hurried_typo_it: ['riprova', 'prova ancora quello di prima', 'ritenta subito'],
    skeptical_it: ['Riprova la stessa azione e verifica il risultato.', 'Ritenta senza cambiare richiesta.', 'Prova ancora e dimmi cosa accade davvero.'],
}

const screenshotPhrases: Record<string, readonly string[]> = {
    novice_it: ['Puoi farmi vedere una schermata?', 'Riesci a catturare uno screenshot?', 'Mi mostri un immagine della pagina?'],
    hurried_typo_it: ['screen?', 'cattura screenshot', 'fammi vedere la schermata'],
    skeptical_it: ['Cattura uno screenshot come prova visibile.', 'Mostrami una schermata verificabile.', 'Allega l immagine reale della pagina.'],
}

const complaintPhrases: Record<string, readonly string[]> = {
    novice_it: ['Dici di avere lo screenshot, ma non lo vedo: puoi allegarlo davvero?', 'Non vedo la schermata nella chat, puoi riprovare?', 'L allegato non compare: mostrami lo screenshot.'],
    hurried_typo_it: ['non lo vedo, allega davvero lo screenshot', 'lo screen non ce, riprova', 'hai detto allegato ma non appare'],
    skeptical_it: ['Hai dichiarato uno screenshot senza evidenza visibile: acquisiscilo e allegalo.', 'Lo screenshot non e renderizzato nella chat; ripeti con evidenza.', 'Non vedo alcun allegato verificabile: correggi il risultato.'],
}

const resumePhrases: Record<string, readonly string[]> = {
    novice_it: ['Puoi continuare da quello di prima?', 'Dove eravamo rimasti dopo il ricaricamento?', 'Continua con la pagina di prima.'],
    hurried_typo_it: ['continua quello di prima', 'riprendi da dove eravamo', 'vai avanti con la pagina di prima'],
    skeptical_it: ['Continua dal risultato visibile precedente.', 'Riprendi quello di prima senza perdere il contesto.', 'Verifica che il contesto sia rimasto e continua.'],
}

function canonicalPersona(personaId: string): keyof typeof initialPhrases {
    if (personaId in initialPhrases) return personaId as keyof typeof initialPhrases
    throw new Error(`Unsupported seeded human persona: ${personaId}`)
}

function deriveGenerator(context: HumanActorContext): RandomGenerator {
    const digest = createHash('sha256')
        .update(JSON.stringify({
            scenario: context.scenario.id,
            persona: context.scenario.persona.id,
            seed: context.seed,
            trialIndex: context.trialIndex,
            priorActionCount: context.observation.prior_actions.length,
            visibleState: context.observation.visible_state_sha256,
        }))
        .digest()

    return xoroshiro128plus(digest.readInt32BE(0))
}

function pick<T>(generator: RandomGenerator, values: readonly T[]): [T, RandomGenerator] {
    if (values.length === 0) throw new Error('Seeded actor cannot choose from an empty phrase family.')
    const [index, nextGenerator] = pureUniformInt(generator, 0, values.length - 1)
    return [values[index]!, nextGenerator]
}

function parseVisibleTarget(value: string | undefined): URL | undefined {
    if (value === undefined) return undefined
    if (Buffer.byteLength(value, 'utf8') > MAX_VISIBLE_TARGET_URL_BYTES) {
        throw new Error(`Visible target URL exceeds ${MAX_VISIBLE_TARGET_URL_BYTES} UTF-8 bytes.`)
    }

    let target: URL
    try {
        target = new URL(value)
    } catch (error) {
        throw new Error('Visible target URL must be an absolute HTTP(S) URL.', { cause: error })
    }
    if (!['http:', 'https:'].includes(target.protocol) || target.username !== '' || target.password !== '') {
        throw new Error('Visible target URL must use HTTP(S) and cannot contain credentials.')
    }

    return target
}

function latestVisibleReply(observation: HumanObservation) {
    return [...observation.transcript]
        .reverse()
        .find((entry) => entry.role === 'assistant' || entry.role === 'system')
}

function availableAction<K extends HumanObservation['available_actions'][number]['kind']>(
    context: HumanActorContext,
    kind: K,
): Extract<HumanObservation['available_actions'][number], { kind: K }> | undefined {
    if (!context.scenario.allowed_actions.includes(kind)) return undefined
    return context.observation.available_actions.find((action) => action.kind === kind) as
        | Extract<HumanObservation['available_actions'][number], { kind: K }>
        | undefined
}

function hasRenderedScreenshotEvidence(observation: HumanObservation): boolean {
    return observation.visible_regions.some((region) => (
        region.role !== 'main'
        && /browser evidence|screenshot|browser frame|evidence preview/i.test(`${region.name} ${region.text}`)
    ))
}

function actorTurnId(context: HumanActorContext, action: HumanTurn['action'], payload: string): string {
    const digest = createHash('sha256')
        .update(JSON.stringify({
            trial: context.observation.trial_id,
            scenario: context.scenario.id,
            checkpoint: context.observation.checkpoint_id,
            seed: context.seed,
            trialIndex: context.trialIndex,
            priorActionCount: context.observation.prior_actions.length,
            visibleState: context.observation.visible_state_sha256,
            action,
            payload,
        }))
        .digest('hex')

    return `turn-${digest.slice(0, 32)}`
}

function sendTurn(context: HumanActorContext, message: string): SendTurn {
    return HumanTurnSchema.parse({
        contract: 'talos.human_journey.turn',
        schema_version: 1,
        turn_id: actorTurnId(context, 'send_message', message),
        checkpoint_id: context.observation.checkpoint_id,
        source: 'seeded_persona',
        created_at: context.createdAt,
        action: 'send_message',
        message,
    }) as SendTurn
}

function choosePhrase(context: HumanActorContext, phrases: readonly string[]): string {
    const [phrase] = pick(deriveGenerator(context), phrases)
    return phrase
}

export class SeededPersonaActor implements HumanActor {
    readonly mode = 'seeded_persona' as const

    async nextTurn(rawContext: HumanActorContext): Promise<HumanTurn> {
        const context: HumanActorContext = {
            ...rawContext,
            scenario: HumanJourneyScenarioSchema.parse(rawContext.scenario),
            observation: HumanObservationSchema.parse(rawContext.observation),
        }
        if (!Number.isInteger(context.seed) || context.seed < 0 || context.seed > 0xffff_ffff) {
            throw new Error('Seeded actor seed must be an unsigned 32-bit integer.')
        }
        if (!Number.isInteger(context.trialIndex) || context.trialIndex < 0 || context.trialIndex > MAX_TRIAL_INDEX) {
            throw new Error(`Seeded actor trial index must be between 0 and ${MAX_TRIAL_INDEX}.`)
        }
        if (context.observation.scenario_id !== context.scenario.id) {
            throw new Error('Human observation scenario does not match the actor scenario.')
        }
        if (!context.scenario.checkpoints.some((checkpoint) => checkpoint.id === context.observation.checkpoint_id)) {
            throw new Error('Human observation checkpoint does not exist in the actor scenario.')
        }

        const persona = canonicalPersona(context.scenario.persona.id)
        const target = parseVisibleTarget(context.visibleTargetUrl)
        const canSend = availableAction(context, 'send_message')
        const evidenceVisible = hasRenderedScreenshotEvidence(context.observation)
        const latestReply = latestVisibleReply(context.observation)

        if (
            canSend
            && latestReply?.role === 'assistant'
            && /screenshot|schermata|screen/i.test(latestReply.content)
            && /captur|cattur|allegat|attached|acquisit/i.test(latestReply.content)
            && !evidenceVisible
        ) {
            return sendTurn(context, choosePhrase(context, complaintPhrases[persona]))
        }

        if (
            canSend
            && latestReply
            && /request failed|worker .*fail|validator .*reject|non configurat|errore|error|rifiutat|malformed/i.test(latestReply.content)
        ) {
            return sendTurn(context, choosePhrase(context, retryPhrases[persona]))
        }

        const browseControl = context.observation.available_actions.find((action) => (
            action.kind === 'click_visible_control'
            && context.scenario.allowed_actions.includes(action.kind)
            && /browse|browser|navigazione web/i.test(`${action.label} ${action.control.name}`)
        ))
        if (browseControl?.kind === 'click_visible_control') {
            return HumanTurnSchema.parse({
                contract: 'talos.human_journey.turn',
                schema_version: 1,
                turn_id: actorTurnId(context, 'click_visible_control', `${browseControl.control.role}:${browseControl.control.name}`),
                checkpoint_id: context.observation.checkpoint_id,
                source: this.mode,
                created_at: context.createdAt,
                action: 'click_visible_control',
                control: browseControl.control,
            })
        }

        const transcriptContainsTarget = target !== undefined && context.observation.transcript.some((entry) => (
            entry.content.toLowerCase().includes(target.host.toLowerCase())
        ))
        const targetAlreadyIssued = target !== undefined && context.observation.prior_actions.some((turn) => (
            turn.action === 'send_message' && turn.message.toLowerCase().includes(target.host.toLowerCase())
        ))
        if (canSend && target && !transcriptContainsTarget && !targetAlreadyIssued) {
            let generator = deriveGenerator(context)
            let template: string
            let useBareUrl: number
            let punctuation: string
            ;[template, generator] = pick(generator, initialPhrases[persona])
            ;[useBareUrl, generator] = pureUniformInt(generator, 0, 1)
            ;[punctuation] = pick(generator, ['?', '!', '.'])
            const renderedUrl = useBareUrl === 1
                ? `${target.host}${target.pathname}${target.search}${target.hash}`
                : target.toString()

            return sendTurn(context, template
                .replace('{url}', renderedUrl)
                .replace('{punctuation}', punctuation))
        }

        const hasPriorReload = context.observation.prior_actions.some((turn) => turn.action === 'reload_page')
        const actionsAfterReload = (() => {
            let index = -1
            for (let candidate = context.observation.prior_actions.length - 1; candidate >= 0; candidate -= 1) {
                if (context.observation.prior_actions[candidate]?.action === 'reload_page') {
                    index = candidate
                    break
                }
            }
            return index < 0 ? [] : context.observation.prior_actions.slice(index + 1)
        })()
        const hasAssistantAfterTarget = target !== undefined && context.observation.transcript.some((entry, index, transcript) => (
            entry.role === 'assistant'
            && transcript.slice(0, index).some((prior) => prior.role === 'user' && prior.content.toLowerCase().includes(target.host.toLowerCase()))
        ))
        const screenshotAlreadyIssued = context.observation.prior_actions.some((turn) => (
            turn.action === 'send_message' && /screen|schermata|immagine/i.test(turn.message)
        ))

        if (canSend && target && transcriptContainsTarget && hasAssistantAfterTarget && !evidenceVisible && !screenshotAlreadyIssued) {
            return sendTurn(context, choosePhrase(context, screenshotPhrases[persona]))
        }

        if (evidenceVisible && !hasPriorReload && availableAction(context, 'reload_page')) {
            return HumanTurnSchema.parse({
                contract: 'talos.human_journey.turn',
                schema_version: 1,
                turn_id: actorTurnId(context, 'reload_page', 'visible-evidence'),
                checkpoint_id: context.observation.checkpoint_id,
                source: this.mode,
                created_at: context.createdAt,
                action: 'reload_page',
            })
        }

        if (canSend && hasPriorReload && actionsAfterReload.length === 0) {
            return sendTurn(context, choosePhrase(context, resumePhrases[persona]))
        }

        if (evidenceVisible && availableAction(context, 'end_trial')) {
            const reason = 'La pagina e l evidenza richiesta sono visibili dopo il percorso umano.'
            return HumanTurnSchema.parse({
                contract: 'talos.human_journey.turn',
                schema_version: 1,
                turn_id: actorTurnId(context, 'end_trial', reason),
                checkpoint_id: context.observation.checkpoint_id,
                source: this.mode,
                created_at: context.createdAt,
                action: 'end_trial',
                outcome: 'goal_reached',
                reason,
            })
        }

        if (availableAction(context, 'wait_for_visible_state')) {
            const description = 'Attendi una modifica visibile della conversazione o dello stato Browse.'
            return HumanTurnSchema.parse({
                contract: 'talos.human_journey.turn',
                schema_version: 1,
                turn_id: actorTurnId(context, 'wait_for_visible_state', description),
                checkpoint_id: context.observation.checkpoint_id,
                source: this.mode,
                created_at: context.createdAt,
                action: 'wait_for_visible_state',
                description,
                timeout_ms: 15_000,
            })
        }

        throw new Error('Seeded actor has no suitable visible action in the current observation.')
    }
}
