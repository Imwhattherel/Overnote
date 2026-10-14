from pathlib import Path
from playwright.sync_api import sync_playwright

src = Path(__file__).resolve().parents[1] / 'index.html'
js = r'''
window.db = {
  active:'t1', folders:[{id:'f-work',name:'Work',collapsed:false},{id:'f-home',name:'Personal',collapsed:true}],unfiledCollapsed:false,
  tabs:[
    {id:'t1',title:'Groceries',text:'milk',color:'#f6e27a',folderId:null,reminders:[]},
    {id:'t2',title:'Invoices',text:'send them',color:'#a8e6b8',folderId:'f-work',reminders:[]},
    {id:'t3',title:'Meeting',text:'tomorrow',color:'#f7b8c6',folderId:'f-work',reminders:[]},
    {id:'t4',title:'Birthday',text:'remember',color:'#a9d4f5',folderId:'f-home',reminders:[]}
  ],
  settings:{tabWidth:155,font:'clean',fontSize:15,opacity:.96,onTop:true,alarmVolume:.75}
};
let refreshHandler=()=>{};
window.api = {
  load: async()=>structuredClone(db), displays:async()=>[{id:1,label:'Monitor 1'}], currentDisplay:async()=>1,
  onRefresh:cb=>{refreshHandler=cb}, onFocusMatch:()=>{}, onDockHover:()=>{},
  createFolder:async name=>{const f={id:'f-'+(db.folders.length+1),name,collapsed:false};db.folders.push(f);refreshHandler();return f},
  renameFolder:async(id,name)=>{const f=db.folders.find(x=>x.id===id);if(f)f.name=name;refreshHandler();return true},
  toggleFolder:async id=>{if(id==null)db.unfiledCollapsed=!db.unfiledCollapsed;else db.folders.find(f=>f.id===id).collapsed^=true;refreshHandler();return true},
  deleteFolder:async id=>{db.folders=db.folders.filter(f=>f.id!==id);for(const n of db.tabs)if(n.folderId===id)n.folderId=null;refreshHandler();return true},
  moveNote:async(id,fid)=>{db.tabs.find(t=>t.id===id).folderId=fid;refreshHandler();return true},
  arrangeNotes:async(entries)=>{const by=new Map(db.tabs.map(x=>[x.id,x]));for(const e of entries)by.get(e.id).folderId=e.folderId;db.tabs=[...entries.map(e=>by.get(e.id)),...db.tabs.filter(t=>t.popped)];refreshHandler();return true},
  add:async fid=>{const n={id:'t'+(db.tabs.length+1),title:'New',text:'',color:'#f6e27a',folderId:fid,reminders:[]};db.tabs.push(n);db.active=n.id;return structuredClone(db)},
  update:(id,patch)=>Object.assign(db.tabs.find(t=>t.id===id),patch),setActive:id=>{db.active=id},
  reorder:()=>{}, getStartup:async()=>false,getAlarmSoundInfo:async()=>({custom:false}),
  hide:()=>{},quit:()=>{},set:()=>{},
};
'''
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-gpu'])
  ctx=browser.new_context(viewport={'width':650,'height':450},device_scale_factor=1)
  ctx.add_init_script(script=js)
  page=ctx.new_page()
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  page.set_content(src.read_text(),wait_until='load')
  page.locator('.folder-section').first.wait_for()
  assert page.locator('.folder-head').count()==3
  assert page.locator('.folder-head').all_text_contents()[0].find('Unfiled')>=0
  assert page.locator('.folder-head').all_text_contents()[1].find('Work')>=0
  assert page.locator('.folder-section').nth(2).locator('.tab').count()==0
  assert page.locator('.folder-head').nth(2).get_attribute('aria-expanded')=='false'
  page.locator('.folder-head').nth(2).click()
  assert page.locator('.folder-section').nth(2).locator('.tab').count()==1
  page.locator('#addfolder').click()
  page.locator('#folderInput').fill('Projects')
  page.locator('#folderInput').press('Enter')
  assert page.locator('.folder-head').count()==4
  assert 'Projects' in page.locator('.folder-head').nth(3).inner_text()
  page.locator('.folder-section').first.locator('.tab').click(button='right')
  page.locator('#menu button').filter(has_text='Move to: Projects').click()
  assert page.locator('.folder-section').nth(3).locator('.tab').count()==1
  # Drag Work tab into Personal folder (which is expanded).
  source=page.locator('.folder-section').nth(1).locator('.tab').first
  dest=page.locator('.folder-section').nth(2).locator('.folder-head')
  a=source.bounding_box();b=dest.bounding_box()
  page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2)
  page.mouse.down()
  page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2,steps=8)
  page.mouse.up()
  assert page.evaluate("db.tabs.find(t=>t.id==='t2').folderId")=='f-home', page.evaluate('JSON.stringify(db.tabs)')
  # Folder rename through context menu.
  page.locator('.folder-head').nth(3).click(button='right')
  page.locator('#menu button').filter(has_text='Rename folder').click()
  page.locator('#folderInput').fill('Projects and plans')
  page.locator('#folderSave').click()
  assert 'Projects and plans' in page.locator('.folder-head').nth(3).inner_text()
  # a folder can collapse without discarding note affiliation.
  page.locator('.folder-head').nth(3).click()
  assert page.locator('.folder-head').nth(3).get_attribute('aria-expanded')=='false'
  assert page.evaluate("db.tabs.find(t=>t.id==='t1').folderId")=='f-3'
  page.screenshot(path='/mnt/data/preview-folders198.png')
  # Detached note still has no sidebar.
  pop=ctx.new_page(); pop.evaluate("() => { const Original=window.URLSearchParams; window.URLSearchParams=class extends Original {constructor(){super('?note=t2')}}; }"); pop.set_content(src.read_text(),wait_until='load');pop.locator('#text').wait_for()
  assert pop.locator('body').get_attribute('class')=='pop'
  assert not pop.locator('#side').is_visible()
  assert not errors, errors
  print('Chromium UI tests passed: folder headings, collapse/expand, create, move via menu/drag, rename, pop-out sidebar hiding')
  browser.close()
