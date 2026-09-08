/* UTF-8 · NVIDIA 官方图 3 的分区坐标与可旋转三维重建。 */
(function(root){
 'use strict';
 const source='https://developer.nvidia.com/blog/inside-nvidia-groq-3-lpx-the-low-latency-inference-accelerator-for-the-nvidia-vera-rubin-platform/';
 const figure='https://developer-blogs.nvidia.com/wp-content/uploads/2026/03/Groq-3-Architecture.webp';
 const nodes={};
 const add=(id,label,x,y,w,h,color,kind='region',rotate=0)=>nodes[id]={id,label,x,y,w,h,color,kind,rotate,z:kind==='package'?0:kind==='die'?18:24,depth:kind==='package'?18:kind==='die'?6:4};
 // 比例取自图 3 的白色分区框；厚度只是显示尺寸，不表示硅片层数。
 add('PACKAGE','',64,66,592,744,'host','package');add('DIE','',86,88,548,700,'frame','die');
 add('MXM_N','MXM',166,96,394,78,'mxm');add('SXM_N','SXM',166,178,394,51,'sxm');
 add('MEM_N','MEM',166,233,394,178,'mem');add('VXM','VXM',166,415,394,47,'vxm');
 add('MEM_S','MEM',166,466,394,178,'mem');add('SXM_S','SXM',166,648,394,51,'sxm');add('MXM_S','MXM',166,703,394,76,'mxm');
 add('ICU','ICU',142,96,20,683,'icu','region',-90);
 add('C2C_NW','C2C',94,127,44,273,'port','region',-90);add('C2C_SW','C2C',94,487,44,266,'port','region',-90);
 add('C2C_NE','C2C',576,127,44,273,'port','region',90);add('C2C_SE','C2C',576,487,44,266,'port','region',90);
 add('CCU','CCU / GPIO',94,404,44,79,'icu','region',-90);add('GPIO','GPIO',576,404,44,79,'port','region',90);
 const bands=['MXM_N','SXM_N','MEM_N','VXM','MEM_S','SXM_S','MXM_S'];
 const descriptions={
  MXM:['矩阵计算','上下两片 MXM 区域，负责密集矩阵乘法。图中给出的整片 FP8 峰值为 1.2 PFLOPS，不能按每个区域重复计入。','1.2 PFLOPS','整片 FP8 峰值'],
  SXM:['数据重排','上下两片 SXM 区域，用于数据移动、permute、rotate 和 transpose。位置按原图重建，内部交换网络未在原图展开。','重排 / 转置','Switch'],
  MEM:['片上存储','VXM 上下各有一片 MEM 区域。500 MB SRAM 与 150 TB/s 是全芯片指标，主要保存权重、激活与指令。','500 MB','全芯片 SRAM'],
  VXM:['向量计算','中央只有一个 VXM 区域，执行逐元素运算、激活函数及类型转换。运行示意中的 SiLU 属于这类操作。','1 个区域','中央向量运算'],
  ICU:['指令控制带','左侧纵向 ICU 带沿中央功能区分布。原图没有公开各条指令的发射周期和完整控制电路。','编译时序','左侧控制带'],
  C2C:['芯片间互连','四个侧边框表示 C2C 所在区域。96 是全芯片连接数，不能把四个框解释为只有四条链路。','96 × 112 Gbps','全芯片连接数 × 单链路速率'],
  CCU:['CCU 与 GPIO','位于左侧两段 C2C 之间；保留原图标注，不从名称推导未公开的内部电路。','CCU / GPIO','原图左侧标注'],
  GPIO:['通用输入输出','位于右侧两段 C2C 之间，位置与原图保持一致。','GPIO','原图右侧标注']
 };
 const flows=[
  {title:'C2C 接入',from:'C2C_NW',to:'MEM_N',instruction:'C2C Receive / MEM 写入',data:'输入激活',kind:'link'},
  {title:'MEM 提供操作数',from:'MEM_N',to:'SXM_N',instruction:'MEM 读取',data:'权重 / 激活向量',kind:'memory'},
  {title:'SXM 调整布局',from:'SXM_N',to:'MXM_N',instruction:'SXM 重排',data:'重排后的操作数',kind:'shuffle'},
  {title:'MXM 矩阵计算',from:'MXM_N',to:'VXM',instruction:'MXM 矩阵乘加',data:'矩阵计算结果',kind:'matrix'},
  {title:'VXM 向量计算',from:'VXM',to:'MEM_S',instruction:'VXM 激活 / 类型转换',data:'向量结果',kind:'vector'},
  {title:'C2C 发送结果',from:'MEM_S',to:'C2C_SE',instruction:'MEM 读取 / C2C Send',data:'输出激活',kind:'link'}
 ];
 const map={width:720,height:890,nodes};
 function createScene({container,assets,onSelect=()=>{},onCameraChange=()=>{},onTextureChange=()=>{}}){
  const ns='http://www.w3.org/2000/svg',stage=document.createElement('div'),holder=document.createElement('div'),solids={};
  let selected=null,frame={scale:1,x:0,y:0},current={index:0,progress:0,vectors:1},layers={data:true,instruction:true,height:100},textureWanted=true,textureReady=false;
  container.replaceChildren(stage);container.classList.add('spatial-scene','g3-canvas');stage.className='spatial-stage g3-world';
  const camera=root.GROQ_SPATIAL_CAMERA.create({container,stage,onChange:onCameraChange});
  let payload=null;
  const ground=document.createElement('div');ground.className='g3-ground';ground.setAttribute('aria-hidden','true');stage.prepend(ground);
  holder.innerHTML=assets.groq3.svg;
  function face(template,w,h,side=false){
   const svg=document.createElementNS(ns,'svg'),n=template.cloneNode(true);svg.setAttribute('viewBox',[-w/2,-h/2,w,h].join(' '));svg.setAttribute('preserveAspectRatio','none');svg.classList.add('g3-face');n.removeAttribute('id');n.setAttribute('transform','translate(0,0)');
   if(side){n.querySelector('.label')?.remove();n.querySelector('title')?.remove();n.removeAttribute('data-hw-id');svg.classList.add('g3-side');}for(const el of n.querySelectorAll('[style]'))el.setAttribute('style',el.getAttribute('style').replace(/!important/g,''));svg.appendChild(n);return svg;
  }
  for(const template of holder.querySelectorAll('[data-hw-id]')){
   const b=nodes[template.dataset.hwId];if(!b)continue;
   const solid=document.createElement('div');solid.className='g3-solid '+b.kind;solid.dataset.region=b.id;solid.dataset.color=b.color;stage.appendChild(solid);
   const top=face(template,b.w,b.h),surfaces={top};top.classList.add('g3-top');solid.appendChild(top);
   const text=top.querySelector('text');if(text){text.style.fontSize=(b.id==='ICU'?15:b.id==='CCU'?12:b.id==='GPIO'?16:b.color==='port'?22:30)+'px';if(b.rotate)text.setAttribute('transform','rotate('+b.rotate+')');}
   if(b.kind==='region'){
    top.setAttribute('tabindex','0');top.setAttribute('role','button');top.setAttribute('aria-label',b.label+'，'+b.id);
    top.addEventListener('click',()=>onSelect(b.id));top.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onSelect(b.id);}});
   }else top.setAttribute('aria-hidden','true');
   for(const name of ['bottom','north','south','west','east']){const f=face(template,b.w,b.h,true);surfaces[name]=f;f.classList.add('g3-'+name);solid.appendChild(f);}
   solids[b.id]={box:b,node:solid,faces:surfaces};
  }
  const markerHolder=document.createElement('div');markerHolder.innerHTML=assets.packet.svg;const packet=markerHolder.querySelector('[data-hw-id="PACKET"]');
  function floating(layer){
   const host=document.createElement('div'),svg=face(packet,180,62),rect=svg.querySelector('rect'),n=svg.querySelector('g.node');host.className='g3-float '+layer;host.setAttribute('aria-hidden','true');
   n.querySelector('.label')?.setAttribute('transform','translate(0,0)');rect.setAttribute('x','-90');rect.setAttribute('y','-31');rect.setAttribute('width','180');rect.setAttribute('height','62');rect.setAttribute('rx','6');svg.querySelector('text')?.replaceChildren();host.appendChild(svg);stage.appendChild(host);
   const pin=document.createElement('div'),line=face(packet,180,62,true);pin.className='g3-pin '+layer;const r=line.querySelector('rect');for(const [k,v]of Object.entries({x:-90,y:-31,width:180,height:62,rx:0}))r.setAttribute(k,v);pin.appendChild(line);stage.appendChild(pin);return{host,svg,pin};
  }
  const data=floating('data'),instruction=floating('instruction');
  function label(f,a,b){const t=f.svg.querySelector('text');t.replaceChildren();t.setAttribute('x',0);t.setAttribute('y',-4);t.style.fontSize='14px';t.setAttribute('text-anchor','middle');for(const [i,line]of [a,b].entries()){const span=document.createElementNS(ns,'tspan');span.setAttribute('x',0);if(i)span.setAttribute('dy',21);span.textContent=line;t.appendChild(span);}}
  const center=id=>{const b=nodes[id];return{x:b.x+b.w/2,y:b.y+b.h/2,z:b.z+b.depth};};
  function placeFloat(f,at,z,enabled,offset={x:0,y:0}){
   f.host.hidden=!enabled;f.pin.hidden=!enabled;const ax=frame.x+at.x*frame.scale,ay=frame.y+at.y*frame.scale,dx=offset.x*frame.scale,dy=offset.y*frame.scale,x=ax+dx,y=ay+dy,base=at.z*frame.scale,flat=Math.hypot(dx,dy);
   f.host.style.left=x+'px';f.host.style.top=y+'px';f.host.style.transform='translateZ('+(z+base)+'px) var(--space-inverse)';
   f.pin.style.left=ax+'px';f.pin.style.top=ay+'px';f.pin.style.height=Math.hypot(flat,z)+'px';f.pin.style.transform='translateZ('+base+'px) rotateZ('+Math.atan2(-dx,dy)+'rad) rotateX('+Math.atan2(z,flat)+'rad)';
  }
  function draw(index=0,progress=0,vectors=1){
   current={index,progress,vectors};const p={...flows[index],...(payload?.from?{from:payload.from,to:payload.to}:{})},a=center(p.from),b=center(p.to),t=Math.max(0,Math.min(1,progress)),e=t*t*(3-2*t),at={x:a.x+(b.x-a.x)*e,y:a.y+(b.y-a.y)*e,z:a.z+(b.z-a.z)*e};
   for(const [id,s]of Object.entries(solids)){s.node.classList.toggle('g3-active',id===(t>=1?p.to:p.from));s.node.classList.toggle('g3-target',id===p.to);s.node.classList.toggle('g3-picked',id===selected);}
   label(data,payload?.data||p.data,payload?.size||vectors+' × 320 B');label(instruction,'ICU · 指令计划',payload?.instruction||p.instruction);
   const icu=center('ICU'),controlX=Math.min(760,(stage.clientWidth-frame.x-120)/frame.scale-icu.x);placeFloat(data,at,layers.height,layers.data,{x:80-at.x,y:-65});placeFloat(instruction,icu,layers.height+50,layers.instruction,{x:controlX,y:-115});
  }
  function resize(){
   const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
   frame.scale=Math.max(.1,Math.min((w-70)/map.width,(h-75)/(map.height*.79)));frame.x=(w-map.width*frame.scale)/2;frame.y=(h-map.height*frame.scale)/2+35;
   ground.style.cssText='left:'+(frame.x+36*frame.scale)+'px;top:'+(frame.y+30*frame.scale)+'px;width:'+648*frame.scale+'px;height:'+800*frame.scale+'px;transform:translateZ(-14px)';
   for(const {box:b,node,faces:f}of Object.values(solids)){
    const s=frame.scale,bw=b.w*s,bh=b.h*s,d=b.depth*s;node.style.width=bw+'px';node.style.height=bh+'px';node.style.transform='translate3d('+(frame.x+b.x*s)+'px,'+(frame.y+b.y*s)+'px,'+b.z*s+'px)';
    for(const n of [f.top,f.bottom]){n.style.width=bw+'px';n.style.height=bh+'px';}f.top.style.transform='translateZ('+d+'px)';
    if(b.kind!=='package'){f.top.style.backgroundSize=1590*s+'px '+860*s+'px';f.top.style.backgroundPosition=-(b.x+428)*s+'px '+-(b.y+20)*s+'px';}
    for(const n of [f.north,f.south]){n.style.width=bw+'px';n.style.height=d+'px';}f.north.style.transform='rotateX(90deg)';f.south.style.transform='translateY('+bh+'px) rotateX(90deg)';
    for(const n of [f.west,f.east]){n.style.width=d+'px';n.style.height=bh+'px';}f.west.style.transform='rotateY(-90deg)';f.east.style.transform='translateX('+bw+'px) rotateY(-90deg)';
   }
   draw(current.index,current.progress,current.vectors);
  }
  function setTexture(wanted){textureWanted=wanted;const visible=wanted&&textureReady;container.dataset.texture=String(visible);for(const {box,faces}of Object.values(solids))if(box.kind!=='package')faces.top.style.backgroundImage=visible?'url("'+figure+'")':'none';onTextureChange({wanted,ready:textureReady,visible});}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const referenceImage=new Image();referenceImage.onload=()=>{textureReady=true;setTexture(textureWanted);};referenceImage.onerror=()=>{textureReady=false;setTexture(textureWanted);};referenceImage.src=figure;
  return{camera,resize,draw,setTexture,setPayload:next=>{payload=next;},get texture(){return{wanted:textureWanted,ready:textureReady};},get solids(){return solids;},select:id=>{selected=id;draw(current.index,current.progress,current.vectors);},setLayers:next=>{layers={...layers,...next};draw(current.index,current.progress,current.vectors);},get layers(){return{...layers};}};
 }
 function init(){
  const main=document.getElementById('groq3-main');if(!main)return;const M=root.LPX_MODEL,$=id=>document.getElementById(id),levels=M.levels;
  const state={model:'q27',weightBytes:1,prompt:'用一句话解释芯片如何计算下一个 token。',tokens:128,layer:1,rack:0,slot:0,chip:0,expert:67};let plan=M.stepsFor(state.model);
  let index=0,elapsed=0,running=false,raf=null,last=0,view='external',follow=true,exploded=false,metaKey='',chipScene,systemScene;const duration=3800;
  const bytes=n=>n===null?'待配置':n>=1e9?(n/1e9).toFixed(2)+' GB':n>=1e6?(n/1e6).toFixed(2)+' MB':n>=1e3?(n/1e3).toFixed(2)+' KB':n+' B';
  const ns=n=>n===null?'未公开':n>=1e3?(n/1e3).toFixed(3)+' μs':n.toFixed(2)+' ns';
  $('g3-prompt').value=state.prompt;
  function setModelUI(){plan=M.stepsFor(state.model);const cfg=M.configuration(state.model,state.weightBytes);main.dataset.model=state.model;$('g3-flow').innerHTML=plan.map((f,i)=>'<button data-g3-step="'+i+'"><span class="g3-flow-num">'+String(i+1).padStart(2,'0')+'</span><b>'+f.title+'</b></button>').join('');$('g3-rack').innerHTML=Array.from({length:cfg.assignedRacks},(_,i)=>'<option value="'+i+'">机架 '+i+'</option>').join('');$('g3-rack').hidden=!cfg.moe;$('g3-expert').hidden=!cfg.moe;$('g3-expert').innerHTML=M.exampleExperts.map(e=>'<option value="'+e+'">跟踪 E'+e+'</option>').join('');$('g3-layer').max=cfg.layers;$('g3-layer').setCustomValidity('');}setModelUI();
  $('g3-levels').innerHTML=levels.map((l,i)=>'<button data-g3-level="'+l.id+'"><span>'+String(i+1).padStart(2,'0')+'</span> '+l.name+'</button>').join('');
  $('g3-slot').innerHTML=Array.from({length:32},(_,i)=>'<option value="'+i+'">槽位 '+String(i).padStart(2,'0')+'</option>').join('');
  $('g3-chip').innerHTML=Array.from({length:8},(_,i)=>'<option value="'+i+'">本托盘 LPU '+i+'</option>').join('');
  function currentCamera(){return view==='chip'?chipScene.camera:systemScene.camera;}
  function cameraStatus(v){$('g3-zoom').textContent=Math.round(v.zoom*100)+'%';}
  function setView(next,animate=true){if(!levels.some(l=>l.id===next))return;view=next;const chip=next==='chip';$('g3-canvas').hidden=!chip;$('g3-system-canvas').hidden=chip;if(chip){chipScene.resize();if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)$('g3-canvas').animate([{opacity:.15},{opacity:1}],{duration:360});}else{systemScene.show(next,animate);systemScene.explode(0);}
   const l=levels.find(l=>l.id===next);$('g3-level-title').textContent=l.title;$('g3-level-hint').textContent=l.hint;$('g3-source-image').href=M.sources[l.source];main.querySelectorAll('[data-g3-level]').forEach(e=>e.setAttribute('aria-current',e.dataset.g3Level===next?'location':'false'));$('g3-up').disabled=next==='external';$('g3-enter').disabled=chip;$('g3-enter').textContent={external:'进入 LPX 机架',rack:'打开选中托盘',tray:'展开 8 芯片互联',fabric:'进入选中芯片',chip:'已在芯片内部'}[next];$('g3-texture').disabled=!chip;$('g3-explode').disabled=!['rack','tray'].includes(next);exploded=false;$('g3-explode').setAttribute('aria-pressed','false');cameraStatus(currentCamera().value);metaKey='';render();
  }
  function inspect(){follow=false;$('g3-follow').setAttribute('aria-pressed','false');}
  function selectAssignment(){const info=M.chipInfo(state);if(info.assigned){state.layer=info.layer;if(info.activeExperts?.length)state.expert=info.activeExperts[0];}inspect();metaKey='';render();}
  function pickSlot(value){stop();state.slot=Math.max(0,Math.min(31,Number(value)));selectAssignment();}
  function pickChip(value){stop();state.chip=Math.max(0,Math.min(7,Number(value)));selectAssignment();}
  function selectPart(p){if(p.slot!==undefined){pickSlot(p.slot);return;}if(p.chip!==undefined){pickChip(p.chip);return;}stop();$('g3-part-name').textContent=p.part;const notes={NIC:'图 2：BlueField-4 DPU 或 ConnectX-9 NIC，属于不同配置选项。',FE:'Fabric 扩展逻辑把网络侧与 LPU 计算侧连接起来；容量和位置依据图 2。',HOST:'Host CPU 负责托盘运行时和控制，不代表所有激活必须逐字节经过 CPU。',SPINE:'C2C spine 连接不同托盘；此处移出显示，以便观察连接关系。',ETH_PORT:'图 2 标注 400 Gb/s Ethernet；页面采用单口裸数据序列化下界。',LPX:'双击进入 32 个计算槽位。',RUBIN:'GPU 执行 Prefill 与 Decode Attention，LPX 执行本例 FFN。'};$('g3-part-note').textContent=notes[p.part]||'该部件属于 '+levels.find(l=>l.id===p.level).name+'。硬件位置为便于观察的布局示意。';}
  chipScene=createScene({container:$('g3-canvas'),assets:root.HARDWARE_SVGS,onCameraChange:v=>{if(view==='chip')cameraStatus(v);},onSelect:id=>{stop();chipScene.select(id);const info=descriptions[id.split('_')[0]];$('g3-part-name').textContent=nodes[id].label+' · '+info[0];$('g3-part-note').textContent=info[1];},onTextureChange:v=>{$('g3-texture').setAttribute('aria-pressed',String(v.visible));}});
  systemScene=root.LPX_SCENE.create({container:$('g3-system-canvas'),assets:root.HARDWARE_SVGS,onSelect:selectPart,onEnter:next=>{inspect();setView(next);},onCameraChange:v=>{if(view!=='chip')cameraStatus(v);}});
  function render(){if(!chipScene||!systemScene)return;const step=plan[index],cost=M.metric(state,step),t=elapsed/duration,a=cost.a,moe=!!cost.cfg.moe,target=M.location(state,step),selected=state.rack===target.rack&&state.slot===target.slot&&(moe?state.chip===target.chip:state.chip===a.root||state.chip===a.peer);systemScene.draw(state,step,t);$('g3-system-canvas').dataset.showData=$('g3-data-layer').getAttribute('aria-pressed');$('g3-system-canvas').dataset.showInstruction=$('g3-instruction-layer').getAttribute('aria-pressed');
   const short={load:'C2C Receive / MEM 写入',router:'MXM Router → VXM Top-10',weights:'MEM.Read / SXM.Reorder',gateup:'MXM · Gate + Up',silu:'VXM · SiLU × Up',down:'MXM · Down',reduce:'VXM · 部分和求和'}[step.id]||'编译好的 FFN 计划';const route={router:['MXM_N','VXM'],weights:['MEM_N','SXM_N'],gateup:['SXM_N','MXM_N'],silu:['MEM_N','VXM'],down:['VXM','MXM_S']}[step.id];
   chipScene.setPayload({data:step.data,size:cost.payloadBytes===null?'张量形状待配置':bytes(cost.payloadBytes),instruction:short,...(route?{from:route[0],to:route[1]}:{})});chipScene.setLayers({data:$('g3-data-layer').getAttribute('aria-pressed')==='true'&&step.level==='chip'&&(selected||!a),instruction:$('g3-instruction-layer').getAttribute('aria-pressed')==='true'&&step.level==='chip'&&(selected||!a)});chipScene.draw(step.chipPhase||0,t,cost.bytes===null?1:Math.ceil(cost.bytes/320));
   $('g3-range').value=Math.round((index+t)/plan.length*1000);$('g3-progress').textContent=(index+1)+' / '+plan.length+' · '+Math.round(t*100)+'%';$('g3-progress-fill').style.width=Math.round(t*100)+'%';
   const key=[index,view,state.model,state.weightBytes,state.prompt,state.tokens,state.layer,state.rack,state.slot,state.chip,state.expert].join('|');if(key===metaKey)return;metaKey=key;
   main.querySelectorAll('[data-g3-step]').forEach(n=>n.setAttribute('aria-current',Number(n.dataset.g3Step)===index?'step':'false'));
   $('g3-instruction').textContent=step.instruction;$('g3-data').textContent=step.data+(cost.payloadBytes===null?'':' · '+bytes(cost.payloadBytes))+(moe&&['load','weight','gateup','vector','down','reduce','broadcast'].includes(step.kind)?' · E'+state.expert:'');$('g3-step-name').textContent=step.title;$('g3-step-note').textContent=step.note;
   $('g3-rack').value=state.rack;$('g3-slot').value=state.slot;$('g3-chip').value=state.chip;$('g3-expert').value=state.expert;$('g3-layer').value=state.layer;$('g3-layer').disabled=false;
   $('g3-scope').textContent=cost.scope;$('g3-time').textContent=ns(cost.ns);$('g3-bytes').textContent=bytes(cost.bytes);$('g3-time-rule').textContent=cost.rule;$('g3-bandwidth').textContent=cost.bandwidth?(cost.bandwidth/1e9).toFixed(0)+' GB/s':cost.memoryNs!==null?'150 TB/s':'—';$('g3-flops').textContent=cost.flops===null?'—':(cost.flops/1e6).toFixed(2)+' MFLOPs';
   $('g3-roofline').textContent=cost.computeNs!==null&&state.weightBytes===1?'计算 '+ns(cost.computeNs)+' / 权重读取 '+ns(cost.memoryNs):step.kind==='vector'?'h = SiLU(g) ⊙ u，g、u 各有 '+a.channels+' 个元素。':'未公开的等待、协议、同步与软件开销未计入。';
   $('g3-weight-total').textContent=bytes(cost.cfg.totalWeightBytes);$('g3-weight-fit').textContent='至少 '+cost.cfg.minChips+' 颗 / '+cost.cfg.minTrays+' 托盘 / '+cost.cfg.minRacks+' 机架';$('g3-weight-note').textContent=(moe?'125B 主模型 + 51B n-gram + 4B MTP；约 6B 激活。按语言权重规模估算，视觉编码器另计。':'')+'按 '+state.weightBytes+' B/参数；未含元数据、激活与工作空间。这不是 AFD 的实际放置量。';
   $('g3-deploy-name').textContent='示例 '+(moe?'MoE':'FFN')+' 映射 · '+cost.cfg.assignedTrays+' 托盘 / '+cost.cfg.assignedChips+' LPU';$('g3-deploy-note').textContent=moe?'48 层 × EP'+cost.cfg.ep+'；每片 '+cost.cfg.expertsPerChip+' 个路由专家。普通片 '+bytes(cost.cfg.shardWeightBytes)+'，根片含共享专家与路由 '+bytes(cost.cfg.rootWeightBytes)+'；共 '+cost.cfg.assignedRacks+' 机架。仅 MoE 放在 LPX。':'64 层 × TP2；每托盘 4 层。每片 FFN 权重 '+bytes(cost.cfg.shardWeightBytes)+'。Attention 留在 GPU。';
   const info=M.chipInfo(state);$('g3-model-note').textContent=moe?'48 层 · D 2560 · 512 专家 · Top-10 + 共享':'64 层 · D 5120 · FFN 17408 · 混合 Attention';$('g3-location').textContent='机架 '+state.rack+' / 槽位 '+String(state.slot).padStart(2,'0')+' / LPU '+String(info.global).padStart(3,'0');$('g3-assignment').textContent=info.assigned?'本片：'+info.label+(moe?' · 命中 '+(info.activeExperts.map(e=>'E'+e).join('、')||'无'):''):'备用槽位 · 本例没有分配 FFN';
   $('g3-request-route').textContent=moe?'第 '+a.layer+' 层 · E'+state.expert+' → 机架 '+a.rack+' / 槽 '+a.slot+' / LPU '+a.globalPeer+' · 根片 '+a.globalRoot:'请求 A · 第 '+a.layer+' 层 → 槽位 '+String(a.slot).padStart(2,'0')+' / LPU '+a.globalRoot+' + '+a.globalPeer;$('g3-prev').disabled=index===0&&elapsed===0;$('g3-next').disabled=index===plan.length-1&&elapsed===duration;
   $('g3-model-source').href=moe?M.sources.flash:M.sources.qwen;$('g3-model-source').textContent=(moe?'Flash-Next':'27B')+' 官方配置 ↗';
   if(moe&&view==='fabric'){$('g3-level-title').textContent='专家并行：路由到命中芯片';$('g3-level-hint').textContent='Top-10 + 共享 · 当前跟踪 E'+state.expert+' · '+(cost.cfg.ep===16?'两托盘通过 C2C spine 交接':'同托盘八片');}
  }
  function stop(){running=false;if(raf!==null)cancelAnimationFrame(raf);raf=null;$('g3-play').textContent='连续演示';$('g3-play').setAttribute('aria-pressed','false');}
  function routeToStep(){Object.assign(state,M.location(state,plan[index]));if(follow)setView(plan[index].level);}
  function seek(i,t=0){stop();index=Math.max(0,Math.min(plan.length-1,i));elapsed=Math.max(0,Math.min(1,t))*duration;metaKey='';routeToStep();render();}
  function tick(now){if(!running)return;elapsed+=Math.max(0,now-last);last=now;let changed=false;while(elapsed>=duration&&index<plan.length-1){elapsed-=duration;index++;changed=true;}if(changed){routeToStep();metaKey='';}if(index===plan.length-1&&elapsed>=duration){elapsed=duration;render();stop();return;}render();raf=requestAnimationFrame(tick);}
  function play(){if(running){stop();return;}if(index===plan.length-1&&elapsed>=duration){index=0;elapsed=0;}follow=true;$('g3-follow').setAttribute('aria-pressed','true');routeToStep();running=true;last=performance.now();$('g3-play').textContent='暂停演示';$('g3-play').setAttribute('aria-pressed','true');raf=requestAnimationFrame(tick);}
  $('g3-flow').addEventListener('click',e=>{const n=e.target.closest('[data-g3-step]');if(n){follow=true;$('g3-follow').setAttribute('aria-pressed','true');seek(Number(n.dataset.g3Step));}});main.querySelectorAll('[data-g3-level]').forEach(n=>n.addEventListener('click',()=>{inspect();setView(n.dataset.g3Level);}));
  $('g3-enter').addEventListener('click',()=>{inspect();const i=levels.findIndex(l=>l.id===view);if(i<4)setView(levels[i+1].id);});$('g3-up').addEventListener('click',()=>{inspect();const i=levels.findIndex(l=>l.id===view);if(i>0)setView(levels[i-1].id);});$('g3-follow').addEventListener('click',()=>{follow=!follow;$('g3-follow').setAttribute('aria-pressed',String(follow));if(follow)routeToStep();});
  $('g3-play').addEventListener('click',play);$('g3-prev').addEventListener('click',()=>seek(elapsed>0?index:index-1));$('g3-next').addEventListener('click',()=>{follow=true;$('g3-follow').setAttribute('aria-pressed','true');seek(index===plan.length-1?index:index+1,index===plan.length-1?1:0);});$('g3-replay').addEventListener('click',()=>{follow=true;seek(0);play();});$('g3-range').addEventListener('input',e=>{follow=true;const n=Number(e.target.value)/1000*plan.length;seek(Math.min(plan.length-1,Math.floor(n)),n===plan.length?1:n%1);});
  $('g3-model').addEventListener('change',e=>{state.model=e.target.value;state.layer=1;state.rack=0;state.slot=0;state.chip=0;state.expert=67;setModelUI();follow=true;seek(0);});$('g3-precision').addEventListener('change',e=>{stop();state.weightBytes=Number(e.target.value);setModelUI();routeToStep();metaKey='';render();});$('g3-prompt').addEventListener('input',e=>{state.prompt=e.target.value;metaKey='';render();});$('g3-tokens').addEventListener('input',e=>{const n=Number(e.target.value);if(!Number.isInteger(n)||n<1||n>262144){e.target.setCustomValidity('请输入 1–262144 的整数');return;}e.target.setCustomValidity('');state.tokens=n;metaKey='';render();});$('g3-layer').addEventListener('input',e=>{const n=Number(e.target.value),max=M.models[state.model].layers;if(!Number.isInteger(n)||n<1||n>max){e.target.setCustomValidity('请输入 1–'+max+' 的整数');return;}e.target.setCustomValidity('');state.layer=n;Object.assign(state,M.location(state,plan[index]));metaKey='';render();});
  $('g3-rack').addEventListener('change',e=>{stop();state.rack=Number(e.target.value);selectAssignment();});$('g3-expert').addEventListener('change',e=>{state.expert=Number(e.target.value);follow=true;seek(index);});
  $('g3-slot').addEventListener('change',e=>pickSlot(e.target.value));$('g3-chip').addEventListener('change',e=>pickChip(e.target.value));$('g3-reset').addEventListener('click',()=>view==='chip'?chipScene.camera.reset():systemScene.reset());$('g3-plan').addEventListener('click',()=>view==='chip'?chipScene.camera.preset(false):systemScene.reset(true));$('g3-minus').addEventListener('click',()=>currentCamera().set({zoom:currentCamera().value.zoom/1.15}));$('g3-plus').addEventListener('click',()=>currentCamera().set({zoom:currentCamera().value.zoom*1.15}));$('g3-texture').addEventListener('click',()=>chipScene.setTexture(!chipScene.texture.wanted));
  for(const layer of ['data','instruction'])$('g3-'+layer+'-layer').addEventListener('click',()=>{const n=$('g3-'+layer+'-layer');n.setAttribute('aria-pressed',String(n.getAttribute('aria-pressed')!=='true'));render();});$('g3-height').addEventListener('input',e=>chipScene.setLayers({height:Number(e.target.value)}));$('g3-explode').addEventListener('click',()=>{exploded=!exploded;systemScene.explode(exploded?1:0);$('g3-explode').setAttribute('aria-pressed',String(exploded));});
  function activate(){root.GROQ_LAB?.stop();root.dispatchEvent(new Event('groq:pause'));document.body.dataset.workspace='groq3';for(const w of ['groq3','cycle','cluster','single'])$('show-'+w).setAttribute('aria-pressed',String(w==='groq3'));document.querySelector('.skip').href='#groq3-main';setView(view,false);}
  $('show-groq3').addEventListener('click',activate);for(const id of ['show-cycle','show-cluster','show-single'])$(id).addEventListener('click',()=>{stop();$('show-groq3').setAttribute('aria-pressed','false');});root.addEventListener('groq:pause',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  root.GROQ3_SPACE_APP={scene:chipScene,systemScene,stop,seek,activate,setView,pickSlot,pickChip,get state(){return{...state,index,elapsed,running,view,follow};}};render();activate();
 }

 const api={map,bands,source,figure,flows,descriptions,createScene};root.GROQ3_SPACE=api;if(typeof module!=='undefined')module.exports=api;
 if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
})(typeof window==='undefined'?globalThis:window);
