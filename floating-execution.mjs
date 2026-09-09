/* UTF-8 · 世界坐标中的执行面板，独立透视相机保持朝向并支持单独缩放。 */
import * as T from 'three';
import {CSS3DRenderer} from 'three/addons/renderers/CSS3DRenderer.js';

export class FloatingExecution {
 constructor({scene,host,panel,onChange}){
  this.onChange=onChange;this.zoom=1;
  this.panel=panel;this.root=new T.Group();this.root.name='硬件上方 · 执行面板';scene.add(this.root);this.root.add(panel.obj);
  this.css=new CSS3DRenderer();this.css.domElement.className='sl-world-css';host.insertBefore(this.css.domElement,host.querySelector('.sl-css'));
  this.frame=new T.Group();this.frame.name='悬浮面板边框';this.root.add(this.frame);this.reference=new T.PerspectiveCamera();
  const mat=new T.MeshBasicMaterial({color:0xa4b7bd});
  this.edges=Array.from({length:4},()=>{const mesh=new T.Mesh(new T.BoxGeometry(1,1,1),mat);this.frame.add(mesh);return mesh;});
  this.back=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshStandardMaterial({color:0xe7eef0,metalness:.25,roughness:.4,side:T.BackSide}));this.frame.add(this.back);
  this.frame.visible=false;
  this.css.domElement.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();this.setZoom(this.zoom*Math.exp(-event.deltaY*.001));},{passive:false});
 }
 layout(camera,viewport){
  const {w,h,x,y}=viewport;this.css.setSize(w,h);Object.assign(this.css.domElement.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
  this.reference.copy(camera);this.reference.aspect=w/h;this.reference.updateProjectionMatrix();this.reference.updateMatrixWorld();
  const width=Math.max(700,Math.min(980,w*.88)),height=446,depth=28;
  const unit=2*depth*Math.tan(T.MathUtils.degToRad(camera.fov)/2)/h;this.baseScale=unit;
  // 独立面板相机固定朝向；中央硬件旋转不改变它，滚轮只缩放面板。
  const centerY=height/2+28,local=new T.Vector3(0,(h/2-centerY)*unit,-depth);
  const o=this.panel.obj;o.position.copy(local.applyQuaternion(camera.quaternion).add(camera.position));o.quaternion.copy(camera.quaternion);
  o.rotateY(-.10);o.rotateX(.045);o.rotateZ(-.015);o.scale.setScalar(unit);
  this.panel.el.style.width=width+'px';this.panel.el.style.height=height+'px';this.panel.el.dataset.placement='world';
  this.frame.position.copy(o.position);this.frame.quaternion.copy(o.quaternion);
  const ww=width*unit,hh=height*unit,t=.045;
  for(let i=0;i<4;i++){const e=this.edges[i];e.position.set(i<2?0:(i===2?-ww:ww)/2,i<2?(i===0?hh:-hh)/2:0,-t);e.scale.set(i<2?ww+t:t,i<2?t:hh+t,t*2);}
  this.back.position.z=-t*2;this.back.scale.set(ww,hh,1);
  this.panel.worldSize={width:ww,height:hh};o.scale.setScalar(unit*this.zoom);this.frame.scale.setScalar(this.zoom);o.updateMatrixWorld(true);this.frame.updateMatrixWorld(true);
 }
 setZoom(value){this.zoom=T.MathUtils.clamp(value,.6,1.35);this.panel.obj.scale.setScalar(this.baseScale*this.zoom);this.frame.scale.setScalar(this.zoom);this.panel.el.querySelector('[data-action="float-zoom-reset"]')?.replaceChildren(document.createTextNode(Math.round(this.zoom*100)+'%'));this.panel.obj.updateMatrixWorld(true);this.frame.updateMatrixWorld(true);this.css.render(this.root,this.reference);this.onChange?.();}
 render(renderer){this.frame.visible=true;const clear=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(this.frame,this.reference);renderer.autoClear=clear;this.frame.visible=false;this.css.render(this.root,this.reference);}
}
