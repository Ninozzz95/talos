import { createSimpleDefinition } from './sceneTools'

export const calmSimpleScene = createSimpleDefinition('calm', [
    { role: 'calm-schedule-band', x: 10, y: 24, width: 72, height: 4, motionX: 3, motionY: 0, phase: 3 },
    { role: 'calm-structure-grid', x: 22, y: 44, width: 48, height: 22, motionX: -1, motionY: 1, rotation: 0.5, depth: 1, phase: 5 },
    { role: 'calm-dependency-cut', x: 55, y: 36, width: 0.2, height: 34, motionX: 0, motionY: -3, phase: 7 },
    { role: 'calm-queue-mark', x: 70, y: 60, width: 1.4, height: 2.6, motionX: -2, motionY: 1, phase: 9 },
])
