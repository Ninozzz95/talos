import { createComplexDefinition } from './sceneTools'
export const telemetryComplexScene = createComplexDefinition('telemetry', [
    { kind: 'line', x: 6, y: 22, width: 74, height: 1, phase: 1 }, { kind: 'polyline', x: 28, y: 40, width: 56, height: 18, phase: 2 },
    { kind: 'diamond', x: 16, y: 60, width: 7, height: 9, phase: 3 }, { kind: 'line', x: 44, y: 74, width: 40, height: 1, phase: 4 },
])
