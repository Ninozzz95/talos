import { createSimpleDefinition } from './sceneTools'

export const emberSimpleScene = createSimpleDefinition('ember', [
    { role: 'ember-incident-cross', x: 18, y: 25, width: 4.5, height: 6, motionX: 3, motionY: 2, rotation: 45, phase: 1 },
    { role: 'ember-recovery-track', x: 38, y: 19, width: 44, height: 8, motionX: 8, motionY: 0, phase: 3 },
    { role: 'ember-fault-line', x: 26, y: 52, width: 55, height: 0.4, motionX: -9, motionY: 1, rotation: -3, phase: 6 },
    { role: 'ember-checkpoint', x: 69, y: 65, width: 1.8, height: 2.7, motionX: 2, motionY: -4, depth: 4, phase: 8 },
])
