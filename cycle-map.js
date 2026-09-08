/* UTF-8 · 所有矩形由 Mermaid 生成；此表仅定义硬件窗口的排版与归属。 */
(function(root){
 'use strict';const nodes={};
 function add(id,label,x,y,w,h,color='mem',owner='TSP',kind='part'){nodes[id]={id,label,x,y,w,h,color,owner,kind};}
 // SL 行与所有功能切片共用一套坐标；单 SL 细节使用独立镜头。
 const zones=[['MW0','MXM 0',80,'mxm'],['MW1','MXM 1',80,'mxm'],['SW','SXM 西',64,'sxm'],['MW','MEM ×44',168,'mem'],['VX','VXM',144,'vxm'],['ME','MEM ×44',168,'mem'],['SE','SXM 东',64,'sxm'],['ME0','MXM 2',80,'mxm'],['ME1','MXM 3',80,'mxm']];
 const rowY=sl=>98+(19-sl)*23,rowHeight=20,unitZone={MEM_A:'MW',MEM_B:'MW',MXM:'MW0',SXM:'SW',VXM:'VX'};
 add('OV_DIE','',2,2,1036,642,'frame','TSP','frame');
 add('OV_TITLE','同一 SL 横向贯穿各切片 · 点击行号选中，点击格子展开内部',12,10,1016,29,'host','TSP','caption');
 add('LADDER','SL',12,51,68,34,'icu','ICU','caption');
 for(let sl=0;sl<20;sl++){add('SL'+sl,'SL '+sl,12,rowY(sl),68,rowHeight,'icu','ICU','sl-label');nodes['SL'+sl].sl=sl;}
 let pos=94;
 for(const [z,title,w,color] of zones){
  const owner=Object.keys(unitZone).find(u=>unitZone[u]===z)||'TSP';
  add('TOP_'+z,title,pos,51,w-6,34,color,owner,'overview');
  for(let sl=0;sl<20;sl++){const id='GRID_'+z+'_'+sl;add(id,'',pos,rowY(sl),w-6,rowHeight,color,owner,'sl-cell');Object.assign(nodes[id],{sl,zone:z});}
  add('OV_ICU_'+z,z==='MW'||z==='ME'?'ICU ×44':'ICU',pos,598,w-6,36,'icu',owner,'overview-icu');pos+=w;
 }
 add('OV_NOTE','每格是 SL 与功能切片的交点；MEM 折叠显示。紫框：指令到达；底色：数据 / 运算状态。',94,565,928,25,'host','TSP','caption');
 add('NORTH','逐拍北移',12,590,68,44,'icu','ICU','caption');
 // 原有寄存器与算术窗口保持坐标关系，整体移入所选 SL 的独立视野。
 const detailOffset=1018;
 add('DIE','',1102,2,946,642,'frame','TSP','frame');
 add('WINDOW','SL 0 内部 · 西侧切片与中央 VXM 的展开窗口',1112,12,928,34,'host','TSP','caption');
 add('DETAIL_NOTE','以下所有 MAC、bank、ALU 与 SR 均属于所选 SL 的观察窗口；内部行号不是 SL 编号。',1112,56,928,27,'host','TSP','caption');
 const detailStart=new Set(Object.keys(nodes));
 const frames=[['MXM','MXM · 4×4 阵列窗口',94,256,'mxm'],['SXM','SXM',362,108,'sxm'],['MEM','MEM · 两组字节切片',482,244,'mem'],['VXM','VXM · 中央向量单元',738,284,'vxm']];
 for(const [id,title,x,w,color]of frames){add(id+'_FRAME','',x,95,w,314,color,id,'frame');add(id+'_TITLE',title,x+6,102,w-12,30,color,id,'title');}
 add('WEIGHT','权重缓冲 · 等待 LW',104,140,236,29,'mem','MXM');add('PLANE','权重阵列 · 等待 IW',104,177,236,28,'mxm','MXM');
 for(let r=0;r<4;r++)for(let c=0;c<4;c++)add('MAC'+r+c,'MAC',104+c*60,213+r*34,56,30,'mxm','MXM','cell');
 add('ACC','ACC · 0, 0, 0, 0',104,355,236,24,'mxm','MXM');add('ACT','激活缓冲 · 无效',104,384,236,19,'mem','MXM');
 add('SX_IN','输入',370,145,92,54,'stream','SXM');
 for(let i=0;i<4;i++)add('PERM'+i,'位置 '+i,370,209+i*30,92,25,'sxm','SXM','cell');
 add('SX_OUT','输出',370,343,92,54,'stream','SXM');
 for(const [unit,x]of [['MEM_A',490],['MEM_B',610]]){add(unit+'_FRAME','',x,140,108,188,'mem',unit,'frame');add(unit+'_TITLE',unit==='MEM_A'?'A0—A3':'B0—B3',x+3,145,102,24,'mem',unit,'title');add(unit+'_BANK0','各片 Bank 0',x+5,177,98,64,'mem',unit,'bank');add(unit+'_BANK1','各片 Bank 1',x+5,251,98,64,'mem',unit,'bank');add(unit+'_ADDR','地址 —',x,337,108,25,'icu',unit);add(unit+'_READ','读出寄存器',x,370,108,32,'stream',unit);}
 add('V_IN','操作数 · 等待数据',748,140,264,29,'stream','VXM');
 for(let row=0;row<4;row++)for(let lane=0;lane<4;lane++)add('ALU'+row+lane,'A'+row,748+lane*66,181+row*36,60,30,'vxm','VXM','cell');
 add('V_NOTE','每 lane 16 ALU · 展示前 4 槽',748,332,264,25,'vxm','VXM','caption');add('V_OUT','输出寄存器 · 无效',748,366,264,36,'stream','VXM');
 for(const [bus,row,label]of [['X',0,'sX · 数据'],['W',1,'sW · 权重 / 第二路'],['Y',2,'sY · 结果']]){const y=426+row*42;add('BUS_'+bus,label,94,y,136,35,bus==='W'?'mxm':bus==='Y'?'sxm':'stream','SR','title');for(let j=0;j<=6;j++)add(bus+j,'SR '+j+' · 空',238+j*113,y,106,35,bus==='W'?'mxm':'stream','SR','register');}
 add('STREAM_NOTE','SR 槽沿传输方向编号 · 相邻槽 1 拍；折叠路径，不以画框距离推断物理跳数',94,553,928,24,'host','SR','caption');
 for(const [i,unit]of ['MEM_A','MEM_B','MXM','SXM','VXM'].entries()){const x=94+i*187;add('ICU_'+unit,unit.replace('_',' ')+' · ICU',x,586,177,45,'icu',unit,'icu');}
 for(const [id,n] of Object.entries(nodes))if(!detailStart.has(id))n.x+=detailOffset;
 const shifted=(x,y,w,h)=>({x:x+detailOffset,y,w,h});
 const focus={all:{x:0,y:0,w:1040,h:650},detail:{x:1100,y:0,w:950,h:650},mxm:shifted(88,91,270,322),memory:shifted(476,91,256,322),sxm:shifted(354,91,124,322),vxm:shifted(732,91,296,322),stream:shifted(88,417,942,165),icu:shifted(88,573,942,65)};
 const api={nodes,width:2050,height:650,focus,zones,unitZone,rowY,rowHeight,detailOffset};root.GROQ_CYCLE_MAP=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
