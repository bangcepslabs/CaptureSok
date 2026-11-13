(() => {
  if(globalThis.__captureSokV2)return;globalThis.__captureSokV2=true;
  const t=key=>chrome.i18n.getMessage(key);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  let state=null;
  function host(){
    const h=document.createElement('div');h.dataset.capturesok='overlay';
    h.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
    const root=h.attachShadow({mode:'closed'});document.documentElement.append(h);return {h,root};
  }
  function restore(){
    if(!state)return;
    const s=state;state=null;clearInterval(s.timer);s.controller.abort();s.h?.remove();s.style?.remove();
    for(const [el,prop,value,priority] of (s.styles||[]).reverse()){
      if(value)el.style.setProperty(prop,value,priority);else el.style.removeProperty(prop);
    }
    if(s.full){
      const root=document.documentElement,old=root.style.getPropertyValue('scroll-behavior'),priority=root.style.getPropertyPriority('scroll-behavior');
      root.style.setProperty('scroll-behavior','auto','important');scrollTo(s.x,s.y);
      if(old)root.style.setProperty('scroll-behavior',old,priority);else root.style.removeProperty('scroll-behavior');
    }
  }
  function cancel(){const token=state?.token;restore();chrome.runtime.sendMessage({type:'CANCEL',token}).catch(()=>{});}
  function setStyle(el,prop,value){state.styles.push([el,prop,el.style.getPropertyValue(prop),el.style.getPropertyPriority(prop)]);el.style.setProperty(prop,value,'important');}
  function on(target,type,handler,options={}){target.addEventListener(type,handler,{...options,signal:state.controller.signal});}
  function init(token,mode){
    restore();state={token,mode,controller:new AbortController(),styles:[],started:Date.now(),last:Date.now(),x:scrollX,y:scrollY,iw:innerWidth,ih:innerHeight};
    const s=state;
    s.timer=setInterval(()=>{
      if(state!==s)return;
      if(Date.now()-s.started>180000||(s.full&&Date.now()-s.last>15000)){cancel();return;}
      chrome.runtime.sendMessage({type:'HEARTBEAT',token}).then(r=>{if(!r?.ok&&state===s)restore();}).catch(()=>{if(state===s)restore();});
    },4000);
    on(window,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();}},{capture:true});
    on(window,'resize',cancel);on(window,'pagehide',restore);
    if(mode==='region'||mode==='element')select(mode);
  }
  function select(mode){
    const s=state;Object.assign(s,host());
    s.root.innerHTML='<style>*{box-sizing:border-box}.surface{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;background:#07152566}.box{position:fixed;border:2px solid #54e2c1;box-shadow:0 0 0 99999px #07152580;pointer-events:none}.tip{position:fixed;top:18px;left:50%;transform:translateX(-50%);max-width:90vw;background:#123c39;color:#fff;padding:11px 17px;border:1px solid #6bcdb080;border-radius:12px;font:13px/1.5 system-ui;box-shadow:0 5px 24px #0003;pointer-events:none}.size{display:block;color:#a9f3dc;text-align:center}</style><div class="surface"></div><div class="box" hidden></div><div class="tip"><span></span><span class="size"></span></div>';
    const surface=s.root.querySelector('.surface'),box=s.root.querySelector('.box'),tip=s.root.querySelector('.tip span'),size=s.root.querySelector('.size');
    tip.textContent=t(mode==='region'?'dragHint':'elementHint');
    let origin=null,rect=null,element=null,lastPoint=null;
    const clamp=(n,max)=>Math.max(0,Math.min(n,max));
    function draw(r){rect=r;box.hidden=false;surface.style.background='transparent';Object.assign(box.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});size.textContent=Math.round(r.width)+' × '+Math.round(r.height)+' px';}
    function choose(el){
      if(!el)return;element=el;const r=el.getBoundingClientRect();
      draw({x:clamp(r.left,innerWidth),y:clamp(r.top,innerHeight),width:Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left)),height:Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top))});
    }
    function hit(e){
      s.h.style.setProperty('display','none','important');let el=document.elementFromPoint(e.clientX,e.clientY),next;
      while(el?.shadowRoot&&(next=el.shadowRoot.elementFromPoint(e.clientX,e.clientY))&&next!==el)el=next;
      s.h.style.removeProperty('display');return el;
    }
    on(surface,'pointermove',e=>{
      if(mode==='element'){lastPoint=e;choose(hit(e));}
      else if(origin){const x=clamp(e.clientX,innerWidth),y=clamp(e.clientY,innerHeight);draw({x:Math.min(origin.x,x),y:Math.min(origin.y,y),width:Math.abs(x-origin.x),height:Math.abs(y-origin.y)});}
    });
    on(surface,'pointerdown',e=>{e.preventDefault();e.stopPropagation();if(e.button!==0)return;origin={x:e.clientX,y:e.clientY};surface.setPointerCapture(e.pointerId);if(mode==='element'&&!rect)choose(hit(e));});
    on(surface,'pointerup',async e=>{
      e.preventDefault();e.stopPropagation();if(e.button!==0||!origin)return;
      if(!rect||rect.width<3||rect.height<3){origin=null;tip.textContent=t('minimumSelection');return;}
      const selection={...rect,viewportWidth:innerWidth,viewportHeight:innerHeight,scrollX,scrollY};
      s.h.remove();await frames();await wait(80);
      if(state!==s)return;
      const r=await chrome.runtime.sendMessage({type:'SELECTED',token:s.token,rect:selection}).catch(()=>null);
      if(!r?.ok){restore();notice(t('interrupted'));}
    });
    on(window,'keydown',e=>{
      if(mode==='element'&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='ArrowUp')choose(element?.parentElement||element?.getRootNode()?.host);else if(lastPoint)choose(hit(lastPoint));}
    },{capture:true});
    on(window,'wheel',e=>{e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});
    on(window,'touchmove',e=>e.preventDefault(),{capture:true,passive:false});
    on(window,'scroll',()=>{if(state===s&&(scrollX!==s.x||scrollY!==s.y))cancel();});
  }
  function prepare(){
    const s=state;s.full=true;
    s.style=document.createElement('style');s.style.textContent='html{scroll-behavior:auto!important;scrollbar-width:none!important}*{scroll-behavior:auto!important;scroll-snap-type:none!important;animation-play-state:paused!important;transition:none!important}::-webkit-scrollbar{display:none!important}';document.documentElement.append(s.style);
    s.fixed=[];
    for(const el of document.querySelectorAll('body *')){
      const position=getComputedStyle(el).position;
      if(position==='fixed')s.fixed.push(el);
      if(position==='sticky')setStyle(el,'position','relative');
    }
    Object.assign(s,host());s.root.innerHTML='<style>.progress{position:fixed;right:20px;top:20px;background:#123c39;color:white;padding:12px 18px;border-radius:12px;font:13px system-ui;box-shadow:0 4px 20px #0003}</style><div class="progress"></div>';
    for(const type of ['wheel','touchmove','pointerdown'])on(window,type,e=>{e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});
    on(window,'keydown',e=>{if(e.key!=='Escape'){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
    const root=document.documentElement;
    s.width=Math.max(root.scrollWidth,document.body?.scrollWidth||0,innerWidth);s.height=Math.max(root.scrollHeight,document.body?.scrollHeight||0,innerHeight);
    s.vw=root.clientWidth;s.vh=root.clientHeight;s.iw=innerWidth;s.ih=innerHeight;s.dpr=devicePixelRatio;
    return {width:s.width,height:s.height,vw:s.vw,vh:s.vh,dpr:s.dpr};
  }
  async function scrollTile(m){
    const s=state;s.last=Date.now();
    if(m.index===1)for(const el of s.fixed)setStyle(el,'visibility','hidden');
    s.h.style.removeProperty('display');s.root.querySelector('.progress').textContent=t('capturing')+' '+(m.index+1)+' / '+m.total+' · ESC';
    scrollTo(m.x,m.y);await frames();await wait(160);
    const pending=[...document.images].filter(im=>!im.complete&&im.getBoundingClientRect().bottom>0&&im.getBoundingClientRect().top<innerHeight);
    await Promise.race([Promise.all(pending.map(im=>im.decode().catch(()=>{}))),wait(600)]);
    if(state!==s)throw Error('cancelled');
    if(innerWidth!==s.iw||innerHeight!==s.ih||devicePixelRatio!==s.dpr||Math.abs(scrollX-m.x)>1||Math.abs(scrollY-m.y)>1)throw Error('pageChanged');
    if(Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0)>s.height+2||Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)>s.width+2)throw Error('pageChanged');
    s.h.style.setProperty('display','none','important');await frames();
    return {x:scrollX,y:scrollY,innerWidth,innerHeight};
  }
  function notice(message){const {h,root}=host();root.innerHTML='<style>div{position:fixed;right:20px;top:20px;max-width:400px;padding:16px;background:#123c39;color:white;border-radius:12px;font:14px/1.5 system-ui}</style><div></div>';root.querySelector('div').textContent=message;setTimeout(()=>h.remove(),7000);}
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(sender.id!==chrome.runtime.id)return;
    const run=async()=>{
      if(m.type==='NOTICE'){notice(m.message);return {ok:true};}
      if(m.type==='INIT'){init(m.token,m.mode);return {ok:true};}
      if(!state||state.token!==m.token)return {error:'interrupted'};
      state.last=Date.now();
      if(m.type==='RESTORE'){restore();return {ok:true};}
      if(m.type==='FULL_PREPARE')return prepare();
      if(m.type==='FULL_SCROLL')return scrollTile(m);
      if(m.type==='VALIDATE'){
        const r=m.rect;
        if(r&&(innerWidth!==r.viewportWidth||innerHeight!==r.viewportHeight||scrollX!==r.scrollX||scrollY!==r.scrollY))throw Error('pageChanged');
        await frames();return {ok:true};
      }
      return {error:'interrupted'};
    };
    run().then(reply).catch(e=>reply({error:e.message}));return true;
  });
})();
