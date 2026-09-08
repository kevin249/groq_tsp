/* UTF-8 · 验证软件分类、物理归属与六类算子的独立数值。 */
'use strict';
const {writeReport}=require('./report.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const P=require('../performance-model.js'),C=require('../cluster-model.js'),L=require('../cluster-lessons.js'),O=require('../operator-lessons.js'),M=require('../cluster-map.js'),F=require('../software-flow.js'),root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const sandbox={window:{}};vm.runInNewContext(read('hardware-diagrams.js'),sandbox);const G=sandbox.window.HARDWARE_SVGS,logs=[],near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),a+' ≠ '+b),check=(s,fn)=>{fn();logs.push(s);console.log('通过：'+s);};let phases=0;
check('每片中央只有一个 VXM 区域，MAC、ALU、归约和程序块均在所属区域内',()=>{
 const contains=(a,b)=>b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w&&b.y+b.h<=a.y+a.h;
 for(let i=0;i<4;i++){const prefix='C'+i+'_';assert.equal(Object.values(M.nodes).filter(n=>n.owner==='C'+i&&n.kind==='slice'&&n.color==='vxm').length,1);assert.equal(Object.values(M.nodes).filter(n=>n.owner==='C'+i&&n.kind==='slice'&&n.color==='mxm').length,4);
  for(const [parent,child]of [['MW0','MAC'],['VX','ALU'],['VX','SUM'],['MEMW','W'],['MEMW','INPUT'],['MEMW','PROG'],['MEME','KV'],['MEME','KVNEW']])assert.ok(contains(M.nodes[prefix+parent],M.nodes[prefix+child]),prefix+child+' 未在 '+parent+' 内');
  assert.ok(M.nodes[prefix+'PROG'].y>=M.nodes[prefix+'W'].y+M.nodes[prefix+'W'].h);assert.ok(M.nodes[prefix+'PORTW'].x+M.nodes[prefix+'PORTW'].w<M.nodes[prefix+'TX'].x);
 }
});
check('软件分工不再作为芯片块标题，超容量时不宣称 KV 已装入',()=>{
 const m=C.build(),patch=L.patch(m,'place',0);for(let i=0;i<4;i++){assert.ok(!/副本|分片|段/.test(patch['C'+i+'_TITLE'].label.join('')));assert.equal(patch['C'+i+'_MAC'].label[0],'MAC');}
 const wide=C.build(P.presets.wide);assert.equal(wide.valid,false);for(const id of ['attention','return','feedback']){const p=L.patch(wide,id,3);for(let i=0;i<4;i++)assert.ok(!p['C'+i+'_KVNEW'].label.join('').includes('已追加'));}
});
check('六类三十个算子的全部分镜均有真实物理端点和双流标签',()=>{
 assert.equal(O.families.length,6);assert.equal(O.ops.length,30);assert.equal(new Set(O.ops.map(x=>x.id)).size,30);
 for(const mode of ['prefill','decode'])for(const chip of [0,1,2,3])for(const op of O.ops){const m=C.build({mode}),o=O.build(m,op.id,chip);assert.ok(o.phases.length<=F.slots);assert.ok(o.low>=0&&o.high>=o.low&&Number.isFinite(o.high));
  for(const [index,phase]of o.phases.entries()){phases++;assert.ok(phase.instruction&&phase.dataLabel);assert.equal(F.instruction(phase),phase.instruction);for(const key of [...phase.focus,...phase.packets.flatMap(p=>[p.from,p.to])])assert.ok(M.nodes[key]&&G.cluster6.nodes[key],op.id+' 缺少 '+key);for(const settled of [false,true])for(const key of Object.keys(o.patch(index,settled)))assert.ok(M.nodes[key]&&G.cluster6.nodes[key]);}
  assert.equal(o.phases[0].packets[0].from,'C'+chip+'_PROG');assert.equal(o.phases[0].packets[0].to,'C'+chip+'_ICU');
 }
});
check('MAC 逐项累加到 11，到达前不提前写结果；Q 投影按头分片守恒',()=>{
 const m=C.build(),q=O.build(m,'q');assert.deepEqual(q.result,[11]);assert.deepEqual(q.phases.slice(3,7).map(x=>x.values[0]),[2,2,-1,11]);assert.ok(!q.patch(3,false).C0_MAC);assert.equal(q.patch(3,true).C0_MAC.label[0],'2');assert.equal(q.patch(6,true).C0_MAC.label[0],'11');
 for(const mode of ['prefill','decode']){const n=C.build({mode}),total=n.group.reduce((s,i)=>s+O.build(n,'q',i).flops,0);near(total,n.base.steps.find(s=>s.id==='q').flops);}
});
check('Sum、Max、Softmax、RMSNorm 与逐元素操作的小例子符合定义',()=>{
 const m=C.build();assert.deepEqual(O.build(m,'sum').result,[10]);assert.deepEqual(O.build(m,'max').result,[4]);const p=O.build(m,'softmax').result;near(p.reduce((a,b)=>a+b,0),1);for(let i=1;i<4;i++)near(p[i]/p[i-1],Math.E);
 const norm=O.build(m,'norm1').result;norm.forEach((v,i)=>near(v,(i+1)/Math.sqrt(7.5+1e-5)));assert.deepEqual(O.build(m,'rope').result,[2,1,4,3]);assert.deepEqual(O.build(m,'residual1').result,[1.5,-1.5,3.5,-3.5]);assert.deepEqual(O.build(m,'ffn_mul').result,[.5,-1,1.5,-2]);
 O.build(m,'ffn_silu').result.forEach((v,i)=>{const x=[1,-2,3,-4][i];near(v,x/(1+Math.exp(-x)));});
});
check('重排保留数值集合，不产生矩阵 FLOPs；带宽变化只改变搬运预算',()=>{
 const m=C.build();for(const id of ['transpose','permute','heads']){const a=O.build(m,id),b=O.build(m,id,0,{sxmGBs:8000});assert.deepEqual(a.result.slice().sort((a,b)=>a-b),[1,2,3,4]);assert.equal(a.flops,0);assert.equal(a.vector,0);near(b.compute,a.compute/2);near(b.transport,a.transport);}
 assert.deepEqual(O.build(m,'transpose').result,[1,3,2,4]);assert.deepEqual(O.build(m,'permute').result,[3,1,4,2]);
});
check('KV 追加只按新位置计流量，控制时序保持零矩阵运算量',()=>{
 const p=C.build(),d=C.build({mode:'decode'});near(O.build(p,'kv_write').bytes/O.build(d,'kv_write').bytes,p.d.S);near(O.build(p,'kv_read').bytes,O.build(d,'kv_read').bytes);
 const a=O.build(d,'dependency'),b=O.build(d,'dependency',0,{clockGHz:2});near(a.clock/2,b.clock);assert.equal(a.flops,0);assert.equal(a.vector,0);assert.ok(O.build(d,'repeat',0,{repeat:8}).clock>O.build(d,'repeat').clock);assert.throws(()=>O.build(d,'sync',0,{clockGHz:0}));
});
check('三列布局、软件入口顺序与长流水线的 Mermaid 节点完整',()=>{
 const html=read('index.html'),scripts=[...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(x=>x[1]);assert.ok(scripts.indexOf('software-flow.js')<scripts.indexOf('performance-app.js'));assert.ok(scripts.indexOf('operator-lessons.js')<scripts.indexOf('cluster-app.js'));
 assert.ok(read('flow-layout.css').includes('grid-template-columns:280px minmax(0,1fr) 294px'));for(const main of ['cluster-main','lab-main']){const start=html.indexOf('id="'+main+'"'),tail=html.indexOf('</main>',start),body=html.slice(start,tail);assert.ok(body.indexOf('class="software-pane"')<body.indexOf('class="lab-left"'));assert.ok(body.indexOf('class="lab-left"')<body.indexOf('class="calculation-pane"'));}
 for(let i=0;i<F.slots;i++)for(const side of ['I','D'])assert.ok(G.software7.nodes[side+i]);const m=C.build({}, {strategy:'pipeline',inFlight:8});assert.ok(L.phases(m,'overlap').length<=F.slots);
 const decoder=new TextDecoder('utf-8',{fatal:true});for(const file of ['operator-lessons.js','software-flow.js','flow-layout.css','docs/教学方案.md','README.md','docs/设计说明.md']){const text=decoder.decode(fs.readFileSync(path.join(root,file)));assert.ok(!text.includes('\uFFFD'));if(file.endsWith('.js'))new vm.Script(text,{filename:file});}
});
writeReport('算子与硬件.md','# 算子与硬件归属检查报告\n\n'+logs.map(s=>'- '+s+'。').join('\n')+`\n\n共 ${logs.length} 组分类与结构检查，涵盖 ${phases} 个算子分镜；六类共 30 个独立操作，四颗芯片、两种推理模式。完整请求和单片数值另由既有检查覆盖，应用启动和播放见 [动画播放](动画播放.md)。\n\n所有功能图与双流图由 Mermaid 生成。本次验证覆盖源文件结构、物理包含关系、数值、成本和程序播放；未进行教学网页的浏览器点击、截图或视觉回归。事实依据引用 ISCA 2020、Hot Chips 34 与 ASAP 2022 的网上原文；自动化检查验证引用形式，不验证站点实时可用性。\n`);
console.log('全部 '+logs.length+' 组分类检查通过。');
