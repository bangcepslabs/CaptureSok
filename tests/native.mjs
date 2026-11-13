import {chromium} from 'playwright';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import http from 'node:http';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'capturesok-native-')),results=[];
const fixture=await fs.readFile('tests/fixture.html');const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
await fs.rm('test-results/native-stop',{force:true});
const context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:false,viewport:null,args:[`--disable-extensions-except=${process.cwd()}`,`--load-extension=${process.cwd()}`,'--window-size=1280,900','--window-position=100,80']});
try{
 const page=context.pages()[0];await page.goto('http://127.0.0.1:'+server.address().port);
 const worker=context.serviceWorkers().find(w=>w.url().includes('/background/'))||await context.waitForEvent('serviceworker');const base='chrome-extension://'+worker.url().split('/')[2];
 console.log('NATIVE_READY',base,'fixture',page.url());
 context.on('page',async p=>{
   if(!p.url().includes('/result/'))return;
   try{await p.waitForSelector('body[data-ready=true]',{timeout:15000});const metadata=await p.locator('#metadata').textContent();console.log('NATIVE_CAPTURE',metadata);results.push({metadata,at:new Date().toISOString()});await p.screenshot({path:`test-results/native-result-${results.length}.png`});await fs.writeFile('test-results/native-report.json',JSON.stringify({unmodifiedManifest:true,results},null,2));}catch(e){console.log('NATIVE_ERROR',e.message);}
 });
 await page.keyboard.press('Alt+4');
 // Save the browser's actual command registry periodically for verification.
 for(let i=0;i<1200;i++){
   if(await fs.stat('test-results/native-stop').catch(()=>null))break;
   if(i%10===0)await fs.writeFile('test-results/native-commands.json',JSON.stringify(await worker.evaluate(()=>chrome.commands.getAll()),null,2));
   await new Promise(r=>setTimeout(r,1000));
 }
}finally{await context.close();server.close();await fs.rm(dir,{recursive:true,force:true});}
