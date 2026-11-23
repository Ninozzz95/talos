/*
 * D1 and D2 of the redesign, on the real app: at the smallest window a card keeps its title, the selected choice and the footer. With
 * TALOS_FRAMES_TEXT set, the frames are written there for the review.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {after,test} from 'node:test';
import {hermeticProfile,mountApp,sleep,type Screen} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const frames:string[]=[];
const keep=(label:string,screen:Screen)=>{frames.push(`${label}\n${screen.lines.join('\n')}\n`);};
after(()=>{if(process.env.TALOS_FRAMES_TEXT)writeFileSync(process.env.TALOS_FRAMES_TEXT,frames.join('\n'));});
const options=Array.from({length:8},(_,index)=>({label:`Option number ${index+1}`,description:`What option ${index+1} does`}));

for(const [cols,rows] of [[40,12],[80,24]] as const)test(`the permission card at ${cols}×${rows}: the title, the choices and the footer`,async()=>{
  const app=await mountApp({cols,rows,root:env.root,paths:env.paths});
  try{
    await app.settle();
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',{requestId:'q1',azione:{tipo:'comando',comando:'npm test'}});
    const screen=await app.waitFor('the card',s=>/Permission/u.test(s.text));await sleep(60);
    const shown=await app.screen();keep(`permission card ${cols}×${rows}`,shown);
    assert.match(screen.text,/^│ ╭─ Permission/mu);
    assert.match(shown.text,/\[1\] Allow once|\[1\]/u);assert.match(shown.text,/Deny/u);
    assert.match(shown.text,/ctx /u,'the context stays under the card');
  }finally{app.unmount();await sleep(50);}
});

test('a tall question at 40×12: the selected option stays in view as it moves',async()=>{
  const app=await mountApp({cols:40,rows:12,root:env.root,paths:env.paths});
  try{
    await app.settle();
    app.emit('run.started',{runId:'r1'});
    app.emit('question.required',{requestId:'q1',questions:[{id:'one',header:'Pick',question:'Which one do you want to keep?',options}]});
    await app.waitFor('the card',s=>/Option number 1/u.test(s.text));await sleep(700);
    for(let step=1;step<8;step+=1){app.press('\u001b[B');await sleep(40);}
    const shown=await app.waitFor('the last option selected',s=>/› 8. Option number 8/u.test(s.text));
    keep('question card cut at 40×12, the last option selected',shown);
    assert.match(shown.text,/ctx /u,'the context stays under the card');
  }finally{app.unmount();await sleep(50);}
});
