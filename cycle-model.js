/* UTF-8 · 确定性逐周期示例模型。数值、有效位与写回只在整数时钟边沿改变。 */
(function(root){
 'use strict';
 const defaults={ghz:.9,hops:3,read:2,write:1,vector:2,shuffle:2,install:2,matrix:4,skew:1};
 const units=['MEM_A','MEM_B','MXM','SXM','VXM'];
 const lessons=[
  {id:'q',family:'matrix',name:'Q / K / V 投影',formula:'Y = XW',note:'投影的 1×4 乘 4×4 数值窗口；Q 头是输出张量的分组，乘加在 MXM 内。'},
  {id:'ffn',family:'matrix',name:'FFN · Gate / Up / Down',formula:'Gate = XWg；Up = XWu；Down = HWd',note:'三次矩阵乘的形状不同，复用同一种 MXM 内核。这里观察其中一个 4×4 窗口。'},
  {id:'rope',family:'vector',name:'RoPE · 成对旋转',formula:'(a,b) → (−b,a)，θ = π/2',note:'SXM 交换相邻元素，VXM 乘符号；固定角度便于核对每个值。'},
  {id:'silu',family:'vector',name:'SiLU · FFN 激活',formula:'SiLU(x) = x / (1 + exp(−x))',note:'展开为负号、指数、加一、倒数和乘法；每个中间向量显式写入 SRAM。'},
  {id:'softmax',family:'reduce',name:'Attention · Softmax',formula:'pᵢ = exp(xᵢ − max x) / Σ exp(xⱼ − max x)',note:'四元素归约：SXM 配对，VXM 求最大值和求和，再归一化。'},
  {id:'norm',family:'reduce',name:'RMSNorm',formula:'y = x × rsqrt(mean(x²) + ε)',note:'平方、两轮归约、均值、加 ε、倒数平方根、乘回输入；γ = 1。'},
  {id:'sum',family:'reduce',name:'归约 · Sum',formula:'[1,2,3,4] → [10,10,10,10]',note:'结果在四个位置广播；两轮配对加法由同一个 VXM 完成。'},
  {id:'transpose',family:'shuffle',name:'SXM · 2×2 转置',formula:'[1,2;3,4] → [1,3;2,4]',note:'SXM 改变位置，不执行矩阵乘法。这里只转置四元素子窗口。'},
  {id:'memory',family:'memory',name:'MEM · 读取与写回',formula:'SRAM A → 流寄存器 → SRAM B',note:'选择一条读写路径，逐拍核对地址、数据有效位和写入时刻。'},
  {id:'control',family:'control',name:'ICU · Sync / Notify',formula:'Sync → Notify → 后续 Read',note:'一个 ICU 等待通知，另一个 ICU 在预定周期通知；演示静态计划，未加入动态 scoreboard。'}
 ];
 const f=Math.fround,vec=a=>a.map(f),copy=a=>a.slice(),fmt=v=>!Number.isFinite(v)?String(v):Number(v.toPrecision(5)).toString();
 function parameters(raw={}){const p={...defaults,...raw};for(const [k,v]of Object.entries(p)){if(!Number.isFinite(Number(v)))throw Error(k+' 必须是有限数值');p[k]=Number(v);}if(p.ghz<.1||p.ghz>3)throw Error('时钟范围为 0.1—3 GHz');for(const k of ['hops','read','write','vector','shuffle','install','matrix','skew']){if(!Number.isInteger(p[k]))throw Error('周期参数必须为整数');}if(p.hops<1||p.hops>6)throw Error('寄存器距离范围为 1—6 跳');if(p.skew<0||p.skew>2)throw Error('d_skew 范围为 0—2 拍');for(const k of ['read','write','vector','shuffle','install'])if(p[k]<1||p[k]>8)throw Error('功能延迟范围为 1—8 拍');if(p.matrix<4||p.matrix>16)throw Error('四项 MAC 窗口的示例延迟范围为 4—16 拍');return p;}
 function build(key='q',raw={}){
  const p=parameters(raw),lesson=lessons.find(x=>x.id===key);if(!lesson)throw Error('未知逐周期课程');
  const program=[],routes=[],memory=[],stages=[],occupied=new Set(),x=vec(['rope','silu'].includes(key)?[1,-2,3,-4]:[1,2,3,4]);let serial=0,address=32,stageName='准备',ready=0;
  function slot(unit,label,values,addr){const m={id:'m'+memory.length,unit,label,values:vec(values),address:addr??address++,initial:true,planes:lesson.family==='matrix'?2:4};memory.push(m);return m;}
  const input=slot('MEM_A','X',x,0),output={unit:'MEM_B',address:511,label:'Y',id:'result',values:[],initial:false};memory.push(output);
  function instruction(unit,op,issue,skew,latency,values,extra={}){
   if(issue<0||!Number.isInteger(issue))throw Error('非法发射周期');const reserved=unit+':'+issue;if(occupied.has(reserved))throw Error('静态计划发射冲突 '+reserved);occupied.add(reserved);
   const item={id:'i'+serial++,unit,op,issue,skew,latency,consume:issue+skew,ready:issue+skew+latency,values:vec(values),stage:stageName,...extra};program.push(item);return item;
  }
  function transfer(producer,bus,to){const r={id:'r'+routes.length,producer:producer.id,bus,from:producer.unit,to,start:producer.ready,end:producer.ready+p.hops,hops:p.hops,values:copy(producer.values),planes:producer.kind==='read'?producer.planes:4,tag:producer.outputLabel||producer.op};routes.push(r);return r;}
  // 每个字节平面由独立 MEM 切片产生。组内相距一跳，发射错开一拍，
  // 使 SG2 / SG4 在共同边界对齐。主界面折叠为一组，physicalProgram 展开全部切片。
  function read(m,issue,bus,to){const planes=m.planes||4,r=instruction(m.unit,'Read×'+planes+' '+m.label+', SG'+planes,issue,0,p.read+planes-1,m.values,{kind:'read',planes,func:p.read,memory:m.id,address:m.address,outputLabel:m.label,inputs:[{label:m.label,values:copy(m.values),location:'SRAM',memory:m.id}],deps:[]});return transfer(r,bus,to);}
  function write(route,m){const planes=4,i=instruction(m.unit,'Write×4 '+m.label+', SG4',route.end-p.skew,p.skew,p.write+planes-1,route.values,{kind:'write',planes,func:p.write,memory:m.id,address:m.address,outputLabel:m.label,inputs:[{label:route.tag,values:copy(route.values),location:'SR',route:route.id}],deps:[{id:route.producer,arrival:route.end}],destination:m.id});m.values=copy(route.values);m.initial=false;m.writer=i.id;return i;}
  function operation(name,unit,refs,fn,op,latency){
   stageName=name;const start=ready,inputs=refs.map((m,j)=>read(m,start,j?'W':'X',unit));const arrive=Math.max(...inputs.map(r=>r.end));
   const values=vec(fn(...refs.map(m=>copy(m.values))));const ins=instruction(unit,op,arrive-p.skew,p.skew,latency,values,{kind:'compute',inputs:refs.map((m,j)=>({label:m.label,values:copy(m.values),location:'SR',route:inputs[j].id})),deps:inputs.map(r=>({id:r.producer,arrival:r.end})),outputLabel:name});
   const route=transfer(ins,'Y','MEM_B'),dest={unit:'MEM_B',address:address++,label:name,id:'m'+memory.length,values,initial:false};memory.push(dest);const w=write(route,dest);ready=w.ready+1;stages.push({name,start,end:w.ready,unit,instruction:ins.id,expression:op,values});return dest;
  }
  const unary=(name,a,fn,op,unit='VXM')=>operation(name,unit,[a],v=>v.map(fn),op,unit==='SXM'?p.shuffle:p.vector);
  // 两个同时读取的向量分配到独立 MEM 切片，避免把两个 bank 冒充双发射端口。
  function mirrorToA(m){if(m.unit==='MEM_A')return m;stageName='中间量搬到 MEM A';const r=read(m,ready,'X','MEM_A'),dest={unit:'MEM_A',address:address++,label:m.label+' 副本',id:'m'+memory.length,values:copy(m.values),initial:false};memory.push(dest);const w=write(r,dest);stages.push({name:stageName,start:ready,end:w.ready,unit:'MEM_A',instruction:w.id,values:copy(m.values)});ready=w.ready+1;return dest;}
  function binary(name,a,b,fn,op){if(a.unit===b.unit)a=mirrorToA(a);return operation(name,'VXM',[a,b],(av,bv)=>av.map((v,i)=>fn(v,bv[i])),op,p.vector);}
  function permute(name,a,indices){return operation(name,'SXM',[a],v=>indices.map(i=>v[i]),'Permute ['+indices.join(',')+']',p.shuffle);}
  function reduction(a,fn,op){const first=permute('相邻元素配对',a,[1,0,3,2]);const pair=binary('第一轮 '+op,a,first,fn,op);const next=permute('两组结果配对',pair,[2,3,0,1]);return binary('第二轮 '+op,pair,next,fn,op);}
  let result;
  if(lesson.family==='matrix'){
   const W=[[2,1,0,-1],[0,1,2,0],[-1,0,1,1],[3,-1,0,2]];const loads=[];stageName='读取权重并装入 MXM 权重缓冲';
   for(let k=0;k<4;k++){const wm=slot('MEM_B','W'+k,W[k],16+k),r=read(wm,k,'W','MXM');loads.push(instruction('MXM','LW sW, 行 '+k,r.end-p.skew,p.skew,1,W[k],{kind:'lw',row:k,inputs:[{label:wm.label,values:W[k],location:'SR',route:r.id}],deps:[{id:r.producer,arrival:r.end}],outputLabel:'权重缓冲行 '+k}));}
   // ABC 捕获和 LW 共用一个 MXM ICU；捕获安排在最后一条 LW 之后。
   const captureIssue=loads.at(-1).issue+1,captureConsume=captureIssue+p.skew,xRead=captureConsume-p.hops-p.read-1;
   stageName='激活数据按计划到达 MXM';const xr=read(input,xRead,'X','MXM');const capture=instruction('MXM','ABC · 捕获激活',captureIssue,p.skew,1,x,{kind:'capture',inputs:[{label:'X',values:x,location:'SR',route:xr.id}],deps:[{id:xr.producer,arrival:xr.end}],outputLabel:'激活缓冲'});
   stageName='把权重缓冲安装到阵列';const iwAt=Math.max(capture.ready,loads.at(-1).ready),iw=instruction('MXM','IW · 安装权重',iwAt,0,p.install,[],{kind:'install',inputs:[{label:'W[4×4]',values:W.flat(),location:'权重缓冲'}],deps:loads.map(i=>({id:i.id,arrival:i.ready})),weights:W});
   stageName='阵列内四项乘加';const runIssue=Math.max(iwAt+1,iw.ready-p.skew),runConsume=runIssue+p.skew,partial=[];let acc=[0,0,0,0];for(let k=0;k<4;k++){acc=acc.map((v,j)=>f(v+x[k]*W[k][j]));partial.push(copy(acc));}
   const compute=instruction('MXM','ABC · 启动阵列',runIssue,p.skew,p.matrix,acc,{kind:'matrix',inputs:[{label:'X',values:x,location:'激活缓冲'},{label:'W[4×4]',values:W.flat(),location:'已安装阵列'}],deps:[{id:capture.id,arrival:capture.ready},{id:iw.id,arrival:iw.ready}],partial,weights:W,outputLabel:'阵列部分和'});
   stageName='ACC 输出 FP32 结果';const accIssue=Math.max(runIssue+1,compute.ready-p.skew),accumulate=instruction('MXM','ACC · 结果累加',accIssue,p.skew,1,acc,{kind:'acc',inputs:[{label:'阵列结果',values:acc,location:'累加寄存器'}],deps:[{id:compute.id,arrival:compute.ready}],outputLabel:'Y'});const resultRoute=transfer(accumulate,'Y','MEM_B');const w=write(resultRoute,output);result=output;ready=w.ready+1;
   stages.push({name:'权重预装与激活对齐',start:0,end:iw.ready,unit:'MXM',instruction:iw.id,values:[]},{name:'四项 MAC / ACC',start:runConsume,end:w.ready,unit:'MXM',instruction:compute.id,values:acc});
  }else if(key==='rope'){
   const swapped=permute('相邻维度交换',input,[1,0,3,2]);result=operation('旋转符号','VXM',[swapped],v=>v.map((a,i)=>i%2?a:-a),'Mul [−1,1,−1,1]',p.vector);
  }else if(key==='silu'){
   const neg=unary('取负号',input,a=>-a,'Mul −1'),ex=unary('计算指数',neg,a=>f(Math.exp(a)),'Exp'),den=unary('分母加一',ex,a=>f(1+a),'Add 1'),inv=unary('分母倒数',den,a=>f(1/a),'1 / x〔表达式〕');result=binary('SiLU 输出',input,inv,(a,b)=>f(a*b),'Mul');
  }else if(key==='softmax'){
   const max=reduction(input,Math.max,'Max'),sub=binary('减去最大值',input,max,(a,b)=>f(a-b),'Sub'),ex=unary('稳定指数',sub,a=>f(Math.exp(a)),'Exp'),z=reduction(ex,(a,b)=>f(a+b),'Add'),inv=unary('分母倒数',z,a=>f(1/a),'1 / x〔表达式〕');result=binary('归一化概率',ex,inv,(a,b)=>f(a*b),'Mul');
  }else if(key==='norm'){
   const sq=unary('输入平方',input,a=>f(a*a),'Mul x,x'),sum=reduction(sq,(a,b)=>f(a+b),'Add'),mean=unary('除以维度 4',sum,a=>f(a/4),'Mul 0.25'),eps=unary('加入 ε',mean,a=>f(a+1e-5),'Add 0.00001'),scale=unary('倒数平方根',eps,a=>f(1/Math.sqrt(a)),'RSqrt');result=binary('乘回输入',input,scale,(a,b)=>f(a*b),'Mul');
  }else if(key==='sum')result=reduction(input,(a,b)=>f(a+b),'Add');
  else if(key==='transpose')result=permute('转置结果',input,[0,2,1,3]);
  else if(key==='memory'||key==='control'){
   let start=0;if(key==='control'){stageName='ICU 同步';instruction('MEM_A','Sync · 等待通知',0,0,5,[],{kind:'sync',inputs:[],deps:[],outputLabel:'通知到达'});instruction('MEM_B','Notify · 唤醒 MEM A',4,0,1,[],{kind:'notify',inputs:[],deps:[],outputLabel:'通知'});start=5;stages.push({name:stageName,start:0,end:5,unit:'MEM_A',values:[]});}
   stageName='读取 SRAM 并经过逐拍 SR 写回';const r=read(input,start,'X','MEM_B'),w=write(r,output);result=output;ready=w.ready+1;stages.push({name:stageName,start,end:w.ready,unit:'MEM_B',instruction:w.id,values:x});
  }
  // 复杂算子的最后一个 SRAM 地址就是输出；不额外制造一次复制。
  output.values=copy(result.values);output.alias=result.id;const end=program.find(i=>i.id===result.writer)?.ready??ready-1;
  program.sort((a,b)=>a.issue-b.issue||units.indexOf(a.unit)-units.indexOf(b.unit));
  const physicalProgram=program.flatMap(i=>['read','write'].includes(i.kind)?Array.from({length:i.planes},(_,plane)=>({id:i.id+'p'+plane,parent:i.id,unit:i.unit+plane,plane,op:(i.kind==='read'?'Read':'Write')+' a'+i.address+', 字节流 '+plane,issue:i.issue+plane,consume:i.consume+plane,ready:i.consume+plane+i.func,latency:i.func,kind:i.kind})):['MEM_A','MEM_B'].includes(i.unit)?Array.from({length:4},(_,plane)=>({...i,id:i.id+'p'+plane,parent:i.id,unit:i.unit+plane,plane})): [{...i,parent:i.id}] );
  const model={version:9,kind:'逐周期示例计划，非真实编译器 trace',p,lesson,program,physicalProgram,routes,memory,stages,input:copy(x),expected:copy(result.values),output:result.id,firstEnd:end,lastEnd:end+19,superlanes:20,units:copy(units),dtype:lesson.family==='matrix'?'FP16 输入 SG2 / FP32 输出 SG4 · 显示前 4 / 16 lane':'FP32 的 SG4 字节流 · 显示前 4 / 16 lane',scope:'每个 SL 显示 16 个逻辑 lane 中的前 4 项，其余 lane 后续数值不模拟、不参加四项归约；20 个 SL 独立重复此例，不等于完整 Q 头。'};
  const violations=validate(model);if(violations.length)throw Error(violations.join('；'));return model;
 }
 function validate(m){const errors=[],byId=Object.fromEntries(m.program.map(i=>[i.id,i])),slots=new Set();for(const i of m.physicalProgram){const slot=i.unit+':'+i.issue;if(slots.has(slot))errors.push('同 ICU 同拍冲突 '+slot);slots.add(slot);}for(const i of m.program){for(const d of i.deps){const producer=byId[d.id];if(!producer||d.arrival<producer.ready||i.consume<d.arrival)errors.push('操作数未就绪 '+i.id);const input=i.inputs.find(x=>x.route&&m.routes.find(r=>r.id===x.route)?.producer===d.id);if(input&&i.consume!==d.arrival)errors.push('流已离开消费位置 '+i.id);}if(i.kind==='read'){const mem=m.memory.find(x=>x.id===i.memory);if(mem.writer&&byId[mem.writer].ready>i.consume)errors.push('SRAM 尚未写回 '+i.id);}}return errors;}
 function snapshot(m,cycle=0,superlane=0){
  const c=Math.max(0,Math.min(m.lastEnd,Math.floor(Number(cycle)||0))),sl=Math.max(0,Math.min(19,Math.floor(Number(superlane)||0))),program=m.program,byId=Object.fromEntries(program.map(i=>[i.id,i]));
  const active=program.filter(i=>i.issue+sl<=c&&c<=i.ready+sl),issued=program.filter(i=>i.issue===c),arrived=program.filter(i=>i.issue+sl===c),consuming=program.filter(i=>i.consume+sl===c),committed=program.filter(i=>i.ready+sl===c);
  const streams=m.routes.flatMap(r=>{const hop=c-r.start-sl;return hop>=0&&hop<=r.hops?[{...r,hop,valid:true,superlane:sl}]:[];});
  const store={};for(const mem of m.memory){if(mem.alias&&mem.alias!==mem.id)continue;const w=mem.writer&&byId[mem.writer];store[mem.id]={...mem,valid:mem.initial||!!w&&c>=w.ready+sl,values:mem.initial||!!w&&c>=w.ready+sl?copy(mem.values):[]};}
  const perUnit=m.units.map(unit=>{const all=program.filter(i=>i.unit===unit),instruction=all.find(i=>i.issue+sl===c),running=active.filter(i=>i.unit===unit&&i.consume+sl<=c&&c<i.ready+sl),waiting=active.filter(i=>i.unit===unit&&c<i.consume+sl),done=committed.filter(i=>i.unit===unit),last=all.filter(i=>i.ready+sl<=c).at(-1),pc=all.filter(i=>i.issue<=c).length;return{unit,instruction,running,waiting,done,last,pc,dispatch:issued.find(i=>i.unit===unit)};});
  const memEvents=m.physicalProgram.filter(i=>['read','write'].includes(i.kind));let bytes=0,nowBytes=0,reads=0,writes=0;for(const i of memEvents)for(let tile=0;tile<20;tile++){const at=i.ready+tile;if(at<=c){bytes+=16;if(i.kind==='read')reads+=16;else writes+=16;}if(at===c)nowBytes+=16;}
  const output=store[m.output],result=output?.valid?copy(output.values):null,completed=Array.from({length:20},(_,s)=>c>=m.firstEnd+s).filter(Boolean).length;
  const stage=stagesAt(m,c-sl),events=[...new Set([...program.flatMap(i=>[i.issue+sl,i.consume+sl,i.ready+sl]),...m.physicalProgram.flatMap(i=>[i.issue,i.issue+sl,i.consume+sl,i.ready+sl]),...m.routes.flatMap(r=>Array.from({length:r.hops+1},(_,h)=>r.start+sl+h))].filter(n=>n>=0&&n<=m.lastEnd))].sort((a,b)=>a-b);
  return{cycle:c,superlane:sl,ns:c/m.p.ghz,active,issued,arrived,consuming,committed,streams,store,units:perUnit,physicalIssued:m.physicalProgram.filter(i=>i.issue===c),physicalActive:m.physicalProgram.filter(i=>i.issue+sl<=c&&c<=i.ready+sl),bytes,nowBytes,reads,writes,bandwidth:nowBytes*m.p.ghz,averageGBs:c?bytes/(c/m.p.ghz):0,result,completed,stage,events,firstEnd:m.firstEnd+sl};
 }
 function stagesAt(m,c){return m.stages.find(s=>c>=s.start&&c<=s.end)||m.stages.filter(s=>s.start<=c).at(-1)||m.stages[0];}
 function nextEvent(m,c,sl,direction=1){const events=snapshot(m,c,sl).events;return direction>0?events.find(n=>n>c)??m.lastEnd:events.filter(n=>n<c).at(-1)??0;}
 function createClock({end,onTick,onStatus,requestFrame,cancelFrame,interval=()=>350}){
  let cycle=0,running=false,handle=null,last=null,elapsed=0;
  const stop=()=>{running=false;if(handle!==null)cancelFrame(handle);handle=null;last=null;elapsed=0;onStatus?.(false);};
  const seek=n=>{cycle=Math.max(0,Math.min(end(),Math.floor(n)));stop();onTick(cycle);};
  function frame(time){if(!running)return;if(last===null)last=time;else{elapsed+=Math.max(0,time-last);last=time;const step=Math.max(16,Number(interval())||350);while(elapsed>=step&&cycle<end()){elapsed-=step;onTick(++cycle);}if(cycle>=end()){stop();return;}}handle=requestFrame(frame);}
  function play(){if(running)return;if(cycle>=end()){cycle=0;onTick(cycle);}running=true;last=null;elapsed=0;onStatus?.(true);handle=requestFrame(frame);}
  return{play,stop,seek,get cycle(){return cycle;},get running(){return running;}};
 }
 const api={defaults,units,lessons,parameters,build,validate,snapshot,nextEvent,createClock,fmt};root.GROQ_CYCLE=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
