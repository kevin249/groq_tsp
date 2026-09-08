/* UTF-8 · 数值状态映射到 Mermaid 单元；可不依赖浏览器验证。 */
(function(root){
 'use strict';const D=root.HARDWARE_DATA||(typeof require!=='undefined'?require('./hardware-data.js'):null);
 const format=n=>Number.isInteger(n)?String(n):Number(n.toFixed(3)).toString();
 function scene(s,key,queryOverride,selected){
  const p={};const put=(id,label,classes=[])=>p[id]={label:Array.isArray(label)?label:[String(label)],classes};
  const mask=()=>['hw-mask']; const live=()=>['hw-data','hw-active'];
  if(key==='host'){
   put('USERDEVICE',['用户设备',D.prompt],['hw-data']);put('NETBUF',['网络缓冲',s.step>=1?'消息已到达':'等待请求']);
   put('HOSTCPU',['主机 CPU',s.step>=2?'已完成示意分词':'组织请求与分词']);put('HOSTRAM',['主机内存',s.step>=2?'4 个示意 ID':'输入消息']);
   [101,602,9,3].forEach((v,i)=>put('ID'+i,['输入位置 '+i,s.step>=2?'ID = '+v:'等待分词'],s.step>=2?live():mask()));
   put('PCIE',['设备输入接口',s.step>=3?'任务与数字已交付':'等待输入'],s.step>=3?live():[]);
   put('PROGRAM',['已部署程序','指令 / 数据布局'],['hw-computed']);put('MODELWEIGHTS',['已部署模型权重','在请求之前准备'],['hw-computed']);
   put('DEVMEM',['片上 SRAM',s.step>=3?'输入待处理':'已保存模型权重'],s.step>=3?live():[]);put('DEVMXM',['MXM / VXM','执行数值算子']);
  }
  if(key==='memory'){
   put('ADDRREG',['地址寄存器',`bank ${s.bank} · 行 ${String(s.row).padStart(2,'0')}`],s.step>=1?live():[]);put('DECODER',['地址译码器',s.step>=1?'选中地址 '+s.row:'等待地址'],s.step>=1?live():[]);
   for(let b=0;b<2;b++)for(let r=0;r<4;r++){
    const chosen=b===s.bank&&r===s.row;put(`A${b}${r}`,String(r).padStart(2,'0'),chosen?['hw-picked']:[]);
    for(let l=0;l<4;l++)put(`B${b}R${r}L${l}`,D.banks[b][r][l],chosen?(s.step>=2?live():['hw-active']):[]);
   }
   for(let l=0;l<4;l++)put('R'+l,s.step>=3?s.x[l]:'等待',s.step>=3?live():[]);
  }
  if(key==='stream'){
   for(let l=0;l<4;l++){
    for(let slot=0;slot<4;slot++)put(`S${slot}L${l}`,s.step===slot?s.x[l]:'·',s.step===slot?live():[]);
    put('D'+l,s.step===4?['ALU '+l,s.x[l]]:['ALU '+l,'等待'],s.step===4?['hw-computed','hw-active']:[]);
   }
   for(let i=0;i<4;i++)put('I'+i,['READ','传播','传播','到达'][i],s.step===i?['hw-active']:[]);
   put('ID',s.step===4?'执行':'等待指令',s.step===4?['hw-active']:[]);
  }
  if(key==='vxm'){
   const functions=['平方','均值','缩放因子','输出'];
   for(let lane=0;lane<4;lane++){
    put('IN'+lane,['lane '+lane,'x = '+format(s.x[lane])],['hw-data']);
    const values=[s.squares[lane],s.mean,s.scale,s.norm[lane]];
    for(let stage=0;stage<4;stage++)put(`A${stage}${lane}`,[functions[stage],s.step>stage?format(values[stage]):'等待'],s.step>stage?(s.step===stage+1?['hw-computed','hw-active']:['hw-computed']):[]);
    put('OUT'+lane,s.step===4?format(s.norm[lane]):'等待',s.step===4?live():[]);
   }
  }
  if(key==='mxm'){
   put('WSTORE','SRAM 权重块 · 每个权重对应一个 MAC',['hw-data']);
   put('BUFFER',s.chapter===4?(s.step===0?'权重缓冲 · 空':'权重缓冲 · 16 个权重已读取'):'权重驻留 · 正在执行激活 × 权重',s.chapter===4&&s.step===1?live():[]);
   for(let r=0;r<4;r++){
    const done=s.terms>r;const productReady=done||s.productReady===r;const current=s.chapter===5&&s.step===r+1;
    put('X'+r,['x'+r+' = '+s.x[r],done?'已送入':'等待'],current?live():['hw-data']);
    for(let c=0;c<4;c++)put(`M${r}${c}`,s.installed>r?['w = '+D.weights[r][c],productReady?`${s.x[r]}×${D.weights[r][c]} = ${s.x[r]*D.weights[r][c]}`:'乘积 · 等待']:['w = 空','等待安装'],s.installed<=r?mask():current?['hw-current','hw-active']:done?['hw-computed']:['hw-gold']);
    put('ROW'+r,'第 '+(r+1)+' 项',current?['hw-active']:[]);
   }
   for(let c=0;c<4;c++)put('SUM'+c,s.sums[c],s.terms?['hw-computed','hw-active']:[]);
   put('SUMHEAD',s.terms===4?'结果锁存器':'列累加器');
  }
  if(key==='mac'){
   const r=selected?.row??Math.max(0,Math.min(s.terms-1,3)),c=selected?.col??0,done=s.terms>r,productReady=done||s.productReady===r;
   const w=D.weights[r][c],product=s.x[r]*w;
   const before=done?s.x.slice(0,r).reduce((sum,v,i)=>sum+v*D.weights[i][c],0):s.sums[c];
   put('XREG',['输入寄存器','x = '+s.x[r]],['hw-data']);
   put('WREG',['权重寄存器',s.installed>r?'w = '+w:'未安装'],s.installed>r?['hw-data']:mask());
   put('MULT',['乘法器',productReady?`${s.x[r]} × ${w} = ${product}`:'等待输入'],productReady?['hw-current']:[]);
   put('ACC',['列累加寄存器','旧值 = '+before],['hw-computed']);
   put('ADD',['加法器',done?`${before} + ${product} = ${before+product}`:'等待乘积'],done?['hw-current']:[]);
   put('OUT',['本项执行后的部分和',done?before+product:'等待'],done?['hw-computed']:[]);
  }
  if(key==='sxm'){
   const perm=[1,3,0,2];for(let i=0;i<4;i++){
    put('IN'+i,['lane '+i,s.x[i]],['hw-data']);put('OUT'+i,['输出 '+i,s.step>i?s.x[perm[i]]:'等待'],s.step>i?['hw-computed',...(s.step===i+1?['hw-active']:[])]:[]);
   }
   put('PERM','目的位置取输入 lane [1, 3, 0, 2]',['hw-active']);
  }
  if(key==='kv'){
   const query=queryOverride===null||queryOverride===undefined?(s.chapter===7?s.query:s.kvCount-1):queryOverride;
   let value=0,normalizer=0;for(let i=0;i<s.kvCount;i++)if(i<=query){const w=Math.exp((i+1)*.2);normalizer+=w;value+=w*(i+1);}
   for(let i=0;i<8;i++){
    const occupied=i<s.kvCount;const visible=occupied&&i<=query;
    put('P'+i,'位置 '+i,i===query?['hw-picked']:[]);
    for(const kind of['K','V']){
     const read=s.chapter===7&&s.step>=2;const fresh=s.chapter===9&&i===s.kvCount-1&&s.step%2===1;
     put(kind+i,[kind+'['+i+']',occupied?format(kind==='K'?(i+1)*.2:i+1):'空'],!occupied?mask():read&&!visible?mask():fresh?['hw-current','hw-active']:read&&visible?live():['hw-computed']);
    }
    const scored=s.chapter===7?s.step>=2:s.fed>0,weighted=s.chapter===7?s.step>=4:s.fed>0;
    put('SCORE'+i,['Q·K'+i,scored&&occupied?(visible?format((i+1)*.2):'屏蔽'):'等待'],occupied&&visible&&scored?['hw-data']:mask());
    put('PROB'+i,['权重 p'+i,weighted&&occupied?(visible?format(Math.exp((i+1)*.2)/normalizer):'0'):'等待'],occupied&&visible&&weighted?['hw-computed']:mask());
   }
   put('QUERY',['Q · 位置 '+Math.max(query,0),s.kvCount?'查询 = 1':'等待'],s.kvCount?live():[]);
   put('FETCH',s.kvCount?`可见 ${Math.min(s.kvCount,query+1)} 个位置`:'尚未写入 KV');
   put('RESULT',s.chapter===7&&s.step===4?['Σ P·V',format(value/normalizer)]:s.chapter===9?['新 Token',s.chosen]:['注意力','等待'],s.chapter===7&&s.step===4?['hw-computed']:[]);
  }
  if(key==='decode'){
   Object.assign(p,scene(s,'kv',queryOverride));put('TITLE','逐 Token 生成 · 代表层 KV 与计算资源',['hw-data']);
   put('INPUT',['本轮新输入',s.fed?D.tokens[s.fed-1]:'等待回流'],s.fed?live():[]);put('MIX',['MXM + VXM','读取历史、计算新位置'],['hw-gold']);
   put('RESULT',['注意力输出','交给后续算子']);put('NEXT',['下一个 Token',s.chosen||'等待选择'],s.selected?['hw-computed']:[]);
   put('HOSTBUF',['服务返回缓冲',s.selected>s.sent?s.chosen:'本轮已发送'],s.selected>s.sent?live():[]);put('USERBUF',['用户已经收到',s.answer||'等待'],s.sent?['hw-computed']:[]);
  }
  if(key==='cluster'){
   for(let i=0;i<4;i++){
    const active=s.step===0?i===0:s.step===1?i<2:true;
    for(let r=0;r<3;r++)for(let c=0;c<4;c++)put(`C${i}R${r}L${c}`,c<2?'SRAM':'MAC',active?(c<2?['hw-data']:['hw-gold']):[]);
    put('C'+i+'OUT',active?['激活寄存器',s.sums.join(', ')]:['激活寄存器','等待'],active?live():[]);
   }
   put('C2C',s.step===2?'C2C · 正在传递激活':'C2C · 片间连接',s.step===2?['hw-active','hw-data']:[]);
  }
  if(key==='output'){
   const names=['芯片','集成','它','其他'];const probs=[64,16,12,8];
   names.forEach((n,i)=>put('T'+i,[n,s.step>=1?probs[i]+'%':'等待分数'],s.step>=2&&i===0?['hw-current','hw-active']:[]));
   put('SELECT',s.step>=2?'已选择：芯片':'Token 选择 · 逻辑阶段',s.step===2?['hw-active']:[]);
   put('TOKEN',['ID 寄存器',s.step>=2?'示意 ID 608':'空'],s.step>=2?live():[]);
   put('BYTES',['解码缓冲',s.step>=3?'芯片':'空'],s.step>=3?['hw-computed']:[]);
   for(let i=0;i<4;i++)put('F'+i,s.step===3&&i===0?'芯片':s.step>=4&&i===3?'已发送':'空',s.step===3&&i===0||s.step>=4&&i===3?live():[]);
  }
  return p;
 }
 const exported={scene,format};root.HARDWARE_SCENE=exported;if(typeof module!=='undefined')module.exports=exported;
})(typeof window==='undefined'?globalThis:window);
