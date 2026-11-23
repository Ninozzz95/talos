/*
 * 0.7.0 block 1, item 6 (list from 0.6.18): the row of `view_image` called with an address (`url`, the kernel of desktop 0.2.4 reads
 * an image from the web) showed nothing beside its label. It now shows the address's host and path, never what follows `?` or `#`,
 * never `user:password@` (Hermes tools/delegate_tool_results.py:100-105 rebuilds the authority from host and port for the same
 * reason), and the raw address never reaches the detail lines either. Invented hosts only; nothing is fetched.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {toolDisplay} from '../../src/tui/tool-display.ts';
import {toolRowView} from '../../src/tui/components/tool-row.ts';

const row=(args:Record<string,unknown>,status:'running'|'approval'|'completed'='running')=>({id:'v1',name:'view_image',status,argsText:JSON.stringify(args),liveOutput:'',finalOutput:status==='completed'?'An image.':'',startedAt:0,endedAt:status==='completed'?1:null});
const screen=(args:Record<string,unknown>,width=120,expanded=true,status:'running'|'approval'|'completed'='running')=>{const v=toolRowView(row(args,status) as any,width,expanded,2);return [v.line,...v.detailLines].join('\n');};

test('view_image with an address: the row shows its host and path',()=>{
  assert.equal(toolDisplay('view_image',{url:'https://img.esempio-finto.test/cartella/foto.png'}).primaryArg,'img.esempio-finto.test/cartella/foto.png');
  assert.match(screen({url:'https://img.esempio-finto.test/cartella/foto.png'}),/img\.esempio-finto\.test\/cartella\/foto\.png/u);
  assert.equal(toolDisplay('view_image',{url:'http://127.0.0.1:8080/a.png'}).primaryArg,'127.0.0.1:8080/a.png','the port stays');
  assert.equal(toolDisplay('view_image',{url:'https://img.esempio-finto.test/'}).primaryArg,'img.esempio-finto.test','a bare host has no trailing slash');
  assert.equal(toolDisplay('view_image',{url:'  https://img.esempio-finto.test/a.png  '}).primaryArg,'img.esempio-finto.test/a.png','spaces around it are not part of the address');
  const shown=screen({url:'https://img.esempio-finto.test/cartella/foto.png'});
  assert.equal(shown.split('img.esempio-finto.test/cartella/foto.png').length-1,1,`the address stands once, on the row, not again as a detail line:\n${shown}`);
});

test('view_image: a key in the query never reaches the screen, on the row or in its details, in every state',()=>{
  const url='https://img.esempio-finto.test/foto.png?api_key=QZXJ7chiave&sig=QZXJ8firma#QZXJ9frammento';
  assert.equal(toolDisplay('view_image',{url}).primaryArg,'img.esempio-finto.test/foto.png');
  for(const status of ['running','approval','completed'] as const)for(const width of [80,120])for(const expanded of [false,true]){
    const text=screen({url},width,expanded,status);
    for(const secret of ['QZXJ7','QZXJ8','QZXJ9','api_key=','sig='])assert.ok(!text.includes(secret),`${status} ${width} ${expanded}: ${secret}\n${text}`);
  }
});

test('view_image: credentials in the address never reach the screen',()=>{
  const url='https://utente-finto:QZXJ6parola@img.esempio-finto.test/foto.png';
  assert.equal(toolDisplay('view_image',{url}).primaryArg,'img.esempio-finto.test/foto.png');
  for(const expanded of [false,true]){const text=screen({url},120,expanded);assert.ok(!text.includes('QZXJ6')&&!text.includes('utente-finto'),text);}
});

test('view_image: a path still wins; an address that cannot be read shows nothing rather than the raw text',()=>{
  assert.equal(toolDisplay('view_image',{path:'img/a.png',url:'https://img.esempio-finto.test/b.png'}).primaryArg,'img/a.png');
  const both=screen({path:'img/a.png',url:'https://utente-finto:QZXJ3parola@img.esempio-finto.test/b.png?token=QZXJ2'});
  assert.match(both,/img\.esempio-finto\.test\/b\.png/u,'the address beside the path is shown shortened too');
  assert.ok(!both.includes('QZXJ3')&&!both.includes('QZXJ2'),both);
  assert.ok(!both.includes('https://')&&!both.includes('?')&&!both.includes('@'),`the detail line is the shortened address, not a masked raw one:\n${both}`);
  const odd='not an address QZXJ5grezzo';
  assert.equal(toolDisplay('view_image',{url:odd}).primaryArg,null);
  assert.ok(!screen({url:odd}).includes('QZXJ5'),'the raw text is not printed in the details either');
  const beside=screen({path:'img/a.png',url:odd});
  assert.ok(!beside.includes('QZXJ5')&&!/\burl\b|address|empty/iu.test(beside.split('\n').slice(1).join('\n')),`nor beside a path, as a detail line:\n${beside}`);
  assert.equal(toolDisplay('view_image',{url:'data:image/png;base64,QZXJ4dati'}).primaryArg,null,'a data: address has no host to show');
});

/* judge v2475: with BOTH `path` and `url` the primary is the path, and the address stands only in the DETAIL lines: it must be shortened
   there too (host and path), never the query, the fragment or credentials, in every state and width, collapsed or expanded */
test('view_image with a path AND an address: the detail line shows the address shortened, never its query, fragment or credentials',()=>{
  const args={path:'img/a.png',url:'https://utente-finto:QZXJ1parola@img.esempio-finto.test:8443/cartella/b.png?api_key=QZXJ0chiave&x=1#QZXJAframmento'};
  for(const status of ['running','approval','completed'] as const)for(const width of [80,120,200])for(const expanded of [false,true]){
    const v=toolRowView(row(args,status) as any,width,expanded,2);
    assert.ok(v.line.includes('img/a.png'),`${status} ${width} ${expanded}: the path is the primary\n${v.line}`);
    const details=v.detailLines.join('\n');
    for(const text of [v.line,details])for(const secret of ['QZXJ0','QZXJ1','QZXJA','api_key','utente-finto','?','#','@','https://'])
      assert.ok(!text.includes(secret),`${status} ${width} ${expanded}: ${secret}\n${v.line}\n${details}`);
    if(width>=120)assert.ok(details.split('\n').some(line=>line.endsWith('img.esempio-finto.test:8443/cartella/b.png')),`${status} ${width} ${expanded}: the detail line is host and path\n${details}`);
  }
});

test('view_image: a long address is cut like the other rows, at the row width',()=>{
  const url=`https://img.esempio-finto.test/${'cartella/'.repeat(30)}foto.png`;
  for(const width of [60,80]){const v=toolRowView(row({url}) as any,width,false,2);assert.ok(v.line.length<=width,`${width}: ${v.line.length}`);}
});
