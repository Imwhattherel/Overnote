"""Verify that increased tab depth doesn't separate tabs from the editor edge."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'index.html').read_text('utf8')

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
        try:
            for width, height, theme in [(390,540,'light'),(650,470,'dark'),(280,310,'light')]:
                page = await browser.new_page(viewport={'width':width,'height':height})
                errors=[]
                page.on('pageerror', lambda error: errors.append(str(error)))
                await page.evaluate('''(theme) => {
                    window.mock = {tabs: [
                        {id:'a', title:'Ideas', text:'Meet at 10', color:'#f6e27a', reminders:[],preview:false, folderId:'planning'},
                        {id:'b', title:'Projects', text:'Ship update', color:'#a8e6b8', reminders:[],preview:false,folderId:'planning'},
                        {id:'c', title:'Private', text:'Protected',color:'#cdb8f5',reminders:[],preview:false,folderId:null}
                    ],active:'a',folders:[{id:'planning',name:'Planning',collapsed:false}],settings:{autoLockMinutes:0,theme,checkUpdates:false,livePreview:false,opacity:1,fontSize:15,font:'clean',tabWidth:130,onTop:false,alarmVolume:.75}};
                    window.api = new Proxy({load:async()=>structuredClone(mock),onRefresh:()=>{},onDockHover:()=>{},onFocusMatch:()=>{},userActivity:()=>{},
                        getStartup:async()=>false,getAlarmSoundInfo:async()=>({custom:false}),displays:async()=>[],currentDisplay:async()=>1,
                        listTrash:async()=>[],backupSettings:async()=>({target:'local',enabled:false}),
                        setActive:id=>{mock.active=id},update:()=>{},set:()=>{}
                    }, {get:(o,k)=>k in o?o[k]:(...args)=>Promise.resolve(null)});
                }''', theme)
                await page.set_content(HTML, wait_until='load', timeout=11000)
                await page.locator('.tab[data-id="a"]').wait_for(timeout=4500)
                assert await page.locator('#text').input_value() == 'Meet at 10'
                side = await page.locator('#side').bounding_box()
                active = page.locator('.tab[data-id="a"]')
                inactive = page.locator('.tab[data-id="b"]')
                for note in [active,inactive]:
                    bounds=await note.bounding_box()
                    assert abs(bounds['x']+bounds['width'] - side['x']-side['width']) <= 1.2, (width, bounds, side)
                    css=await note.evaluate('''el=>{let s=getComputedStyle(el);return {transform:s.transform,marginRight:s.marginRight,borderRight:s.borderRightWidth,background:s.backgroundImage,shadow:s.boxShadow}}''')
                    assert css['marginRight']=='0px' and css['transform']=='none' and css['borderRight']=='0px', css
                off=await inactive.evaluate('el=>getComputedStyle(el).boxShadow')
                on=await active.evaluate('el=>getComputedStyle(el).boxShadow')
                assert off != on and off.count('inset') >= 3 and on.count('inset') >= 2,(off,on)
                assert await inactive.evaluate('el=>getComputedStyle(el,"::after").width')=='8px'
                if width == 390:
                    await page.screenshot(path='/mnt/data/Overnote-2.1.4-tab-depth-preview.png')
                await inactive.click()
                assert await page.locator('#text').input_value() == 'Ship update'
                assert not errors,errors
                print(f'PASS {width}x{height} {theme}: clean startup, edge-joined layered tabs and tab navigation')
                await page.close()
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
