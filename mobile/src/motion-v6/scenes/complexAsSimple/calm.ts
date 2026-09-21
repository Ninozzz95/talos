import { createComplexDefinition } from './sceneTools'

// F1 calm refactor: quiet canvas language shared with glacier (see simple/calm.ts).
export const calmComplexScene = createComplexDefinition('calm', [
    { kind: 'frame', x: 24, y: 42, width: 46, height: 24, phase: 2 }, { kind: 'band', x: 11, y: 26, width: 68, height: 5, phase: 4 },
    { kind: 'band', x: 16, y: 62, width: 58, height: 4, phase: 6 }, { kind: 'steps', x: 68, y: 56, width: 8, height: 12, phase: 8 },
])
