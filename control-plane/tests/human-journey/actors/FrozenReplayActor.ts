import {
    FrozenHumanJourneyRegressionSchema,
    HumanJourneyScenarioSchema,
    HumanObservationSchema,
    type FrozenHumanJourneyRegression,
    type HumanTurn,
} from '../contracts'
import type { HumanActor, HumanActorContext } from './HumanActor'

export class FrozenReplayActor implements HumanActor {
    readonly mode = 'frozen_replay' as const
    private readonly regression: FrozenHumanJourneyRegression
    private cursor = 0

    constructor(rawRegression: FrozenHumanJourneyRegression | unknown) {
        this.regression = FrozenHumanJourneyRegressionSchema.parse(rawRegression)
    }

    async nextTurn(rawContext: HumanActorContext): Promise<HumanTurn> {
        if (rawContext.signal?.aborted === true) {
            throw new Error('Frozen Human Journey replay was cancelled.')
        }
        const scenario = HumanJourneyScenarioSchema.parse(rawContext.scenario)
        const observation = HumanObservationSchema.parse(rawContext.observation)
        if (scenario.id !== this.regression.scenario_id || observation.scenario_id !== this.regression.scenario_id) {
            throw new Error(`Frozen replay scenario drift: expected ${this.regression.scenario_id}.`)
        }

        const replayTurn = this.regression.turns[this.cursor]
        const binding = this.regression.observations[this.cursor]
        if (replayTurn === undefined || binding === undefined) {
            throw new Error(`Frozen replay ${this.regression.id} is exhausted.`)
        }
        if (!scenario.checkpoints.some((checkpoint) => checkpoint.id === binding.checkpoint_id)) {
            throw new Error(`Frozen replay declared checkpoint drift at turn ${replayTurn.turn_id}.`)
        }
        if (!scenario.allowed_actions.includes(replayTurn.action)) {
            throw new Error(`Frozen replay action ${replayTurn.action} is no longer an allowed action.`)
        }
        if (observation.checkpoint_id !== binding.checkpoint_id || replayTurn.checkpoint_id !== binding.checkpoint_id) {
            throw new Error(`Frozen replay checkpoint drift at turn ${replayTurn.turn_id}.`)
        }
        if (observation.visible_state_sha256 !== binding.visible_state_sha256) {
            throw new Error(`Frozen replay visible state drift at turn ${replayTurn.turn_id}.`)
        }

        this.cursor += 1
        return structuredClone(replayTurn)
    }
}
