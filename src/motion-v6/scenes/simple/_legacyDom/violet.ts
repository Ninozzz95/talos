import { createSimpleDefinition } from './sceneTools'

export const violetSimpleScene = createSimpleDefinition('violet', [
    { role: 'violet-semantic-arc', x: 17, y: 18, width: 61, height: 39, motionX: 7, motionY: 5, rotation: -7, phase: 2 },
    { role: 'violet-cluster-link', x: 29, y: 44, width: 48, height: 0.35, motionX: -8, motionY: 3, rotation: 11, phase: 4 },
    { role: 'violet-concept-mark', x: 19, y: 64, width: 1.6, height: 2.4, motionX: 5, motionY: -5, rotation: 45, depth: 4, phase: 6 },
    { role: 'violet-relation', x: 68, y: 63, width: 8, height: 5, motionX: -5, motionY: -2, phase: 8 },
])
