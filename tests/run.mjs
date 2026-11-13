import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {canvasSize,cropRect,tiles} from '../capture/geometry.js';

const output=path.resolve('test-results');await fs.mkdir(output,{recursive:true});
const results=[];
async function test(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.message);throw e;}}
await test('geometry: DPR, crop clipping and image limits',async()=>{
  assert.deepEqual(cropRect({x:10,y:20,width:100,height:80,viewportWidth:800,viewportHeight:600},1200,900),{x:15,y:30,width:150,height:120});
  assert.deepEqual(tiles(1800,1900,1000,700).map(p=>[p.x,p.y]),[[0,0],[800,0],[0,700],[800,700],[0,1200],[800,1200]]);
  assert.throws(()=>canvasSize(10000,10000),/tooLarge/);assert.throws(()=>canvasSize(32761,1),/tooLarge/);
});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'capturesok-test-'));
const extension=path.join(temp,'extension');await fs.mkdir(extension);
for(const name of ['manifest.json','background','content','capture','ui','popup','options','result','_locales','icons','docs']){
  try{await fs.cp(path.resolve(name),path.join(extension,name),{recursive:true});}catch(e){if(name!=='docs')throw e;}
}
// Automation cannot grant the browser's user-invoked activeTab token in headless mode.
// This isolated test copy grants host access. The shipped manifest is never modified.
const manifest=JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8'));
manifest.host_permissions=['<all_urls>'];await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const fixture=await fs.readFile('tests/fixture.html');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let context;
try{
 context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,viewport:{width:1000,height:700},deviceScaleFactor:1,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],acceptDownloads:true});
 const page=context.pages()[0];await page.goto('http://127.0.0.1:'+server.address().port);
 let worker=context.serviceWorkers().find(w=>w.url().includes('/background/'))||await context.waitForEvent('serviceworker');
 const base='chrome-extension://'+worker.url().split('/')[2];
 const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await test('extension loads; four native command defaults registered',async()=>{
   const commands=await worker.evaluate(()=>chrome.commands.getAll());for(let i=1;i<=4;i++)assert.ok(commands.some(c=>c.shortcut==='Alt+'+i));
 });
 async function popupCommand(mode){
   await page.bringToFront();await worker.evaluate(()=>chrome.action.openPopup());
   const cdp=await context.newCDPSession(page);let target;
   for(let i=0;i<20;i++){target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url===base+'/popup/popup.html');if(target)break;await new Promise(r=>setTimeout(r,100));}
   assert.ok(target,'popup target');
   const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
   await new Promise(r=>setTimeout(r,200));
   await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`document.querySelector('[data-mode="${mode}"]').click()`}})});
   await new Promise(r=>setTimeout(r,300));await cdp.detach();
 }
 async function resultAfter(action){
   const next=context.waitForEvent('page',{predicate:p=>p.url().includes('/result/'),timeout:20000});next.catch(()=>{});
   await action();const result=await next;await result.waitForSelector('body[data-ready=true]',{timeout:15000});return result;
 }
 async function dimensions(result){return result.locator('#previewImage').evaluate(im=>({width:im.naturalWidth,height:im.naturalHeight}));}
 async function pixel(result,x,y){return result.locator('#previewImage').evaluate((im,{x,y})=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return [...ctx.getImageData(x,y,1,1).data];},{x,y});}
 let visible;
 await test('visible capture produces real pixels',async()=>{
   visible=await resultAfter(()=>popupCommand('visible'));assert.deepEqual(await dimensions(visible),{width:1000,height:700});assert.deepEqual(await pixel(visible,120,150),[240,60,70,255]);
 });
 await test('PNG and JPG downloads finish with correct encoding',async()=>{
   for(const format of ['png','jpeg']){
     await visible.selectOption('#format',format);
     const pending=visible.waitForEvent('download');await visible.click('#save');const download=await pending;assert.equal(await download.failure(),null);
     const file=path.join(output,format==='png'?'capture.png':'capture.jpg');await download.saveAs(file);
     const bytes=await fs.readFile(file);if(format==='png')assert.equal(bytes.subarray(1,4).toString(),'PNG');else assert.equal(bytes.readUInt16BE(0),0xffd8);
     await visible.waitForFunction(()=>document.querySelector('#status').textContent.includes('완료')||document.querySelector('#status').textContent.includes('successfully'));
   }
 });
 await test('preview survives reload; zoom changes displayed image size',async()=>{
   await visible.reload();await visible.waitForSelector('body[data-ready=true]');await visible.click('#actual');assert.equal(await visible.locator('#previewImage').evaluate(im=>im.width),1000);await visible.click('#zoomOut');assert.equal(await visible.locator('#previewImage').evaluate(im=>im.width),800);
 });
 await test('copy image writes a PNG to the clipboard',async()=>{
   await visible.bringToFront();await visible.click('#copy');
   await visible.waitForFunction(()=>document.querySelector('#status').textContent.includes('Ctrl+V'));
   await context.grantPermissions(['clipboard-read','clipboard-write']);
   const types=await visible.evaluate(async()=>{const entries=await navigator.clipboard.read();return entries.flatMap(e=>e.types);});assert.ok(types.includes('image/png'));
 });
 await test('editor opens separately, applies drawing, and cancel preserves the preview',async()=>{
   async function openEditor(){const next=context.waitForEvent('page',{predicate:p=>p.url().includes('/result/editor.html')});await visible.click('#edit');const editor=await next;await editor.waitForSelector('#done:not([disabled])');return editor;}
   let editor=await openEditor();const originalPixels=await visible.locator('#previewImage').evaluate(im=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);return Array.from(x.getImageData(0,0,c.width,c.height).data);});const editorPixels=await editor.locator('#canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));assert.deepEqual(editorPixels,originalPixels,'opening editor preserves every original pixel');assert.equal(await editor.locator('#drawingSettings').isVisible(),false);await editor.click('[data-tool=mosaic]');assert.equal(await editor.locator('#mosaicSettings').isVisible(),true);await editor.click('[data-shape=circle]');assert.equal(await editor.locator('[data-shape=circle]').getAttribute('aria-pressed'),'true');await editor.click('[data-tool=line]');assert.equal(await editor.locator('#mosaicSettings').isVisible(),false);assert.equal(await editor.locator('#drawingSettings').isVisible(),true);const box=await editor.locator('#canvas').boundingBox(),x=Math.round(80*1000/box.width),y=Math.round(30*700/box.height),old=await visible.locator('#previewImage').getAttribute('src');await editor.mouse.move(box.x+30,box.y+30);await editor.mouse.down();await editor.mouse.move(box.x+130,box.y+30);await editor.mouse.up();await editor.click('#done');await visible.waitForFunction(src=>document.querySelector('#previewImage').src!==src,old);
   const changed=await pixel(visible,x,y);assert.ok(changed[0]>200&&changed[1]<100,'edited red line is reflected in preview');
   editor=await openEditor();await editor.click('[data-tool=rect]');for(const type of ['ellipse','arrow','line']){await editor.locator('#shapeTrigger').click();await editor.locator('[data-shape-choice="'+type+'"]').click();const area=await editor.locator('#canvas').boundingBox();await editor.mouse.move(area.x+180,area.y+160);await editor.mouse.down();if(type==='ellipse')await editor.keyboard.down('Shift');await editor.mouse.move(area.x+260,area.y+220);await editor.mouse.up();if(type==='ellipse')await editor.keyboard.up('Shift');assert.equal(await editor.locator('.shape-selection').count(),1);if(type==='ellipse'){const bounds=await editor.locator('.shape-selection').boundingBox();assert.ok(Math.abs(bounds.width-bounds.height)<2,'Shift produces a circle');}await editor.click('#undo');}await editor.locator('#shapeTrigger').click();await editor.locator('[data-shape-choice=rect]').click();let box2=await editor.locator('#canvas').boundingBox();await editor.mouse.move(box2.x+50,box2.y+50);await editor.mouse.down();await editor.mouse.move(box2.x+150,box2.y+120);await editor.mouse.up();let selection=editor.locator('.shape-selection'),before=await selection.boundingBox();await editor.mouse.move(before.x+before.width/2,before.y+before.height/2);await editor.mouse.down();await editor.mouse.move(before.x+before.width/2+30,before.y+before.height/2+20);await editor.mouse.up();let moved=await selection.boundingBox();assert.ok(moved.x>before.x+20);await editor.locator('.shape-selection').focus();await editor.keyboard.press('ArrowRight');assert.ok((await selection.boundingBox()).x>moved.x);moved=await selection.boundingBox();await editor.mouse.move(moved.x+moved.width,moved.y+moved.height);await editor.mouse.down();await editor.mouse.move(moved.x+moved.width+30,moved.y+moved.height+20);await editor.mouse.up();assert.ok((await selection.boundingBox()).width>moved.width+20);await editor.locator('.shape-delete').click();assert.equal(await selection.count(),0);await editor.click('[data-tool=text]');await editor.locator('#canvas').click({position:{x:60,y:60}});await editor.locator('input[style*="position: fixed"]').fill('Hello');await editor.keyboard.press('Enter');assert.equal(await editor.locator('[data-tool=pan]').getAttribute('aria-pressed'),'true');await editor.locator('#canvas').click({position:{x:400,y:200}});assert.equal(await editor.locator('input[style*="position: fixed"]').count(),0);await editor.click('[data-tool=pan]');await editor.locator('#canvas').click({position:{x:65,y:65}});assert.equal(await editor.locator('input[style*="position: fixed"]').count(),0);await editor.locator('.shape-selection').dblclick({position:{x:15,y:10}});await editor.locator('input[style*="position: fixed"]').fill('Edited text');await editor.keyboard.press('Enter');const leftPixels=await editor.locator('#canvas').evaluate(c=>c.toDataURL());await editor.click('[data-align=center]');assert.equal(await editor.locator('[data-align=center]').getAttribute('aria-pressed'),'true');const centeredPixels=await editor.locator('#canvas').evaluate(c=>c.toDataURL());assert.notEqual(centeredPixels,leftPixels);await editor.click('[data-align=right]');assert.notEqual(await editor.locator('#canvas').evaluate(c=>c.toDataURL()),centeredPixels);await editor.click('[data-align=left]');assert.equal(await editor.locator('#undo').isEnabled(),true);await editor.click('[data-tool=crop]');const b=await editor.locator('#canvas').boundingBox();await editor.mouse.move(b.x+20,b.y+20);await editor.mouse.down();await editor.mouse.move(b.x+200,b.y+150);await editor.mouse.up();const cropWidth=await editor.locator('#canvas').evaluate(c=>c.width);assert.ok(cropWidth<1000);await editor.click('#undo');assert.equal(await editor.locator('#canvas').evaluate(c=>c.width),1000);await editor.click('#redo');assert.equal(await editor.locator('#canvas').evaluate(c=>c.width),cropWidth);const previous=await visible.locator('#previewImage').getAttribute('src');await editor.click('#done');await visible.waitForFunction(src=>document.querySelector('#previewImage').src!==src,previous);assert.equal((await dimensions(visible)).width,cropWidth);editor=await openEditor();const stored=await editor.evaluate(async()=>{const {readResult}=await import('../capture/store.js');return (await readResult(new URLSearchParams(location.search).get('id'))).editScene;});assert.ok(stored.items.some(o=>o.type==='text'&&o.text==='Edited text'));await editor.click('#cancel');
 });
 await visible.close();
 await test('region crop has exact dimensions and no overlay',async()=>{
   const result=await resultAfter(async()=>{await popupCommand('region');await page.waitForSelector('[data-capturesok]');await page.mouse.move(110,120);await page.mouse.down();await page.mouse.move(310,220,{steps:4});await page.mouse.up();});
   assert.deepEqual(await dimensions(result),{width:200,height:100});assert.deepEqual(await pixel(result,40,40),[240,60,70,255]);await result.close();
 });
 await test('element selector detects visible DOM and open Shadow DOM',async()=>{
   for(const [x,y,w,h] of [[300,200,240,140],[450,190,100,60]]){
     const result=await resultAfter(async()=>{await popupCommand('element');await page.waitForSelector('[data-capturesok]');await page.mouse.move(x,y);await page.mouse.click(x,y);});
     assert.deepEqual(await dimensions(result),{width:w,height:h});await result.close();
   }
 });
 await test('ESC cancels selection and removes overlay',async()=>{
   await popupCommand('region');await page.waitForSelector('[data-capturesok]');await page.keyboard.press('Escape');await page.waitForSelector('[data-capturesok]',{state:'detached'});assert.equal((await worker.evaluate(()=>chrome.storage.session.get('job'))).job,undefined);
 });
 await test('full capture stitches both axes, restores scroll and fixed/sticky styles',async()=>{
   await page.evaluate(()=>scrollTo(100,200));
   const result=await resultAfter(()=>popupCommand('full'));assert.deepEqual(await dimensions(result),{width:1800,height:1900});
   assert.deepEqual(await pixel(result,1400,1500),[30,100,220,255]);assert.deepEqual(await pixel(result,800,1000),[20,170,100,255]);
   assert.deepEqual(await page.evaluate(()=>[scrollX,scrollY]),[100,200]);assert.equal(await page.locator('.fixed').evaluate(el=>el.style.visibility),'');assert.equal(await page.locator('#sticky').evaluate(el=>el.style.position),'');
   await result.screenshot({path:path.join(output,'result-light.png')});await result.close();await page.evaluate(()=>scrollTo(0,0));
 });
 await test('switching tabs aborts selection without capturing another tab',async()=>{
   await popupCommand('region');await page.waitForSelector('[data-capturesok]');const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
   await page.waitForFunction(()=>!document.querySelector('[data-capturesok]'));await other.close();
 });
 await test('options persist and theme updates; custom shortcut settings opens',async()=>{
   const options=await context.newPage();await options.goto(base+'/options/options.html');await options.waitForSelector('.shortcut-row');
   await options.selectOption('#theme','dark');await options.waitForSelector('html[data-theme=dark]');await options.screenshot({path:path.join(output,'settings-dark.png'),fullPage:true});
   await options.reload();await options.waitForSelector('html[data-theme=dark]');assert.equal(await options.locator('#theme').inputValue(),'dark');
   await options.selectOption('#theme','light');await options.screenshot({path:path.join(output,'settings-light.png'),fullPage:true});
   const next=context.waitForEvent('page');await options.click('#editShortcuts');const shortcuts=await next;await shortcuts.waitForURL('chrome://extensions/shortcuts');
   const editor=shortcuts.locator('cr-shortcut-input').last();await editor.locator('cr-icon-button').click();await editor.locator('input').press('Control+Shift+Y');
   const commands=await worker.evaluate(()=>chrome.commands.getAll());console.log('CUSTOM',commands.find(c=>c.name==='capture-visible'));
   assert.equal(commands.find(c=>c.name==='capture-visible').shortcut,'Ctrl+Shift+Y');
   await options.bringToFront();await options.reload();await options.waitForFunction(()=>[...document.querySelectorAll('#shortcutList kbd')].some(el=>el.textContent==='Ctrl+Shift+Y'));
   await shortcuts.close();await options.close();
 });
 await test('no uncaught extension page errors',async()=>assert.deepEqual(errors,[]));
 await test('full-page ESC restores original page state',async()=>{
   await page.bringToFront();await page.evaluate(()=>scrollTo(70,90));await popupCommand('full');await page.waitForSelector('[data-capturesok]');await page.keyboard.press('Escape');
   await page.waitForFunction(()=>document.querySelector('.fixed').style.visibility===''&&scrollX===70&&scrollY===90);
   await new Promise(r=>setTimeout(r,800));assert.equal((await worker.evaluate(()=>chrome.storage.session.get('job'))).job,undefined);await page.evaluate(()=>scrollTo(0,0));
 });
 await test('Chrome zoom 125% and 150% region geometry',async()=>{
   for(const scale of [1.25,1.5]){
     await page.bringToFront();await worker.evaluate(async zoom=>{const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});await chrome.tabs.setZoom(tab.id,zoom);},scale);
     const result=await resultAfter(async()=>{await popupCommand('region');await page.waitForSelector('[data-capturesok]');await page.mouse.move(110,120);await page.mouse.down();await page.mouse.move(310,220);await page.mouse.up();});
     assert.deepEqual(await dimensions(result),{width:200*scale,height:100*scale});assert.deepEqual(await pixel(result,50,50),[240,60,70,255]);await result.close();
   }
   await page.bringToFront();await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});await chrome.tabs.setZoom(tab.id,1);});
 });
 await test('preview off automatically saves and closes only after completion',async()=>{
   await worker.evaluate(()=>chrome.storage.local.set({preview:false,autoDownload:false,format:'png'}));
   const next=context.waitForEvent('page',{predicate:p=>p.url().includes('/result/')});await popupCommand('visible');const automatic=await next;
   await automatic.waitForEvent('close',{timeout:15000});await worker.evaluate(()=>chrome.storage.local.set({preview:true}));
 });
 await test('oversized pages stop safely and restore styles',async()=>{
   await page.bringToFront();await page.evaluate(()=>document.body.style.height='100000px');await popupCommand('full');
   await new Promise(r=>setTimeout(r,1000));const session=await worker.evaluate(()=>chrome.storage.session.get(['job','error']));assert.equal(session.job,undefined);assert.equal(session.error.code,'tooLarge');
   assert.equal(await page.locator('#sticky').evaluate(el=>el.style.position),'');await page.reload();
 });
 await test('restricted Chrome pages report an actionable error',async()=>{
   const restricted=await context.newPage();await restricted.goto('chrome://version');await restricted.bringToFront();
   const api=await context.newPage();await api.goto(base+'/options/options.html');await restricted.bringToFront();
   const reply=await api.evaluate(()=>chrome.runtime.sendMessage({type:'START',mode:'visible'}));assert.deepEqual(reply,{ok:false,error:'restricted'});await api.close();await restricted.close();
 });
 await test('duplicate requests do not replace a pending selection',async()=>{
   const api=await context.newPage();await api.goto(base+'/options/options.html');await page.bringToFront();await popupCommand('region');await page.waitForSelector('[data-capturesok]');
   const reply=await api.evaluate(()=>chrome.runtime.sendMessage({type:'START',mode:'full'}));assert.deepEqual(reply,{ok:false,error:'busy'});
   await page.mouse.move(100,100);await page.mouse.down();await page.mouse.move(101,101);await page.mouse.up();assert.equal(await page.locator('[data-capturesok]').count(),1);
   await page.keyboard.press('Escape');await api.close();
 });
 await test('selection resumes after service worker termination',async()=>{
   await popupCommand('region');await page.waitForSelector('[data-capturesok]');
   const cdp=await context.newCDPSession(page);const versions=[];cdp.on('ServiceWorker.workerVersionUpdated',event=>versions.push(...event.versions));await cdp.send('ServiceWorker.enable');
   for(let i=0;i<30&&!versions.some(v=>v.scriptURL===worker.url());i++)await new Promise(r=>setTimeout(r,100));
   const version=versions.find(v=>v.scriptURL===worker.url()&&v.runningStatus==='running');assert.ok(version,'extension worker found in CDP');
   await cdp.send('ServiceWorker.stopWorker',{versionId:version.versionId});
   const result=await resultAfter(async()=>{await page.mouse.move(110,120);await page.mouse.down();await page.mouse.move(310,220);await page.mouse.up();});
   assert.ok(versions.some(v=>v.versionId===version.versionId&&v.runningStatus==='stopped'),'worker reached stopped state');
   assert.deepEqual(await dimensions(result),{width:200,height:100});await result.close();await cdp.detach();
 });
}finally{
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify({date:new Date().toISOString(),testBrowser:'Playwright Chromium 145',headlessHostPermissionOverride:true,results},null,2));
 await context?.close();server.close();await fs.rm(temp,{recursive:true,force:true});
}
