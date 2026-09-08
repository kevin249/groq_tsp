/* UTF-8 · 硬件教学的数值模型，所有节拍均为演示步，不是芯片时钟周期。 */
(function(root){
 'use strict';
 const banks=[[[2,0,1,3],[0,1,2,1],[1,2,3,4],[4,2,1,0]],[[1,0,2,2],[3,1,0,2],[2,3,1,1],[1,1,1,1]]];
 const weights=[[2,1,0,1],[1,0,2,1],[0,1,1,2],[1,2,0,1]];
 const tokens=['芯片','把很多','微小电路','集成在一起','。'];
 const prompt='用一句话解释芯片。';
 const frame=(title,action,description)=>({title,action,description});
 const chapters=[
  {title:'认识这颗芯片',sub:'先看结构，再进入部件',graph:'host',zones:['MEMW','VX','MW0'],color:'blue',
   question:'一条 Prompt 最终落在芯片的什么位置？',fact:'图按第一代 TSP 的左右空间关系重绘。每行对应一个 Superlane；SRAM 列数作了压缩。',
   frames:[
    frame('一颗芯片，几种固定分工','先看 Prompt 在哪里','两侧金色阵列做矩阵乘加，蓝色区保存数据，中间紫色区做向量运算。点击任意区域可直接放大。'),
    frame('Prompt 先在主机端处理','把文字转换为示意 ID','用户的文字由服务侧分词，芯片接口接收的是数字数据。此时不在芯片中解析中文。'),
    frame('消息已经成为整数序列','将数字交给设备','示意编号 [101, 602, 9, 3] 表示输入序列；真实分词由模型决定。'),
    frame('设备入口把任务交给执行程序','进入 SRAM 看一次读取','程序和权重已经部署。本次输入由运行时安排；接下来用一个 4 维小向量观察硬件动作。')
   ]},
  {title:'从 SRAM 取出数字',sub:'地址行与两个 bank',graph:'memory',zones:['MEMW','MEME'],color:'blue',
   question:'存储器究竟读出了哪几个数？',fact:'每个 MEM 切片有两个 bank。图只展示两组各 4 行、每行 4 个值；不是实际 SRAM 容量或字宽。',
   frames:[
    frame('选择一个地址行作为输入','锁定这一行地址','默认选择 Bank 0 的地址 02。点击其他地址行也可以换一组数据，蓝色格里的数会参与后面算术。'),
    frame('地址选中了同一条存储行','读出该行的四个 lane','只读取被选中地址对应的数；其余地址的内容保留。'),
    frame('选中的存储格被读出','写入读出锁存器','同一行的 4 个示意值被取出，随后交给流寄存器。'),
    frame('数字出现在读出锁存器','开始观察寄存器传递','底部 4 个锁存器保存当前读数。芯片后面的算术消费这些数值。')
   ]},
  {title:'沿流寄存器前进',sub:'数据横向，指令纵向',graph:'stream',zones:['MEMW','VX','CONTROL'],color:'blue',
   question:'数据怎样恰好赶上执行它的指令？',fact:'上方四行是 lane 数据位置；下排是指令的时间序列，不表示空间方向。真实指令沿切片纵向传播，数据横向流动。一次演示步不等于设备周期。',
   frames:[
    frame('读数进入第一个寄存器位置','数据前进一个位置','4 个 lane 的值进入 SR 0；每一行观察同一个数向右移动。'),
    frame('数字到达 SR 1','继续前进到 SR 2','功能单元固定在原处，数据沿寄存器通道移动。'),
    frame('数字到达 SR 2','继续前进到 SR 3','编译器把传播时间也计入指令安排，避免消费者提前读取。'),
    frame('数字与消费者的指令相遇','由消费者锁存输入','到达正确位置之后，ALU 才使用当前流上的值。'),
    frame('四个 ALU 得到各自的输入','进入 VXM 做向量计算','同一向量的不同 lane 可以并行执行同一种数值操作。')
   ]},
  {title:'VXM 怎样算向量',sub:'看每个 ALU 的数值',graph:'vxm',zones:['VX'],color:'violet',
   question:'RMSNorm 如何拆到逐 lane 的数值操作？',fact:'这里选取 4 个 lane，并为每列画 4 个操作槽。真实第一代 VXM 每 lane 有 16 个 ALU；归约路径被简化。',
   frames:[
    frame('四个输入进入各自的 lane','各 lane 执行平方','四列表示四个不同的输入元素。接下来先观察最上方 ALU 的变化。'),
    frame('平方运算已经完成','汇总平方并计算均值','每个 ALU 计算自己的 x²。它们的结果随后用于求整个向量的均方值。'),
    frame('获得均方值，准备统一缩放','求倒数平方根','归约把四个平方值合成一个均值；这个数供全部 lane 共用。'),
    frame('得到缩放因子','将各输入乘以缩放因子','这里忽略微小 ε，并令 γ = 1，以便直观看到归一化前后的数值。'),
    frame('归一化向量流出 VXM','去 MXM 看权重安装','输出仍然是四个数，只是数值尺度发生了变化。真实 Q/K/V 投影会使用归一化后的表示。')
   ]},
  {title:'把权重装进 MXM',sub:'缓冲与权重驻留',graph:'mxm',zones:['MEMW','MW0','MW1'],color:'amber',
   question:'激活到来之前，乘加单元里装了什么？',fact:'4×4 是独立的整数投影实验。真实 Q/K/V 输入为归一化张量；第一代 TSP 有 4 个 320×320 MAC 平面。',
   frames:[
    frame('阵列里还没有本块权重','从 SRAM 读取权重块','先把要使用的矩阵块从存储器取出。每个 MAC 将持有一个权重。'),
    frame('16 个权重到达缓冲区','安装前两行权重','“取到缓冲”和“安装到计算阵列”是不同的动作。'),
    frame('部分 MAC 已经装好权重','继续安装其余权重','金色单元中的 w 开始有值；激活还没有参与乘法。'),
    frame('整个 4×4 阵列安装完毕','让激活开始参与乘加','权重在本次计算中保持。下面进入逐项乘加，观察单元与累加器的变化。')
   ]},
  {title:'逐拍观察 MAC 阵列',sub:'乘法、部分和、累加器',graph:'mxm',zones:['MW0','MW1'],color:'amber',
   question:'一个向量投影，怎样变成许多次乘加？',fact:'为看清算术，本实验每步展开输入维度的一项；不代表真实 TSP 的逐周期路由或阵列波前。',
   frames:[
    frame('权重驻留，四个输入等待进入','执行第 1 项乘加','每一列形成一个输出。点击任意 MAC，查看该单元的输入、权重和乘积。'),
    frame('第一行 MAC 消费 x₀','执行第 2 项乘加','输入 x₀ 同时乘以这一行的四个权重；四列累加器分别得到第一份部分和。'),
    frame('第二行 MAC 消费 x₁','执行第 3 项乘加','新乘积加入对应列的已有部分和。权重没有随着这一步重新加载。'),
    frame('第三行 MAC 消费 x₂','执行第 4 项乘加','再累加一项。留意权重为 0 的单元：本项乘积为 0，已有部分和仍保留。'),
    frame('第四行 MAC 消费 x₃','锁存最终输出向量','最后一项加入后，四列分别得到完整点积。'),
    frame('结果锁存器保存 y = xW','查看数据如何重排','这些值可成为下一算子的输入；真实大矩阵还要处理其他分块。')
   ]},
  {title:'SXM 重排不同 lane',sub:'跟踪同一个数换位置',graph:'sxm',zones:['SW','SE'],color:'green',
   question:'数值没变，为什么位置发生了变化？',fact:'此处只演示置换 [1,3,0,2]。RoPE 还需旋转算术，不能把 lane 置换当作完整的位置编码。',
   frames:[
    frame('四个数位于原来的输入 lane','将 lane 1 送到输出 0','上排是输入位置，下排是目的位置。按连线观察数值如何搬到新位置。'),
    frame('第一个目的位置已经收到数据','将 lane 3 送到输出 1','数值保持，位置改变。SXM 帮助数据满足后续运算的布局要求。'),
    frame('第二个目的位置已经收到数据','将 lane 0 送到输出 2','不需要做矩阵乘法，也可以对数据进行重新排列。'),
    frame('第三个目的位置已经收到数据','将 lane 2 送到输出 3','最后一个值将在下一步进入目的位置。'),
    frame('置换完成','查看 K/V 怎样存入 SRAM','实际模型在所需重排和位置算术之后，继续执行注意力与 KV 读写。')
   ]},
  {title:'在 SRAM 中读写 KV',sub:'地址、历史与因果可见性',graph:'kv',zones:['MEMW','MEME','MW0','VX'],color:'blue',
   question:'为什么后续 Token 不必重算整个 Prompt？',fact:'每列是代表层的一个位置，不是实际 KV 页。K/V 值被缩成标量，用来解释存储与加权读取。',
   frames:[
    frame('本请求的 KV 还没有写入','写入四个输入位置的 K/V','每个模型层都有自己的 K/V；这张图只观察其中一层。'),
    frame('四个位置的 K/V 已经保存','读取已有 K/V 做注意力','绿色存储格是已经算好的历史。K 在示意 Bank 0，V 在示意 Bank 1；下一步从 MEM 读到 MXM。'),
    frame('K 从 MEM 送到 MXM 与 Q 相乘','检查位置 2 的因果范围','点击 MEM 中前四个 K/V 格，可以选择要观察的查询位置。点积发生在 MXM 的运算单元里。'),
    frame('未来位置被屏蔽','按可见位置的权重汇总 V','这里改看位置 2：只能读位置 0、1、2，不能读它之后的位置 3。'),
    frame('读取结果进入注意力汇总','继续执行后续层和分片','QKᵀ、Softmax 与 PV 需要矩阵和向量单元配合。历史 K/V 在后续生成中还能继续复用。')
   ]},
  {title:'后续层与其他芯片',sub:'权重分布与激活传输',graph:'cluster',zones:['NORTH','SOUTH','MEMW','MEME'],color:'blue',
   question:'完整模型大于一颗芯片时，数据去哪里？',fact:'四个分片仅为教学数量；一层和一颗芯片没有固定的一一对应关系，图中卡槽布局也不是实际网络拓扑。',
   frames:[
    frame('当前分片得到一组激活','在本阶段完成后续算子','注意力输出投影、残差、FFN 等继续在各自的矩阵和向量资源上运行。'),
    frame('本阶段输出进入激活寄存器','传给需要它的其他分片','各分片的权重保留在相应 SRAM 中，阶段之间主要传递所需的激活或归约数据。'),
    frame('C2C 传递当前数据','由后续分片继续计算','跨芯片的数据移动同样需要调度，不能把通信成本当成不存在。'),
    frame('更多层完成，抵达模型输出端','进入词表与 Token 回程','最终归一化和词表投影把最后有效位置的表示变成词表分数。')
   ]},
  {title:'Token 返回，再进入芯片',sub:'选择、发送、复用历史',graph:'output',zones:['VX','MEME','PCIE'],color:'green',
   question:'用户看到的每个新片段，是怎样来的？',fact:'Token 与回答为预设教学片段。采样器和返回缓冲是服务逻辑示意，未断言它们一定在 LPU 或 CPU 上。',
   frames:[
    frame('词表投影准备输出分数','显示四组示意候选分数','此时模型还没有选定新 Token，用户侧也没有新文字。'),
    frame('候选得分出现在词表中','选择第一个新 Token','这组虚构概率只为说明词表选择；不会运行真实模型。'),
    frame('Token ID 已经被选出','将它送入增量解码缓冲','选出 ID 和用户收到文字是两件事。'),
    frame('文字进入返回通道','把首个片段送达用户','真实网络事件与 Token 不保证一一对应；本演示按片段显示。'),
    frame('用户读到了“芯片”','让“芯片”再次进入模型','刚选出的 Token 还没有自己的 K/V；下一轮输入它时才会补上。'),
    frame('Decode 1：为新输入追加 KV','返回第 2 个片段','完整模型为“芯片”计算新位置的 K/V，读取历史，再选出下一 Token。'),
    frame('第 2 个片段已经到达用户','让最新 Token 再次进入模型','增量返回与下一轮生成交替推进。'),
    frame('Decode 2：只新增一个位置','返回第 3 个片段','Prompt 的四个位置的 K/V 仍被保留，新增的是上一轮输出的位置。'),
    frame('第 3 个片段已经到达用户','继续下一轮 Decode','用户看到的文本增长，模型继续利用累积的历史。'),
    frame('Decode 3：复用之前的 KV','返回第 4 个片段','最新 Token 进入模型各层，每层追加自己的新 K/V。'),
    frame('第 4 个片段已经到达用户','继续最后一轮 Decode','同样的硬件程序处理新的输入数据。'),
    frame('Decode 4：计算最后一个新位置','返回最后的标点','刚生成的标点尚未作为输入，因此还没有它自己的 K/V。'),
    frame('完整教学回答已经到达用户','结束本次响应','本演示到达 5 个输出片段的长度上限，下一步结束生成。'),
    frame('本次响应结束','从头重播','KV 是否保留或回收由服务策略决定。你可以返回任意章节继续观察硬件单元。')
   ]}
 ];
 function snapshot(state){
  const chapter=Math.trunc(Math.max(0,Math.min(chapters.length-1,Number(state.chapter)||0)));
  const step=Math.trunc(Math.max(0,Math.min(chapters[chapter].frames.length-1,Number(state.step)||0)));
  const bank=state.bank===1?1:0;const row=Math.trunc(Math.max(0,Math.min(3,Number(state.row)===0?0:Number(state.row)||2)));
  const x=banks[bank][row].slice();const squares=x.map(v=>v*v);const mean=squares.reduce((a,b)=>a+b,0)/4;const scale=mean?1/Math.sqrt(mean):0;const norm=x.map(v=>v*scale);
  const terms=chapter<5?0:chapter===5?Math.min(step,4):4;
  const sums=weights[0].map((_,c)=>x.slice(0,terms).reduce((sum,v,r)=>sum+v*weights[r][c],0));
  const installed=chapter>4?4:chapter===4?(step===2?2:step>=3?4:0):0;
  let sent=0,selected=0,fed=0;
  if(chapter===9){selected=step<2?0:step<5?1:Math.min(5,2+Math.floor((step-5)/2));sent=step<4?0:Math.min(5,1+Math.floor((step-4)/2));fed=step<5?0:Math.min(4,1+Math.floor((step-5)/2));}
  const kvCount=chapter<7?0:chapter===7?(step?4:0):4+fed;
  const query=chapter===7&&step>=3?2:3;
  return{chapter,step,bank,row,x,squares,mean,scale,norm,terms,sums,installed,sent,selected,fed,kvCount,query,answer:tokens.slice(0,sent).join(''),chosen:selected?tokens[selected-1]:'',complete:chapter===9&&step===13};
 }
 const info={
  MEMW:['西侧 SRAM','44 个 MEM 切片；软件安排权重、激活与 KV 的位置。','每个切片纵向跨过 20 个 Superlane。总览中的 8 列是压缩表示。',1],
  MEME:['东侧 SRAM','与西侧构成两组分布式存储区。','第一代总计 88 个 MEM 切片，约 220 MiB。',1],
  MW0:['西侧 MXM 平面','权重驻留的矩阵乘加资源。','点击进入 4×4 数值实验，逐项观察部分和。',5],
  MW1:['西侧另一个 MXM 平面','独立的矩阵乘加平面。','第一代全芯片共有 4 个 320×320 MAC 平面。',5],
  ME0:['东侧 MXM 平面','从另一侧提供矩阵乘加资源。','小规模实验只解释运算，不复现全部实际布线。',5],
  ME1:['东侧另一个 MXM 平面','与其他平面协作处理所需矩阵块。','具体分块、并行与精度由编译映射决定。',5],
  VX:['中央 VXM','执行向量与逐点算术，支持归一化和非线性等过程。','第一代每个 lane 有 16 个向量 ALU。',3],
  SW:['西侧 SXM','在 lane 与 Superlane 之间做移位、置换和转置。','数值不必改变，位置也可以改变。',6],
  SE:['东侧 SXM','帮助数据对齐后续算子所需的布局。','置换本身不是完整 RoPE 算法。',6],
  CONTROL:['ICU 指令控制','指令沿各切片纵向传播，与横向数据相遇。','第一代有 144 个独立指令队列，由编译器协调。',2],
  PCIE:['主机侧接口','把主机准备的任务与数字数据交给设备。','自然语言分词属于服务侧逻辑。',0],
  NORTH:['片间互连','与其他 LPU 交换模型执行需要的数据。','多芯片图仅显示教学分片，并非真实拓扑。',8],
  SOUTH:['片间互连','传递激活、分片结果与所需的归约数据。','权重不必为每个 Token 从用户端重新传入。',8]
 };
 const result={banks,weights,tokens,prompt,chapters,snapshot,info};root.HARDWARE_DATA=result;if(typeof module!=='undefined')module.exports=result;
})(typeof window==='undefined'?globalThis:window);
