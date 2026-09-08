/* UTF-8 · 每个算子的四段硬件分镜，以及同硬件归属的数值窗格。 */
(function(root){
 'use strict';const P=root.GROQ_PERFORMANCE||(typeof require!=='undefined'?require('./performance-model.js'):null);
 const f=n=>n===-Infinity?'−∞':Number.isFinite(n)?String(Number(n.toFixed(3))):String(n),v=(label,classes=['hw-data'])=>({label:Array.isArray(label)?label.map(String):[String(label)],classes});
 const packet=(from,to,label,tone='data',delay=0)=>({from,to,label:String(label),tone,delay});
 const types={
  matrix:['MEM 取权重与输入','操作数送入 MXM','MAC 乘并累加','结果锁存 / 交给下一资源'],
  vector:['读取向量操作数','各 lane 执行逐元素操作','归约 / 分发中间结果','VXM 输出锁存'],
  memory:['确定源数据与目的地址','使能 MEM 存储位置','数据写入 / 读出','寄存器保持本次结果'],
  network:['源端缓冲已准备','网络序列化与传播','目标 NIC / 缓冲接收','交给目标端服务'],
  cpu:['CPU 读取服务缓冲','执行当前服务逻辑','写入下一阶段缓冲','缓冲已经就绪'],
  pcie:['主机 / 设备源缓冲就绪','提交 PCIe / DMA 传输','数据抵达目标接口','目的端获得本次数据'],
  reorder:['读取原来的 lane 布局','SXM 按目的位置重排','数值抵达新的 lane','下一算子输入就绪'],
  repeat:['前一层输出已就绪','各层使用各自的权重','矩阵与向量资源继续执行','最后层得到输出表示']
 };
 // 四个操作槽中的值直接来自同一个数值例子，避免只给出算子名称。
 function vectorTrace(toy){
  if(!toy?.input)return null;const x=toy.input.at(-1),y=toy.output.at(-1),other=toy.weight?.at(-1);
  if(toy.type==='norm'){const squares=x.map(v=>v*v),mean=squares.reduce((a,b)=>a+b,0)/x.length,gain=1/Math.sqrt(mean+1e-5);return{titles:['各 lane 平方','归约并除以维度 D','求倒数平方根','乘缩放系数并锁存'],values:[squares,x.map(()=>mean),x.map(()=>gain),y],explain:[`输入 [${x.map(f).join('，')}] 逐项平方，得到 [${squares.map(f).join('，')}]。`,`平方和 ÷ ${x.length} = ${f(mean)}；归约结果分发给这些 lane。`,`r = 1 / √(${f(mean)} + 0.00001) = ${f(gain)}。`,`每个 xᵢ × r × γᵢ，得到 [${y.map(f).join('，')}]；数值例子的 γ 均为 1。`]};}
  if(toy.type==='silu')return{titles:['读取 Gate 向量','计算 exp(−gate)','得到 sigmoid(gate)','乘原 Gate 并锁存'],values:[x,x.map(v=>Math.exp(-v)),x.map(v=>1/(1+Math.exp(-v))),y],explain:['Gate 结果从存储缓冲进入 VXM 的 lane。','每个 lane 对自己的 Gate 值取负并求指数。','每个 lane 计算 1 / (1 + exp(−gate))。','再乘原来的 Gate；另一路 Up 保留到下一步逐元素门控。']};
  if(toy.type==='multiply'||toy.type==='add'){const op=toy.type==='add'?'+':'×';return{titles:['读入第一路向量','第二路到达同一 lane','逐元素'+(op==='+'?'相加':'相乘'),'锁存输出向量'],values:[x,other,y,y],explain:['第一路向量进入对应 lane 的输入寄存器。','第二路数据按位置与通道对齐，不跨 Token 混合。',x.slice(0,4).map((v,l)=>f(v)+op+f(other[l])+'='+f(y[l])).join('；')+'。','结果保持在输出寄存器，再交给下一算子。']};}
  if(toy.type==='mask')return{titles:['读入 MXM 的点积得分','乘 1 / √d','未来位置写入 −∞','得分进入 Softmax'],values:[x,toy.extra.at(-1),y,y],explain:['来自 QKᵀ 的是原始点积分数。','数值例子的 d=2，逐项除以 √2。','每个查询只保留当前位置与更早位置。下方表格中的前两行能看到未来位置被屏蔽。','被屏蔽项在后续 exp 中变为 0；同一行只对允许的位置归一化。']};
  if(toy.type==='cast')return{titles:['读取 FP32 概率','VXM 执行精度转换','按 FP16 格式组织','交给 MXM 的 P 输入'],values:[x,x,x,y],explain:['概率暂存按每元素 4 B 登记。','右侧按每元素 1 个等效转换项计，不使用 MXM 峰值代替。','输出按每元素 2 B 登记。这里的小数值不模拟实际 FP16 舍入。','P 将与历史 V 在矩阵单元中相乘。']};
  if(toy.type==='rope')return{titles:['读取成对的 Q / K','SXM 对齐成对元素','VXM 执行成对旋转','锁存旋转后的 Q / K'],values:[x,x,y,y],explain:['Q 和 K 的元素两两成对；V 不执行这次旋转。','SXM 将成对元素放到执行旋转所需的 lane 位置，不在这里执行乘法。',`最后示例位置 t=2，θ=2。第一对 [${f(x[0])}, ${f(x[1])}] 经 4 次乘法与 2 次加减，得到 [${f(y[0])}, ${f(y[1])}]。`,'旋转后的 Q 用于点积；旋转后的 K 随后写入本层的 KV 缓存。']};
  return null;
 }
 function phases(model,step){
  const titles=(types[step.kind]||types.cpu).slice(),out=[];
  if(step.id==='softmax')titles.splice(0,4,'每行先求最大值 m','计算 exp(score−m)','归约得到分母 Z','逐项除以 Z 得到 P');
  if(step.id==='ffn_silu')titles.splice(0,4,'Gate 输入已经就绪','求 exp(−gate)','计算 sigmoid(gate)','gate × sigmoid(gate)');
  if(step.id==='kv_write')titles.splice(0,4,'本轮 K/V 投影结果就绪','将新 K 写入 Bank 0','将新 V 写入 Bank 1','旧历史保留，新位置可用');
  const toy=P.sample(model.p.mode)[step.sample],trace=vectorTrace(toy);if(trace)titles.splice(0,4,...trace.titles);
  for(let i=0;i<4;i++){
   let focus=i===0?step.from:step.to,marks=[],explain=step.reason;
   if(i===1)marks=step.from.slice(0,3).map((from,k)=>packet(from,step.to[k%step.to.length],step.wireBytes?P.bytes(step.wireBytes):step.kind==='matrix'?'输入 / 权重':'操作数',step.kind==='matrix'&&k===0?'weight':'data',k*.16));
   if(i===2&&step.to.length>1)marks=[packet(step.to[0],step.to.at(-1),step.kind==='matrix'?'部分和':'结果','result')];
   if(step.kind==='matrix'){
    const input=toy?.input?.at(-1),weight=toy?.weight;
    if(i===0)focus=['MEME__WEIGHTS','MEME__R0'];
    if(i===1){focus=['ME0__X0','ME0__M00'];marks=[0,1,2,3].filter(r=>!input||r<input.length).map((r,k)=>packet('MEME__R'+r,'ME0__X'+r,input?f(input[r]):'x'+r,'data',k*.07));marks.push(...[0,1,2,3].filter(c=>!weight||c<weight[0].length).map((c,k)=>packet('ME0__BUFFER','ME0__M0'+c,weight?'w='+f(weight[0][c]):'w₀'+c,'weight',.32+k*.06)));}
    if(i===2){focus=['ME0__M00','ME0__M01','ME0__SUM0'];marks=[0,1,2,3].filter(c=>!weight||c<weight[0].length).map((c,k)=>packet('ME0__M0'+c,'ME0__SUM'+c,input?f(input[0]*weight[0][c]):'x₀w₀'+c,'result',k*.09));}
    if(i===3){focus=['ME0__SUM0','ME0__READOUT'];marks=[packet('ME0__SUM0','ME0__READOUT',toy?f(toy.output.at(-1)[0]):'输出向量','result')];}
    if(step.id==='qk'&&i===1)marks=[packet('MEME__B0R0L0','ME0__M00','历史 K'),packet('ME0__X0','ME0__M00','当前 Q','data',.18)];
    if(step.id==='pv'&&i===1)marks=[packet('MEME__B1R0L0','ME0__M00','V'),packet('VX__OUT0','ME0__M00','概率 P','result',.18)];
    if(i===0){const source=step.id==='qk'?'MEME__B0R0L0':step.id==='pv'?'MEME__B1R0L0':'MEME__WEIGHTS';focus=[source,'MEME__R0'];marks=[packet(source,'ME0__BUFFER',step.id==='qk'?'K 块':step.id==='pv'?'V 块':'权重块','weight')];explain='MEM 中的矩阵操作数分块进入 MXM 的权重缓冲。点击一个 MAC，可在所属阵列旁查看它的寄存器、乘法器与累加器。';}
    if(i===2&&input)explain=`这里展开前 ${Math.min(4,input.length)} 个归约项、前 ${Math.min(4,weight[0].length)} 个输出的 MAC。完整点积需要 ${input.length} 项；下面显示全部项，右侧按完整张量计成本。`;
   }
   if(step.kind==='vector'&&trace){
    const values=trace.values[i];focus=i===3?['VX__A30','VX__OUT0']:['VX__A'+i+'0','VX__A'+i+'1'];explain=trace.explain[i];
    marks=values.slice(0,4).map((val,l)=>packet(i===0?step.from[0]:'VX__A'+(i-1)+l,i===3?'VX__OUT'+l:'VX__A'+i+l,f(val),i===0?'data':'result',l*.1));
   }
   if(step.id==='softmax'){
    focus=['VX__A'+i+'0','VX__A'+i+'1'];const row=toy.input.at(-1),max=Math.max(...row),exp=row.map(x=>Math.exp(x-max)),sum=exp.reduce((a,b)=>a+b,0);
    explain=[`当前示例行：${row.map(f).join('，')}。先找最大值 m=${f(max)}，它用于稳定数值。`,`先减 m 再取指数：${exp.map(f).join('，')}。被屏蔽项的指数为 0。`,`把指数相加：Z=${exp.map(f).join(' + ')}=${f(sum)}。各输出必须共享这个分母。`,`P=[${toy.output.at(-1).map(f).join('，')}]，总和为 1。这组概率将送往 MXM 与 V 相乘。`][i];
    marks=i?row.slice(0,4).map((_,l)=>packet('VX__A'+(i-1)+l,'VX__A'+i+l,i===1?f(exp[l]):i===2?'Z='+f(sum):f(toy.output.at(-1)[l]),'result',l*.1)):[];
   }
   if(step.id==='kv_write'){
    const positions=model.p.mode==='prefill'?[0,1,2]:[2];focus=i===0?['VX__OUT0','ME0__READOUT']:positions.map(r=>'MEME__B'+(i===2?1:0)+'R'+r+'L0');
    marks=i===1||i===2?positions.map((r,j)=>packet(i===1?'VX__OUT0':'ME0__READOUT','MEME__B'+(i===2?1:0)+'R'+r+'L0',(i===2?'V':'K')+'['+r+']','result',j*.16)):[];
    explain=i===1?'K 已经过 RoPE，在 VXM 输出端准备好后写入 MEM 的 K 区。':i===2?'V 来自 V 投影，不经过 RoPE；它写入独立的 V 区。':step.reason;
   }
   if(step.id==='rope'){focus=[['ME0__READOUT'],['SE__IN0','SE__PERM'],['VX__A00','VX__A01'],['VX__OUT0']][i];if(i===1)marks=[packet('ME0__READOUT','SE__PERM','Q / K')];if(i===2)marks=[packet('SE__PERM','VX__A00','成对元素')];}
   if(step.id==='pcie_in'){focus=[['HOST__HOSTRAM'],['PCIE'],['DMA'],['DMA']][i];marks=i&&i<3?[packet(['HOST__HOSTRAM','PCIE'][i-1],focus[0],P.bytes(step.wireBytes))]:[];explain=['主机 DRAM 已保存 int32 Token ID。','字节通过服务器的 PCIe 主机链路到达 TSP I/O 接口。','I/O 模块的 DMA 接收这批数据，CPU 不逐项搬运到 MAC。','I/O 侧已接收；下一步登记并展示片上 MEM 的落地写入。'][i];}
   if(step.id==='embedding'){focus=[['MEMW__ADDRREG','MEMW__WEIGHTS'],['MEMW__DECODER'],['MEMW__R0','MEMW__R1'],['MEMW__R0','VX__IN0']][i];marks=i===2?[0,1,2,3].map((l,k)=>packet('MEMW__WEIGHTS','MEMW__R'+l,f(toy.output.at(-1)[l]),'data',k*.1)):i===3?[packet('MEMW__R0','VX__IN0','X 向量')]:[];explain=['整数 ID 选择词嵌入表的一行；地址寄存器确定读哪一行。','MEM 的译码和读取资源取出该行数值。','数值进入 MEM 的读出锁存器；固定例子最后一行为 [1, 1, 0, 1]。','这一行激活开始进入下一算子的向量资源。'][i];}
   if(step.id==='pcie_out'){focus=[['ME0__READOUT'],['DMA'],['PCIE'],['HOST__HOSTBUF']][i];marks=i?[packet(['ME0__READOUT','DMA','PCIE'][i-1],focus[0],P.bytes(step.wireBytes),'result')]:[];}
   if(model.p.mode==='decode'&&['request','tokenize'].includes(step.id)){marks=[];focus=['HOST__TOKEN','HOST__NEXT'];explain='上轮 Token 已在服务端产生。本轮复用连接和历史，只送入这个新 ID，不让整个 Prompt 再经过网络与分词。';}
   if(step.id==='sample'&&i>=2)explain='示例选择 ID 608，对应片段“芯片”。它是预设演示输出，右侧的模型形状与性能估算不会生成真实回答。';
   if(i===0&&['matrix','vector','memory','reorder'].includes(step.kind)){const consumer=step.kind==='matrix'?'ME0__BUFFER':step.kind==='vector'?'VX__A00':step.kind==='reorder'?'SE__CONTROLREG':step.to[0];marks.push(packet('CONTROL',consumer,'切片指令','control',.1));}
   if(i===0&&['qk','pv'].includes(step.id))explain+=' 这里装载的 K / V 是动态激活，在这次乘法中充当右操作数，不是训练好的固定权重。';
   out.push({index:i,title:titles[i],explain,focus,packets:marks,state:{},fraction:i/3});
  }
  return out;
 }
 function patch(model,step,phase){
  const map={},toy=P.sample(model.p.mode),s=toy[step.sample],put=(id,txt,classes=['hw-data'])=>map[id]=v(txt,classes);
  put('HOST__USERDEVICE',model.p.prompt);put('HOST__NETBUF','请求 / 片段');put('HOST__HOSTRAM',P.bytes(model.setup.inputBytes)+' IDs');put('HOST__PROGRAM','执行已部署程序');put('HOST__MODELWEIGHTS',P.bytes(model.capacity.weights));put('PCIE',P.num(model.effective.pcie/1e9)+' GB/s 有效');put('DMA',model.p.dmaUs+' μs 提交');
  const activeStepIndex=model.steps.indexOf(step),cache=model.steps.findIndex(x=>x.id==='kv_write');
  if(activeStepIndex>=cache){for(let r=0;r<3;r++)for(let l=0;l<2;l++){
   const old=model.p.mode==='decode'&&r<2,ready=activeStepIndex>cache||old||phase>=1,readyV=activeStepIndex>cache||old||phase>=2;
   put(`MEME__B0R${r}L${l}`,ready?f(toy.kv.input[r][l]):'空',ready?['hw-computed']:['hw-mask']);put(`MEME__B1R${r}L${l}`,readyV?f(toy.kv.output[r][l]):'空',readyV?['hw-computed']:['hw-mask']);
  }}
  if(step.kind==='matrix'){
   const row=s?.input?.at(-1),weight=s?.weight,result=s?.output?.at(-1);put('MEME__WEIGHTS',step.id.startsWith('ffn')?'FFN 权重块':'矩阵权重块',['hw-gold']);put('ME0__BUFFER',phase?'权重块已安装':'准备读权重',['hw-gold']);put('ME0__IDENTITY',row?`显示 ${Math.min(4,row.length)} / ${row.length} 个归约项；完整结果见下表`:'4 × 4 代表性窗口');
   for(let r=0;r<4;r++){const value=row&&r<row.length?f(row[r]):row?'未用':'x'+r;put('MEME__R'+r,value);put('ME0__X'+r,phase>=1?value:'等待输入');for(let c=0;c<4;c++){const valid=!row||r<row.length&&c<weight[0].length;put('ME0__M'+r+c,valid?[phase===0?'待装载':phase>=2&&row?f(row[r]*weight[r][c]):weight?'w='+f(weight[r][c]):'wᵢⱼ',phase>=2?'本项乘积':'等待乘法']:['未用','示例窗格'],valid?[phase>=2?'hw-current':'hw-gold']:['hw-mask']);}}
   for(let c=0;c<4;c++)put('ME0__SUM'+c,phase>=3?(result?.[c]!==undefined?f(result[c]):'输出'):'部分和',phase>=3?['hw-computed']:[]);put('ME0__READOUT',phase>=3?'本块输出就绪':'等待输出');
  }else if(s&&step.kind==='vector'){
   const row=s.input?.at(-1)||s.output.at(-1),output=s.output.at(-1);for(let l=0;l<Math.min(4,row.length);l++){
    put('VX__IN'+l,f(row[l]));for(let a=0;a<4;a++)put('VX__A'+a+l,a<=phase?(a===3?f(output[l]??0):['读取','算术','归约'][a]):'等待',a===phase?['hw-current']:a<phase?['hw-computed']:[]);put('VX__OUT'+l,phase>=3?f(output[l]??0):'等待',phase>=3?['hw-computed']:[]);
   }
   if(step.id==='softmax'){const m=Math.max(...row),exp=row.map(x=>Math.exp(x-m)),z=exp.reduce((a,b)=>a+b,0);for(let l=0;l<row.length;l++){put('VX__A0'+l,'m='+f(m));put('VX__A1'+l,phase>=1?f(exp[l]):'等待');put('VX__A2'+l,phase>=2?'Z='+f(z):'等待');put('VX__A3'+l,phase>=3?f(output[l]):'等待',phase>=3?['hw-computed']:[]);}}
   const trace=vectorTrace(s);if(trace)for(let a=0;a<4;a++)for(let l=0;l<Math.min(4,trace.values[a].length);l++)put('VX__A'+a+l,a<=phase?f(trace.values[a][l]):'等待',a===phase?['hw-current']:a<phase?['hw-computed']:[]);
  }
  if(step.id==='embedding')for(let l=0;l<4;l++){put('MEMW__R'+l,phase>=2?f(s.output.at(-1)[l]):'等待读出',phase>=2?['hw-data']:[]);put('VX__IN'+l,phase>=3?f(s.output.at(-1)[l]):'等待输入',phase>=3?['hw-data']:[]);}
  if(step.id==='concat'){for(let l=0;l<4;l++){put('SE__IN'+l,f(s.output.at(-1)[l]));put('SE__OUT'+l,phase>=3?f(s.output.at(-1)[l]):'等待重排');}}
  if(activeStepIndex>=model.steps.findIndex(x=>x.id==='sample')){put('HOST__TOKEN',phase>=2||step.id!=='sample'?'ID 608':'待选择');put('HOST__SELECT','主机采样示例');}
  if(step.id==='send'){put('HOST__HOSTBUF','芯片',['hw-computed']);put('HOST__USERBUF',phase>=3?'芯片':'等待送达',phase>=3?['hw-computed']:[]);}else put('HOST__USERBUF','等待送达');
  return map;
 }
 function macro(model,step,phase,selected){
  const s=P.sample(model.p.mode)[step.sample];if(!s||s.type!=='matrix')return null;const row=s.input.at(-1),r=selected.row,c=selected.col;if(r>=row.length||c>=s.weight[0].length)return null;const x=row[r],w=s.weight[r][c],product=x*w,old=row.slice(0,r).reduce((a,v,i)=>a+v*s.weight[i][c],0);
  return{XREG:v(['输入寄存器','x='+f(x)]),WREG:v(['权重寄存器','w='+f(w)],['hw-gold']),MULT:v(['乘法器',phase>=2?f(x)+'×'+f(w)+'='+f(product):'等待操作数'],phase>=2?['hw-current']:[]),ACC:v(['累加寄存器','旧值='+f(old)],['hw-computed']),ADD:v(['加法器',phase>=3?f(old)+'+'+f(product):'等待乘积'],phase>=3?['hw-current']:[]),OUT:v(['本项之后的部分和',phase>=3?f(old+product):'等待锁存'],phase>=3?['hw-computed']:[])};
 }
 const api={phases,patch,macro,format:f};root.GROQ_PERFORMANCE_LESSONS=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
