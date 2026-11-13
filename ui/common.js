export const t=key=>chrome.i18n.getMessage(key)||key;
export const defaults={format:'png',quality:0.92,autoDownload:false,preview:true,theme:'system'};
export function localize(){
  document.documentElement.lang=chrome.i18n.getUILanguage();
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  document.querySelectorAll('[data-label]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.label));el.title=t(el.dataset.label);});
  document.querySelectorAll('[data-version]').forEach(el=>el.textContent='v'+chrome.runtime.getManifest().version);
}
const system=matchMedia('(prefers-color-scheme: dark)');let theme='system';
function applyTheme(){document.documentElement.dataset.theme=theme==='system'?(system.matches?'dark':'light'):theme;}
chrome.storage.local.get({theme:'system'}).then(v=>{theme=v.theme;applyTheme();});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.theme){theme=changes.theme.newValue;applyTheme();}});
system.addEventListener('change',applyTheme);
export async function shortcuts(){return chrome.commands.getAll();}
export function openShortcuts(){return chrome.tabs.create({url:'chrome://extensions/shortcuts'});}
export function message(el,key,error=false){el.textContent=t(key);el.classList.toggle('error',error);}
