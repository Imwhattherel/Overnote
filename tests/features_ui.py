import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
PAGE=Path(__file__).resolve().parents[1]/'index.html'
async def main():
 async with async_playwright() as p:
  browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':480,'height':740},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.evaluate('''
  const initial={tabs:[{id:'t1',title:'Today',text:'Buy milk',color:'#f6e27a',reminders:[],folderId:'f1'},{id:'t2',title:'Meeting',text:'Send agenda',color:'#a8e6b8',reminders:[],folderId:null}],folders:[{id:'f1',name:'Projects',collapsed:false,color:'#f7b8c6'}],trash:[],active:'t1',settings:{opacity:1,tabWidth:120,fontSize:15,font:'clean',onTop:true,alarmVolume:.75,main:{x:10,y:10,w:480,h:740}}};
  window.api={load:async()=>structuredClone(initial),onRefresh:()=>{},displays:async()=>[{id:1,label:'Main'}],currentDisplay:async()=>1,
  getStartup:async()=>false,getAlarmSoundInfo:async()=>({custom:false}),getAlarmAudio:async()=>({src:null}),
  backupSettings:async()=>({target:'local',enabled:false,localFolder:'C:/Users/me/OneDrive/Overnote',githubRepo:'someone/private',githubBranch:'main',githubDirectory:'overnote-backups',hasDiscord:true,hasGithub:true,lastAt:null,status:'',credentialStorageAvailable:true}),
  listTrash:async()=>[{id:'trash1',title:'Deleted meeting',folderName:'Projects',deletedAt:new Date().toISOString()}],
  configureBackup:async(x)=>({ok:true}),exportNotes:async(ids,r)=>{window.exported={ids,r};return {ok:true,count:ids.length}},
  importNotes:async()=>{window.importCount=(window.importCount||0)+1;initial.tabs.push({id:'import-'+window.importCount,title:'Shared note',text:'Hello!',color:'#f6e27a',reminders:[],folderId:null});initial.active='import-'+window.importCount;return {ok:true,count:1}},
  chooseBackupLocal:async()=>({ok:true,localFolder:'C:/Shared/Overnote'}),resetBackupLocal:async()=>({ok:true,localFolder:'C:/Users/me/AppData/Overnote/backups'}),
  restoreTrash:async()=>true,purgeTrash:async()=>true,
  set:()=>{},update:()=>{},setActive:()=>{},
  setReminder:async()=>({ok:true}),onDockHover:()=>{},onFocusMatch:()=>{},search:async()=>[],
  folderColor:async()=>true,createFolder:async()=>true,
  backupNow:async()=>({ok:true,status:'Local backup created'}),openBackupFolder:()=>{},restoreBackup:async()=>({canceled:true})}
  ''')
  await page.set_content(PAGE.read_text(encoding='utf8'))
  await page.locator('#addMenu').click()
  assert await page.locator('#addMenu').get_attribute('aria-expanded')=='true'
  assert await page.locator('#menu button').filter(has_text='Import notes…').count()==1
  await page.locator('#menu button').filter(has_text='Import notes…').click()
  assert await page.evaluate('window.importCount')==1
  assert 'Imported 1 note' in await page.locator('#importToast').inner_text()
  await page.locator('.tab[data-id="t1"]').click(button='right')
  assert await page.locator('#menu button').filter(has_text='Import notes…').count()==1
  await page.locator('#menu button').filter(has_text='Import notes…').click()
  assert await page.evaluate('window.importCount')==2
  await page.locator('.folder-head').filter(has_text='Projects').click(button='right')
  assert await page.locator('#menu button').filter(has_text='Import notes…').count()==1
  await page.locator('#gear').click()
  await page.locator('#shareToggle').click()
  assert await page.locator('#shareList input[type=checkbox]').count()==4
  await page.locator('#shareList input[type=checkbox]').first.check()
  await page.locator('#shareExport').click()
  assert (await page.evaluate('window.exported.ids'))==['t1']
  assert 'Exported 1' in await page.locator('#shareStatus').inner_text()
  assert 'Deleted meeting' in await page.locator('#trashList').inner_text()
  assert await page.locator('#backupLocalRow').is_visible()
  assert not await page.locator('#cloudSettings').is_visible()
  assert await page.locator('#backupTarget option[value="drive"]').count()==0
  await page.locator('#backupChooseLocal').click()
  assert 'C:/Shared/Overnote' in await page.locator('#backupLocalLabel').inner_text()
  await page.locator('#backupTarget').select_option('discord')
  assert await page.locator('#backupDiscordRow').is_visible()
  assert await page.locator('#backupWebhook').input_value() != ''
  assert 'saved securely' in (await page.locator('#backupDiscordSaved').inner_text()).lower()
  await page.locator('#backupTarget').select_option('github')
  assert await page.locator('#backupGithubRow').is_visible()
  assert await page.locator('#backupGithubToken').input_value() != ''
  assert await page.locator('#backupGithubRepo').input_value() == 'someone/private'
  await page.locator('#backupTarget').select_option('local')
  assert await page.locator('#backupLocalRow').is_visible()
  assert not await page.locator('#cloudSettings').is_visible()
  await page.locator('#gear').click()
  assert await page.locator('.folder-color').count()==2
  color=await page.locator('.folder-section[data-folder-id=f1]').evaluate('(el)=>getComputedStyle(el.querySelector(".folder-head")).getPropertyValue("--folder-accent")')
  assert color.strip()=='#f7b8c6',color
  assert not errors,errors
  print('UI tests passed: New Tab and right-click imports, toast, share, trash, folder colors, local destination, saved Discord/GitHub credentials, no Drive-specific option.')
  await browser.close()
asyncio.run(main())
