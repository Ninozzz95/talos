import { createSimpleDefinition } from './sceneTools'

// Telemetry reuses the aurora line-grid geometry family with rule-like sweeps:
// horizontal graduated runs and small tick marks, matching the v7 signature.
export const telemetrySimpleScene = createSimpleDefinition('telemetry', [
    { role: 'telemetry-rule-run', x: 6, y: 24, width: 72, height: 0.35, motionX: 9, motionY: 2, phase: 1 },
    { role: 'telemetry-tick-cluster', x: 18, y: 42, width: 1.2, height: 2.2, motionX: 4, motionY: -4, rotation: 0, phase: 4 },
    { role: 'telemetry-readout-line', x: 34, y: 58, width: 48, height: 0.3, motionX: -7, motionY: 3, phase: 6 },
    { role: 'telemetry-carrier-band', x: 10, y: 74, width: 62, height: 4, motionX: 8, motionY: 4, rotation: -4, depth: 3, phase: 8 },
])
