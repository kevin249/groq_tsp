/* UTF-8 · 用 Mermaid block 布局定义可定位的硬件单元，图形均由 Mermaid 绘制。 */
'use strict';
const fs=require('node:fs'); const path=require('node:path');
const dir=path.resolve(__dirname,'../hardware');fs.mkdirSync(dir,{recursive:true});
const palettes={mem:'#dceef8',mxm:'#fff0d1',vxm:'#eee5fa',sxm:'#e0f2e9',icu:'#e5eafb',port:'#eaf0f6',frame:'#ffffff',host:'#f3f6fa',stream:'#e0f0f5',wire:'#dce7ef'};
const styles=Object.entries(palettes).map(([kind,color])=>`classDef ${kind} fill:${color},stroke:#7896ac,color:#203c50`).join('\n');
function save(name,source){const text=(source+'\n'+styles).split(/\r?\n/).map(line=>line.trimEnd()).join('\n').trimEnd()+'\n';fs.writeFileSync(path.join(dir,name+'.mmd'),text,'utf8');}
const zones=[['MW0','MXM','mxm',1],['MW1','MXM','mxm',1],['SW','SXM','sxm',1],['MEMW','西侧 SRAM','mem',3],['VX','VXM','vxm',2],['MEME','东侧 SRAM','mem',3],['SE','SXM','sxm',1],['ME0','MXM','mxm',1],['ME1','MXM','mxm',1]];
let die='block-beta\n  columns 14\n  NORTH["C2C · 片间连接"]:14\n';
for(const [id,label,kind,span]of zones){
  const cols=kind==='mem'?8:1;
  die+=`  block:${id}:${span}\n    columns ${cols}\n    ${id}HEAD["${label}"]:${cols}\n`;
  for(let r=19;r>=0;r--) for(let c=0;c<cols;c++) die+=`    ${id}R${r}${cols>1?'C'+c:''}[" "]\n`;
  die+='  end\n';
}
die+='  CONTROL["ICU · 各切片的指令控制单元"]:14\n  PCIE["主机接口"]:3\n  SOUTH["C2C · 其他芯片"]:11\n';
for(const [id,,kind]of zones){die+=`class ${id},${id}HEAD ${kind}\n`;for(let r=0;r<20;r++)for(let c=0;c<(kind==='mem'?8:1);c++)die+=`class ${id}R${r}${kind==='mem'?'C'+c:''} ${kind}\n`;}
die+='class CONTROL icu\nclass NORTH,SOUTH,PCIE port\n';
save('die',die);

let memory='block-beta\n columns 2\n ADDRREG["地址寄存器\nbank = 0 · 行 02"] DECODER["地址译码器\n选中一条字线"]\n';
for(let bank=0;bank<2;bank++){
  memory+=` block:BANK${bank}\n columns 5\n BANK${bank}HEAD["Bank ${bank} · SRAM 地址行"]:5\n`;
  for(let row=0;row<4;row++){
    memory+=` A${bank}${row}["${String(row).padStart(2,'0')}"] `;
    for(let lane=0;lane<4;lane++)memory+=`B${bank}R${row}L${lane}["${[1,2,3,4][lane]+row+bank}"] `;
    memory+='\n';
  }
  memory+='end\n';
}
memory+='block:READOUT:2\n columns 4\n READHEAD["读出锁存器 · 同一地址行的 4 个示意 lane"]:4\n';
for(let i=0;i<4;i++)memory+=`R${i}["等待"] `;
memory+='\nend\nclass BANK0,BANK1 mem\nclass READOUT port\n';save('memory',memory);

let mxm='block-beta\n columns 6\n WSTORE["SRAM 中的权重块 · 4 行 × 4 列"]:6\n BUFFER["权重缓冲 · 等待读取"]:6\n CORNER["x / w"] WCOL0["输出 0"] WCOL1["输出 1"] WCOL2["输出 2"] WCOL3["输出 3"] ROWLABEL["部分和"]\n';
for(let r=0;r<4;r++){
  mxm+=`X${r}["x${r} = ${r+1}"] `;
  for(let c=0;c<4;c++) mxm+=`M${r}${c}["w = 0\n乘积 = 0"] `;
  mxm+=`ROW${r}["第 ${r+1} 项"]\n`;
}
mxm+='SUMHEAD["累加器"] SUM0["0"] SUM1["0"] SUM2["0"] SUM3["0"] SUMEND["y = xW"]\n';
mxm+='class '+Array.from({length:16},(_,i)=>`M${Math.floor(i/4)}${i%4}`).join(',')+' mxm\n';
mxm+='class SUM0,SUM1,SUM2,SUM3 vxm\nclass X0,X1,X2,X3 mem\n';save('mxm',mxm);

let stream='block-beta\n columns 6\n SOURCE["SRAM 读出锁存器 · 四个 lane 的输入"]:6\n LANE["lane"] C0["SR 0"] C1["SR 1"] C2["SR 2"] C3["SR 3"] DEST["消费者"]\n';
for(let lane=0;lane<4;lane++){
  stream+=`L${lane}["${lane}"] `;for(let slot=0;slot<4;slot++)stream+=`S${slot}L${lane}["·"] `;
  stream+=`D${lane}["ALU ${lane}"]\n`;
}
stream+='CONTROLHEAD["时间序列"] I0["预排 READ"] I1["传播"] I2["传播"] I3["到达"] ID["本组执行"]\n';
stream+='class D0,D1,D2,D3 vxm\nclass I0,I1,I2,I3,ID icu\n';save('stream',stream);

let vxm='block-beta\n columns 4\n';
for(let c=0;c<4;c++)vxm+=`IN${c}["x${c} = ${c+1}"] `;
vxm+='\n';for(let stage=0;stage<4;stage++){for(let lane=0;lane<4;lane++)vxm+=`A${stage}${lane}["ALU ${stage}\n${['平方','归约准备','缩放','输出'][stage]}"] `;vxm+='\n';}
for(let c=0;c<4;c++)vxm+=`OUT${c}["等待"] `;
vxm+='\nclass '+Array.from({length:16},(_,i)=>`A${Math.floor(i/4)}${i%4}`).join(',')+' vxm\n';save('vxm',vxm);

let sxm='block-beta\n columns 4\n';
for(let c=0;c<4;c++)sxm+=`IN${c}["lane ${c}\n${[1,2,3,4][c]}"] `;
sxm+='\n PERM["SXM · 按映射重排 lane"]:4\n';for(let c=0;c<4;c++)sxm+=`OUT${c}["输出 ${c}\n等待"] `;
sxm+='\n IN0 --> OUT2\n IN1 --> OUT0\n IN2 --> OUT3\n IN3 --> OUT1\nclass PERM,OUT0,OUT1,OUT2,OUT3 sxm\n';save('sxm',sxm);

let kv='block-beta\n columns 8\n TITLE["本层 KV · 每列代表一个上下文位置"]:8\n WRITEBUF["K/V 写入缓冲 · 本层投影输出"]:8\n';
for(let i=0;i<8;i++)kv+=`P${i}["位置 ${i}"] `;
kv+='\n';for(const kind of['K','V']){for(let i=0;i<8;i++)kv+=`${kind}${i}["${kind} · 空"] `;kv+='\n';}
for(let i=0;i<8;i++)kv+=`SCORE${i}["Q·K${i}\n等待"] `;
kv+='\n';for(let i=0;i<8;i++)kv+=`PROB${i}["权重 p${i}\n等待"] `;
kv+='\n QUERY["本轮 Q"]:2\n FETCH["读取可见的 K / V"]:4\n RESULT["注意力"]:2\nclass TITLE mem\n';save('kv',kv);
let cluster='block-beta\n columns 2\n';
for(let i=0;i<4;i++){
 cluster+=`block:CHIP${i}\n columns 4\n CHIP${i}HEAD["LPU 分片 ${i+1}"]:4\n`;
 for(let r=0;r<3;r++){for(let c=0;c<4;c++)cluster+=`C${i}R${r}L${c}["${c<2?'SRAM':'MAC'}"] `;cluster+='\n';}
 cluster+=`C${i}OUT["激活寄存器 · 等待"]:4\nend\nclass CHIP${i} mem\n`;
}
cluster+='C2C["C2C · 编译安排的片间传输"]:2\n';save('cluster',cluster);

let output='block-beta\n columns 4\n WORDTABLE["输出词表 · 每格是一项候选"]:4\n';
['芯片','集成','它','其他'].forEach((word,i)=>output+=`T${i}["${word}\n等待分数"] `);
output+='\n SELECT["Token 选择 · 逻辑阶段"]:4\n TOKEN["ID 寄存器\n空"]:2\n BYTES["增量解码缓冲\n空"]:2\n';
output+='FIFOHEAD["返回通道 · 数据缓冲槽"]:4\n F0["空"] F1["空"] F2["空"] F3["空"]\nclass WORDTABLE mem\nclass SELECT vxm\nclass TOKEN,BYTES,F0,F1,F2,F3 port\n';save('output',output);
let mac='block-beta\n columns 2\n XREG["输入寄存器\nx = 1"] WREG["权重寄存器\nw = 2"]\n MULT["乘法器\n等待"]:2\n ADD["加法器\n等待"] ACC["列累加寄存器\n旧值 = 0"]\n OUT["本项执行后的部分和\n等待"]:2\n XREG --> MULT\n WREG --> MULT\n MULT --> ADD\n ACC --> ADD\n ADD --> OUT\nclass XREG,WREG mem\nclass MULT,ADD mxm\nclass ACC,OUT vxm\n';save('mac',mac);
let host='block-beta\n columns 4\n USERDEVICE["用户设备 · 输入 Prompt"]:4\n NETBUF["网络缓冲\n请求消息"] HOSTCPU["主机 CPU\n分词与运行时"]:2 HOSTRAM["主机内存\n输入张量"]\n ID0["ID · 101"] ID1["ID · 602"] ID2["ID · 9"] ID3["ID · 3"]\n PROGRAM["已部署程序\n指令与数据布局"]:2 MODELWEIGHTS["已部署模型权重\n来自训练"]:2\n PCIE["设备输入接口 · 数字任务"]:4\n DEVMEM["片上 SRAM\n权重与激活"]:2 DEVMXM["MXM / VXM\n数值运算"]:2\nclass USERDEVICE,NETBUF,PCIE port\nclass HOSTRAM,MODELWEIGHTS,DEVMEM,ID0,ID1,ID2,ID3 mem\nclass PROGRAM icu\nclass DEVMXM mxm\n';save('host',host);
let decode=kv+'\n INPUT["本轮新输入\n等待"]:2 MIX["MXM + VXM · 执行模型各层"]:4 NEXT["下一个 Token\n等待"]:2\n HOSTBUF["服务返回缓冲\n等待"]:4 USERBUF["用户已经收到\n等待"]:4\nclass INPUT,HOSTBUF,USERBUF port\nclass MIX mxm\nclass NEXT vxm\n';save('decode',decode);
save('packet','block-beta\n columns 1\n PACKET["0000"]\nclass PACKET mem\n');
const atlas=require('../hardware-atlas-map.js');
let board='block-beta\n columns 24\n';
for(const s of Object.values(atlas.specs))board+=`${s.id}["${s.label}"]\n`;
for(const color of Object.keys(palettes)){const ids=Object.values(atlas.specs).filter(s=>s.color===color).map(s=>s.id);if(ids.length)board+='class '+ids.join(',')+' '+color+'\n';}
save('atlas',board);
const clusterMap=require('../cluster-map.js');let clusterBoard='block-beta\n columns 24\n';
for(const n of Object.values(clusterMap.nodes))clusterBoard+=`${n.id}["${n.label||' '}"]\n`;
for(const color of Object.keys(palettes)){const ids=Object.values(clusterMap.nodes).filter(n=>n.color===color).map(n=>n.id);if(ids.length)clusterBoard+='class '+ids.join(',')+' '+color+'\n';}
save('cluster6',clusterBoard);
console.log('已写入 16 组亮色 Mermaid 源图，含四芯片硬件与软件双流。');

let software='block-beta\n columns 2\n IH["指令 flow"] DH["数据 flow"]\n';
for(let i=0;i<12;i++)software+='space:2\nI'+i+'["指令步骤示意说明\n计划与同步等待"] D'+i+'["数据输入输出内容\n数据结果待写入"]\n';
for(let i=0;i<11;i++)software+='I'+i+' --> I'+(i+1)+'\nD'+i+' --> D'+(i+1)+'\n';
software+='class IH,'+Array.from({length:12},(_,i)=>'I'+i).join(',')+' icu\nclass DH,'+Array.from({length:12},(_,i)=>'D'+i).join(',')+' mem\n';
save('software7',software);

const cycleMap=require('../cycle-map.js');let cycleBoard='block-beta\n columns 16\n';
for(const n of Object.values(cycleMap.nodes))cycleBoard+=`${n.id}["${n.label||' '}"]\n`;
for(const color of Object.keys(palettes)){const ids=Object.values(cycleMap.nodes).filter(n=>n.color===color).map(n=>n.id);if(ids.length)cycleBoard+='class '+ids.join(',')+' '+color+'\n';}
save('cycle9',cycleBoard);

const requestFlow=require('../request-flow.js');let requestSource='block-beta\n columns 1\n';
requestFlow.groups.forEach((g,i)=>{requestSource+=`R${i}["${String(i+1).padStart(2,'0')}  ${g.title}"]\n`;});
for(let i=0;i<7;i++)requestSource+=`R${i} --> R${i+1}\n`;
requestSource+='class R0,R1,R7 host\nclass R2,R3,R4,R5,R6 mem\n';save('request10',requestSource);
