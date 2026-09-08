/* UTF-8 · 渲染 Mermaid 硬件图，并保存每个单元的坐标。 */
'use strict';
const fs=require('node:fs');const path=require('node:path');const{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const A=require('../hardware-atlas-map.js');const atlasLayout=A.layout(A.context());
const clusterLayout=require('../cluster-map.js');
const cycleLayout=require('../cycle-map.js');
(async()=>{
 const exe=[process.env.GROQ_RENDER_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(fs.existsSync);
 const browser=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1800,height:1200}});
  await page.setContent('<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><body><div id="render"></div></body></html>');
  await page.addScriptTag({path:path.join(__dirname,'node_modules/mermaid/dist/mermaid.min.js')});
  const output={};
  for(const name of fs.readdirSync(path.join(root,'hardware')).filter(n=>n.endsWith('.mmd')).sort()){
   const key=path.basename(name,'.mmd');const source=fs.readFileSync(path.join(root,'hardware',name),'utf8');
   const rendered=await page.evaluate(async({key,source,atlasLayout,clusterLayout,cycleLayout})=>{
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',fontFamily:'Microsoft YaHei, Segoe UI, sans-serif',themeVariables:{fontSize:key==='die'?'8px':key==='request10'?'18px':'15px',primaryColor:'#edf4f9',primaryTextColor:'#203c50',primaryBorderColor:'#8ba4b6',lineColor:'#607f97',background:'#ffffff'},block:{padding:key==='die'?2:key==='request10'?5:10},flowchart:{htmlLabels:false},htmlLabels:false});
    const{svg}=await mermaid.render('hw_'+key,source);document.getElementById('render').innerHTML=svg;
    const el=document.querySelector('#render svg');
    if(key==='cycle9'){
     for(const n of el.querySelectorAll('g.node')){const id=n.id.replace(/^hw_cycle9-/,''),b=cycleLayout.nodes[id];if(!b)throw Error('缺少逐周期硬件 '+id);n.setAttribute('transform',`translate(${b.x+b.w/2},${b.y+b.h/2})`);n.dataset.owner=b.owner;n.dataset.kind=b.kind;const r=n.querySelector('rect');r.setAttribute('x',-b.w/2);r.setAttribute('y',-b.h/2);r.setAttribute('width',b.w);r.setAttribute('height',b.h);r.setAttribute('rx',b.kind==='frame'?7:3);n.querySelector('.label')?.setAttribute('transform','translate(0,0)');const t=n.querySelector('text');t.textContent=b.kind==='frame'?'':b.label;t.setAttribute('x',0);t.setAttribute('y',5);t.setAttribute('text-anchor','middle');t.style.fontSize=(b.kind==='cell'||b.kind==='register'?'14':b.kind==='caption'?'15':'17')+'px';}
     el.setAttribute('viewBox',`0 0 ${cycleLayout.width} ${cycleLayout.height}`);el.setAttribute('style','max-width:100%;background:transparent');
    }
    if(key==='cluster6'){
     for(const n of el.querySelectorAll('g.node')){const id=n.id.replace(/^hw_cluster6-/,''),b=clusterLayout.nodes[id];if(!b)throw Error('缺少多片硬件 '+id);n.setAttribute('transform',`translate(${b.x+b.w/2},${b.y+b.h/2})`);n.dataset.owner=b.owner;n.dataset.kind=b.kind;n.dataset.color=b.color;const r=n.querySelector('rect');r.setAttribute('x',-b.w/2);r.setAttribute('y',-b.h/2);r.setAttribute('width',b.w);r.setAttribute('height',b.h);r.setAttribute('rx',b.kind==='chip'?8:3);n.querySelector('.label')?.setAttribute('transform','translate(0,0)');const t=n.querySelector('text');t.textContent=['frame','chip'].includes(b.kind)?'':b.label;t.setAttribute('x',0);t.setAttribute('y',5);t.setAttribute('text-anchor','middle');t.style.fontSize=(b.kind==='slice'?'11':b.kind==='tile'?'9':'14')+'px';}
     el.setAttribute('viewBox',`0 0 ${clusterLayout.width} ${clusterLayout.height}`);el.setAttribute('style','max-width:100%;background:transparent');
    }
    if(key==='atlas'){
      // 全部形状来自 Mermaid；整理为同一块芯片上的物理区域与原位展开单元。
      for(const n of el.querySelectorAll('g.node')){
        const id=n.id.replace(/^hw_atlas-/,''),b=atlasLayout.nodes[id];if(!b)throw new Error('固定场景缺少 '+id);
        n.setAttribute('transform',`translate(${b.x+b.w/2},${b.y+b.h/2})`);n.dataset.owner=b.owner;n.dataset.kind=b.kind;
        const r=n.querySelector('rect');r.setAttribute('x',-b.w/2);r.setAttribute('y',-b.h/2);r.setAttribute('width',Math.max(1,b.w));r.setAttribute('height',Math.max(1,b.h));r.setAttribute('rx',b.kind==='frame'?8:2);
        n.querySelector('.label')?.setAttribute('transform','translate(0,0)');const t=n.querySelector('text');t.textContent=b.kind==='tile'||b.kind==='region'?'':b.label;t.setAttribute('x','0');t.setAttribute('y','4');t.setAttribute('text-anchor','middle');t.style.fontSize='12px';
        if(b.kind==='frame'){t.setAttribute('x',-b.w/2+16);t.setAttribute('y',-b.h/2+23);t.setAttribute('text-anchor','start');}
        n.style.opacity=b.visible?'1':'0';n.style.pointerEvents=b.visible?'auto':'none';
      }
      el.setAttribute('viewBox',`0 0 ${atlasLayout.width} ${atlasLayout.height}`);el.setAttribute('style','max-width:100%;background:transparent');
    }
    if(key==='die'){
      // 对 Mermaid 生成的单元做比例整理：空 tile 压缩高度，标题保持可读。
      // 区域次序依据论文图 5；SRAM 的 8 列为 44 个切片的压缩显示。
      const zoneWidths=[['MW0',72],['MW1',72],['SW',44],['MEMW',252],['VX',90],['MEME',252],['SE',44],['ME0',72],['ME1',72]];
      const byId={};for(const n of el.querySelectorAll('g.node'))byId[n.id.replace(/^hw_die-/,'')]=n;
      function place(id,x,y,w,h,text){
        const n=byId[id];if(!n)return;n.setAttribute('transform',`translate(${x},${y})`);
        const rect=n.querySelector('rect');if(rect){rect.setAttribute('x',-w/2);rect.setAttribute('y',-h/2);rect.setAttribute('width',w);rect.setAttribute('height',h);rect.setAttribute('rx','1');}
        const label=n.querySelector('.label');if(label)label.setAttribute('transform','translate(0,0)');
        const t=n.querySelector('text');if(t){t.textContent=text===undefined?t.textContent:text;t.setAttribute('x','0');t.setAttribute('y','4');t.setAttribute('text-anchor','middle');t.setAttribute('style','font-size:12px;fill:#203c50');}
      }
      let start=16;
      for(const[id,w]of zoneWidths){const x=start+w/2;place(id,x,246,w,354,'');place(id+'HEAD',x,83,w-4,27);
        const cols=id.startsWith('MEM')?8:1;for(let r=0;r<20;r++)for(let c=0;c<cols;c++)place(id+'R'+r+(cols>1?'C'+c:''),start+5+(w-10)/cols*(c+.5),109+(19-r)*15.5,(w-10)/cols-2,12,'');start+=w+6;}
      const full=start+10;place('NORTH',full/2,34,full-32,30,'C2C · 与其他芯片连接');place('CONTROL',full/2,435,full-32,23,'ICU · 指令从底部沿各切片向上传播');place('PCIE',134,467,236,30,'主机接口');place('SOUTH',(full+268)/2,467,full-300,30,'C2C · 片间传输');
      el.setAttribute('viewBox',`0 0 ${full} 490`);el.setAttribute('style','max-width:100%;background:transparent');
    }
    if(key==='memory'){
      const byId={};for(const n of el.querySelectorAll('g.node'))byId[n.id.replace(/^hw_memory-/,'')]=n;
      function place(id,x,y,w,h){const n=byId[id];if(!n)return;n.setAttribute('transform',`translate(${x},${y})`);const rect=n.querySelector('rect');if(rect){rect.setAttribute('x',-w/2);rect.setAttribute('y',-h/2);rect.setAttribute('width',w);rect.setAttribute('height',h);}const lab=n.querySelector('.label');if(lab)lab.setAttribute('transform','translate(0,0)');const t=n.querySelector('text');if(t){const lines=Array.from(t.querySelectorAll('.text-outer-tspan')).map(v=>v.textContent);if(!lines.length)lines.push(t.textContent);t.replaceChildren();t.setAttribute('x','0');t.setAttribute('y',String(5-(lines.length-1)*9));t.setAttribute('text-anchor','middle');lines.forEach((line,i)=>{const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');span.setAttribute('x','0');if(i)span.setAttribute('dy','18');span.textContent=line;t.appendChild(span);});}}
      place('ADDRREG',200,35,370,48);place('DECODER',600,35,370,48);
      for(let b=0;b<2;b++){const left=10+b*400;place('BANK'+b,left+190,205,380,258);place('BANK'+b+'HEAD',left+190,96,358,27);for(let r=0;r<4;r++){place('A'+b+r,left+35,144+r*49,44,40);for(let l=0;l<4;l++)place(`B${b}R${r}L${l}`,left+106+l*73,144+r*49,65,40);}}
      place('READOUT',400,395,780,90);place('READHEAD',400,364,752,24);for(let i=0;i<4;i++)place('R'+i,110+i*193,407,177,46);
      el.setAttribute('viewBox','0 0 800 450');
    }
    if(key==='cluster'){
      const byId={};for(const n of el.querySelectorAll('g.node'))byId[n.id.replace(/^hw_cluster-/,'')]=n;
      function place(id,x,y,w,h,label){
        const n=byId[id];if(!n)return;n.setAttribute('transform',`translate(${x},${y})`);
        const rect=n.querySelector('rect');if(rect){rect.setAttribute('x',-w/2);rect.setAttribute('y',-h/2);rect.setAttribute('width',w);rect.setAttribute('height',h);rect.setAttribute('rx','3');}
        const group=n.querySelector('.label');if(group)group.setAttribute('transform','translate(0,0)');
        const t=n.querySelector('text');if(t){t.textContent=label;t.setAttribute('x','0');t.setAttribute('y','5');t.setAttribute('text-anchor','middle');t.setAttribute('style','font-size:15px;fill:#203c50');}
      }
      for(let i=0;i<4;i++){
        const x=210+(i%2)*420,y=108+Math.floor(i/2)*213;
        place('CHIP'+i,x,y,388,196,'');place('CHIP'+i+'HEAD',x,y-72,360,28,'LPU 分片 '+(i+1));
        for(let r=0;r<3;r++)for(let c=0;c<4;c++)place(`C${i}R${r}L${c}`,x-138+c*92,y-33+r*29,86,25,c<2?'SRAM':'MAC');
        place('C'+i+'OUT',x,y+66,360,45,'激活寄存器 · 等待');
      }
      place('C2C',420,447,808,30,'C2C · 编译安排的片间传输');el.setAttribute('viewBox','0 0 840 475');
    }
    const box=el.viewBox.baseVal;
    const nodes={};
    for(const node of el.querySelectorAll('g.node')){
      const raw=node.getAttribute('id');let id=raw.replace(/^hw_[^-]+-/,'').replace(/^flowchart-/,'').replace(/-\d+$/,'');
      node.dataset.hwId=id;
      const b=node.getBBox();const m=node.getCTM();const inv=el.getCTM().inverse();const transform=inv.multiply(m);
      const p=el.createSVGPoint();p.x=b.x;p.y=b.y;const origin=p.matrixTransform(transform);
      nodes[id]={x:origin.x,y:origin.y,width:b.width*transform.a,height:b.height*transform.d};
    }
    return{svg:el.outerHTML,viewBox:{x:box.x,y:box.y,width:box.width,height:box.height},nodes};
   },{key,source,atlasLayout:key==='atlas'?atlasLayout:null,clusterLayout:key==='cluster6'?{nodes:clusterLayout.nodes,width:clusterLayout.width,height:clusterLayout.height}:null,cycleLayout:key==='cycle9'?cycleLayout:null});
   output[key]=rendered;fs.writeFileSync(path.join(root,'hardware',key+'.svg'),rendered.svg,'utf8');
   console.log(key,rendered.viewBox,'单元',Object.keys(rendered.nodes).length,'示例',Object.keys(rendered.nodes).slice(0,6));
  }
  fs.writeFileSync(path.join(root,'hardware-diagrams.js'),'/* UTF-8 · Mermaid 生成的硬件图及单元坐标。 */\nwindow.HARDWARE_SVGS = '+JSON.stringify(output)+';\n','utf8');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
