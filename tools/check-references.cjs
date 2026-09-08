/* UTF-8 · 参考资料只使用公开网上链接；无需安装依赖或连接网络。 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const skipped=new Set(['.git','node_modules','预览','reports']);
const texts=[];
const decoder=new TextDecoder('utf-8',{fatal:true});
function collect(dir){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,item.name);
  if(item.isDirectory()){if(!skipped.has(item.name))collect(full);}
  else if(/\.(?:html|js|mjs|cjs|md|css|mmd|svg|json)$/.test(item.name))texts.push({full,file:path.relative(root,full),text:decoder.decode(fs.readFileSync(full))});
 }
}
function publicLink(link,where){
 const url=new URL(link);
 assert.ok(['http:','https:'].includes(url.protocol),where+'：资料链接必须使用 HTTP(S)');
 assert.ok(!url.username&&!url.password,where+'：资料链接不得包含凭据');
 const host=url.hostname.replace(/^\[|\]$/g,'');
 assert.ok(host.includes('.')&&!net.isIP(host)&&!/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host),where+'：资料链接必须指向公开网站');
}
let checks=0;
function check(name,fn){fn();checks++;console.log('通过：'+name);}
collect(root);
check('源码与说明不引用本机研究文件，仓库内部文档链接有效',()=>{
 for(const {full,file,text}of texts){
  assert.ok(!/(?:\.\.[\\/])+(?:资料库|资料索引|专题研究)/.test(text),file+'：仍有外部研究目录引用');
  if(!file.endsWith('.md'))continue;
  for(const m of text.matchAll(/\[[^\]\n]*\]\((<?[^\s)]+>?)\)/g)){
   const link=m[1].replace(/^<|>$/g,'');
   if(link.startsWith('#'))continue;
   if(/^[a-z][a-z\d+.-]*:/i.test(link)){publicLink(link,file);continue;}
   assert.ok(!/^(?:[\\/]|[a-z]:)/i.test(link),file+'：不得引用本机绝对路径');
   const target=decodeURIComponent(link.split(/[?#]/)[0]);
   const relative=path.relative(root,path.resolve(path.dirname(full),target));
   assert.ok(relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),file+'：链接超出动画仓库');
   assert.ok(fs.existsSync(path.resolve(path.dirname(full),target)),file+'：文档链接目标不存在：'+target);
   assert.ok(!/\.(?:pdf|pptx?|docx?|xlsx?)$/i.test(target),file+'：外部资料须使用网上原文链接');
  }
 }
});
check('源码与独立网页的资料清单只保留公开 URL，没有本地回退入口',()=>{
 let tables=0;
 for(const {file,text}of texts.filter(x=>/\.(?:html|js)$/.test(x.file))){
  for(const m of text.matchAll(/const sources=\[([\s\S]*?)\n \];/g)){
   const sources=vm.runInNewContext('['+m[1]+']');
   assert.ok(sources.length>0,file);
   for(const source of sources){publicLink(source.url,file+'：'+source.name);assert.ok(!Object.hasOwn(source,'local'),file+'：不得保留本地资料字段');}
   tables++;
  }
  assert.ok(!/s\.url\s*\|\|\s*s\.local/.test(text),file+'：不得回退至本地资料');
 }
 assert.ok(tables>1,'应同时检查源码与打包后的资料清单');
});
check('网页资料按钮均指向网上原文，HTML 的内嵌脚本语法完整',()=>{
 for(const {file,text}of texts.filter(x=>/\.(?:html|js)$/.test(x.file))){
  for(const m of text.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/g)){
   const link=m[2];
   if(link.startsWith('#')||link==="'+esc(s.url)+'")continue;
   publicLink(link,file);
  }
  if(file.endsWith('.html')){
   for(const m of text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1],{filename:file});
  }
 }
});
check('独立 HTML 内嵌运行资源，查阅网上资料不影响离线动画',()=>{
 const html=fs.readFileSync(path.join(root,'Groq_TSP_交互讲解.html'),'utf8');
 assert.ok(!/<(?:script|img|iframe|audio|video|source)\b[^>]*\bsrc\s*=\s*["'](?!data:)/i.test(html),'独立网页不得加载外部运行资源');
 assert.ok(!/<link\b[^>]*\brel=["']stylesheet["']/i.test(html),'样式必须内嵌');
 const styles=[...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
 for(const m of styles.matchAll(/url\(\s*["']?([^\s)'";]+)/g))assert.ok(/^(?:#|data:)/.test(m[1]),'样式资源必须内嵌：'+m[1]);
});
console.log(`全部 ${checks} 组引用检查通过，覆盖 ${texts.length} 个文本文件。站点实时可用性需另行联网核对。`);
