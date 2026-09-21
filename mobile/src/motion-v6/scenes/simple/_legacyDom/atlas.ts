import { createSimpleDefinition } from './sceneTools'

export const atlasSimpleScene = createSimpleDefinition('atlas', [
    { role: 'atlas-topology-route', x: 9, y: 28, width: 73, height: 0.45, motionX: 12, motionY: 4, rotation: 6, phase: 2 },
    { role: 'atlas-coordinate-cross', x: 33, y: 18, width: 14, height: 14, motionX: -3, motionY: 5, phase: 4 },
    { role: 'atlas-waypoint', x: 68, y: 49, width: 1.7, height: 2.5, motionX: 5, motionY: -3, rotation: 45, depth: 5, phase: 6 },
    { role: 'atlas-region', x: 18, y: 57, width: 33, height: 22, motionX: 2, motionY: -2, rotation: -4, phase: 8 },
])
