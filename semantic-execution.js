/* UTF-8 · 可回退的语义事件；数学算例与硬件实机时序严格区分。 */
(function(root){
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),mm=(x,w)=>w[0].map((_,j)=>dot(x,w.map(r=>r[j])));
const rms=x=>{const r=1/Math.sqrt(dot(x,x)/x.length+1e-6);return x.map(v=>v*r);};
const sigmoid=x=>1/(1+Math.exp(-x)),silu=x=>x*sigmoid(x);
const softmax=x=>{const e=x.map(v=>Math.exp(v-Math.max(...x))),sum=e.reduce((a,b)=>a+b,0);return e.map(v=>v/sum);};
const raw=[2,-1,3,1],WG=[[1,0,-2],[3,1,1],[4,-1,0],[0,2,2]],WU=[[0,1,1],[1,0,-1],[1,1,0],[2,-1,1]],WD=[[1,0,1,-1],[0,2,1,0],[1,1,0,2]];
function ffn(x=rms(raw),wg=WG){const g=mm(x,wg),u=mm(x,WU),h=g.map((v,i)=>silu(v)*u[i]);return{x,g,u,h,y:mm(h,WD)};}
const WQ=[[.5,0],[0,0],[0,0],[0,2]],WK=[[.5,0],[0,0],[0,0],[0,1]],WV=[[1,0],[0,0],[0,0],[0,0]];
function attention(){const x=rms(raw),qr=mm(x,WQ),kr=mm(x,WK),v=mm(x,WV),qn=rms(qr),kn=rms(kr),q=[-qn[1],qn[0]],k=[-kn[1],kn[0]],K=[[1,0],[0,1],k],V=[[1,2],[-1,1],v],scores=K.map(ki=>dot(q,ki)/Math.sqrt(2)),p=softmax(scores);return{x,qr,kr,v,qn,kn,q,k,K,V,scores,p,y:mm(p,V)};}
class Program{
 constructor(type,title,basis){this.type=type;this.title=title;this.basis=basis;this.objects={};this.events=[];this.meta={};}
 object(id,label,rows,hint=''){this.objects[id]={id,label,rows:clone(rows),hint};return this;}
 event(name,unit,instruction,equation,options={}){const prev=this.events.at(-1);this.events.push({index:this.events.length,name,unit,instruction,equation,objects:clone(this.objects),focus:[],view:Object.keys(this.objects),valid:false,read:[],write:[],...options});return this;}
}
const num=v=>typeof v==='number'?(Number.isInteger(v)?String(v):Number(v.toPrecision(6)).toString()):String(v??'未写入');
function matrix(p,input,weights,out,unit='MXM',title='矩阵乘'){
 const x=p.objects[input].rows[0],w=p.objects[weights].rows,M=w[0].length;
 p.object(out,title+' 输出', [Array(M).fill(null)]).object('reg','操作数 / 累加器',[[null,null,null,0]],'a / b / product / acc');
 for(let j=0;j<M;j++){
  p.objects.reg.rows=[[null,null,null,0]];p.event('清空输出列 '+j+' 的累加器',unit,'ACC ← 0','y['+j+'] 尚未写入',{view:[input,weights,'reg',out],write:['acc'],focus:[{id:out,r:0,c:j,role:'pending'}]});
  for(let k=0;k<x.length;k++){
   const before=p.objects.reg.rows[0][3];p.objects.reg.rows[0]=[x[k],w[k][j],null,before];
   p.event('读操作数 k='+k+'，输出列 j='+j,'MEM','a ← x['+k+']; b ← W['+k+','+j+']','acc 保持 '+num(before),{view:[input,weights,'reg',out],read:[input+'[0,'+k+']',weights+'['+k+','+j+']'],write:['a','b'],focus:[{id:input,r:0,c:k,role:'read'},{id:weights,r:k,c:j,role:'read'},{id:'reg',r:0,c:3,role:'hold'}]});
   const product=x[k]*w[k][j],after=before+product;p.objects.reg.rows[0]=[x[k],w[k][j],product,after];
   p.event('乘加 k='+k+'，累加器提交',unit,'acc ← acc + a × b',num(before)+' + '+num(x[k])+' × '+num(w[k][j])+' = '+num(after),{view:[input,weights,'reg',out],read:['a','b','acc'],write:['acc'],focus:[{id:'reg',r:0,c:0,role:'read'},{id:'reg',r:0,c:1,role:'read'},{id:'reg',r:0,c:2,role:'write'},{id:'reg',r:0,c:3,role:'write'}],arithmetic:{a:x[k],b:w[k][j],before,product,after}});
  }
  p.objects[out].rows[0][j]=p.objects.reg.rows[0][3];p.event('输出列 '+j+' 写回','MEM','y['+j+'] ← acc','只写入已累加完成的一列',{view:[input,weights,'reg',out],read:['acc'],write:[out+'[0,'+j+']'],focus:[{id:out,r:0,c:j,role:'write'}],valid:j===M-1});
 }
}
function tokenProgram(c){
 const p=new Program('tokenize','逐个揭示官方分词结果','字片 / ID 来自固定官方 Tokenizer；揭示顺序不模拟 BPE 合并实现。');
 p.object('tokens','结果序列',[Array(c.s.tokens.length).fill(null)]).object('ids','Token ID',[Array(c.s.tokens.length).fill(null)]);
 let pos=0,byte=0;p.meta.prompt=c.s.prompt;p.meta.tokens=c.s.tokens.map(t=>{const start=pos,byteStart=byte;pos+=t.text.length;byte+=new TextEncoder().encode(t.text).length;return{...t,start,end:pos,byteStart,byteEnd:byte};});
 p.event('原文保留，结果序列为空','CPU','results ← []','已得到 0 / '+c.s.tokens.length+' 个正文 Token',{revealed:0,activeToken:-1});
 p.meta.tokens.forEach((t,i)=>{
  p.event('定位第 '+(i+1)+' 个字片「'+t.text+'」','CPU','定位已核对的字片范围','原文字符 ['+t.start+','+t.end+')；UTF-8 字节 ['+t.byteStart+','+t.byteEnd+')',{revealed:i,activeToken:i,read:['Prompt['+t.start+':'+t.end+']']});
  p.objects.tokens.rows[0][i]=t.text;p.objects.ids.rows[0][i]=t.id;
  p.event('追加 Token '+i+' = '+t.id,'CPU','results.append('+t.id+')','「'+t.text+'」 → '+t.id,{revealed:i+1,activeToken:i,write:['results['+i+']'],focus:[{id:'tokens',r:0,c:i,role:'write'},{id:'ids',r:0,c:i,role:'write'}],valid:i===c.s.tokens.length-1});
 });
 p.object('template','模板输入 ID · 按行排列',[c.s.contextIds.slice(0,9),c.s.contextIds.slice(9)],'包含角色、换行与生成前缀');
 p.event('正文分词完成，按模板组装输入','CPU','apply_chat_template(think=false)','6 个正文 Token + 模板位置 → '+c.s.contextIds.length+' 个输入 Token',{view:['template'],revealed:c.s.tokens.length,activeToken:-1,valid:true,write:['input_ids[0:'+c.s.contextIds.length+']']});return p;
}
function normProgram(title,input=raw){const p=new Program('norm',title,'缩小数值算例；显示求和依赖，不声称 VXM 采用此串行归约结构。');p.object('x','输入 x',[input]).object('sq','x²',[input.map(()=>null)]).object('stat','归约状态',[[0,null,null]],'sum / mean / inverse RMS').object('y','输出',[input.map(()=>null)]);let sum=0;
 input.forEach((v,i)=>{p.objects.sq.rows[0][i]=v*v;sum+=v*v;p.objects.stat.rows[0][0]=sum;p.event('平方并累积元素 '+i,'VXM','sum ← sum + x['+i+']²',num(v)+'²；sum = '+num(sum),{read:['x['+i+']'],write:['sum'],focus:[{id:'x',r:0,c:i,role:'read'},{id:'sq',r:0,c:i,role:'write'}]});});
 const mean=sum/input.length,inv=1/Math.sqrt(mean+1e-6);p.objects.stat.rows=[[sum,mean,inv]];p.event('求均值与倒平方根','VXM','inv ← 1 / sqrt(sum / N + ε)','ε = 0.000001；inv = '+num(inv),{write:['inv'],focus:[{id:'stat',r:0,c:2,role:'write'}]});
 input.forEach((v,i)=>{p.objects.y.rows[0][i]=v*inv;p.event('写回归一化元素 '+i,'VXM','y['+i+'] ← x['+i+'] × inv × γ['+i+']','算例 γ = 1；'+num(v)+' × '+num(inv)+' = '+num(v*inv),{write:['y['+i+']'],focus:[{id:'y',r:0,c:i,role:'write'}],valid:i===input.length-1});});return p;}
function softmaxProgram(values=attention().scores){const p=new Program('softmax','Softmax：最大值 → 指数 → 分母 → 归一化','与本页缩小 QK / PV 算例共用同一组分数；显示数学值，未模拟芯片舍入。');p.object('score','QK / √d',[values]).object('exp','exp(score − max)',[values.map(()=>null)]).object('stat','归约状态',[[null,0]],'max / sum').object('p','概率',[values.map(()=>null)]);let max=-Infinity;
 values.forEach((v,i)=>{max=Math.max(max,v);p.objects.stat.rows[0][0]=max;p.event('更新最大值 '+i,'VXM','m ← max(m, score['+i+'])','m = '+num(max),{read:['score['+i+']'],write:['max'],focus:[{id:'score',r:0,c:i,role:'read'}]});});
 let sum=0;values.forEach((v,i)=>{const e=Math.exp(v-max);sum+=e;p.objects.exp.rows[0][i]=e;p.objects.stat.rows[0][1]=sum;p.event('指数并累加分母 '+i,'VXM','e['+i+'] ← exp(score['+i+'] − m); sum += e['+i+']','exp('+num(v)+' − '+num(max)+') = '+num(e),{write:['exp['+i+']','sum'],focus:[{id:'exp',r:0,c:i,role:'write'}]});});
 values.forEach((v,i)=>{const y=p.objects.exp.rows[0][i]/sum;p.objects.p.rows[0][i]=y;p.event('归一化并写回 '+i,'VXM','p['+i+'] ← e['+i+'] / sum',num(p.objects.exp.rows[0][i])+' / '+num(sum)+' = '+num(y),{write:['p['+i+']'],focus:[{id:'p',r:0,c:i,role:'write'}],valid:i===values.length-1});});return p;}
function kvProgram(){const a=attention(),p=new Program('kv','KV：写入新位置后，才提交可见长度','缩小 Attention 算例：已存在 2 个位置，本轮只追加第 3 个；不覆盖旧值。');p.object('k','本轮 K',[a.k]).object('v','本轮 V',[a.v]).object('K','K Cache',[...a.K.slice(0,2),[null,null]]).object('V','V Cache',[...a.V.slice(0,2),[null,null]]).object('state','提交状态',[[2,0,0]],'可见长度 / K ready / V ready');p.event('分配位置 2，旧两项仍有效','MEM','slot ← visible_length','visible_length = 2',{valid:false});p.objects.K.rows[2]=a.k;p.objects.state.rows[0][1]=1;p.event('只写入新 K','MEM','K[2,:] ← k','K ready=1，V ready=0；可见长度仍为 2',{write:['K[2,:]'],focus:a.k.map((_,i)=>({id:'K',r:2,c:i,role:'write'}))});p.objects.V.rows[2]=a.v;p.objects.state.rows[0][2]=1;p.event('写入新 V','MEM','V[2,:] ← v','两份数据均到达，尚未提交新长度',{write:['V[2,:]'],focus:a.v.map((_,i)=>({id:'V',r:2,c:i,role:'write'}))});p.objects.state.rows[0][0]=3;p.event('提交新位置，后续 QK / PV 可访问','MEM','visible_length ← 3','新位置仅在 K / V 都就绪后对后续操作可见',{valid:true,write:['visible_length'],focus:[{id:'state',r:0,c:0,role:'write'}]});return p;}
function transferProgram(step,c){
 const p=new Program('transfer','传输：分段接收 → 完整负载 → 允许消费','8 B 小端 BF16 / 每段 4 B；valid / ready 和逐跳收齐再转发均为逻辑算例，不代表实际网络协议。');
 const buf=new ArrayBuffer(4),v=new DataView(buf),bytes=[];for(const n of raw){v.setFloat32(0,n,true);const bits=v.getUint32(0,true)>>>16;bytes.push(bits&255,bits>>>8);}
 const route=step.path||[step.from,step.to],beat=4,total=bytes.length;p.meta={route,payload:bytes,total,beat,logicalVectors:c.D*2/320};
 p.object('src','源负载：4 个 BF16',[raw],'8 B 数值算例，非实际模型负载').object('wire','当前分段：十六进制字节',[Array(beat).fill(null)]).object('rx','接收缓冲',[Array(total).fill(null)]).object('bus','接口状态',[[0,0,0,0]],'valid / ready / 本跳已接收 B / consumer ready');
 p.event('准备描述符，目的端不可消费','NETWORK','desc = {request:A, layer:ℓ, offset:0, length:8}','仅示例描述符；真实消息字段未知',{hop:0,received:0,total,write:['descriptor'],valid:false});
 for(let hop=0;hop<route.length-1;hop++){
  p.objects.rx.rows=[Array(total).fill(null)];p.objects.bus.rows=[[0,0,0,0]];
  p.event('开始一跳：'+route[hop]+' → '+route[hop+1],'NETWORK','RX valid ← 0; received ← 0','本跳收齐前，不交给下一跳或计算资源',{hop,received:0,total});
  for(let off=0;off<total;off+=beat){const chunk=bytes.slice(off,off+beat).map(b=>b.toString(16).padStart(2,'0').toUpperCase());p.objects.wire.rows=[chunk];p.objects.bus.rows=[[1,0,off,0]];
   p.event('分段 '+off+' 已准备，接收背压','NETWORK','valid=1; ready=0 → 不接受','payload 与 offset 保持；接收缓冲不改变',{hop,received:off,total,stalled:true,read:['TX['+off+':'+(off+beat)+']'],focus:chunk.map((_,i)=>({id:'wire',r:0,c:i,role:'hold'}))});
   chunk.forEach((b,i)=>p.objects.rx.rows[0][off+i]=b);p.objects.bus.rows=[[1,1,off+chunk.length,0]];
   p.event('握手成功，接收分段 '+off,'NETWORK','accept = valid && ready; RX[offset:offset+4] ← payload','本跳已接收 '+(off+chunk.length)+' / '+total+' B',{hop,received:off+chunk.length,total,accepted:true,read:['wire'],write:['RX['+off+':'+(off+chunk.length)+']'],focus:chunk.map((_,i)=>({id:'rx',r:0,c:off+i,role:'write'}))});
  }
  p.objects.bus.rows=[[0,1,total,1]];p.event('本跳负载完整，提交有效标记','NETWORK','consumer_ready ← received == length',hop===route.length-2?'最终目的端现在可读取完整负载':'当前节点现在可以把完整负载交给下一跳',{hop,received:total,total,valid:hop===route.length-2,hopComplete:true,write:['consumer_ready'],focus:[{id:'bus',r:0,c:3,role:'write'}]});
 }
 return p;
}
function semanticProgram(step,c,state={}){
 const id=step.id,a=attention(),f=ffn();let p;
 if(id==='tokenize')return tokenProgram(c);
 if(['gpu-egress','gpu-return','afd','tray','return'].includes(id))return transferProgram(step,c);
 if(id==='gateup'||id==='qkv'||id==='deltaproj'||id==='qk'||id==='pv'||id==='down'||id==='deltaout'||id==='attngate'){
  p=new Program('matrix',step.title,'缩小数值算例；读 / 乘加 / 写回为依赖事件，不是 Groq 机器指令或真实 cycle。');
  if(id==='gateup'){p.object('x','FFN 输入 x = RMSNorm([2,−1,3,1])',[f.x]).object('wg','Wgate · 4 × 3',WG).object('wu','Wup · 4 × 3',WU);matrix(p,'x','wg','g','MXM','Gate');matrix(p,'x','wu','u','MXM','Up');p.meta.chain='FFN：Norm → Gate/Up → SiLU × Up → Down';}
  else if(id==='down'){p.object('h','同一 FFN 算例的 h',[f.h]).object('wd','Wdown · 3 × 4',WD);matrix(p,'h','wd','y','MXM','FFN');}
  else if(id==='qkv'||id==='deltaproj'){p.object('x','归一化输入',[a.x]).object('wq','Wq · 4 × 2',WQ).object('wk','Wk · 4 × 2',WK).object('wv','Wv · 4 × 2',WV);matrix(p,'x','wq','q','MXM','Q');matrix(p,'x','wk','k','MXM','K');matrix(p,'x','wv','v','MXM','V');p.basis+=' 本窗口只展开 Q/K/V 三个投影，额外门控投影见右侧完整模型形状。';}
  else if(id==='qk'){p.object('q','经过 QK Norm / RoPE 的 Q',[a.q]).object('kt','Kᵀ · 历史含本轮',a.K[0].map((_,i)=>a.K.map(r=>r[i])));matrix(p,'q','kt','score','MXM','QK');p.objects.score.rows[0]=a.scores;p.event('按头维度缩放','VXM','scores ← scores / √2','本算例 head_dim=2；真实模型 head_dim='+c.d,{view:['q','kt','score'],write:['scores'],valid:true});}
  else if(id==='pv'){p.object('p','同一 Attention 算例的 Softmax',[a.p]).object('v','V Cache',a.V);matrix(p,'p','v','o','MXM','Attention 加权输出');}
  else{const x=id==='deltaout'?[1.25/Math.sqrt(2),-.5/Math.sqrt(2)]:a.y.map((v,i)=>v*sigmoid(i?.5:-.5));p.object('x','算例输出 / 门控后向量',[x]).object('wo','输出投影 · 2 × 4',[[1,0,1,-1],[0,1,1,1]]);matrix(p,'x','wo','out','MXM','输出投影');}
  return p;
 }
 if(id==='attnnorm'||id==='ffnread'&&!c.flash||id==='finalnorm'&&!c.flash)return normProgram(step.title);
 if(id==='softmax')return softmaxProgram();
 if(id==='kv')return kvProgram();
 if(id==='silu'){p=new Program('vector','SwiGLU：与前一步同一组 Gate / Up','4 → 3 → 4 的连贯 FFN 数值算例；逐元素写回，不用移动粒子代表运算。');p.object('g','Gate 结果',[f.g]).object('u','Up 结果',[f.u]).object('act','SiLU(g)',[f.g.map(()=>null)]).object('h','h = SiLU(g) × u',[f.g.map(()=>null)]);f.g.forEach((v,i)=>{p.objects.act.rows[0][i]=silu(v);p.event('元素 '+i+'：SiLU','VXM','a['+i+'] ← g['+i+'] / (1 + exp(−g['+i+']))','SiLU('+num(v)+') = '+num(silu(v)),{read:['g['+i+']'],write:['act['+i+']'],focus:[{id:'g',r:0,c:i,role:'read'},{id:'act',r:0,c:i,role:'write'}]});p.objects.h.rows[0][i]=f.h[i];p.event('元素 '+i+'：门控乘法并写回','VXM','h['+i+'] ← a['+i+'] × u['+i+']',num(silu(v))+' × '+num(f.u[i])+' = '+num(f.h[i]),{write:['h['+i+']'],focus:[{id:'u',r:0,c:i,role:'read'},{id:'h',r:0,c:i,role:'write'}],valid:i===f.h.length-1});});return p;}
 if(id==='rope'){p=new Program('rope','QK RMSNorm 与二维 RoPE 算例','与本页 QKV / QK 算例相连；选 θ=π/2 展开一对旋转，真实模型只旋转头内前 64 维。');p.object('q','Q',[a.qr]).object('k','K',[a.kr]).object('rot','旋转后的 Q / K',[[null,null],[null,null]]);p.event('Q/K 尚未归一化','MEM','读取投影结果','V 不参与 QK Norm / RoPE',{read:['Q','K']});p.objects.q.rows=[a.qn];p.objects.k.rows=[a.kn];p.event('Q/K 分别按头归一化','VXM','Q ← RMSNorm(Q); K ← RMSNorm(K)','先归一化，再应用位置旋转',{write:['Q','K']});p.objects.rot.rows[0]=a.q;p.event('旋转 Q 的一对元素','VXM','[q0,q1] → [−q1,q0]','cos(π/2)=0；sin(π/2)=1',{write:['Q_rot'],focus:[{id:'rot',r:0,c:0,role:'write'},{id:'rot',r:0,c:1,role:'write'}]});p.objects.rot.rows[1]=a.k;p.event('旋转 K，输出就绪','VXM','[k0,k1] → [−k1,k0]','下一步仅把新的 K/V 写入缓存',{write:['K_rot'],valid:true});return p;}
 if(id==='deltastate'){p=new Program('state','DeltaNet：读旧状态 → 衰减 → rank-1 更新 → 输出','独立单头 2 × 2 数值算例；真实状态 [48,128,128]，本例 β=0.5、exp(g)=0.5。');p.object('s','递推状态 S',[[1,0],[0,1]]).object('qkv','q / k / v',[[1/Math.sqrt(2),0],[1,0],[2,-1]]).object('delta','β(v − kᵀS)',[[null,null]]).object('out','输出 o',[[null,null]]);p.event('读取旧状态','MEM','S_prev → 工作寄存器','此时还不能覆盖输入状态',{read:['S_prev']});p.objects.s.rows=[[.5,0],[0,.5]];p.event('衰减旧状态','VXM','S ← exp(g) S','exp(g)=0.5',{write:['S']});p.objects.delta.rows=[[.75,-.5]];p.event('计算纠正向量','VXM','δ ← β(v − kᵀS)','0.5 × ([2,−1] − [0.5,0]) = [0.75,−0.5]',{read:['k','v','S'],write:['δ']});p.objects.s.rows=[[1.25,-.5],[0,.5]];p.event('rank-1 外积更新并提交状态','VXM','S ← S + k δᵀ','更新第一行；第二行保持',{write:['S'],focus:[{id:'s',r:0,c:0,role:'write'},{id:'s',r:0,c:1,role:'write'}]});p.objects.out.rows=[[1.25/Math.sqrt(2),-.5/Math.sqrt(2)]];p.event('用更新后的状态计算输出','VXM','o ← qᵀ S','q 已包含 1/√2 缩放',{read:['S_new'],write:['o'],valid:true});return p;}
 if(id==='embedding'){p=new Program('embedding','按 Token ID 读词嵌入行','真实 ID 与模型 D；仅用 E[id,d] 表示未加载的权重，不编造模型激活。逻辑地址假设连续 BF16 行。');p.object('id','Token / 逻辑行索引',[[c.token.text,c.token.id]]).object('addr','逻辑元素与字节偏移',[[null,null]]).object('x','展开前 4 个维度',[[null,null,null,null]]);p.event('Token ID 只选择一行','MEM','row ← token_id','词表行 '+c.token.id+'；本行 '+c.D+' 个元素',{read:['token_id']});for(let i=0;i<4;i++){const off=c.token.id*c.D+i;p.objects.addr.rows=[[off,off*2]];p.event('计算维度 '+i+' 的逻辑偏移','MEM','offset = token_id × D + d',c.token.id+' × '+c.D+' + '+i+' = '+off,{read:['token_id','D','d'],write:['logical_offset']});p.objects.x.rows[0][i]='E['+c.token.id+','+i+']';p.event('读取维度 '+i,'MEM','x['+i+'] ← E[token_id,'+i+']','实际数值未加载；这不是物理 HBM 地址',{write:['x['+i+']'],focus:[{id:'x',r:0,c:i,role:'write'}],valid:i===3});}return p;}
 if(id==='router'){const logits=[2,1,0,-1],probs=softmax(logits),alpha=[probs[0]/(probs[0]+probs[1]),probs[1]/(probs[0]+probs[1])];p=new Program('router','路由：Softmax → Top-K → 重新归一化','缩小为 4 专家 / Top-2，编号只属于此数值算例；真实模型是 512 / Top-10。');p.object('logits','算例 router logits',[logits]).object('p','全专家概率',[[null,null,null,null]]).object('top','所选专家 / 归一化权重',[[null,null],[null,null]]);p.event('路由投影完成，读取 logits','MEM','读取本例 logits','真实本句 logits 未计算',{read:['router_logits']});p.objects.p.rows=[probs];p.event('全专家 Softmax','VXM','p ← softmax(logits)','先在所有专家上归一化',{write:['p']});p.objects.top.rows=[[0,probs[0]],[1,probs[1]]];p.event('选择最大的两项','VXM','I ← Top2(p)','临时权重之和小于 1',{read:['p'],write:['I']});p.objects.top.rows=[[0,alpha[0]],[1,alpha[1]]];p.event('所选权重再次归一化','VXM','αe ← pe / Σselected pj','α0 + α1 = 1；共享专家不占 Top-K 名额',{write:['α'],valid:true});return p;}
 // 无权重或部署细节时保留具名依赖，不用任意数值或路径填充。
 p=new Program('dependency',step.title,'具名依赖展开；符号表示尚未加载的张量，事件序号不等于硬件周期。');
 const operations={
  prompt:[['输入','UTF-8 Prompt'],['操作','接入服务接收原文一次'],['输出','请求 A / 原文缓冲']],
  schedule:[['输入',c.prefill?'18 个 input_ids':'上一输出 ID + Cache 标识'],['控制','请求 A / 本轮位置 / 后端任务'],['输出','输入描述符就绪']],
  expand:[['输入','x[T,D]'],['操作','复制到 H0 / H1 / H2 / H3'],['输出','H[T,4D]']],
  ngram:[['输入','本位置及前 2 个 Token ID'],['操作','2/3-gram → 16 个 hash 索引 → 查表'],['输出','PLE embedding[T,2560]']]
 };
 const spec=operations[id]||[['输入',step.from+' · 本算子输入张量'],['运算',step.formula],['输出',step.output]];
 p.object('deps','依赖对象',spec.map(([name,value])=>[name,value])).object('ready','结果状态',[[0,'未写回']]);
 p.event('等待并检查输入依赖',step.from,'检查所需输入是否就绪',spec[0][1],{read:['input'],focus:[{id:'deps',r:0,c:1,role:'read'}]});
 p.event('执行本算子的明确操作',step.unit,step.formula,spec[1][1],{read:['input'],write:['intermediate'],focus:[{id:'deps',r:1,c:1,role:'read'}]});
 p.objects.ready.rows=[[1,'已写回 / 下游可消费']];p.event('写回并提交结果有效',step.to,'output_ready ← 1',spec[2][1],{write:['output'],focus:[{id:'deps',r:2,c:1,role:'write'},{id:'ready',r:0,c:0,role:'write'}],valid:true});return p;
}
function build(step,c,state){const p=semanticProgram(step,c,state);p.events.forEach((e,i)=>{e.valid=!!e.valid&&i===p.events.length-1;});return p;}
const api={build,num,ffn,attention,mm,rms,softmax,silu,fixtures:{raw,WG,WU,WD}};
root.SEMANTIC_EXECUTION=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
