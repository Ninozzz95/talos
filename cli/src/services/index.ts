function publicRow(x:any){if(!x||typeof x!=='object')return x;const o:{[k:string]:unknown}={};for(const[k,v]of Object.entries(x)){if(/path|percorso/i.test(k))continue;o[k==='titolo'?'title':k==='testo'?'body':k]=v;}return o;}
export function createServiceFacades(stores:any){return{
 notes:{list:async()=>((await stores.notes.list())??[]).map(publicRow),add:async(v:{title:string;body:string})=>publicRow(await stores.notes.create(v))},
 tasks:{list:async()=>((await stores.tasks.list())??[]).map(publicRow)},
 memory:{search:async(q:string)=>((await stores.memory.search(q))??[]).map(publicRow)},
 library:{list:async()=>((await stores.library.list())??[]).map(publicRow)},
 research:{list:async()=>((await stores.research.list())??[]).map(publicRow)},
 forge:{list:async()=>((await stores.forge.list())??[]).map(publicRow)},
};}
