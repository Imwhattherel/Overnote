"""Browser-based checks for theme, lock screen, pasted-image preview, import controls."""
import asyncio,base64
from pathlib import Path
from playwright.async_api import async_playwright
APP=Path(__file__).resolve().parents[1]/'index.html'
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==')
async def run():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await b.new_page(viewport={'width':520,'height':620});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  print('about to eval mock',flush=True); await page.evaluate('''
  window.notes={tabs:[{id:'t1',title:'Secret',text:'Normal body',color:'#f6e27a',preview:false,reminders:[]}],folders:[],active:'t1',settings:{theme:'light',checkUpdates:false,livePreview:true,opacity:1,fontSize:15,font:'clean',tabWidth:110,onTop:false,alarmVolume:.75}};
  window.api=new Proxy({load:async()=>structuredClone(notes),onRefresh:()=>{},onFocusMatch:()=>{},onDockHover:()=>{},setActive:()=>{},displays:async()=>[{id:1,label:'Main'}],currentDisplay:async()=>1,
   getStartup:async()=>false,getAlarmSoundInfo:async()=>({custom:false}),listTrash:async()=>[],backupSettings:async()=>({target:'local',enabled:false}),
   set:(k,v)=>{notes.settings[k]=v},update:(id,patch)=>Object.assign(notes.tabs[0],patch),
   lockNote:async(id,password)=>{notes.tabs[0].vault={v:1,ct:'encrypted'};notes.tabs[0].text='';notes.tabs[0].unlocked=false;return {ok:true}},
   unlockNote:async(id,password)=>{if(password!=='SecretPassword')return {ok:false,error:'Wrong password'};notes.tabs[0].unlocked=true;notes.tabs[0].text='Normal body';return {ok:true}},
   relockNote:async()=>{notes.tabs[0].unlocked=false;notes.tabs[0].text='';return true},
   removeNoteLock:async()=>({ok:true}),checkVersion:async()=>({ok:false,error:'No release'})
  },{get:(obj,key)=>key in obj?obj[key]:(...args)=>Promise.resolve(null)}); void 0;
  ''')
  print('loading html',flush=True);await page.set_content(APP.read_text(encoding='utf8'));await page.wait_for_selector('#text');print('loaded',flush=True)
  assert await page.locator('#text').is_visible()
  print('gear',flush=True);await page.locator('#gear').click()
  await page.locator('#theme').select_option('dark')
  assert await page.evaluate('document.documentElement.dataset.theme')=='dark'
  await page.locator('#theme').select_option('light')
  assert await page.evaluate('document.documentElement.dataset.theme')=='light'
  await page.locator('#gear').click()
  print('lock button',flush=True);await page.locator('#lockNote').click()
  assert await page.locator('#passwordModal').is_visible()
  await page.locator('#passwordValue').fill('SecretPassword')
  print('submit',flush=True);await page.locator('#passwordSubmit').click()
  assert await page.locator('#lockedScreen').is_visible()
  assert not await page.locator('#text').is_visible()
  await page.locator('#unlockHere').click()
  await page.locator('#passwordValue').fill('WrongPassword')
  await page.locator('#passwordSubmit').click()
  assert await page.locator('#passwordModal').is_visible()
  await page.locator('#passwordValue').fill('SecretPassword')
  await page.locator('#passwordSubmit').click()
  assert not await page.locator('#lockedScreen').is_visible()
  assert await page.locator('#text').is_visible()
  print('image input',flush=True);await page.locator('#imageFileInput').set_input_files({'name':'hello.png','mimeType':'image/png','buffer':PNG})
  await page.wait_for_timeout(200)
  assert '![' in await page.locator('#text').input_value()
  assert await page.locator('#livePreview img').count()==1
  assert (await page.locator('#livePreview img').get_attribute('src')).startswith('data:image/png;base64,')
  await page.locator('#gear').click()
  assert 'Overnote' in await page.locator('#panel').inner_text()
  assert not errors,errors
  print('Advanced UI passed: light/dark theme, lock, wrong password, unlock, image file import and live preview.')
  await b.close()
asyncio.run(run())
