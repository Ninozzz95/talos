"""Exact standalone HTML injected into Chromium; no Electron or real provider tests."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, time, argparse, hashlib, traceback, os
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'TALOS-Calm-Lab.html').read_text()
ERRORS=[]; REQUESTS=[]; RESULTS=[]
def new(b,width=1600,hash=''):
    p=b.new_page(viewport={'width':width,'height':1100},color_scheme='dark');p.set_default_timeout(3000)
    p.on('pageerror',lambda e:ERRORS.append(str(e)))
    p.on('request',lambda r:REQUESTS.append(r.url))
    if hash:p.evaluate('(h)=>history.replaceState(null,"",h)',hash)
    p.set_content(HTML,wait_until='domcontentloaded')
    expect(p.locator('#page-title')).to_be_visible()
    return p

def act(p,key,extra=''):return p.locator(f'[data-action="{key}"]{extra}')
def model(p,id):return act(p,'select-model',f'[data-model="{id}"]')
def ids(p):return p.locator('[data-catalog-model]').evaluate_all('(els)=>els.map(e=>e.dataset.catalogModel)')
def expand(p):
    if p.locator('#catalog-expand').get_attribute('aria-expanded')=='false':p.locator('#catalog-expand').click()
def proxy(source):return source.locator('xpath=following-sibling::*[1]').locator('[role="combobox"],[role="checkbox"],[role="switch"],[role="slider"]').first
def select(source,value):
    index=source.evaluate('(s,v)=>Array.from(s.options).findIndex(o=>o.value===v)',value)
    assert index>=0,value
    c=proxy(source);c.focus();c.press('Home')
    for _ in range(index):c.press('ArrowDown')
    c.press('Enter')
def checked(source):
    if not source.is_checked():proxy(source).click()
def check(p,key,value):checked(p.locator(f'[data-catalog-check="{key}"][value="{value}"]'))
def num(p,key,value):
    el=p.locator('#n-'+key);el.fill(value);el.press('Tab')
def reset(p):
    if act(p,'reset-filter').count():act(p,'reset-filter').first.click()

def primary(b):
    p=new(b);expect(p.locator('.model-row')).to_have_count(15)
    expect(p.locator('.active-facet')).to_have_count(0)
    p.locator('#quick-destination-local').click();expect(p.locator('.model-row')).to_have_count(12)
    select(p.locator('#size-filter'),'tiny');assert ids(p)==['fixture:nano','fixture:small','fixture:embed']
    select(p.locator('#context-filter'),'32768');assert ids(p)==['fixture:small']
    expect(p.locator('#catalog-live')).to_contain_text('1 modello')
    expect(p.locator('.setup-name')).to_contain_text('Qwen3 8B')
    reset(p);expect(p.locator('.model-row')).to_have_count(15)
    p.close()

def independent(b):
    p=new(b);p.locator('#quick-status-installed').click();p.locator('#quick-favorites').click()
    assert ids(p)==['local:qwen8']
    act(p,'catalog-remove','[data-key="favorite"]').click();assert ids(p)==['local:qwen8','local:gemma']
    expect(p.locator('#quick-status-installed')).to_have_attribute('aria-pressed','true')
    p.close()

def ranges(b):
    p=new(b);expand(p);num(p,'minParams','3');num(p,'maxParams','8.2')
    assert ids(p)==['local:qwen8','fixture:small','fixture:coder']
    expect(p.locator('#size-filter')).to_have_value('custom')
    num(p,'minParams','32');expect(p.locator('[role="alert"]')).to_contain_text('minimo')
    assert not ids(p)
    num(p,'maxParams','40');assert ids(p)==['local:qwen32']
    select(p.locator('#size-filter'),'tiny');expect(p.locator('#n-minParams')).to_have_value('')
    check(p,'sizes','small');assert set(ids(p))=={'fixture:nano','fixture:small','fixture:embed','fixture:coder'}
    expect(p.locator('#size-filter')).to_have_value('multi');p.close()

def moe(b):
    p=new(b);expand(p);select(p.locator('#size-filter'),'tiny');check(p,'arch','moe');assert not ids(p)
    select(p.locator('#parameter-basis'),'active');assert ids(p)==['fixture:moe']
    expect(p.locator('.row-capacity strong')).to_have_text('3B')
    select(p.locator('#fit-filter'),'fits');assert not ids(p)
    act(p,'catalog-remove','[data-key="fit"]').first.click();model(p,'fixture:moe').click()
    expect(p.locator('#page-title')).to_have_text('Atlas MoE 30B-A3B · demo')
    expect(p.locator('#model-detail-panel')).to_contain_text('30B')
    expect(p.locator('#model-detail-panel')).to_contain_text('Modello fittizio')
    expect(p.locator('.model-page a[href*="huggingface"]')).to_have_count(0);p.close()

def technical(b):
    p=new(b);expand(p);check(p,'quant','Q5_K_M');check(p,'tasks','code');check(p,'capabilities','tools')
    assert ids(p)==['fixture:coder']
    num(p,'maxFile','4');assert not ids(p);num(p,'maxFile','5');assert ids(p)==['fixture:coder']
    num(p,'maxRam','7');assert not ids(p);num(p,'maxRam','8');assert ids(p)==['fixture:coder']
    check(p,'languages','it');assert not ids(p)
    act(p,'catalog-remove','[data-key="languages"]').first.click();assert ids(p)==['fixture:coder']
    check(p,'licenses','MIT');check(p,'access','open');assert ids(p)==['fixture:coder']
    p.close()

def missing(b):
    p=new(b);select(p.locator('#size-filter'),'unknown');assert len(ids(p))==4
    model(p,'fixture:unknown').click();expect(p.locator('#model-primary-action')).to_be_disabled()
    act(p,'model-detail-tab','[data-value="compatibility"]').click();expect(p.locator('.memory-wide')).to_contain_text('Non nota')
    expect(p.locator('.memory-wide')).not_to_contain_text('rientra nel budget')
    act(p,'back-catalog').click();reset(p);expand(p);num(p,'maxParams','1');assert len(ids(p))==2
    checked(p.locator('#include-unknown'));assert len(ids(p))==6
    num(p,'maxFile','3');assert set(ids(p))=={'fixture:nano','fixture:embed','fixture:unknown'}
    p.close()

def recovery(b):
    p=new(b);p.locator('#quick-destination-cloud').click();select(p.locator('#size-filter'),'tiny')
    assert not ids(p);expect(p.locator('.catalog-empty')).to_be_visible()
    expect(p.locator('.recovery-options button')).to_have_count(2)
    act(p,'catalog-remove','[data-key="sizes"]').last.click()
    assert len(ids(p))==3;expect(p.locator('#quick-destination-cloud')).to_have_attribute('aria-pressed','true')
    p.screenshot(path=str(ROOT/'evidence/05-cloud.png'));p.close()

def order(b):
    p=new(b);select(p.locator('#catalog-sort'),'params-asc');assert ids(p)[0]=='fixture:embed'
    assert len(p.locator('.list-group-label').all_text_contents())==0
    select(p.locator('#catalog-sort'),'params-desc');assert ids(p)[0]=='fixture:xl'
    assert set(ids(p)[-4:])=={'fixture:unknown','openrouter:aion2','openrouter:aionmini','fixture:cloud'}
    select(p.locator('#catalog-sort'),'price-asc');assert ids(p)[0]=='fixture:cloud'
    expect(p.locator('.model-meta').first).to_contain_text('0,25') # Prezzo non arrotondato al decimo.
    p.close()

def routing(b):
    p=new(b);p.locator('#model-query').fill('Qwen');select(p.locator('#size-filter'),'medium');select(p.locator('#catalog-sort'),'params-desc')
    expected_hash=p.evaluate('location.hash');model(p,'local:qwen8').focus();scroll=p.locator('#main').evaluate('e=>e.scrollTop')
    model(p,'local:qwen8').click();expect(p.locator('.readme-surface')).to_be_visible();expect(p.locator('.model-row')).to_have_count(0)
    act(p,'back-catalog').click();expect(p.locator('#size-filter')).to_have_value('medium');expect(p.locator('#model-query')).to_have_value('Qwen')
    expect(model(p,'local:qwen8')).to_be_focused();assert abs(p.locator('#main').evaluate('e=>e.scrollTop')-scroll)<3
    p.evaluate('history.forward()');expect(p.locator('#page-title')).to_have_text('Qwen3 8B')
    p.evaluate('history.back()');expect(p.locator('#model-query')).to_have_value('Qwen')
    p2=new(b,hash=expected_hash);expect(p2.locator('#size-filter')).to_have_value('medium');assert ids(p2)==['local:qwen8']
    p.close();p2.close()

def views(b):
    p=new(b);select(p.locator('#size-filter'),'tiny');p.locator('#save-catalog-view').click()
    expect(p.locator('#view-name')).to_be_focused();expect(p.locator('#confirm-save-view')).to_be_disabled()
    p.locator('#view-name').fill('Piccoli locali');p.locator('#confirm-save-view').click()
    expect(p.locator('#saved-view-select option')).to_have_count(2)
    expect(p.locator('.storage-warning')).to_be_visible() # opaque browser origin: no persistence claim
    reset(p);select(p.locator('#saved-view-select'),'view-0');expect(p.locator('#size-filter')).to_have_value('tiny');assert len(ids(p))==3
    p.locator('#save-catalog-view').click();p.locator('#view-name').fill('Piccoli locali');expect(p.locator('#confirm-save-view')).to_be_disabled()
    p.keyboard.press('Escape');p.locator('#manage-catalog-views').click();act(p,'catalog-delete-view').click()
    expect(p.locator('#saved-view-select option')).to_have_count(1);act(p,'undo').click();expect(p.locator('#saved-view-select option')).to_have_count(2)
    p.close()

def keyboard(b):
    p=new(b);p.locator('#catalog-expand').focus();p.keyboard.press('Enter');expect(p.locator('#catalog-expand')).to_have_attribute('aria-expanded','true')
    cb=p.locator('[data-catalog-check="tasks"][value="code"]');proxy(cb).focus();p.keyboard.press('Space');expect(cb).to_be_checked();expect(proxy(cb)).to_be_focused()
    p.locator('#model-query').fill('Atlas');expect(p.locator('#model-query')).to_be_focused()
    p.keyboard.press('Control+k');expect(p.locator('#settings-query')).to_be_focused();p.keyboard.press('Escape');expect(p.locator('#model-query')).to_be_focused()
    labels=p.locator('.catalog-discovery input,.catalog-discovery select').evaluate_all("es=>es.filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')).map(e=>e.id)")
    assert labels==[],labels
    p.locator('#model-query').evaluate("e=>e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))")
    p.locator('#model-query').fill('Archivio')
    p.locator('#model-query').evaluate("e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))")
    expect(p.locator('#model-query')).to_have_value('Archivio');expect(p.locator('#model-query')).to_be_focused()
    p.close()

def price(b):
    p=new(b);expand(p);num(p,'maxInput','0.5');num(p,'maxOutput','2');assert ids(p)==['fixture:cloud']
    num(p,'maxInput','0');assert not ids(p)
    checked(p.locator('#include-unknown'));assert ids(p)==['openrouter:aion2','openrouter:aionmini']
    p.close()

def regressions(b):
    p=new(b);model(p,'local:gemma').click();act(p,'set-default').click();p.keyboard.press('Escape')
    act(p,'back-catalog').click();expect(p.locator('.setup-name')).to_contain_text('Qwen3 8B')
    model(p,'openrouter:aion2').click();act(p,'set-default').click();expect(p.locator('#confirm-default')).to_be_disabled()
    checked(p.locator('#cloud-consent'));p.locator('#confirm-default').click();act(p,'back-catalog').click()
    expect(p.locator('.setup-name')).to_contain_text('Aion-2.0')
    checked(p.locator('[data-compare="local:qwen8"]'));checked(p.locator('[data-compare="local:gemma"]'));act(p,'compare').click();expect(p.locator('.comparison-table tbody tr')).to_have_count(9)
    p.keyboard.press('Escape');act(p,'navigate','[data-value="appearance"]').click();p.locator('#quick-theme').click()
    expect(p.locator('html')).to_have_attribute('data-mode','light');select(p.locator('#uiDensitySelect'),'compatta')
    expect(p.locator('html')).to_have_attribute('data-density','compact');p.close()

def scenario_and_download(b):
    p=new(b);select(p.locator('#size-filter'),'large');select(p.locator('#scenario-select'),'offline');expect(p.locator('#size-filter')).to_have_value('large')
    model(p,'local:qwen32').click();act(p,'download-model').click();expect(p.locator('.download-card')).to_contain_text('rete assente')
    select(p.locator('#scenario-select'),'ready');act(p,'download-resume').click();p.wait_for_timeout(600);act(p,'download-pause').click()
    before=p.locator('progress').get_attribute('value');p.wait_for_timeout(550);assert p.locator('progress').get_attribute('value')==before
    act(p,'download-resume').click();p.wait_for_timeout(6500);expect(p.locator('.download-card')).to_contain_text('Completato')
    act(p,'show-downloaded').click();expect(p.locator('#model-primary-action')).to_be_disabled();expect(p.locator('.action-reason')).to_contain_text('budget RAM')
    p.close()

def performance_and_responsive(b):
    dimensions=[]
    for w in [320,390,768,1024,1600]:
      p=new(b,w)
      for theme in ['dark','light']:
        if theme=='light':p.locator('#quick-theme').click()
        for expanded in [False,True]:
          if (p.locator('#catalog-expand').get_attribute('aria-expanded')=='true')!=expanded:p.locator('#catalog-expand').click()
          d=p.evaluate('({w:innerWidth,sw:document.documentElement.scrollWidth,m:document.querySelector("#main").clientWidth,ms:document.querySelector("#main").scrollWidth})')
          assert d['sw']<=d['w']+1 and d['ms']<=d['m']+1,(w,theme,expanded,d)
          dimensions.append({'width':w,'theme':theme,'expanded':expanded,**d})
          if w==390 and expanded and theme=='dark':p.locator('#main').evaluate('e=>e.scrollTop=500');p.screenshot(path=str(ROOT/'evidence/04-filtri-mobile.png'))
      p.close()
    (ROOT/'evidence/responsive03.json').write_text(json.dumps(dimensions,indent=2))

def all_model_pages(b):
    p=new(b)
    all_ids=ids(p)
    for id in all_ids:
        model(p,id).click()
        expect(p.locator('.model-page')).to_be_visible()
        expect(p.locator('.model-row')).to_have_count(0)
        for tab in ['files','compatibility','card']:
            act(p,'model-detail-tab',f'[data-value="{tab}"]').click()
            expect(p.locator('#model-detail-panel')).to_be_visible()
            assert 'undefined' not in p.locator('#model-detail-panel').inner_text(),id
        act(p,'back-catalog').click()
        expect(p.locator('.model-row')).to_have_count(15)
    p.close()

def stale_history(b):
    p=new(b)
    select(p.locator('#size-filter'),'medium');model(p,'local:qwen8').click();act(p,'back-catalog').click()
    select(p.locator('#size-filter'),'tiny')
    data=p.evaluate('({hash:location.hash,meta:history.state})')
    second=b.new_page(viewport={'width':1600,'height':1100},color_scheme='dark');second.set_default_timeout(3000)
    second.on('pageerror',lambda e:ERRORS.append(str(e)))
    second.on('request',lambda r:REQUESTS.append(r.url))
    second.evaluate('(d)=>history.replaceState(d.meta,"",d.hash)',data)
    second.set_content(HTML,wait_until='domcontentloaded')
    expect(second.locator('#size-filter')).to_have_value('tiny')
    assert set(ids(second))=={'fixture:nano','fixture:small','fixture:embed'}
    p.close();second.close()

TESTS={'all-model-pages':all_model_pages,'stale-history':stale_history,'primary':primary,'independent':independent,'ranges':ranges,'moe':moe,'technical':technical,'missing':missing,'recovery':recovery,'order':order,'routing':routing,'views':views,'keyboard':keyboard,'price':price,'regressions':regressions,'scenario-download':scenario_and_download,'responsive':performance_and_responsive}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--only',default=','.join(TESTS));parser.add_argument('--label',default='final');args=parser.parse_args()
 with sync_playwright() as play:
  browser=play.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  for name in args.only.split(','):
   t=time.monotonic()
   try:TESTS[name](browser);RESULTS.append({'test':name,'status':'pass','seconds':round(time.monotonic()-t,3)});print('PASS',name,flush=True)
   except Exception as e:RESULTS.append({'test':name,'status':'fail','error':str(e),'trace':traceback.format_exc(),'seconds':round(time.monotonic()-t,3)});print('FAIL',name,str(e)[:350],flush=True)
  browser.close()
 report={'results':RESULTS,'pageerrors':ERRORS,'requests':REQUESTS,'html_sha256':hashlib.sha256(HTML.encode()).hexdigest(),'method':'Exact HTML via set_content in Chromium; opaque origin; localStorage unavailable.'}
 (ROOT/'evidence'/f'browser03-{args.label}.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
 raise SystemExit(1 if ERRORS or any(r['status']=='fail' for r in RESULTS) else 0)
