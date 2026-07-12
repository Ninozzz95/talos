import { createSimpleDefinition } from './sceneTools'

export const basicusSimpleScene = createSimpleDefinition('basicus', [
    { role: 'basicus-component-tile', x: 13, y: 18, width: 12, height: 10, motionX: 3, motionY: 3, depth: 3, phase: 2 },
    { role: 'basicus-state-ripple', x: 47, y: 20, width: 12, height: 18, motionX: -3, motionY: 4, depth: 5, phase: 4 },
    { role: 'basicus-binding-line', x: 31, y: 50, width: 45, height: 0.35, motionX: 7, motionY: 0, phase: 6 },
    { role: 'basicus-state-mark', x: 69, y: 64, width: 1.7, height: 2.5, motionX: -4, motionY: -3, rotation: 45, phase: 8 },
])
