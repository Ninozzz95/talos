import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {createTerminalSizeStore} from '../../src/tui/components/terminal-shell.ts';

test('resize RED — one reactive terminal-size source updates rows and columns atomically',()=>{
  const stream:any=new EventEmitter();stream.rows=40;stream.columns=120;
  const store=createTerminalSizeStore(stream,{rows:30,columns:100});
  const seen:any[]=[];const unsubscribe=store.subscribe((size:any)=>seen.push(size));
  assert.deepEqual(store.getSnapshot(),{rows:40,columns:120});
  stream.rows=20;stream.columns=60;stream.emit('resize');
  assert.deepEqual(store.getSnapshot(),{rows:20,columns:60});
  stream.rows=55;stream.columns=140;stream.emit('resize');
  assert.deepEqual(store.getSnapshot(),{rows:55,columns:140});
  assert.deepEqual(seen,[{rows:20,columns:60},{rows:55,columns:140}]);
  unsubscribe();store.dispose();
  stream.rows=10;stream.columns=30;stream.emit('resize');
  assert.deepEqual(store.getSnapshot(),{rows:55,columns:140},'disposed stores must not keep stale resize listeners alive');
});

test('resize RED — invalid dimensions retain the last valid geometry instead of corrupting layout',()=>{
  const stream:any=new EventEmitter();stream.rows=30;stream.columns=100;
  const store=createTerminalSizeStore(stream,{rows:30,columns:100});
  stream.rows=0;stream.columns=NaN;stream.emit('resize');
  assert.deepEqual(store.getSnapshot(),{rows:30,columns:100});
  store.dispose();
});
