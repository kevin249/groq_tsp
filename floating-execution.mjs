/* UTF-8 · 世界坐标中的执行面板，独立透视相机保持朝向；窗口可缩放、拖动并记忆位置。 */
import * as T from 'three';
import {CSS3DRenderer} from 'three/addons/renderers/CSS3DRenderer.js';

const STORE='groq-tsp-floating-execution-v2';
const DEFAULT_ZOOM=.5;
const safeRead=()=>{try{return JSON.parse(localStorage.getItem(STORE)||'{}');}catch{return{};}};
const safeWrite=value=>{try{localStorage.setItem(STORE,JSON.stringify(value));}catch{}};
const FLOW_TARGETS={P0:['prompt','prefill'],P1:['tokenize','prefill'],P2:['embedding','prefill'],P3:['attnnorm','prefill'],P4:['finalnorm','prefill'],P5:['sample','prefill'],D0:['schedule','decode'],D1:['embedding','decode'],D2:['attnnorm','decode'],D3:['gpu-egress','decode'],D4:['gateup','decode'],D5:['gpu-return','decode'],D6:['ffnwrite','decode'],D7:['sample','decode']};
const ACTIONS=new Set(['float-zoom-in','float-zoom-out','float-zoom-reset','micro-prev','micro-next','focus-token','focus-ffn','focus-attn','focus-transfer']);

export class FloatingExecution {
 constructor({scene,host,panel,onChange}){
  this.onChange=onChange;this.host=host;this.panel=panel;const saved=safeRead();
  this.zoom=Number.isFinite(saved.zoom)?T.MathUtils.clamp(saved.zoom,.35,1.35):DEFAULT_ZOOM;
  this.offsetX=Number.isFinite(saved.x)?saved.x:0;this.offsetY=Number.isFinite(saved.y)?saved.y:0;
  this.viewport={w:1,h:1};this.drag=null;
  this.root=new T.Group();this.root.name='硬件上方 · 执行面板';scene.add(this.root);this.root.add(panel.obj);
  this.css=new CSS3DRenderer();this.css.domElement.className='sl-world-css';host.insertBefore(this.css.domElement,host.querySelector('.sl-css'));
  this.frame=new T.Group();this.frame.name='悬浮面板边框';this.root.add(this.frame);this.reference=new T.PerspectiveCamera();
  const mat=new T.MeshBasicMaterial({color:0xa4b7bd});
  this.edges=Array.from({length:4},()=>{const mesh=new T.Mesh(new T.BoxGeometry(1,1,1),mat);this.frame.add(mesh);return mesh;});
  this.back=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshStandardMaterial({color:0xe7eef0,metalness:.25,roughness:.4,side:T.BackSide}));this.frame.add(this.back);this.frame.visible=false;
  this.css.domElement.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();this.setZoom(this.zoom*Math.exp(-event.deltaY*.001));},{passive:false});
  // SemanticView 会重建 innerHTML，因此直接给每一轮新生成的控件绑定目标元素事件。
  this.observer=new MutationObserver(()=>this.bindControls());this.observer.observe(panel.el,{childList:true,subtree:true});this.bindControls();
  panel.el.addEventListener('pointerdown',event=>this.beginDrag(event));
  window.addEventListener('pointermove',event=>this.moveDrag(event));
  window.addEventListener('pointerup',event=>this.endDrag(event));
  window.addEventListener('pointercancel',event=>this.endDrag(event));
 }
 bindControls(){
  for(const b of this.panel.el.querySelectorAll('button[data-action]')){const a=b.dataset.action;if(!ACTIONS.has(a)||b.dataset.floatBound==='1')continue;b.dataset.floatBound='1';b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.runAction(a);});}
  for(const node of this.panel.el.querySelectorAll('[data-flow-node]')){if(node.dataset.floatBound==='1')continue;node.dataset.floatBound='1';const run=event=>{const spec=FLOW_TARGETS[node.dataset.flowNode];if(!spec)return;event.preventDefault();event.stopPropagation();this.navigate(...spec);};node.addEventListener('click',run);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')run(event);});}
  for(const handle of this.panel.el.querySelectorAll('.se-drag-handle')){if(handle.dataset.floatDblBound==='1')continue;handle.dataset.floatDblBound='1';handle.addEventListener('dblclick',event=>{if(event.target?.closest?.('button'))return;event.preventDefault();event.stopPropagation();this.resetLayout();});}
 }
 runAction(a){switch(a){case'float-zoom-in':this.setZoom(this.zoom+.1);break;case'float-zoom-out':this.setZoom(this.zoom-.1);break;case'float-zoom-reset':this.resetLayout();break;case'micro-prev':window.SPATIAL_LAB_APP?.microStep(-1);break;case'micro-next':window.SPATIAL_LAB_APP?.microStep(1);break;case'focus-token':this.navigate('tokenize','prefill');break;case'focus-ffn':this.navigate('gateup','decode');break;case'focus-attn':this.navigate('qk','decode',4);break;case'focus-transfer':this.navigate('gpu-egress','decode');break;}}
 navigate(id,phase,layer){const app=window.SPATIAL_LAB_APP;if(!app)return;if(app.state.phase!==phase)app.setMode(phase);if(layer)app.setLayer(layer);const s=app.state;let i=s.trace.findIndex(x=>x.phase===phase&&x.id===id&&(!layer||x.layer===layer));if(i<0)i=s.trace.findIndex(x=>x.id===id);if(i>=0)app.seek(i);}
 persist(){safeWrite({zoom:this.zoom,x:this.offsetX,y:this.offsetY});}
 beginDrag(event){const target=event.target,handle=target?.closest?.('.se-drag-handle');if(!handle||target?.closest?.('button,select,input,a,[role="button"]'))return;event.preventDefault();event.stopPropagation();this.drag={id:event.pointerId,x:event.clientX,y:event.clientY,ox:this.offsetX,oy:this.offsetY};handle.classList.add('dragging');try{handle.setPointerCapture(event.pointerId);}catch{}}
 moveDrag(event){if(!this.drag||event.pointerId!==this.drag.id)return;event.preventDefault();this.offsetX=this.drag.ox+event.clientX-this.drag.x;this.offsetY=this.drag.oy+event.clientY-this.drag.y;this.clampOffset();this.applyPlacement();this.onChange?.();}
 endDrag(event){if(!this.drag||event.pointerId!==this.drag.id)return;this.panel.el.querySelector('.se-drag-handle')?.classList.remove('dragging');this.drag=null;this.persist();this.onChange?.();}
 clampOffset(){const {w,h}=this.viewport,width=this.logicalWidth||800,height=this.logicalHeight||446,shownW=width*this.zoom,shownH=height*this.zoom,keepX=40,keepY=30,baseY=height/2+28;const cx=w/2+this.offsetX,cy=baseY+this.offsetY;const minX=keepX-shownW/2,maxX=w-keepX+shownW/2,minY=keepY-shownH/2,maxY=h-keepY+shownH/2;this.offsetX=T.MathUtils.clamp(cx,minX,maxX)-w/2;this.offsetY=T.MathUtils.clamp(cy,minY,maxY)-baseY;}
 applyPlacement(){if(!this.baseScale||!this.reference)return;const camera=this.reference,{w,h}=this.viewport,width=this.logicalWidth,height=this.logicalHeight,depth=28,unit=this.baseScale;const centerY=height/2+28+this.offsetY,local=new T.Vector3(this.offsetX*unit,(h/2-centerY)*unit,-depth),o=this.panel.obj;o.position.copy(local.applyQuaternion(camera.quaternion).add(camera.position));o.quaternion.copy(camera.quaternion);o.rotateY(-.10);o.rotateX(.045);o.rotateZ(-.015);o.scale.setScalar(unit*this.zoom);this.frame.position.copy(o.position);this.frame.quaternion.copy(o.quaternion);this.frame.scale.setScalar(this.zoom);o.updateMatrixWorld(true);this.frame.updateMatrixWorld(true);}
 layout(camera,viewport){const {w,h,x,y}=viewport;this.viewport={w,h,x,y};this.css.setSize(w,h);Object.assign(this.css.domElement.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});this.reference.copy(camera);this.reference.aspect=w/h;this.reference.updateProjectionMatrix();this.reference.updateMatrixWorld();const width=Math.max(700,Math.min(980,w*.88)),height=446,depth=28;this.logicalWidth=width;this.logicalHeight=height;const unit=2*depth*Math.tan(T.MathUtils.degToRad(camera.fov)/2)/h;this.baseScale=unit;this.panel.el.style.width=width+'px';this.panel.el.style.height=height+'px';this.panel.el.dataset.placement='world';const ww=width*unit,hh=height*unit,t=.045;for(let i=0;i<4;i++){const e=this.edges[i];e.position.set(i<2?0:(i===2?-ww:ww)/2,i<2?(i===0?hh:-hh)/2:0,-t);e.scale.set(i<2?ww+t:t,i<2?t:hh+t,t*2);}this.back.position.z=-t*2;this.back.scale.set(ww,hh,1);this.panel.worldSize={width:ww,height:hh};this.clampOffset();this.applyPlacement();this.updateZoomLabel();this.bindControls();}
 updateZoomLabel(){this.panel.el.querySelector('[data-action="float-zoom-reset"]')?.replaceChildren(document.createTextNode(Math.round(this.zoom*100)+'%'));}
 setZoom(value){this.zoom=T.MathUtils.clamp(value,.35,1.35);this.clampOffset();this.applyPlacement();this.updateZoomLabel();this.persist();this.css.render(this.root,this.reference);this.onChange?.();}
 resetLayout(){this.zoom=DEFAULT_ZOOM;this.offsetX=0;this.offsetY=0;this.clampOffset();this.applyPlacement();this.updateZoomLabel();this.persist();this.css.render(this.root,this.reference);this.onChange?.();}
 render(renderer){this.frame.visible=true;const clear=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(this.frame,this.reference);renderer.autoClear=clear;this.frame.visible=false;this.css.render(this.root,this.reference);}
}
