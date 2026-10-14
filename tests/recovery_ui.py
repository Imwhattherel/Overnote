"""Guard against DOM regressions that prevent notes from rendering at startup."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'index.html').read_text('utf-8')

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
        try:
            for width, height in [(390, 540), (650, 470), (280, 300)]:
                page = await browser.new_page(viewport={'width':width, 'height':height})
                errors=[]
                page.on('pageerror',lambda exc: errors.append(str(exc)))
                await page.evaluate('''
                    window.mock={tabs:[
                      {id:'a',title:'Shopping',text:'Milk, bread and apples',color:'#f6e27a',reminders:[],preview:false,folderId:'daily'},
                      {id:'b',title:'Tasks',text:'Tomorrow: call Alice',color:'#a8e6b8',reminders:[],preview:false,folderId:'daily'},
                      {id:'c',title:'Private',text:'',vault:{v:1,ct:'fake'},unlocked:false,color:'#cdb8f5',reminders:[],preview:false,folderId:null}],
                      active:'a',folders:[{id:'daily',name:'Daily',collapsed:false}],settings:{autoLockMinutes:5,theme:'light',checkUpdates:false,livePreview:true,opacity:1,fontSize:15,font:'clean',tabWidth:120,onTop:false,alarmVolume:.75}};
                    window.api=new Proxy({load:async()=>structuredClone(mock),onRefresh:()=>{},onDockHover:()=>{},onFocusMatch:()=>{},userActivity:()=>{},
                      getStartup:async()=>false,getAlarmSoundInfo:async()=>({custom:false}),displays:async()=>[{id:1,label:'Main'}],currentDisplay:async()=>1,
                      listTrash:async()=>[],backupSettings:async()=>({target:'local',enabled:false}),
                      setActive:id=>{mock.active=id},update:()=>{},set:()=>{}
                    },{get:(o,k)=>k in o?o[k]:(...args)=>Promise.resolve(null)});
                ''')
                await page.set_content(HTML,wait_until='load',timeout=14000)
                await page.locator('.tab[data-id="a"]').wait_for(timeout=5000)
                assert await page.locator('#editingTools').count() == 1, 'Lost editing toolbar; broken attribute?'
                assert (await page.locator('#text').input_value()) == 'Milk, bread and apples'
                side=await page.locator('#side').bounding_box()
                tabs=page.locator('.tab')
                assert await tabs.count() == 3
                # Both inactive and active notes join the sidebar's right edge.
                for locator in [page.locator('.tab[data-id="a"]'),page.locator('.tab[data-id="b"]')]:
                    rect=await locator.bounding_box()
                    assert abs((rect['x']+rect['width'])-(side['x']+side['width'])) <= 2,(rect,side)
                    assert await locator.evaluate('e=>getComputedStyle(e).transform')=='none'
                inactive=await page.locator('.tab[data-id="b"]').evaluate('e=>getComputedStyle(e).boxShadow')
                active=await page.locator('.tab[data-id="a"]').evaluate('e=>getComputedStyle(e).boxShadow')
                assert inactive!=active
                await page.locator('.tab[data-id="b"]').click()
                assert await page.locator('#text').input_value() == 'Tomorrow: call Alice'
                await page.locator('.tab[data-id="c"]').click()
                assert await page.locator('#lockedScreen').is_visible()
                await page.locator('.tab[data-id="a"]').click()
                assert not await page.locator('#lockedScreen').is_visible()
                assert not errors,errors
                if width == 390:
                    await page.screenshot(path='/mnt/data/Overnote-2.1.3-sidebar-preview.png')
                print(f'PASS {width}x{height}: startup content, tab selection, locked-note navigation and flush recessed tabs')
                await page.close()
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
