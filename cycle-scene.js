/* UTF-8 · 将整数周期快照写入同一幅 Mermaid 硬件图，不用动画进度伪造寄存器状态。 */
(function(root){
 'use strict';
 function create({container,assets,map,onInspect}){
  container.innerHTML=assets.cycle9.svg;const svg=container.querySelector('svg'),elements={};svg.setAttribute('role','group');svg.setAttribute('aria-label','TSP 逐周期硬件窗口：SRAM、流寄存器、MXM、SXM、VXM 与独立 ICU');
  for(const n of svg.querySelectorAll('[data-hw-id]')){const id=n.dataset.hwId;elements[id]=n;n.setAttribute('tabindex',map.nodes[id].kind==='frame'?'-1':'0');n.setAttribute('role','button');n.addEventListener('click',()=>onInspect?.(id));n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.code==='Space'){e.preventDefault();onInspect?.(id);}});}
  const colors=['cycle-instruction','cycle-data-valid','cycle-working','cycle-write','cycle-selected','cycle-invalid','cycle-pulse'];
  function label(id,lines,size){const n=elements[id];if(!n)return;const t=n.querySelector('text');if(!t)return;const a=Array.isArray(lines)?lines:[lines],font=size||(map.nodes[id].kind==='cell'?14:16);t.replaceChildren();t.setAttribute('x','0');t.setAttribute('y',String(font*.35-(a.length-1)*(font+2)/2));t.style.fontSize=font+'px';for(let i=0;i<a.length;i++){const s=document.createElementNS('http://www.w3.org/2000/svg','tspan');s.setAttribute('x','0');if(i)s.setAttribute('dy',String(font+2));s.textContent=a[i];t.appendChild(s);}}
  function mark(id,type='cycle-data-valid',pulse=false){const n=elements[id];if(!n)return;n.classList.add(type);if(pulse)n.classList.add('cycle-pulse');}
  const compact=a=>a.map(root.GROQ_CYCLE.fmt).join(', '),short=(s,n=16)=>s.length>n?s.slice(0,n-1)+'…':s;
  function render(m,s,tracked){
   for(const [id,n]of Object.entries(elements)){colors.forEach(k=>n.classList.remove(k));label(id,map.nodes[id].label,map.nodes[id].kind==='tile'?12:map.nodes[id].kind==='caption'?14:undefined);n.style.display='';}
   label('WINDOW','西侧切片与中央 VXM · SL '+s.superlane+' 的内部观察窗口',17);
   const byId=Object.fromEntries(m.program.map(i=>[i.id,i]));
   for(const unit of ['MEM_A','MEM_B']){
    const visits=m.program.filter(i=>i.unit===unit&&['read','write'].includes(i.kind)&&(i.kind==='read'?i.consume:i.ready)+s.superlane<=s.cycle);
    for(let bank=0;bank<2;bank++){const last=visits.filter(i=>i.address%2===bank).at(-1),mem=last?s.store[last.memory]:Object.values(s.store).find(v=>v.unit===unit&&v.address%2===bank&&v.valid);const id=unit+'_BANK'+bank;
     if(mem?.valid){label(id,['重组 · a'+mem.address,compact(mem.values.slice(0,2)),compact(mem.values.slice(2,4))],12);if(s.committed.some(i=>i.kind==='write'&&i.memory===mem.id))mark(id,'cycle-write',true);}else label(id,['Bank '+bank,'未写入'],14);
    }
    const active=s.active.filter(i=>i.unit===unit&&['read','write'].includes(i.kind)&&i.consume+s.superlane<=s.cycle).at(-1);if(active){label(unit+'_ADDR','a'+active.address+' · '+(active.kind==='read'?'读':'写'),14);mark(unit+'_ADDR','cycle-instruction');mark(unit+'_BANK'+active.address%2,active.kind==='write'?'cycle-write':'cycle-data-valid');}
    const read=m.program.filter(i=>i.unit===unit&&i.kind==='read'&&i.ready+s.superlane<=s.cycle).at(-1);if(read){const now=read.ready+s.superlane===s.cycle;label(unit+'_READ',[now?'有效读出':'读出残值',short(compact(read.values),13)],12);mark(unit+'_READ',now?'cycle-data-valid':'cycle-invalid');}
   }
   const loads=m.program.filter(i=>i.kind==='lw'&&i.ready+s.superlane<=s.cycle);if(loads.length){label('WEIGHT','权重缓冲 · '+loads.length+' / 4 行',16);mark('WEIGHT','cycle-working');}
   const installed=m.program.find(i=>i.kind==='install'&&i.ready+s.superlane<=s.cycle),capture=m.program.find(i=>i.kind==='capture'&&i.ready+s.superlane<=s.cycle),matrix=m.program.find(i=>i.kind==='matrix');
   if(capture){label('ACT','X = '+compact(capture.values),13);mark('ACT');}
   if(installed){label('PLANE','W 已安装 · 单元内显示权重',15);for(let r=0;r<4;r++)for(let c=0;c<4;c++)label('MAC'+r+c,root.GROQ_CYCLE.fmt(installed.weights[r][c]),17);}
   if(matrix&&s.cycle>=matrix.consume+s.superlane){const count=Math.min(4,Math.floor((s.cycle-matrix.consume-s.superlane)*4/matrix.latency));label('PLANE','第 '+count+' / 4 项完成 · 显示本项积',14);for(let r=0;r<4;r++)for(let c=0;c<4;c++){if(r<count){label('MAC'+r+c,root.GROQ_CYCLE.fmt(m.input[r]*matrix.weights[r][c]),17);mark('MAC'+r+c,'cycle-write');}else if(r===count)mark('MAC'+r+c,'cycle-working');}label('ACC','ACC · '+compact(count?matrix.partial[count-1]:[0,0,0,0]),15);mark('ACC',count===4?'cycle-write':'cycle-working');}
   for(const unit of ['SXM','VXM']){
    const operation=m.program.filter(i=>i.unit===unit&&i.kind==='compute'&&i.consume+s.superlane<=s.cycle).at(-1);if(!operation)continue;const done=s.cycle>=operation.ready+s.superlane,values=operation.inputs[0].values;
    if(unit==='SXM'){label('SX_IN',['输入',short(compact(values),12)],13);for(let j=0;j<4;j++){label('PERM'+j,(done?'出':'入')+j+' = '+root.GROQ_CYCLE.fmt((done?operation.values:values)[j]),14);mark('PERM'+j,done?'cycle-write':'cycle-working');}label('SX_OUT',['输出',done?short(compact(operation.values),12):'尚未有效'],13);if(done){mark('SX_OUT',s.cycle===operation.ready+s.superlane?'cycle-write':'cycle-invalid');if(s.cycle>operation.ready+s.superlane)label('SX_OUT',['输出残值',short(compact(operation.values),12)],13);}}
    else{label('V_IN',short(operation.op,12)+' · 输入 '+short(compact(values),20),14);for(let lane=0;lane<4;lane++){label('ALU0'+lane,root.GROQ_CYCLE.fmt((done?operation.values:values)[lane]),13);mark('ALU0'+lane,done?'cycle-write':'cycle-working');}label('V_OUT',[done?'输出残值 · '+operation.stage:'执行中 · '+operation.op,done?short(compact(operation.values),31):'尚未产生有效结果'],13);if(done)mark('V_OUT',s.cycle===operation.ready+s.superlane?'cycle-write':'cycle-invalid');label('V_NOTE','本教学操作使用槽 0；其余槽未调度',13);}
   }
   for(const bus of ['X','W','Y']){const streams=s.streams.filter(r=>r.bus===bus),path=streams.at(-1);label('BUS_'+bus,[bus==='X'?'sX · 数据':bus==='W'?'sW · 第二路':'sY · 结果',path?path.from.replace('MEM_','M')+' → '+path.to.replace('MEM_','M'):'本拍无数据'],13);
    for(let hop=0;hop<=6;hop++){const id=bus+hop,n=elements[id];if(hop>m.p.hops){n.style.display='none';continue;}const width=784/(m.p.hops+1),x=238+hop*width;n.setAttribute('transform',`translate(${x+(width-7)/2},${map.nodes[id].y+17.5})`);const r=n.querySelector('rect');r.setAttribute('x',-(width-7)/2);r.setAttribute('width',width-7);const packet=streams.find(v=>v.hop===hop);if(packet){label(id,['SG'+packet.planes+' / SR '+hop+' · 1',short(compact(packet.values),width>150?24:13)],width>150?14:12);mark(id,bus==='Y'?'cycle-write':'cycle-data-valid',true);n.setAttribute('aria-label',`流 ${bus} 寄存器 ${hop}，周期 ${s.cycle}，SL ${s.superlane}，数据 ${compact(packet.values)}`);}else{label(id,['SR '+hop+' · valid 0','空'],13);mark(id,'cycle-invalid');}}
   }
   for(const u of s.units){const dispatch=s.physicalIssued.filter(i=>i.unit.startsWith(u.unit)),memory=u.unit.startsWith('MEM');label('ICU_'+u.unit,[memory?u.unit.replace('_',' ')+'0—3 · 四个 ICU':u.unit+' · PC#'+u.pc,dispatch.length?short(dispatch.map(i=>(memory?i.plane+':':'')+i.op.split(' ')[0]).join(' '),23):'NOP · 无新指令'],13);if(dispatch.length)mark('ICU_'+u.unit,'cycle-instruction',true);const owner=u.unit.startsWith('MEM')?'MW':u.unit==='MXM'?'MW0':u.unit==='SXM'?'SW':'VX';if(u.running.length)mark('TOP_'+owner,'cycle-working');if(u.instruction)mark(u.unit.startsWith('MEM')?u.unit+'_ADDR':u.unit+'_TITLE','cycle-instruction');}
   const trace=(tracked?m.physicalProgram.find(i=>i.parent===tracked):null)||s.physicalIssued[0]||m.physicalProgram.filter(i=>i.issue<=s.cycle).at(-1);if(trace){const tile=s.cycle-trace.issue;if(tile>=0&&tile<20)mark('SL'+tile,'cycle-instruction',true);label('NORTH',['向北传播',tile<20?trace.unit.replace('MEM_','M'):'指令已到顶'],11);}
   mark('SL'+s.superlane,'cycle-selected');
   return svg;
  }
  function focus(key='all'){const b=map.focus[key]||map.focus.all;svg.setAttribute('viewBox',[b.x,b.y,b.w,b.h].join(' '));}
  return{render,focus,elements,svg};
 }
 root.GROQ_CYCLE_SCENE={create};if(typeof module!=='undefined')module.exports={create};
})(typeof window==='undefined'?globalThis:window);
