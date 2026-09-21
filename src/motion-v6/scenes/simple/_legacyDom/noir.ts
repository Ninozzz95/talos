import { createSimpleDefinition } from './sceneTools'

export const noirSimpleScene = createSimpleDefinition('noir', [
    { role: 'noir-evidence-aperture', x: 27, y: 19, width: 46, height: 38, motionX: 2, motionY: 2, depth: 2, phase: 2 },
    { role: 'noir-hard-edge', x: 9, y: 14, width: 0.35, height: 67, motionX: 0, motionY: 6, phase: 4 },
    { role: 'noir-evidence-line', x: 17, y: 68, width: 65, height: 0.25, motionX: -7, motionY: 0, phase: 6 },
    { role: 'noir-focus-mark', x: 74, y: 28, width: 2.2, height: 5.2, motionX: -3, motionY: 3, phase: 8 },
])
