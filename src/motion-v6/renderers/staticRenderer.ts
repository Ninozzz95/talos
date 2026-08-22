import type { SceneFactory, SceneInstance } from '../sceneRegistry'
import {
    createSimpleSceneFactory,
    type SimpleRendererPlatform,
    type SimpleSceneDefinition,
} from './simpleRenderer'

export function createStaticSceneFactory(
    definition: SimpleSceneDefinition,
    platform: SimpleRendererPlatform,
): SceneFactory<'static'> {
    const createSimple = createSimpleSceneFactory(definition, platform, { animated: false })
    return (input): SceneInstance<'static'> => {
        const simple = createSimple(input)
        return Object.freeze({
            kind: 'static' as const,
            mount: (context) => simple.mount({ kind: 'simple', target: context.target }),
            renderOrUpdate: (nextInput) => simple.renderOrUpdate(nextInput),
            resize: (viewport) => simple.resize(viewport),
            pause: () => simple.pause(),
            resume: () => simple.resume(),
            dispose: () => simple.dispose(),
        })
    }
}
