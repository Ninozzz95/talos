import { createSimpleDefinition } from './sceneTools'

export const glacierSimpleScene = createSimpleDefinition('glacier', [
    { role: 'glacier-schedule-band', x: 7, y: 18, width: 79, height: 6, motionX: 5, motionY: 0, phase: 2 },
    { role: 'glacier-crystal-grid', x: 17, y: 38, width: 55, height: 29, motionX: -2, motionY: 2, rotation: 1, depth: 2, phase: 4 },
    { role: 'glacier-dependency-cut', x: 49, y: 31, width: 0.2, height: 45, motionX: 0, motionY: -5, phase: 6 },
    { role: 'glacier-queue-mark', x: 77, y: 54, width: 1.8, height: 3.4, motionX: -4, motionY: 1, phase: 8 },
])
