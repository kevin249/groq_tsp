/* UTF-8 · 多片分工、归约和通信成本的纯模型验证；不打开教学网页。 */
'use strict';
const {writeReport}=require('./report.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const P=require('../performance-model.js'),C=require('../cluster-model.js'),L=require('../cluster-lessons.js'),M=require('../cluster-map.js');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} ≠ ${b}`),logs=[];
const check=(name,fn)=>{fn();logs.push(name);console.log('通过：'+name);};
const ctx={window:{}};vm.runInNewContext(read('hardware-diagrams.js'),ctx);const G=ctx.window.HARDWARE_SVGS;
let phaseCount=0,packetCount=0;
check('四种部署覆盖全部芯片，每段层、Q 头和 FFN 通道不重不漏',()=>{
 for(const strategy of Object.keys(C.strategies))for(const mode of ['prefill','decode'])for(const request of ['A','B']){
  const m=C.build({mode},{strategy,request});assert.ok(m.valid);assert.deepEqual(m.chips.map(x=>x.id),[0,1,2,3]);
  for(const stages of m.spec.groups){let end=0;for(const group of stages){const chips=group.map(i=>m.chips[i]);assert.equal(chips[0].layerStart,end);end=chips[0].layerEnd;assert.ok(chips.every(x=>x.layers>0&&x.layerStart===chips[0].layerStart&&x.layerEnd===end));assert.deepEqual(chips.flatMap(x=>Array.from({length:x.headEnd-x.headStart},(_,j)=>x.headStart+j)),Array.from({length:m.d.H},(_,j)=>j));assert.equal(chips[0].ffStart,0);assert.equal(chips.at(-1).ffEnd,m.d.F);chips.slice(1).forEach((x,j)=>assert.equal(x.ffStart,chips[j].ffEnd));}assert.equal(end,m.d.L);}
 }
});
check('请求绑定副本，GQA 的必要 KV 副本与常驻请求容量分别计入',()=>{
 const a=C.build({}, {strategy:'replica',request:'A'}),b=C.build({}, {strategy:'replica',request:'B'});assert.deepEqual(a.active.map(x=>x.id),[0,2]);assert.deepEqual(b.active.map(x=>x.id),[1,3]);
 assert.equal(C.build().kvReplicaFactor,1);assert.equal(C.build({}, {strategy:'tensor'}).kvReplicaFactor,2);assert.equal(C.build({kvHeads:4},{strategy:'tensor'}).kvReplicaFactor,1);
 const one=C.build({}, {inFlight:1}),three=C.build({}, {inFlight:3});one.chips.forEach((x,i)=>{near(three.chips[i].kv,3*x.kv);near(three.chips[i].weights,x.weights);});
 for(const ch of three.chips)near(ch.kv,2*three.d.B*three.d.S*ch.localK*2*ch.layers*3);
 const p=C.build(),d=C.build({mode:'decode'});p.chips.forEach((ch,i)=>near(ch.kv,d.chips[i].kv));near(p.activation/d.activation,p.d.S);
});
check('词嵌入和末段词表的权重副本逐片登记；词表输入与固定开销不除以分片数',()=>{
 const h=C.build(),t=C.build({}, {strategy:'tensor'}),v=h.d.D*h.d.V*2;
 assert.equal(h.chips[0].embedding,v);assert.equal(h.chips[2].embedding,0);assert.equal(h.chips[1].head,v/2);assert.equal(h.chips[3].head,v/2);
 near(t.chips[0].weights,t.chips[0].layerWeights+v+t.d.D*2);near(h.headCost.flops,2*h.d.B*h.d.D*h.d.V/h.TP);
 near(t.headCost.fixed,h.base.steps.find(s=>s.id==='lmhead').fixedMs);near(t.headCost.bytes,t.d.B*t.d.D*2+t.d.D*t.d.V*2/4+t.d.B*t.d.V*4/4);
 assert.ok(C.build({dim:8192,heads:64,kvHeads:8,ffn:22016,layers:80,vocab:32768}).active.some(x=>!x.fits));
 assert.ok(!C.build({layers:1},{strategy:'pipeline'}).valid);assert.ok(!C.build({heads:2,kvHeads:1},{strategy:'tensor'}).valid);
});
check('Gbit/s 到单向 GB/s 的换算、320 B 槽位和多窗口等待正确',()=>{
 const m=C.build();near(m.bandwidth,12e9);for(const n of [1,319,320,321,32768,65537]){const t=m.transfer(n);assert.equal(t.slots,Math.ceil(n/320));assert.equal(t.padded,t.slots*320);assert.equal(t.padding,t.padded-n);assert.equal(t.windowSlots,102);assert.equal(t.windows,Math.ceil(t.slots/102));near(t.windowMs,(t.windows-1)*m.c.windowUs/1000);near(t.wireMs,t.padded/12e9*1000);near(t.low,Math.max(t.readMs,t.wireMs,t.writeMs)+t.hopMs+t.alignMs+t.windowMs);near(t.high,t.readMs+t.wireMs+t.writeMs+t.hopMs+t.alignMs+t.windowMs);near(m.transfer(n,2).low,t.low*2);}
 assert.equal(m.transfer(0).low,0);const fast=C.build({}, {links:2});near(fast.bandwidth,m.bandwidth*2);near(fast.transfer(320).wireMs,m.transfer(320).wireMs/2);near(fast.transfer(320).hopMs,m.transfer(320).hopMs);
 assert.throws(()=>C.validate({links:9}));assert.throws(()=>C.validate({linkUtil:0}));
});
check('环形归约逐轮符合 Reduce-scatter 加法与 All-gather 复制语义',()=>{
 for(const group of [[0],[0,2],[0,1,3,2]]){
  const trace=C.ringTrace(group),n=group.length;assert.equal(trace.length,n===1?1:2*n);const sum=n*(n+1)/2;
  for(const row of trace.at(-1).values)assert.deepEqual(row,[sum,2*sum,3*sum,4*sum]);assert.ok(trace.at(-1).known.flat().every(Boolean));
  for(let k=1;k<trace.length-1;k++){const prev=trace[k-1],now=trace[k],width=4/n;assert.equal(now.moves.length,n);for(const move of now.moves){assert.ok(C.edges.some(e=>e.includes(move.from)&&e.includes(move.to)));const from=group.indexOf(move.from),to=group.indexOf(move.to);assert.equal(move.add,now.kind==='reduce');for(let j=0;j<width;j++){const col=move.chunk*width+j;near(move.values[j],prev.values[from][col]);near(now.values[to][col],move.add?prev.values[to][col]+move.values[j]:move.values[j]);}}}
 }
});
check('归约的全组发送量与串行轮数分开，阶段交接按最慢并发路径计时',()=>{
 for(const strategy of ['hybrid','tensor','pipeline'])for(const mode of ['prefill','decode']){
  const m=C.build({mode},{strategy}),n=m.TP,ar=m.reduction;near(ar.totalSent,2*(n-1)*m.partial);near(ar.perRankSent,ar.totalSent/n);assert.equal(ar.rounds,2*(n-1));near(ar.low,ar.round.low*ar.rounds+ar.additionMs);near(ar.paddedTotal,n*ar.rounds*(ar.round.padded||0));
  m.handoffs.forEach(x=>near(x.payload,m.d.B*m.d.T*m.d.D*2));near(m.handoffLow,Math.max(0,...m.handoffs.map(x=>m.transfer(x.payload,x.hops).low)));
  let crossings=0;for(let i=0;i<m.PP-1;i++)crossings+=C.build(m.base,{...m.c,stage:i}).handoffLow;near(m.pipelineLow,m.stageCost.reduce((a,x)=>a+x.low,0)+crossings);
 }
});
check('流水线槽位只交错独立请求，同一请求满足前一阶段依赖',()=>{
 for(const strategy of Object.keys(C.strategies))for(const request of ['A','B']){
  const m=C.build({}, {strategy,request,inFlight:3});assert.equal(m.pipelineSlots.length,m.PP+2);
  for(const slot of m.pipelineSlots)for(const job of slot.jobs){assert.equal(job.token,0);if(job.stage>0)assert.ok(m.pipelineSlots[slot.slot-1].jobs.some(x=>x.stage===job.stage-1&&x.job===job.job&&x.request===job.request));if(strategy==='replica')assert.ok(job.request.startsWith(request));}
 }
});
check('接收前不提前改写部分和、KV、目的 MEM 和输出 Token',()=>{
 const m=C.build({mode:'decode'});const before=L.patch(m,'attention',2,{settled:false}),after=L.patch(m,'attention',2,{settled:true});assert.ok(before.C0_KV.label.includes('历史长度 127'));assert.ok(after.C0_KV.label.includes('历史长度 128'));
 const pending=L.patch(m,'attn_reduce',1,{settled:false}),ready=L.patch(m,'attn_reduce',1,{settled:true});assert.equal(pending.C0_INPUT.label[1],'1');assert.notEqual(ready.C0_INPUT.label[1],pending.C0_INPUT.label[1]);
 assert.ok(L.patch(m,'link',3,{settled:false}).C2_INPUT.label.includes('本向量待写入'));assert.ok(L.patch(m,'link',3,{settled:true}).C2_INPUT.label.includes('本向量已写入'));
 assert.equal(L.patch(m,'return',1,{settled:false}).TOKEN.label[0],'等待采样');assert.equal(L.patch(m,'return',1,{settled:true}).TOKEN.label[0],'Token ID 608');assert.equal(L.patch(m,'return',3,{settled:false}).USER.label[0],'用户接收缓冲');
 assert.ok(L.patch(m,'input',2,{settled:true}).C0_INPUT.label.includes('X [T,D]'));assert.ok(L.patch(m,'input',2,{settled:true}).C2_INPUT.label.includes('等待'));
 assert.ok(!L.canNextToken(m,'input',3,true));assert.ok(!L.canNextToken(m,'return',1,false));assert.ok(L.canNextToken(m,'return',1,true));assert.ok(L.canNextToken(m,'feedback',0,false));assert.ok(!L.canNextToken({...m,d:{...m.d,S:32768}},'feedback',3,true));
});
check('所有部署、模式、阶段和动作都连接到实际 Mermaid 硬件节点',()=>{
 for(const strategy of Object.keys(C.strategies))for(const mode of ['prefill','decode'])for(const request of ['A','B']){
  const base=C.build({mode},{strategy,request});for(let stage=0;stage<base.PP;stage++){
   const m=C.build(base.base,{...base.c,stage});for(const[id]of L.definitions){const phases=L.phases(m,id,{vector:m.transfer(m.activation).slots-1});assert.ok(phases.length);for(const [index,p]of phases.entries()){
    phaseCount++;for(const key of p.focus)assert.ok(M.nodes[key]&&G.cluster6.nodes[key],id+' 缺少 '+key);
    for(const mark of p.packets){packetCount++;assert.ok(M.nodes[mark.from]&&M.nodes[mark.to]);assert.ok(mark.label&&!/undefined|NaN/.test(mark.label));if(mark.wire){const ids=M.packetPath(mark,C.route);assert.equal(ids[0],mark.from);assert.equal(ids.at(-1),mark.to);for(const key of ids)assert.ok(G.cluster6.nodes[key],key);assert.ok(ids.some(x=>x.startsWith('WIRE')));if(mark.wire.reduce)assert.ok(ids.includes('C'+mark.wire.to+'_SUM'));else assert.ok(!ids.some(x=>x.endsWith('_SUM')));}}
    for(const settled of [false,true])for(const [key,value]of Object.entries(L.patch(m,id,index,{vector:m.transfer(m.activation).slots-1,settled}))){assert.ok(M.nodes[key]&&G.cluster6.nodes[key]);assert.ok(value.label.every(x=>!String(x).match(/NaN|undefined/)));}
   }}
  }
 }
 for(const edge of C.edges){const m=C.build();for(const [i,p]of L.phases(m,'link',{link:edge}).entries()){for(const mark of p.packets)assert.ok(M.nodes[mark.from]&&M.nodes[mark.to]);L.patch(m,'link',i,{link:edge});}}
 const relay=M.path(0,3,C.route);for(const key of ['C1_SER_RX','C1_RX','C1_INPUT','C1_TX','C1_SER_TX'])assert.ok(relay.includes(key));
});
check('四片硬件分区、缓存归属与物理连接几何保持明确',()=>{
 assert.equal(Object.keys(M.nodes).length,295);const contains=(a,b)=>b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w&&b.y+b.h<=a.y+a.h;
 for(let i=0;i<4;i++){for(const [zone,keys]of [['MEMW',['W','INPUT']],['MEME',['KV','KVNEW']],['VX',['ALU']]])for(const k of keys)assert.ok(contains(M.nodes['C'+i+'_'+zone],M.nodes['C'+i+'_'+k]),k);for(const key of M.zones)assert.ok(M.nodes['C'+i+'_'+key]);}
 for(const n of Object.values(M.nodes))assert.ok(n.w>0&&n.h>0&&n.x>=0&&n.y>=0&&n.x+n.w<=M.width&&n.y+n.h<=M.height);
 const chips=M.origins.map((_,i)=>M.nodes['C'+i+'_DIE']);for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)assert.ok(chips[a].x+chips[a].w<=chips[b].x||chips[b].x+chips[b].w<=chips[a].x||chips[a].y+chips[a].h<=chips[b].y||chips[b].y+chips[b].h<=chips[a].y);
 for(const [a,b]of C.edges){assert.ok(M.nodes[M.port(a,b)]);assert.ok(M.nodes[C.edgeKey(a,b)]);assert.ok(M.nodes[M.port(b,a)]);}
});
check('亮色入口、中文 UTF-8、全部脚本语法和独立 HTML 资源一致',()=>{
 const html=read('index.html'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),scripts=[...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);assert.equal(scripts.length,23);
 for(const m of read('cluster-app.js').matchAll(/(?:\$|\btxt)\('([^']+)'(?:\)|,)/g))assert.ok(ids.includes(m[1]),m[1]);
 assert.ok(html.includes('name="color-scheme" content="light"'));assert.ok(html.includes('class="lab light" data-workspace="cluster"'));assert.ok(html.indexOf('light.css')>html.indexOf('cluster.css'));assert.ok(html.includes('class="skip"'));
 const decoder=new TextDecoder('utf-8',{fatal:true});for(const f of ['index.html','README.md','docs/设计说明.md','docs/教学方案.md','light.css','cluster.css',...scripts]){const text=decoder.decode(fs.readFileSync(path.join(root,f)));assert.ok(!text.includes('\uFFFD'));if(f.endsWith('.js'))new vm.Script(text,{filename:f});}
 const standalone=read('Groq_TSP_交互讲解.html'),inline=[...standalone.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map(m=>m[1]);assert.equal(inline.length,scripts.length);inline.forEach((s,i)=>assert.equal(s,read(scripts[i]).replace(/<\/script/gi,'<\\/script')));assert.ok(!/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(standalone));
 const sourceLinks=[...read('cluster-app.js').matchAll(/<a\b[^>]*href="([^"]+)"/g)];assert.equal(sourceLinks.length,2);for(const x of sourceLinks)assert.ok(/^https?:\/\//.test(x[1]),'多芯片依据必须引用公开网上资料');
});
const m=C.build(),d=C.build({mode:'decode'});
writeReport('多芯片通信.md','# 多芯片分工与通信检查报告\n\n'+logs.map(s=>'- '+s+'。').join('\n')+`\n\n共 ${logs.length} 组检查，覆盖 ${phaseCount} 个多芯片分镜状态、${packetCount} 个数据标记；包含两种推理模式、四种部署、两个请求视角和所有阶段。单片课堂另有 15 组既有检查，记录见 [性能计算](性能计算.md)。\n\n默认两段 × 两片方案的有效单向链路为 ${P.num(m.bandwidth/1e9)} GB/s，Prefill 单次归约全组有效发送 ${P.bytes(m.reduction.totalSent)}，Decode 为 ${P.bytes(d.reduction.totalSent)}。默认 L 层路径预算分别为 ${P.time(m.pipelineLow)} 和 ${P.time(d.pipelineLow)}，只含层内计算、两次归约与阶段交接；不是完整 TTFT 或设备实测。\n\n检查为纯模型计算、数据依赖、硬件节点映射、静态几何、UTF-8、脚本语法和离线打包检查。未执行教学网页的浏览器点击、截图、DOM 检查或视觉回归测试。公开硬件机制引用 ISCA 2020 与 Hot Chips 34 的网上原文；自动化检查验证引用形式，不验证站点实时可用性。\n`);
console.log(`全部 ${logs.length} 组多芯片检查通过。`);
