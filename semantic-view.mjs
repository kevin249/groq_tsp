/* UTF-8 · 在固定硬件之上显示具名对象与事件，不用粒子代替计算。 */
import * as T from 'three';
import {DATA_FLOW_DIAGRAMS} from './data-flow-diagrams.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>typeof v==='number'&&!Number.isInteger(v)?String(Number(v.toPrecision(4))):window.SEMANTIC_EXECUTION.num(v);
export class SemanticView{
 constructor({element,layer,sprite,anchor,context,onChange}){Object.assign(this,{element,layer,sprite,anchor,context,onChange});this.program=null;this.current=-1;this.markers=[];}
 load(program,step){this.program=program;this.step=step;this.current=-1;this.markers=[];const anchors=this.context().hardware.anchors;
  this.readouts=[];this.links=[];
  const site=(key,point,label,position)=>{if(!point)return;const ring=new T.Mesh(new T.RingGeometry(.23,.31,32),new T.MeshBasicMaterial({color:0x527a90,transparent:true,opacity:.8,side:T.DoubleSide,depthTest:false}));ring.rotation.x=-Math.PI/2;ring.position.copy(point).add(new T.Vector3(0,.13,0));const pos=position||point.clone().add(new T.Vector3(0,1.3,0)),heading=this.sprite(label,'#294b5e',.5);heading.position.copy(pos);const leader=new T.Line(new T.BufferGeometry().setFromPoints([ring.position,pos.clone().add(new T.Vector3(0,-.2,0))]),new T.LineBasicMaterial({color:0x6c8b9a,transparent:true,opacity:.7,depthTest:false}));this.layer.add(ring,heading,leader);this.readouts.push({key,ring,heading,leader,position:pos,value:null});};
  if(program.type==='transfer'){
   const route=program.meta.route;
   route.forEach((id,i)=>site(i,anchors[id],id==='NETWORK'?'Spectrum-X':id==='SLOT'?'LPX 入口':id==='CX9'?'ConnectX-9':id,anchors[id]?.clone().add(new T.Vector3(i%2?-.3:.3,1.7,0))));
   for(let i=0;i<route.length-1;i++){const a=anchors[route[i]],b=anchors[route[i+1]];if(!a||!b)continue;const line=new T.Line(new T.BufferGeometry().setFromPoints([a.clone().add(new T.Vector3(0,.55,0)),b.clone().add(new T.Vector3(0,.55,0))]),new T.LineBasicMaterial({color:0x71919d,transparent:true,opacity:.5}));line.userData.semanticRoute=true;line.userData.hop=i;this.layer.add(line);this.links.push(line);}
  }else if(['gpu','chip'].includes(this.context().level)){
   site('memory',anchors.MEM,'存储资源 · 算例读写',new T.Vector3(-4.2,2.8,0));
   site('compute',anchors[program.type==='matrix'?'MXM':'VXM'],'执行资源 · 算例状态',new T.Vector3(4.2,2.8,0));
  }else if(anchors.HOST){site('cpu',anchors.HOST,'Host / 分词服务');}
  this.show(0);
 }
 show(index){if(!this.program)return;index=Math.max(0,Math.min(this.program.events.length-1,index));if(this.current===index)return;this.current=index;const p=this.program,e=p.events[index],ctx=this.context();
  this.layer.userData.semantic={type:p.type,event:index,count:p.events.length,valid:e.valid,revealed:e.revealed??null,received:e.received??null,total:e.total??null,stalled:!!e.stalled,instruction:e.instruction};
  this.syncHardware(e,ctx);
  const endpoint=id=>({CX9:'ConnectX-9',NETWORK:'Spectrum-X',SLOT:'LPX 入口'}[id]||id);
  const title=p.type==='tokenize'?'官方分词 · 逐个揭示':p.type==='transfer'?'逻辑接口算例 · 第 '+((e.hop||0)+1)+' / '+(p.meta.route.length-1)+' 跳 '+endpoint(p.meta.route[e.hop||0])+' → '+endpoint(p.meta.route[(e.hop||0)+1]):p.type==='dependency'?'符号依赖':'缩小数值算例 · 计算与写回';
  let prompt='';if(p.type==='tokenize'){prompt='<div class="se-prompt">'+p.meta.tokens.map((t,i)=>'<span class="'+(i===e.activeToken?'active':i<(e.revealed||0)?'done':'pending')+'">'+esc(t.text)+'</span>').join('')+'</div>';}
  const readSet=new Set(e.focus.filter(f=>f.role==='read').map(f=>f.id+':'+f.r+':'+f.c)),writeSet=new Set(e.focus.filter(f=>f.role==='write').map(f=>f.id+':'+f.r+':'+f.c)),holdSet=new Set(e.focus.filter(f=>f.role==='hold').map(f=>f.id+':'+f.r+':'+f.c));
  const tables=e.view.filter(id=>e.objects[id]).map(id=>{const o=e.objects[id];return '<section class="se-object"><h4>'+esc(o.label)+'</h4><table aria-label="'+esc(o.label)+'"><tbody>'+o.rows.map((r,ri)=>'<tr>'+r.map((v,ci)=>{const key=id+':'+ri+':'+ci,cls=v===null?'empty':writeSet.has(key)?'written':readSet.has(key)?'read':holdSet.has(key)?'held':'';return '<td data-object="'+esc(id)+'" data-row="'+ri+'" data-col="'+ci+'" class="'+cls+'" title="'+esc(id+'['+ri+','+ci+'] = '+(v===null?'尚未写入':String(v)))+'">'+(v===null?'·':esc(number(v)))+'</td>';}).join('')+'</tr>').join('')+'</tbody></table>'+(o.hint?'<small>'+esc(o.hint)+'</small>':'')+'</section>';}).join('');
  this.element.innerHTML=this.flowHTML(ctx)+'<section class="se-operator-pane" aria-label="当前算子"><header class="se-header"><div><span class="se-kicker">'+'02 · 当前算子 · '+title+' · 事件 '+(index+1)+' / '+p.events.length+'</span><h3>'+esc(e.name)+'</h3></div><strong class="se-valid '+(e.valid?'ready':e.stalled?'stall':'')+'">'+(e.valid?'结果有效':e.stalled?'背压 · 保持':'结果未提交')+'</strong></header>'+prompt+'<div class="se-equation"><code>'+esc(e.instruction)+'</code><span>'+esc(e.equation)+'</span>'+'</div><div class="se-tables">'+tables+'</div><div class="se-readwrite"><span><b>读</b> '+esc(e.read.join('，')||'无新增读取')+'</span><span><b>写</b> '+esc(e.write.join('，')||'保持原状态')+'</span></div><footer class="se-footer"><div><button data-action="micro-prev" '+(index===0?'disabled':'')+'>上一事件</button><button class="sl-primary" data-action="micro-next">'+(index===p.events.length-1?'进入下一算子':'下一事件')+' →</button></div><small>'+esc(p.basis)+'</small></footer></section>';
  this.highlightFlow(ctx);
  this.element.dataset.semanticType=p.type;this.element.dataset.event=String(index);
  this.onChange?.(p,e);
 }
 flowHTML(ctx){return '<section class="se-flow-pane" aria-label="完整数据流程"><div class="se-flow-heading"><b>01 · 完整数据 flow</b><nav class="se-quick"><button data-action="focus-token">分词</button><button data-action="focus-ffn">FFN</button><button data-action="focus-attn">Attention</button><button data-action="focus-transfer">传输</button></nav><div class="se-window-zoom"><span>窗口</span><button data-action="float-zoom-out" aria-label="缩小悬浮窗口">−</button><button data-action="float-zoom-reset" title="恢复窗口大小">'+Math.round(ctx.zoom*100)+'%</button><button data-action="float-zoom-in" aria-label="放大悬浮窗口">+</button></div></div><div class="se-flow-row"><b>Prefill</b>'+DATA_FLOW_DIAGRAMS.prefill+'</div><div class="se-flow-row"><b>Decode</b>'+DATA_FLOW_DIAGRAMS.decode+'</div><div class="se-flow-caption">'+(ctx.phase==='prefill'?'Prefill · GPU 执行全部模型层':'Decode · GPU Attention / LPX FFN 分工推演')+' · L'+ctx.layer+' / '+ctx.shape.m.layers+' · T='+ctx.shape.T+' · S='+ctx.shape.S+'<span>选流程节点展开算子 · 在窗口上滚轮缩放</span></div></section>';}
 highlightFlow(ctx){const id=this.step.id;let active;
  if(ctx.phase==='prefill')active=id==='prompt'?'P0':id==='tokenize'?'P1':['embedding','schedule','expand'].includes(id)?'P2':['finalnorm','lmhead'].includes(id)?'P4':['sample','result-handoff'].includes(id)?'P5':'P3';
  else active=id==='schedule'?'D0':['embedding','expand'].includes(id)?'D1':['gpu-egress','afd','tray'].includes(id)?'D3':['gateup','silu','down','router','dispatch','shared','combine'].includes(id)?'D4':['return','gpu-return'].includes(id)?'D5':id==='ffnwrite'?'D6':['finalnorm','lmhead','result-handoff','sample'].includes(id)?'D7':'D2';
  for(const node of this.element.querySelectorAll('.se-flow-pane g.node')){const key=node.id.match(/(?:flowchart-)?([PD][0-7])-/)?.[1];if(!key)continue;node.dataset.flowNode=key;node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-label','展开 '+node.textContent.trim());node.classList.toggle('flow-active',key===active);node.classList.toggle('flow-complete',ctx.phase==='decode'&&key[0]==='P');}
  this.element.dataset.activeFlow=active;
 }

 syncHardware(e,ctx){const p=this.program;for(const r of this.readouts){let words='';
  if(p.type==='transfer'){const n=r.key,hop=e.hop||0;words=n===0?'TX 8 B · 保持':n<=hop?'已接收 8 / 8 B':n===hop+1?'RX '+(e.received||0)+' / 8 B':'等待上游';if(n===hop+1&&e.stalled)words+=' · ready=0';}
  else if(r.key==='cpu')words=p.type==='tokenize'?'已追加 '+(e.revealed||0)+' / 6 个 Token':e.valid?'提交完成':'结果未提交';
  else if(r.key==='memory'){const reg=e.objects.reg?.rows[0];words=reg?'a='+number(reg[0])+'  b='+number(reg[1]):e.valid?'输出已提交':e.write.length?'写 '+e.write.join(', '):'输入保持';}
  else{const reg=e.objects.reg?.rows[0],stat=e.objects.stat?.rows[0];words=reg?'ACC = '+number(reg[3]):stat?stat.map(number).join(' / '):e.valid?'结果有效':'本地状态尚未提交';}
  if(r.value){r.value.material.map.dispose();r.value.material.dispose();this.layer.remove(r.value);}
  r.value=this.sprite(words,e.stalled?'#9b6c2d':e.valid?'#32764d':'#355e75',.46);r.value.position.copy(r.position).add(new T.Vector3(0,-.58,0));this.layer.add(r.value);for(const o of [r.ring,r.heading,r.leader,r.value])o.visible=ctx.follow;
 }
 for(const line of this.links){line.visible=ctx.follow;line.material.color.set(line.userData.hop===(e.hop||0)?e.stalled?0xba873a:e.accepted?0x438662:0x46799b:0xa4b3b9);line.material.opacity=line.userData.hop===(e.hop||0)?1:.35;}
 }

 get event(){return this.program?.events[this.current];}
 sizeLabels(camera,height){for(const r of this.readouts||[])for(const sp of [r.heading,r.value]){if(!sp)continue;const aspect=sp.scale.x/sp.scale.y,size=2*sp.position.distanceTo(camera.position)*Math.tan(T.MathUtils.degToRad(camera.fov)/2)*20/height;sp.scale.set(size*aspect,size,1);}}
}
