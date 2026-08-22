import { forgeSimpleScene } from './forge'
import { paperSimpleScene } from './paper'
import { terminalSimpleScene } from './terminal'
import { auroraSimpleScene } from './aurora'
import { glacierSimpleScene } from './glacier'
import { emberSimpleScene } from './ember'
import { atlasSimpleScene } from './atlas'
import { noirSimpleScene } from './noir'
import { signalSimpleScene } from './signal'
import { violetSimpleScene } from './violet'
import { claudiusSimpleScene } from './claudius'
import { basicusSimpleScene } from './basicus'
import { telemetrySimpleScene } from './telemetry'
import { calmSimpleScene } from './calm'
import { createSimpleSceneFactory, type SimpleRendererOptions, type SimpleRendererPlatform } from '../../renderers/simpleRenderer'
import type { SimpleSceneRegistration } from '../../sceneRegistry'
import type { StaticSceneRegistration } from '../../sceneRegistry'
import { createStaticSceneFactory } from '../../renderers/staticRenderer'

export const TALOS_SIMPLE_SCENE_DEFINITIONS = Object.freeze([
    forgeSimpleScene,
    paperSimpleScene,
    terminalSimpleScene,
    auroraSimpleScene,
    glacierSimpleScene,
    emberSimpleScene,
    atlasSimpleScene,
    noirSimpleScene,
    signalSimpleScene,
    violetSimpleScene,
    claudiusSimpleScene,
    basicusSimpleScene,
    telemetrySimpleScene,
    calmSimpleScene,
] as const)

export function createTalosSimpleSceneRegistrations(
    platform: SimpleRendererPlatform,
    options: SimpleRendererOptions = {},
): readonly SimpleSceneRegistration[] {
    return Object.freeze(TALOS_SIMPLE_SCENE_DEFINITIONS.map((definition) => Object.freeze({
        id: definition.id,
        kind: 'simple' as const,
        factory: createSimpleSceneFactory(definition, platform, options),
        assets: Object.freeze([]),
    }) as SimpleSceneRegistration))
}

export function createTalosStaticSceneRegistrations(
    platform: SimpleRendererPlatform,
): readonly StaticSceneRegistration[] {
    return Object.freeze(TALOS_SIMPLE_SCENE_DEFINITIONS.map((definition) => Object.freeze({
        id: definition.id,
        kind: 'static' as const,
        factory: createStaticSceneFactory(definition, platform),
        assets: Object.freeze([]),
    }) as StaticSceneRegistration))
}
