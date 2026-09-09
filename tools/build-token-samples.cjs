/* UTF-8 · 从官方 tokenizer 生成可离线回放的真实 Token。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Tokenizer}=require('@huggingface/tokenizers'),{Template}=require('@huggingface/jinja');
const root=path.resolve(__dirname,'..'),output={},prompt='谁是世界上最厉害的大模型？',answer='没有单一答案，要看任务和评测。';
require(path.join(root,'model-evidence.js'));
(async()=>{for(const [key,name]of [['q27','Qwen3.8-27B'],['flash','Qwen3.8-Flash-Next']]){
 const revision=globalThis.MODEL_EVIDENCE.models[key].revision,base='https://huggingface.co/Qwen/'+name+'/resolve/'+revision+'/',read=async file=>{const r=await fetch(base+file);if(!r.ok)throw Error(name+' '+file+' '+r.status);return r.text();};
 const [raw,cfg,template]=await Promise.all([read('tokenizer.json'),read('tokenizer_config.json'),read('chat_template.jinja')]);
 const tk=new Tokenizer(JSON.parse(raw),JSON.parse(cfg)),enc=t=>tk.encode(t,{add_special_tokens:false}),pieces=e=>e.ids.map(id=>({id,text:tk.decode([id],{skip_special_tokens:false})}));
 // 官方模板：单条 user 消息、enable_thinking=false、add_generation_prompt=true。
 const formatted=new Template(template).render({messages:[{role:'user',content:prompt}],enable_thinking:false,add_generation_prompt:true});
 const a=enc(prompt),c=enc(formatted),b=enc(answer);if(tk.decode(a.ids)!==prompt||tk.decode(c.ids,{skip_special_tokens:false})!==formatted)throw Error('Tokenizer 还原不一致');
 output[key]={model:'Qwen/'+name,revision,prompt,tokens:pieces(a),formatted,contextIds:c.ids,contextTokens:pieces(c),answer,answerTokens:pieces(b),tokenizerUrl:base+'tokenizer.json',chatTemplateUrl:base+'chat_template.jinja',tokenizerSha256:crypto.createHash('sha256').update(raw).digest('hex'),templateSha256:crypto.createHash('sha256').update(template).digest('hex')};
 console.log(key,JSON.stringify(output[key].tokens),'完整输入',c.ids.length);
 }fs.writeFileSync(path.join(root,'token-samples.js'),'/* UTF-8 · 官方分词快照；续写句为给定回放，不是模型生成。 */\nwindow.TOKEN_SAMPLES = '+JSON.stringify(output)+';\n','utf8');
})().catch(e=>{console.error(e);process.exitCode=1;});
