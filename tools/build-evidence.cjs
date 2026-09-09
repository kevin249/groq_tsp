/* UTF-8 · 固定官方资料版本，核对配置与参考实现；不推定硬件部署。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function read(url){const r=await fetch(url);if(!r.ok)throw Error(url+' '+r.status);return r.text();}
(async()=>{
 const tf=JSON.parse(await read('https://api.github.com/repos/huggingface/transformers/commits/main')).sha;
 const out={checkedAt:new Date().toISOString(),transformersRevision:tf,models:{},hardware:{article:'https://developer.nvidia.com/blog/inside-nvidia-groq-3-lpx-the-low-latency-inference-accelerator-for-the-nvidia-vera-rubin-platform/',afdFigure:'https://developer-blogs.nvidia.com/wp-content/uploads/2026/03/Decode-Loop.webp',trayFigure:'https://developer-blogs.nvidia.com/wp-content/uploads/2026/03/LPX02-Groq3LPX_Compute_Tray.webp',status:'公开预发布规格；不等于有效带宽或实测延迟'}};
 for(const[id,name,impl]of [['q27','Qwen3.8-27B','qwen3_5'],['flash','Qwen3.8-Flash-Next','qwen4_exp']]){
  const meta=JSON.parse(await read('https://huggingface.co/api/models/Qwen/'+name)),base='https://huggingface.co/Qwen/'+name+'/resolve/'+meta.sha+'/',raw=await read(base+'config.json');
  const py='https://raw.githubusercontent.com/huggingface/transformers/'+tf+'/src/transformers/models/'+impl+'/modeling_'+impl+'.py';
  const cfgpy=py.replace('/modeling_','/configuration_'),[source,csource]=await Promise.all([read(py),read(cfgpy)]);
  fs.writeFileSync(path.join(root,'reports','audit-'+impl+'.py'),source,'utf8');
  fs.writeFileSync(path.join(root,'reports','audit-config-'+impl+'.py'),csource,'utf8');
  out.models[id]={name:'Qwen/'+name,revision:meta.sha,configUrl:base+'config.json',configSha256:hash(raw),config:JSON.parse(raw).text_config,safetensors:meta.safetensors,implementationUrl:py.replace('raw.githubusercontent.com','github.com').replace('/'+tf+'/','/blob/'+tf+'/'),implementationSha256:hash(source),configurationUrl:cfgpy.replace('raw.githubusercontent.com','github.com').replace('/'+tf+'/','/blob/'+tf+'/'),referenceGate:/attn_output = attn_output \* torch.sigmoid\(gate\)/.test(source)?'sigmoid':'待核对',normalizesTopK:/norm_topk_prob[^\n]*=[^\n]*True/.test(csource)};
 }
 fs.writeFileSync(path.join(root,'model-evidence.js'),'/* UTF-8 · 官方配置及参考实现的固定版本快照。 */\n(function(root){root.MODEL_EVIDENCE = '+JSON.stringify(out,null,2)+';})(typeof window===\'undefined\'?globalThis:window);\n','utf8');
 console.log(JSON.stringify(Object.fromEntries(Object.entries(out.models).map(([k,v])=>[k,{revision:v.revision,hidden:v.config.hidden_size,gateConfig:v.config.output_gate_type,gateReference:v.referenceGate,normTopK:v.normalizesTopK,total:v.safetensors.total}]))));
})().catch(e=>{console.error(e);process.exitCode=1;});
