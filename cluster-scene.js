/* UTF-8 · Mermaid 硬件保持独立，三维数据卡与指令卡只通过锚点引用硬件。 */
(function(root){
 'use strict';
 const M=root.GROQ_CLUSTER_MAP,C=root.GROQ_CLUSTER,ns='http://www.w3.org/2000/svg';
 const states=['hw-data','hw-gold','hw-computed','hw-current','hw-active','hw-idle','hw-picked'];
 function create({container,assets,onSelect,onCameraChange=()=>{}}){
  container.innerHTML=assets.cluster6.svg;
  const svg=container.querySelector('svg'),stage=document.createElement('div'),hardware={},cards={},planes=[],pins=[];
  let viewport={x:0,y:0,w:M.width,h:M.height},options={tilted:true,data:true,instruction:true,height:96},phase={focus:[],packets:[]},selected=null,lastSize='';
  stage.className='spatial-stage';container.classList.add('spatial-scene');container.replaceChildren(stage);stage.appendChild(svg);
  svg.classList.add('cluster-atlas','spatial-plane','spatial-hardware');svg.setAttribute('aria-label','TSP 硬件基底：功能切片、20 条 SL、ICU 与 C2C 接口');svg.setAttribute('role','group');planes.push(svg);
  const elements=Array.from(svg.querySelectorAll('[data-hw-id]'));
  function emptyPlane(name){const p=svg.cloneNode(false);p.removeAttribute('id');p.setAttribute('class','cluster-atlas spatial-plane '+name);p.setAttribute('aria-hidden','true');p.style.pointerEvents='none';stage.appendChild(p);planes.push(p);return p;}
  const depth=emptyPlane('spatial-depth'),dataPlane=emptyPlane('spatial-data'),instructionPlane=emptyPlane('spatial-instruction');
  const center=b=>({x:b.x+b.w/2,y:b.y+b.h/2});
  const camera=root.GROQ_SPATIAL_CAMERA.create({container,stage,onChange:v=>{options.tilted=v.tilted;onCameraChange(v);}});
  function title(n,value){let t=n.querySelector('title');if(!t){t=document.createElementNS(ns,'title');n.appendChild(t);}t.textContent=value;}
  function interactive(n,id){n.setAttribute('tabindex','0');n.setAttribute('role','button');n.dataset.interactive='true';n.addEventListener('click',()=>onSelect(id));n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onSelect(id);}});}
  function clip(s,width,font){if([...String(s)].reduce((w,ch)=>w+font*(ch.charCodeAt(0)<128?.56:1),0)<=width)return String(s);let used=0,out='';for(const ch of String(s)){const next=font*(ch.charCodeAt(0)<128?.56:1);if(used+next>width-font)return out+'…';used+=next;out+=ch;}return out;}
  function label(n,lines,b,card=false){
   const t=n.querySelector('text');if(!t)return;
   const arr=Array.isArray(lines)?lines:[lines],font=card?12:b.kind==='sl-label'?11:['slice','controller'].includes(b.kind)?12:13;
   t.replaceChildren();t.style.fontSize=font+'px';t.style.textAnchor='middle';t.setAttribute('x','0');
   t.setAttribute('y',String(card?-(arr.length-1)*8+4:b.kind==='slice'?-b.h/2+14:4-(arr.length-1)*7));
   arr.forEach((line,i)=>{const span=document.createElementNS(ns,'tspan');span.setAttribute('x','0');if(i)span.setAttribute('dy',card?'16':b.kind==='slice'?'12':'14');span.textContent=clip(line,b.w-8,font);t.appendChild(span);});
  }
  function makePin(node,layer){
   const pin=document.createElement('div'),face=document.createElementNS(ns,'svg'),line=node.querySelector('rect').cloneNode(false);
   pin.className='spatial-pin '+layer;pin.setAttribute('aria-hidden','true');face.setAttribute('viewBox','0 0 2 100');face.setAttribute('preserveAspectRatio','none');
   line.setAttribute('x','0');line.setAttribute('y','0');line.setAttribute('width','2');line.setAttribute('height','100');line.setAttribute('rx','0');line.removeAttribute('style');line.setAttribute('class','spatial-pin-line');face.appendChild(line);pin.appendChild(face);stage.appendChild(pin);pins.push(pin);return pin;
  }
  function makeCard(id,source){
   if(cards[id])return cards[id];const spec=M.nodes[id],layer=spec.layer==='instruction'||spec.kind==='controller'||id.endsWith('_PROG')||id.endsWith('_ICU')?'instruction':'data';
   const host=document.createElement('div'),face=document.createElementNS(ns,'svg'),node=source;
   host.className='spatial-card '+layer;host.dataset.cardFor=id;face.setAttribute('viewBox','-72 -32 144 64');face.setAttribute('class','cluster-atlas spatial-card-face');face.setAttribute('overflow','visible');
   node.removeAttribute('id');node.setAttribute('transform','translate(0,0)');node.dataset.kind='readout';node.dataset.layer=layer;
   const rect=node.querySelector('rect');rect.setAttribute('x','-70');rect.setAttribute('y','-30');rect.setAttribute('width','140');rect.setAttribute('height','60');rect.setAttribute('rx','7');
   node.querySelector('.label')?.setAttribute('transform','translate(0,0)');face.appendChild(node);host.appendChild(face);stage.appendChild(host);interactive(node,id);
   const card={id,node,host,pin:makePin(node,layer),layer,spec:{...spec,w:140,h:60},at:center(spec),visible:false};cards[id]=card;return card;
  }
  for(const n of elements){
   const id=n.dataset.hwId,b=M.nodes[id];if(!b)continue;
   if(b.layer!=='hardware'){n.remove();makeCard(id,n);continue;}
   hardware[id]=n;n.dataset.layer='hardware';title(n,b.label);
   if(!['frame','chip','tile','stream-lane','sl-label'].includes(b.kind))interactive(n,id);
   label(n,['frame','chip','tile','stream-lane'].includes(b.kind)?[]:b.kind==='slice'?[b.label,b.color==='mxm'?'MAC':b.color==='vxm'?'ALU':b.color==='sxm'?'重排':'SRAM']:b.label,b);
   if(['chip','slice'].includes(b.kind)){const clone=n.cloneNode(true);clone.removeAttribute('id');clone.removeAttribute('data-hw-id');clone.removeAttribute('tabindex');clone.removeAttribute('role');clone.querySelector('.label')?.remove();clone.querySelector('title')?.remove();clone.setAttribute('class','spatial-solid');depth.appendChild(clone);}
  }
  function cardFor(id){if(cards[id])return cards[id];if(!hardware[id])return null;return makeCard(id,hardware[id].cloneNode(true));}
  function placeCards(){
   const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
   const scale=Math.min(w/viewport.w,h/viewport.h),mx=(w-viewport.w*scale)/2,my=(h-viewport.h*scale)/2;
   const factor=Math.max(.8,Math.min(1.15,scale)),overview=viewport.w>1000,shown=new Set();
   if(overview)for(const owner of ['C0','C1','C2','C3'])for(const layer of ['data','instruction']){
    const candidates=Object.values(cards).filter(c=>c.visible&&c.spec.owner===owner&&c.layer===layer);
    const rank=c=>c.id===selected?-100:c.runtimeAnchor?-50:phase.focus.includes(c.id)?phase.focus.indexOf(c.id):100;
    candidates.sort((a,b)=>rank(a)-rank(b));if(candidates[0])shown.add(candidates[0].id);
   }
   for(const card of Object.values(cards)){
    const x=mx+(card.at.x-viewport.x)*scale,y=my+(card.at.y-viewport.y)*scale;
    const enabled=options[card.layer],detail=!overview||!/^C\d$/.test(card.spec.owner)||shown.has(card.id),visible=card.visible&&enabled&&detail&&x>=-90&&x<=w+90&&y>=-60&&y<=h+60;
    card.host.hidden=!visible;card.pin.hidden=!visible;card.node.setAttribute('tabindex',visible?'0':'-1');card.node.setAttribute('aria-hidden',String(!visible));
    card.host.style.left=x+'px';card.host.style.top=y+'px';card.host.style.width=144*factor+'px';card.host.style.height=64*factor+'px';
    const anchor=card.anchorAt||card.at,ax=mx+(anchor.x-viewport.x)*scale,ay=my+(anchor.y-viewport.y)*scale;
    const z=options.height+(card.layer==='instruction'?40:0),dx=x-ax,dy=y-ay,flat=Math.hypot(dx,dy);
    card.pin.style.left=ax+'px';card.pin.style.top=ay+'px';card.pin.style.height=Math.hypot(flat,z)+'px';card.pin.style.transform='rotateZ('+Math.atan2(-dx,dy)+'rad) rotateX('+Math.atan2(z,flat)+'rad)';
   }
  }
  function setViewport(box){
   const stamp=[box.x,box.y,box.w,box.h,stage.clientWidth,stage.clientHeight].join(':');if(stamp===lastSize)return;lastSize=stamp;viewport={...box};stage.dataset.board=String(box.w>1000);
   for(const p of planes){p.setAttribute('viewBox',[box.x,box.y,box.w,box.h].join(' '));p.setAttribute('preserveAspectRatio','xMidYMid meet');}
   placeCards();
  }
  function setLayers(next={}){
   options={...options,...next};options.height=Math.max(32,Math.min(148,Number(options.height)||96));
   if(Object.hasOwn(next,'tilted'))camera.preset(next.tilted);
   stage.style.setProperty('--data-z',options.height+'px');stage.style.setProperty('--instruction-z',(options.height+40)+'px');
   dataPlane.style.visibility=options.data?'visible':'hidden';instructionPlane.style.visibility=options.instruction?'visible':'hidden';placeCards();
  }
  function render(model,patch,picked,currentPhase){
   if(currentPhase)phase=currentPhase;selected=picked;
   const executing=new Set([...phase.focus,...phase.packets.flatMap(p=>[p.from,p.to])]);
   const active=new Set([...executing,...(selected?[selected]:[])]);
   const instructionValues={};
   for(const card of Object.values(cards)){card.runtimeAnchor=null;card.anchorAt=null;card.at=center(M.nodes[card.id]);}
   for(const owner of new Set([...executing].map(id=>M.nodes[id]?.owner).filter(o=>/^C\d$/.test(o||'')))){
    const candidates=[...executing].map(M.hardwareId).filter(id=>M.nodes[id]?.owner===owner&&M.nodes[id]?.kind==='slice');
    const unit=(phase.instruction||'').match(/^(MXM|VXM|SXM)/)?.[1]?.toLowerCase();
    const target=candidates.find(id=>unit&&M.nodes[id].color===unit)||candidates[0];
    if(!target)continue;const control=owner+'_CTRL_'+target.slice(owner.length+1),card=cards[owner+'_ICU'],die=M.nodes[owner+'_DIE'];
    if(!card||!M.nodes[control])continue;
    card.runtimeAnchor=control;card.anchorAt=center(M.nodes[control]);card.at={x:die.x+55,y:die.y+445};
    active.add(card.id);instructionValues[card.id]={label:[phase.instruction||root.GROQ_SOFTWARE_FLOW?.instruction(phase)||'按编译计划执行'],classes:['hw-current']};
   }
   const footprints=new Set([...active].map(id=>cards[id]?.runtimeAnchor||M.hardwareId(id)));
   for(const [id,n]of Object.entries(hardware)){
    states.forEach(k=>n.classList.remove(k));const b=M.nodes[id];
    if(/^C\d$/.test(b.owner)&&!model.chips[Number(b.owner[1])].active)n.classList.add('hw-idle');
    if(footprints.has(id))n.classList.add('hw-active');if(M.hardwareId(selected)===id)n.classList.add('hw-picked');
   }
   for(const card of Object.values(cards))card.visible=false;
   for(const id of active){
    const b=M.nodes[id];if(!b||['TITLE','DIE'].some(k=>id.endsWith('_'+k))||b.kind==='wire')continue;
    if(b.layer==='hardware'&&!patch[id])continue;
    const card=cardFor(id);if(!card)continue;const v=instructionValues[id]||patch[id]||{label:[b.label],classes:[]};
    states.forEach(k=>card.node.classList.remove(k));card.node.classList.add(...v.classes);card.visible=true;
    const owner=M.nodes[card.runtimeAnchor]||M.anchor(id),name=owner?.label||b.label;
    const heading=card.runtimeAnchor?'指令 · '+M.nodes[card.runtimeAnchor.replace('_CTRL_','_')].label+' ICU':b.layer==='hardware'?(id==='HOST'?'主机缓冲 · DRAM':name):b.label+' · '+(name.startsWith('MEM')?'MEM':name.startsWith('MXM')?'MXM':name.startsWith('VXM')?'VXM':name);
    const lines=[heading,...v.label.filter(s=>s!==heading&&s!==b.label)].slice(0,3);
    label(card.node,lines,card.spec,true);title(card.node,'硬件归属：'+name+'；'+v.label.join('；'));card.node.setAttribute('aria-label','悬浮'+(card.layer==='instruction'?'指令':'数据')+'，归属 '+name+'，'+v.label.join('，'));
   }
   // 点击功能区域时，可以查看该区域的存储内容；硬件名称和几何仍保持原样。
   if(selected&&M.nodes[selected]?.layer==='hardware')for(const [id,card]of Object.entries(cards))if(card.spec.anchor===selected&&patch[id]){
    card.visible=options[card.layer];label(card.node,[card.spec.label,...patch[id].label].slice(0,3),card.spec,true);title(card.node,'归属 '+M.nodes[selected].label+'；'+patch[id].label.join('；'));
   }
   placeCards();
  }
  const point=id=>M.nodes[id]?center(M.nodes[id]):null;
  function route(p){
   if(p.wire)return M.packetPath(p,C.route).map(point).filter(Boolean);
   let a=point(p.from),b=point(p.to);if(!a||!b)return[];
   if(p.from.endsWith('_ICU')){const target=M.hardwareId(p.to),match=target.match(/^(C\d)_(MW[01]|ME[01]|MEMW|MEME|SW|SE|VX)$/);if(match)a=point(match[1]+'_CTRL_'+match[2])||a;return[a,{x:b.x,y:a.y},b];}
   const owner=p.from.match(/^C\d_/);if(owner&&p.to.startsWith(owner[0])){const bus=point(owner[0]+'SRF');return[a,{x:a.x,y:bus.y},{x:b.x,y:bus.y},b];}
   return[a,b];
  }
  setLayers();setViewport(viewport);
  return{render,point,route,node:id=>hardware[cards[id]?.runtimeAnchor||M.hardwareId(id)]||cards[id]?.node||null,svg,setViewport,setLayers,setCamera:camera.set,resetCamera:camera.reset,get camera(){return camera.value;},overlayFor:tone=>tone==='control'?instructionPlane:dataPlane,address:id=>{
   const b=M.nodes[id];if(!b)return'';const head=/^C\d$/.test(b.owner)?'TSP '+b.owner[1]+' / ':b.owner==='HOST'?'芯片外 / ':'板上 / ';
   return head+(b.layer==='hardware'?b.label:(M.nodes[cards[id]?.runtimeAnchor]||M.anchor(id)).label+' / '+(b.layer==='instruction'?'指令':'数据')+'：'+b.label);
  },get layers(){return{...options};},get hardware(){return hardware;},get cards(){return cards;}};
 }
 root.GROQ_CLUSTER_SCENE={create};
})(window);
