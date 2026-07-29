import { createComplexDefinition } from './sceneTools'

export const calmComplexScene = createComplexDefinition('calm', [
    { kind: 'line', x: 9, y: 26, width: 68, height: 1, phase: 1 },
    { kind: 'polyline', x: 24, y: 42, width: 48, height: 14, phase: 2 },
    { kind: 'diamond', x: 18, y: 62, width: 5, height: 7, phase: 3 },
    { kind: 'line', x: 48, y: 72, width: 34, height: 1, phase: 4 },
])
