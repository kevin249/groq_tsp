/* UTF-8 · 基于公开 TSP ISA 的教学型静态指令展开；不是 Groq 3 私有 ISA / compiler trace。 */
export const TSP_PUBLIC_ISA={
 ICU:[['NOP N','等待 N 个逻辑周期'],['Ifetch','从 stream / 本地存储补充指令'],['Sync','等待 barrier 通知'],['Notify','释放等待中的 barrier'],['Config','配置低功耗模式'],['Repeat n,d','重复前一指令']],
 MEM:[['Read a,s','地址 a 读向量到 stream s'],['Write a,s','stream s 写回地址 a'],['Gather s,map','按 map 间接读取'],['Scatter s,map','按 map 间接写回'],['Countdown / Step / Iterations','地址生成循环控制']],
 VXM:[['unary operation','单输入逐元素运算'],['binary operation','双输入逐元素运算'],['type conversions','类型转换'],['ReLU / TanH / Exp / RSqrt','公开向量特殊函数']],
 MXM:[['LW','stream → weight buffer'],['IW','weight buffer / stream → 320×320 array'],['ABC','协调激活到达并启动矩阵执行'],['ACC','取回并累加 MXM 结果']],
 SXM:[['Shift up/down N','lane shift'],['Permute map','320 输入的双射置换'],['Distribute map','superlane 内重排/复制'],['Rotate stream','生成旋转流'],['Transpose sg16','16×16 转置']],
 C2C:[['Deskew','管理链路 skew'],['Send','发送 320-byte vector'],['Receive','接收并写入片上 memory']]
};
const first=(events,fn,fallback=0)=>{const i=events.findIndex(fn);return i<0?fallback:i;};
const last=(events,fn,fallback)=>{for(let i=events.length-1;i>=0;i--)if(fn(events[i]))return i;return fallback??Math.max(0,events.length-1);};
const item=(slice,opcode,operand,why,event,kind='public')=>({slice,opcode,operand,why,event,kind});
const vxmOpcode=e=>{const s=(e.instruction+' '+e.name).toLowerCase();if(s.includes('exp'))return'Exp';if(s.includes('sqrt')||s.includes('rsqrt'))return'RSqrt';if(s.includes('relu'))return'ReLU';if(s.includes('tanh'))return'TanH';if(/\+|add|sum|max|mul|×|sub|−|\/ /.test(s))return'binary operation';return'unary operation';};
const sxmOpcode=e=>{const s=(e.instruction+' '+e.name).toLowerCase();if(s.includes('transpose')||s.includes('转置'))return'Transpose sg16';if(s.includes('rotate')||s.includes('旋转'))return'Rotate stream';if(s.includes('shift'))return'Shift up/down N';return'Permute map';};
export function compileTeachingInstructions(program,step,ctx){
 const events=program.events||[],out=[],scope=ctx?.level||step?.level||'chip';
 const add=(...a)=>out.push(item(...a));
 if(scope!=='chip'){
  const route=program.meta?.route||[];
  return{scope:'system',title:'当前处于系统/板级数据路径',note:'Host、GPU、ConnectX-9、Spectrum-X、Tray NIC/Fabric 属于系统互联层，不冒充 TSP 片上 ISA。进入 LPU die 后再展开 ICU / MEM / MXM / VXM / SXM / C2C 指令。',instructions:route.length?route.slice(0,-1).map((x,i)=>item('SYSTEM','MOVE',x+' → '+route[i+1],'系统数据搬运',Math.min(events.length-1,i),'system')):[]};
 }
 const read=first(events,e=>e.unit==='MEM'&&(e.read?.length||0)>0,0),compute=first(events,e=>['MXM','VXM','SXM','C2C'].includes(e.unit),Math.min(1,events.length-1)),write=last(events,e=>e.unit==='MEM'&&(e.write?.length||0)>0,events.length-1);
 add('ICU','Ifetch','slice instruction stream','公开 TSP：ICU 负责取指/解码/parcel；这里不推断真实 instruction address',0);
 if(program.type==='matrix'){
  add('MEM','Read aW,sW','symbolic W stream','把权重送到 MXM 一侧；地址/stream 编号未公开',read);
  add('MXM','LW','sW → weight buffer','公开 MXM 指令：load weights',read);
  add('MXM','IW','weight buffer → array','公开 MXM 指令：install weights',read);
  add('MEM','Read aX,sX','symbolic activation stream','激活沿 stream 到 MXM',read);
  add('MXM','ABC','sX / activation buffer','公开 MXM 指令：协调激活到达并启动阵列',compute);
  add('MXM','ACC','array result → sY','公开 MXM 指令：累加/取回 INT32 或 FP32 结果',last(events,e=>e.unit==='MXM',compute));
  add('MEM','Write aY,sY','symbolic result stream','结果需要落存储时写回；若真实编译器做 chaining 可直接继续流向下游',write);
 }else if(['vector','norm','softmax','rope','state','router'].includes(program.type)){
  add('MEM','Read aX,sX','symbolic input stream','输入从 MEM slice 进入水平 data stream',read);
  const vEvents=events.map((e,i)=>({e,i})).filter(x=>x.e.unit==='VXM');
  if(vEvents.length)for(const {e,i} of vEvents)add('VXM',vxmOpcode(e),'sX → sY',e.instruction||e.name,i);
  else add('VXM','unary / binary operation','sX → sY','教学映射：当前算子由向量 slice 执行',compute);
  add('MEM','Write aY,sY','symbolic output stream','需要落存储时写回',write);
 }else if(program.type==='transfer'&&(step?.unit==='C2C'||step?.to==='C2C'||step?.from==='C2C')){
  add('C2C','Send','sX','公开 C2C 指令：发送 320-byte vector',compute);
  add('C2C','Deskew','link','公开 C2C 指令：管理 plesiochronous link skew',compute);
  add('C2C','Receive','link → MEM','公开 C2C 指令：接收并 emplace 到 memory',write);
 }else if(step?.unit==='SXM'||program.type==='shuffle'){
  add('MEM','Read aX,sX','symbolic input stream','输入 stream',read);
  add('SXM',sxmOpcode(events[compute]||{}),'map / stream','公开 SXM 数据重排类别',compute);
  add('MEM','Write aY,sY','symbolic output stream','输出 stream 写回',write);
 }else{
  add('MEM','Read aX,sX','symbolic input stream','教学映射：输入准备',read);
  add(step?.unit||'ICU','operation','symbolic operands','当前 semantic event 没有足够公开信息映射到更具体 opcode',compute,'derived');
  add('MEM','Write aY,sY','symbolic output stream','教学映射：结果提交',write);
 }
 out.forEach((x,i)=>{x.id='tsp-'+i;x.event=Math.max(0,Math.min(events.length-1,x.event??0));});
 return{scope:'tsp',title:'公开 TSP ISA · 教学型静态程序',note:'opcode 来自公开 TSP/TSM 资料；地址、stream 编号、NOP/Repeat 数量、真实 Groq 3 编译排程均未知，因此这里展示“指令如何驱动数据流”，不是实机 trace。',instructions:out};
}
export function activeInstructionIndexes(compiled,eventIndex){
 const xs=compiled.instructions||[];let best=-1;for(const x of xs)if(x.event<=eventIndex)best=Math.max(best,x.event);return xs.map((x,i)=>x.event===best?i:-1).filter(i=>i>=0);
}

// 事件内连续动画：只把已有 semantic 状态做确定性插值，不引入硬件 latency/cycle 假设。
if(typeof window!=='undefined'&&typeof requestAnimationFrame==='function'){
 const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>x*x*(3-2*x),unitOf=(e,a)=>e&&a[e.unit]?e.unit:(e?.write?.length&&a.MEM?'MEM':e?.read?.length&&a.MEM?'MEM':null);
 const animate=()=>{
  requestAnimationFrame(animate);if(document.hidden||document.body?.dataset?.workspace!=='spatial')return;
  const app=window.SPATIAL_LAB_APP;if(!app?.semantic?.program||!app.hardware?.anchors)return;const p=app.semantic.program,idx=app.semantic.index,e=p.events?.[idx];if(!e)return;
  const state=app.state,a=app.hardware.anchors,eventSpan=state.duration/Math.max(1,p.events.length),phase=ease(clamp(eventSpan?state.elapsed/eventSpan-idx:0));
  const animated=app.dataLayer.children.filter(n=>n.userData.semanticAnimated);if(!animated.length)return;
  const data=animated.find(n=>n.geometry?.type==='SphereGeometry'),instruction=animated.find(n=>n.geometry?.type==='OctahedronGeometry');
  if(data){
   let from=null,to=null;
   if(p.type==='transfer'&&p.meta?.route?.length>1){const hop=Math.min(p.meta.route.length-2,e.hop||0),prev=p.events[Math.max(0,idx-1)],x=a[p.meta.route[hop]],y=a[p.meta.route[hop+1]];if(x&&y){const q0=prev?.hop===hop&&prev?.total?clamp((prev.received||0)/prev.total):0,q1=e.total?clamp((e.received||0)/e.total):q0;from=x.clone().lerp(y,q0);to=x.clone().lerp(y,q1);if(e.stalled&&q0===q1){const wobble=.08*Math.sin(phase*Math.PI);from.add({x:0,y:wobble,z:0});to.copy(from);}}}
   }else{const prev=p.events[Math.max(0,idx-1)],u0=unitOf(prev,a)||'MEM',u1=unitOf(e,a)||u0;from=a[u0]?.clone();to=a[u1]?.clone();if(from&&to&&u0===u1){const r=.13,s=phase*Math.PI*2;to.add({x:Math.cos(s)*r,y:0,z:Math.sin(s)*r});}}
   if(from&&to)data.position.copy(from.lerp(to,phase)).add({x:0,y:.58,z:0});
  }
  if(instruction&&a.ICU){const target=unitOf(e,a);if(target&&a[target]){instruction.visible=state.follow;instruction.position.copy(a.ICU.clone().lerp(a[target],phase)).add({x:0,y:.72,z:0});instruction.rotation.y=phase*Math.PI*2;instruction.rotation.x=phase*Math.PI;}else instruction.visible=false;}
 };
 requestAnimationFrame(animate);
}
