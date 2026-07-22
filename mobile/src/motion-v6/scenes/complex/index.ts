import { createComplexSceneFactory, type ComplexRendererOptions, type ComplexRendererPlatform } from '../../renderers/complexRenderer'
import type { ComplexSceneRegistration } from '../../sceneRegistry'
import { forgeComplexScene } from './forge'
import { paperComplexScene } from './paper'
import { terminalComplexScene } from './terminal'
import { auroraComplexScene } from './aurora'
import { glacierComplexScene } from './glacier'
import { emberComplexScene } from './ember'
import { atlasComplexScene } from './atlas'
import { noirComplexScene } from './noir'
import { signalComplexScene } from './signal'
import { violetComplexScene } from './violet'
import { claudiusComplexScene } from './claudius'
import { basicusComplexScene } from './basicus'
import { telemetryComplexScene } from './telemetry'
import { calmComplexScene } from './calm'

export const TALOS_COMPLEX_SCENE_DEFINITIONS = Object.freeze([
    forgeComplexScene, paperComplexScene, terminalComplexScene, auroraComplexScene,
    glacierComplexScene, emberComplexScene, atlasComplexScene, noirComplexScene,
    signalComplexScene, violetComplexScene, claudiusComplexScene, basicusComplexScene,
    telemetryComplexScene, calmComplexScene,
] as const)

export function createTalosComplexSceneRegistrations(
    platform: ComplexRendererPlatform,
    options: ComplexRendererOptions = {},
): readonly ComplexSceneRegistration[] {
    return Object.freeze(TALOS_COMPLEX_SCENE_DEFINITIONS.map((definition) => Object.freeze({
        id: definition.id as ComplexSceneRegistration['id'],
        kind: 'complex' as const,
        factory: createComplexSceneFactory(definition, platform, options),
        assets: Object.freeze([]),
    })))
}
