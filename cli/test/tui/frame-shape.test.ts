/*
 * FE-048, block A1 of MAPPA-RIDISEGNO-2026-11-01: one function decides the frame's shape, as regions/budget.ts decides its heights.
 * The thresholds are the approved mockup's (guscio.js `misure`): the sweep is the 81 sizes of r1-layout-grid.test.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {BAR_COLUMNS,PANEL_COLUMNS,frameShape,viewColumns,type FrameState,type FrameView} from '../../src/tui/regions/frame-shape.ts';
import {MIN_COLUMNS} from '../../src/tui/regions/budget.ts';

const WIDTHS=[40,41,60,80,100,120,160,200,240];
const HEIGHTS=[12,13,15,20,24,30,40,60,80];
const state=(over:Partial<FrameState>={}):FrameState=>({view:'essential',bar:false,panel:false,side:'bar',...over});

test('the frame never leaves the chat narrower than the smallest frame, at every size, view and side',()=>{
  for(const columns of WIDTHS)for(const rows of HEIGHTS)for(const view of ['zen','essential','full'] as FrameView[])for(const side of ['bar','panel'] as const){
    const shape=frameShape({columns,rows},state({view,bar:view==='full',panel:view==='full',side}));
    assert.ok(shape.centre>=MIN_COLUMNS,`${columns}×${rows} ${view} ${side}: ${shape.centre}`);
    assert.equal(shape.bar+shape.centre+shape.panel,columns);
  }
});

test('from 150 columns the bar and the panel stand together',()=>{
  assert.deepEqual(frameShape({columns:150,rows:30},state({bar:true,panel:true})),{bar:BAR_COLUMNS,panel:PANEL_COLUMNS,centre:150-BAR_COLUMNS-PANEL_COLUMNS,whole:false,footerRows:2,compact:false});
});

test('from 110 to 149 only one of them, the bar unless the panel was the one asked for last',()=>{
  for(const columns of [110,149]){
    assert.equal(frameShape({columns,rows:30},state({bar:true,panel:true,side:'bar'})).panel,0);
    assert.equal(frameShape({columns,rows:30},state({bar:true,panel:true,side:'bar'})).bar,BAR_COLUMNS);
    assert.equal(frameShape({columns,rows:30},state({bar:true,panel:true,side:'panel'})).bar,0);
    assert.equal(frameShape({columns,rows:30},state({bar:true,panel:true,side:'panel'})).panel,PANEL_COLUMNS);
    assert.equal(frameShape({columns,rows:30},state({bar:false,panel:true,side:'bar'})).panel,0,'the side says which: a panel not chosen stays shut');
  }
});

test('under 110 columns there is only the chat, until a column has the focus: then it takes the whole width',()=>{
  assert.deepEqual(frameShape({columns:109,rows:30},state({bar:true,panel:true})),{bar:0,panel:0,centre:109,whole:false,footerRows:2,compact:false});
  const bar=frameShape({columns:109,rows:30},state({bar:true,focus:'bar'}));
  assert.deepEqual([bar.bar,bar.panel,bar.whole],[109,0,true]);
  const panel=frameShape({columns:80,rows:24},state({bar:true,panel:true,focus:'panel'}));
  assert.deepEqual([panel.bar,panel.panel,panel.whole],[0,80,true]);
  assert.equal(panel.centre,80,'the chat stays laid out at the full width, hidden');
  assert.equal(frameShape({columns:109,rows:30},state({focus:'bar'})).whole,false,'a closed bar takes no page');
  assert.equal(frameShape({columns:110,rows:30},state({bar:true,focus:'bar'})).whole,false,'from 110 columns it is a column');
});

test('the footer: two rows from 100 columns, one in Zen, and the compact rows under 80',()=>{
  assert.equal(frameShape({columns:99,rows:30},state()).footerRows,1);
  assert.equal(frameShape({columns:100,rows:30},state()).footerRows,2);
  assert.equal(frameShape({columns:200,rows:30},state({view:'zen'})).footerRows,1);
  assert.equal(frameShape({columns:79,rows:30},state()).compact,true);
  assert.equal(frameShape({columns:80,rows:30},state()).compact,false);
});

test('a view sets its columns: Full opens both, the others close them, and Zen opens none',()=>{
  assert.deepEqual(viewColumns('full'),{bar:true,panel:true,side:'bar'});
  assert.deepEqual(viewColumns('essential'),{bar:false,panel:false,side:'bar'});
  assert.deepEqual(viewColumns('zen'),{bar:false,panel:false,side:'bar'});
});
