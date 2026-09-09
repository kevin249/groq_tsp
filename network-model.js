/* UTF-8 · 按 Hugging Face 配置与 Transformers 实现展开的网络操作。 */
(function(root){
'use strict';
const configSources={q27:'https://huggingface.co/Qwen/Qwen3.8-27B/blob/main/config.json',flash:'https://huggingface.co/Qwen/Qwen3.8-Flash-Next/blob/main/config.json'};
const implementationSources={q27:'https://github.com/huggingface/transformers/blob/main/src/transformers/models/qwen3_5/modeling_qwen3_5.py',flash:'https://github.com/huggingface/transformers/blob/main/src/transformers/models/qwen4_exp/modeling_qwen4_exp.py'};
for(const[id,e]of Object.entries(root.MODEL_EVIDENCE?.models||{})){configSources[id]=e.configUrl;implementationSources[id]=e.implementationUrl;}
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
  add('deltastate','attention',prefill?'DeltaNet · 分块状态累积':'DeltaNet · 递推更新状态','GPU','VXM','这里更新固定大小状态，而不是历史 Token × Token 的 Softmax 矩阵；Decode 复用前序状态。','q=L2Norm(q)/√128；k=L2Norm(k)；S←eᵍS；S←S+k[β(v−kᵀS)]ᵀ；o=qᵀS','State [48,128,128]',{kind:'state',from:'VECTOR',to:'CACHE',bytes:48*128*128*4});
  add('deltagate','attention','DeltaNet · RMSNorm 与输出门控','GPU','VXM','对每个 V 头归一化并乘 SiLU(z)，再拼接头。','o←RMSNorm(o) ⊙ SiLU(z)','['+T+', 6144]',{kind:'gate',from:'CACHE',to:'VECTOR'});
  add('deltaout','attention','DeltaNet · 输出投影','GPU','MXM','输出投影回模型隐藏维。','['+T+',6144] × [6144,'+D+']','['+T+', '+D+']',{kind:'matrix',from:'VECTOR',to:'MATRIX',flops:2*T*6144*D});
 }else{
  if(flash){
   add('qsaindex','attention','QSA · 独立 Indexer 投影','GPU','MXM','Indexer 使用 4 个 Q 头、1 个 K 头，头维 128；与主 Attention 的 24/2 个头不同。','Indexer Q [T,4,128] / K [S,1,128]','索引查询与键',{kind:'qkv',from:'MATRIX',to:'INDEX',flops:2*T*D*5*128});
   add('qsablocks','attention','QSA · 四 Token 微块选择','GPU','VXM','Indexer 的 Q 经 RMSNorm / RoPE；历史 raw K 每 4 个取均值，再经 RMSNorm / 块首位置 RoPE。四头分数经 ReLU 后求和并除 √128，最多选 512 块，加可见尾部。','score=Σheads ReLU(QKblockᵀ)/√128；Top min(512,⌊visible/4⌋) + tail','当前上下文 '+S+'；预算 2048 Token',{kind:'sparse',from:'INDEX',to:'CACHE'});
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
  if(!flash&&state.deployment==='example')add('dispatch','transport',flash?'派发到专家所在芯片':'TP2 · 同一输入送两片','LPX','C2C',flash?'专家编号是给定的路由示例；每片只执行命中的专家。实际分数取决于权重和 Token 激活。':'两片收到相同 x，分别计算不同的 8704 个 FFN 通道；Token 本身没有被切成两半。','x → '+(flash?'命中专家所在 LPU':'两个 TP 分片'),'['+1+','+D+']',{level:'fabric',from:'ROOT',to:'PEER',kind:'dispatch',bytes:D*2,bandwidth:14e9});
 }
 const hw=prefill?'GPU':'LPX',level=prefill?'gpu':'chip',f=flash?F:!prefill&&state.deployment==='example'?F/2:F;
 if(flash)add('router',prefill?'ffn':'transport','路由分数 → Softmax → Top-10',hw,'MXM / VXM','512 个路由专家选择十个；共享专家独立执行并始终参与。路由矩阵与 Top-10 的延迟分开。','p=softmax(xWrouter)；I=Top10(p)；αₑ=pₑ/Σⱼ∈I pⱼ','['+T+',512] → 10 个专家',{level,kind:'router',from:'MEM',to:'MXM',flops:2*T*D*512,weightBytes:D*512*state.weightBytes});
 if(flash&&!prefill)add('dispatch','transport','EP · 派发到命中专家','LPX','C2C','路由完成后才派发输入；同片多个命中专家可复用激活。画面跟踪所选示例专家。','Top-10 owners ← x','[1,2560]',{level:'fabric',from:'ROOT',to:'PEER',kind:'dispatch',bytes:D*2,bandwidth:14e9});
 add('gateup','ffn',flash?'专家 Gate / Up 投影':'Dense FFN · Gate / Up',hw,'MXM',flash?'当前展示所选专家；每个专家中间维为 640。':'Gate 与 Up 具有不同权重；两路中间结果尚未相乘。','g=xWgate；u=xWup','2 × ['+T+','+f+']',{level,kind:'matrix',from:'MEM',to:'MXM',flops:4*T*D*f,weightBytes:2*D*f*state.weightBytes,bytes:2*T*f*2});
 add('silu','ffn','SiLU · 逐元素门控',hw,'VXM','SiLU 与乘法发生在向量资源，不是另外一颗专用 FFN 芯片。','h=(g / (1+exp(−g))) ⊙ u','['+T+','+f+']',{level,kind:'gate',from:'MXM',to:'VXM',bytes:T*f*2});
 add('down','ffn',flash?'专家 Down 输出':'Down · 隐藏维输出',hw,'MXM',flash?'每个专家输出完整 D 维向量，随后按路由权重合并。':prefill?'GPU 完成完整 FFN 输出。':'本片只有 D 维部分和；还需要两片求和。','y=hWdown','['+T+','+D+']',{level,kind:'matrix',from:'VXM',to:'MXM',flops:2*T*f*D,weightBytes:D*f*state.weightBytes,bytes:T*D*4});
 if(flash)add('shared','ffn','共享专家与独立 sigmoid 门控',hw,'MXM / VXM','共享专家的 SwiGLU 与路由专家并行。它不占 Top-10 名额，门控投影是 D→1。','shared=σ(xWshared_gate) ⊙ SwiGLUshared(x)','['+T+','+D+']',{level,kind:'expert',from:'MEM',to:'VXM',flops:6*T*D*F+2*T*D,weightBytes:(3*D*F+D)*state.weightBytes});
 if(flash||(!prefill&&state.deployment==='example'))add('combine','ffn',flash?'路由加权求和 + 共享输出':'C2C · 归约两片部分和',hw,'VXM',flash?'参考实现 norm_topk_prob=True：十个命中专家的概率重新归一化为 α，再加独立门控的共享专家输出。实际专家编号与分数未知。':'根片收取另一分片的部分和，求和后转换为 BF16。',flash?'y=Σₑ∈Top10 αₑyₑ + shared':'y=y₀+y₁','['+T+','+D+']',{level:prefill?'gpu':'fabric',kind:'combine',from:'PEER',to:'ROOT',bytes:prefill?T*D*4:D*4,bandwidth:prefill?null:14e9});
 if(!prefill)add('return','output','FFN / MoE 输出返回 GPU','LPX','Ethernet','返回的是隐藏激活，GPU 继续执行残差和下一层。','LPU → Fabric → 网络接口 → GPU',D*2+' B',{level:'tray',kind:'transport',from:'LPU',to:'NIC',bytes:D*2,bandwidth:50e9});
 if(!prefill)add('gpu-return','output','LPX → 网络 → GPU 接收','GPU / LPX','网络接收','LPX 返回本层 FFN / MoE 输出，GPU 收到后才继续残差；此时还不是最终文字。','LPX → Spectrum-X → GPU','['+1+','+D+'] BF16',{level:'external',kind:'transport',from:'SLOT',to:'GPU',bytes:D*2});
 add('ffnwrite','output',flash?'MoE 输出写回四路残差':'FFN 残差相加','GPU','VXM','写回在 GPU，之后才进入下一个模型层。',flash?'H←H + MoE(x) ⊗ write_gate':'x←residual + FFN(RMSNorm(x))',flash?'['+T+',10240]':'['+T+','+D+']',{kind:'residual',from:'NETWORK',to:'RESIDUAL'});
 add('layers','output','重复模型剩余层','GPU / LPX','层调度','此处折叠重复层；可点击任意层展开它的实际分支，而不是把 48 / 64 层画成同一种 Attention。',flash?'12 × (3 DeltaNet + 1 QSA)，每层都有 MoE':'16 × (3 DeltaNet + 1 Gated Attention)，每层都有 Dense FFN',m.layers+' 层',{level:'gpu',kind:'layers',from:'RESIDUAL',to:'MATRIX'});
 add('finalnorm','output',flash?'最终四路门控混合':'最终 RMSNorm','GPU','VXM',flash?'Flash-Next 的 final hyper_connection_mixer 将四路残差混合为 D，不能替换成 27B 的普通最终 RMSNorm。':'27B 在全部解码层之后做最终 RMSNorm。',flash?'GatedResidual(H, use_combine=false)':'RMSNorm(x)','['+T+','+D+']',{kind:'norm',from:'RESIDUAL',to:'VECTOR'});
 add('lmhead','output','词表头 · logits','GPU','MXM','词表大小为 248320；生成只取最后位置的 logits。','[1,'+D+'] × ['+D+',248320]','[1,248320]',{kind:'logits',from:'VECTOR',to:'MATRIX',flops:2*D*248320,bytes:248320*4});
 add('sample','output','采样 / 反分词 → 发回一个 Token','Host','CPU','展示句“没有单一答案，要看任务和评测。”是给定的回放序列。本次只发回一个新 Token，后续 Decode 复用缓存；没有运行模型权重或伪造概率分布。','next_id → tokenizer.decode(id)','当前回放字片：'+s.answerTokens[prefill?0:Math.min((state.outputIndex||0)+1,s.answerTokens.length-1)].text,{level:'external',kind:'output',from:'GPU',to:'USER'});
 for(const row of rows) auditStep(state,c,row);
 return rows;
}

// 算法张量与物理传输分别计量。原文没有公开 Qwen 的部署、线上 dtype 或实机 trace。
function auditStep(state,c,row){
 const {D,F,T,S,flash,prefill,m}=c;
 row.evidence='参考实现';row.scope='B=1；参考张量，不等于物理传输';
 row.tensorBytes=row.bytes??null;row.bytes=null;row.bandwidth=null;
 if(row.weightBytes){row.weightElements=row.weightBytes/state.weightBytes;row.tensorBytes=row.weightBytes;row.scope=(flash?'单个专家 / 当前矩阵':!prefill&&state.deployment==='example'?'假设 TP2 的一个分片':'完整算子')+'；权重占用，不是已测读取流量';}
 if(['prompt','tokenize','sample'].includes(row.id)){row.evidence='Tokenizer 快照';row.scope='文本 / Token 序列';}
 if(row.id==='prompt'){row.bytes=new TextEncoder().encode(c.s.prompt).length;row.tensorBytes=row.bytes;row.scope='UTF-8 正文字节，不含请求封装';}
 if(row.id==='tokenize'){row.output=c.s.contextIds.length+' 个 Token ID；线上编码未公开';row.tensorBytes=null;row.from='HOST';row.to='HOST';row.detail='正文 6 个 Token，官方模板输入 18 个 Token。这个操作只分词；传入执行后端时采用何种 ID 位宽与协议，不能由 tokenizer 推导。';}
 if(row.id==='embedding'){row.detail='展示所选 Token 的词表行；Prefill 同时处理全部 '+T+' 个模板位置。这里显示逻辑形状，没有权重数值或具体存储地址。';}
 if(row.id==='deltastate'){row.detail+=' FP32 状态占用只含递推矩阵，卷积历史缓存另计；占用不是本步实际总读写量。';row.scope='每层、每序列的递推矩阵占用';}
 if(row.id==='kv'){row.detail+=' BF16 是参考张量口径；缓存量化、物理布局和实际读取字节未公开。';row.scope='本轮新增 K/V 张量占用';}
 if(row.id==='attngate'&&!flash){row.title='Attention 输出门控 · 来源存在差异';row.evidence='配置 / 实现不一致';row.detail='本模型配置 output_gate_type=swish，但固定版本的 Qwen3_5Attention.forward 执行 torch.sigmoid(gate)。本页公式明确按该参考实现回放，不能宣称已验证模型发布方预期或 Groq 部署。';}
 if(row.id==='router'){row.detail='参考实现先对 512 个分数做 FP32 Softmax，再选 Top-10 并重新归一化。Router 放 GPU 还是 LPX 未公开；此页选 LPX 是推演边界。共享专家独立参与。';row.evidence='算法已核对 / 位置为假设';}
 const transfers=['gpu-egress','afd','tray','dispatch','combine','return','gpu-return'];
 if(transfers.includes(row.id)&&!prefill){
  row.evidence='架构连接公开 / Qwen 部署未公开';row.tensorBytes=null;row.wireBytes=null;row.scope='线上负载未知';
  if(!['dispatch','combine'].includes(row.id)){
   row.output='模型边界 [1,'+D+']；线上 dtype / 布局未知';
   row.formula='张量元素数 '+D+'；线上字节 = 元素数 × 传输 dtype + 元数据 / 填充';
   row.detail='这是一层 AFD 交接的不同观察尺度。选择 FFN 读入后 / 写出前为边界时，逻辑张量宽度为 '+D+'；该边界、BF16 传输、打包和并行策略均未由 NVIDIA 公布，不能当作实测流量。';
   row.handoff=['return','gpu-return'].includes(row.id)?'lpu-to-gpu':'gpu-to-lpu';
  }
 }
 if(row.id==='gpu-egress'){row.path=['GPU','CX9','NETWORK','SLOT'];row.title='AFD 去程 · GPU / CX-9 / Spectrum-X / LPX';}
 if(row.id==='gpu-return'){row.path=['SLOT','NETWORK','CX9','GPU'];row.title='AFD 回程 · LPX / Spectrum-X / CX-9 / GPU';}
 if(row.id==='tray'){row.path=['NETWORK','FABRIC','LPU'];row.from='NETWORK';row.title='LPX 接口 / Fabric / LPU';row.detail+=' 原图给出功能连接；不推定 PCIe、DMA、Host CPU 是否经过或板内实际布线。';}
 if(row.id==='return'){row.path=['LPU','FABRIC','NETWORK'];row.to='NETWORK';}
 if(row.id==='afd'){row.title='同一去程 · 放大 LPX 机架';row.detail+=' 这不是第二次发送，不重复累计字节和延迟。';}
 if(row.id==='dispatch'&&state.deployment!=='example'){row.title='专家放置与通信 · 未公开';row.detail='已知 Top-10 算法，未知本句命中专家、专家到芯片的分配及派发拓扑。默认不画任意根片或专家编号；可开启假设分片查看一个示例。';row.output='10 个路由专家 + 1 个共享专家；owner 未知';row.formula='I = Top10(router(x))；owner(e) 未公开';}
 if(row.id==='combine'&&flash&&state.deployment!=='example'){row.level=prefill?'gpu':'chip';row.from='MXM';row.to='VXM';row.kind='vector';}
 if(['gateup','silu','down','shared'].includes(row.id)&&!prefill){row.evidence='算法已核对 / 芯片映射为资源类别';row.detail+=' 所示 MXM / VXM 是资源类别；算子分片、指令序列与具体位置未公开。';}
 if(row.id==='gateup'&&!flash&&state.deployment!=='example')row.detail='完整 FFN 的 Gate / Up 两个矩阵：各 ['+D+','+F+']。这里统计全算子，不宣称能装入一颗 LPU。';
 if(row.id==='down'&&!flash){row.detail=state.deployment==='example'&&!prefill?'假设 TP2：本片给出 D 维部分和，之后必须归约。':'完整算子将中间激活投影回 D 维；真实分片和归约方案未公开。';row.tensorBytes=T*D*2;}
 if(['attnwrite','ffnread','ffnwrite','finalnorm','lmhead','sample'].includes(row.id))row.evidence='参考算法 / 执行位置为推演';
 if(row.id==='ffnwrite'&&prefill)row.from='MATRIX';
 if(row.id==='sample'){row.from='HOST';row.detail='给定续写片段用于观察位置与依赖，没有执行模型权重。采样器位于 GPU 或 CPU 取决于后端；本步表示服务反分词并发送。';}
 return row;
}
function cost(state,step){
 let bytes=step.tensorBytes??null;
 const rule=step.handoff||step.id==='dispatch'&&!step.phase?.includes('prefill')?'线上 dtype、并行分配、打包和有效带宽未公开，暂不计算传输字节与耗时。':step.weightElements?'参数数目 × 所选存储字节。矩阵算量按一次乘加 = 2 FLOPs；不是权重实际读流量，也不是芯片执行时间。':'仅列参考张量占用 / 矩阵算量；未涵盖融合、缓存命中、通信、向量操作与同步。';
 return {flops:step.flops??null,bytes,wireBytes:step.wireBytes??null,ns:null,memNs:null,computeNs:null,bandwidth:null,rule};
}
// 层顺序是算法事实；GPU / LPX 的精细切分是明确标注的 AFD 推演。
function workflow(state){
 const out=[],m=model(state.model),keepInput=new Set(['embedding','expand']),tail=new Set(['layers','finalnorm','lmhead','sample']);
 const push=(row,phase,layer=0)=>out.push({...row,phase,layer,key:phase+'/'+layer+'/'+row.id});
 function round(mode,receive){
  const base={...state,mode};let first;
  for(let layer=1;layer<=m.layers;layer++){
   const t=trace({...base,layer});if(!first)first=t;
   if(layer===1){
    if(receive)for(const id of ['prompt','tokenize'])push(t.find(r=>r.id===id),mode);
    push({id:'schedule',group:'input',title:receive?'提交 Token ID / 调度后端':'沿用上下文 / 开始本轮',hardware:'Host',unit:'运行时',level:'external',from:'HOST',to:'GPU',path:['HOST','GPU'],kind:'submission',output:(mode==='prefill'?'18 个输入 Token ID':'1 个续写 Token ID')+' + 请求 / 位置元数据',detail:'Dynamo 负责服务层路由和协调。它不逐周期驱动 LPU，也不把 GPU 指令翻译成 LPU 指令。实际控制消息格式未公开。',formula:'请求 → 后端执行任务',evidence:'职责公开 / 消息格式未知',scope:'控制面',tensorBytes:null},mode);
    for(const row of t.filter(r=>keepInput.has(r.id)))push(row,mode);
   }
   for(const row of t.filter(r=>!['prompt','tokenize','prefill'].includes(r.id)&&!keepInput.has(r.id)&&!tail.has(r.id)))push(row,mode,layer);
   if(layer===m.layers){
    for(const row of t.filter(r=>['finalnorm','lmhead'].includes(r.id)))push(row,mode);
    push({id:'result-handoff',group:'output',title:'输出决策 / 交给响应服务',hardware:'GPU / Host',unit:'后端输出',level:'external',from:'GPU',to:'HOST',kind:'result',output:'Token ID / 输出状态；不显示伪造 logits',detail:'采样位置与输出消息编码由后端确定，公开文章没有给出。这里只表明全部层完成之后才具备输出依赖。',formula:'logits → 采样 → next_id',evidence:'参考算法 / 采样位置未知',scope:'输出交接',tensorBytes:null},mode);
    push(t.find(r=>r.id==='sample'),mode);
   }
  }
 }
 if(state.routeMode==='request'){round('prefill',true);round('decode',false);}
 else round(state.mode,state.mode==='prefill');
 return out;
}
const api={shape,trace,workflow,cost,groups,model,configSources,implementationSources};root.NETWORK_MODEL=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
