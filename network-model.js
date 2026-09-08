/* UTF-8 · 按 Hugging Face 配置与 Transformers 实现展开的网络操作。 */
(function(root){
'use strict';
const configSources={q27:'https://huggingface.co/Qwen/Qwen3.8-27B/blob/main/config.json',flash:'https://huggingface.co/Qwen/Qwen3.8-Flash-Next/blob/main/config.json'};
const implementationSources={q27:'https://github.com/huggingface/transformers/blob/main/src/transformers/models/qwen3_5/modeling_qwen3_5.py',flash:'https://github.com/huggingface/transformers/blob/main/src/transformers/models/qwen4_exp/modeling_qwen4_exp.py'};
const groups=[['input','输入与词嵌入'],['attention','当前层 · Token Mixer'],['transport','投递到 LPX'],['ffn','FFN / MoE'],['output','残差与输出']];
const model=id=>root.LPX_MODEL.models[id];
function shape(state){const m=model(state.model),s=root.TOKEN_SAMPLES[state.model],prefill=state.mode==='prefill',T=prefill?s.contextIds.length:1,S=prefill?T:s.contextIds.length+(state.outputIndex||0)+1;return{m,s,T,S,D:m.hidden,F:m.intermediate,Q:m.heads,K:m.kvHeads,d:m.headDim,flash:!!m.moe,full:state.layer%4===0,prefill,token:prefill?s.tokens[state.tokenIndex||0]:s.answerTokens[state.outputIndex||0]};}
function trace(state){const c=shape(state),{m,s,T,S,D,F,Q,K,d,flash,full,prefill}=c,rows=[];
 const add=(id,group,title,hardware,unit,detail,formula,output,extra={})=>rows.push({id,group,title,hardware,unit:hardware==='GPU'?({MXM:'GPU 矩阵运算',VXM:'GPU 向量运算',MEM:'GPU 存储','MXM / VXM':'GPU 矩阵 / 向量'}[unit]||unit):unit,detail,formula,output,level:hardware==='GPU'?'gpu':hardware==='Host'?'external':'chip',from:'MEM',to:unit==='MXM'?'MXM':unit==='VXM'?'VXM':unit==='SXM'?'SXM':'MEM',kind:'vector',...extra});
 add('prompt','input','接收这句话','Host','CPU','原文使用 UTF-8 编码进入服务；彩色字片是真实正文 Token。','UTF-8(Prompt)',s.prompt,{level:'external',from:'USER',to:'HOST',kind:'text',bytes:new TextEncoder().encode(s.prompt).length});
 add('tokenize','input','官方分词与对话模板','Host','Tokenizer','两模型都得到 6 个正文 Token；官方模板关闭 thinking 后，完整输入为 18 个 Token。','tokenizer + chat_template(think=false)',s.contextIds.length+' × int32 Token ID',{level:'external',from:'HOST',to:'GPU',kind:'tokens',bytes:s.contextIds.length*4});
 if(!prefill)add('prefill','input','GPU Prefill · 建立上下文','GPU','GPU','完整输入先经过所有模型层，建立 DeltaNet 状态与 Attention KV。切换“Prefill 展开”可查看该轮的完整算子。','T='+s.contextIds.length+'；GPU 执行全部层','前缀缓存 + 首个续写位置',{kind:'prefill',from:'EMBED',to:'CACHE'});
 add('embedding','input','Token ID → Embedding 行','GPU','MEM','每个真实 ID 查找一行词嵌入；向量束显示维度与归属，不伪造权重数值。','Embedding['+c.token.id+'] ∈ R^'+D,'['+T+', '+D+']',{kind:'embedding',from:'EMBED',to:'MATRIX',bytes:T*D*2});
 if(flash)add('expand','input','扩展四路残差流','GPU','VXM','Flash-Next 将初始隐藏激活复制到四条残差流，层内通过门控读写。','repeat(x, hc_count=4)','['+T+', 4 × '+D+']',{kind:'expand',from:'MATRIX',to:'RESIDUAL',bytes:T*D*4*2});
 if(flash&&state.layer===2){
  add('ngram','attention','PLE · bigram / trigram 查表','GPU','MEM','仅第 2 层注入 PLE。二元与三元 Token 历史分别使用 8 个哈希头，总计 16 头；不是又一次普通 Embedding。','2-gram / 3-gram → 16 组 hash → embedding','['+T+', 2560]',{kind:'ngram',from:'EMBED',to:'CACHE'});
  add('plegate','attention','PLE · 门控值与短卷积','GPU','VXM','由 n-gram 向量投影 key/value，与四路残差计算门控；短卷积 kernel=4、dilation=3，然后注入残差流。','gate=σ(sign(a)√|a|)；PLE=v_gate+SiLU(DWConv(RMS(v_gate)))','['+T+', 10240]',{kind:'residual',from:'CACHE',to:'RESIDUAL'});
 }
 if(flash)add('attnread','attention','门控残差 · 读出 Attention 输入','GPU','VXM','分组 RMSNorm 后，经 10240→320→10240 的门控网络混合四路输入，保留四个写回系数。','x=mean(σ(Wup·SiLU(Wdown·RMS(H)/4)) ⊙ RMS(H), branches)','['+T+', 2560]',{kind:'norm',from:'RESIDUAL',to:'MATRIX'});
 else add('attnnorm','attention','Attention 前 RMSNorm','GPU','VXM','输入先归一化，原始残差保留到 Token Mixer 输出后相加。','RMSNorm(x)=γ ⊙ x / √(mean(x²)+ε)','['+T+', '+D+']',{kind:'norm',from:'RESIDUAL',to:'MATRIX'});
 if(!full){
  add('deltaproj','attention','DeltaNet · Q / K / V / 门控投影','GPU','MXM','Q/K 各 16×128，V 与输出门控 z 各 48×128；β 和衰减参数各 48 个。','qkv=xWqkv；z=xWz；b=xWb；a=xWa','Q/K ['+T+',16,128] · V ['+T+',48,128]',{kind:'qkv',from:'MATRIX',to:'QKV',flops:2*T*D*(10240+6144+96)});
  add('deltaconv','attention','DeltaNet · 因果卷积与归一化','GPU','VXM','QKV 经过 kernel=4 的深度因果卷积与 SiLU。Q/K 做 L2 归一化并按 V 头分组复制。','QKV←SiLU(DWConv₄(QKV))；Q,K←L2Norm','48 组 Q/K/V',{kind:'conv',from:'QKV',to:'VECTOR'});
  add('deltastate','attention',prefill?'DeltaNet · 分块状态累积':'DeltaNet · 递推更新状态','GPU','VXM','这里更新固定大小状态，而不是历史 Token × Token 的 Softmax 矩阵；Decode 复用前序状态。','S←eᵍS；v̂=kᵀS；S←S+k[β(v−v̂)]ᵀ；o=qᵀS','State [48,128,128]',{kind:'state',from:'VECTOR',to:'CACHE',bytes:48*128*128*4});
  add('deltagate','attention','DeltaNet · RMSNorm 与输出门控','GPU','VXM','对每个 V 头归一化并乘 SiLU(z)，再拼接头。','o←RMSNorm(o) ⊙ SiLU(z)','['+T+', 6144]',{kind:'gate',from:'CACHE',to:'VECTOR'});
  add('deltaout','attention','DeltaNet · 输出投影','GPU','MXM','输出投影回模型隐藏维。','['+T+',6144] × [6144,'+D+']','['+T+', '+D+']',{kind:'matrix',from:'VECTOR',to:'MATRIX',flops:2*T*6144*D});
 }else{
  if(flash){
   add('qsaindex','attention','QSA · 独立 Indexer 投影','GPU','MXM','Indexer 使用 4 个 Q 头、1 个 K 头，头维 128；与主 Attention 的 24/2 个头不同。','Indexer Q [T,4,128] / K [S,1,128]','索引查询与键',{kind:'qkv',from:'MATRIX',to:'INDEX',flops:2*T*D*5*128});
   add('qsablocks','attention','QSA · 四 Token 微块选择','GPU','VXM','对可见完整四 Token 块评分，最多选 512 块，并保留可见尾部；本句短于预算，不会虚构“丢弃大量 Token”。','k=min(512, ⌊visible/4⌋)；selected blocks + tail','当前上下文 '+S+'；预算 2048 Token',{kind:'sparse',from:'INDEX',to:'CACHE'});
  }
  add('qkv','attention','Gated Attention · Q / K / V 投影','GPU','MXM','Q 投影同时产生查询与 sigmoid 输出门控。模型隐藏维不等于查询头拼接宽度。','Q+gate: D→'+(2*Q*d)+'；K,V: D→'+(K*d),'Q ['+T+','+Q+',256] · KV ['+T+','+K+',256]',{kind:'qkv',from:'MATRIX',to:'QKV',flops:2*T*D*(2*Q*d+2*K*d)});
  add('rope','attention','QK Norm · 部分 RoPE','GPU','VXM','先对每个 Q/K 头做 RMSNorm，只旋转 256 维中的前 64 维；V 不做 RoPE。','Q,K=RoPE₆₄(RMSNorm(Q,K))','Q/K：64 旋转维 + 192 保留维',{kind:'rope',from:'QKV',to:'VECTOR'});
  add('kv','attention','KV Cache · 追加本轮 K/V','GPU','MEM','每层使用自己的 KV 历史；只追加本轮位置，不搬走所有历史缓存。','new KV = 2 × T × '+K+' × 256 × 2 B','KV ['+S+','+K+',256]',{kind:'cache',from:'VECTOR',to:'CACHE',bytes:2*T*K*d*2});
  add('qk','attention','QKᵀ · 计算注意力得分','GPU','MXM','按 GQA 分组共享 K/V；只允许访问当前查询可见的历史。','scores=QKᵀ / √256','['+Q+','+T+','+S+']',{kind:'matrix',from:'CACHE',to:'MATRIX',flops:2*Q*T*S*d});
  add('softmax','attention',flash?'因果 + QSA 掩码 / Softmax':'因果掩码 / Softmax','GPU','VXM','先减行最大值，再求 exp 与分母；被掩码的位置概率为零。','P=exp(s−max(s)) / Σexp(s−max(s))','每个查询头的一行概率',{kind:'softmax',from:'MATRIX',to:'VECTOR'});
  add('pv','attention','PV · 汇总 Value','GPU','MXM','用概率对 V 做加权汇总；拼接后的宽度为 24×256=6144。','o=P·V','['+T+',6144]',{kind:'matrix',from:'VECTOR',to:'MATRIX',flops:2*Q*T*S*d});
  add('attngate','attention','sigmoid 门控与输出投影','GPU','MXM','注意力结果乘 Q 投影同时产生的 sigmoid gate，再映射回 D。','y=(o ⊙ σ(gate))Wo','['+T+','+D+']',{kind:'gate',from:'MATRIX',to:'RESIDUAL',flops:2*T*Q*d*D});
 }
 add('attnwrite','attention',flash?'门控残差 · 写回四路':'Attention 残差相加','GPU','VXM',flash?'当前 Attention 输出乘四个注入系数，再分别加回四路残差。':'将 Attention 输出加回该层保存的输入。',flash?'H←H + y ⊗ 2σ(Wwrite·RMS(H)/4)':'x←residual + Attention(RMSNorm(x))',flash?'['+T+',10240]':'['+T+','+D+']',{kind:'residual',from:'MATRIX',to:'RESIDUAL'});
 add('ffnread','attention',flash?'门控残差 · 读出 MoE 输入':'FFN 前 RMSNorm','GPU','VXM',flash?'MoE 的读门控独立于 Attention 门控；送入专家的宽度是 2560，而不是四路残差总宽度。':'FFN 使用归一化后的激活，残差仍保留在 GPU。',flash?'GatedResidualRead(H)':'RMSNorm(x)','['+T+','+D+']',{kind:'norm',from:'RESIDUAL',to:'NETWORK'});
 if(!prefill){
  add('gpu-egress','transport','GPU → Spectrum-X → Groq LPX','GPU / LPX','网络发送','GPU 输出当前 Token 的归一化激活，经网络送到 LPX 执行 FFN / MoE。这里只发送隐藏向量，不重新输入 Prompt。','GPU 激活 → NIC → Ethernet → LPX','['+1+','+D+'] BF16',{level:'external',from:'GPU',to:'SLOT',kind:'transport',bytes:D*2});
  add('afd','transport','AFD · 激活进入机架','LPX','Ethernet','Attention / 残差在 GPU；LPX 接收 FFN/MoE 的 BF16 激活，原始文字不直接进入矩阵阵列。','D × 2 B / (400 Gb/s ÷ 8)',D*2+' B 激活',{level:'rack',from:'NETWORK',to:'SLOT',kind:'transport',bytes:D*2,bandwidth:50e9});
  add('tray','transport','网络接口 → Fabric → LPU','LPX','NIC / Fabric','托盘前部网络接口接收激活，经过 Fabric 扩展逻辑交给承载本层的 LPU。','Ethernet → NIC → Fabric → LPU','同一 Token 的隐藏激活',{level:'tray',from:'NIC',to:'LPU',kind:'transport',bytes:D*2});
  if(!flash)add('dispatch','transport',flash?'派发到专家所在芯片':'TP2 · 同一输入送两片','LPX','C2C',flash?'专家编号是给定的路由示例；每片只执行命中的专家。实际分数取决于权重和 Token 激活。':'两片收到相同 x，分别计算不同的 8704 个 FFN 通道；Token 本身没有被切成两半。','x → '+(flash?'命中专家所在 LPU':'两个 TP 分片'),'['+1+','+D+']',{level:'fabric',from:'ROOT',to:'PEER',kind:'dispatch',bytes:D*2,bandwidth:14e9});
 }
 const hw=prefill?'GPU':'LPX',level=prefill?'gpu':'chip',f=flash?F:prefill?F:F/2;
 if(flash)add('router',prefill?'ffn':'transport','路由分数 → Softmax → Top-10',hw,'MXM / VXM','512 个路由专家选择十个；共享专家独立执行并始终参与。路由矩阵与 Top-10 的延迟分开。','p=softmax(xWrouter)；topk(p,10)','['+T+',512] → 10 个专家',{level,kind:'router',from:'MEM',to:'MXM',flops:2*T*D*512,weightBytes:D*512*state.weightBytes});
 if(flash&&!prefill)add('dispatch','transport','EP · 派发到命中专家','LPX','C2C','路由完成后才派发输入；同片多个命中专家可复用激活。画面跟踪所选示例专家。','Top-10 owners ← x','[1,2560]',{level:'fabric',from:'ROOT',to:'PEER',kind:'dispatch',bytes:D*2,bandwidth:14e9});
 add('gateup','ffn',flash?'专家 Gate / Up 投影':'Dense FFN · Gate / Up',hw,'MXM',flash?'当前展示所选专家；每个专家中间维为 640。':'Gate 与 Up 具有不同权重；两路中间结果尚未相乘。','g=xWgate；u=xWup','2 × ['+T+','+f+']',{level,kind:'matrix',from:'MEM',to:'MXM',flops:4*T*D*f,weightBytes:2*D*f*state.weightBytes,bytes:2*T*f*2});
 add('silu','ffn','SiLU · 逐元素门控',hw,'VXM','SiLU 与乘法发生在向量资源，不是另外一颗专用 FFN 芯片。','h=(g / (1+exp(−g))) ⊙ u','['+T+','+f+']',{level,kind:'gate',from:'MXM',to:'VXM',bytes:T*f*2});
 add('down','ffn',flash?'专家 Down 输出':'Down · 隐藏维输出',hw,'MXM',flash?'每个专家输出完整 D 维向量，随后按路由权重合并。':prefill?'GPU 完成完整 FFN 输出。':'本片只有 D 维部分和；还需要两片求和。','y=hWdown','['+T+','+D+']',{level,kind:'matrix',from:'VXM',to:'MXM',flops:2*T*f*D,weightBytes:D*f*state.weightBytes,bytes:T*D*4});
 if(flash)add('shared','ffn','共享专家与独立 sigmoid 门控',hw,'MXM / VXM','共享专家的 SwiGLU 与路由专家并行。它不占 Top-10 名额，门控投影是 D→1。','shared=σ(xWshared_gate) ⊙ SwiGLUshared(x)','['+T+','+D+']',{level,kind:'expert',from:'MEM',to:'VXM',flops:6*T*D*F+2*T*D,weightBytes:(3*D*F+D)*state.weightBytes});
 if(flash||!prefill)add('combine','ffn',flash?'路由加权求和 + 共享输出':'C2C · 归约两片部分和',hw,'VXM',flash?'合并的是 pₑyₑ；不能像 Dense TP 那样省略路由权重。':'根片收取另一分片的部分和，求和后转换为 BF16。',flash?'y=Σₑ∈Top10 pₑyₑ + shared':'y=y₀+y₁','['+T+','+D+']',{level:prefill?'gpu':'fabric',kind:'combine',from:'PEER',to:'ROOT',bytes:prefill?T*D*4:D*4,bandwidth:prefill?null:14e9});
 if(!prefill)add('return','output','FFN / MoE 输出返回 GPU','LPX','Ethernet','返回的是隐藏激活，GPU 继续执行残差和下一层。','LPU → Fabric → 网络接口 → GPU',D*2+' B',{level:'tray',kind:'transport',from:'LPU',to:'NIC',bytes:D*2,bandwidth:50e9});
 if(!prefill)add('gpu-return','output','LPX → 网络 → GPU 接收','GPU / LPX','网络接收','LPX 返回本层 FFN / MoE 输出，GPU 收到后才继续残差；此时还不是最终文字。','LPX → Spectrum-X → GPU','['+1+','+D+'] BF16',{level:'external',kind:'transport',from:'SLOT',to:'GPU',bytes:D*2});
 add('ffnwrite','output',flash?'MoE 输出写回四路残差':'FFN 残差相加','GPU','VXM','写回在 GPU，之后才进入下一个模型层。',flash?'H←H + MoE(x) ⊗ write_gate':'x←residual + FFN(RMSNorm(x))',flash?'['+T+',10240]':'['+T+','+D+']',{kind:'residual',from:'NETWORK',to:'RESIDUAL'});
 add('layers','output','重复模型剩余层','GPU / LPX','层调度','此处折叠重复层；可点击任意层展开它的实际分支，而不是把 48 / 64 层画成同一种 Attention。',flash?'12 × (3 DeltaNet + 1 QSA)，每层都有 MoE':'16 × (3 DeltaNet + 1 Gated Attention)，每层都有 Dense FFN',m.layers+' 层',{level:'gpu',kind:'layers',from:'RESIDUAL',to:'MATRIX'});
 add('finalnorm','output',flash?'最终四路门控混合':'最终 RMSNorm','GPU','VXM',flash?'Flash-Next 的 final hyper_connection_mixer 将四路残差混合为 D，不能替换成 27B 的普通最终 RMSNorm。':'27B 在全部解码层之后做最终 RMSNorm。',flash?'GatedResidual(H, use_combine=false)':'RMSNorm(x)','['+T+','+D+']',{kind:'norm',from:'RESIDUAL',to:'VECTOR'});
 add('lmhead','output','词表头 · logits','GPU','MXM','词表大小为 248320；生成只取最后位置的 logits。','[1,'+D+'] × ['+D+',248320]','[1,248320]',{kind:'logits',from:'VECTOR',to:'MATRIX',flops:2*D*248320,bytes:248320*4});
 add('sample','output','采样 / 反分词 → 发回一个 Token','Host','CPU','展示句“没有单一答案，要看任务和评测。”是给定的回放序列。本次只发回一个新 Token，后续 Decode 复用缓存；没有运行模型权重或伪造概率分布。','next_id → tokenizer.decode(id)','当前回放字片：'+s.answerTokens[prefill?0:Math.min((state.outputIndex||0)+1,s.answerTokens.length-1)].text,{level:'external',kind:'output',from:'GPU',to:'USER'});
 return rows;
}
function cost(state,step){const flops=step.flops??null,lp=step.hardware==='LPX';let bytes=step.weightBytes??step.bytes??null,ns=null,memNs=null,computeNs=null;const expertLink=lp&&state.model==='flash'&&['dispatch','combine'].includes(step.id),a=expertLink?root.LPX_MODEL.assignment(state.model,state.layer,state.weightBytes,state.expert):null,local=expertLink&&a.globalPeer===a.globalRoot;if(local)bytes=0;if(lp&&step.weightBytes){memNs=step.weightBytes/150e12*1e9;computeNs=state.weightBytes===1&&flops?flops/1.2e15*1e9:null;ns=Math.max(memNs,computeNs||0);}else if(lp&&step.bandwidth&&bytes!==null)ns=bytes/step.bandwidth*1e9;return{flops,bytes,ns,memNs,computeNs,bandwidth:step.bandwidth|| (lp&&step.weightBytes?150e12:null),rule:local?'所选专家与根片同片，C2C 字节为 0；片内搬运及汇总延迟仍未公开。':ns===null?'当前硬件 / 算子延迟未公开，仅显示已知形状与算量。':step.weightBytes?'权重 / 150 TB/s 与 FP8 FLOPs / 1.2 PFLOPS 的资源下界；BF16 不套用 FP8 峰值。':(expertLink?'只计所选专家的一次通信；':'')+'单口 / 单条链路的裸数据序列化下界；未包含协议与同步。'};}
const api={shape,trace,cost,groups,model,configSources,implementationSources};root.NETWORK_MODEL=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
