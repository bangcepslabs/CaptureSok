import {localize,t,defaults,message} from '../ui/common.js';
import {readResult,removeResult} from '../capture/store.js';
localize();
const $=id=>document.getElementById(id),status=$('status'),preview=$('previewImage');
const id=new URLSearchParams(location.search).get('id');let record,imageURL,zoom=1,fitting=true;
const buttons=[$('save'),$('copy'),$('delete'),$('edit')];
const downloads=new Map();
const channel=new BroadcastChannel('capturesok-result-'+id);
async function showRecord(){record=await readResult(id);if(!record?.blob)return;const old=imageURL;imageURL=URL.createObjectURL(record.blob);preview.src=imageURL;await preview.decode();if(old)URL.revokeObjectURL(old);preview.hidden=false;$('metadata').textContent=`${record.width} × ${record.height} px · ${(record.blob.size/1024/1024).toFixed(2)} MB · ${t(record.mode)}`;}
channel.onmessage=async event=>{if(event.data==='updated'){try{await showRecord();fit();}catch{message(status,'captureFailed',true);}}};
let editorWindowId=null,openingEditor=false;
$('edit').onclick=async()=>{
  if(!record||openingEditor)return;
  openingEditor=true;
  try{
    if(editorWindowId!==null){
      try{await chrome.windows.update(editorWindowId,{focused:true});return;}catch{editorWindowId=null;}
    }
    const editor=await chrome.windows.create({url:chrome.runtime.getURL('result/editor.html')+'?id='+encodeURIComponent(id),type:'popup',width:1100,height:760,focused:true});
    editorWindowId=editor.id;
  }catch{message(status,'captureFailed',true);}
  finally{openingEditor=false;}
};
chrome.windows.onRemoved.addListener(windowId=>{if(windowId===editorWindowId)editorWindowId=null;});
function trackDownload(item){
  const pending=downloads.get(item.id);if(!pending)return;
  const state=item.state?.current||item.state;
  if(state==='complete'||state==='interrupted'){
    downloads.delete(item.id);URL.revokeObjectURL(pending.url);
    if(state==='complete')pending.resolve();else pending.reject(Error('downloadFailed'));
  }
}
chrome.downloads.onChanged.addListener(trackDownload);
function filename(format){const d=new Date(),n=v=>String(v).padStart(2,'0');return `CaptureSok_${d.getFullYear()}-${n(d.getMonth()+1)}-${n(d.getDate())}_${n(d.getHours())}${n(d.getMinutes())}${n(d.getSeconds())}.${format==='png'?'png':'jpg'}`;}
async function save(){
  if(!record)return;buttons.forEach(b=>b.disabled=true);message(status,'downloadStarted');
  try{
    let blob=record.blob;
    if($('format').value==='jpeg'){
      const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(record.width,record.height),ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0);bitmap.close();
      blob=await canvas.convertToBlob({type:'image/jpeg',quality:Number($('quality').value)/100});canvas.width=1;
    }
    const url=URL.createObjectURL(blob);let downloadId;
    try{downloadId=await chrome.downloads.download({url,filename:filename($('format').value),saveAs:false});}catch(e){URL.revokeObjectURL(url);throw e;}
    await new Promise((resolve,reject)=>{
      downloads.set(downloadId,{resolve,reject,url});
      chrome.downloads.search({id:downloadId}).then(items=>{if(items[0])trackDownload(items[0]);}).catch(reject);
    });
    message(status,'downloadComplete');return true;
  }catch{message(status,'downloadFailed',true);return false;}
  finally{buttons.forEach(b=>b.disabled=!record);}
}
function setZoom(value){if(!record)return;zoom=Math.max(.05,Math.min(4,value));preview.style.width=Math.round(record.width*zoom)+'px';preview.style.height=Math.round(record.height*zoom)+'px';$('zoomValue').value=Math.round(zoom*100)+'%';}
function fit(){fitting=true;if(record)setZoom(Math.min(1,($('viewport').clientWidth-56)/record.width));}
$('fit').onclick=fit;$('actual').onclick=()=>{fitting=false;setZoom(1);};$('zoomIn').onclick=()=>{fitting=false;setZoom(zoom*1.25);};$('zoomOut').onclick=()=>{fitting=false;setZoom(zoom/1.25);};window.addEventListener('resize',()=>{if(fitting)fit();});
$('quality').oninput=()=>$('qualityValue').value=$('quality').value+'%';
$('format').onchange=()=>$('qualityRow').hidden=$('format').value!=='jpeg';
$('save').onclick=save;
$('copy').onclick=()=>{
  if(!record)return;
  navigator.clipboard.write([new ClipboardItem({'image/png':record.blob})]).then(()=>message(status,'copied')).catch(()=>message(status,'copyFailed',true));
};
$('close').onclick=()=>window.close();
$('delete').onclick=async()=>{
  await removeResult(id);record=null;buttons.forEach(b=>b.disabled=true);preview.hidden=true;URL.revokeObjectURL(imageURL);$('metadata').textContent='';message(status,'deleted');document.body.dataset.ready='deleted';
};
async function init(){
  const options=await chrome.storage.local.get(defaults);$('format').value=options.format;$('quality').value=Math.round(options.quality*100);$('quality').oninput();$('format').onchange();
  record=await readResult(id);if(!record?.blob)throw Error('noResult');
  await showRecord();$('loading').hidden=true;
  preview.alt=t('resultTitle');$('metadata').textContent=`${record.width} × ${record.height} px · ${(record.blob.size/1024/1024).toFixed(2)} MB · ${t(record.mode)}`;
  if(record.mode==='element')$('limitation').textContent=t('elementLimit');
  fit();buttons.forEach(b=>b.disabled=false);document.body.dataset.ready='true';
  if(options.autoDownload||!options.preview){
    const ok=await save();
    if(!options.preview){if(ok)window.close();else{const tab=await chrome.tabs.getCurrent();await chrome.tabs.update(tab.id,{active:true});}}
  }
}
init().catch(e=>{$('loading').hidden=true;message(status,e.message==='noResult'?'noResult':'captureFailed',true);document.body.dataset.ready='error';});
