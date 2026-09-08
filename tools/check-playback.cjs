/* UTF-8 · 执行真实应用初始化与动画时钟，使用轻量界面替身；不启动浏览器。 */
'use strict';
const {writeReport}=require('./report.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),P=require('../performance-model.js'),A=require('../hardware-atlas-map.js'),M=require('../cluster-map.js');
const log=[],check=(name,fn)=>{fn();log.push(name);console.log('通过：'+name);};
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attrs={};this.listeners={};this.textContent='';this.value='8000';this.clientWidth=1100;this.clientHeight=600;this.scrollLeft=this.scrollTop=this.offsetTop=0;const set=new Set();this.classList={add:(...a)=>a.forEach(v=>set.add(v)),remove:(...a)=>a.forEach(v=>set.delete(v)),toggle:(v,on)=>on?set.add(v):set.delete(v),contains:v=>set.has(v)};}
 showModal(){this.open=true;} close(){this.open=false;}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatchEvent(e){for(const fn of this.listeners[e.type]||[])fn(e);}
 setAttribute(k,v){this.attrs[k]=String(v);} getAttribute(k){return this.attrs[k]??null;} removeAttribute(k){delete this.attrs[k];}
 appendChild(n){this.children.push(n);n.parent=this;return n;} remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 replaceChildren(...a){this.children=a;} cloneNode(){const e=new Element(this.tag);e.attrs={...this.attrs};e.dataset={...this.dataset};e.children=this.children.map(n=>n.cloneNode());return e;}
 querySelector(s){if(s==='[data-hw-id="PACKET"]')return this.packet;const tag=s==='.label'?'label':s;return this.children.find(c=>c.tag===tag)||this.children.map(c=>c.querySelector(s)).find(Boolean)||null;}
 querySelectorAll(){return[];} closest(){return this;} focus(){} scrollIntoView(){} scrollTo(p){this.scrollLeft=p.left;this.scrollTop=p.top;}
 set innerHTML(v){this.html=v;if(v==='packet'){this.packet=new Element('g');this.packet.appendChild(new Element('rect'));const label=this.packet.appendChild(new Element('label'));label.appendChild(new Element('text'));}} get innerHTML(){return this.html||'';}
}
function fixture(){
 const ids=[...read('index.html').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),els=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const body=new Element(),document=new Element();body.dataset.workspace='cluster';document.body=body;document.hidden=false;document.getElementById=id=>{assert.ok(els[id],'缺少页面元素 '+id);return els[id];};document.querySelector=()=>new Element();document.querySelectorAll=()=>[];document.createElement=tag=>new Element(tag);document.createElementNS=(_,tag)=>new Element(tag);
 els['detail-drawer'].appendChild(new Element('.drawer-content'));els['detail-drawer'].appendChild(new Element('.software-guide'));
 for(const id of ['lab-canvas','cluster-canvas'])els[id].appendChild(new Element('svg'));
 let now=0,serial=0;const frames=new Map(),timers=new Map(),env=new Element();
 Object.assign(env,{document,innerWidth:1600,scrollY:0,matchMedia:()=>({matches:false}),performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:key=>frames.delete(key),setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:key=>timers.delete(key),Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},console});env.window=env;
 env.GROQ_VIEWPORT=require('../hardware-viewport.js');env.GROQ_PERFORMANCE=P;env.GROQ_PERFORMANCE_LESSONS=require('../performance-lessons.js');env.HARDWARE_ATLAS_MAP=A;env.HARDWARE_DATA=require('../hardware-data.js');env.GROQ_OPERATORS=require('../operator-lessons.js');env.GROQ_SOFTWARE_FLOW={create:()=>({render(){}})};env.GROQ_CLUSTER=require('../cluster-model.js');env.GROQ_CLUSTER_MAP=M;env.GROQ_CLUSTER_LESSONS=require('../cluster-lessons.js');env.HARDWARE_SVGS={packet:{svg:'packet'},cluster6:{svg:'cluster'},atlas:{svg:'atlas'}};
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element('g'));return nodes.get(id);};
 let ctx=A.context();const atlas={get context(){return ctx;},render:opts=>{ctx=opts.context;},select(){},address:id=>id,node,point:id=>{const b=A.layout(ctx).nodes[id];return b?{x:b.x+b.w/2,y:b.y+b.h/2}:null;},route:p=>[atlas.point(p.from),atlas.point(p.to)].filter(Boolean)};
 let layerOptions={tilted:true,data:true,instruction:true,height:96},cameraState={zoom:1,panX:0,panY:0};const scene={get camera(){return{...cameraState};},setCamera:next=>Object.assign(cameraState,next),resetCamera:()=>{cameraState={zoom:1,panX:0,panY:0};layerOptions.tilted=true;},render(){},setLayers:next=>Object.assign(layerOptions,next),get layers(){return{...layerOptions};},node,address:id=>id,point:id=>{const b=M.nodes[id];return b?{x:b.x+b.w/2,y:b.y+b.h/2}:null;},route:p=>M.packetPath(p,env.GROQ_CLUSTER.route).map(id=>scene.point(id)).filter(Boolean)};
 env.HARDWARE_ATLAS={create:()=>atlas};env.GROQ_CLUSTER_SCENE={create:()=>scene};vm.createContext(env);
 const run=file=>vm.runInContext(read(file),env,{filename:file});run('hardware-motion.js');
 const flows=[];env.GROQ_SOFTWARE_FLOW={create:opts=>{const flow={opts,current:-1,settled:false,phases:[]};flows.push(flow);return{render:(phases,current,settled=false)=>Object.assign(flow,{phases,current,settled})};}};
 const overviews=[];env.GROQ_REQUEST_FLOW={...require('../request-flow.js'),create:opts=>{const flow={opts,current:null};overviews.push(flow);return{render:state=>flow.current=state};}};
 const motions=[],create=env.HARDWARE_MOTION.create;env.HARDWARE_MOTION.create=opts=>{const engine=create(opts);motions.push({engine,opts});return engine;};
 const tick=ms=>{now+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));};
 const click=(id,data={})=>{const target=new Element();target.dataset=data;els[id].dispatchEvent({type:'click',target,preventDefault(){}});};
 return{env,els,scene,motions,flows,overviews,frames,run,tick,click,flushTimers:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}
if(require.main===module){
const f=fixture();
check('单片脚本首次加载即提供共享接口，隐藏视图不抢先播放',()=>{
 f.run('performance-app.js');assert.equal(typeof f.env.GROQ_LAB?.getModel,'function','共享接口必须在初始化阶段创建，不能等进入下一轮 Decode');assert.equal(f.env.GROQ_LAB.getModel().p.mode,'prefill');assert.equal(f.motions[0].engine.running,false);assert.equal(f.frames.size,0);
});
check('多芯片应用可以完成初始化，真实动画时钟持续推进',()=>{
 f.run('cluster-app.js');assert.equal(f.motions.length,2);assert.equal(f.motions[1].engine.running,true);f.tick(200);const first=Number(f.els['cluster-range'].value);f.tick(200);assert.ok(Number(f.els['cluster-range'].value)>first);assert.equal(f.els['cluster-play'].textContent,'暂停动画');
});
check('暂停冻结进度，继续恢复，重播归零后重新推进',()=>{
 f.click('cluster-play');const paused=Number(f.els['cluster-range'].value);f.tick(300);assert.equal(Number(f.els['cluster-range'].value),paused);assert.equal(f.motions[1].engine.running,false);f.click('cluster-play');f.tick(300);assert.ok(Number(f.els['cluster-range'].value)>paused);f.click('cluster-replay');assert.equal(Number(f.els['cluster-range'].value),0);f.tick(200);assert.ok(Number(f.els['cluster-range'].value)>0);
});
check('C2C 数据标记在硬件路径上移动，结束后可以再次播放',()=>{
 f.click('cluster-steps',{clusterStep:'8'});const engine=f.motions[1].engine;engine.seek(.3);engine.play();f.tick(100);const svg=f.els['cluster-canvas'].querySelector('svg'),mark=svg.children.find(n=>n.attrs.class==='motion-overlay').children[0],before=mark.getAttribute('transform');assert.ok(before);f.tick(150);assert.notEqual(mark.getAttribute('transform'),before);f.tick(10000);assert.ok(engine.ended);assert.equal(engine.running,false);f.click('cluster-play');f.tick(200);assert.equal(engine.running,true);assert.ok(Number(f.els['cluster-range'].value)<1000);
});
check('全部多片步骤可推进各分镜，连续播放能够进入下一步',()=>{
 for(let i=0;i<15;i++){f.click('cluster-steps',{clusterStep:String(i)});const engine=f.motions[1].engine,n=engine.phases.length;for(let j=0;j<n;j++)engine.seek((j+.5)/n);engine.seek(1);}
 f.click('cluster-steps',{clusterStep:'2'});f.click('cluster-auto');f.tick(10000);f.flushTimers();assert.equal(f.els['cluster-title'].textContent,'同一激活分给本段各片');assert.equal(f.motions[1].engine.running,true);
});
check('两种视图切换、共享参数和下一轮 Decode 保持接口与播放可用',()=>{
 const bridge=f.env.GROQ_LAB;bridge.apply({mode:'decode',seq:64});assert.equal(bridge.getModel().p.seq,64);f.click('cluster-play');f.tick(100);assert.equal(f.motions[1].engine.running,true);
 f.click('show-single');assert.equal(f.env.document.body.dataset.workspace,'single');assert.equal(f.motions[1].engine.running,false);f.click('pause-step');f.tick(200);assert.equal(f.motions[0].engine.running,true);
 f.click('operation-list',{operation:String(bridge.getModel().steps.length-1)});f.click('next-operation');assert.equal(bridge.getModel().p.seq,65);assert.equal(f.env.GROQ_LAB,bridge);assert.equal(f.motions[0].engine.running,true);
 f.click('show-cluster');f.click('cluster-play');f.tick(200);assert.equal(f.motions[1].engine.running,true);assert.equal(f.env.document.body.dataset.workspace,'cluster');
});
check('六类算子均可从软件入口启动，并能回到完整请求',()=>{
 for(const family of f.env.GROQ_OPERATORS.families){f.click('operator-families',{family:family.id});for(const [id,name]of family.ops){f.els['software-operation'].dispatchEvent({type:'change',target:{value:id}});assert.equal(f.els['cluster-title'].textContent,name);const e=f.motions[1].engine;assert.equal(e.running,true);f.tick(100);assert.ok(Number(f.els['cluster-range'].value)>0);for(let i=0;i<e.phases.length;i++)e.seek((i+.95)/e.phases.length);assert.ok(f.els['flow-latency'].textContent);}}
 f.click('operator-families',{family:'request'});assert.equal(f.env.GROQ_REQUEST_COURSE.getState().key,'request');assert.equal(f.env.GROQ_REQUEST_COURSE.getState().stage,0);assert.equal(f.motions[1].engine.running,true);
});
check('左侧流程选择会定位并播放同一硬件动作，累计时间和完成状态同步',()=>{
 f.env.GROQ_REQUEST_COURSE.pick('q');const flow=f.flows[1],engine=f.motions[1].engine;flow.opts.onSelect(2);assert.equal(flow.current,2);assert.equal(f.els['cluster-phase-title'].textContent,engine.phases[2].title);assert.equal(engine.running,true);const before=f.els['flow-latency'].textContent;f.tick(250);assert.notEqual(f.els['flow-latency'].textContent,before);engine.seek((2+.95)/engine.phases.length);assert.equal(flow.current,2);assert.equal(flow.settled,true);
 f.click('show-single');const single=f.flows[0],singleEngine=f.motions[0].engine;single.opts.onSelect(1);assert.equal(single.current,1);assert.equal(f.els['phase-title'].textContent,singleEngine.phases[1].title);assert.equal(singleEngine.running,true);singleEngine.seek((1+.95)/singleEngine.phases.length);assert.equal(single.settled,true);f.click('show-cluster');
});
check('一屏镜头可切换芯片与总览，打开详情会暂停播放并保持执行位置',()=>{
 f.click('cluster-plan');assert.equal(f.scene.layers.tilted,false);f.click('cluster-data-layer');assert.equal(f.scene.layers.data,false);f.click('cluster-instruction-layer');assert.equal(f.scene.layers.instruction,false);f.click('cluster-3d');f.click('cluster-data-layer');f.click('cluster-instruction-layer');assert.equal(f.scene.layers.tilted,true);assert.equal(f.scene.layers.data,true);assert.equal(f.scene.layers.instruction,true);
 f.click('cluster-fit');const svg=f.els['cluster-canvas'].querySelector('svg');assert.equal(svg.getAttribute('viewBox'),'0 0 '+M.width+' '+M.height);f.click('cluster-chips',{clusterChip:'3'});assert.equal(svg.getAttribute('viewBox'),'766 781.5 658 594');f.click('cluster-follow');assert.equal(f.els['cluster-follow'].getAttribute('aria-pressed'),'true');f.run('workspace-ui.js');f.env.GROQ_WORKSPACE_UI.open('values');assert.equal(f.els['detail-drawer'].open,true);assert.equal(f.els['detail-title'].textContent,'输入、计算与输出数值');assert.equal(f.motions[1].engine.running,false);f.click('detail-close');assert.equal(f.els['detail-drawer'].open,false);
});
writeReport('动画播放.md','# 动画播放检查报告\n\n共享接口在启动时就绪，六类算子、三栏布局、镜头与同页详情由统一播放状态协调。隐藏单片视图不抢先播放，接口在脚本首次加载时就绪。\n\n'+log.map(x=>'- '+x+'。').join('\n')+'\n\n验证执行了真实应用脚本和动画时钟，界面容器及绘图适配器使用程序替身，覆盖初始化、逐帧进度、数据标记位置、暂停、继续、重播、连续播放、视图切换、Decode 和六类软件入口。没有执行浏览器点击或截图测试。\n');
console.log('全部 '+log.length+' 组播放检查通过。');

}
module.exports={fixture,Element};
