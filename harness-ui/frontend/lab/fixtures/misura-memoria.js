const GiB = 1024 ** 3;
export const CAPACITA_MEMORIA = {schema:'talos.model-lab.capacity/1',platform:'win32',arch:'x64',measuredAt:'2026-09-05T19:00:00.000Z',memory:{totalBytes:32*GiB,freeBytes:12*GiB},storage:{totalBytes:1000*GiB,availableBytes:100*GiB,reserveBytes:GiB,allocatableBytes:99*GiB},runtime:{status:'ready'}};
export const RUNTIME_MEMORIA = [{runtimeId:'llama.cpp',state:'observed',runtimeState:'ready',observedAt:CAPACITA_MEMORIA.measuredAt,models:[{id:'modello-prova',name:'Modello di prova'}]}];
