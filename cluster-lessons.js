/* UTF-8 · 多片任务与硬件动作。每次跨片运动都绑定发送、物理链路和接收单元。 */
(function(root){
 'use strict';const C=root.GROQ_CLUSTER||(typeof require!=='undefined'?require('./cluster-model.js'):null),P=root.GROQ_PERFORMANCE||(typeof require!=='undefined'?require('./performance-model.js'):null);
 const definitions=[['place','部署分工','权重、层和 KV 应放在哪颗芯片？'],['bind','请求绑定副本','一个请求由哪些芯片共同完成？'],['input','新 ID 到入口芯片','最先进入的是整数 ID 还是隐藏向量？'],['broadcast','同一激活分给本段各片','同一个 Token 怎样让各个分片都开工？'],['attention','本片头计算与 KV 追加','各片分别计算哪些头，历史存在哪里？'],['attn_reduce','合并 Wo 的部分输出','各片输出为何还需要跨片求和？'],['ffn','FFN 通道分别计算','Gate、Up 和 Down 的权重怎样拆分？'],['ffn_reduce','合并 Down 的部分输出','Reduce-scatter 与 All-gather 分别做什么？'],['link','拆开一次 C2C 传输','一个 320 B 向量经过哪些硬件？'],['handoff','交给下一段模型层','阶段之间传的是激活还是所有权重？'],['advance','推进到后续阶段','同一 Token 怎样完成剩余模型层？'],['head','最后阶段做词表投影','分片词表的分数到哪里汇合？'],['return','主机采样与用户接收','怎样把候选分数变成下一枚 Token？'],['feedback','新 Token 回到原副本','下一轮如何复用原来的 KV？'],['overlap','多个请求填入流水线','怎样并发处理独立请求，又保持 Token 依赖？']];
 const phase=(title,explain,focus,packets=[])=>({title,explain,focus,packets,state:{}}),packet=(from,to,label,tone='data',delay=0,wire=null)=>({from,to,label:String(label),tone,delay,...(wire?{wire}: {})});
 const local=(chip,a,b,label,tone='data',delay=0)=>packet('C'+chip+'_'+a,'C'+chip+'_'+b,label,tone,delay);
 const wire=(a,b,label,tone='data',delay=0)=>packet('C'+a+'_TX','C'+b+'_RX',label,tone,delay,{from:a,to:b});
 const focus=(group,key)=>group.map(i=>'C'+i+'_'+key),fmt=a=>'['+a.join(', ')+']';
 function phases(m,id,{vector=0,link=null}={}){
  const {c,group,groups,TP,PP,d}=m,ranks=group.map(i=>m.chips[i]),entry=groups[0][0],last=groups.at(-1),q=c.request,all=m.active.map(x=>x.id),next=groups[c.stage+1]||[],first=id==='link'&&link?link[0]:group[0],second=id==='link'&&link?link[1]:group[1]??next[0]??C.edges.find(e=>e.includes(first)).find(i=>i!==first);
  const common='这是明确选定的教学部署，具体放置由模型编译与运行时安排。';
  switch(id){
   case'place':return[
    phase('先确定副本、流水段和张量分片',m.spec.detail+' 每颗芯片的完整分工列在右侧表格。',['HOST',...focus(all,'TITLE')]),
    phase('各段各片装载自己的权重','这些模型参数在部署时准备，热请求主要传输入与中间激活。词嵌入与末段词表在不同位置需要各自可访问的副本。',focus(all,'W'),all.flatMap((i,k)=>[packet('HOST','C'+i+'_W','权重分片','weight',k*.08),packet('HOST','C'+i+'_PROG','已编译指令','control',.25+k*.05)])),
    phase('给 KV 保留请求、层和头的地址','KV 的索引包括请求、模型层、KV 头、Token 位置。不同请求的缓存有独立归属。',focus(all,'KV')),
    phase('编译时序包含计算和 Send / Receive','ICU 消费编排好的指令。同步和 Deskew 配合片间传输；每个教学片段不等于真实时钟周期。',focus(all,'ICU'),all.map(i=>local(i,'ICU','TX','Send / Receive','control')))
   ];
   case'bind':return[
    phase('主机接收请求 '+q,m.spec.groups.length===2?'A 固定使用 0、2 号芯片，B 固定使用 1、3 号芯片；切换查看请求不会搬迁缓存。':'这个副本的全部模型分片共同服务请求 '+q+'。不同 Token 会复用同一组分片和 KV。',['REQUEST'+q,'HOST']),
    phase('绑定副本 '+m.replica,'先选能运行这个模型、且有该请求状态的副本。Token 的计算将随模型分工跨片完成。',['HOST',...focus(all,'TITLE')],[packet('REQUEST'+q,'HOST','请求 '+q)]),
    phase('确定入口芯片 TSP '+entry,'整数 ID 先提交到这个副本的入口。流水段与同层分片依次接收它对应的激活。',['HOST','C'+entry+'_PCIE'],[packet('HOST','C'+entry+'_PCIE','ID 任务')]),
    phase('保持后续 Decode 的缓存归属','本例不做 KV 迁移。下一枚 Token 会回到同一副本，已有历史仍在各层与各头的拥有者上。',focus(all,'KV'))
   ];
   case'input':return[
    phase('主机 DRAM 保存整数 ID',`本轮 B×T×4 = ${P.bytes(d.B*d.T*4)}。${m.p.mode==='decode'?'T=1，只输入新 ID。':'Prefill 一次准备整段 T=S 个位置。'}`,['HOST','REQUEST'+q]),
    phase('ID 通过 PCIe / DMA 进入入口 MEM','PCIe 属于主机接口；后面的芯片间激活传输使用 C2C。',['C'+entry+'_PCIE','C'+entry+'_INPUT'],[packet('HOST','C'+entry+'_PCIE',P.bytes(d.B*d.T*4)),local(entry,'PCIE','INPUT','int32 IDs','data',.25)]),
    phase('MEM 根据 ID 查词嵌入表','每个 ID 取出 D 个 FP16 数值。模型中的一个 Token 现在对应一行隐藏激活。',['C'+entry+'_W','C'+entry+'_INPUT'],[local(entry,'W','INPUT','X [T,D]')]),
    phase('入口准备本轮激活 X',`X 的大小为 B×T×D×2 = ${P.bytes(m.activation)}，将按本段模型分片分发。`,['C'+entry+'_INPUT'])
   ];
   case'broadcast':{
    if(TP===1)return[phase('本段只有一片，输入已在本地','此部署按模型层切分，本段不需要张量分片之间的输入广播。',focus(group,'INPUT')),phase('本片开始自己的层','后续需要把该段完整隐藏激活交给下一流水阶段。',focus(group,'W'))];
    const out=[phase('本段入口已有完整 X',`本段 ${TP} 片要分别计算不同权重分片，都需要同一输入 X。这里沿固定环方向依次复制。`,focus([first],'INPUT'))];
    for(let r=1;r<TP;r++)out.push(phase('TSP '+group[r-1]+' 复制 X 给 TSP '+group[r],`传送 ${P.bytes(m.activation)} 的激活；前一跳接收后再转发。权重保留在各自 MEM。`,focus([group[r-1],group[r]],'INPUT'),[wire(group[r-1],group[r],q+' · X')]));
    out.push(phase('本段各片有相同输入，权重分工不同','这为按头和通道的并行计算准备了操作数。',focus(group,'INPUT')));return out;
   }
   case'attention':return[
    phase('各片从 MEM 读取本地权重',ranks.map(ch=>`TSP ${ch.id}：Q 头 ${ch.headStart}—${ch.headEnd-1}；KV 头 ${ch.kvHeads.join(',')}`).join('。')+'。',focus(group,'W'),group.map(i=>local(i,'W','MAC','本片 QKV 权重','weight'))),
    phase('MXM 分别生成自己的 Q / K / V','Q 头由各片分担；若多个分片使用同一 GQA 的 KV 头，本例复制该头的 K/V 权重与历史。',focus(group,'MAC'),group.map(i=>local(i,'INPUT','MAC',q+' · x[t]'))),
    phase('旋转 K 后，向本片 KV 追加新位置',`本轮新增 T=${d.T} 个位置。历史 ${m.p.mode==='decode'?d.S-1:0} 个位置保持；缓存仍属于请求 ${q}。`,focus(group,'KVNEW'),group.flatMap(i=>[local(i,'ALU','KVNEW','新 K','result'),local(i,'MAC','KVNEW','新 V','data',.22)])),
    phase('局部 Attention 与 Wo 产生部分输出','QK、Softmax、PV 使用本片负责的头。Wo 按输入行切分，每片输出一个完整 D 维的部分和，接着要跨片求和。',focus(group,'MAC'),group.map(i=>local(i,'ALU','MAC','P × V / Wo','result')))
   ];
   case'attn_reduce':case'ffn_reduce':return m.ring.map(t=>phase(t.title,t.kind==='partial'?`每片的 FP32 部分和大小都是 ${P.bytes(m.partial)}。图下用 4 个数演示求和，不能直接把各片结果拼接。`:t.kind==='reduce'?'每片发送一个块，接收端 VXM 把收到的值加到本地对应块。经历 P−1 轮后，每片拥有一个完整求和块。':t.kind==='gather'?'交换已经求和的块，只复制，不再相加。经历 P−1 轮后，每片获得完整向量。':TP===1?'本段没有跨片求和，直接进入残差与后续算子。':'结果在所有参与芯片一致；在这里加一次残差并转换为后续使用的激活精度。',focus(group,t.kind==='reduce'?'SUM':t.kind==='gather'?'RX':'MAC'),t.kind==='partial'?group.map(i=>local(i,'MAC','INPUT','FP32 部分和','result')):t.moves.map((v,k)=>({...wire(v.from,v.to,'块 '+v.chunk+' '+fmt(v.values),'result',k*.06),from:'C'+v.from+'_INPUT',to:'C'+v.to+'_INPUT',wire:{from:v.from,to:v.to,reduce:v.add}}))));
   case'ffn':return[
    phase('Gate / Up 按输出通道切分',ranks.map(ch=>`TSP ${ch.id}：FFN 通道 ${ch.ffStart}—${ch.ffEnd-1}`).join('。')+'。',focus(group,'W')),
    phase('MXM 计算本地 Gate 和 Up','Wg、Wu 的列分片与同一份 X 相乘。各片只产生 F/P 个通道的中间激活。',focus(group,'MAC'),group.map(i=>local(i,'W','MAC','Wg / Wu 分片','weight'))),
    phase('VXM 计算 SiLU(gate) × up','非线性与逐元素乘在拥有这些 FFN 通道的芯片上完成。',focus(group,'ALU'),group.map(i=>local(i,'MAC','ALU','Gate / Up'))),
    phase('Down 按输入行分片，产生 D 维部分和','每片把自己的 F/P 维结果乘 Wd 的对应行，得到 FP32 部分和；下一步 All-reduce 完成合并。',focus(group,'MAC'),group.map(i=>local(i,'ALU','MAC','Down 部分和','result')))
   ];
   case'link':{
    const t=m.transfer(m.activation),v=Math.max(0,Math.min(vector,t.slots-1)),use=Math.min(320,t.payload-v*320),window=Math.floor(v/t.windowSlots)+1;
    return[phase('源 MEM 读出第 '+(v+1)+' / '+t.slots+' 个向量',`字节偏移 ${v*320}；本槽有效 ${use} B，教学填充 ${320-use} B；属于接收窗口 ${window}/${t.windows}。`,['C'+first+'_INPUT','C'+first+'_TX'],[local(first,'INPUT','TX','向量 '+v)]),phase('Send 经 SerDes 和物理链路发送',`TSP ${first} → TSP ${second}，有效单向带宽 ${P.num(m.bandwidth/1e9)} GB/s。320 B 是向量指令粒度，线上编码与协议损耗归入有效率。`,['C'+first+'_SER_TX','C'+second+'_SER_RX'],[wire(first,second,'向量 '+v+' · 320 B')]),phase('接收端对齐，写入接收缓冲','SerDes 还原数据；同步、Deskew 与软件节奏配合，安排接收方何时可消费。四个槽只是缓冲窗口的可见示意。',['C'+second+'_SER_RX','C'+second+'_RX'],[local(second,'SER_RX','RX','已接收'),local(second,'RX','FIFO'+v%4,'槽 '+v,'data',.2)]),phase('Receive 将有效数据写入目的 MEM','接收完成后才允许该向量被目的算子使用。较大张量跨多个窗口发送，额外等待预算在右侧单列。',['C'+second+'_INPUT'],[local(second,'FIFO'+v%4,'INPUT',use+' B 有效数据','result')])];
   }
   case'handoff':return next.length?[
    phase('本段最后一层的激活就绪',`本段包含层 ${ranks[0].layerStart+1}—${ranks[0].layerEnd}。阶段边界的激活为 ${P.bytes(m.activation)}，KV 留在原阶段。`,focus(group,'INPUT')),
    phase('匹配下一阶段的输入拥有者',m.handoffs.map(x=>`TSP ${x.from} → ${x.to}`).join('；')+'。同层归约后的激活已在本段各片复制。',focus(group,'TX')),
    phase('C2C 传递隐藏激活',`本次有 ${m.handoffs.length} 条并发传输。右侧按最慢路径计时间，另列全部发送字节。`,focus(next,'RX'),m.handoffs.map((x,k)=>wire(x.from,x.to,q+' · X_next','data',k*.12))),
    phase('下一阶段 MEM 已准备好 X','目的芯片用自己的后续层权重开始计算。源阶段继续保留本请求的历史 KV。',focus(next,'INPUT'),next.map(i=>local(i,'RX','INPUT','X_next','result')))
   ]:[phase('本阶段已经是最后一段','本部署没有下一个流水阶段，因此此处跨阶段字节和时间为 0。',focus(group,'INPUT')),phase('继续最终归一化和词表头','同层张量分片仍按选定方式完成后续输出计算。',focus(group,'MAC'))];
   case'advance':return[phase(next.length?'进入下一段后，重复本地计算与两次归约':'所有流水阶段完成',next.length?'点击“下一步”会把当前执行段推进一级，并回到 Attention；四颗芯片仍留在原位置。':'继续末段的词表投影与主机采样。',focus(next.length?next:group,'TITLE')),phase('权重与缓存的位置保持',common,focus(all,'KV'))];
   case'head':return[
    phase('最后阶段拿到最后有效位置',`最终预测使用 B×D 个激活；Prefill 无需为所有 S 个位置都输出词表分数。`,focus(last,'INPUT')),
    phase('各片计算自己的词表候选范围',`本例最后阶段按词表列切分；每片负责 ${d.V/last.length} 个候选分数。`,focus(last,'MAC'),last.map(i=>local(i,'INPUT','MAC','词表投影'))),
    phase('FP32 logits 经各自 PCIe 返回主机',`合计 B×V×4 = ${P.bytes(d.B*d.V*4)}。这里选择主机采样，分片的候选在主机按词表位置汇合。`,['HOST',...focus(last,'PCIE')],last.flatMap((i,k)=>[local(i,'MAC','PCIE','logits 分片','result'),packet('C'+i+'_PCIE','HOST','logits 分片','result',.25+k*.1)])),
    phase('主机得到完整候选范围','词表候选在这里按索引汇合；前面的 Wo / Down 部分和则需要求和，两者不是同一种合并。',['HOST'])
   ];
   case'return':return[
    phase('候选分数已汇合','主机执行本页选定的采样逻辑。这里的词表分布与 Attention 内部的 Softmax 是不同对象。',['HOST']),
    phase('选择下一枚 Token ID','演示选择 ID 608；片段“芯片”为预设内容，不是这个网页运行真实模型生成。',['HOST','TOKEN'],[packet('HOST','TOKEN','ID 608','result')]),
    phase('增量解码并发送','把已选择的 ID 转为可输出片段，经服务连接发给用户。',['TOKEN','USER'],[packet('TOKEN','USER','芯片','result')]),
    phase('用户收到当前片段','只有在这一轮预测完成后，同一请求的下一轮输入 ID 才已确定。',['USER'])
   ];
   case'feedback':return[
    phase('新 ID 仍属于请求 '+q,`继续使用副本 ${m.replica}；不会因为轮到下一枚 Token 就丢弃或换一组 KV。`,['TOKEN',...focus(all,'KV')]),
    phase('仅给入口提交新 ID',`输入变为 B×1×4 B；TSP ${entry} 先查嵌入，后续片间再传递相应隐藏激活。`,['C'+entry+'_PCIE'],[packet('TOKEN','C'+entry+'_PCIE','新 ID 608')]),
    phase('历史保持，追加操作留到本轮计算',`旧有效长度 S=${d.S} 保持；新的 K/V 尚未计算，不能提前把缓存长度加一。`,focus(all,'KV')),
    phase('可以开始下一轮 Decode','点击底部“下一轮 Decode”，上下文增加 1，回到新输入；每个阶段随后只追加一个位置。',['C'+entry+'_INPUT'])
   ];
   case'overlap':return m.pipelineSlots.map(t=>phase('调度槽 '+(t.slot+1)+' / '+m.pipelineSlots.length,`每格是示意调度槽，不是等长真实耗时。${t.jobs.map(j=>`${j.request} 请求在第 ${j.stage+1} 段`).join('；')}。只并发独立请求，不预先执行同一请求尚未采样的下一枚 Token。`,t.jobs.flatMap(j=>focus(j.chips,'MAC')),t.jobs.filter(j=>j.stage>0).flatMap(j=>j.chips.map((to,r)=>wire(groups[j.stage-1][r]??groups[j.stage-1][0],to,'请求 '+j.request)))));
  }return[];
 }
 function patch(m,id,phaseIndex,{vector=0,link=null,settled=true}={}){
  const out={},put=(key,label,classes=[])=>out[key]={label:Array.isArray(label)?label:[label],classes},idx=definitions.findIndex(x=>x[0]===id),decoded=m.p.mode==='decode';
  for(const ch of m.chips){const key='C'+ch.id+'_';put(key+'TITLE',`TSP ${ch.id} · 硬件功能区域`,ch.active?['hw-active']:['hw-idle']);put(key+'W',[`权重数据`,P.bytes(ch.weights)],idx>0||phaseIndex>=1?['hw-gold']:[]);
   const complete=m.valid&&ch.active&&(idx>=11||ch.stage<m.c.stage&&idx>=4||ch.stage===m.c.stage&&(idx>4||idx===4&&(phaseIndex>2||phaseIndex===2&&settled))),length=complete?m.d.S:decoded?m.d.S-1:0,arrived=m.valid&&ch.active&&(idx>=11||ch.stage<m.c.stage&&idx>=4||ch.stage===m.c.stage&&idx>=3||id==='input'&&ch.id===m.groups[0][0]&&(phaseIndex>2||phaseIndex===2&&settled)||ch.stage===m.c.stage+1&&id==='handoff'&&phaseIndex>=3&&settled);
   put(key+'KV',['KV '+ch.kvHeads.join(','),`历史长度 ${length}`],complete?['hw-computed']:['hw-data']);put(key+'KVNEW',complete?[`请求 ${m.c.request}`,`已追加 ${m.d.T} 个`]:['追加位置','尚未写入'],complete?['hw-computed']:[]);put(key+'INPUT',arrived?['X [T,D]',m.c.request+' 请求']:['输入激活','等待'],ch.active&&idx>=3?['hw-data']:[]);
   if(!ch.active){put(key+'KV',['独立请求 KV','本请求不访问']);put(key+'KVNEW',['缓存隔离','未进入此视角']);}
   put(key+'MAC','MAC');put(key+'SUM',['归约 ALU','同一 VXM']);put(key+'ICU',ch.active?['ICU / SYNC','计划执行']:['独立副本','此视角未演示']);
  }
  if(['attn_reduce','ffn_reduce'].includes(id)){const current=m.ring[Math.min(phaseIndex,m.ring.length-1)],t=!settled&&['reduce','gather'].includes(current.kind)?m.ring[phaseIndex-1]:current;m.group.forEach((i,r)=>{put('C'+i+'_INPUT',current.kind==='partial'&&!settled?['部分和','等待写入']:['Σ 块',String(t.values[r][0])],t.kind==='complete'?['hw-computed']:['hw-gold']);if(current.kind==='partial')put('C'+i+'_MAC',String(t.values[r][0]),['hw-gold']);put('C'+i+'_SUM',[t.kind==='gather'?'复制完整块':t.kind==='reduce'?'接收 + 本地块':'部分和状态',t.known[r].map((v,k)=>v?'块'+k+'✓':'').filter(Boolean).join(' ')||'等待跨片求和'],t.kind==='reduce'?['hw-current']:[]);});}
  if(id==='broadcast'){m.group.forEach((i,r)=>put('C'+i+'_INPUT',(r===0||r<phaseIndex||r===phaseIndex&&settled)?[m.c.request+' · X','副本已到达']:['X','等待前一跳'],r<=phaseIndex?['hw-data']:[]));}
  if(id==='link'){const from=link?.[0]??m.group[0],to=link?.[1]??m.group[1]??m.groups[m.c.stage+1]?.[0]??C.edges.find(e=>e.includes(from)).find(i=>i!==from),t=m.transfer(m.activation),v=Math.min(vector,t.slots-1),ready=phaseIndex>2||phaseIndex===2&&settled;put('C'+to+'_INPUT',phaseIndex===3&&settled?['本向量已写入',Math.min(320,t.payload-v*320)+' B 有效数据']:['本向量待写入','字节 '+v*320]);put('C'+from+'_TX',['向量 '+v,'320 B 槽位'],phaseIndex>=1?['hw-data']:[]);put('C'+to+'_RX',ready?['向量 '+v,'对齐完成']:['接收缓冲','等待']);for(let j=0;j<4;j++)put('C'+to+'_FIFO'+j,ready&&j===v%4?'✓':'·',phaseIndex>=2&&j===v%4?['hw-computed']:[]);}
  if(id==='overlap'){const t=m.pipelineSlots[phaseIndex];for(const j of t.jobs)for(const i of j.chips)put('C'+i+'_MAC',['请求 '+j.request,'当前 Token'],['hw-current']);}
  if(!m.valid){for(const ch of m.chips){put('C'+ch.id+'_W',['所需权重',P.bytes(ch.weights)],ch.fits?[]:['hw-mask']);put('C'+ch.id+'_KV',['KV 布局','未验证装入']);put('C'+ch.id+'_KVNEW',['容量不满足','机制演示']);put('C'+ch.id+'_INPUT',['布局推演','未装入设备']);}}
  put('TOKEN',idx>12||id==='return'&&(phaseIndex>1||phaseIndex===1&&settled)?'Token ID 608':'等待采样');put('USER',idx>12||id==='return'&&phaseIndex===3&&settled?'已收到：芯片':'用户接收缓冲');return out;
 }
 const canNextToken=(m,id,phase,settled)=>m.valid&&m.d.S<32768&&(id==='feedback'||id==='return'&&(phase>1||phase===1&&settled));
 const api={definitions,phases,patch,canNextToken};root.GROQ_CLUSTER_LESSONS=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
