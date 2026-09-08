/* UTF-8 · 检查算量、流量、估算边界和硬件分镜；不打开教学网页。 */
'use strict';
const {writeReport}=require('./report.cjs');const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const P=require('../performance-model.js'),L=require('../performance-lessons.js'),A=require('../hardware-atlas-map.js'),root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const sandbox={window:{}};vm.runInNewContext(read('hardware-diagrams.js'),sandbox);const G=sandbox.window.HARDWARE_SVGS;let count=0;const log=[];const check=(name,fn)=>{fn();count++;log.push(name);console.log('通过：'+name);};
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),(msg||'')+': '+a+' / '+b),row=(m,id)=>m.steps.find(s=>s.id===id),sum=(a,k)=>a.reduce((s,x)=>s+x[k],0);
check('34 个步骤覆盖外部、PCIe / DMA、完整 Attention、SwiGLU 与返回',()=>{
 const m=P.build();assert.equal(m.steps.length,34);const names=m.steps.map(s=>s.id);for(const id of ['request','tokenize','runtime','pcie_in','landing','embedding','norm1','q','k','v','rope','kv_write','qk','mask','softmax','p_cast','pv','concat','wo','residual1','norm2','ffn_gate','ffn_up','ffn_silu','ffn_mul','ffn_down','residual2','layers','lmhead','pcie_out','sample','send'])assert.ok(names.includes(id),id);
 assert.equal(new Set(names).size,names.length);assert.ok(A.specs.DMA&&G.atlas.nodes.DMA);assert.ok(names.indexOf('p_cast')<names.indexOf('pv'));
});
check('投影、GQA、QK/PV 与三次 FFN 的 FLOPs 正确',()=>{
 for(const mode of ['prefill','decode'])for(const batch of [1,4])for(const seq of [1,8,128]){
  const m=P.build({mode,batch,seq}),{B,T,D,K,H,S,d,F}=m.dimensions;
  near(row(m,'q').flops,2*B*T*D*D);near(row(m,'k').flops,2*B*T*D*K);near(row(m,'v').flops,2*B*T*D*K);near(row(m,'qk').flops,2*B*H*T*S*d);near(row(m,'pv').flops,row(m,'qk').flops);
  for(const id of ['ffn_gate','ffn_up','ffn_down'])near(row(m,id).flops,2*B*T*D*F);near(row(m,'ffn_mul').vectorOps,B*T*F);near(row(m,'lmhead').flops,2*B*D*m.p.vocab);
 }
});
check('Prefill 的上下文平方增长、Decode 的线性增长与 FFN 常量关系',()=>{
 const a=P.build({seq:128}),b=P.build({seq:256}),c=P.build({mode:'decode',seq:128}),d=P.build({mode:'decode',seq:256});near(row(b,'qk').flops/row(a,'qk').flops,4);near(row(d,'qk').flops/row(c,'qk').flops,2);near(row(b,'ffn_up').flops/row(a,'ffn_up').flops,2);near(row(d,'ffn_up').flops,row(c,'ffn_up').flops);
 const causal=P.build({seq:128,skipCausal:true});near(row(causal,'qk').flops/row(a,'qk').flops,129/256);
});
check('KV 只追加新位置，GQA 减少 KV 但不减少查询头 QK 算量',()=>{
 const pre=P.build(),dec=P.build({mode:'decode'}),mha=P.build({kvHeads:8}),gqa=P.build({kvHeads:2});near(row(pre,'kv_write').memoryBytes/row(dec,'kv_write').memoryBytes,pre.p.seq);near(mha.capacity.kv/gqa.capacity.kv,4);near(row(mha,'qk').flops,row(gqa,'qk').flops);near(row(mha,'k').flops/row(gqa,'k').flops,4);
 const noReuse=P.build({mode:'decode',reuseKV:false});near(row(noReuse,'qk').traffic.find(r=>r.name==='历史 K').bytes/row(dec,'qk').traffic.find(r=>r.name==='历史 K').bytes,4);
});
check('FP32 得分、FP16 KV 与概率转换的字节口径一致',()=>{
 const m=P.build(),d=m.dimensions;near(d.score,d.B*d.H*d.T*d.S*4);near(m.capacity.kv,2*d.B*d.S*d.K*2*d.L);near(row(m,'p_cast').traffic[0].bytes,2*row(m,'p_cast').traffic[1].bytes);near(row(m,'pv').traffic.find(x=>x.name==='读取 FP16 P').bytes,d.score/2);
 const stream=P.build({materialize:false});assert.ok(stream.layer.memoryBytes<m.layer.memoryBytes);assert.ok(stream.capacity.workspace<m.capacity.workspace);near(stream.layer.flops,m.layer.flops);near(row(stream,'kv_write').memoryBytes,row(m,'kv_write').memoryBytes);
});
check('带宽单位、PCIe 利用率与固定开销可逐项复算',()=>{
 const m=P.build(),p=m.p;near(m.effective.memory,80e12*.2);near(m.effective.pcie,31.5e9*.75);near(m.effective.matrix,188e12*.35);
 near(row(m,'pcie_in').low,p.dmaUs/1000+(p.batch*p.seq*4)/m.effective.pcie*1000);near(row(m,'pcie_out').wireBytes,p.batch*p.vocab*4);
 for(const s of m.steps){near(s.memoryBytes,sum(s.traffic,'bytes'));assert.ok(s.low>=0&&s.high>=s.low-1e-12);if(['matrix','vector','memory','reorder'].includes(s.kind)){near(s.low,Math.max(s.computeMs,s.memoryMs)+s.fixedMs);near(s.high,s.computeMs+s.memoryMs+s.fixedMs);}}
 const slower=P.build({memoryUtil:.1});near(row(slower,'q').memoryMs/row(m,'q').memoryMs,2);
 const slowRead=P.build({sramTBs:.001,memoryUtil:.001}),out=row(slowRead,'pcie_out');near(out.low,out.wireBytes/slowRead.effective.memory*1000+slowRead.p.dmaUs/1000);near(out.high,out.wireBytes/slowRead.effective.memory*1000+out.wireBytes/slowRead.effective.pcie*1000+slowRead.p.dmaUs/1000);
});
check('整模型按层累计，冷部署不混入热请求 TTFT',()=>{
 const m=P.build(),layer=m.steps.slice(m.layerStart,m.layerEnd);near(m.layer.low,sum(layer,'low'));near(row(m,'layers').low,m.layer.low*(m.p.layers-1));near(m.total.low,sum(m.steps,'low'));near(m.total.flops,m.layer.flops*m.p.layers+row(m,'lmhead').flops);
 assert.ok(m.deployment.bytes>row(m,'pcie_in').wireBytes*1000);near(m.deployment.low,m.p.dmaUs/1000+m.capacity.weights/m.effective.pcie*1000);assert.ok(!m.steps.some(s=>s.id==='deployment'));
 for(let i=0;i<m.steps.length;i++){near(m.steps[i].endLow,m.steps[i].startLow+m.steps[i].low);if(i)near(m.steps[i].startLow,m.steps[i-1].endLow);}
});
check('网络传播只影响到达时间，不反复加入稳态 TPOT',()=>{
 const a=P.build({rttMs:20}),b=P.build({rttMs:80}),c=P.build({mode:'decode',rttMs:20}),d=P.build({mode:'decode',rttMs:80});near(b.total.low-a.total.low,60);near(d.total.low-c.total.low,30);near(d.total.tpLow,c.total.tpLow);near(row(c,'request').low,0);near(row(c,'tokenize').low,0);
 const batch=P.build({batch:4});near(batch.setup.networkBytes,4*a.setup.networkBytes);near(batch.setup.outputBytes,4*a.setup.outputBytes);near(a.effective.network,100e6/8);
});
check('容量超出时抑制整模型性能结论，非法形状和参数被拒绝',()=>{
 assert.ok(P.build().capacity.fits);const big=P.build(P.presets.wide);assert.ok(!big.capacity.fits&&!big.total.valid&&big.capacity.minimumChips>1);near(big.capacity.minimumChips,Math.ceil(big.capacity.total/big.capacity.limit));
 for(const invalid of [{dim:510},{heads:7},{kvHeads:3},{seq:0},{matrixUtil:0},{batch:1.5},{memoryUtil:2},{dim:8,heads:8}])assert.throws(()=>P.build(invalid));
});
check('Attention 数值遵循因果遮罩、稳定 Softmax、两头共享 KV 与残差',()=>{
 const s=P.sample();for(let i=0;i<3;i++){near(s.softmax.output[i].reduce((a,b)=>a+b,0),1);for(let j=i+1;j<3;j++){assert.equal(s.mask.output[i][j],-Infinity);near(s.softmax.output[i][j],0);}}
 near(s.softmax.output[0][0],1);s.pv.output.forEach((r,i)=>r.forEach((v,j)=>near(v,s.softmax.output[i].reduce((a,p,k)=>a+p*s.pv.weight[k][j],0))));
 s.residual1.output.forEach((r,i)=>r.forEach((v,j)=>near(v,s.embedding.output[i][j]+s.wo.output[i][j])));
 const d=P.sample('decode');for(const key of ['q','qk','softmax','pv','ffn_gate','ffn_down']){assert.equal(d[key].output.length,1);assert.deepEqual(d[key].output[0],s[key].output.at(-1));}assert.equal(d.kv.output.length,3);
});
check('SwiGLU 数值中两套权重、SiLU、逐元素乘、Down 与残差一致',()=>{
 const s=P.sample();assert.notDeepEqual(s.ffn_gate.weight,s.ffn_up.weight);s.ffn_silu.output.forEach((r,i)=>r.forEach((v,j)=>{const g=s.ffn_gate.output[i][j];near(v,g/(1+Math.exp(-g)));near(s.ffn_mul.output[i][j],v*s.ffn_up.output[i][j]);}));
 s.residual2.output.forEach((r,i)=>r.forEach((v,j)=>near(v,s.residual1.output[i][j]+s.ffn_down.output[i][j])));
});
check('硬件读数跟随平方、归约、旋转和输入到达顺序，K/V 来源正确',()=>{
 const m=P.build(),norm=row(m,'norm1'),q=row(m,'q'),kv=row(m,'kv_write');assert.equal(L.patch(m,norm,0).VX__A00.label[0],'1');assert.equal(L.patch(m,norm,1).VX__A10.label[0],'0.75');assert.ok(Math.abs(Number(L.patch(m,norm,2).VX__A20.label[0])-1/Math.sqrt(.75001))<.00051);
 assert.equal(L.patch(m,q,0).ME0__X0.label[0],'等待输入');assert.notEqual(L.patch(m,q,1).ME0__X0.label[0],'等待输入');const ph=L.phases(m,kv);assert.ok(ph[1].packets.every(p=>p.from==='VX__OUT0'));assert.ok(ph[2].packets.every(p=>p.from==='ME0__READOUT'));
 const qp=P.sample().q.output.at(-1),rotated=qp[0]*Math.cos(2)-qp[1]*Math.sin(2);assert.ok(Math.abs(Number(L.patch(m,row(m,'rope'),2).VX__A20.label[0])-rotated)<.00051);
 const streaming=P.build({materialize:false});for(const id of ['q','k','v'])assert.ok(!row(streaming,id).traffic.some(t=>t.name==='输入 X'));assert.ok(row(streaming,'qk').traffic.some(t=>t.name==='历史 K'));assert.ok(row(streaming,'q').traffic.some(t=>t.name==='Wq 权重'));
});
let phases=0,packets=0;
check('两种模式全部硬件分镜有有效起终点，MAC 内部数值对应当前算子',()=>{
 for(const mode of ['prefill','decode']){const m=P.build({mode});for(const s of m.steps){const list=L.phases(m,s);assert.equal(list.length,4);for(const [i,p]of list.entries()){
  phases++;for(const id of [...p.focus,...p.packets.flatMap(p=>[p.from,p.to]),...Object.keys(L.patch(m,s,i))])assert.ok(A.specs[id]&&G.atlas.nodes[id],s.id+' 缺少 '+id);packets+=p.packets.length;
  for(const mark of p.packets)assert.ok(mark.label&&!/undefined|NaN/.test(mark.label));for(const value of Object.values(L.patch(m,s,i)))assert.ok(!value.label.some(v=>/undefined|NaN/.test(v)));
  if(s.sample&&P.sample(mode)[s.sample]?.type==='matrix'){const macro=L.macro(m,s,i,{row:0,col:0});assert.ok(macro&&macro.XREG);if(i<2)assert.ok(macro.MULT.label.includes('等待操作数'));}
 }}}
 assert.equal(phases,272);assert.ok(packets>150);
});
check('硬件展开保留九个区域顺序，MAC 内部不会遮挡来源阵列',()=>{
 for(const zone of ['MW0','MW1','ME0','ME1']){const c=A.context({kind:'lab',zone,focusZone:zone,expanded:true,mac:{row:1,col:1},lab:true,sl:7,slice:3}),lay=A.layout(c);let x=0;for(const[z]of A.zones){assert.ok(lay.boxes[z].x>x);x=lay.boxes[z].x+lay.boxes[z].w;}
  const panel=lay.nodes[zone+'CIRCUIT'],box=lay.nodes[zone];assert.ok(panel.visible&&panel.x>=box.x&&panel.x+panel.w<=box.x+box.w);for(const n of Object.values(lay.nodes).filter(n=>n.owner===zone&&n.kind==='detail'))assert.ok(n.x+n.w<panel.x);assert.ok(A.address(zone+'__M11',c).includes('SL 07'));
 }
});
check('UTF-8、脚本语法、页面标识符、离线内嵌资源与源码一致',()=>{
 const html=read('index.html'),scripts=[...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(m=>m[1]),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 const decoder=new TextDecoder('utf-8',{fatal:true});for(const file of ['index.html','performance.css','README.md','docs/设计说明.md','docs/教学方案.md',...scripts]){const txt=decoder.decode(fs.readFileSync(path.join(root,file)));assert.ok(!txt.includes('\uFFFD'),file);if(file.endsWith('.js'))new vm.Script(txt,{filename:file});}
 for(const m of read('performance-app.js').matchAll(/(?:\$|\btext)\('([^']+)'/g))assert.ok(ids.includes(m[1]),'页面缺少 '+m[1]);assert.ok(!html.includes('</option '));
 const standalone=read('Groq_TSP_交互讲解.html'),inline=[...standalone.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map(m=>m[1]);assert.equal(inline.length,scripts.length);inline.forEach((s,i)=>assert.equal(s,read(scripts[i]).replace(/<\/script/gi,'<\\/script')));assert.ok(!/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(standalone));assert.ok(!/<(?:img|iframe|script|link)[^>]+(?:src|href)="https?:/i.test(html));
 for(const key of Object.keys(A.specs))assert.ok(G.atlas.nodes[key],key);assert.ok(read('performance.css').includes('grid-template-columns:minmax(0,1fr) 430px'));
 for(const source of P.sources){assert.ok(/^https?:\/\//.test(source.url),source.name+' 必须引用公开网上资料');assert.ok(!Object.hasOwn(source,'local'),source.name+' 不得提供本地资料入口');}
});
const defaultModel=P.build(),decode=P.build({mode:'decode'});writeReport('性能计算.md','# 性能与数值模型检查报告\n\n'+log.map(x=>'- '+x+'。').join('\n')+`\n\n共 ${count} 组检查；两种模式 ${phases} 个分镜、${packets} 个数据标记的硬件端点完整。默认单片教学模型：权重 ${P.bytes(defaultModel.capacity.weights)}，一层 Prefill ${P.time(defaultModel.layer.low)}，Decode ${P.time(decode.layer.low)}。这些是默认参数下的成本模型结果，不是设备实测。\n\n检查覆盖纯数值模型、资源映射、几何约束、UTF-8、脚本语法与离线打包；未执行教学网页的浏览器点击、截图或视觉回归测试。硬件规格与接入方式的依据均使用公开原文的网上链接；自动化检查验证引用形式，不验证站点实时可用性。\n`);console.log('全部 '+count+' 组检查通过。');
