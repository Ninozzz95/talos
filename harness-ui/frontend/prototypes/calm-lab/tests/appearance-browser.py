"""All current preference controls in the exact prototype. Storage is an explicit fixture."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'TALOS-Calm-Lab.html').read_text()
CONTRACT=json.loads((ROOT/'shared/theme-contract.mjs').read_text().split(' = ',1)[1].rstrip(';\n'))
FIELDS=CONTRACT['fields'];STUDIO={'themePreset','colorMode','backgroundMotion','sceneOverride','motionMode','motionQuality','motionSpeed','motionIntensity','motionGlow','motionDensity','motionDepth','motionTrails','motionContrast','motionParallax'}
results=[];errors=[];requests=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
 def new(saved=None,blocked=False):
  page=b.new_page(viewport={'width':1440,'height':1000},color_scheme='dark');page.set_default_timeout(3500)
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.evaluate('''({saved,blocked})=>{window.fixtureEntries=new Map(Object.entries(saved||{}));window.fixtureBlocked=blocked;Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>fixtureEntries.get(k)||null,setItem:(k,v)=>{if(fixtureBlocked)throw new DOMException('fixture quota','QuotaExceededError');fixtureEntries.set(k,v)}}});}''',{'saved':saved,'blocked':blocked})
  page.set_content(HTML,wait_until='domcontentloaded');return page
 page=new();page.locator('[data-action=navigate][data-value=appearance]').click()
 def studio(opened=True):
  active=page.locator('dialog[open]').count()>0
  if opened and not active:page.locator('[data-action=open-theme-studio]').click()
  if not opened and active:page.locator('dialog [data-action=close-modal]').last.click()
 def choose(id,value):
  index=page.locator('#'+id).evaluate('(s,v)=>[...s.options].findIndex(o=>o.value===v)',value)
  assert index>=0
  c=page.locator('#'+id+'--calm');c.focus();c.press('Home')
  for i in range(index):c.press('ArrowDown')
  c.press('Enter')
 def navigate(section):
  target=page.locator('[data-action=navigate][data-value='+section+']')
  if not target.is_visible():page.locator('[data-action=mobile-nav]').click()
  page.locator('[data-action=navigate][data-value='+section+']:visible').click()
 def stored():return page.evaluate('JSON.parse(fixtureEntries.get("talos.calm-lab.prototype.appearance.v4")).appearance')
 expected={}
 for f in FIELDS:
  try:
   studio(f['chiave'] in STUDIO)
   if f['gruppo']=='animazioni':page.locator('details.appearance-details').evaluate('(d)=>d.open=true')
   c=page.locator('#'+f['id']+'--calm')
   assert c.is_visible()
   if f['tipo']=='select':value=f['opzioni'][-1][0];choose(f['id'],value)
   elif f['tipo']=='checkbox':value=not page.locator('#'+f['id']).is_checked();c.click()
   else:value=f['max'];c.focus();c.press('End')
   # Default-valued select still needs a real choice to exercise persistence.
   if f['tipo']=='select' and not page.evaluate('fixtureEntries.has("talos.calm-lab.prototype.appearance.v4")'):
    choose(f['id'],f['opzioni'][0][0]);choose(f['id'],value)
   assert stored()[f['chiave']]==value
   expected[f['chiave']]=value
   results.append({'name':'control-'+f['chiave'],'status':'pass'})
  except Exception as e:results.append({'name':'control-'+f['chiave'],'status':'fail','error':str(e)})
 saved=page.evaluate('Object.fromEntries(fixtureEntries)');page.close();page=new(saved);page.locator('[data-action=navigate][data-value=appearance]').click()
 try:
  for f in FIELDS:
   studio(f['chiave'] in STUDIO)
   source=page.locator('#'+f['id'])
   actual=source.is_checked() if f['tipo']=='checkbox' else int(source.input_value()) if f['tipo']=='range' else source.input_value()
   assert actual==expected[f['chiave']],f['chiave']
  results.append({'name':'all-40-roundtrip-new-page-explicit-storage-fixture','status':'pass'})
 except Exception as e:results.append({'name':'all-40-roundtrip-new-page-explicit-storage-fixture','status':'fail','error':str(e)})
 # Every theme and color mode applies; actual scene renderer remains active unless reduced.
 page.close();page=new();page.locator('[data-action=navigate][data-value=appearance]').click();studio(True)
 for theme,name in next(f for f in FIELDS if f['chiave']=='themePreset')['opzioni']:
  try:
   page.locator('[data-theme-choice="'+theme+'"]').click()
   assert page.locator('html').get_attribute('data-talos-theme')==theme
   for mode in ['light','dark']:choose('colorModeSelect',mode);assert page.locator('html').get_attribute('data-mode')==mode
   results.append({'name':'theme-'+theme+'-dark-light','status':'pass'})
  except Exception as e:results.append({'name':'theme-'+theme+'-dark-light','status':'fail','error':str(e)})
 try:
  choose('themePresetSelect','aurora');page.locator('#backgroundMotionToggle--calm').click();page.wait_for_timeout(120);assert page.locator('dialog canvas').get_attribute('data-status')=='animated';page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(150);assert page.locator('dialog canvas').get_attribute('data-status')=='static';page.emulate_media(reduced_motion='no-preference');page.wait_for_timeout(120);assert page.locator('dialog canvas').get_attribute('data-status')=='animated';results.append({'name':'OS-motion-changes-live-no-reopen','status':'pass'})
 except Exception as e:results.append({'name':'OS-motion-changes-live-no-reopen','status':'fail','error':str(e)})
 try:
  choose('sceneOverrideSelect','paper');page.locator('dialog [data-action=reset-appearance-motion]').click();assert stored()['themePreset']=='aurora';assert stored()['backgroundMotion']==False;assert stored()['sceneOverride']=='follow-theme';results.append({'name':'motion-reset-preserves-selected-theme','status':'pass'})
 except Exception as e:results.append({'name':'motion-reset-preserves-selected-theme','status':'fail','error':str(e)})
 try:
  page.evaluate('fixtureBlocked=true');choose('themePresetSelect','paper');assert 'Non salvato' in page.locator('#appearance-save-status').inner_text();assert stored()['themePreset']=='aurora';assert page.locator('html').get_attribute('data-talos-theme')=='paper';results.append({'name':'quota-failure-is-visible-without-rolling-back-live-choice','status':'pass'})
 except Exception as e:results.append({'name':'quota-failure-is-visible-without-rolling-back-live-choice','status':'fail','error':str(e)})
 page.evaluate('fixtureBlocked=false');choose('themePresetSelect','calm');choose('colorModeSelect','dark');page.screenshot(path=str(ROOT/'evidence/04-theme-studio-dark.png'));studio(False);page.screenshot(path=str(ROOT/'evidence/04-appearance-dark.png'))
 (ROOT/'evidence/appearance-controls-first.json').write_text(json.dumps({'tests':results,'errors':errors},ensure_ascii=False,indent=2))
 responsive=[]
 for width in [320,390,768,1280,1920]:
  for mode in ['light','dark']:
   page.set_viewport_size({'width':width,'height':1000});studio(True);choose('colorModeSelect',mode);studio(False)
   for view in ['appearance','studio','catalog']:
    if view=='studio':studio(True)
    if view=='catalog':studio(False);navigate('models')
    dimensions=page.evaluate('''()=>[...document.querySelectorAll('html,body,#main,dialog[open]')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,width:e.clientWidth,scroll:e.scrollWidth}))''')
    responsive.append({'width':width,'mode':mode,'view':view,'overflow':[x for x in dimensions if x['scroll']>x['width']+1]})
    if view=='catalog':navigate('appearance')
 page.close();b.close()
report={'tests':results,'responsive':responsive,'errors':errors,'requests':requests,'storage':'explicit in-memory fixture, not disk persistence'}
(ROOT/'evidence/appearance-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'pass':sum(t['status']=='pass' for t in results),'fail':[t for t in results if t['status']!='pass'],'responsive':len(responsive),'overflow':[r for r in responsive if r['overflow']],'errors':errors,'requests':requests},ensure_ascii=False,indent=2))
assert all(t['status']=='pass' for t in results)
assert not any(r['overflow'] for r in responsive)
assert not errors
