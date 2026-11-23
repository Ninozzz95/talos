import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createLibraryFacade,attachLibraryContextToken,detachLibraryContextToken} from '../../src/services/library-facade.ts';

const entries:any[]=[
  {id:'lib-a',nome:'alpha.md',mediaType:'text/markdown',fileType:'document',origine:'uploaded',creatoIl:'2026-09-21T10:00:00.000Z',aggiornatoIl:'2026-09-21T11:00:00.000Z',creatoDa:{tipo:'persona'},sessione:null,cartella:'/project',percorso:'/project/.harness-ui-library/lib-a/contenuto'},
  {id:'lib-b',nome:'copy.md',mediaType:'text/markdown',fileType:'document',origine:'generated',creatoIl:'2026-09-21T09:00:00.000Z',aggiornatoIl:'2026-09-21T09:30:00.000Z',creatoDa:{tipo:'modello',modello:'openai:gpt-5-mini',provider:'openai'},sessione:{id:'s-1',nome:'Build docs'},cartella:'/project',percorso:'/project/.harness-ui-library/lib-b/contenuto'},
  {id:'lib-pdf',nome:'spec.pdf',mediaType:'application/pdf',fileType:'document',origine:'uploaded',creatoIl:null,aggiornatoIl:null,creatoDa:{tipo:'persona'},sessione:null,cartella:'/project',percorso:'/project/.harness-ui-library/lib-pdf/contenuto'},
  {id:'lib-img',nome:'diagram.png',mediaType:'image/png',fileType:'image',origine:'uploaded',creatoIl:null,aggiornatoIl:null,creatoDa:{tipo:'persona'},sessione:null,cartella:'/project',percorso:'/project/.harness-ui-library/lib-img/contenuto'},
  {id:'lib-big',nome:'large.bin',mediaType:'application/octet-stream',fileType:'document',origine:'uploaded',creatoIl:null,aggiornatoIl:null,creatoDa:{tipo:'persona'},sessione:null,cartella:'/project',percorso:'/project/.harness-ui-library/lib-big/contenuto'}
];

function fixture(){
  const rows=entries.map(row=>structuredClone(row));
  const bytes=new Map<string,Buffer>([
    ['lib-a',Buffer.from('# Same\nhello','utf8')],
    ['lib-b',Buffer.from('# Same\nhello','utf8')],
    ['lib-pdf',Buffer.from([0x25,0x50,0x44,0x46,0x2d,0xff,0x00,0x01])],
    ['lib-img',Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00])],
  ]);
  let byteReads=0,saveCalls=0,lastSave:any=null,bigTooLarge=true,importBytes=Buffer.from('# Same\nhello','utf8');
  const deps:any={
    loadStore:async()=>({
      CARTELLA_LIBRERIA:'.harness-ui-library',
      elencaVoci:async({conProvenienza}:any)=>rows.map(row=>conProvenienza?structuredClone(row):(({cartella,percorso,creatoDa,sessione,...rest}:any)=>rest)(structuredClone(row))),
      elencaVociConTesto:async()=>rows.filter(row=>row.fileType!=='image').map(row=>({...row,testoEstratto:row.id==='lib-a'?'fattura alpha':''})),
      cercaVoci:(items:any[],{query,limit=5,offset=0}:any)=>{const q=String(query).toLowerCase();const found=items.filter(row=>row.nome.toLowerCase().includes(q)||String(row.testoEstratto??'').toLowerCase().includes(q));return{pagina:found.slice(offset,offset+limit),totale:found.length};},
      leggiVoce:async({id}:any)=>({id,nome:id+'.md'}),
      leggiBytesVoce:async({id}:any)=>{byteReads++;if(id==='lib-big'&&bigTooLarge)throw Object.assign(new Error('too large'),{code:'LIBRARY_TOO_LARGE'});const data=bytes.get(id);if(!data)return null;const row=rows.find(x=>x.id===id);return{bytes:data,dimensione:data.length,nome:row.nome,mediaType:row.mediaType};},
      salvaVoce:async(input:any)=>{saveCalls++;lastSave=structuredClone(input);return'lib-new';},
      rinominaVoce:async({id,nome}:any)=>({id,nomePrima:'old',nomeDopo:nome}),
      eliminaVoce:async({id}:any)=>({id}),
      percorsoContenutoVoce:(id:string)=>rows.some(row=>row.id===id)?'.harness-ui-library/'+id+'/contenuto':null,
    }),
    readImportFile:async()=>importBytes,
    writeExportFile:async()=>{},
  };
  return{
    rows,bytes,deps,
    get byteReads(){return byteReads;},
    get saveCalls(){return saveCalls;},
    get lastSave(){return lastSave;},
    setImportBytes(value:Buffer){importBytes=value;},
    makeAllReadable(){bigTooLarge=false;bytes.set('lib-big',Buffer.from('different large placeholder','utf8'));rows.find(row=>row.id==='lib-big')!.mediaType='text/plain';}
  };
}
function api(f:any){return createLibraryFacade({repoRoot:'/repo',projectRoot:'/project',paths:{dataRoot:'/data'} as any},f.deps);}

test('M9-D RED — passive Library list uses persisted provenance and does not read/hash content',async()=>{
  const f=fixture();const snap=await api(f).list();
  assert.equal(snap.state,'ready');assert.equal(f.byteReads,0);
  const a=snap.rows.find(row=>row.id==='lib-a')!;const b=snap.rows.find(row=>row.id==='lib-b')!;
  assert.equal(a.creator.type,'persona');assert.equal(a.session,null);
  assert.equal(b.creator.type,'modello');assert.equal(b.creator.model,'openai:gpt-5-mini');assert.equal(b.creator.provider,'openai');
  assert.deepEqual(b.session,{id:'s-1',name:'Build docs'});
  assert.equal(JSON.stringify(a).includes('/project'),false);
  assert.equal(a.context.autoAttach,false);assert.equal(a.context.autoSubmit,false);assert.equal(a.context.persistence,'composer-only-until-send');
});

test('M9-D RED — safe text preview uses exact bytes and bounded text while PDF/image are metadata-only',async()=>{
  const f=fixture();const lib=api(f);
  const text=await lib.preview('lib-a');assert.equal(text.mode,'text');assert.match(text.text??'',/# Same/u);assert.equal(text.mediaType,'text/markdown');
  const pdf=await lib.preview('lib-pdf');assert.equal(pdf.mode,'metadata');assert.equal(pdf.text,null);assert.equal(pdf.reason,'unsupported-binary');
  const image=await lib.preview('lib-img');assert.equal(image.mode,'metadata');assert.equal(image.text,null);assert.equal(image.reason,'image');
  assert.equal(Object.hasOwn(image as any,'base64'),false);
});

test('M9-D RED — exact duplicate scan hashes bytes and reports partial state instead of false uniqueness',async()=>{
  const f=fixture();const scan=await api(f).duplicates('lib-a');
  assert.equal(scan.state,'partial');assert.match(scan.sha256??'',/^[0-9a-f]{64}$/u);
  assert.deepEqual(scan.duplicateIds,['lib-b']);assert.deepEqual(scan.unreadableIds,['lib-big']);
  assert.equal(scan.verifiedUnique,false);
});

test('M9-D RED — CLI import reuses deterministic exact duplicate without a Library write even if unrelated scans are partial',async()=>{
  const f=fixture();const result=await api(f).importFile('/tmp/alpha.md');
  assert.equal(result.duplicateDecision,'existing-exact');assert.equal(result.id,'lib-a');assert.equal(result.scanState,'partial');assert.equal(f.saveCalls,0);
});

test('M9-D RED — same filename alone is never duplicate proof',async()=>{
  const f=fixture();f.makeAllReadable();f.bytes.set('lib-b',Buffer.from('other','utf8'));f.bytes.set('lib-a',Buffer.from('original','utf8'));f.setImportBytes(Buffer.from('different','utf8'));
  const result=await api(f).importFile('/tmp/alpha.md');
  assert.equal(result.duplicateDecision,'created');assert.equal(result.id,'lib-new');assert.equal(f.saveCalls,1);
});

test('M9-D RED — context reference derives from exact Library id and current attachment capability',async()=>{
  const f=fixture();const lib=api(f);
  const text=await lib.prepareContextReference('lib-a');
  assert.equal(text.token,'@.harness-ui-library/lib-a/contenuto');assert.equal(text.kind,'text');
  const image=await lib.prepareContextReference('lib-img');assert.equal(image.kind,'image');
  await assert.rejects(()=>lib.prepareContextReference('lib-pdf'),(error:any)=>error?.code==='LIBRARY_CONTEXT_UNSUPPORTED');
  await assert.rejects(()=>lib.prepareContextReference('missing'),(error:any)=>error?.code==='LIBRARY_NOT_FOUND');
});

test('M9-D RED — visible composer attach is idempotent and detach removes only the exact managed line',()=>{
  const token='@.harness-ui-library/lib-a/contenuto';
  const other='@src/keep.ts';
  const once=attachLibraryContextToken('draft\n'+other,token);
  const twice=attachLibraryContextToken(once,token);
  assert.equal(once,twice);assert.equal(once,'draft\n'+other+'\n'+token);
  assert.equal(detachLibraryContextToken(once,token),'draft\n'+other);
  assert.equal(detachLibraryContextToken('prefix '+token+' suffix',token),'prefix '+token+' suffix','inline user text is not a managed standalone attachment line');
});

test('M9-D RED — duplicate/import decisions do not mutate or delete existing Library objects',async()=>{
  const f=fixture();const lib=api(f);await lib.duplicates('lib-a');await lib.importFile('/tmp/alpha.md');
  assert.equal(f.rows.length,5);
});

test('M9-D RED — CLI Library operations converge on one typed facade',async()=>{
  const source=await readFile(new URL('../../src/commands/services-cli.ts',import.meta.url),'utf8');
  assert.match(source,/createLibraryFacade/u);
  const start=source.indexOf('export async function runLibraryCommand');const end=source.indexOf('export async function runForgeCommand',start);
  assert.ok(start>=0&&end>start);const body=source.slice(start,end);
  assert.doesNotMatch(body,/importTalosModule\([^)]*library-store\.mjs/u);
  for(const method of ['list','search','read','preview','duplicates','importFile','exportFile','rename','delete','prepareContextReference'])assert.match(body,new RegExp('library\\.'+method+'\\(','u'));
});

test('M9-D hardening RED — import preserves exact bytes even when a text extension contains invalid UTF-8',async()=>{
  const f=fixture();f.makeAllReadable();
  const raw=Buffer.from([0xff,0xfe,0x41,0x00,0x42]);f.setImportBytes(raw);
  const result=await api(f).importFile('/tmp/bad.txt');
  assert.equal(result.duplicateDecision,'created');
  assert.equal(f.saveCalls,1);
  assert.equal(f.lastSave?.base64,raw.toString('base64'));
  assert.equal(Object.hasOwn(f.lastSave??{},'testo'),false);
});
