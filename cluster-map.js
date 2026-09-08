/* UTF-8 · 四颗芯片与直接 C2C 布线。所有节点形状由 Mermaid 生成。 */
(function(root){
 'use strict';const nodes={};function add(id,label,x,y,w,h,color='port',owner='HOST',kind='part'){nodes[id]={id,label,x,y,w,h,color,owner,kind};}
 add('RACK','四芯片教学板 · 固定物理连接，软件决定模型分工',8,8,1424,1115,'frame','BOARD','frame');
 add('HOST','主机 CPU / 运行时',32,54,240,58,'host');add('REQUESTA','请求 A · 输入 ID',290,54,240,58,'host');add('REQUESTB','请求 B · 独立上下文',548,54,240,58,'host');add('TOKEN','采样后的 Token ID',806,54,272,58,'host');add('USER','用户接收缓冲',1096,54,310,58,'host');
 const origins=[[36,157],[36,667],[790,157],[790,667]],widths=[44,44,40,106,90,106,40,44,44],zones=['MW0','MW1','SW','MEMW','VX','MEME','SE','ME0','ME1'];
 origins.forEach(([x,y],i)=>{
  const owner='C'+i,a=(key,label,dx,dy,w,h,color='port',kind='part')=>add(owner+'_'+key,label,x+dx,y+dy,w,h,color,owner,kind);
  a('DIE','TSP '+i,0,0,610,391,'frame','chip');a('TITLE','TSP '+i+' · 硬件功能区域',12,8,586,32,'host');
  const positions={};let offset=16;zones.forEach((z,j)=>{const color=z.startsWith('MEM')?'mem':z==='VX'?'vxm':z.includes('S')?'sxm':'mxm';positions[z]=offset;a(z,z.startsWith('MEM')?'MEM':z==='VX'?'VXM':z.includes('S')?'SXM':'MXM',offset,54,widths[j],209,color,'slice');for(let r=0;r<4;r++)a(z+'SL'+r,'',offset+3,88+r*38,widths[j]-6,32,color,'tile');offset+=widths[j]+2;});
  a('W','权重数据',positions.MEMW+4,89,98,54,'mem');a('PROG','指令块',positions.MEMW+4,148,98,28,'icu');a('INPUT','激活数据',positions.MEMW+4,184,98,50,'stream');
  a('KV','KV 历史',positions.MEME+4,89,98,60,'mem');a('KVNEW','KV 写入',positions.MEME+4,163,98,70,'mem');
  a('ALU','逐元素 ALU',positions.VX+4,89,82,60,'vxm');a('SUM','归约 ALU',positions.VX+4,163,82,70,'vxm');
  a('MAC','MAC',positions.MW0+3,92,38,64,'mxm');a('SRF','横向流寄存器 SRF',18,242,570,19,'stream','bus');
  a('ICU','ICU 组 · 每个功能切片有自己的指令控制',16,270,578,25,'icu');
  a('TX','发送缓冲',62,305,103,32,'port');a('SER_TX','发送 SerDes',177,305,100,32,'port');a('SER_RX','接收 / 对齐',289,305,127,32,'port');a('RX','接收缓冲',428,305,116,32,'port');
  for(let r=0;r<4;r++)a('FIFO'+r,String(r),428+r*30,345,25,26,'stream');
  a('PCIE','PCIe / DMA',62,345,146,26,'port');a('PORTN','C2C 北口',252,-13,102,26,'port','port');a('PORTS','C2C 南口',252,378,102,26,'port','port');a('PORTW','C2C',-16,302,49,34,'port','port');a('PORTE','C2C',577,302,49,34,'port','port');
 });
 for(const x of [336,1090]){add('TRACE'+x+'A','',x,561,6,19,'wire','BOARD','trace');add('TRACE'+x+'B','',x,623,6,31,'wire','BOARD','trace');}
 add('WIRE02','0 ↔ 2 · C2C',662,459,112,34,'wire','BOARD','wire');add('WIRE13','1 ↔ 3 · C2C',662,969,112,34,'wire','BOARD','wire');add('WIRE01','0 ↔ 1 · C2C',239,580,204,43,'wire','BOARD','wire');add('WIRE23','2 ↔ 3 · C2C',993,580,204,43,'wire','BOARD','wire');
 add('FOOT','图中仅使用四条逻辑邻接；每条连接的物理 ×4 链路数可调。不是所有 16 个接口同时提供给单条传输。',38,1070,1352,32,'host','BOARD','caption');
 function port(from,to){const a=origins[from],b=origins[to];return'C'+from+'_PORT'+(b[0]>a[0]?'E':b[0]<a[0]?'W':b[1]>a[1]?'S':'N');}
 function path(from,to,route){const ids=['C'+from+'_TX','C'+from+'_SER_TX'];const chips=route(from,to);for(let i=0;i<chips.length-1;i++){const a=chips[i],b=chips[i+1];ids.push(port(a,b),'WIRE'+[a,b].sort((a,b)=>a-b).join(''),port(b,a));if(i<chips.length-2)ids.push('C'+b+'_SER_RX','C'+b+'_RX','C'+b+'_INPUT','C'+b+'_TX','C'+b+'_SER_TX');}ids.push('C'+to+'_SER_RX','C'+to+'_RX');return ids;}
 function packetPath(packet,route){if(!packet.wire)return[packet.from,packet.to];const ids=path(packet.wire.from,packet.wire.to,route);if(packet.from!==ids[0])ids.unshift(packet.from);if(packet.wire.reduce)ids.push('C'+packet.wire.to+'_SUM');if(packet.to!==ids.at(-1))ids.push(packet.to);return ids;}
 const api={nodes,origins,zones,width:1440,height:1130,port,path,packetPath};root.GROQ_CLUSTER_MAP=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
