import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
const version=JSON.parse(await fs.readFile('manifest.json','utf8')).version;
const root=path.resolve('dist/CaptureSok-'+version),dir=await fs.mkdtemp(path.join(os.tmpdir(),'capturesok-package-'));
const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
try{
 const worker=context.serviceWorkers().find(w=>w.url().includes('/background/'))||await context.waitForEvent('serviceworker');
 const data=await worker.evaluate(async()=>({manifest:chrome.runtime.getManifest(),commands:await chrome.commands.getAll()}));
 assert.equal(data.manifest.host_permissions,undefined);assert.deepEqual(data.manifest.permissions.sort(),['activeTab','downloads','scripting','storage']);assert.equal(data.commands.filter(c=>c.name.startsWith('capture-')).length,4);
 assert.equal(data.manifest.optional_host_permissions,undefined);
 assert.equal(await worker.evaluate(()=>chrome.permissions.contains({origins:['http://*/*','https://*/*']})),false);
 assert.equal((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).length,0);
 const base='chrome-extension://'+worker.url().split('/')[2],errors=[];
 for(const file of ['popup/popup.html','options/options.html','result/result.html?id=missing','docs/privacy.html']){
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/'+file);
  if(file.startsWith('popup'))await page.waitForFunction(()=>document.querySelector('kbd')?.textContent==='Alt+1');
  if(file.startsWith('options'))await page.waitForSelector('.shortcut-row');
  if(file.startsWith('result'))await page.waitForSelector('body[data-ready=error]');
  assert.ok(await page.locator('body').innerText());await page.close();
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('test-results/package-smoke.json',JSON.stringify({date:new Date().toISOString(),passed:true,unmodifiedManifest:true,permissions:data.manifest.permissions,scope:'Packaged extension load, command registration, popup/options/result-error/privacy page rendering. No activeTab invocation simulated.'},null,2));
 console.log('PASS packaged extension: permissions, commands and all UI pages');
}finally{await context.close();await fs.rm(dir,{recursive:true,force:true});}
