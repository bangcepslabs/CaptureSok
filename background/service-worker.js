import {canvasSize,cropRect,tiles} from '../capture/geometry.js';
import {saveResult,removeResult} from '../capture/store.js';
// One-time cleanup for installations upgraded from the removed navigation feature.
chrome.runtime.onInstalled.addListener(async()=>{
  const scripts=await chrome.scripting.getRegisteredContentScripts();
  const legacy=scripts.filter(s=>s.id==='capturesok-mouse-gestures');
  if(legacy.length)await chrome.scripting.unregisterContentScripts({ids:legacy.map(s=>s.id)});
  await chrome.storage.local.remove('gestures');
});


const MODES=['region','element','full','visible'];
let job=null,lastShot=0;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const text=key=>chrome.i18n.getMessage(key)||chrome.i18n.getMessage('captureFailed');
const boot=(async()=>{
  const saved=(await chrome.storage.session.get('job')).job;
  if(saved?.phase==='select')job=saved;
  else if(saved){await chrome.tabs.sendMessage(saved.tab.id,{type:'RESTORE',token:saved.token}).catch(()=>{});await chrome.storage.session.remove('job');await report('interrupted');}
})();
async function persist(){await chrome.storage.session.set({job});}
async function report(code){
  await chrome.storage.session.set({error:{code,at:Date.now()}});
  await chrome.action.setBadgeBackgroundColor({color:'#b6463e'});
  await chrome.action.setBadgeText({text:'!'});
  await chrome.action.setTitle({title:text(code)});
}
async function clearBadge(){await chrome.action.setBadgeText({text:''});await chrome.action.setTitle({title:'CaptureSok'});}
async function send(j,message){return chrome.tabs.sendMessage(j.tab.id,{...message,token:j.token});}
async function assertActive(j){
  if(j.cancelled)throw Error(j.cancelled);
  const tab=await chrome.tabs.get(j.tab.id).catch(()=>null);
  if(!tab?.active||tab.url!==j.tab.url||tab.status==='loading')throw Error('pageChanged');
  const window=await chrome.windows.get(j.tab.windowId);
  if(window.state==='minimized')throw Error('pageChanged');
}
async function shot(j){
  await delay(Math.max(0,600-(Date.now()-lastShot)));
  await assertActive(j);lastShot=Date.now();
  const url=await chrome.tabs.captureVisibleTab(j.tab.windowId,{format:'png'});
  await assertActive(j);
  return createImageBitmap(await (await fetch(url)).blob());
}
async function cleanup(j){
  await send(j,{type:'RESTORE'}).catch(()=>{});
  if(job?.token===j.token){job=null;await chrome.storage.session.remove('job');}
}
async function fail(j,error){
  error=Error(j.cancelled||error.message);
  await cleanup(j);
  if(error.message!=='cancelled'){
    const code=chrome.i18n.getMessage(error.message)?error.message:'captureFailed';
    await report(code);
    await chrome.tabs.sendMessage(j.tab.id,{type:'NOTICE',message:text(code)}).catch(()=>{});
  }else await clearBadge();
}
async function deliver(j,canvas){
  await assertActive(j);
  const blob=await canvas.convertToBlob({type:'image/png'});
  await assertActive(j);
  if(!blob.size)throw Error('captureFailed');
  const id=crypto.randomUUID();
  try{await saveResult({id,blob,width:canvas.width,height:canvas.height,mode:j.mode,created:Date.now()});}catch{throw Error('storageFailed');}
  try{await assertActive(j);}catch(e){await removeResult(id);throw e;}
  canvas.width=1;canvas.height=1;
  await cleanup(j);await clearBadge();
  await chrome.storage.local.set({lastMode:j.mode});
  const {preview=true}=await chrome.storage.local.get('preview');
  try{
    const url=chrome.runtime.getURL('result/result.html')+'?id='+id;
    const tab=preview?(await chrome.windows.create({url,type:'popup',width:1100,height:760,focused:true})).tabs[0]:await chrome.tabs.create({url,active:false});
    await chrome.storage.session.set({['resultTab_'+tab.id]:id});
  }catch(e){await removeResult(id);throw e;}
}
async function captureSingle(j,rect){
  j.phase='capture';await persist();
  try{
    await assertActive(j);
    const validation=await send(j,{type:'VALIDATE',rect});
    if(!validation?.ok)throw Error(validation?.error||'pageChanged');
    const bitmap=await shot(j);
    let canvas;
    try{
      const r=rect?cropRect(rect,bitmap.width,bitmap.height):{x:0,y:0,width:bitmap.width,height:bitmap.height};
      const size=canvasSize(r.width,r.height);
      canvas=new OffscreenCanvas(size.width,size.height);
      canvas.getContext('2d').drawImage(bitmap,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
    }finally{bitmap.close();}
    await deliver(j,canvas);
  }catch(e){await fail(j,e);}
}
async function captureFull(j){
  j.phase='capture';await persist();let canvas;
  try{
    const info=await send(j,{type:'FULL_PREPARE'});
    if(info.error)throw Error(info.error);
    canvasSize(info.width,info.height,info.dpr);
    const positions=tiles(info.width,info.height,info.vw,info.vh);
    let sx,sy;
    for(let i=0;i<positions.length;i++){
      await assertActive(j);
      await chrome.action.setBadgeText({text:Math.round(i/positions.length*100)+'%'});
      const pos=await send(j,{type:'FULL_SCROLL',...positions[i],index:i,total:positions.length});
      if(pos.error)throw Error(pos.error);
      await delay(100);
      const bitmap=await shot(j);
      try{
        if(!canvas){
          sx=bitmap.width/pos.innerWidth;sy=bitmap.height/pos.innerHeight;
          canvasSize(info.width,info.height,Math.max(sx,sy));
          canvas=new OffscreenCanvas(Math.ceil(info.width*sx),Math.ceil(info.height*sy));
          canvas.getContext('2d').fillStyle='#fff';canvas.getContext('2d').fillRect(0,0,canvas.width,canvas.height);
        }
        if(Math.abs(bitmap.width/pos.innerWidth-sx)>.01||Math.abs(bitmap.height/pos.innerHeight-sy)>.01)throw Error('pageChanged');
        // Trim overlap from the leading edge: keep fixed elements from the first tile.
        const column=i%axisCount(positions),rowStart=i-column;
        const left=column?Math.max(pos.x,positions[i-1].x+info.vw):pos.x;
        const top=rowStart?Math.max(pos.y,positions[rowStart-1].y+info.vh):pos.y;
        const right=Math.min(info.width,pos.x+info.vw),bottom=Math.min(info.height,pos.y+info.vh);
        if(right>left&&bottom>top){
          const dx=Math.round(left*sx),dy=Math.round(top*sy),dw=Math.round(right*sx)-dx,dh=Math.round(bottom*sy)-dy;
          canvas.getContext('2d').drawImage(bitmap,Math.round((left-pos.x)*sx),Math.round((top-pos.y)*sy),dw,dh,dx,dy,dw,dh);
        }
      }finally{bitmap.close();}
    }
    await deliver(j,canvas);
  }catch(e){if(canvas){canvas.width=1;canvas.height=1;}await fail(j,e);}
}
function axisCount(positions){const y=positions[0].y;return positions.filter(p=>p.y===y).length;}
async function begin(mode){
  await boot;
  if(!MODES.includes(mode))throw Error('invalidMode');
  if(job){if(Date.now()-job.started>180000)await cleanup(job);else throw Error('busy');}
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if(!tab?.id||!/^https?:|^file:/.test(tab.url||'')||/^https:\/\/(chromewebstore.google.com|chrome.google.com\/webstore)/.test(tab.url))throw Error('restricted');
  if(tab.status==='loading')throw Error('pageLoading');
  if(job)throw Error('busy');
  job={token:crypto.randomUUID(),tab:{id:tab.id,windowId:tab.windowId,url:tab.url},mode,phase:mode==='region'||mode==='element'?'select':'capture',started:Date.now()};
  const j=job;await persist();await clearBadge();
  try{
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content/capture.js']});
    // Return to the popup before interacting with the page.
    setTimeout(async()=>{
      try{
        await assertActive(j);
        const response=await send(j,{type:'INIT',mode});
        if(response?.error)throw Error(response.error);
        if(mode==='full')await captureFull(j);
        else if(mode==='visible')await captureSingle(j,null);
      }catch(e){await fail(j,e);}
    },220);
    return {ok:true};
  }catch(e){await cleanup(j);throw Error('restricted');}
}
chrome.commands.onCommand.addListener(command=>{begin(command.replace('capture-','')).catch(e=>report(e.message));});
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  const trustedPage=sender.url?.startsWith(chrome.runtime.getURL(''));
  const handle=async()=>{
    await boot;
    if(m.type==='START'&&trustedPage)return begin(m.mode);
    if(m.type==='CLEAR_ERROR'&&trustedPage){await chrome.storage.session.remove('error');await clearBadge();return {ok:true};}
    if(m.type==='CANCEL'&&(trustedPage||(sender.tab?.id===job?.tab.id&&m.token===job?.token))){
      if(job){const j=job;j.cancelled='cancelled';if(j.phase==='select')await cleanup(j);else await send(j,{type:'RESTORE'}).catch(()=>{});}await clearBadge();return {ok:true};
    }
    if(m.type==='SELECTED'&&job?.phase==='select'&&sender.tab?.id===job.tab.id&&m.token===job.token){
      const j=job;captureSingle(j,m.rect);return {ok:true};
    }
    if(m.type==='HEARTBEAT'&&sender.tab?.id===job?.tab.id&&m.token===job.token)return {ok:true};
    return {ok:false,error:'interrupted'};
  };
  handle().then(reply).catch(e=>reply({ok:false,error:chrome.i18n.getMessage(e.message)?e.message:'captureFailed'}));return true;
});
async function abortTab(id){await boot;if(job?.tab.id===id){const j=job;j.cancelled='pageChanged';if(j.phase==='select')await fail(j,Error('pageChanged'));else await send(j,{type:'RESTORE'}).catch(()=>{});}}
chrome.tabs.onActivated.addListener(async info=>{await boot;if(job&&job.tab.windowId===info.windowId&&job.tab.id!==info.tabId)await abortTab(job.tab.id);});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='loading')abortTab(id);});
chrome.tabs.onRemoved.addListener(async id=>{await abortTab(id);const key='resultTab_'+id;const value=(await chrome.storage.session.get(key))[key];if(value)await removeResult(value);await chrome.storage.session.remove(key);});
