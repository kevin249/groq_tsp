/* UTF-8 · 镜头只改变观察范围，硬件仍使用同一组 Mermaid 物理坐标。 */
(function(root){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),ease=t=>t*t*(3-2*t);
 function frame(cx,cy,w,h,zoom=1){const z=clamp(zoom,.6,2.5);return{x:cx-w/z/2,y:cy-h/z/2,w:w/z,h:h/z};}
 function bounds(boxes,padding=20){const b=boxes.filter(Boolean);if(!b.length)return{x:0,y:0,w:650,h:450};const x=Math.min(...b.map(n=>n.x)),y=Math.min(...b.map(n=>n.y));return{x:x-padding,y:y-padding,w:Math.max(...b.map(n=>n.x+(n.w??n.width)))-x+2*padding,h:Math.max(...b.map(n=>n.y+(n.h??n.height)))-y+2*padding};}
 function cluster(map,{phase={focus:[],packets:[]},local=0,chip=0,mode='follow',zoom=1}={}){
  if(mode==='board')return{box:{x:0,y:0,w:map.width,h:map.height},label:'四片总览 · 选择芯片查看内部',chip:null};
  const die=i=>map.nodes['C'+i+'_DIE'],owner=id=>map.nodes[id]?.owner,center=b=>({x:b.x+b.w/2,y:b.y+b.h/2});
  const focused=phase.focus.map(owner).find(v=>/^C\d$/.test(v||''));let active=mode==='chip'?chip:focused?Number(focused[1]):chip;const selected=die(active)||die(0);let c=center(selected),label='TSP '+active+' · 芯片内部';
  const packet=phase.packets.find(p=>p.wire)||phase.packets.find(p=>p.tone!=='control')||phase.packets[0];
  if(mode==='follow'&&packet){const aOwner=owner(packet.from),bOwner=owner(packet.to),aChip=/^C\d$/.test(aOwner||'')?Number(aOwner[1]):null,bChip=/^C\d$/.test(bOwner||'')?Number(bOwner[1]):null;
   if(aOwner!==bOwner){const a=aChip!==null?center(die(aChip)):center(map.nodes[packet.from]),b=bChip!==null?center(die(bChip)):center(map.nodes[packet.to]);const t=ease(clamp((local-.25)/.45,0,1));c={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};active=t<.5?aChip:bChip;label=(aChip===null?'主机':'TSP '+aChip)+' → '+(bChip===null?'主机':'TSP '+bChip)+(packet.wire?' · C2C 传输':' · 输入 / 返回');}
   else if(aChip===null){c=center(map.nodes[packet.to]);active=null;label='芯片外 · 主机与请求缓冲';}
  }
  let box=frame(c.x,c.y,658,450,zoom);box.x=clamp(box.x,0,Math.max(0,map.width-box.w));box.y=clamp(box.y,0,Math.max(0,map.height-box.h));return{box,label,chip:active};
 }
 function single(layout,{focus=[],overview=false,zoom=1,external=false}={}){
  if(overview)return{x:0,y:0,w:1224,h:external?1020:760};
  const chosen=focus.map(id=>layout.nodes[id]).filter(b=>b&&b.visible!==false),b=bounds(chosen,35);const w=Math.max(620,b.w),h=Math.max(380,b.h);return frame(b.x+b.w/2,b.y+b.h/2,w,h,zoom);
 }
 const serialize=b=>[b.x,b.y,b.w,b.h].map(n=>Math.round(n*100)/100).join(' ');
 const api={cluster,single,bounds,serialize};root.GROQ_VIEWPORT=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
