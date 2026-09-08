/* UTF-8 · 所有矩形由 Mermaid 生成；此表仅定义硬件窗口的排版与归属。 */
(function(root){
 'use strict';const nodes={};
 function add(id,label,x,y,w,h,color='mem',owner='TSP',kind='part'){nodes[id]={id,label,x,y,w,h,color,owner,kind};}
 add('DIE','',2,2,1036,642,'frame','TSP','frame');
 const zones=[['MW0','MXM 0',90],['MW1','MXM 1',90],['SW','SXM',65],['MW','MEM ×44',180],['VX','VXM',150],['ME','MEM ×44',180],['SE','SXM',65],['ME0','MXM 2',90],['ME1','MXM 3',90]];let pos=18;
 for(const [id,label,w]of zones){add('TOP_'+id,label,pos,13,w-6,34,id.startsWith('ME')&&id.length===2||id==='MW'?'mem':id==='VX'?'vxm':id==='SW'||id==='SE'?'sxm':'mxm','TSP','overview');pos+=w;}
 add('WINDOW','西侧切片与中央 VXM · SL 0 的内部观察窗口',93,58,930,28,'host','TSP','caption');
 add('LADDER','20 个 SL',11,61,70,27,'host','TSP','caption');
 for(let s=0;s<20;s++)add('SL'+s,'SL '+s,12,98+(19-s)*24,68,21,'icu','ICU','tile');
 add('NORTH','向北传播',11,584,70,32,'icu','ICU','caption');
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
 const focus={all:{x:0,y:0,w:1040,h:650},mxm:{x:88,y:91,w:270,h:322},memory:{x:476,y:91,w:256,h:322},sxm:{x:354,y:91,w:124,h:322},vxm:{x:732,y:91,w:296,h:322},stream:{x:88,y:417,w:942,h:165},icu:{x:88,y:573,w:942,h:65}};
 const api={nodes,width:1040,height:650,focus};root.GROQ_CYCLE_MAP=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
