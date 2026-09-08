/* UTF-8 · 可暂停、拖动和重播的数值运动。硬件不移动；数据标记来自 Mermaid。 */
(function(root){
 'use strict';
 const locate=(ratio,count)=>{const t=Math.max(0,Math.min(1,ratio));const index=Math.min(count-1,Math.floor(t*count));return{index,local:t===1?1:t*count-index};};
 function create({container,assets,graph,paint,onTime,onStatus,onEnd,resolveNode,resolvePoint,route}){
  let phases=[],duration=8000,elapsed=0,last=0,raf=null,running=false,index=-1,overlay=null,marks=[],reduced=false;
  const ns='http://www.w3.org/2000/svg';
  const holder=document.createElement('div');holder.innerHTML=assets.packet.svg;const template=holder.querySelector('[data-hw-id="PACKET"]');
  function removeOverlay(){overlay?.remove();overlay=null;marks=[];}
  function clearFocus(){container.querySelectorAll('.motion-focus').forEach(n=>n.classList.remove('motion-focus'));}
  function point(id){if(resolvePoint)return resolvePoint(id);const n=assets[graph()].nodes[id];return n?{x:n.x+n.width/2,y:n.y+n.height/2}:null;}
  function prepare(phase){
   removeOverlay();clearFocus();paint(phase,index);
   phase.focus.forEach(id=>(resolveNode?resolveNode(id):container.querySelector(`[data-hw-id="${id}"]`))?.classList.add('motion-focus'));
   const svg=container.querySelector('svg');if(!svg||reduced)return;
   overlay=document.createElementNS(ns,'g');overlay.setAttribute('class','motion-overlay');overlay.setAttribute('aria-hidden','true');overlay.style.pointerEvents='none';svg.appendChild(overlay);
   for(const p of phase.packets){
    const a=point(p.from),b=point(p.to);if(!a||!b)continue;
    const node=template.cloneNode(true);node.removeAttribute('id');node.removeAttribute('data-hw-id');node.setAttribute('class','moving-value '+p.tone);
    const rect=node.querySelector('rect'),label=node.querySelector('.label'),text=node.querySelector('text');
    const width=Math.max(44,Array.from(p.label).reduce((w,c)=>w+(/[\u0000-\u007f]/.test(c)?10:18),0)+22);
    if(rect){rect.setAttribute('x',String(-width/2));rect.setAttribute('y','-17');rect.setAttribute('width',String(width));rect.setAttribute('height','34');rect.setAttribute('rx','6');}
    label?.setAttribute('transform','translate(0,0)');if(text){text.replaceChildren();text.textContent=p.label;text.setAttribute('x','0');text.setAttribute('y','6');text.setAttribute('text-anchor','middle');text.style.fontSize='18px';}
    overlay.appendChild(node);marks.push({node,a,b,packet:p,delay:p.delay||0});
   }
  }
  function draw(){
   if(!phases.length)return;const at=locate(elapsed/duration,phases.length);
   if(at.index!==index){index=at.index;prepare(phases[index]);}
   for(const m of marks){const t=Math.max(0,Math.min(1,(at.local-m.delay)/Math.max(.2,.85-m.delay))),ease=t*t*(3-2*t);
    const points=route?route(m.packet):[m.a,m.b];if(points.length<2){m.node.style.opacity='0';continue;}const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));let distance=lengths.reduce((a,b)=>a+b,0)*ease,j=0;while(j<lengths.length-1&&distance>lengths[j])distance-=lengths[j++];const ratio=lengths[j]?distance/lengths[j]:0,a=points[j],b=points[j+1];
    m.node.setAttribute('transform',`translate(${a.x+(b.x-a.x)*ratio},${a.y+(b.y-a.y)*ratio})`);m.node.style.opacity=at.local<m.delay?'0':String(t>.94?Math.max(0,(1-t)/.06):1);
   }
   onTime({ratio:elapsed/duration,index,local:at.local,count:phases.length});
  }
  function tick(now){if(!running)return;elapsed=Math.min(duration,elapsed+Math.max(0,now-last));last=now;draw();if(elapsed>=duration){running=false;raf=null;removeOverlay();onStatus(false);onEnd();}else raf=requestAnimationFrame(tick);}
  function pause(){running=false;if(raf!==null)cancelAnimationFrame(raf);raf=null;onStatus(false);}
  function play(){if(!phases.length)return;if(elapsed>=duration){elapsed=0;index=-1;}if(reduced){elapsed=duration;draw();onEnd();return;}if(running)return;running=true;last=performance.now();onStatus(true);raf=requestAnimationFrame(tick);}
  return{
   load(next,{milliseconds=8000,autoplay=true,reduce=false}={}){pause();removeOverlay();clearFocus();phases=next;duration=Math.max(1000,milliseconds);elapsed=autoplay&&!reduce?0:duration;index=-1;reduced=reduce;draw();if(autoplay)play();},
   pause,play,
   restart(){pause();elapsed=0;index=-1;draw();play();},
   seek(ratio){pause();elapsed=Math.max(0,Math.min(1,ratio))*duration;draw();},
   setDuration(ms){const fraction=elapsed/duration;duration=Math.max(1000,ms);elapsed=fraction*duration;last=performance.now();draw();},
   clear(){pause();removeOverlay();clearFocus();phases=[];index=-1;},
   get running(){return running;},get ended(){return elapsed>=duration;},get phases(){return phases;}
  };
 }
 const api={create,locate};root.HARDWARE_MOTION=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
