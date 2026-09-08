/* UTF-8 · 共享三维空间相机：轨迹球、平移、缩放与点击区分。 */
(function(root){
 'use strict';
 function create({container,stage,onChange=()=>{}}){
  let tilted=true;
  // 四元数轨迹球作用于整个空间；卡片使用逆旋转保持文字朝向观察者。
  const unit=q=>{const n=Math.hypot(...q);return n>1e-12?q.map(v=>v/n):[0,0,0,1];};
  const multiply=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  const axis=(x,y,z,deg)=>{const t=deg*Math.PI/360;return[x*Math.sin(t),y*Math.sin(t),z*Math.sin(t),Math.cos(t)];};
  const initialRotation=()=>unit(multiply(axis(1,0,0,38),axis(0,0,1,-6)));
  const camera={rotation:initialRotation(),zoom:1,panX:0,panY:0};
  let gesture=null,ignoreClick=false;
  function matrix([x,y,z,w]){return'matrix3d('+[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,0,0,0,1].map(v=>Math.abs(v)<1e-10?0:Number(v.toFixed(10))).join(',')+')';}
  const cameraValue=()=>({...camera,rotation:[...camera.rotation],tilted});
  function paintCamera(){
   const q=camera.rotation;tilted=Math.hypot(q[0],q[1],q[2])>1e-7;
   stage.style.setProperty('--space-rotation',matrix(q));stage.style.setProperty('--space-inverse',matrix([-q[0],-q[1],-q[2],q[3]]));
   stage.style.setProperty('--space-zoom',String(camera.zoom));stage.style.setProperty('--space-pan-x',camera.panX+'px');stage.style.setProperty('--space-pan-y',camera.panY+'px');
   stage.dataset.tilted=String(tilted);onChange(cameraValue());
  }
  function setCamera(next={}){
   if(next.rotation?.length===4&&next.rotation.every(Number.isFinite))camera.rotation=unit(next.rotation);
   if(Number.isFinite(next.zoom))camera.zoom=Math.max(.45,Math.min(2.2,next.zoom));
   for(const key of ['panX','panY'])if(Number.isFinite(next[key]))camera[key]=next[key];
   paintCamera();
  }
  function resetCamera(){setCamera({rotation:initialRotation(),zoom:1,panX:0,panY:0});}
  function ball(x,y,frame){
   const px=(x-frame.x)/frame.radius,py=(y-frame.y)/frame.radius,d=px*px+py*py;
   return d<=1?[px,py,Math.sqrt(1-d)]:[px/Math.sqrt(d),py/Math.sqrt(d),0];
  }
  function turn(a,b){
   const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=a.reduce((s,v,i)=>s+v*b[i],0);
   if(dot<-.999999){const other=Math.abs(a[0])<.9?[1,0,0]:[0,1,0];return unit([a[1]*other[2]-a[2]*other[1],a[2]*other[0]-a[0]*other[2],a[0]*other[1]-a[1]*other[0],0]);}
   return unit([...cross,1+dot]);
  }
  container.tabIndex=0;container.setAttribute('role','group');container.setAttribute('aria-label','三维硬件空间：拖动旋转，滚轮缩放，右键或 Shift 拖动平移；聚焦后方向键旋转，Home 复位');
  container.addEventListener('pointerdown',e=>{
   if(e.target.closest?.('[data-space-ui]')){ignoreClick=false;return;}
   if(gesture||![0,1,2].includes(e.button)||e.isPrimary===false)return;
   ignoreClick=false;const b=container.getBoundingClientRect(),frame={x:b.left+b.width/2+camera.panX,y:b.top+b.height*.54+camera.panY,radius:Math.max(80,Math.min(b.width,b.height)*.46)};
   gesture={id:e.pointerId,x:e.clientX,y:e.clientY,pan:e.button!==0||e.shiftKey,moved:false,frame,vector:ball(e.clientX,e.clientY,frame),start:cameraValue()};
   if(e.button!==0)e.preventDefault();
  });
  root.addEventListener('pointermove',e=>{
   const g=gesture;if(!g||e.pointerId!==g.id)return;
   const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.moved&&Math.hypot(dx,dy)<5)return;
   if(!g.moved){g.moved=true;container.setPointerCapture(e.pointerId);container.dataset.orbiting='true';}
   e.preventDefault();
   if(g.pan)setCamera({panX:g.start.panX+dx,panY:g.start.panY+dy});
   else setCamera({rotation:multiply(turn(g.vector,ball(e.clientX,e.clientY,g.frame)),g.start.rotation)});
  },{passive:false});
  function endGesture(e){
   const g=gesture;if(!g||(e?.pointerId!==undefined&&e.pointerId!==g.id))return;
   gesture=null;ignoreClick=g.moved;delete container.dataset.orbiting;
   if(container.hasPointerCapture(g.id))container.releasePointerCapture(g.id);
  }
  root.addEventListener('pointerup',endGesture);root.addEventListener('pointercancel',endGesture);root.addEventListener('blur',()=>endGesture());
  container.addEventListener('lostpointercapture',endGesture);
  container.addEventListener('click',e=>{if(ignoreClick&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();ignoreClick=false;}},true);
  container.addEventListener('contextmenu',e=>{if(!e.target.closest?.('[data-space-ui]'))e.preventDefault();});
  container.addEventListener('wheel',e=>{if(gesture||e.target.closest?.('[data-space-ui]'))return;e.preventDefault();const d=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?container.clientHeight:1);setCamera({zoom:camera.zoom*Math.exp(-Math.max(-160,Math.min(160,d))*.0018)});},{passive:false});
  container.addEventListener('keydown',e=>{
   if(e.target!==container||e.ctrlKey||e.metaKey||e.altKey)return;
   const move={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
   if(move){if(e.shiftKey)setCamera({panX:camera.panX+move[0]*20,panY:camera.panY+move[1]*20});else setCamera({rotation:multiply(axis(-move[1],move[0],0,10),camera.rotation)});}
   else if(e.key==='+'||e.key==='=')setCamera({zoom:camera.zoom*1.15});else if(e.key==='-')setCamera({zoom:camera.zoom/1.15});else if(e.key==='Home')resetCamera();else return;
   e.preventDefault();e.stopPropagation();
  });
  paintCamera();
  return{set:setCamera,reset:resetCamera,preset:tilt=>setCamera({rotation:tilt?initialRotation():[0,0,0,1]}),get value(){return cameraValue();},get dragging(){return Boolean(gesture?.moved);}};
 }
 root.GROQ_SPATIAL_CAMERA={create};
})(window);
