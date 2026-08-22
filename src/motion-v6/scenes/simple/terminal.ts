import { createSimpleDefinition } from './sceneTools'

export const terminalSimpleScene = createSimpleDefinition('terminal', [
    { role: 'terminal-scanline', x: 8, y: 18, width: 84, height: 0.2, motionX: 0, motionY: 18, opacity: 0.38, phase: 1 },
    { role: 'terminal-cursor', x: 27, y: 42, width: 0.25, height: 3.2, motionX: 12, motionY: 0, phase: 2 },
    { role: 'terminal-event-row', x: 14, y: 31, width: 58, height: 0.45, motionX: 7, motionY: 0, phase: 4 },
    { role: 'terminal-prompt', x: 14, y: 62, width: 36, height: 0.45, motionX: 4, motionY: 0, depth: 2, phase: 6 },
])
