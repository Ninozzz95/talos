/*
 * R4 lane N — Q-R4-5 / gate E6: in the command menu Enter RUNS the highlighted command and Tab completes `/<name> `.
 * What is highlighted: the top row when the typed name is the start of a command (`/mo` → /model), or the row the person
 * moved to with the arrows. After a typo (only a fuzzy match) or with arguments typed, NOTHING is highlighted, so Enter sends
 * the text as typed and the existing "Did you mean" answer appears (Claude Code "Commands", 2.1.269 → 2026-09-11, gate B.1).
 * An empty menu says so (Q-R4-13).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {commandMenuHighlight,commandMenuItems,commandMenuOverlay,createCommandMenuSelectionStore} from '../../src/tui/components/command-menu.ts';
import {fitOverlay} from '../../src/tui/overlays/scroll-window.ts';

const fresh=()=>createCommandMenuSelectionStore().getSnapshot();

test('R4-N a typed command prefix highlights its command; the empty query highlights the first row',()=>{
  assert.equal(commandMenuItems('/mo')[commandMenuHighlight('/mo',fresh())]?.command.name,'model');
  assert.equal(commandMenuItems('/resu')[commandMenuHighlight('/resu',fresh())]?.command.name,'resume');
  assert.equal(commandMenuHighlight('/',fresh()),0);
  assert.equal(commandMenuHighlight('/model',fresh()),0);
});

test('R4-N a typo or typed arguments leave nothing highlighted',()=>{
  assert.ok(commandMenuItems('/modle').length>0,'the typo still lists its fuzzy match');
  assert.equal(commandMenuHighlight('/modle',fresh()),-1);
  assert.equal(commandMenuHighlight('/model openai:gpt-5',fresh()),-1);
  assert.equal(commandMenuHighlight('/zzzz',fresh()),-1);
});

test('R4-N moving with the arrows highlights the chosen row, even after a typo; typing resets it',()=>{
  const store=createCommandMenuSelectionStore();
  const rows=commandMenuItems('/modle').length;
  store.highlight(0);
  assert.equal(commandMenuHighlight('/modle',store.getSnapshot()),0);
  store.move(rows,'down');
  assert.equal(commandMenuHighlight('/modle',store.getSnapshot()),Math.min(1,rows-1));
  store.reset();
  assert.equal(commandMenuHighlight('/modle',store.getSnapshot()),-1);
});

test('R4-N the menu draws the highlight only on the highlighted row, and an empty menu has one line',()=>{
  const typo=fitOverlay(commandMenuOverlay({text:'/modle',selected:-1}),{maxRows:12,columns:80});
  assert.equal(typo.rows.some(row=>row.tone==='selected'),false,'nothing is highlighted after a typo');
  const prefix=fitOverlay(commandMenuOverlay({text:'/mo',selected:0}),{maxRows:12,columns:80});
  assert.equal(prefix.rows.filter(row=>row.tone==='selected').length,1);
  const empty=fitOverlay(commandMenuOverlay({text:'/zzzz',selected:-1}),{maxRows:12,columns:80});
  const body=empty.rows.filter(row=>row.role==='body').map(row=>row.text);
  assert.equal(body.length,1);
  assert.match(body[0]!,/No commands match "\/zzzz"/u);
  assert.match(body[0]!,/Enter/u,'the line says what Enter will do');
});
