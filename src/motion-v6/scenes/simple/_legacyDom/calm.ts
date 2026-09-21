import { createSimpleDefinition } from './sceneTools'

// F1 calm refactor: calm's ambient scene reuses glacier's quiet crystal layer
// language (same roles, CSS ownership already shipped) until calm receives its
// own authored scene at desktop style alignment. Background is OFF by default
// under calm; this scene only renders when the user re-enables it.
export const calmSimpleScene = createSimpleDefinition('calm', [
    { role: 'glacier-schedule-band', x: 10, y: 24, width: 72, height: 4, motionX: 3, motionY: 0, phase: 3 },
    { role: 'glacier-crystal-grid', x: 22, y: 44, width: 48, height: 22, motionX: -1, motionY: 1, rotation: 0.5, depth: 1, phase: 5 },
    { role: 'glacier-dependency-cut', x: 55, y: 36, width: 0.2, height: 34, motionX: 0, motionY: -3, phase: 7 },
    { role: 'glacier-queue-mark', x: 70, y: 60, width: 1.4, height: 2.6, motionX: -2, motionY: 1, phase: 9 },
])
