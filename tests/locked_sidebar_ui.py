"""Locked notes must shield only their editor, never the navigation sidebar."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

PAGE = Path(__file__).resolve().parents[1] / 'index.html'

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        try:
            for width, height in [(650, 530), (330, 410)]:
                page = await browser.new_page(viewport={'width': width, 'height': height})
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                await page.evaluate('''
                    window.notes={tabs:[
                      {id:'secret',title:'Private note',text:'',vault:{v:1,ct:'encrypted'},unlocked:false,preview:false,color:'#f6e27a',reminders:[],folderId:'work'},
                      {id:'public',title:'Public note',text:'You can still read this',preview:false,color:'#a8e6b8',reminders:[],folderId:'work'}],
                      folders:[{id:'work',name:'Work',collapsed:false}],active:'secret',
                      settings:{theme:'light',checkUpdates:false,livePreview:true,opacity:1,fontSize:15,font:'clean',tabWidth:120,onTop:false,alarmVolume:.75}};
                    window.api=new Proxy({load:async()=>structuredClone(notes),onRefresh:()=>{},onDockHover:()=>{},onFocusMatch:()=>{},
                      getStartup:async()=>false,getAlarmSoundInfo:async()=>({custom:false}),
                      displays:async()=>[{id:1,label:'Main'}],currentDisplay:async()=>1,
                      listTrash:async()=>[],backupSettings:async()=>({target:'local',enabled:false}),
                      setActive:(id)=>{notes.active=id},
                      toggleFolder:async (id)=>{notes.folders.find(f=>f.id===id).collapsed=!notes.folders.find(f=>f.id===id).collapsed;
                        window.dispatchEvent(new Event('storage'));
                        await window.api.load().then(data=>{D=data;render()});},
                      update:()=>{},set:()=>{}
                    },{get:(obj,k)=>k in obj?obj[k]:(...args)=>Promise.resolve(null)}); void 0;
                ''')
                await page.set_content(PAGE.read_text(encoding='utf-8'),timeout=15000)
                await page.wait_for_selector('.tab[data-id="secret"]')
                cover=page.locator('#lockedScreen')
                assert await cover.is_visible()
                rect=await cover.bounding_box()
                sidebar=await page.locator('#side').bounding_box()
                editor=await page.locator('#editorBody').bounding_box()
                assert rect and sidebar and editor
                # The lock overlay is strictly inside the editor's area.
                assert rect['x'] >= editor['x']-1, (rect,editor)
                assert rect['x'] >= sidebar['x']+sidebar['width']-1, (rect,sidebar)
                assert rect['width']<=editor['width']+1,(rect,editor)
                await page.locator('.tab[data-id="public"]').click(timeout=3000)
                assert not await cover.is_visible()
                assert await page.locator('#text').input_value()=='You can still read this'
                await page.locator('.tab[data-id="secret"]').click(timeout=3000)
                assert await cover.is_visible()
                await page.locator('.folder-section[data-folder-id="work"] .folder-head').click(timeout=3000)
                assert await page.locator('.folder-section[data-folder-id="work"] .folder-head').get_attribute('aria-expanded')=='false'
                await page.locator('.folder-section[data-folder-id="work"] .folder-head').click(timeout=3000)
                assert await page.locator('.folder-section[data-folder-id="work"] .folder-head').get_attribute('aria-expanded')=='true'
                # Toolbar controls and sidebar remain usable while locked.
                await page.locator('#gear').click(timeout=3000)
                assert 'open' in (await page.locator('#panel').get_attribute('class'))
                assert not errors,errors
                print(f'Locked sidebar passed at {width}x{height}: navigation, folder collapse/expand, settings, and isolated lock screen')
                await page.close()
        finally:
            await browser.close()

if __name__=='__main__': asyncio.run(main())
