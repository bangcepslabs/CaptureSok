import {readResult,saveResult} from '../capture/store.js';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d'),id=new URLSearchParams(location.search).get('id');
let shapeType='rect';
let record,bitmap,source,scene={items:[],crop:null},selected=null,tool='pan',zoom=1,gesture=null,input=null,busy=false,overlay=null;
const undo=[],redo=[],channel=new BroadcastChannel('capturesok-result-'+id);
let pendingFrame=0;
function scheduleRender(){if(!pendingFrame)pendingFrame=requestAnimationFrame(()=>{pendingFrame=0;render();});}
const clone=()=>structuredClone(scene);
function remember(){undo.push(clone());if(undo.length>80)undo.shift();redo.length=0;state();}
function state(){$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;}
function current(){return scene.items.find(o=>o.id===selected);}
function point(e){const r=canvas.getBoundingClientRect();return {x:scene.crop.x+Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:scene.crop.y+Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};}
function font(o){return (o.bold?'bold ':'')+o.fontSize+'px sans-serif';}
function measure(o){ctx.save();ctx.font=font(o);const textWidth=ctx.measureText(o.text).width;o.w=Math.max(o.w||240,textWidth+16);o.h=o.fontSize*1.3;ctx.restore();}
function paint(o){
 ctx.save();ctx.strokeStyle=o.color||'#ff3b30';ctx.fillStyle=o.color||'#ff3b30';ctx.lineWidth=o.lineWidth||5;ctx.lineCap='round';ctx.lineJoin='round';
 if(o.type==='rect')ctx.strokeRect(o.x,o.y,o.w,o.h);
 if(o.type==='ellipse'){ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2,Math.abs(o.w/2),Math.abs(o.h/2),0,0,Math.PI*2);ctx.stroke();}
 if(o.type==='line'||o.type==='arrow'){ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x+o.w,o.y+o.h);ctx.stroke();if(o.type==='arrow'){const angle=Math.atan2(o.h,o.w),length=Math.max(12,(o.lineWidth||5)*3);ctx.beginPath();ctx.moveTo(o.x+o.w,o.y+o.h);ctx.lineTo(o.x+o.w-length*Math.cos(angle-Math.PI/6),o.y+o.h-length*Math.sin(angle-Math.PI/6));ctx.moveTo(o.x+o.w,o.y+o.h);ctx.lineTo(o.x+o.w-length*Math.cos(angle+Math.PI/6),o.y+o.h-length*Math.sin(angle+Math.PI/6));ctx.stroke();}}
 if(o.type==='pen'){ctx.beginPath();o.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
 if(o.type==='text'){ctx.font=font(o);ctx.textBaseline='top';ctx.textAlign=o.align;const x=o.x+(o.align==='center'?o.w/2:o.align==='right'?o.w:0);ctx.fillText(o.text,x,o.y);if(o.underline){const width=ctx.measureText(o.text).width,left=x-(o.align==='center'?width/2:o.align==='right'?width:0);ctx.fillRect(left,o.y+o.fontSize,width,Math.max(1,o.fontSize/16));}}
 if(o.type==='mosaic'){
  const x=Math.max(scene.crop.x,o.x),y=Math.max(scene.crop.y,o.y),w=Math.min(scene.crop.x+canvas.width,o.x+o.w)-x,h=Math.min(scene.crop.y+canvas.height,o.y+o.h)-y;
  if(w>0&&h>0){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w/o.strength));c.height=Math.max(1,Math.ceil(h/o.strength));c.getContext('2d').drawImage(canvas,x-scene.crop.x,y-scene.crop.y,w,h,0,0,c.width,c.height);if(o.shape==='circle'){ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2,o.w/2,o.h/2,0,0,Math.PI*2);ctx.clip();}ctx.imageSmoothingEnabled=false;ctx.drawImage(c,x,y,w,h);}
 }ctx.restore();
}
function render(){
 if(!bitmap)return;
 if(canvas.width!==scene.crop.w||canvas.height!==scene.crop.h){canvas.width=scene.crop.w;canvas.height=scene.crop.h;}
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(-scene.crop.x,-scene.crop.y);ctx.drawImage(bitmap,0,0);scene.items.forEach(paint);
 if(gesture?.draft){const o=gesture.draft;if(tool==='crop'||tool==='mosaic'){ctx.strokeStyle='#00d5bd';ctx.lineWidth=2/zoom;ctx.setLineDash([6/zoom,4/zoom]);ctx.strokeRect(o.x,o.y,o.w,o.h);}else paint(o);}
 ctx.restore();size(zoom);showSelection();
}
function size(z){zoom=Math.max(.01,Math.min(4,z));canvas.style.width=Math.round(canvas.width*zoom)+'px';canvas.style.height=Math.round(canvas.height*zoom)+'px';$('zoom').value=Math.round(zoom*100)+'%';}
function fit(){size(Math.min(1,($('viewport').clientWidth-50)/canvas.width));showSelection();}
function setTool(name){tool=name;document.querySelectorAll('[data-tool]').forEach(b=>{const on=b.dataset.tool===name||(b.dataset.tool==='rect'&&['ellipse','arrow'].includes(name));b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});$('drawingSettings').hidden=!['pen','line','rect','ellipse','arrow'].includes(name);$('shapePickerLabel').hidden=!['rect','ellipse','line','arrow'].includes(name);$('textSettings').hidden=name!=='text';$('cropSettings').hidden=name!=='crop';$('mosaicSettings').hidden=name!=='mosaic';$('toolHint').hidden=name!=='pan';canvas.style.cursor=['pan','text'].includes(name)?'default':'crosshair';}
function syncShapePicker(){const icons={rect:'\u25a1',ellipse:'\u25cb',line:'\u2571',arrow:'\u2197'};$('shapeIcon').textContent=icons[shapeType]||icons.rect;document.querySelectorAll('[data-shape-choice]').forEach(b=>{const active=b.dataset.shapeChoice===shapeType;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
syncShapePicker();
document.querySelectorAll('[data-shape-choice]').forEach(b=>b.onclick=()=>{$('shapePicker').value=b.dataset.shapeChoice;$('shapePicker').dispatchEvent(new Event('change'));$('shapeMenu').open=false;$('shapeTrigger').focus();});
document.addEventListener('pointerdown',e=>{if(!$('shapeMenu').contains(e.target))$('shapeMenu').open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('shapeMenu').open){$('shapeMenu').open=false;$('shapeTrigger').focus();e.stopImmediatePropagation();}});
function select(o){selected=o?.id||null;if(o){setTool(o.type==='text'?'pan':o.type);if(o.type!=='text'){$('shapePicker').value=o.type;shapeType=o.type;syncShapePicker();}if(o.type==='text'){$('textSettings').hidden=false;$('toolHint').hidden=true;$('textSize').value=o.fontSize;$('textColor').value=o.color;$('textBold').checked=o.bold;$('textUnderline').checked=o.underline;$('textAlign').value=o.align;}else{$('color').value=o.color;$('width').value=o.lineWidth;}}showSelection();}
function hit(p){return [...scene.items].reverse().find(o=>['rect','ellipse','line','arrow','text'].includes(o.type)&&p.x>=Math.min(o.x,o.x+o.w)-8/zoom&&p.x<=Math.max(o.x,o.x+o.w)+8/zoom&&p.y>=Math.min(o.y,o.y+o.h)-8/zoom&&p.y<=Math.max(o.y,o.y+o.h)+8/zoom);}
function remove(){if(!current())return;remember();scene.items=scene.items.filter(o=>o.id!==selected);selected=null;render();}
function syncTextControls(){
 for(const [button,control] of [['boldButton','textBold'],['underlineButton','textUnderline']]){const on=$(control).checked;$(button).classList.toggle('active',on);$(button).setAttribute('aria-pressed',String(on));}
 document.querySelectorAll('[data-align]').forEach(b=>{const on=b.dataset.align===$('textAlign').value;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});$('textColorSwatch').style.background=$('textColor').value;
}
for(const [button,control] of [['boldButton','textBold'],['underlineButton','textUnderline']])$(button).onclick=()=>{$(control).checked=!$(control).checked;$(control).dispatchEvent(new Event('change'));syncTextControls();};
document.querySelectorAll('[data-align]').forEach(b=>b.onclick=()=>{$('textAlign').value=b.dataset.align;$('textAlign').dispatchEvent(new Event('change'));syncTextControls();});
$('textColor').addEventListener('input',syncTextControls);
syncTextControls();
function showSelection(){
 syncTextControls();
 overlay?.remove();overlay=null;const o=current();if(!o||input)return;
 const r=canvas.getBoundingClientRect(),sx=r.width/canvas.width,sy=r.height/canvas.height;
 const el=document.createElement('div');el.className='shape-selection';el.dataset.itemId=o.id;Object.assign(el.style,{left:r.left+(Math.min(o.x,o.x+o.w)-scene.crop.x)*sx+'px',top:r.top+(Math.min(o.y,o.y+o.h)-scene.crop.y)*sy+'px',width:Math.max(2,Math.abs(o.w)*sx)+'px',height:Math.max(2,Math.abs(o.h)*sy)+'px'});overlay=el;
 for(const name of ['nw','n','ne','e','se','s','sw','w']){const h=document.createElement('span');h.className='shape-handle '+name;h.dataset.handle=name;el.append(h);}
 const del=document.createElement('button');del.className='shape-delete';del.textContent='×';del.setAttribute('aria-label','선택 항목 삭제');del.onclick=remove;el.append(del);
 el.tabIndex=0;el.setAttribute('aria-label','Selected item. Arrow keys move; Shift and arrow keys resize.');el.onkeydown=e=>{if(e.target!==el)return;const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();remember();if(e.shiftKey){o.w=Math.max(2,o.w+d[0]);o.h=Math.max(2,o.h+d[1]);}else{o.x+=d[0];o.y+=d[1];}render();overlay?.focus();};
 el.onpointerdown=e=>{if(e.button!==0||e.target.closest('button'))return;e.preventDefault();const before=clone(),start=point(e),initial=structuredClone(o),handle=e.target.dataset.handle;let moved=false;
 const onMove=ev=>{moved=true;const p=point(ev),dx=p.x-start.x,dy=p.y-start.y;if(!handle){o.x=initial.x+dx;o.y=initial.y+dy;}else{let l=Math.min(initial.x,initial.x+initial.w),t=Math.min(initial.y,initial.y+initial.h),right=Math.max(initial.x,initial.x+initial.w),bottom=Math.max(initial.y,initial.y+initial.h);if(handle.includes('w'))l=Math.min(right-2,l+dx);if(handle.includes('e'))right=Math.max(l+2,right+dx);if(handle.includes('n'))t=Math.min(bottom-2,t+dy);if(handle.includes('s'))bottom=Math.max(t+2,bottom+dy);Object.assign(o,{x:initial.w<0?right:l,y:initial.h<0?bottom:t,w:initial.w<0?l-right:right-l,h:initial.h<0?t-bottom:bottom-t});if(o.type==='text'){o.fontSize=Math.max(8,Math.min(200,initial.fontSize*o.h/initial.h));measure(o);}}render();};
 const end=ev=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',cancel);if(moved){undo.push(before);redo.length=0;state();}};
 const cancel=()=>{scene=before;end();render();};document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',cancel);
 };el.ondblclick=e=>{if(o.type==='text'&&!e.target.closest('button')){e.preventDefault();editText(o);}};document.body.append(el);
}
function textStyle(){return {fontSize:Math.max(8,Math.min(200,Number($('textSize').value)||32)),color:$('textColor').value,bold:$('textBold').checked,underline:$('textUnderline').checked,align:$('textAlign').value};}
function editText(o,p){
 finishText();const fresh=!o;const item=o||{id:crypto.randomUUID(),type:'text',x:p.x,y:p.y,text:'',...textStyle()};const box=canvas.getBoundingClientRect(),field=document.createElement('input');field.value=item.text;field.placeholder='내용을 입력하세요';field.setAttribute('aria-label','내용을 입력하세요');Object.assign(field.style,{position:'fixed',left:box.left+(item.x-scene.crop.x)*zoom+'px',top:box.top+(item.y-scene.crop.y)*zoom+'px',width:'250px',zIndex:'20',fontSize:Math.max(12,item.fontSize*zoom)+'px',color:item.color,background:'#16263d'});input={field,item,fresh};document.body.append(field);overlay?.remove();field.onblur=()=>finishText();field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finishText();}if(e.key==='Escape'){e.preventDefault();finishText(true);}};field.focus();field.select();
}
function finishText(cancel=false){if(!input)return;const {field,item,fresh}=input;input=null;const text=field.value;field.remove();if(!cancel&&text.trim()){remember();item.text=text;measure(item);if(fresh)scene.items.push(item);selected=item.id;}setTool('pan');if(selected){$('textSettings').hidden=false;$('toolHint').hidden=true;}render();}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{finishText();selected=null;setTool(b.dataset.tool==='rect'?shapeType:b.dataset.tool);showSelection();});$('shapePicker').onchange=()=>{shapeType=$('shapePicker').value;selected=null;setTool(shapeType);syncShapePicker();showSelection();};
let mosaicShape='square';document.querySelectorAll('[data-shape]').forEach(b=>b.onclick=()=>{mosaicShape=b.dataset.shape;document.querySelectorAll('[data-shape]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});});
for(const key of ['color','width','textSize','textColor','textBold','textUnderline','textAlign'])$(key).addEventListener('change',()=>{const o=current();if(!o)return;remember();if(o.type==='text'){Object.assign(o,textStyle());measure(o);}else{Object.assign(o,{color:$('color').value,lineWidth:Number($('width').value)});}render();});
$('width').oninput=()=>$('widthValue').value=$('width').value+'px';$('strength').oninput=()=>$('strengthValue').value=$('strength').value;
canvas.onpointerdown=e=>{if(e.button!==0||busy||!bitmap)return;e.preventDefault();finishText();const p=point(e),o=['pan','rect','ellipse','line','arrow','text'].includes(tool)?hit(p):null;if(o){select(o);return;}selected=null;showSelection();if(tool==='text'){editText(null,p);return;}if(tool==='pan')return;e.preventDefault();canvas.setPointerCapture(e.pointerId);gesture={start:p,draft:{id:crypto.randomUUID(),type:tool,x:p.x,y:p.y,w:0,h:0,color:$('color').value,lineWidth:Number($('width').value),points:[p],strength:Number($('strength').value),shape:mosaicShape}};};
canvas.onpointermove=e=>{if(!gesture)return;const p=point(e),o=gesture.draft,a=gesture.start;if(tool==='pen')o.points.push(p);else if(tool==='line'||tool==='arrow'){if(e.shiftKey){if(Math.abs(p.x-a.x)>=Math.abs(p.y-a.y))p.y=a.y;else p.x=a.x;}o.w=p.x-a.x;o.h=p.y-a.y;}else{if(e.shiftKey&&(tool==='ellipse'||tool==='rect')){const dx=p.x-a.x,dy=p.y-a.y,limitX=dx<0?a.x-scene.crop.x:scene.crop.x+canvas.width-a.x,limitY=dy<0?a.y-scene.crop.y:scene.crop.y+canvas.height-a.y,side=Math.min(Math.max(Math.abs(dx),Math.abs(dy)),limitX,limitY);p.x=a.x+(dx<0?-side:side);p.y=a.y+(dy<0?-side:side);}Object.assign(o,{x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(p.x-a.x),h:Math.abs(p.y-a.y)});}scheduleRender();};
canvas.onpointerup=e=>{if(!gesture)return;canvas.onpointermove(e);const o=gesture.draft;gesture=null;if(tool==='crop'){if(o.w>=2&&o.h>=2){remember();scene.crop={x:Math.floor(o.x),y:Math.floor(o.y),w:Math.floor(o.w),h:Math.floor(o.h)};}}else if(tool==='pen'||Math.abs(o.w)+Math.abs(o.h)>1){remember();scene.items.push(o);if(['rect','ellipse','line','arrow'].includes(o.type))selected=o.id;}render();if(tool==='crop')fit();};
canvas.onpointercancel=()=>{gesture=null;render();};
$('undo').onclick=()=>{finishText();if(undo.length){redo.push(clone());scene=undo.pop();selected=null;render();state();}};
$('redo').onclick=()=>{if(redo.length){undo.push(clone());scene=redo.pop();selected=null;render();state();}};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||busy)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?$('redo'):$('undo')).click();}if(e.key==='Delete')remove();if(e.key==='Escape'){selected=null;gesture=null;render();}});
$('reset').onclick=()=>{remember();scene={items:[],crop:{x:0,y:0,w:bitmap.width,h:bitmap.height}};selected=null;render();fit();};
$('in').onclick=()=>{size(zoom*1.25);showSelection();};$('out').onclick=()=>{size(zoom/1.25);showSelection();};$('fit').onclick=fit;$('cancel').onclick=()=>window.close();$('viewport').onscroll=showSelection;window.onresize=showSelection;
$('done').onclick=async()=>{if(busy||!record)return;finishText();busy=true;$('done').disabled=true;try{render();const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw Error();const latest=await readResult(id);if(!latest)throw Error();await saveResult({...latest,blob,width:canvas.width,height:canvas.height,editSource:source,editScene:clone()});channel.postMessage('updated');window.close();}catch{$('status').textContent='저장하지 못했습니다. 다시 시도해 주세요.';busy=false;$('done').disabled=false;}};
try{record=await readResult(id);if(!record?.blob)throw Error();source=record.editSource||record.blob;bitmap=await createImageBitmap(source);scene=record.editScene||{items:[],crop:{x:0,y:0,w:bitmap.width,h:bitmap.height}};canvas.hidden=false;$('loading').hidden=true;render();fit();$('done').disabled=false;}catch{$('loading').textContent='이미지를 불러오지 못했습니다.';}
