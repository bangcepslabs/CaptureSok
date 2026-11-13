import {localize,t,shortcuts,openShortcuts,message} from '../ui/common.js';
localize();const status=document.querySelector('#status');
const buttons=[...document.querySelectorAll('[data-mode]')];
shortcuts().then(commands=>{for(const button of buttons)button.querySelector('kbd').textContent=commands.find(c=>c.name==='capture-'+button.dataset.mode)?.shortcut||t('unassigned');});
buttons.forEach(button=>button.onclick=async()=>{
  buttons.forEach(b=>b.disabled=true);status.textContent='';
  try{const response=await chrome.runtime.sendMessage({type:'START',mode:button.dataset.mode});if(!response?.ok)throw Error(response?.error||'captureFailed');window.close();}
  catch(e){message(status,e.message,true);buttons.forEach(b=>b.disabled=false);}
});
document.querySelector('#settings').onclick=()=>chrome.runtime.openOptionsPage();
document.querySelector('#shortcuts').onclick=openShortcuts;
chrome.storage.session.get(['error','job']).then(({error,job})=>{
  if(error){message(status,error.code||'captureFailed',true);chrome.runtime.sendMessage({type:'CLEAR_ERROR'});}
  if(job){message(status,'capturing');document.querySelector('#cancel').hidden=false;}
});
document.querySelector('#cancel').onclick=async()=>{await chrome.runtime.sendMessage({type:'CANCEL'});message(status,'cancelled');document.querySelector('#cancel').hidden=true;};
