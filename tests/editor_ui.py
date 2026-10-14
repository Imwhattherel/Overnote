"""Chromium integration checks for live Markdown, formatting, insertion and narrow windows."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
HTML=Path(__file__).resolve().parents[1]/'index.html'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':950,'height':650}); page.set_default_timeout(4000)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  print('before mock',flush=True);await page.evaluate('''
  const initial={tabs:[{id:'t1',title:'Notes',text:'Welcome here',color:'#f6e27a',reminders:[],preview:false,folderId:null,popped:false}],folders:[],active:'t1',settings:{opacity:1,tabWidth:120,fontSize:15,font:'clean',onTop:false,alarmVolume:.75,livePreview:true}};
  window.mock=initial;window.patches=[];
  window.api=new Proxy({load:async()=>structuredClone(initial),onRefresh:()=>{},onFocusMatch:()=>{},onDockHover:()=>{},displays:async()=>[{id:1,label:'Main'}],currentDisplay:async()=>1,
  getStartup:async()=>false,getAlarmSoundInfo:async()=>({custom:false}),getAlarmAudio:async()=>({src:null}),
  backupSettings:async()=>({target:'local',enabled:false}),listTrash:async()=>[],
  set:(k,v)=>{initial.settings[k]=v;},
  update:(id,patch)=>{Object.assign(initial.tabs.find(t=>t.id===id),patch);window.patches.push(patch)},
  setActive:()=>{},getReminder:()=>{},search:async()=>[],getPinned:()=>false,
  onResize:()=>{},getBackup:async()=>({})}, {get(obj,key){return key in obj?obj[key]:(...args)=>{console.log('MOCK',key,args);return Promise.resolve(null);}}}); void 0;
  ''')
  print('before content',flush=True);await page.set_content(HTML.read_text(encoding='utf8'),wait_until='domcontentloaded');print('after content',flush=True)
  print('STEP await page.locator(#text).',flush=True);await page.locator('#text').wait_for(state='visible')
  assert await page.locator('#editorBody').evaluate('(e)=>e.classList.contains("live")')
  assert await page.locator('#livePreview').locator('p').inner_text()=='Welcome here'
  print('STEP await page.locator(#text).',flush=True);await page.locator('#text').fill('**hello**\n- [ ] Buy milk')
  assert await page.locator('#livePreview b').inner_text()=='hello'
  await page.locator('#livePreview input[type=checkbox]').count()==1
  await page.locator('#livePreview input[type=checkbox]').check()
  assert '- [x] Buy milk' in await page.locator('#text').input_value()
  assert await page.locator('#livePreview input:checked').count()==1
  # Context menu preserves selection after focus goes to its buttons.
  await page.locator('#text').fill('alpha beta')
  await page.locator('#text').evaluate('(e)=>{e.focus();e.setSelectionRange(0,5)}')
  print('STEP await page.locator(#text).',flush=True);await page.locator('#text').click(button='right',position={'x':35,'y':15})
  assert await page.locator('#menu .menu-section').count()==2
  print('STEP await page.locator(#menu bu',flush=True);await page.locator('#menu button').filter(has_text='Bold').click()
  assert await page.locator('#text').input_value()=='**alpha** beta'
  assert await page.locator('#livePreview b').inner_text()=='alpha'
  # Right click underline
  await page.locator('#text').evaluate('(e)=>{e.focus();e.setSelectionRange(2,7)}')
  print('STEP await page.locator(#text).',flush=True);await page.locator('#text').click(button='right',position={'x':60,'y':15})
  print('STEP await page.locator(#menu bu',flush=True);await page.locator('#menu button').filter(has_text='Underline').click()
  assert await page.locator('#livePreview u').inner_text()=='alpha'
  # Direct insert menu: link and tables render, and we can undo insertion.
  await page.locator('#text').fill('One')
  await page.locator('#text').evaluate('(e)=>{e.focus();e.setSelectionRange(3,3)}')
  print('STEP await page.locator(#toolIns',flush=True);await page.locator('#toolInsert').click()
  await page.locator('#menu button').filter(has_text='Table').click()
  assert await page.locator('#livePreview table').count()==1
  assert await page.locator('#livePreview th').count()==2
  assert (await page.locator('#text').input_value()).startswith('One\n| Column 1')
  print('STEP await page.locator(#toolIns',flush=True);await page.locator('#toolInsert').click()
  await page.locator('#menu button').filter(has_text='Link').click()
  assert 'https://example.com' in await page.locator('#text').input_value()
  # Toggle stored setting and show standard preview
  await page.locator('#liveToggle').click()
  assert await page.locator('#editorBody').evaluate('(e)=>e.classList.contains("live")') is False
  assert await page.evaluate('window.mock.settings.livePreview') is False
  await page.locator('#liveToggle').click()
  assert await page.evaluate('window.mock.settings.livePreview') is True
  print('STEP await page.locator(#eye).c',flush=True);await page.locator('#eye').click()
  assert await page.locator('#view').is_visible()
  assert not await page.locator('#editingTools').is_visible()
  print('STEP await page.locator(#eye).c',flush=True);await page.locator('#eye').click()
  assert await page.locator('#editingTools').is_visible()
  assert not errors,errors
  await page.locator('#text').fill('# Project notes\n**Live formatting** and ++underline++\n\n- [ ] Ship update\n- [x] Run tests\n\n| Task | Status |\n| --- | --- |\n| Editor | Ready |')
  # Responsive sizes: toolbars stay inside boundaries, neither source nor live output has zero height
  for w,h in [(340,420),(650,397),(950,650),(270,250)]:
   await page.set_viewport_size({'width':w,'height':h})
   assert await page.locator('#text').evaluate('(e)=>e.getBoundingClientRect().height')>40,(w,h)
   assert await page.locator('#livePreview').evaluate('(e)=>e.getBoundingClientRect().height')>35,(w,h)
   assert not await page.locator('#editorArea').evaluate('(e)=>e.getBoundingClientRect().right>innerWidth+1'),(w,h)
   if w==650:
    await page.screenshot(path='/mnt/data/preview-editor-205.png')
  assert not errors,errors
  print('Editor UI passed: live Markdown, checklists, selection-safe right-click formatting, underline, table, link, preview mode, persistence, 4 responsive sizes')
  await browser.close()
asyncio.run(main())
