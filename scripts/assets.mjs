import {chromium} from 'playwright';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
const out=path.resolve('store-assets');await fs.mkdir(out,{recursive:true});
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'capturesok-assets-'));
const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:true,viewport:{width:1280,height:800},args:[`--disable-extensions-except=${process.cwd()}`,`--load-extension=${process.cwd()}`]});
try{
 const worker=context.serviceWorkers().find(w=>w.url().includes('/background/'))||await context.waitForEvent('serviceworker');const base='chrome-extension://'+worker.url().split('/')[2];
 const popup=await context.newPage();await popup.goto(base+'/popup/popup.html');await popup.waitForFunction(()=>document.querySelector('kbd')?.textContent==='Alt+1');
 for(const theme of ['light','dark']){
  await worker.evaluate(theme=>chrome.storage.local.set({theme}),theme);await popup.waitForSelector(`html[data-theme=${theme}]`);
  await popup.locator('body').screenshot({path:path.join(out,`popup-${theme}.png`),animations:'disabled'});
 }
 await worker.evaluate(()=>chrome.storage.local.set({theme:'light'}));
 const options=await context.newPage();await options.goto(base+'/options/options.html');await options.waitForSelector('.shortcut-row');
 await options.screenshot({path:path.join(out,'settings-1280x800.png')});
 await options.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=650;const c=canvas.getContext('2d');c.fillStyle='#edf5ef';c.fillRect(0,0,1000,650);c.fillStyle='#103d32';c.font='bold 54px sans-serif';c.fillText('CaptureSok',70,130);c.font='30px sans-serif';c.fillText('Capture and annotate your screen',70,200);c.fillStyle='#d2e8da';c.fillRect(70,260,860,260);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const {saveResult}=await import('../capture/store.js');await saveResult({id:'store-example',blob,width:1000,height:650,mode:'visible',created:Date.now()});});
 const editor=await context.newPage();await editor.goto(base+'/result/editor.html?id=store-example');await editor.waitForSelector('#done:not([disabled])');await editor.locator('[data-tool=rect]').click();await editor.screenshot({path:path.join(out,'editor-1280x800.png'),animations:'disabled'});await editor.close();
 const icon='data:image/png;base64,'+(await fs.readFile('icons/128.png')).toString('base64');
 const light='data:image/png;base64,'+(await fs.readFile(path.join(out,'popup-light.png'))).toString('base64');
 const dark='data:image/png;base64,'+(await fs.readFile(path.join(out,'popup-dark.png'))).toString('base64');
 const englishContext=await chromium.launchPersistentContext(path.join(dir,'english'),{channel:'chromium',headless:true,locale:'en-US',viewport:{width:1280,height:800},args:[`--disable-extensions-except=${process.cwd()}`,`--load-extension=${process.cwd()}`,'--lang=en-US']});
 let english;
 try{
  const ew=englishContext.serviceWorkers().find(w=>w.url().includes('/background/'))||await englishContext.waitForEvent('serviceworker');
  const language=await ew.evaluate(()=>chrome.i18n.getUILanguage());if(!language.startsWith('en'))throw Error('English browser locale not applied: '+language);
  await ew.evaluate(()=>chrome.storage.local.set({theme:'light'}));
  const ep=await englishContext.newPage();await ep.goto('chrome-extension://'+ew.url().split('/')[2]+'/popup/popup.html');await ep.waitForFunction(()=>document.querySelector('[data-i18n=region]').textContent==='Select a region');
  await ep.locator('body').screenshot({path:path.join(out,'popup-en-light.png')});
  english='data:image/png;base64,'+(await fs.readFile(path.join(out,'popup-en-light.png'))).toString('base64');
 }finally{await englishContext.close();}
 const page=await context.newPage();
 const template=(lang,night=false)=>{
  const ko=lang==='ko';
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;background:${night?'#102824':'#edf5ef'};color:${night?'#e1fff0':'#153d32'};font-family:'Segoe UI','Malgun Gothic',sans-serif;overflow:hidden}.layout{height:100%;display:flex;align-items:center;justify-content:space-between;padding:76px 92px}.left{width:560px}.brand{display:flex;align-items:center;gap:15px;font-size:25px;font-weight:650;margin-bottom:60px}.brand img{width:54px;height:54px}h1{font-size:58px;letter-spacing:-2.8px;line-height:1.25;margin:0 0 25px}p{font-size:21px;line-height:1.7;opacity:.8;margin:0 0 30px}.chips{display:flex;gap:9px;flex-wrap:wrap}.chips span{padding:8px 13px;border:1px solid ${night?'#476b5a':'#bed9ca'};border-radius:30px;font-size:15px}.screen{width:390px;border-radius:16px;overflow:hidden;box-shadow:0 26px 70px #0a332b30;border:1px solid ${night?'#416055':'#d6e4da'}}.screen img{display:block;width:390px}.foot{font-size:14px;margin-top:40px;opacity:.65}</style></head><body><div class="layout"><div class="left"><div class="brand"><img src="${icon}">CaptureSok</div><h1>${ko?(night?'눈이 편한 캡처,<br>나에게 맞는 설정.':'원하는 화면만,<br>쏙.'):(night?'Your capture.<br>Your preferences.':'Just the screen<br>you need.')}</h1><p>${ko?'영역부터 전체 페이지까지.<br>기기 안에서 빠르고 간편하게.':'From a selected region to a full page.<br>Simple screenshots, processed locally.'}</p><div class="chips"><span>PNG · JPG</span><span>${ko?'이미지 복사':'Copy image'}</span><span>${ko?'커스텀 단축키':'Custom shortcuts'}</span></div><div class="foot">${ko?'계정 없이 · 서버 업로드 없이':'No account · No server upload'}</div></div><div class="screen"><img src="${night?dark:light}"></div></div></body></html>`;
 };
 for(const [name,html] of [['screenshot-ko-1280x800.png',template('ko')],['screenshot-dark-ko-1280x800.png',template('ko',true)],['screenshot-en-1280x800.png',template('en').replace(light,english)]]){
   await page.setContent(html);await page.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));await page.screenshot({path:path.join(out,name)});
 }
 await page.setViewportSize({width:440,height:280});await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:440px;height:280px;background:#103d32;color:white;font-family:'Segoe UI','Malgun Gothic',sans-serif;padding:31px 35px}.brand{display:flex;align-items:center;gap:12px;font-size:25px;font-weight:650}.brand img{width:47px;height:47px}h1{font-size:32px;line-height:1.3;letter-spacing:-1.3px;margin:27px 0 11px}p{font-size:14px;color:#a5e0c4;margin:0}</style></head><body><div class="brand"><img src="${icon}">CaptureSok</div><h1>원하는 화면만, 쏙.</h1><p>영역 · 요소 · 전체 페이지 · 보이는 화면</p></body></html>`);await page.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));await page.screenshot({path:path.join(out,'promo-440x280.png')});
 await fs.copyFile('icons/128.png',path.join(out,'icon-128.png'));
 console.log('Store assets generated:',out);
}finally{await context.close();await fs.rm(dir,{recursive:true,force:true});}
