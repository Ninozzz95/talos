import assert from 'node:assert/strict';
import test from 'node:test';
import {lastInkDebugFrame} from './first-run-fixture.ts';

test('REV-INK-MODE-WRITE: paste-mode writes do not replace the debug frame; clears and blank frames remain observable',()=>{
 const modeOn='\x1b[?2004h',modeOff='\x1b[?2004l';
 const first='│> /provider │\n',second='│Provider list │\n';
 const raw=[first,modeOff,second,modeOn];const snapshot=[...raw];
 assert.equal(lastInkDebugFrame([first,modeOff]),first);
 assert.equal(lastInkDebugFrame(raw),second);
 assert.deepEqual(raw,snapshot,'raw terminal evidence is preserved');
 assert.equal(lastInkDebugFrame([modeOn,modeOff]),'');
 assert.equal(lastInkDebugFrame([first,'\x1b[2J']),'\x1b[2J','a screen clear must not be hidden');
 assert.equal(lastInkDebugFrame([first,'\n']), '\n','a blank debug frame must not be hidden');
 assert.equal(lastInkDebugFrame([]),'');
});
