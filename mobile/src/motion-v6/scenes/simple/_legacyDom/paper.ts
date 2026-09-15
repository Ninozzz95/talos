import { createSimpleDefinition } from './sceneTools'

export const paperSimpleScene = createSimpleDefinition('paper', [
    { role: 'paper-margin', x: 16, y: 10, width: 1, height: 72, motionX: 0, motionY: 2, opacity: 0.45, phase: 1 },
    { role: 'paper-proof', x: 23, y: 24, width: 51, height: 0.3, motionX: 2, motionY: 0, phase: 3 },
    { role: 'paper-section', x: 23, y: 38, width: 33, height: 3, motionX: -2, motionY: 1, phase: 5 },
    { role: 'paper-rule', x: 23, y: 57, width: 61, height: 0.25, motionX: 3, motionY: 0, opacity: 0.52, phase: 7 },
])
