"""Custom component contracts in a browser; fixtures, NOT full TALOS integration."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, traceback, os
ROOT=Path(__file__).resolve().parents[1]
JS=(ROOT/'shared/calm-controls.js').read_text().replace('export ','')
CSS=(ROOT/'shared/calm-controls.css').read_text()
FIX='''<main id="settings"><form id="form"><label for="choice">Tema</label><select id="choice" required><option value="">Scegli</option><option value="a">Aurora</option><option disabled value="b">Bloccato</option><optgroup label="Off" disabled><option value="c">Carbon</option></optgroup><option value="d">Duna</option><option value="e">Éclair</option><option value="x">&lt;img src=x onerror=alert(1)&gt;</option></select><label for="check">Sfondo</label><input id="check" type="checkbox" role="switch"><label for="range">Intensità</label><input id="range" type="range" min="25" max="200" step="5" value="100"><button id="submit">Salva</button><button type="reset">Reset</button></form><div id="dynamic"></div><dialog id="modal"><div class="studio"><label for="inside">Modale</label><select id="inside"><option>A</option><option>B</option></select></div><button id="modal-close">Chiudi</button></dialog></main><aside id="outside"><button id="outside-button">Esterno</button><div id="transcript"></div></aside>'''
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':900,'height':800})
 errors=[];page.set_default_timeout(2000);page.on('pageerror',lambda e:errors.append(str(e)))
 def setup():
  page.evaluate('window.manager?.dispose()')
  page.set_content('<style>'+CSS+'</style>'+FIX+'<script>(()=>{'+JS+'\nwindow.events=[];document.querySelectorAll("input,select").forEach(s=>["input","change"].forEach(e=>s.addEventListener(e,()=>events.push([s.id,e,s.value,s.checked]))));window.manager=mountCalmControls(document,{scope:"#settings"});})();</script>')
  page.wait_for_timeout(15)
 def run(name,fn):
  setup()
  try:fn();results.append({'name':name,'status':'pass'})
  except Exception as e:results.append({'name':name,'status':'fail','error':str(e)});page.screenshot(path=str(ROOT/'evidence'/('failure-'+str(len(results))+'.png')))
 def val(id):return page.locator('#'+id).input_value()
 def keyboard():
  c=page.locator('#choice--calm');c.focus();c.press('End');assert val('choice')=='';c.press('Escape');assert val('choice')=='';c.press('Home');c.press('ArrowDown');c.press('ArrowDown');assert page.locator('[role=option].is-active').inner_text().startswith('Duna');c.press('Enter');assert val('choice')=='d';assert page.evaluate('events.map(e=>e[1])')==['input','change']
 run('keyboard preview/cancel/commit, disabled option/optgroup skip',keyboard)
 def typeahead():
  c=page.locator('#choice--calm');c.focus();c.press('e');assert page.locator('[role=option].is-active').inner_text().startswith('Éclair');c.press('Enter');assert val('choice')=='e'
 run('typeahead ignores diacritics',typeahead)
 def outside():
  c=page.locator('#choice--calm');c.click();c.press('End');page.mouse.click(880,780);assert val('choice')=='';assert page.get_by_role('listbox').count()==0;c.click();c.press('End');c.press('Tab');assert val('choice')=='';assert page.get_by_role('listbox').count()==0
 run('outside and Tab close without accidental choice',outside)
 def literal():
  page.locator('#choice--calm').click();assert page.locator('[data-calm-popup] img').count()==0;page.get_by_role('option',name='<img src=x onerror=alert(1)>',exact=True).click();assert val('choice')=='x'
 run('untrusted option label is inert text',literal)
 def dynamic():
  page.evaluate('choice.value="d"');page.wait_for_timeout(10);assert page.locator('#choice--calm').inner_text().startswith('Duna');page.locator('#choice--calm').click();page.evaluate('choice.add(new Option("Zefiro","z"))');page.wait_for_timeout(10);assert page.get_by_role('option',name='Zefiro',exact=True).count()==1;page.evaluate('choice.disabled=true');page.wait_for_timeout(10);assert page.locator('#choice--calm').is_disabled();assert page.get_by_role('listbox').count()==0
 run('programmatic values, inserted options and disabled state synchronize',dynamic)
 def switches():
  page.locator('label[for=check]').click();assert page.locator('#check').is_checked();assert page.locator('#check--calm').get_attribute('aria-checked')=='true';page.locator('#check--calm').press('Space');assert not page.locator('#check').is_checked();page.evaluate('check.indeterminate=true');page.wait_for_timeout(10);assert page.locator('#check--calm').get_attribute('aria-checked')=='mixed'
 run('label, keyboard and mixed checkbox state',switches)
 def ranges():
  r=page.locator('#range--calm');r.focus();r.press('End');assert val('range')=='200';r.press('ArrowRight');assert val('range')=='200';r.press('Home');assert val('range')=='25';r.press('PageUp');assert val('range')=='75';r.press('ArrowDown');assert val('range')=='70';assert r.get_attribute('aria-valuenow')=='70'
 run('slider bounds, Home/End/Page and original events',ranges)
 def pointer():
  r=page.locator('#range--calm');box=r.bounding_box();page.mouse.move(box['x']+box['width']*.25,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']*.75,box['y']+box['height']/2);page.mouse.up();assert 150<=float(val('range'))<=160;assert page.evaluate('events.filter(e=>e[0]==="range"&&e[1]==="change").length')==1
 run('slider pointer drag commits change once',pointer)
 def modal():
  page.evaluate('modal.showModal()');page.locator('#inside--calm').click();assert page.locator('dialog [role=listbox]').count()==1;page.keyboard.press('Escape');assert page.locator('#modal').evaluate('(d)=>d.open');assert page.get_by_role('listbox').count()==0;page.keyboard.press('Escape');assert not page.locator('#modal').evaluate('(d)=>d.open')
 run('popup belongs to dialog; first Escape does not close parent',modal)
 def invalid():
  page.locator('#submit').click();assert page.evaluate('document.activeElement.id')=='choice--calm';assert page.locator('#choice--calm').get_attribute('aria-invalid')=='true';assert page.get_by_role('alert').inner_text();page.locator('#choice--calm').press('End');page.locator('#choice--calm').press('Enter');assert page.locator('#choice--calm').get_attribute('aria-invalid') is None
 run('required hidden bridge validates on custom focus target',invalid)
 def resets():
  page.evaluate('choice.value="d";check.checked=true;document.getElementById("range").value=180;document.getElementById("form").reset()');page.wait_for_timeout(20);assert val('choice')=='';assert page.locator('#check--calm').get_attribute('aria-checked')=='false';assert page.locator('#range--calm').get_attribute('aria-valuenow')=='100'
 run('native form reset restores mirrored defaults',resets)
 def lifecycle():
  page.evaluate('window.oldControl=document.getElementById("check--calm");window.oldSource=check;check.remove()');page.wait_for_timeout(20);page.evaluate('oldControl.click()');assert not page.evaluate('oldSource.checked');assert page.locator('#check--calm').count()==0;page.evaluate('dynamic.innerHTML="<label for=added>Nuovo</label><select id=added><option>A</option></select>"');page.wait_for_timeout(20);assert page.locator('#added--calm').count()==1;page.evaluate('manager.dispose();manager.dispose()');assert page.locator('[data-calm-ui]').count()==0;assert page.locator('select:visible').count()==2;assert page.evaluate('Object.hasOwn(choice,"value")') is False
 run('dynamic mount/remove aborts handlers; idempotent dispose restores originals',lifecycle)
 def scope():
  page.evaluate('window.scans=0;const query=document.querySelectorAll.bind(document);document.querySelectorAll=function(s){scans++;return query(s)};for(let i=0;i<100;i++)transcript.textContent="token"+i');page.wait_for_timeout(30);assert page.evaluate('scans')==0
 run('unrelated streaming causes no control rescans',scope)
 def preview():
  page.evaluate('dynamic.innerHTML="<p id=caption>Scena</p>"');page.wait_for_timeout(15);page.evaluate('window.scans=0;const query=document.querySelectorAll.bind(document);document.querySelectorAll=function(s){scans++;return query(s)};for(let i=0;i<100;i++)caption.textContent="Frame"+i');page.wait_for_timeout(30);assert page.evaluate('scans')==0
 run('scene captions inside settings do not cause control rescans',preview)
 def clamped():
  page.set_viewport_size({'width':320,'height':600});page.locator('#choice--calm').click();box=page.get_by_role('listbox').bounding_box();assert box['x']>=0;assert box['x']+box['width']<=321;page.set_viewport_size({'width':900,'height':800})
 run('custom popup stays inside narrow viewport',clamped)
 def noLegacy():
  assert page.locator('select:visible,input[type=checkbox]:visible,input[type=range]:visible').count()==0;assert page.locator('[role=combobox]:visible').count()==1;assert page.locator('[role=slider]').count()==1
 run('no native picker visible; semantics retained',noLegacy)
 def hiddenSource():
  page.evaluate('choice.style.display="none"');page.wait_for_timeout(20);assert not page.locator('#choice--calm').is_visible();page.evaluate('choice.style.display=""');page.wait_for_timeout(20);assert page.locator('#choice--calm').is_visible()
 run('author-hidden source stays hidden through custom presentation',hiddenSource)
 (ROOT/'evidence/controls-browser.json').write_text(json.dumps({'tests':results,'pageerrors':errors},ensure_ascii=False,indent=2))
 print(json.dumps(results,ensure_ascii=False,indent=2));b.close()
 assert all(r['status']=='pass' for r in results), 'Browser contracts failed'
 assert not errors, errors
