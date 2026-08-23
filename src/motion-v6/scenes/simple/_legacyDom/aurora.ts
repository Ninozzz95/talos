import { createSimpleDefinition } from './sceneTools'

export const auroraSimpleScene = createSimpleDefinition('aurora', [
    { role: 'aurora-branch-ribbon', x: 8, y: 22, width: 68, height: 5, motionX: 10, motionY: 5, rotation: -8, depth: 3, phase: 2 },
    { role: 'aurora-research-path', x: 31, y: 45, width: 54, height: 0.4, motionX: -8, motionY: 7, rotation: 7, phase: 5 },
    { role: 'aurora-hypothesis-mark', x: 21, y: 60, width: 1.6, height: 2.4, motionX: 4, motionY: -6, rotation: 18, phase: 7 },
    { role: 'aurora-citation-line', x: 48, y: 71, width: 37, height: 0.25, motionX: 6, motionY: 2, phase: 9 },
])
