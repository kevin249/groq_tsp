/* UTF-8 · 同一块芯片内的语义放大。整个学习过程只装载一次主场景。 */
(function(root){
 'use strict';const A=root.HARDWARE_ATLAS_MAP,ns='http://www.w3.org/2000/svg';
 const paintClasses=['hw-idle','hw-active','hw-data','hw-gold','hw-computed','hw-mask','hw-current','hw-picked','source-selected'];
 function create({container,assets,onSelect,onLocation}){
  container.innerHTML=assets.atlas.svg;
  const svg=container.querySelector('svg'),elements={},circuits={};let ctx=A.context(),geometry=A.layout(ctx),lastLayout='',lastState=null,currentLogical='die';
  svg.setAttribute('role','group');svg.setAttribute('aria-label','同一颗 TSP 的功能区域、所选切片及内部硬件');svg.classList.add('fixed-atlas');
  for(const n of svg.querySelectorAll('[data-hw-id]')){
   const id=n.dataset.hwId;elements[id]=n;const spec=A.specs[id];if(!spec)continue;
   n.style.transformBox='view-box';n.style.transformOrigin='0 0';n.dataset.owner=spec.owner;n.dataset.kind=spec.kind;
   const title=document.createElementNS(ns,'title');title.textContent=spec.label;n.appendChild(title);
   if(['region','heading','tile','detail','port','peer','external','pin'].includes(spec.kind)){
    n.dataset.interactive='true';n.setAttribute('role','button');n.setAttribute('tabindex',spec.kind==='tile'?'-1':'0');
    const action=()=>onSelect(id,ctx);n.addEventListener('click',action);n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();action();}});
   }
  }
  // 其他芯片仍用 Mermaid 的同一芯片结构缩影，嵌入片间场景的硬件边框。
  for(let i=1;i<4;i++){
   const holder=document.createElement('div');holder.innerHTML=assets.die.svg.replaceAll('hw_die','peer'+i+'_hw_die');const mini=holder.querySelector('svg');
   mini.querySelectorAll('[data-hw-id]').forEach(n=>n.removeAttribute('data-hw-id'));
   mini.setAttribute('x','1244');mini.setAttribute('y',String(142+(i-1)*230));mini.setAttribute('width','158');mini.setAttribute('height','104');mini.setAttribute('class','peer-mini');mini.style.pointerEvents='none';svg.appendChild(mini);
  }
  for(const[z,,kind]of A.zones.filter(v=>v[2]==='mxm')){
   const holder=document.createElement('div');holder.innerHTML=assets.mac.svg.replaceAll('hw_mac',z+'_internal_hw_mac');const mini=holder.querySelector('svg');
   mini.querySelectorAll('[data-hw-id]').forEach(n=>{n.dataset.macPart=n.dataset.hwId;n.removeAttribute('data-hw-id');});
   mini.setAttribute('width','298');mini.setAttribute('height','315');mini.setAttribute('class','mac-in-place');mini.style.pointerEvents='none';mini.style.opacity='0';svg.appendChild(mini);circuits[z]=mini;
  }
  function label(id,lines){
   const n=elements[id],b=geometry.nodes[id];if(!n||!b)return;const t=n.querySelector('text');if(!t)return;
   const physical=A.specs[id],isFrame=physical.kind==='frame';let arr=lines.map(String);
   if(['region','tile','lanepin','pin','bridge'].includes(physical.kind))arr=[];
   const font=physical.kind==='heading'?(b.w<65?10:16):physical.kind==='location'?12:physical.kind==='frame'?16:physical.kind==='detail'?(ctx.lab?14:12):14;
   const max=Math.max(4,Math.floor((b.w-8)/(font*.7)));
   arr=arr.map(line=>line.length>max?line.slice(0,max-1)+'…':line);
   if(b.h<29&&arr.length>1)arr=[arr.join(' ').slice(0,max)];
   t.replaceChildren();t.style.fontSize=font+'px';t.setAttribute('text-anchor',isFrame?'start':'middle');t.setAttribute('x',isFrame?String(-b.w/2+16):'0');t.setAttribute('y',isFrame?String(-b.h/2+23):String(4-(arr.length-1)*7));
   arr.forEach((line,i)=>{const span=document.createElementNS(ns,'tspan');span.setAttribute('x',isFrame?String(-b.w/2+16):'0');if(i)span.setAttribute('dy','14');span.textContent=line;t.appendChild(span);});
  }
  function relayout(next){
   ctx=next;geometry=A.layout(ctx);const sig=[ctx.kind,ctx.sl,ctx.slice,ctx.external,[...ctx.detail].join(','),ctx.mac?ctx.mac.row+','+ctx.mac.col:''].join(':');if(sig===lastLayout)return;lastLayout=sig;
   for(const[id,b]of Object.entries(geometry.nodes)){
    const n=elements[id];if(!n)continue;const r=n.querySelector('rect');
    n.style.transform=`translate(${b.x+b.w/2}px,${b.y+b.h/2}px)`;n.style.opacity=b.visible?'1':'0';n.style.pointerEvents=b.visible?'auto':'none';n.setAttribute('aria-hidden',String(!b.visible));
    if(n.getAttribute('role')==='button'&&b.kind!=='tile')n.setAttribute('tabindex',b.visible?'0':'-1');
    if(r){r.setAttribute('x',String(-b.w/2));r.setAttribute('y',String(-b.h/2));r.setAttribute('width',String(Math.max(1,b.w)));r.setAttribute('height',String(Math.max(1,b.h)));}
   }
   const outside=ctx.external||['host','output','decode'].includes(ctx.kind),cluster=ctx.kind==='cluster';
   // 仅改变摄影视野，芯片、服务区与其他芯片的对象一直都在原场景中。
   svg.setAttribute('viewBox',`0 0 ${cluster?1430:1224} ${outside?1020:760}`);
   for(const[z,name]of A.zones){label(z+'HEAD',[geometry.boxes[z].w<65?name.replace('中央 ','').replace('西 ','W ').replace('东 ','E '):name]);label(z+'LOC',[`示意切片 ${ctx.slice} · SL ${String(ctx.sl).padStart(2,'0')} · 原位展开`]);}
   for(const[z,mini]of Object.entries(circuits)){
    const b=geometry.nodes[z+'CIRCUIT'];mini.style.opacity=b.visible?'1':'0';mini.setAttribute('x',String(b.x+12));mini.setAttribute('y',String(b.y+84));
    if(b.visible){const t=elements[z+'CIRCUIT'].querySelector('text');label(z+'CIRCUIT',[`MAC [${ctx.mac.row}, ${ctx.mac.col}] 的内部`,`来自左侧亮边单元 · 仍在 ${A.zones.find(v=>v[0]===z)[1]}`]);t.setAttribute('y','-178');}
   }
  }
  function shownKey(key){
   if(!key)return null;const b=geometry.nodes[key];if(!b)return null;if(b.visible)return key;
   const owner=b.owner;if(!A.group(owner))return key;
   return owner+'R'+ctx.sl+(owner.startsWith('MEM')?'C'+Math.min(ctx.slice,7):'');
  }
  function mapped(id,kind=currentLogical){return A.resolve(id,ctx,kind);}
  function node(id,kind=currentLogical){return elements[shownKey(mapped(id,kind))]||null;}
  function point(id,kind=currentLogical){
   const n=node(id,kind);if(!n)return null;
   const matrix=n.getCTM(),outer=svg.getCTM();if(!matrix||!outer)return null;const p=svg.createSVGPoint();p.x=0;p.y=0;
   const at=p.matrixTransform(outer.inverse().multiply(matrix));return{x:at.x,y:at.y};
  }
  function physicalPoint(key){const n=elements[key];if(!n)return null;const m=n.getCTM(),outer=svg.getCTM();if(!m||!outer)return null;const p=svg.createSVGPoint();return p.matrixTransform(outer.inverse().multiply(m));}
  function route(packet){
   const from=mapped(packet.from),to=mapped(packet.to),a=point(packet.from),b=point(packet.to);if(!a||!b)return[];
   const ao=A.specs[from]?.owner,bo=A.specs[to]?.owner;
   if(from==='CONTROL')return[{x:b.x,y:a.y},b];
   if(ao===bo)return[a,b];
   if(A.group(ao)&&A.group(bo)){
    const lane=Number(packet.from.match(/(?:L|R|X)(\d)$/)?.[1]||packet.to.match(/(?:L|R|X)(\d)$/)?.[1]||0)%4;
    const ap=physicalPoint(ao+'PIN'+lane),bp=physicalPoint(bo+'PIN'+lane);return[a,ap,bp,b].filter(Boolean);
   }
   if(ao==='HOST'&&A.group(bo)){const port=physicalPoint('PCIE'),bp=physicalPoint(bo+'PIN');return[a,port,bp,b].filter(Boolean);}
   if(bo==='HOST'&&A.group(ao)){const ap=physicalPoint(ao+'PIN'),port=physicalPoint('PCIE');return[a,ap,port,b].filter(Boolean);}
   return[a,b];
  }
  const skip=(id,kind)=>kind==='memory'&&/^(?:A\d\d|BANK.*|READHEAD|READOUT)$/.test(id)||kind==='mxm'&&/^(?:ROW\d|WCOL\d|ROWLABEL|CORNER|SUMHEAD|SUMEND)$/.test(id)||(kind==='kv'||kind==='decode')&&/^(?:P\d|TITLE|MIX)$/.test(id)||kind==='output'&&/^(?:F1|F2|FIFOHEAD)$/.test(id)||kind==='cluster'&&!/OUT$|^C2C$/.test(id);
  function applyValue(id,value,kind){
   const key=mapped(id,kind);if(!key||skip(id,kind))return;const physical=A.specs[key];if(!physical)return;
   const target=elements[shownKey(key)];target?.classList.add(...value.classes);
   if(!geometry.nodes[key]?.visible)return;
   const lines=value.label.map(String),base=physical.label;let display=[base,...lines.filter(v=>v!==base)];
   if(/^B\dR\dL\d$/.test(key.split('__')[1]||''))display=kind==='lab'?[lines.at(-1)]:kind==='kv'||kind==='decode'?[lines[0].replace(/[\[\]]/g,'')+'='+lines.at(-1)]:['L'+key.slice(-1)+'='+lines.at(-1)];
   if(display.length>3)display=[base,...lines.slice(-2)];
   label(key,display);elements[key].querySelector('title').textContent=A.address(key,ctx)+'\n'+lines.join(' / ');
   elements[key].setAttribute('aria-label',A.address(key,ctx)+'，'+lines.join('，'));
  }
  function render({state,kind,context,patch,selected,macPatch}){
   currentLogical=kind;lastState=state;relayout(context);
   for(const[id,n]of Object.entries(elements)){
    paintClasses.forEach(c=>n.classList.remove(c));const s=A.specs[id];if(s.kind==='detail'||s.kind==='external'||s.kind==='port')label(id,[s.label]);
    if(s.kind==='tile'){
     const row=Number(id.match(/R(\d+)/)?.[1]),col=Number(id.match(/C(\d+)/)?.[1]||0);
     if(row===ctx.sl){n.classList.add('hw-active');if(ctx.detail.has(s.owner)&&(!s.owner.startsWith('MEM')||col===ctx.slice))n.classList.add('source-selected');}
    }
    if(s.kind==='region'&&ctx.detail.has(id))n.classList.add('hw-active');
   }
   for(const[id,value]of Object.entries(patch))applyValue(id,value,kind);
   if(ctx.mac&&ctx.detail.has(ctx.matrix)){
    const mini=circuits[ctx.matrix],values=macPatch||root.HARDWARE_SCENE.scene(state,'mac',null,ctx.mac);
    for(const[id,value]of Object.entries(values)){
     const n=mini.querySelector(`[data-mac-part="${id}"]`),t=n.querySelector('text');paintClasses.forEach(c=>n.classList.remove(c));n.classList.add(...value.classes);t.replaceChildren();n.querySelector('.label')?.setAttribute('transform','translate(0,0)');t.setAttribute('x','0');t.setAttribute('y',String(5-(value.label.length-1)*9));t.setAttribute('text-anchor','middle');t.style.fontSize='14px';value.label.forEach((line,i)=>{const span=document.createElementNS(ns,'tspan');span.setAttribute('x','0');if(i)span.setAttribute('dy','18');span.textContent=String(line);t.appendChild(span);});
    }
   }
   if(ctx.mac)elements[ctx.matrix+'__M'+ctx.mac.row+ctx.mac.col]?.classList.add('hw-picked');
   if(selected&&elements[selected])elements[selected].classList.add('hw-picked');
   const primary=[...ctx.detail][0]||ctx.zone,loc=selected||primary;
   onLocation(A.address(loc,ctx),ctx);
  }
  function focus(ids){container.querySelectorAll('.lesson-focus').forEach(n=>n.classList.remove('lesson-focus'));ids.forEach(id=>node(id)?.classList.add('lesson-focus'));}
  function select(id){container.querySelectorAll('.hw-picked').forEach(n=>n.classList.remove('hw-picked'));elements[id]?.classList.add('hw-picked');onLocation(A.address(id,ctx),ctx);}
  return{render,node,point,route,focus,select,address:id=>A.address(id,ctx),get context(){return ctx;},get state(){return lastState;}};
 }
 root.HARDWARE_ATLAS={create};
})(window);
