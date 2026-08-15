import { createSimpleDefinition } from './sceneTools'

export const signalSimpleScene = createSimpleDefinition('signal', [
    { role: 'signal-telemetry-sweep', x: 8, y: 17, width: 82, height: 0.3, motionX: 15, motionY: 0, phase: 1 },
    { role: 'signal-heartbeat', x: 13, y: 42, width: 67, height: 6, motionX: -9, motionY: 4, phase: 3 },
    { role: 'signal-packet-line', x: 19, y: 62, width: 49, height: 0.35, motionX: 11, motionY: 0, phase: 5 },
    { role: 'signal-status-mark', x: 77, y: 58, width: 1.5, height: 2.2, motionX: -4, motionY: -3, depth: 5, phase: 7 },
])
