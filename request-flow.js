/* UTF-8 · Prefill / Decode 完整课程目录、硬件映射与常驻 Mermaid 导航。 */
(function(root){
 'use strict';const P=root.GROQ_PERFORMANCE||(typeof require!=='undefined'?require('./performance-model.js'):null),PL=root.GROQ_PERFORMANCE_LESSONS||(typeof require!=='undefined'?require('./performance-lessons.js'):null);
 const groups=[
  {id:'input',title:'用户输入 / CPU 准备',decode:'复用上轮 Token ID',keys:['request','tokenize','bind','runtime']},
  {id:'ingress',title:'PCIe / Embedding / 分发',keys:['pcie_in','landing','embedding','broadcast']},
  {id:'qkv',title:'Norm / QKV / RoPE / KV',keys:['norm1','q','k','v','rope','kv_write']},
  {id:'attention',title:'读 KV / QK / Softmax / PV',keys:['kv_read','qk','mask','softmax','p_cast','pv','concat']},
  {id:'projection',title:'Wo / 归约 / 残差',keys:['wo','attn_reduce','residual1']},
  {id:'ffn',title:'Norm / FFN / 归约 / 残差',keys:['norm2','ffn_gate','ffn_up','ffn_silu','ffn_mul','ffn_down','ffn_reduce','residual2']},
  {id:'layers',title:'逐层 / PP / Norm / 词表头',keys:['repeat_stage','handoff','advance','finalnorm','lmhead']},
  {id:'output',title:'采样 / 返回 / 下一轮',keys:['pcie_out','sample','decode_text','send','feedback']}
 ];
 const items=groups.flatMap((g,group)=>g.keys.map(id=>({id,group}))),clusterKeys=['bind','broadcast','attn_reduce','ffn_reduce','handoff','advance','feedback'];
 const fallback={place:'input',input:'ingress',attention:'qkv',ffn:'ffn',link:'layers',head:'layers',return:'output',overlap:'output',layers:'layers',heads:'attention',transpose:'attention'};
 function groupOf(key){const item=items.find(i=>i.id===key);return item?item.group:Math.max(0,groups.findIndex(g=>g.id===fallback[key]));}
 function title(m,id){const s=m.base?.steps?.find(s=>s.id===id)||m.steps?.find(s=>s.id===id);return s?.title||({bind:m.p.mode==='decode'?'复用原副本与请求 KV':'绑定模型副本',broadcast:'入口激活分给 TP 各片',kv_read:m.p.mode==='decode'?'读取历史与当前 K / V':'读取本轮建立的 K / V',attn_reduce:'Wo 部分和 All-reduce',ffn_reduce:'Down 部分和 All-reduce',repeat_stage:'重复本流水段的其余模型层',handoff:'隐藏激活通过 C2C 交接',advance:'推进下一流水段',feedback:'进入下一轮 Decode'})[id]||id;}
 function summary(mode,S,T){return mode==='decode'?`Decode · T=1；历史 KV=${S-1}，追加当前位置`:`Prefill · T=S=${T}；建立 KV，输出首个 Token`;}
 function hardwareId(id,chip,request,key){const p='C'+chip+'_';
  if(id==='HOST__USERDEVICE')return'USER';if(/^HOST__(TOKEN|NEXT)/.test(id))return'TOKEN';if(/^HOST__HOSTRAM/.test(id))return'REQUEST'+request;if(id.startsWith('HOST__'))return'HOST';
  if(id==='PCIE'||id==='DMA')return p+'PCIE';if(id==='CONTROL')return p+'ICU';if(/^MEM[EW]/.test(id)){if(id.includes('WEIGHTS'))return p+'W';if(key==='kv_write')return p+'KVNEW';if(['qk','pv','kv_read'].includes(key)&&/B[01]R/.test(id))return p+'KV';return p+'INPUT';}
  if(/^VX/.test(id))return p+(['norm1','norm2','finalnorm','softmax'].includes(key)?'SUM':'ALU');if(/^(SE|SW)/.test(id))return p+'SE';if(/^(ME|MW)\d/.test(id))return p+'MAC';if(/^HOST/.test(id))return'HOST';return p+'INPUT';
 }
 function instruction(step,phase){const mapping={matrix:['MEM Read / ICU 发射','MXM LW / IW / ABC','MXM 乘加执行','MXM ACC / 输出'],vector:['MEM Read / VXM 接收','VXM 逐元素 / 配对','VXM 归约或逐元素','VXM 输出 / MEM Write'],memory:['MEM 地址准备','MEM 地址译码','MEM Read / Write','流寄存器输出'],reorder:['MEM Read','SXM Permute / Transpose','SXM 输出','下游接收'],pcie:['源缓冲就绪','运行时提交 DMA','PCIe / DMA 接收','目的端可消费'],network:['服务缓冲就绪','NIC 发送 / 接收','网络数据到达','服务继续'],cpu:['CPU 读缓冲','CPU 服务操作','CPU 写结果','交给下一阶段']};
  if(step.id==='request'&&step.low===0)return'运行时复用既有连接';if(step.id==='tokenize'&&step.low===0)return'复用上轮已采样 ID';return(mapping[step.kind]||mapping.cpu)[phase];
 }
 function build(m,key){
  const CL=root.GROQ_CLUSTER_LESSONS||(typeof require!=='undefined'?require('./cluster-lessons.js'):null),O=root.GROQ_OPERATORS||(typeof require!=='undefined'?require('./operator-lessons.js'):null),item=items.find(i=>i.id===key);if(!item)throw Error('未知请求操作 '+key);
  const name=title(m,key),isCluster=clusterKeys.includes(key),step=m.base.steps.find(s=>s.id===key),layer=step&&['Attention','FFN'].includes(step.section),tail=['finalnorm','lmhead','pcie_out'].includes(key),chips=layer||key==='kv_read'||key==='repeat_stage'?m.group:tail?m.groups.at(-1):[m.groups[0][0]],chip=chips[0],basePatch=CL.patch(m,'place',0);
  function contextPatch(index=0,settled=false){const out={...basePatch},at=position(key),pastKV=at>position('kv_write')||key==='kv_write'&&index>=3,allLayers=at>=position('finalnorm');for(const c of m.active){const done=m.valid&&(allLayers||c.stage<m.c.stage&&at>=position('norm1')||c.stage===m.c.stage&&pastKV),length=done?m.d.S:m.p.mode==='decode'?m.d.S-1:0;out['C'+c.id+'_KV']={label:['KV '+c.kvHeads.join(','),'当前层 '+length+' 位置'],classes:done?['hw-computed']:['hw-data']};out['C'+c.id+'_KVNEW']={label:done?['本轮已追加',m.d.T+' 个位置']:['本轮追加区','等待写入'],classes:done?['hw-computed']:[]};if(at>=position('broadcast')&&(c.stage<=m.c.stage||allLayers))out['C'+c.id+'_INPUT']={label:['X [B,T,D]',m.c.request+' 请求'],classes:['hw-data']};}if(at>position('sample')||m.p.mode==='decode'&&at<position('lmhead'))out.TOKEN={label:['Token ID 608'],classes:['hw-data']};return out;}
  let phases,math,scope,note='本课程按完整请求顺序讲解；数值是缩小的算子示例，右侧按所选模型 / 本片分工计量。动画分镜不代表真实芯片时钟。';
  if(isCluster){phases=CL.phases(m,key).map((p,i)=>({...p,instruction:p.packets.some(k=>k.wire)?'C2C Send / Receive':key==='bind'?'运行时选择 / 复用副本':key==='advance'?'ICU 调用后续层程序':key==='feedback'?'运行时提交下一枚 ID':'MEM / ICU 数据交接',dataLabel:p.packets.filter(k=>k.tone!=='control').map(k=>k.label).join(' / ')||p.title}));if(['attn_reduce','ffn_reduce'].includes(key)){const last=phases.at(-1);last.title='All-reduce 完成，等待残差操作';last.explain='本步只完成各分片的部分和合并。残差相加在完整流程的下一操作单独演示。';}return{id:key,name,item,source:'cluster',phases,patch:(index,settled)=>CL.patch(m,key,index,{settled}),note};}
  if(key==='kv_read'){const micro=O.build(m,'kv_read',chip);phases=micro.phases;math={...micro,vectorOps:micro.vector,memoryBytes:micro.bytes};scope='TSP '+chip+' · 本片 K/V 读数';note='这是 QK / PV 中历史数据读取的展开，不再次叠加到完整层路径预算。'+note;return{id:key,name,item,source:'base',phases,math,scope,note,formulas:micro.formulas,shape:micro.shape,patch:(index,settled)=>({...contextPatch(index,settled),...micro.patch(index,settled)})};}
  if(key==='repeat_stage'){
   const count=m.chips[chip].layers-1,stage=m.stageCost[m.c.stage],low=(stage.low/stage.layers)*count,high=(stage.high/stage.layers)*count,prefix='C'+chip+'_';math={low,high,flops:0,vectorOps:0,memoryBytes:0,bound:'本段其余层路径',repeat:count};scope='第 '+(m.c.stage+1)+' 段 · 其余 '+count+' 层';
   phases=[['保留前一层的隐藏激活','每一层使用自己的权重和 KV；层序不等于 Token 序。','INPUT'],['执行本段其余 '+count+' 层','每层重复 Norm、Attention、两次残差和 FFN；TP 部分和在各层合并。','W'],['KV 留在各层的拥有者上','同一请求的历史由请求、层、头、位置共同索引，不在这里搬迁历史 KV。','KV'],['本流水段最后一层完成','之后仅在存在下一流水段时经 C2C 交接隐藏激活。','INPUT']].map(([title,explain,part],i)=>({title,explain,instruction:i===1?'ICU 调用本段其余层':'ICU 保持层依赖',dataLabel:i===1?'重复 '+count+' 层的隐藏激活':'X [B,T,D]；历史 KV 保留',focus:chips.map(c=>'C'+c+'_'+part),packets:i===1&&count?chips.map(c=>({from:'C'+c+'_INPUT',to:'C'+c+'_MAC',label:'其余 '+count+' 层',tone:'data',delay:0})):[]}));
   return{id:key,name,item,source:'base',phases,math,scope,note:'该预算已包含在 L 层设备路径中；不把单层和剩余层重复累计。',shape:'每层 '+P.time(stage.low/stage.layers)+' — '+P.time(stage.high/stage.layers),formulas:['本段层数 '+stage.layers+'，已展开 1 层，剩余 '+count+' 层','剩余层预算 = 本段总预算 × '+count+' / '+stage.layers],patch:contextPatch};
  }
  if(!step)throw Error('缺少现有算子 '+key);
  phases=PL.phases(m.base,step).map((p,index)=>{
   const map=id=>hardwareId(id,chip,m.c.request,key),packets=chips.flatMap(c=>p.packets.map(k=>({...k,from:hardwareId(k.from,c,m.c.request,key),to:hardwareId(k.to,c,m.c.request,key),label:key==='pcie_out'?P.bytes(step.wireBytes/chips.length):k.label}))),unique=[...new Map(packets.map(k=>[[k.from,k.to,k.label,k.tone].join('|'),k])).values()];
   return{...p,focus:[...new Set(chips.flatMap(c=>p.focus.map(id=>hardwareId(id,c,m.c.request,key))))],packets:unique,instruction:instruction(step,index),dataLabel:unique.filter(k=>k.tone!=='control').map(k=>k.label).slice(0,3).join(' / ')||step.shape};
  });
  if(layer){const costs=chips.map(c=>m.localOp(key,c));math={low:Math.max(...costs.map(c=>c.low)),high:Math.max(...costs.map(c=>c.high)),flops:Math.max(...costs.map(c=>c.flops)),vectorOps:Math.max(...costs.map(c=>c.vector)),memoryBytes:Math.max(...costs.map(c=>c.bytes)),bound:'本段最慢分片'};scope='本段 TSP '+chips.join(' / ')+' · 最慢分片';}
  else if(key==='lmhead'){math={...m.headCost,flops:step.flops/chips.length,vectorOps:0,memoryBytes:m.headCost.bytes,bound:'词表矩阵分片'};scope='末段 TSP '+chips.join(' / ');}
  else {math=step;scope=key==='finalnorm'?'末段每片执行完整 D 维 Norm':key==='pcie_out'?'全部 logits · 单接口等效预算':['network','cpu'].includes(step.kind)?'主机 / 用户':'入口 TSP '+chip;}
  const patch=(index,settled)=>{const out=contextPatch(index,settled);for(let j=0;j<=index-(settled?0:1);j++)for(const packet of phases[j].packets.filter(p=>p.tone!=='control'))out[packet.to]={label:[packet.label],classes:['hw-data']};if(key==='send'&&index===phases.length-1&&settled)out.USER={label:['用户收到','芯片'],classes:['hw-computed']};return out;};
  const formulas=layer||key==='lmhead'?[...step.formulas.map(f=>'整算子的数学定义：'+f),'当前计量范围：'+scope,'本片矩阵 '+P.num(math.flops)+' FLOPs；向量 '+P.num(math.vectorOps)+' 项；SRAM '+P.bytes(math.memoryBytes),'计算时间 = 矩阵量 / 有效矩阵吞吐 + 向量量 / 有效向量吞吐；搬运时间 = 本片字节 / 有效 SRAM 带宽','下界 = max(计算, 搬运) + 每算子固定开销；串行口径 = 计算 + 搬运 + 固定开销']:step.formulas;
  return{id:key,name,item,source:'base',phases,math,scope,note,shape:step.shape,formulas,patch};
 }
 function position(key){return items.findIndex(i=>i.id===key);}
 function next(index,stage,PP,direction=1){const key=items[index].id;if(direction>0&&key==='advance'&&stage+1<PP)return{index:position('norm1'),stage:stage+1};if(direction>0&&key==='repeat_stage'&&stage===PP-1)return{index:position('finalnorm'),stage};return{index:Math.max(0,Math.min(items.length-1,index+direction)),stage};}
 function create({container,assets,onSelect}){
  const prefix='request_'+container.id.replace(/[^a-z0-9_]/gi,'_');container.innerHTML=assets.request10.svg.replaceAll('hw_request10',prefix);const svg=container.querySelector('svg'),nodes={};svg.classList.add('request-map-svg');svg.setAttribute('role','group');svg.setAttribute('aria-label','Prefill 与 Decode 的完整请求流程');svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  for(const node of svg.querySelectorAll('[data-hw-id]')){const index=Number(node.dataset.hwId.slice(1));nodes[index]=node;node.setAttribute('role','button');node.setAttribute('tabindex','0');node.dataset.interactive='true';const pick=()=>onSelect(index);node.addEventListener('click',pick);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();pick();}});}
  function render({mode,key}){const selected=groupOf(key);for(let i=0;i<groups.length;i++){const node=nodes[i];if(!node)continue;const name=mode==='decode'&&groups[i].decode||groups[i].title,text=node.querySelector('text');text.textContent=String(i+1).padStart(2,'0')+'  '+name;node.querySelector('.label')?.setAttribute('transform','translate(0,0)');text.setAttribute('x','0');text.setAttribute('y','6');text.setAttribute('text-anchor','middle');text.style.fontSize='18px';node.classList.toggle('request-current',selected===i);node.setAttribute('aria-current',selected===i?'step':'false');node.setAttribute('aria-label',name+'：'+groups[i].keys.join('，'));}}
  return{render,svg};
 }
 const api={groups,items,groupOf,title,summary,hardwareId,instruction,build,position,next,create};root.GROQ_REQUEST_FLOW=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
