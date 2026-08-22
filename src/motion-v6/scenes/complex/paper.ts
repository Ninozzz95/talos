import { createComplexDefinition } from './sceneTools'
export const paperComplexScene = createComplexDefinition('paper', [
    { kind:'line',x:16,y:10,width:1,height:72,phase:1 }, { kind:'steps',x:24,y:22,width:52,height:9,phase:2 },
    { kind:'rect',x:24,y:39,width:34,height:13,phase:3 }, { kind:'bracket',x:62,y:58,width:21,height:11,phase:4 },
])
