"""GitHub branding in the main header without adding UI to detached notes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
html=(Path(__file__).resolve().parents[1]/'index.html').read_text()
mock=r'''
window.opened=[];
window.db={active:'n1', tabs:[{id:'n1',title:'Example',text:'Hello',color:'#f6e27a',reminders:[]}],folders:[],trash:[],settings:{font:'clean',fontSize:15,tabWidth:120,opacity:1,alarmVolume:0.7,favoriteColors:[]}};
window.api={load:async()=>structuredClone(db), onRefresh:()=>{}, onFocusMatch:()=>{}, onDockHover:()=>{}, displays:async()=>[{id:1,label:'Main'}], currentDisplay:async()=>1, getStartup:async()=>false, getAlarmSoundInfo:async()=>({custom:false}), getAlarmAudio:async()=>({src:null}),search:async()=>[], openLink:url=>opened.push(url),setActive:()=>{},update:()=>{},set:()=>{},dragStart:()=>{},dragEnd:()=>{},pinNote:async()=>false};
'''
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    for width in (270, 420, 650):
        context=browser.new_context(viewport={'width':width,'height':450})
        context.add_init_script(script=mock)
        page=context.new_page(); errors=[];page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(html,wait_until='load');page.locator('#repoLink').wait_for(state='visible')
        assert page.locator('#repoLink').get_attribute('aria-label')=='Open Overnote GitHub repository'
        assert page.locator('#repoLink svg').count()==1
        page.locator('#repoLink').click()
        assert page.evaluate('opened')==['https://github.com/Imwhattherel/Overnote']
        assert not errors, errors
        context.close()
    context=browser.new_context(viewport={'width':320,'height':450})
    context.add_init_script(script=mock+"window.URLSearchParams=class extends URLSearchParams { get(k) { return k === 'note' ? 'n1' : super.get(k); } };" )
    page=context.new_page();page.set_content(html,wait_until='load')
    assert page.locator('#repoLink').is_hidden(), 'detached notes have minimal header'
    print('GitHub UI passed at widths 270/420/650 and popped-out mode.')
    browser.close()
