/* UTF-8 · 完整请求的顺序、模式、预算、硬件映射和应用联动验证。 */
'use strict';
const {writeReport}=require('./report.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const P=require('../performance-model.js'),C=require('../cluster-model.js'),M=require('../cluster-map.js'),F=require('../request-flow.js'),{fixture,Element}=require('./check-playback.cjs');
const logs=[],check=(name,fn)=>{fn();logs.push(name);console.log('通过：'+name);};
const model=(mode='prefill',strategy='hybrid',stage=0,request='A')=>C.build(P.build({mode}),{strategy,stage,request});
const near=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(1e-12,Math.abs(b)*1e-10),a+' ≠ '+b);

check('八个环节覆盖完整请求的 42 个操作，Attention 与 SwiGLU 次序完整',()=>{
 assert.equal(F.groups.length,8);assert.equal(F.items.length,42);assert.equal(new Set(F.items.map(x=>x.id)).size,42);
 for(const step of P.build().steps)assert.ok(F.position(step.id==='layers'?'repeat_stage':step.id)>=0,step.id);
 for(const keys of [
  ['request','tokenize','bind','runtime','pcie_in','landing','embedding','broadcast'],
  ['norm1','q','k','v','rope','kv_write','kv_read','qk','mask','softmax','p_cast','pv','concat','wo','attn_reduce','residual1'],
  ['norm2','ffn_gate','ffn_up','ffn_silu','ffn_mul','ffn_down','ffn_reduce','residual2','repeat_stage','handoff','advance','finalnorm','lmhead'],
  ['pcie_out','sample','decode_text','send','feedback']
 ])for(let i=1;i<keys.length;i++)assert.equal(F.position(keys[i]),F.position(keys[i-1])+1);
 assert.equal(F.items[0].id,'request');assert.equal(F.items.at(-1).id,'feedback');assert.equal(F.position('place'),-1);
});

check('Prefill 建立整段 KV，Decode 复用 ID 与历史，追加后读取状态保持一致',()=>{
 for(const mode of ['prefill','decode']){
  const m=model(mode);assert.equal(m.d.T,mode==='decode'?1:m.d.S);
  assert.ok(F.summary(mode,m.d.S,m.d.T).includes(mode==='decode'?'历史 KV=127':'T=S=128'));
  for(const key of ['request','tokenize']){const op=F.build(m,key);assert.equal(op.math.low===0,mode==='decode');}
  const before=F.build(m,'q').patch(0,false),after=F.build(m,'qk').patch(0,false);
  assert.ok(before.C0_KV.label.join(' ').includes((mode==='decode'?127:0)+' 位置'));
  assert.ok(after.C0_KV.label.join(' ').includes('128 位置'));
  const write=F.build(m,'kv_write');assert.ok(write.patch(1,false).C0_KVNEW.label.join(' ').includes('等待'));
  assert.ok(write.patch(3,true).C0_KV.label.join(' ').includes('128 位置'));
  assert.ok(F.build(m,'kv_read').note.includes('不再次叠加'));
 }
});

let phaseCount=0,packetCount=0,configCount=0;
check('全部模式、部署、请求和流水段均连接到固定硬件节点',()=>{
 for(const mode of ['prefill','decode'])for(const strategy of ['hybrid','pipeline','tensor','replica'])for(const request of ['A','B']){
  const base=model(mode,strategy,0,request);
  for(let stage=0;stage<base.PP;stage++){
   const m=model(mode,strategy,stage,request);configCount++;
   for(const {id}of F.items){const op=F.build(m,id);assert.ok(op.phases.length>=1);if(op.math){assert.ok(Number.isFinite(op.math.low)&&op.math.low>=0);assert.ok(Number.isFinite(op.math.high)&&op.math.high>=op.math.low);}
    op.phases.forEach((phase,index)=>{phaseCount++;assert.ok(phase.instruction&&phase.dataLabel,id);for(const key of phase.focus)assert.ok(M.nodes[key],id+': '+key);for(const packet of phase.packets){packetCount++;assert.ok(M.nodes[packet.from]&&M.nodes[packet.to],id);}
     for(const settled of [false,true])for(const [key]of Object.entries(op.patch(index,settled)))assert.ok(M.nodes[key],id+': patch '+key);
    });
   }
  }
 }
});

check('本片计算预算、末段 Norm 和词表头采用对应分工，剩余层不重复计量',()=>{
 for(const strategy of ['hybrid','pipeline','tensor','replica']){
  const m=model('decode',strategy);
  for(const key of ['norm1','q','k','v','rope','qk','softmax','pv','wo','residual1','norm2','ffn_down','residual2']){
   const op=F.build(m,key),costs=m.group.map(c=>m.localOp(key,c));near(op.math.low,Math.max(...costs.map(x=>x.low)));near(op.math.flops,Math.max(...costs.map(x=>x.flops)));assert.ok(op.formulas.some(x=>x.includes('当前计量范围')));
  }
  const norm=F.build(m,'finalnorm'),head=F.build(m,'lmhead');near(norm.math.low,m.base.steps.find(x=>x.id==='finalnorm').low);near(head.math.low,m.headCost.low);near(head.math.memoryBytes,m.headCost.bytes);
  const repeat=F.build(m,'repeat_stage'),stage=m.stageCost[0];near(repeat.math.low,stage.low*(stage.layers-1)/stage.layers);assert.equal(repeat.math.repeat,stage.layers-1);assert.ok(repeat.note.includes('不把单层和剩余层重复累计'));
 }
});

check('完整顺序逐段展开一层，最后一段之后才进入词表与输出',()=>{
 for(const strategy of ['hybrid','pipeline','tensor','replica']){
  const m=model('prefill',strategy),seen=[];let pos={index:0,stage:0};
  for(let n=0;n<200;n++){const key=F.items[pos.index].id;seen.push({...pos,key});if(key==='feedback')break;pos=F.next(pos.index,pos.stage,m.PP);}
  assert.equal(seen.at(-1).key,'feedback');assert.equal(seen.filter(x=>x.key==='norm1').length,m.PP);assert.equal(seen.filter(x=>x.key==='handoff').length,m.PP-1);
  for(const x of seen.filter(x=>['finalnorm','lmhead','sample','send'].includes(x.key)))assert.equal(x.stage,m.PP-1);
 }
});

const f=fixture();f.run('performance-app.js');f.run('cluster-app.js');
const state=()=>f.env.GROQ_REQUEST_COURSE.getState(),pick=id=>f.env.GROQ_REQUEST_COURSE.pick(id),engine=f.motions[1].engine;
check('真实应用默认显示完整 Prefill；42 个操作均驱动标题、硬件分镜和性能',()=>{
 assert.equal(state().key,'request');assert.equal(f.overviews[1].current.mode,'prefill');assert.equal((f.els['request-all-steps'].innerHTML.match(/data-request-step=/g)||[]).length,42);
 assert.ok(f.els['request-flow-summary'].textContent.includes('T=S=128'));
 for(const {id}of F.items){pick(id);assert.equal(state().key,id);assert.equal(f.overviews[1].current.key,id);assert.ok(f.els['cluster-cost'].textContent&&!/NaN|undefined/.test(f.els['cluster-cost'].textContent));for(let j=0;j<engine.phases.length;j++){engine.seek((j+.96)/engine.phases.length);assert.equal(f.flows[1].current,j);assert.equal(f.els['cluster-phase-title'].textContent,engine.phases[j].title);}}
});

check('点击总览、前后操作、跨段回退和切换模式保持同一个执行位置',()=>{
 f.overviews[1].opts.onSelect(0);assert.equal(state().key,'request');assert.equal(state().stage,0);
 pick('advance');f.click('cluster-next');assert.equal(state().key,'norm1');assert.equal(state().stage,1);f.click('cluster-prev');assert.equal(state().key,'advance');assert.equal(state().stage,0);
 pick('finalnorm');assert.equal(state().stage,1);f.env.GROQ_LAB.apply({mode:'decode'});assert.equal(state().stage,0);assert.equal(state().key,'request');assert.equal(state().T,1);assert.equal(f.overviews[1].current.mode,'decode');assert.ok(f.els['request-flow-summary'].textContent.includes('历史 KV=127'));
 f.env.document.body.dataset.workspace='single';f.overviews[0].opts.onSelect(5);assert.equal(f.overviews[0].current.key,'norm2');assert.equal(f.flows[0].opts.compact,true);f.click('show-cluster');
});

check('发送完成后才能开始下一轮，保留请求和副本并复用增长后的历史',()=>{
 pick('q');engine.seek(1);assert.equal(f.els['cluster-next-token'].disabled,true);
 pick('send');assert.equal(f.els['cluster-next-token'].disabled,true);engine.seek(1);assert.equal(f.els['cluster-next-token'].disabled,false);
 const before=state();f.click('cluster-next-token');const after=state();assert.equal(after.mode,'decode');assert.equal(after.S,before.S+1);assert.equal(after.T,1);assert.equal(after.request,before.request);assert.equal(after.replica,before.replica);assert.equal(after.stage,0);assert.equal(after.key,'request');assert.ok(f.els['request-flow-summary'].textContent.includes('历史 KV='+before.S));
 f.env.GROQ_LAB.apply({seq:32768});pick('send');engine.seek(1);assert.equal(f.els['cluster-next-token'].disabled,true);f.env.GROQ_LAB.apply(P.defaults);
});

check('连续播放贯穿整轮和跨段循环，结束后无后台重复播放',()=>{
 pick('request');f.click('cluster-auto');const sequence=[];
 for(let n=0;n<200;n++){sequence.push(state().key+'@'+state().stage);f.tick(100000);f.flushTimers();if(state().key==='feedback'&&!engine.running)break;}
 assert.equal(sequence.filter(x=>x.startsWith('norm1@')).length,2);assert.ok(sequence.includes('norm1@0')&&sequence.includes('norm1@1'));assert.equal(sequence.at(-1),'feedback@1');assert.equal(engine.running,false);assert.equal(f.frames.size,0);
});

const sandbox={window:{}};vm.runInNewContext(read('hardware-diagrams.js'),sandbox);const G=sandbox.window.HARDWARE_SVGS;
function graphic(asset){const svg=new Element('svg'),nodes={};for(const id of Object.keys(asset.nodes)){const n=svg.appendChild(new Element('g'));n.dataset.hwId=id;n.appendChild(new Element('rect'));n.appendChild(new Element('label')).appendChild(new Element('text'));nodes[id]=n;}svg.querySelectorAll=q=>q==='[data-hw-id]'?Object.values(nodes):[];return{svg,nodes};}
check('完整流程 Mermaid 八个节点常驻，当前环节高亮且可鼠标或键盘选择',()=>{
 assert.equal(Object.keys(G.request10.nodes).length,8);assert.ok(G.request10.viewBox.height<400);
 const {svg,nodes}=graphic(G.request10),container=new Element();container.id='test-request';container.querySelector=()=>svg;let selected=-1;const view=F.create({container,assets:G,onSelect:i=>selected=i});
 for(const mode of ['prefill','decode'])for(const {id}of F.items){view.render({mode,key:id});assert.equal(Object.values(nodes).filter(n=>n.classList.contains('request-current')).length,1);assert.equal(nodes['R'+F.groupOf(id)].getAttribute('aria-current'),'step');for(const n of Object.values(nodes))assert.notEqual(n.style.display,'none');}
 for(let i=0;i<8;i++){nodes['R'+i].dispatchEvent({type:'click'});assert.equal(selected,i);nodes['R'+i].dispatchEvent({type:'keydown',key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(selected,i);}
 assert.ok(nodes.R0.querySelector('text').textContent.includes('复用上轮'));for(let i=0;i<7;i++)assert.ok(read('hardware/request10.mmd').includes('R'+i+' --> R'+(i+1)));
});

check('当前指令与数据同框常驻，翻动作只改变当前分镜且不挤掉总览',()=>{
 const {svg,nodes}=graphic(G.software7),container=new Element(),prev=new Element(),next=new Element(),count=new Element();container.querySelector=q=>q==='svg'?svg:q.includes('prev')?prev:q.includes('next')?next:count;
 const env={window:{},document:{createElementNS:(_,tag)=>new Element(tag)}};vm.runInNewContext(read('software-flow.js'),env);let selected=-1;const flow=env.window.GROQ_SOFTWARE_FLOW.create({container,assets:G,compact:true,onSelect:i=>selected=i}),phases=F.build(model(),'q').phases;
 flow.render(phases,2,true);assert.equal(svg.getAttribute('viewBox'),'-2 -2 338 94');assert.equal(nodes.I0.dataset.flowIndex,'2');assert.equal(nodes.D0.dataset.flowIndex,'2');assert.equal(nodes.I0.classList.contains('flow-done'),true);assert.equal(count.textContent,'3 / 4 动作');
 for(const [id,n]of Object.entries(nodes))assert.equal(n.style.display==='none',!['IH','DH','I0','D0'].includes(id));prev.dispatchEvent({type:'click'});assert.equal(selected,1);next.dispatchEvent({type:'click'});assert.equal(selected,3);flow.render(phases,0);assert.equal(prev.disabled,true);flow.render(phases,3);assert.equal(next.disabled,true);
 const html=read('index.html');assert.ok(html.includes('data-workspace="cluster"'));assert.ok(html.includes('id="cluster-request-overview"'));assert.ok(html.includes('id="single-request-overview"'));assert.ok(html.indexOf('request-layout.css')>html.indexOf('cycle.css'));
});

writeReport('完整请求流程.md','# 完整请求流程检查报告\n\n'+logs.map(n=>'- '+n+'。').join('\n')+'\n\n共 '+logs.length+' 组检查，'+configCount+' 种模式 / 部署 / 请求 / 流水段组合，'+phaseCount+' 个分镜、'+packetCount+' 个数据标记的端点。其余模型、动画、逐周期与打包检查由统一检查入口执行。\n\n应用脚本与时钟真实执行，界面和图形节点使用程序替身；检查不包含交互网页的浏览器点击、截图或视觉验收。新流程属于参数化分镜视图；保留的逐周期视图仍是模拟时序模型，没有据此宣称真实芯片 trace。\n');
console.log('全部 '+logs.length+' 组完整流程检查通过。');
