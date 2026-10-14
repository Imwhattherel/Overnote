"""Regression checks for title/folder naming in main and detached windows."""
from pathlib import Path
from playwright.sync_api import sync_playwright

html=(Path(__file__).resolve().parents[1]/'index.html').read_text()
setup=r'''
window.data={
 active:'a', folders:[{id:'f1',name:'Projects',collapsed:false,color:null}],unfiledCollapsed:false,
 tabs:[{id:'a',title:'Example note',text:'Hello',color:'#f6e27a',reminders:[],preview:false,folderId:null},
 {id:'b',title:'Pop-out note',text:'Text',color:'#a8e6b8',reminders:[],preview:false,folderId:'f1'}],
 settings:{tabWidth:150,font:'clean',fontSize:15,opacity:1,onTop:false,alarmVolume:.75,favoriteColors:[]}
};
window.api={
 load:async()=>structuredClone(data),displays:async()=>[{id:1,label:'One'}],currentDisplay:async()=>1,
 onRefresh:()=>{},onFocusMatch:()=>{},onDockHover:()=>{},getStartup:async()=>false,
 setActive:id=>data.active=id,dragStart:()=>{},dragEnd:()=>{},
 add:async(folderId)=>{const n={id:'n'+data.tabs.length,title:'New',text:'',color:'#f6e27a',reminders:[],preview:false,folderId};data.tabs.push(n);data.active=n.id;return structuredClone(data);},
 update:(id,p)=>Object.assign(data.tabs.find(t=>t.id===id),p),set:()=>{},
 renameFolder:async(id,name)=>{data.folders.find(f=>f.id===id).name=name;return true;},
 createFolder:async(name)=>{const f={id:'f'+(data.folders.length+1),name,collapsed:false};data.folders.push(f);return f;},
 setAlarmSound:async()=>{},getAlarmSoundInfo:async()=>({custom:false}),
 search:async()=>[],getAlarmAudio:async()=>({src:null})
};
'''

def assert_caret(page, selector, value):
    page.locator(selector).wait_for(state='visible')
    result=page.locator(selector).evaluate('''e=>({
      isFocused:document.activeElement===e,
      start:e.selectionStart,end:e.selectionEnd,len:e.value.length,
      caret:getComputedStyle(e).caretColor,cursor:getComputedStyle(e).cursor,
      outline:getComputedStyle(e).outlineStyle, value:e.value,
    })''')
    assert result['isFocused'], f'input not focused {result}'
    assert result['start']==result['end']==result['len'], f'caret missing/collapsed at wrong position {result}'
    assert result['cursor']=='text' and result['caret']=='rgb(29, 26, 18)', result
    assert result['outline']=='solid', result
    if value is not None:assert result['value']==value, result
    return result

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':690,'height':560})
    context.add_init_script(script=setup)
    page=context.new_page();errors=[];page.on('pageerror',lambda error: errors.append(str(error)))
    page.set_content(html, wait_until='load');page.locator('.tab').first.wait_for()
    # Creating a new note should position caret at end of default title.
    page.locator('#add').click();assert_caret(page,'#rni','New')
    page.keyboard.type(' title');page.locator('#rnok').click()
    assert page.evaluate('data.tabs.at(-1).title')=='New title'
    # Renaming an existing note via double-click (includes caret).
    page.locator('.tab').filter(has_text='Example note').dblclick();assert_caret(page,'#rni','Example note')
    page.locator('#rni').press('ControlOrMeta+A');page.keyboard.type('Updated');page.locator('#rni').press('Enter')
    assert page.evaluate("data.tabs.find(n=>n.id==='a').title")=='Updated'
    # Editing folder names and creating folders use same visible caret styling.
    page.locator('#addfolder').click();assert_caret(page,'#folderInput','')
    page.keyboard.type('Errands');page.locator('#folderInput').press('Enter')
    assert 'Errands' in page.locator('.folder-head').last.inner_text()
    page.locator('.folder-head').filter(has_text='Projects').click(button='right')
    page.locator('#menu button').filter(has_text='Rename folder').click()
    assert_caret(page,'#folderInput','Projects')
    page.keyboard.type(' 2026');page.locator('#folderInput').press('Enter')
    assert page.evaluate('data.folders[0].name')=='Projects 2026'
    # Existing cancel/save paths unchanged.
    page.locator('.tab').filter(has_text='Updated').dblclick();assert_caret(page,'#rni','Updated')
    page.locator('#rni').press('Escape')
    assert page.evaluate("data.tabs.find(n=>n.id==='a').title")=='Updated'
    # Pop-out note editor behaves the same way without sidebar.
    pop=context.new_page();pop.on('pageerror',lambda error: errors.append(str(error)))
    pop.evaluate('''()=>{const Original=window.URLSearchParams;window.URLSearchParams=class extends Original {constructor(){super('?note=b')}};}''')
    pop.set_content(html,wait_until='load');pop.locator('#title').wait_for(state='visible')
    assert pop.locator('#side').is_hidden()
    pop.locator('#title').dblclick();assert_caret(pop,'#rni','Pop-out note')
    assert not errors, errors
    print('Naming UI passed: main note creation, main note rename, folder creation, folder rename, cancel, pop-out rename; focus, caret position, focus outline.')
    browser.close()
