import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
APP=Path(__file__).resolve().parents[1]/'index.html'
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':680,'height':750})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.evaluate('''
  window.sample={tabs:[{id:'t1',title:'Shopping',text:'Milk\\nBread\\n- [x] Eggs',color:'#f6e27a',pinned:false,preview:false,reminders:[]},{id:'t2',title:'Second',text:'Other',color:'#a8e6b8',pinned:false,preview:false,reminders:[]}],folders:[{id:'f1',name:'Jobs',color:null,collapsed:false}],settings:{favoriteColors:[],font:'clean',fontSize:15,tabWidth:120,opacity:1,onTop:true,alarmVolume:.75},active:'t1',trash:[]};
  window.api={load:async()=>structuredClone(window.sample),onRefresh:()=>{},displays:async()=>[{id:1,label:'Main'}],currentDisplay:async()=>1,getStartup:async()=>false,
  onDockHover:()=>{},onFocusMatch:()=>{},setActive:id=>(window.sample.active=id),
  update:(id,patch)=>Object.assign(window.sample.tabs.find(n=>n.id===id),patch),
  set:()=>{},getAlarmSoundInfo:async()=>({custom:false}),listTrash:async()=>[],backupSettings:async()=>({target:'local',enabled:false}),
  favoriteColor:async(c,add)=>{let l=window.sample.settings.favoriteColors;window.sample.settings.favoriteColors=add?[...new Set([...l,c])]:l.filter(x=>x!==c);return {ok:true,colors:window.sample.settings.favoriteColors}},
  pinNote:async(id, pin)=>{window.sample.tabs.find(n=>n.id===id).pinned=pin;return pin},
  folderColor:async(id,c)=>{window.sample.folders.find(f=>f.id===id).color=c;return true},
  search:async()=>[],setReminder:async()=>({ok:true}), getAlarmAudio:async()=>({src:null}),
  backupNow:async()=>({ok:true}),
  }
  ''')
  await page.set_content(APP.read_text(encoding='utf-8'))
  await page.wait_for_selector('.tab')
  # Bulk line conversion with selection.
  await page.locator('#text').evaluate('(e)=>{e.focus();e.setSelectionRange(0,10)}')
  await page.locator('#checklist').click()
  note=await page.locator('#text').input_value()
  assert note=='- [ ] Milk\n- [ ] Bread\n- [x] Eggs',repr(note)
  await page.locator('#eye').click()
  assert await page.locator('#view input[type=checkbox]').count()==3
  await page.locator('#view input[type=checkbox]').first.check()
  await page.wait_for_timeout(260)
  assert await page.locator('#view input[type=checkbox]').first.is_checked()
  assert (await page.evaluate('sample.tabs[0].text')).startswith('- [x] Milk')
  await page.locator('#eye').click()
  # convert selected checklist lines back to regular markdown bullets
  await page.locator('#text').evaluate('(e)=>{e.focus();e.setSelectionRange(0, e.value.length)}')
  await page.locator('#checklist').click()
  assert await page.locator('#text').input_value()=='- Milk\n- Bread\n- Eggs'
  # Color presets, picker and favorites
  await page.locator('.tab[data-id=t1]').click(button='right')
  picker=page.locator('#menu input[type=color]')
  await picker.fill('#123456')
  await page.locator('#menu .color-tools button').filter(has_text='★ Save').click()
  assert (await page.evaluate('sample.settings.favoriteColors'))==['#123456']
  await page.locator('.tab[data-id=t1]').click(button='right')
  assert await page.locator('#menu [aria-label="Use favorite #123456"]').count()==1
  await page.locator('#menu [aria-label="Use favorite #123456"]').click()
  assert (await page.evaluate('sample.tabs[0].color'))=='#123456'
  await page.locator('.folder-head').filter(has_text='Jobs').click(button='right')
  await page.locator('#menu [aria-label="Use favorite #123456"]').click()
  assert (await page.evaluate('sample.folders[0].color'))=='#123456'
  await page.locator('.tab[data-id=t1]').click(button='right')
  await page.locator('#menu button').filter(has_text='Pin note (when popped out)').click()
  assert (await page.evaluate('sample.tabs[0].pinned')) is True
  await page.locator('#gear').click()
  assert await page.locator('#favoriteSettings button').count()==1
  await page.locator('#favoriteSettings button').click()
  assert (await page.evaluate('sample.settings.favoriteColors'))==[]
  assert not errors,errors
  # Detached note-only window pin icon
  detached=await browser.new_page(viewport={'width':320,'height':500})
  await detached.evaluate('''const Params=window.URLSearchParams;window.URLSearchParams=class extends Params{get(k){return k==='note'?'t2':super.get(k);}};window.sample={tabs:[{id:'t2',title:'Pop',text:'A task',color:'#f7b8c6',preview:false,pinned:false,reminders:[]}],active:'t2',folders:[],settings:{favoriteColors:[],font:'clean',fontSize:15,tabWidth:120,opacity:1,onTop:true,alarmVolume:.75}};
  window.api={load:async()=>structuredClone(sample),onRefresh:()=>{},displays:async()=>[],currentDisplay:async()=>1,onDockHover:()=>{},onFocusMatch:()=>{},setActive:()=>{},update:(id,p)=>Object.assign(sample.tabs[0],p),set:()=>{},getAlarmSoundInfo:async()=>({}),pinNote:async(id,x)=>(sample.tabs[0].pinned=x),search:async()=>[],getAlarmAudio:async()=>({src:null})};''')
  await detached.set_content(APP.read_text(encoding='utf-8'))
  await detached.wait_for_selector('#pinNote')
  assert await detached.locator('#side').is_hidden()
  await detached.locator('#pinNote').click()
  assert await detached.locator('#pinNote').get_attribute('aria-pressed')=='true'
  assert await detached.evaluate('sample.tabs[0].pinned') is True
  await detached.locator('#pinNote').click()
  assert await detached.evaluate('sample.tabs[0].pinned') is False
  print('UI tests passed: multi-line checklist conversion, interactive preview checkboxes, favorite picker, note/folder custom colors, per-note pin, popup pin.')
  await browser.close()
asyncio.run(run())
