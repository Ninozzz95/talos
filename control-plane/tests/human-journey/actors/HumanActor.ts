import type {
    HumanActorMode,
    HumanJourneyScenario,
    HumanObservation,
    HumanTurn,
} from '../contracts'

export interface HumanActorContext {
    scenario: HumanJourneyScenario
    observation: HumanObservation
    seed: number
    trialIndex: number
    createdAt: string
    visibleTargetUrl?: string
    signal?: AbortSignal
}

export interface HumanActor {
    readonly mode: HumanActorMode
    nextTurn(context: HumanActorContext): Promise<HumanTurn>
}
