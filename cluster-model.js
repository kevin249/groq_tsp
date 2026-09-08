/* UTF-8 · 四片示例部署、环形归约与片间成本；不假定私有服务的实际部署。 */
(function(root){
 'use strict';const P=root.GROQ_PERFORMANCE||(typeof require!=='undefined'?require('./performance-model.js'):null);
 const defaults={strategy:'hybrid',request:'A',stage:0,laneGbps:30,links:1,linkUtil:.8,hopUs:.35,alignUs:.2,windowKiB:32,windowUs:.08,inFlight:2};
 const strategies={hybrid:{name:'两段流水线 × 两片张量并行',groups:[[[0,2],[1,3]]],detail:'每段两颗芯片协作计算同一层，两个阶段依次处理前后两组层。'},pipeline:{name:'四段流水线 · 按层分',groups:[[[0],[1],[3],[2]]],detail:'每颗芯片保存一段模型层。同一请求依次经过四段，阶段之间传隐藏激活。'},tensor:{name:'四片张量并行 · 同层分',groups:[[[0,1,3,2]]],detail:'同一层的头与 FFN 通道分到四颗芯片，输出部分和需要环形归约。'},replica:{name:'两个模型副本 × 两段流水线',groups:[[[0],[2]],[[1],[3]]],detail:'请求 A 绑定副本 0，请求 B 绑定副本 1；各自经过两个阶段并保留各自 KV。'}};
 const edges=[[0,1],[0,2],[1,3],[2,3]],edgeKey=(a,b)=>'WIRE'+[a,b].sort((x,y)=>x-y).join('');
 function route(a,b){if(a===b)return[a];const queue=[[a]],seen=new Set([a]);while(queue.length){const p=queue.shift(),u=p.at(-1);for(const[x,y]of edges){const v=x===u?y:y===u?x:null;if(v===null||seen.has(v))continue;const next=[...p,v];if(v===b)return next;seen.add(v);queue.push(next);}}throw Error('无片间物理路由');}
 function validate(raw={}){const c={...defaults,...raw};if(!strategies[c.strategy])throw Error('请选择一种四芯片部署方式');for(const[k,[lo,hi]]of Object.entries({laneGbps:[1,112],links:[1,8],linkUtil:[.01,1],hopUs:[0,1000],alignUs:[0,1000],windowKiB:[1,1024],windowUs:[0,1000],inFlight:[1,8],stage:[0,3]})){c[k]=Number(c[k]);if(!Number.isFinite(c[k])||c[k]<lo||c[k]>hi)throw Error(k+' 的范围为 '+lo+'—'+hi);}for(const k of ['links','inFlight','stage'])if(!Number.isInteger(c[k]))throw Error(k+' 需要整数');if(!['A','B'].includes(c.request))throw Error('请求应为 A 或 B');return c;}
 function transfer(payload,base,c,hops=1){
  if(!payload||!hops)return{payload:0,slots:0,padded:0,padding:0,windows:0,readMs:0,writeMs:0,wireMs:0,hopMs:0,alignMs:0,windowMs:0,low:0,high:0,hops:0};
  const slots=Math.ceil(payload/320),padded=slots*320,windowSlots=Math.max(1,Math.floor(c.windowKiB*1024/320)),windows=Math.ceil(slots/windowSlots),bandwidth=c.laneGbps*1e9*4*c.links*c.linkUtil/8;
  const readMs=payload/base.effective.memory*1000,writeMs=readMs,wireMs=padded/bandwidth*1000,hopMs=c.hopUs/1000,alignMs=c.alignUs/1000,windowMs=(windows-1)*c.windowUs/1000;
  return{payload,slots,padded,padding:padded-payload,windows,windowSlots,bandwidth,readMs,writeMs,wireMs,hopMs,alignMs,windowMs,hops,low:(Math.max(readMs,writeMs,wireMs)+hopMs+alignMs+windowMs)*hops,high:(readMs+writeMs+wireMs+hopMs+alignMs+windowMs)*hops};
 }
 const clone=a=>a.map(r=>r.slice());
 function ringTrace(group){
  const size=group.length,N=4;if(size===1)return[{kind:'complete',title:'本段只有一片，无需跨片归约',values:[[1,2,3,4]],moves:[],known:[[true]],round:0}];
  const width=N/size,initial=group.map((_,r)=>Array.from({length:N},(_,i)=>(r+1)*(i+1))),expected=Array.from({length:N},(_,i)=>(size*(size+1)/2)*(i+1));let state=clone(initial),known=group.map(()=>Array(size).fill(false));
  const out=[{kind:'partial',title:'各片只有本地部分和',values:clone(state),moves:[],known:clone(known),round:0}];
  for(let k=0;k<size-1;k++){
   const next=clone(state),moves=[];for(let r=0;r<size;r++){const to=(r+1)%size,chunk=(r-k-1+size*2)%size,values=state[r].slice(chunk*width,(chunk+1)*width);values.forEach((v,j)=>next[to][chunk*width+j]+=v);moves.push({from:group[r],to:group[to],chunk,values,add:true});if(k===size-2)known[to][chunk]=true;}
   state=next;out.push({kind:'reduce',title:'Reduce-scatter · 第 '+(k+1)+' 轮',values:clone(state),moves,known:clone(known),round:k+1});
  }
  for(let k=0;k<size-1;k++){
   const next=clone(state),moves=[];for(let r=0;r<size;r++){const to=(r+1)%size,chunk=(r-k+size)%size,values=state[r].slice(chunk*width,(chunk+1)*width);values.forEach((v,j)=>next[to][chunk*width+j]=v);moves.push({from:group[r],to:group[to],chunk,values,add:false});known[to][chunk]=true;}
   state=next;out.push({kind:'gather',title:'All-gather · 第 '+(k+1)+' 轮',values:clone(state),moves,known:clone(known),round:k+1});
  }
  out.push({kind:'complete',title:'每片获得同一结果，再加一次残差',values:clone(state),moves:[],known:clone(known),expected,round:0});return out;
 }
 function build(input={},raw={}){
  const base=input.steps?input:P.build(input),p=base.p,d=base.dimensions,c=validate(raw),spec=strategies[c.strategy],replica=c.strategy==='replica'&&c.request==='B'?1:0,groups=spec.groups[replica],PP=groups.length,TP=groups[0].length;
  c.stage=Math.min(c.stage,PP-1);const group=groups[c.stage],issues=[];
  if(d.L<PP)issues.push('层数 L 至少为 '+PP+'，才能使每个流水阶段都有模型层');if(d.H%TP||d.H<TP)issues.push('本示例布局要求 Q 头数 H 能被 '+TP+' 个张量分片整除');if(d.F%TP)issues.push('本示例布局要求 FFN 维度 F 能被 '+TP+' 整除');if(d.V%TP)issues.push('词表大小 V 需要能被 '+TP+' 整除');
  const chips=[];
  for(const[rep,stages]of spec.groups.entries())for(const[stage,ranks]of stages.entries())for(const[rank,id]of ranks.entries()){
   const size=ranks.length,layerStart=Math.floor(stage*d.L/stages.length),layerEnd=Math.floor((stage+1)*d.L/stages.length),headStart=Math.floor(rank*d.H/size),headEnd=Math.floor((rank+1)*d.H/size),ffStart=Math.floor(rank*d.F/size),ffEnd=Math.floor((rank+1)*d.F/size),kvHeads=[...new Set(Array.from({length:headEnd-headStart},(_,h)=>Math.floor((headStart+h)/(d.H/d.G))))];
   const headDim=(headEnd-headStart)*d.d,localK=kvHeads.length*d.d,layers=layerEnd-layerStart,ff=ffEnd-ffStart;
   const layerWeights=2*(2*d.D*headDim+2*d.D*localK+3*d.D*ff+2*d.D)*layers,isEntry=id===stages[0][0],isLast=stage===stages.length-1,embedding=isEntry?d.D*d.V*2:0,head=isLast?d.D*d.V/size*2:0,shared=isEntry&&isLast?head:0,weights=layerWeights+embedding+head-shared+(isLast?d.D*2:0);
   const kv=2*d.B*d.S*localK*2*layers*c.inFlight,workspace=2*d.score*(headEnd-headStart)/d.H*(p.materialize?1:0)+d.B*d.T*(5*d.D+3*ff+2*localK)*2+2*d.B*d.T*d.D*4+2*c.windowKiB*1024;
   chips.push({id,replica:rep,stage,rank,tp:size,layers,layerStart,layerEnd,headStart,headEnd,headDim,kvHeads,localK,ffStart,ffEnd,ff,weights,layerWeights,embedding,head,kv,workspace,total:weights+kv+workspace,limit:base.capacity.limit,fits:weights+kv+workspace<=base.capacity.limit,active:rep===replica});
  }
  chips.sort((a,b)=>a.id-b.id);const active=chips.filter(x=>x.active),valid=issues.length===0&&active.every(x=>x.fits),bandwidth=c.laneGbps*1e9*4*c.links*c.linkUtil/8,activation=d.B*d.T*d.D*2,partial=d.B*d.T*d.D*4;
  const one=(bytes,hops=1)=>transfer(bytes,base,c,hops);
  function collective(ranks){const size=ranks.length;if(size===1)return{size,chunk:0,rounds:0,low:0,high:0,perRankSent:0,totalSent:0,paddedTotal:0,additionMs:0,round:one(0)};const chunk=partial/size,round=one(chunk),rounds=2*(size-1),additionMs=(size-1)*d.B*d.T*d.D/size/base.effective.vector*1000;return{size,chunk,rounds,low:round.low*rounds+additionMs,high:round.high*rounds+additionMs,perRankSent:rounds*chunk,totalSent:size*rounds*chunk,paddedTotal:size*rounds*round.padded,additionMs,round};}
  function opCost(id,chip){
   const s=base.steps.find(s=>s.id===id),hr=(chip.headEnd-chip.headStart)/d.H,kr=chip.localK/d.K,fr=chip.ff/d.F;
   let ratio=['norm1','norm2','residual1','residual2'].includes(id)?1:['k','v','kv_write'].includes(id)?kr:id==='rope'?(chip.headDim+chip.localK)/(d.D+d.K):id.startsWith('ffn')?fr:hr;
   let bytes=s.memoryBytes*ratio;if(['wo','ffn_down'].includes(id)){const inner=id==='wo'?chip.headDim:chip.ff;bytes=d.B*d.T*inner*2*(p.materialize?1:0)+d.D*inner*2+partial*(p.materialize?1:0);}
   if(['residual1','residual2'].includes(id))bytes=d.B*d.T*d.D*8*(p.materialize?1:0);
   const flops=s.flops*ratio,vector=s.vectorOps*ratio+(['residual1','residual2'].includes(id)?d.B*d.T*d.D:0),compute=flops/base.effective.matrix*1000+vector/base.effective.vector*1000,memory=bytes/base.effective.memory*1000;return{flops,vector,bytes,low:Math.max(compute,memory)+s.fixedMs,high:compute+memory+s.fixedMs};
  }
  const attnIds=base.steps.filter(s=>s.section==='Attention').map(s=>s.id),ffnIds=base.steps.filter(s=>s.section==='FFN').map(s=>s.id),cost=(ids,chip)=>ids.reduce((a,id)=>{const s=opCost(id,chip);for(const k of ['low','high','flops','vector','bytes'])a[k]+=s[k];return a;},{low:0,high:0,flops:0,vector:0,bytes:0});
  for(const chip of chips){chip.attention=cost(attnIds,chip);chip.ffnCost=cost(ffnIds,chip);}
  const headStep=base.steps.find(s=>s.id==='lmhead'),headFlops=2*d.B*d.D*d.V/TP,headBytes=d.B*d.D*2+d.D*d.V*2/TP+d.B*d.V*4/TP,headCompute=headFlops/base.effective.matrix*1000,headMemory=headBytes/base.effective.memory*1000,headCost={flops:headFlops,bytes:headBytes,compute:headCompute,memory:headMemory,fixed:headStep.fixedMs,low:Math.max(headCompute,headMemory)+headStep.fixedMs,high:headCompute+headMemory+headStep.fixedMs};
  const broadcastHops=TP-1,broadcast=one(activation,broadcastHops),reduction=collective(group),next=groups[c.stage+1]||[],handoffs=next.map((to,r)=>({from:group[Math.min(r,group.length-1)],to,payload:activation,hops:route(group[Math.min(r,group.length-1)],to).length-1}));
  const handoffCosts=handoffs.map(x=>one(x.payload,x.hops)),stageCost=groups.map((g,i)=>{const ch=g.map(id=>chips[id]),ar=collective(g),count=ch[0].layers,lo=Math.max(...ch.map(x=>x.attention.low+x.ffnCost.low))+2*ar.low,hi=Math.max(...ch.map(x=>x.attention.high+x.ffnCost.high))+2*ar.high;return{index:i,chips:g,layers:count,low:lo*count,high:hi*count,communicationLow:2*ar.low*count};});
  const crossing=groups.slice(1).map((g,i)=>Math.max(...g.map((id,r)=>one(activation,route(groups[i][r]??groups[i][0],id).length-1).low))),crossingHigh=groups.slice(1).map((g,i)=>Math.max(...g.map((id,r)=>one(activation,route(groups[i][r]??groups[i][0],id).length-1).high)));
  const sum=a=>a.reduce((a,b)=>a+b,0),pipelineLow=sum(stageCost.map(s=>s.low))+sum(crossing),pipelineHigh=sum(stageCost.map(s=>s.high))+sum(crossingHigh),interval=Math.max(...stageCost.map((s,i)=>s.low+(crossing[i]||0)));
  const pipelineSlots=Array.from({length:PP+c.inFlight-1},(_,slot)=>({slot,jobs:groups.map((g,stage)=>{const job=slot-stage;return job>=0&&job<c.inFlight?{stage,chips:g,job,request:spec.groups.length>1?(replica===0?'A':'B')+(job+1):String.fromCharCode(65+job),token:0}:null;}).filter(Boolean)}));
  return{base,p,d,c,spec,replica,groups,group,PP,TP,chips,active,issues,valid,bandwidth,activation,partial,headCost,broadcast,reduction,handoffs,handoffLow:Math.max(0,...handoffCosts.map(x=>x.low)),handoffHigh:Math.max(0,...handoffCosts.map(x=>x.high)),stageCost,pipelineLow,pipelineHigh,interval,pipelineSlots,ring:ringTrace(group),localOp:(id,chipId)=>opCost(id,chips[chipId]),kvReplicaFactor:active.filter(x=>x.stage===c.stage).reduce((n,x)=>n+x.kvHeads.length,0)/d.G,transfer:one};
 }
 const api={defaults,strategies,edges,edgeKey,route,validate,transfer,ringTrace,build};root.GROQ_CLUSTER=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
