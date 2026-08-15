import { createSimpleDefinition } from './sceneTools'

export const claudiusSimpleScene = createSimpleDefinition('claudius', [
    { role: 'claudius-revision-mark', x: 14, y: 17, width: 1.8, height: 2.8, motionX: 2, motionY: 4, rotation: -8, phase: 2 },
    { role: 'claudius-margin-reference', x: 28, y: 11, width: 1, height: 70, motionX: 0, motionY: -4, phase: 4 },
    { role: 'claudius-proof-rule', x: 36, y: 34, width: 48, height: 0.25, motionX: 5, motionY: 0, phase: 6 },
    { role: 'claudius-citation-mark', x: 37, y: 61, width: 15, height: 4, motionX: -4, motionY: 1, depth: 2, phase: 8 },
])
