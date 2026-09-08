/* UTF-8 · 软件算子拆解；物理端点全部属于同一张 TSP 功能图。 */
(function(root){
 'use strict';
 const P=root.GROQ_PERFORMANCE||(typeof require!=='undefined'?require('./performance-model.js'):null);
 const families=[
  {id:'matrix',name:'矩阵计算',unit:'MXM / MACC',note:'Q 头是张量维度。Q、K、V 投影和 FFN 在 MXM 的 MACC 阵列执行；图上高亮一处代表性 MAC，不表示每个头有专用电路。',ops:[['q','Q 投影'],['k','K 投影'],['v','V 投影'],['qk','QKᵀ'],['pv','P × V'],['wo','Wo 输出投影'],['ffn_gate','Gate 投影'],['ffn_up','Up 投影'],['ffn_down','Down 投影']]},
  {id:'vector',name:'向量计算',unit:'中央 VXM',note:'逐元素计算在中央 VXM 的 ALU 链完成。RoPE 的元素配对由数据布局与 SXM 配合；这里没有第二块 VXM。',ops:[['rope','RoPE 旋转'],['ffn_silu','SiLU'],['ffn_mul','Gate × Up'],['residual1','残差 Add'],['mask','缩放 / Mask'],['p_cast','概率格式转换']]},
  {id:'reduce',name:'归约',unit:'VXM + SXM',note:'Sum / Max 使用 VXM 的算术功能；跨 lane 对齐可由 SXM 配合。示例的成对合并是软件计算依赖，不表示芯片上新增了独立 Reduction Tree。',ops:[['sum','Sum 求和'],['max','Max 最大值'],['norm1','RMSNorm'],['softmax','Softmax']]},
  {id:'shuffle',name:'数据重排',unit:'SXM + 流寄存器',note:'Transpose、Permute、Shuffle 改变元素或流的位置。SXM 搬动数据，不完成矩阵乘法。硬件支持的 16×16 转置在这里用 2×2 数值窗口说明。',ops:[['transpose','Transpose'],['permute','Permute / Shuffle'],['heads','头维度重排']]},
  {id:'memory',name:'存储访问',unit:'MEM / SRAM / SRF',note:'SRAM 的读写由 MEM 完成，向量通过流寄存器 SRF 传递。主机边界由 PCIe / DMA 接入；本页第一代 TSP 图不添加 HBM 控制器。',ops:[['weight_read','读取权重'],['activation_read','读取激活'],['kv_read','读取 KV'],['kv_write','追加 KV']]},
  {id:'control',name:'控制调度',unit:'编译时序 + ICU',note:'编译器安排资源、流与时序，各功能切片的 ICU 执行自己的指令。IFETCH、NOP、Repeat、SYNC / NOTIFY 用于控制；不按 GPU 动态 Scoreboard 来画。',ops:[['issue','IFETCH / 发出指令'],['dependency','数据依赖 / NOP'],['sync','SYNC / NOTIFY'],['repeat','Repeat / 循环']]}
 ];
 const ops=families.flatMap(f=>f.ops.map(([id,name])=>({id,name,family:f.id}))),defaults={sxmGBs:4000,clockGHz:1,waitCycles:4,repeat:4};
 const fmt=n=>Number.isFinite(n)?String(Math.round(n*1000)/1000):n===-Infinity?'−∞':String(n),list=a=>'['+a.map(fmt).join(', ')+']';
 function build(m,key,chipId=m.group[0],raw={}){
  const op=ops.find(x=>x.id===key);if(!op)throw Error('未知的软件算子');const family=families.find(f=>f.id===op.family),ch=m.chips[chipId],p={...defaults,...raw};
  for(const [k,lo,hi]of [['sxmGBs',1,100000],['clockGHz',.01,10],['waitCycles',0,10000],['repeat',1,64]]){p[k]=Number(p[k]);if(!Number.isFinite(p[k])||p[k]<lo||p[k]>hi||(['waitCycles','repeat'].includes(k)&&!Number.isInteger(p[k])))throw Error('请检查 '+k+' 的教学参数');}
  const pre='C'+chipId+'_',steps=[],x=[1,2,3,4];let result=[],worked=0,bytes=0,vector=0,flops=0,compute=0,transport=0,clock=0,fixed=m.p.operatorUs/1000,formulas=[],shape='',rowLabels=['输入','输出'],description='独立四元素数值例子，与右侧完整模型形状分开。';
  const mark=(a,b,label,tone='data',delay=0)=>({from:pre+a,to:pre+b,label,tone,delay});
  function add(title,instruction,data,focus,packets=[],values=[],writes={}){steps.push({title,explain:data,instruction,dataLabel:values.length?list(values):data.slice(0,13),focus:focus.map(k=>pre+k),packets,state:{},values:values.slice(),writes});}
  function putInstruction(){add('指令准备','ICU：IFETCH','软件先确定该算子的地址、资源和执行顺序。',['ICU'],[mark('PROG','ICU','IFETCH','control')]);}
  const commit=(target,value)=>({[pre+target]:{label:[value],classes:['hw-computed']}});
  const base=m.base.steps.find(s=>s.id===key);
  if(['matrix','vector'].includes(op.family)||['norm1','softmax'].includes(key)){
   const v=m.localOp(key,chipId);({flops,vector,bytes}=v);compute=flops/m.base.effective.matrix*1000+vector/m.base.effective.vector*1000;transport=bytes/m.base.effective.memory*1000;fixed=base.fixedMs;shape=base.shape;formulas=[`本片 ${P.ops(flops)} FLOPs；${P.ops(vector)} 个等效向量工作项`,`片上最低读写 ${P.bytes(bytes)}；固定算子预算 ${P.time(fixed)}`];
  }
  if(op.family==='matrix'){
   const w=[2,0,-1,3];putInstruction();add('MEM 取两路操作数','MEM：Read','激活与右矩阵送往流寄存器；QK / PV 的右矩阵来自 KV，其他投影来自权重。',['W','KV','SRF'],[mark('INPUT','SRF',list(x)),mark(['qk','pv'].includes(key)?'KV':'W','SRF',list(w),'weight',.2)],x);
   add('送入 MXM','SXM：布局 / 路由','SXM 对齐操作数，流进入 MXM。若编译布局已经满足条件，可以直接转发。',['SW','MAC'],[mark('SRF','SW','x / w'),mark('SW','MAC','操作数','weight',.2)],x);
   for(let k=0;k<4;k++){const prev=worked;worked+=x[k]*w[k];add('MAC 第 '+(k+1)+' 项','MXM：乘并累加',`${prev} + ${x[k]} × ${w[k]} = ${worked}。这是同一个 MAC 的累加过程。`,['MAC'],[mark('SRF','MAC',`${x[k]}×${w[k]}`,'weight')],[worked],commit('MAC',fmt(worked)));}
   result=[worked];add('结果离开矩阵阵列','MEM：Write / 流转发','结果进入流寄存器，按后续消费者安排写回。Wo / Down 是本片部分和，还需跨片归约。',['MAC','SRF'],[mark('MAC','SRF','y='+worked,'result')],result,commit('SRF','输出 '+worked));
   rowLabels=['x','w','逐项乘积','最终点积'];description+='四项 MAC 示例的 x、w 固定；不冒充所选查询头的实际推理结果。';
   formulas.push(key==='q'?`Q = XWq；本片拥有 ${ch.headEnd-ch.headStart} 个 Q 头，每头 d=${m.d.d}。先算投影，再按头解释张量。`:key==='k'||key==='v'?`本片保存 KV 头 ${ch.kvHeads.join(',')}。`:`本片 Q 头 ${ch.headStart}—${ch.headEnd-1}，FFN 通道 ${ch.ffStart}—${ch.ffEnd-1}。`);
   shape=key.startsWith('ffn')?`本片 F=${ch.ff}；B=${m.d.B}，T=${m.d.T}，D=${m.d.D}`:`本片 Q 宽度 ${ch.headDim}，KV 宽度 ${ch.localK}；T=${m.d.T}。${m.d.B*m.d.T===1?'本轮为向量 × 矩阵（GEMV 形式）':'本轮为矩阵 × 矩阵（GEMM 形式）'}`;
  }else if(op.family==='vector'){
   const a=[1,-2,3,-4],b=[.5,.5,.5,.5];result=key==='rope'?[2,1,4,3]:key==='ffn_silu'?a.map(v=>v/(1+Math.exp(-v))):key==='ffn_mul'?a.map((v,i)=>v*b[i]):key==='residual1'?a.map((v,i)=>v+b[i]):key==='mask'?[.5,-1,-Infinity,-Infinity]:a.slice();
   putInstruction();add('输入读入流','MEM：Read','MEM 负责读取，VXM 接收流中的操作数。',['INPUT','SRF'],[mark('INPUT','SRF',list(a))],a);
   add(key==='rope'?'成对元素对齐':'操作数进入 ALU','SXM：配对 / 流转发',key==='rope'?'例子按相邻两维配对，旋转角为 π/2。':'依赖前序算子的输入先到达 VXM。',['SE','ALU'],[mark('SRF',key==='rope'?'SE':'ALU',list(a))],a);
   const expression=key==='rope'?'(a,b) 变为 (−b,a)':key==='ffn_silu'?'SiLU(x)=x/(1+exp(−x))':key==='ffn_mul'?'例子第二路 Up=[0.5,0.5,0.5,0.5]':key==='residual1'?'逐元素加 [0.5,0.5,0.5,0.5]':key==='mask'?'例子除以 2，并屏蔽最后两个位置':'展示格式转换位置；没有模拟 FP16 舍入';
   add('VXM 逐元素执行','VXM：'+op.name,expression,['ALU'],[mark(key==='rope'?'SE':'SRF','ALU',op.name,'control')],result,commit('ALU',fmt(result[0])));
   add('结果进入后续流','流寄存器：传递','VXM 的 ALU 链可将结果直接送给后续消费者。',['ALU','SRF'],[mark('ALU','SRF',list(result),'result')],result,commit('SRF','向量结果'));
   add('按计划写回或继续消费','MEM：Write / 转发','向量计算和 SRAM 写入属于不同功能单元。',['INPUT'],[mark('SRF','INPUT','结果','result')],result,commit('INPUT','结果已到达'));
  }else if(op.family==='reduce'){
   putInstruction();add('读取一组元素','MEM：Read','下面的归约均在同一个中央 VXM 区域进行。',['INPUT','ALU'],[mark('INPUT','ALU',list(x))],x);
   if(key==='norm1'){
    const squares=x.map(v=>v*v),mean=squares.reduce((a,b)=>a+b,0)/4,scale=1/Math.sqrt(mean+1e-5);result=x.map(v=>v*scale);
    add('逐项平方','VXM：Mul','x² = '+list(squares),['ALU'],[mark('SRF','ALU','x × x','control')],squares,commit('ALU','x²'));
    add('成对合并','SXM 对齐 + VXM Add','1+4=5，9+16=25；这两项仍是部分和。',['SE','SUM'],[mark('ALU','SE','对齐'),mark('SE','SUM','5 / 25','result',.2)],[5,25],commit('SUM','5 / 25'));
    add('求和并除以维度','VXM：Add / Scale','(5+25)/4=7.5。γ=1，ε=0.00001。',['SUM'],[mark('SE','SUM','30 ÷ 4','result')],[mean],commit('SUM',fmt(mean)));
    add('倒数平方根','VXM：rsqrt','rsqrt(7.5+ε)='+fmt(scale),['ALU'],[mark('SUM','ALU','均值','data')],[scale],commit('ALU',fmt(scale)));
    add('广播缩放并乘回 x','VXM：Mul','每个输入乘同一个缩放系数。',['ALU'],[mark('SUM','ALU','缩放系数','control')],result,commit('ALU',fmt(result[0])));
   }else if(key==='softmax'){
    const ex=x.map(v=>Math.exp(v-4)),z=ex.reduce((a,b)=>a+b,0);result=ex.map(v=>v/z);
    add('成对取最大值','SXM 对齐 + VXM Max','max(1,2)=2；max(3,4)=4。',['SE','SUM'],[mark('ALU','SE','位置配对'),mark('SE','SUM','2 / 4','result',.2)],[2,4],commit('SUM','2 / 4'));
    add('全组最大值','VXM：Max','max(2,4)=4，用于稳定指数计算。',['SUM'],[mark('SE','SUM','max','control')],[4],commit('SUM','4'));
    add('减最大值并取 exp','VXM：Sub / Exp','exp(x−4)='+list(ex),['ALU'],[mark('SUM','ALU','m=4','data')],ex,commit('ALU','exp'));
    add('归约分母','VXM：Sum','Z = '+fmt(z)+'；全部元素共享这个分母。',['SUM'],[mark('ALU','SUM','Σ exp','result')],[z],commit('SUM',fmt(z)));
    add('逐元素除以分母','VXM：Div','概率 = '+list(result)+'；总和为 1。',['ALU'],[mark('SUM','ALU','Z','data')],result,commit('ALU',fmt(result[0])));
   }else{
    const pair=key==='sum'?[3,7]:[2,4];result=[key==='sum'?10:4];vector=m.d.B*m.d.T*(m.d.D-1);bytes=m.d.B*m.d.T*(m.d.D*2+4);compute=vector/m.base.effective.vector*1000;transport=bytes/m.base.effective.memory*1000;shape=`每行 D=${m.d.D}，共 B×T=${m.d.B*m.d.T} 行`;
    add('跨位置对齐','SXM：Shuffle','SXM 只移动元素，算术操作由 VXM 执行。',['SE'],[mark('ALU','SE',list(x))],x);
    add('第一轮合并','VXM：'+(key==='sum'?'Add':'Max'),'成对结果 '+list(pair)+'，尚未完成全组归约。',['SUM'],[mark('SE','SUM',list(pair),'result')],pair,commit('SUM',pair.join('/')));
    add('第二轮合并','VXM：'+(key==='sum'?'Add':'Max'),'最终结果 '+result[0]+'。两轮是四元素例子的依赖深度，不是全芯片实测周期。',['SUM'],[mark('SE','SUM',String(result[0]),'result')],result,commit('SUM',String(result[0])));
    formulas=[`每行 ${m.d.D-1} 次 ${key==='sum'?'加法':'比较'}；共 ${P.ops(vector)} 个等效向量项`,`读 FP16 输入并写 FP32 标量：${P.bytes(bytes)}`];
   }
   add('写回归约结果','MEM：Write','中央 VXM 输出结果，MEM 负责存储。',['SRF','INPUT'],[mark(key==='sum'||key==='max'?'SUM':'ALU','INPUT',list(result),'result')],result,commit('INPUT','归约结果'));
  }else if(op.family==='shuffle'){
   result=key==='permute'?[3,1,4,2]:[1,3,2,4];bytes=4*m.d.B*(key==='transpose'?m.d.S*ch.localK:m.d.T*m.d.D);transport=bytes/m.base.effective.memory*1000;compute=(bytes/2)/(p.sxmGBs*1e9)*1000;shape=key==='transpose'?`本片 K 的 B×S×K_local，K_local=${ch.localK}`:`B×T×D=${m.d.B*m.d.T*m.d.D} 个 FP16 元素`;formulas=[`本独立示例显式读写一次 SRAM，共 ${P.bytes(bytes)}`,`重排传递 ${P.bytes(bytes/2)}，假设有效 ${p.sxmGBs} GB/s；矩阵 FLOPs=0`];
   putInstruction();add('源布局','MEM：Read',key==='permute'?'源顺序 [1,2,3,4]。':'2×2 行优先次序 [1,2,3,4]。',['INPUT'],[mark('INPUT','SRF',list(x))],x);
   add('流进入 SXM','SXM：接收输入流','流寄存器保存途中数据，SXM 决定元素的目的位置。',['SW','SRF'],[mark('SRF','SW',list(x))],x);
   add('执行位置映射','SXM：'+op.name,key==='permute'?'输出按源索引 [2,0,3,1] 排列。':'交换行列后次序为 [1,3,2,4]；元素值不变。',['SW'],[mark('SRF','SW',list(result),'result')],result,commit('SWSL1','重排'));
   add('新次序输出','流寄存器：接收','数值集合没有变化，只改变次序。',['SRF'],[mark('SW','SRF',list(result),'result')],result,commit('SRF',list(result)));
   add('按新布局存储','MEM：Write','真实编译可流式转发，本独立演示选择显式写回以核对地址。',['INPUT'],[mark('SRF','INPUT','新布局','result')],result,commit('INPUT','新布局'));
  }else if(op.family==='memory'){
   const write=key==='kv_write',source=key==='weight_read'?'W':key==='kv_read'?'KV':'INPUT',destination=write?'KVNEW':'SRF';bytes=key==='weight_read'?ch.layerWeights/ch.layers:key==='kv_read'?2*m.d.B*m.d.S*ch.localK*2:write?2*m.d.B*m.d.T*ch.localK*2:m.d.B*m.d.T*m.d.D*2;transport=bytes/m.base.effective.memory*1000;result=x.slice();shape=write?'只追加本轮 T 个位置':key==='kv_read'?'读取本请求、本层、本片头的 K 与 V':'当前层本片的 '+op.name;formulas=[`MEM 的有效读写带宽：${P.num(m.base.effective.memory/1e12)} TB/s`,`本次 ${P.bytes(bytes)} ÷ 带宽 = ${P.time(transport)}`];
   putInstruction();add('软件确定地址','编译布局 / 地址','按请求、层、头与位置确定缓存范围；不是把“头”做成独立硬件块。',[source]);
   add(write?'新 K / V 到达流':'MEM 读入流',write?'VXM / MXM：输出':'MEM：Read',write?'K 的旋转结果来自 VXM，V 的投影结果来自 MXM。':'MEM 读出 SRAM 中的值；VXM 不执行 Load。',[write?'ALU':source,'SRF'],write?[mark('ALU','SRF','新 K'),mark('MAC','SRF','新 V','data',.2)]:[mark(source,'SRF',list(x))],x);
   add(write?'追加到新位置':'流送给消费者',write?'MEM：Write':'SRF：传递',write?'已有历史不被本轮覆盖。':'读取结果沿流送往对应消费者。',[destination],write?[mark('SRF','KVNEW','新位置','result')]:[mark('SRF',['weight_read','kv_read'].includes(key)?'MAC':'ALU','操作数')],result,commit(destination,write?'新 KV 到达':'读出 '+list(x)));
   add('检查数据状态','地址与长度保持','中间图表示一次指定访问，右侧统计本次实际字节。',[destination],[],result);
   add('本次访问完成','后续指令可消费','对超容量配置仅显示机制说明，不表示设备实际装入成功。',[destination],[],result);
  }else{
   const cycles=key==='repeat'?2+2*p.repeat:6+p.waitCycles;clock=cycles/(p.clockGHz*1e9)*1000;fixed=0;shape='软件时序 / ICU 控制示例';formulas=[`假设时钟 ${p.clockGHz} GHz；本例预算 ${cycles} 周期`,`时间 = ${cycles} ÷ (${p.clockGHz}×10⁹) = ${P.time(clock)}`,'周期数为本例设定，不是从动画帧数或完整模型推导的硬件实测。'];
   putInstruction();add('切片 ICU 接收计划','ICU：指令队列','每个功能切片有自己的 ICU；图中长条代表 ICU 组。',['ICU'],[mark('ICU','W','Read 指令','control')]);
   add(key==='sync'?'消费者暂停':key==='repeat'?'记录重复范围':'激活先到达',key==='sync'?'ICU：SYNC':key==='repeat'?'ICU：Repeat':'MEM：Read','软件可观察操作数是否到达，这不是额外画出的动态 Scoreboard。',['ICU','SRF'],[mark('INPUT','SRF','x 就绪')],[1]);
   add(key==='sync'?'生产者发出通知':key==='repeat'?'重复执行块':'等待权重到达',key==='sync'?'ICU：NOTIFY':key==='repeat'?'ICU：Repeat × '+p.repeat:'ICU：NOP '+p.waitCycles,key==='sync'?'同片参与同步的 ICU 按程序通知并恢复；不是 MEM 自己发指令。':key==='repeat'?'本页以固定次数重复指令块，循环结构属于程序。':'编译器安排等待，使消费指令与操作数的到达时间匹配。',['ICU','W'],[mark('ICU','MAC',key==='sync'?'NOTIFY':'计划时序','control'),mark('W','SRF','w 就绪','weight',.2)],[2]);
   add('消费指令执行','ICU：发出 MXM 指令','本例操作数已具备，矩阵指令按编排执行。',['ICU','MAC'],[mark('ICU','MAC','执行','control')],[3],commit('MAC','执行'));
   add('继续后续指令','ICU：后续程序','依赖、同步和循环决定何时执行，不会增加额外的矩阵或向量硬件。',['ICU'],[],[4],commit('ICU','后续指令'));
   steps.forEach((s,i)=>{s.dataLabel=['程序块','指令就绪','x 已到 / w 等待','x 与 w 已到','消费操作数','后续结果'][i];s.values=[];});result=[cycles];description='独立指令序列示例；不执行真实编译器，也不宣称复现其逐周期汇编。';
  }
  const low=Math.max(compute,transport)+fixed+clock,high=compute+transport+fixed+clock;
  function patch(index,settled){const out={};for(let i=0;i<index+(settled?1:0);i++)Object.assign(out,steps[i]?.writes||{});return out;}
  return{op,family,chipId,params:p,phases:steps,patch,shape,description,input:x,result,rowLabels,flops,vector,bytes,compute,transport,fixed,clock,low,high,formulas};
 }
 const api={families,ops,defaults,build};root.GROQ_OPERATORS=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
