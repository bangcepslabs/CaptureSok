import {localize,defaults,shortcuts,t,openShortcuts,message} from '../ui/common.js';

localize();const status=document.querySelector('#status');
const quality=document.querySelector('#quality'),qualityValue=document.querySelector('#qualityValue');
function sync(){qualityValue.value=quality.value+'%';document.querySelector('#autoDownload').disabled=!document.querySelector('#preview').checked;}
const values=await chrome.storage.local.get(defaults);
for(const [key,value] of Object.entries(values)){const el=document.getElementById(key);if(!el)continue;if(el.type==='checkbox')el.checked=value;else el.value=key==='quality'?Math.round(value*100):value;}sync();
quality.addEventListener('input',()=>qualityValue.value=quality.value+'%');
document.querySelectorAll('#format,#quality,#autoDownload,#preview,#theme').forEach(el=>el.addEventListener('change',async()=>{
  const value=el.type==='checkbox'?el.checked:el.id==='quality'?Number(el.value)/100:el.value;
  try{await chrome.storage.local.set({[el.id]:value});sync();message(status,'saved');}catch{message(status,'saveFailed',true);}
}));
async function showShortcuts(){
  const commands=await shortcuts(),list=document.querySelector('#shortcutList');list.replaceChildren();let missing=false;
  for(const mode of ['region','element','full','visible']){
    const row=document.createElement('div'),name=document.createElement('span'),key=document.createElement('kbd');row.className='shortcut-row';
    const shortcut=commands.find(c=>c.name==='capture-'+mode)?.shortcut;missing ||= !shortcut;
    name.textContent=t(mode);key.textContent=shortcut||t('unassigned');row.append(name,key);list.append(row);
  }
  document.querySelector('#missing').hidden=!missing;
}
document.querySelector('#editShortcuts').onclick=openShortcuts;await showShortcuts();window.addEventListener('focus',showShortcuts);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)showShortcuts();});
