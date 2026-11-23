/*
 * R5a (coordinator; owner 2026-09-25, with a frame of the new /effort): "il selettore deve avere lo slider in accento
 * ambra … la barra adesso è tutta nera, invece deve avere fino al nodo selezionato evidenziato in ambra … come uno slider".
 * The track is amber from its start up to and including the chosen node, and dim after it; moving with ← → moves where the
 * amber ends. An overlay line gains an optional `accentTo` (the columns drawn in the accent before the line's own tone).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {effortLineOverlay,effortLineRows} from '../../src/tui/overlays/effort-line.ts';
import {fitOverlay,renderFittedOverlay} from '../../src/tui/overlays/scroll-window.ts';

const LEVELS=['default','low','medium','high','max'];
const trackLine=(overlay:ReturnType<typeof effortLineOverlay>)=>overlay.sections[0]!.lines.find(line=>/[○●]/u.test(line.text))!;

test('R5a slider: the track is accented up to and including the chosen node, and no further',()=>{
  for(let selected=0;selected<LEVELS.length;selected++){
    const overlay=effortLineOverlay({name:'m',choices:LEVELS,selected,width:80,unicode:true});
    const line=trackLine(overlay) as {text:string;accentTo?:number};
    assert.equal(line.accentTo,line.text.indexOf('●')+1,`level ${selected}: the amber ends right after the chosen node`);
    assert.doesNotMatch(line.text.slice(line.accentTo),/●/u,'nothing after the amber is the chosen node');
  }
  const rows=effortLineRows({choices:LEVELS,selected:3,width:80,unicode:true});
  assert.equal((rows as any).filledTo,rows.track.indexOf('●')+1);
});

test('R5a slider: an overlay row with accentTo is drawn as two runs, the first in the accent colour',()=>{
  const fitted=fitOverlay({sections:[{lines:[{text:'○────●────○',tone:'dim',accentTo:6} as any]}]},{columns:40});
  const row=fitted.rows.find(r=>r.text.startsWith('○'))!;
  assert.equal((row as any).accentTo,6,'the fitted row keeps where the accent ends');
  const h=(type:unknown,props:any,...children:unknown[])=>({type,props,children});
  const Ink={Box:'Box',Text:'Text'};
  const tree:any=renderFittedOverlay(h,Ink,fitted,{accentColor:'#c08b3c'});
  const drawn=tree.children.find((node:any)=>JSON.stringify(node).includes('○────●'));
  assert.ok(drawn,'the track row is drawn');
  const [first,second]=drawn.children as any[];
  assert.deepEqual([first.children[0],first.props.color],['○────●','#c08b3c'],'up to the chosen node: the accent (amber in the Calm theme)');
  assert.deepEqual([second.children[0],second.props.dimColor],['────○',true],'after it: the line\'s own dim tone');
});
