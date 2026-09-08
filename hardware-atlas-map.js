/* UTF-8 · 固定硬件场景的所有者、位置与示意单元。所有形状由 Mermaid 生成。 */
(function(root){
 'use strict';
 const zones=[['MW0','西 MXM 0','mxm'],['MW1','西 MXM 1','mxm'],['SW','西 SXM','sxm'],['MEMW','西 MEM','mem'],['VX','中央 VXM','vxm'],['MEME','东 MEM','mem'],['SE','东 SXM','sxm'],['ME0','东 MXM 0','mxm'],['ME1','东 MXM 1','mxm']];
 const specs={};const add=(id,owner,label,x,y,w,h,kind='part',color='port')=>{specs[id]={id,owner,label,x,y,w,h,kind,color};};
 add('DIE','BOARD','TSP 0 · 第一代功能组织',16,16,1190,730,'frame','frame');
 add('NORTH','BOARD','C2C · 片间接口',34,50,1154,34,'port','port');
 add('CONTROL','BOARD','ICU · 指令控制与纵向传播',34,671,1154,32,'port','icu');
 add('PCIE','BOARD','PCIe 主机接口',34,711,220,30,'port','port');add('DMA','BOARD','I/O 模块 · DMA',264,711,230,30,'port','port');add('SOUTH','BOARD','C2C · 片间接口',504,711,684,30,'port','port');
 add('BUS','BOARD','横向流寄存器 · 所选 Superlane 的通道展开',34,632,1154,28,'bus','stream');
 for(let l=0;l<4;l++)add('BRIDGE'+l,'BOARD','中间流寄存器 L'+l,0,635+l*6,12,5,'bridge','stream');
 const slY=sl=>166+(19-sl)*22.5;
 add('SL_HEAD','BOARD','SL',34,132,48,24,'sl-label','icu');
 for(let sl=0;sl<20;sl++){add('SL'+sl,'BOARD','SL '+sl,34,slY(sl),48,17,'sl-label','icu');specs['SL'+sl].sl=sl;}
 for(const[z,name,color]of zones){
  add(z,z,name,0,92,100,530,'region',color);add(z+'HEAD',z,name,0,100,100,27,'heading',color);
  add(z+'LOC',z,'所选切片 / Superlane',0,132,100,24,'location',color);
  const columns=z.startsWith('MEM')?8:1;
  for(let r=0;r<20;r++)for(let c=0;c<columns;c++)add(z+'R'+r+(columns>1?'C'+c:''),z,' ',0,0,10,12,'tile',color);
  add(z+'PIN',z,'SR',0,634,36,25,'pin','stream');
  for(let l=0;l<4;l++)add(z+'PIN'+l,z,'L'+l,0,635+l*6,9,5,'lanepin','stream');
  const cell=(id,title,x,y,w,h,tint=color)=>add(z+'__'+id,z,title,x,y,w,h,'detail',tint);
  if(color==='mem'){
   cell('ADDRREG','地址寄存器',0,0,168,36);cell('DECODER','地址译码',180,0,168,36);
   for(let b=0;b<2;b++){
    cell('BANK'+b,'Bank '+b,0,49+b*156,348,24);
    for(let r=0;r<4;r++){
     cell('A'+b+r,'行 '+r,0,82+b*156+r*29,34,25);
     for(let l=0;l<4;l++)cell(`B${b}R${r}L${l}`,`R${r}·L${l}`,42+l*78,82+b*156+r*29,72,25);
    }
   }
   for(let l=0;l<4;l++)cell('R'+l,'读锁存 '+l,l*87,357,81,34,'stream');
   cell('WRITE','写入缓冲',0,405,168,34,'stream');cell('WEIGHTS','权重存储块',180,405,168,34);
  }else if(color==='mxm'){
   cell('BUFFER','权重缓冲',0,0,388,34);cell('IDENTITY','一个 MAC 子阵列 · 4×4 示意展开',0,42,388,27);
   for(let r=0;r<4;r++){
    cell('X'+r,'激活 x'+r,320,80+r*62,68,54,'stream');
    for(let c=0;c<4;c++)cell('M'+r+c,'MAC '+r+','+c,c*80,80+r*62,74,54);
   }
   for(let c=0;c<4;c++)cell('SUM'+c,'累加器 '+c,c*80,336,74,46,'vxm');
   cell('READOUT','输出寄存器',0,397,388,34,'stream');
   add(z+'CIRCUIT',z,'所选 MAC 内部',0,174,322,427,'circuit','frame');
  }else if(color==='vxm'){
   for(let l=0;l<4;l++){
    cell('IN'+l,'输入 L'+l,l*81,0,75,34,'stream');
    for(let a=0;a<4;a++)cell('A'+a+l,'ALU '+a+' / L'+l,l*81,65+a*66,75,56);
    cell('OUT'+l,'输出 L'+l,l*81,345,75,34,'stream');
   }
   cell('SCALE','每 lane 16 个 ALU · 此处展开 4 个槽',0,402,318,26);
  }else if(color==='sxm'){
   for(let l=0;l<4;l++){cell('IN'+l,'输入 L'+l,l*75,0,68,46,'stream');cell('OUT'+l,'输出 L'+l,l*75,235,68,46,'stream');}
   cell('PERM','置换 / 移位资源',0,100,293,88);cell('CONTROLREG','布局控制',0,330,293,42,'icu');
  }
 }
 // 芯片边界外的服务逻辑，不对采样器的实际 CPU/LPU 放置作断言。
 add('SERVICE','HOST','芯片边界之外 · 请求与返回的服务逻辑',16,772,1190,238,'frame','host');
 const service=[['USERDEVICE','用户设备'],['NETBUF','NIC / 接收缓冲'],['HOSTCPU','CPU / tokenizer'],['HOSTRAM','主机 DRAM / 输入'],['PROGRAM','运行时 / DMA 描述符'],['MODELWEIGHTS','部署权重文件'],['SELECT','采样服务'],['TOKEN','输出 Token ID'],['BYTES','解码 / 字节缓冲'],['HOSTBUF','服务端发送缓冲'],['USERBUF','用户收到'],['NEXT','回流输入']];
 service.forEach(([id,title],i)=>add('HOST__'+id,'HOST',title,30+(i%6)*194,806+Math.floor(i/6)*69,180,57,'external','host'));
 // 四个示意输入/候选共用服务内的小槽位，只在相关上下文中显示。
 for(let i=0;i<4;i++)add('HOST__SLOT'+i,'HOST','临时槽 '+i,30+i*146,956,136,43,'external','host');
 for(let i=1;i<4;i++){add('PEER'+i,'PEER'+i,'其他 LPU '+i,1236,100+(i-1)*230,174,174,'peer','frame');add('PEER'+i+'PORT','PEER'+i,'片间寄存器',1248,270+(i-1)*230,150,31,'external','port');}
 function defaults(chapter){return['MEMW','MEMW','MEMW','VX','MW0','MW0','SW','MEME','NORTH','MEME'][chapter]||'MEMW';}
 const group=id=>zones.find(z=>z[0]===id)?.[2];
 function context({chapter=0,zone=defaults(chapter),kind='die',expanded=false,sl=3,slice=0,bank=0,row=2,focusZone=null,mac=null,external=false,lab=false}={}){
  const side=zone.startsWith('ME')&&zone!=='MEMW'||zone==='SE'?'east':'west';
  const mem=zone.startsWith('MEM')?zone:side==='east'?'MEME':'MEMW';
  const matrix=group(zone)==='mxm'?zone:side==='east'?'ME0':'MW0';
  const sw=zone==='SE'||side==='east'?'SE':'SW';
  const detail=new Set();
  if(expanded){
   if(focusZone&&zones.some(z=>z[0]===focusZone))detail.add(focusZone);
   else if(kind==='kv'||kind==='decode')detail.add(zone==='VX'?'VX':group(zone)==='mxm'?matrix:mem);
   else if(kind==='mxm')detail.add(matrix);
   else if(kind==='stream')detail.add(mem);
   else if(kind==='memory')detail.add(mem);else if(kind==='vxm')detail.add('VX');else if(kind==='sxm')detail.add(sw);
   else if(zones.some(z=>z[0]===zone))detail.add(zone);
  }
  return{chapter,zone,kind,expanded,sl,slice,bank,row,mem,matrix,sw,detail,mac,external,lab};
 }
 function layout(ctx){
  const weights={};for(const[z,,k]of zones)weights[z]=ctx.detail.size?(k==='mem'?.6:.42):(k==='mem'?2.3:k==='vxm'?1.7:k==='sxm'?.72:1.04);
  for(const z of ctx.detail)weights[z]=ctx.detail.size===1?9:ctx.detail.size===2?(z===ctx.zone?7:4):z==='VX'?3.5:z===ctx.mem?5:4.5;
  const sum=Object.values(weights).reduce((a,b)=>a+b,0),out={},boxes={};let left=92;
  for(const[z]of zones){const w=weights[z]/sum*1032;boxes[z]={x:left,w};left+=w+8;}
  for(const[id,s]of Object.entries(specs)){
   if(s.kind==='bridge'){const mem=boxes[ctx.mem],vx=boxes.VX;out[id]={...s,x:(mem.x+mem.w/2+vx.x+vx.w/2)/2-6,visible:true};continue;}
   if(!boxes[s.owner]){out[id]={...s,visible:true};continue;}
   const b=boxes[s.owner],active=ctx.detail.has(s.owner);let x=s.x,y=s.y,w=s.w,h=s.h,visible=true;
   if(s.kind==='region'){x=b.x;w=b.w;}
   else if(s.kind==='heading'){x=b.x+3;w=b.w-6;}
   else if(s.kind==='location'){x=b.x+3;w=b.w-6;visible=active;}
   else if(s.kind==='pin'){x=b.x+b.w/2-18;}
   else if(s.kind==='lanepin'){x=b.x+b.w/2-4.5;}
   else if(s.kind==='circuit'){x=b.x+b.w-338;visible=active&&Boolean(ctx.mac)&&s.owner===ctx.matrix;}
   else if(s.kind==='tile'){
    const m=id.match(/R(\d+)(?:C(\d+))?$/),r=Number(m[1]),col=Number(m[2]||0),cols=s.owner.startsWith('MEM')?8:1;
    const span=active?20:b.w-10;x=b.x+5+col*span/cols;y=slY(r);w=Math.max(1,span/cols-1.5);h=17;
   }else if(s.kind==='detail'){
    const nativeWidth=group(s.owner)==='mem'?354:group(s.owner)==='mxm'?390:group(s.owner)==='vxm'?320:295;
    const internal=Boolean(ctx.mac)&&s.owner===ctx.matrix;
    const k=Math.max(.04,Math.min((b.w-(internal?385:38))/nativeWidth,internal?.82:1));x=b.x+30+(internal?0:Math.max(0,(b.w-38-nativeWidth*k)/2))+s.x*k;y=177+s.y*k;w=s.w*k;h=s.h*k;visible=active;
   }
   out[id]={...s,x,y,w,h,visible};
  }
  return{nodes:out,boxes,width:1430,height:1020};
 }
 function resolve(id,ctx,kind=ctx.kind){
  if(kind==='lab')return specs[id]?id:null;
  const cell=(owner,local)=>owner+'__'+local;const primary=group(ctx.zone)==='mxm'?ctx.zone:ctx.matrix;
  if(kind==='die')return specs[id]?id:null;
  if(kind==='host'){
   if(id==='PCIE')return'PCIE';if(id==='DEVMEM')return cell(ctx.mem,'WRITE');if(id==='DEVMXM')return cell(ctx.matrix,'BUFFER');
   if(/^ID\d$/.test(id))return'HOST__SLOT'+id.slice(-1);return specs['HOST__'+id]?'HOST__'+id:null;
  }
  if(kind==='memory'){
   if(id==='READOUT'||id==='READHEAD')return cell(ctx.mem,'R0');if(/^BANK\dHEAD$/.test(id))id=id.replace('HEAD','');
   return specs[cell(ctx.mem,id)]?cell(ctx.mem,id):null;
  }
  if(kind==='mxm'){
   if(id==='WSTORE')return cell(ctx.mem,'WEIGHTS');if(id==='SUMHEAD'||id==='SUMEND')return cell(primary,'READOUT');
   if(/^ROW\d$|^WCOL\d$/.test(id))return cell(primary,'M0'+id.slice(-1));if(id==='CORNER'||id==='ROWLABEL')return cell(primary,'IDENTITY');
   return specs[cell(primary,id)]?cell(primary,id):null;
  }
  if(kind==='stream'){
   if(id==='SOURCE')return cell(ctx.mem,'R0');if(/^D\d$/.test(id))return cell('VX','A0'+id.slice(-1));
   const m=id.match(/^S(\d)L(\d)$/);if(m)return [ctx.mem+'PIN'+m[2],'BRIDGE'+m[2],'VX'+'PIN'+m[2],cell('VX','IN'+m[2])][Number(m[1])];
   if(/^I\d$|^ID$|^CONTROLHEAD$/.test(id))return'CONTROL';if(/^L\d$/.test(id))return cell(ctx.mem,'R'+id.slice(-1));return ctx.mem+'PIN';
  }
  if(kind==='vxm')return specs[cell('VX',id)]?cell('VX',id):null;
  if(kind==='sxm')return specs[cell(ctx.sw,id)]?cell(ctx.sw,id):null;
  if(kind==='kv'||kind==='decode'){
   let m=id.match(/^([KVP])(\d)$/);if(m){const i=Number(m[2]);return cell(ctx.mem,`B${m[1]==='V'?1:0}R${Math.floor(i/4)}L${i%4}`);}
   m=id.match(/^SCORE(\d)$/);if(m)return cell(ctx.matrix,'M'+Math.floor(Number(m[1])/4)+Number(m[1])%4);
   m=id.match(/^PROB(\d)$/);if(m)return cell('VX','A'+Math.floor(Number(m[1])/4)+Number(m[1])%4);
   const aliases={TITLE:ctx.mem,WRITEBUF:cell(ctx.mem,'WRITE'),QUERY:cell(ctx.matrix,'X0'),FETCH:cell('VX','SCALE'),RESULT:cell(ctx.matrix,'SUM0'),INPUT:cell(ctx.matrix,'X0'),MIX:ctx.matrix,NEXT:'HOST__NEXT',HOSTBUF:'HOST__HOSTBUF',USERBUF:'HOST__USERBUF'};return aliases[id]||null;
  }
  if(kind==='output'){
   if(/^T\d$/.test(id))return'HOST__SLOT'+id.slice(-1);if(/^F\d$/.test(id))return Number(id.slice(-1))<3?'HOST__HOSTBUF':'HOST__USERBUF';
   return{WORDTABLE:cell(ctx.matrix,'READOUT'),SELECT:'HOST__SELECT',TOKEN:'HOST__TOKEN',BYTES:'HOST__BYTES',FIFOHEAD:'HOST__HOSTBUF'}[id]||null;
  }
  if(kind==='cluster'){
   if(id==='C2C')return'NORTH';const m=id.match(/^(?:CHIP|C)(\d)/);if(m){const i=Number(m[1]);if(i===0)return id.endsWith('OUT')?cell(ctx.matrix,'READOUT'):ctx.matrix;return'PEER'+i+(id.endsWith('OUT')?'PORT':'');}
  }
  return null;
 }
 function owner(id,ctx,kind){const key=resolve(id,ctx,kind);return key?specs[key]?.owner:null;}
 function address(key,ctx){
  const s=specs[key];if(!s)return'';if(s.owner==='HOST')return'芯片外 / 服务逻辑 / '+s.label;if(s.owner.startsWith('PEER'))return'其他 LPU / 片间接口';
  if(s.owner==='BOARD')return'TSP 0 / '+s.label;
  const name=zones.find(z=>z[0]===s.owner)?.[1]||s.owner;return`TSP 0 / ${name} / 示意切片 ${ctx.slice} / SL ${String(ctx.sl).padStart(2,'0')} / ${s.label}`;
 }
 const api={zones,specs,slY,defaults,group,context,layout,resolve,owner,address};root.HARDWARE_ATLAS_MAP=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
