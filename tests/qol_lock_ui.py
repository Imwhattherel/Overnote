"""Overnote 2.1.2 — tab depth, locked-note UI, and Settings states."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

PAGE = Path(__file__).resolve().parents[1] / 'index.html'

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            for width, height in [(390, 545), (650, 470), (280, 300)]:
                page = await browser.new_page(viewport={'width':width,'height':height})
                errors = []
                page.on('pageerror', lambda err: errors.append(str(err)))
                await page.evaluate('''
                    window.mock={tabs:[
                      {id:'private',title:'Private plans',text:'Secret contents',vault:{v:1,ct:'fake'},unlocked:true,preview:false,color:'#f6e27a',reminders:[],folderId:null},
                      {id:'todo',title:'Daily tasks',text:'Milk',preview:false,color:'#a8e6b8',reminders:[],folderId:null}],
                      folders:[],active:'private',settings:{autoLockMinutes:5,theme:'light',checkUpdates:false,livePreview:true,opacity:1,fontSize:15,font:'clean',tabWidth:125,onTop:false,alarmVolume:.75}};
                    window.sent=[];
                    window.api=new Proxy({load:async()=>structuredClone(mock),
                      onRefresh:()=>{},onDockHover:()=>{},onFocusMatch:()=>{},userActivity:()=>{window.activity=(window.activity||0)+1},
                      getStartup:async()=>false,getAlarmSoundInfo:async()=>({custom:false}),
                      displays:async()=>[{id:1,label:'Main'}],currentDisplay:async()=>1,
                      listTrash:async()=>[],backupSettings:async()=>({target:'local',enabled:false}),
                      set:(key,value)=>{mock.settings[key]=value;sent.push([key,value])},
                      setActive:(id)=>{mock.active=id},update:()=>{},
                      relockNote:async(id)=>{const n=mock.tabs.find(t=>t.id===id);n.unlocked=false;n.text='';return true;}
                    },{get:(o,k)=>k in o?o[k]:(...args)=>Promise.resolve(null)});
                ''')
                await page.set_content(PAGE.read_text(encoding='utf-8'), timeout=15000)
                await page.locator('.tab').first.wait_for()
                locked_icon=page.locator('.tab[data-id="private"] .lock-mark')
                assert await locked_icon.count()==1
                assert 'unlocked' in (await locked_icon.get_attribute('title'))
                assert await page.locator('.tab[data-id="todo"] .lock-mark').count()==0
                assert await page.locator('#unlockedBanner').is_visible()
                assert await page.locator('#relockNow').is_visible()
                # Inactive tabs are recessed, but both tabs meet the sidebar edge.
                inactive=page.locator('.tab[data-id="todo"]')
                active=page.locator('.tab[data-id="private"]')
                shadow=await inactive.evaluate('(e)=>getComputedStyle(e).boxShadow')
                selected_shadow=await active.evaluate('(e)=>getComputedStyle(e).boxShadow')
                assert shadow != selected_shadow,(shadow,selected_shadow)
                assert await inactive.evaluate('(e)=>getComputedStyle(e).transform')=='none'
                side=await page.locator('#side').bounding_box()
                for tab in [inactive,active]:
                    box=await tab.bounding_box()
                    assert abs(box['x']+box['width']-side['x']-side['width'])<2
                assert await page.locator('#gear').get_attribute('aria-expanded')=='false'
                await page.locator('#gear').click()
                assert await page.locator('#gear').get_attribute('aria-expanded')=='true'
                assert await page.locator('#gear').get_attribute('aria-label')=='Close settings'
                assert await page.locator('#panel').evaluate('(e)=>e.classList.contains("open")')
                assert await page.locator('#autoLockMinutes').input_value()=='5'
                await page.locator('#autoLockMinutes').select_option('15')
                assert await page.evaluate('mock.settings.autoLockMinutes')==15
                await page.locator('#gear').click()
                assert await page.locator('#gear').get_attribute('aria-expanded')=='false'
                assert await page.locator('#gear').get_attribute('aria-label')=='Open settings'
                await page.locator('#relockNow').click()
                await page.wait_for_function('!document.querySelector("#unlockedBanner") || document.querySelector("#unlockedBanner").hidden')
                assert await page.locator('#lockedScreen').is_visible()
                assert 'locked' in (await page.locator('.tab[data-id="private"] .lock-mark').get_attribute('title'))
                assert not await page.locator('#unlockedBanner').is_visible()
                await page.locator('.tab[data-id="todo"]').click()
                assert not await page.locator('#lockedScreen').is_visible()
                # Sidebar remains usable when a note is locked.
                await page.locator('.tab[data-id="private"]').click()
                assert await page.locator('#lockedScreen').is_visible()
                assert (await page.locator('#side').bounding_box()) is not None
                assert not errors, errors
                print(f'UI passed: {width}x{height}; lock badge/relock, flush, recessed tabs, saved timer selection, Settings active state')
                if width == 390:
                    await page.screenshot(path='/mnt/data/Overnote-2.1.2-preview.png')
                await page.close()
        finally:
            await browser.close()

if __name__=='__main__': asyncio.run(main())
