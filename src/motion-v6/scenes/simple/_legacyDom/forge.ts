import { createSimpleDefinition } from './sceneTools'

export const forgeSimpleScene = createSimpleDefinition('forge', [
    { role: 'forge-node', x: 14, y: 24, width: 1.4, height: 2.2, motionX: 4, motionY: 1, depth: 4, phase: 1 },
    { role: 'forge-link', x: 15, y: 25, width: 48, height: 0.35, motionX: 9, motionY: 0, phase: 2 },
    { role: 'forge-gate', x: 61, y: 20, width: 6, height: 14, motionX: 2, motionY: 3, depth: 3, phase: 3 },
    { role: 'forge-recovery', x: 72, y: 55, width: 9, height: 14, motionX: -4, motionY: 4, rotation: 45, phase: 4 },
    { role: 'forge-checkpoint', x: 39, y: 63, width: 1.6, height: 2.4, motionX: 3, motionY: -3, depth: 5, phase: 5 },
])
