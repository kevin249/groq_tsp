/* UTF-8 · 按当前页面资源清单输出可独立分发的离线 HTML。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..');let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
/* 独立动画从首次绘制起就是三维入口，避免先显示旧的 cluster 工作区。 */
const bodyWorkspace=/(<body\b[^>]*\bdata-workspace=")[^"]+("[^>]*>)/i;
if(!bodyWorkspace.test(html))throw new Error('index.html 缺少 data-workspace，无法生成三维入口。');
html=html.replace(bodyWorkspace,'$1spatial$2');
const css=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m=>m[1]);
for(const file of css)html=html.replace(`<link rel="stylesheet" href="${file}">`,()=>'<style>\n'+fs.readFileSync(path.join(root,file),'utf8')+'\n</style>');
const scripts=[...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(m=>m[1]);
for(const file of scripts)html=html.replace(`<script src="${file}" defer></script>`,'');
const inline=scripts.map(file=>'<script>\n'+fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script')+'\n</script>').join('\n');html=html.replace('</body>',()=>inline+'\n</body>');
const output=path.join(root,'Groq_TSP_交互讲解.html');fs.writeFileSync(output,html,'utf8');console.log('已生成独立 HTML：'+Math.round(Buffer.byteLength(html)/1024)+' KiB，'+scripts.length+' 个内嵌脚本。');
