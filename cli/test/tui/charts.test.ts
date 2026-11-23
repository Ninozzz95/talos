/* B1 of MAPPA-RIDISEGNO: every chart returns its rows in full colour, without colour and without Unicode. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {bar,brailleLine,calendar,CHART_FULL,columns,legendRow,sparkline,squares,stack,stackedColumns,timeBand,type ChartMode} from '../../src/tui/charts.ts';
import {roleStyle} from '../../src/tui/components/styled-rows.ts';
import {createTuiTheme} from '../../src/tui/theme.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const MODES:ChartMode[]=[CHART_FULL,{color:false,unicode:true},{color:true,unicode:false},{color:false,unicode:false}];
const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const ascii=(rows:readonly (readonly {text:string}[])[])=>rows.every(row=>/^[\x20-\x7e]*$/u.test(text(row)));
const parts=[{value:30,color:'s1'},{value:50,color:'s2'},{value:20,color:'s3'}];
const week=[1,3,0,7,5,2,4];

const charts:Array<[string,(mode:ChartMode)=>{rows:readonly (readonly {text:string;roles:readonly string[]}[])[];width:number}]>=[
  ['bar',mode=>({rows:[bar(37,100,20,{},mode)],width:20})],
  ['stack',mode=>({rows:[stack(parts,24,{},mode)],width:24})],
  ['sparkline',mode=>({rows:[[sparkline(week,{},mode)]],width:7})],
  ['columns',mode=>({rows:columns(week,4,{},mode),width:21})],
  ['stacked columns',mode=>({rows:stackedColumns([parts,parts],4,{},mode),width:6})],
  ['braille line',mode=>({rows:brailleLine(week,30,4,{},mode),width:30})],
  ['squares',mode=>({rows:squares(parts,100,{cols:10,rows:3},mode),width:20})],
  ['calendar',mode=>({rows:calendar(week,1,{dayLabels:false,heat:()=>'#112233'},mode),width:2})],
  ['time band',mode=>({rows:[timeBand(0.25,0.61,16,{},mode)],width:16})],
];

for(const [name,draw] of charts)test(`${name}: exactly its width in every mode, ASCII without Unicode`,()=>{
  for(const mode of MODES){
    const {rows,width}=draw(mode);
    assert.ok(rows.length>0);
    for(const row of rows)assert.equal(displayWidth(text(row)),width,`${JSON.stringify(mode)}: ${text(row)}`);
    if(!mode.unicode)assert.ok(ascii(rows),`${name} is not ASCII: ${rows.map(text).join('|')}`);
    if(!mode.color)assert.ok(rows.every(row=>row.every(segment=>!segment.roles.some(role=>/^[fg]:/u.test(role)))),'no colour role without colour');
  }
});

test('a bar ends in an eighth, on its track',()=>{
  assert.equal(text(bar(50,100,4)),'██  ');
  assert.equal(text(bar(1,16,4)).trimEnd(),'▎');
  assert.equal(text(bar(0,100,4)),'    ');
  assert.equal(text(bar(200,100,4)),'████','never past the track');
  assert.deepEqual(bar(50,100,4)[0]!.roles,['f:accent','g:border']);
});

test('without colour a stack tells its series by density, and the rest is free',()=>{
  const mono={color:false,unicode:true};
  assert.equal(text(stack([{value:5,color:'s1'},{value:5,color:'s2'}],10,{},mono)),'█████▓▓▓▓▓');
  assert.equal(text(stack([{value:5,color:'s1'}],10,{total:10},mono)),'█████·····');
});

test('at a border a stack carries two colours in one cell',()=>{
  const row=stack([{value:1,color:'s1'},{value:1,color:'s2'}],3);
  const border=row[1]!;
  assert.deepEqual(border.roles,['f:s1','g:s2']);
});

test('a sparkline starts at its floor and reaches its top',()=>{
  assert.equal(sparkline([0,4,8]).text,'▁▅█');
});

test('a selected column is marked, labels sit under it, and a column can carry a click',()=>{
  const rows=columns([2,4],2,{labels:['a','b'],selected:1,action:'day'});
  assert.equal(rows.length,3);
  assert.ok(rows[0]!.some(segment=>segment.roles.includes('f:warn')));
  assert.equal(rows[0]![2]!.action,'day:1');
  assert.deepEqual(rows[2]![1]!.roles,['acc','b']);
});

test('a line reaches the top at its peak, and a mark takes its own colour',()=>{
  const rows=brailleLine([0,10],4,2,{marks:[1]});
  assert.ok(rows[1]!.map(segment=>segment.text).join('').length===4);
  assert.ok(rows.flat().some(segment=>segment.roles.includes('warn')));
  assert.deepEqual(brailleLine([],4,2),[]);
});

test('squares count the share of the grid',()=>{
  const rows=squares([{value:50,color:'s1'}],100,{cols:4,rows:1});
  assert.equal(text(rows[0]!),'■ ■ · · ');
});

test('a calendar puts the heat in the background, an empty day on the band',()=>{
  const rows=calendar([0,5],1,{dayLabels:false,heat:level=>level===1?'#ff0000':'#000000'});
  assert.deepEqual(rows[0]![0]!.roles,['g:band']);
  assert.deepEqual(rows[1]![0]!.roles,['g:#ff0000']);
});

test('a legend keeps the name, the value and the share in their columns',()=>{
  assert.equal(displayWidth(text(legendRow('s1','Cached','12.4k','38%'))),30);
  assert.equal(legendRow('s2','Cached','12.4k','38%',30,{color:false,unicode:true})[0]!.text,'▒ ');
});

test('the f: and g: roles reach the theme, a series, a surface or a colour of its own',()=>{
  const {colors}=createTuiTheme({interactive:true,color:true,motion:true,unicode:true});
  assert.equal(roleStyle(['f:accent'],colors).color,colors.accent);
  assert.equal(roleStyle(['g:border'],colors).backgroundColor,colors.border);
  assert.equal(roleStyle(['f:s1','g:s2'],colors).backgroundColor,colors.s2);
  assert.equal(roleStyle(['g:#112233'],colors).backgroundColor,'#112233');
  assert.deepEqual(roleStyle(['f:s1','g:s2'],{}),{},'no colour, no style');
});
