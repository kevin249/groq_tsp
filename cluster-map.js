/* UTF-8 · 四颗芯片与直接 C2C 布线。所有节点形状由 Mermaid 生成。 */
(function(root){
 'use strict';const nodes={};function add(id,label,x,y,w,h,color='port',owner='HOST',kind='part'){nodes[id]={id,label,x,y,w,h,color,owner,kind,layer:'hardware'};}
 add('RACK','四芯片示意板 · 固定物理连接，软件决定模型分工',8,8,1424,1403,'frame','BOARD','frame');
 add('HOST','主机 CPU / DRAM / NIC',32,54,1046,58,'host');add('REQUESTA','请求 A · 输入 ID',290,54,240,58,'host');add('REQUESTB','请求 B · 独立上下文',548,54,240,58,'host');add('TOKEN','采样后的 Token ID',806,54,272,58,'host');add('USER','用户设备 / 接收缓冲',1096,54,310,58,'host');
 for(const id of ['REQUESTA','REQUESTB','TOKEN'])Object.assign(nodes[id],{layer:'data',kind:'readout',anchor:'HOST'});
 const origins=[[36,157],[36,811],[790,157],[790,811]],widths=[40,40,34,96,82,96,34,40,40],zones=['MW0','MW1','SW','MEMW','VX','MEME','SE','ME0','ME1'];
 origins.forEach(([x,y],i)=>{
  const owner='C'+i,a=(key,label,dx,dy,w,h,color='port',kind='part')=>add(owner+'_'+key,label,x+dx,y+dy,w,h,color,owner,kind);
  a('DIE','TSP '+i,0,0,610,535,'frame','chip');a('TITLE','TSP '+i+' · 硬件功能区域',12,8,586,32,'host');
  const positions={};let offset=62;
  const rowY=sl=>88+(19-sl)*15.5;
  a('SL_HEAD','SL',16,54,40,27,'icu','sl-label');
  for(const sl of [19,15,10,5,0])a('SL'+sl,'SL '+sl,16,rowY(sl),40,11,'icu','sl-label');
  zones.forEach((z,j)=>{const color=z.startsWith('MEM')?'mem':z==='VX'?'vxm':z.includes('S')?'sxm':'mxm';positions[z]=offset;a(z,z.startsWith('MEM')?'MEM':z==='VX'?'VXM':z.includes('S')?'SXM':'MXM',offset,54,widths[j],353,color,'slice');for(let sl=0;sl<20;sl++)a(z+'SL'+sl,'',offset+3,rowY(sl),widths[j]-6,11,color,'tile');offset+=widths[j]+2;});
  // 硬件只有功能切片、SL、SR 与各片 ICU；张量与运算值全部独立放在上层。
  for(const z of zones)a('CTRL_'+z,z.startsWith('MEM')?'ICU×44':'ICU',positions[z],410,widths[zones.indexOf(z)],27,'icu','controller');
  for(let sl=0;sl<20;sl++)a('SR_SL'+sl,'',62,rowY(sl)+12,520,1,'stream','stream-lane');
  const floating=(id,title,zone,cy,layer='data')=>{
   const hw=nodes[owner+'_'+zone],cx=hw.x+hw.w/2;
   add(owner+'_'+id,title,cx-70,y+cy-31,140,62,layer==='instruction'?'icu':'stream',owner,'readout');
   Object.assign(nodes[owner+'_'+id],{layer,anchor:owner+'_'+zone});
  };
  floating('W','权重','MEMW',130);floating('PROG','指令块','MEMW',300,'instruction');floating('INPUT','输入激活','MEMW',382);
  floating('KV','KV 历史','MEME',130);floating('KVNEW','KV 追加','MEME',382);
  floating('MAC','乘加状态','MW0',240);floating('ALU','向量状态','VX',245);floating('SUM','归约状态','VX',165);
  floating('SRF','流寄存器状态','SW',320);floating('ICU','当前指令','CTRL_MW0',430,'instruction');
  a('TX','发送缓冲',62,449,103,32,'port');a('SER_TX','发送 SerDes',177,449,100,32,'port');a('SER_RX','接收 / 对齐',289,449,127,32,'port');a('RX','接收缓冲',428,449,116,32,'port');
  for(let r=0;r<4;r++)a('FIFO'+r,String(r),428+r*30,489,25,26,'stream');
  a('PCIE','PCIe / DMA',62,489,146,26,'port');a('PORTN','C2C 北口',252,-13,102,26,'port','port');a('PORTS','C2C 南口',252,522,102,26,'port','port');a('PORTW','C2C',-16,446,49,34,'port','port');a('PORTE','C2C',577,446,49,34,'port','port');
 });
 for(const x of [336,1090]){add('TRACE'+x+'A','',x,705,6,19,'wire','BOARD','trace');add('TRACE'+x+'B','',x,767,6,31,'wire','BOARD','trace');}
 add('WIRE02','0 ↔ 2 · C2C',662,603,112,34,'wire','BOARD','wire');add('WIRE13','1 ↔ 3 · C2C',662,1257,112,34,'wire','BOARD','wire');add('WIRE01','0 ↔ 1 · C2C',239,724,204,43,'wire','BOARD','wire');add('WIRE23','2 ↔ 3 · C2C',993,724,204,43,'wire','BOARD','wire');
 add('FOOT','图中仅使用四条逻辑邻接；每条连接的物理 ×4 链路数可调。不是所有 16 个接口同时提供给单条传输。',38,1358,1352,32,'host','BOARD','caption');
 function port(from,to){const a=origins[from],b=origins[to];return'C'+from+'_PORT'+(b[0]>a[0]?'E':b[0]<a[0]?'W':b[1]>a[1]?'S':'N');}
 function path(from,to,route){const ids=['C'+from+'_TX','C'+from+'_SER_TX'];const chips=route(from,to);for(let i=0;i<chips.length-1;i++){const a=chips[i],b=chips[i+1];ids.push(port(a,b),'WIRE'+[a,b].sort((a,b)=>a-b).join(''),port(b,a));if(i<chips.length-2)ids.push('C'+b+'_SER_RX','C'+b+'_RX','C'+b+'_INPUT','C'+b+'_TX','C'+b+'_SER_TX');}ids.push('C'+to+'_SER_RX','C'+to+'_RX');return ids;}
 function packetPath(packet,route){if(!packet.wire)return[packet.from,packet.to];const ids=path(packet.wire.from,packet.wire.to,route);if(packet.from!==ids[0])ids.unshift(packet.from);if(packet.wire.reduce)ids.push('C'+packet.wire.to+'_SUM');if(packet.to!==ids.at(-1))ids.push(packet.to);return ids;}
 const hardwareId=id=>nodes[id]?.anchor||id;
 const anchor=id=>nodes[hardwareId(id)]||null;
 const api={nodes,origins,zones,width:1440,height:1418,port,path,packetPath,hardwareId,anchor};root.GROQ_CLUSTER_MAP=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
