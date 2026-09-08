/* UTF-8 · 按当前页面资源清单输出可独立分发的离线 HTML。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..');let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m=>m[1]);
for(const file of css)html=html.replace(`<link rel="stylesheet" href="${file}">`,()=>'<style>\n'+fs.readFileSync(path.join(root,file),'utf8')+'\n</style>');
const scripts=[...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(m=>m[1]);
for(const file of scripts)html=html.replace(`<script src="${file}" defer></script>`,'');
const inline=scripts.map(file=>'<script>\n'+fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script')+'\n</script>').join('\n');html=html.replace('</body>',()=>inline+'\n</body>');
const output=path.join(root,'Groq_TSP_交互讲解.html');fs.writeFileSync(output,html,'utf8');console.log('已生成独立 HTML：'+Math.round(Buffer.byteLength(html)/1024)+' KiB，'+scripts.length+' 个内嵌脚本。');
