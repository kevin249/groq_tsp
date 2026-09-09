/* UTF-8 · 机械部件的实体网格；外形依据公开机架与托盘图，非制造 CAD。 */
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {buildRubin} from './rubin-hardware.mjs';
const mats={};
function material(name){if(mats[name])return mats[name];const colors={dark:0x252b31,black:0x0e151b,steel:0xa8b0ad,silver:0xcbd3d4,gold:0xc0b88a,pcb:0x254a42,copper:0xaf754b,die:0x405968,ceramic:0x1e282d,green:0x55c898,blue:0x58bfe0,purple:0xb99ee2,white:0xe3e8e6};return mats[name]=new T.MeshStandardMaterial({color:colors[name]||name,metalness:['steel','silver','gold','copper'].includes(name)?.83:.25,roughness:['die','pcb'].includes(name)?.32:.44,...(['blue','green'].includes(name)?{emissive:colors[name],emissiveIntensity:.7}:{})});}
const boxCache=new Map();
function geometry(w,h,d,r=0){const key=[w,h,d,r].join(':');if(!boxCache.has(key))boxCache.set(key,r?new RoundedBoxGeometry(w,h,d,2,r):new T.BoxGeometry(w,h,d));return boxCache.get(key);}
function box(parent,w,h,d,x,y,z,mat='dark',r=0){const m=new T.Mesh(geometry(w,h,d,r),material(mat));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function instances(parent,geo,mat,positions){const mesh=new T.InstancedMesh(geo,material(mat),positions.length),dummy=new T.Object3D();for(let i=0;i<positions.length;i++){const p=positions[i];dummy.position.set(p[0],p[1],p[2]);dummy.scale.set(p[3]||1,p[4]||1,p[5]||1);dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function pipe(parent,points,color='blue',radius=.035){const c=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),m=new T.Mesh(new T.TubeGeometry(c,Math.max(12,points.length*6),radius,6,false),material(color));parent.add(m);return m;}
function text(parent,words,x,y,z,size=.3,color='#e6eee9',flat=false){const canvas=document.createElement('canvas'),c=canvas.getContext('2d');c.font='500 64px "Segoe UI", "Microsoft YaHei", sans-serif';canvas.width=Math.ceil(c.measureText(words).width+24);canvas.height=96;c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='500 64px "Segoe UI", "Microsoft YaHei", sans-serif';c.fillText(words,canvas.width/2,48);const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(size*canvas.width/96,size),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:T.DoubleSide}));m.position.set(x,y,z);if(flat)m.rotation.x=-Math.PI/2;parent.add(m);return m;}
function screwPositions(w,d,y,count=6){const p=[];for(let i=0;i<count;i++){const z=-d/2+i*d/(count-1);p.push([-w/2,y,z],[w/2,y,z]);}return p;}
function fins(parent,x,y,z,w=1.2,d=1,mat='silver'){const p=[];for(let i=0;i<12;i++)p.push([x-w/2+i*w/11,y,z]);instances(parent,geometry(.027,.2,d),mat,p);}
function heatSink(parent,x,y,z,w=1.2,d=1){box(parent,w,.07,d,x,y-.1,z,'silver',.035);fins(parent,x,y,z,w,d);}
function setPick(mesh,part,extra={}){mesh.userData.pick={part,...extra};return mesh;}
function rack(group,{slot=0,rack=0,gpu=false}={},at=[0,0,0],scale=1){const g=new T.Group();g.position.set(...at);g.scale.setScalar(scale);group.add(g);const drawers=[],actuators=[];
 box(g,3.7,12,4.2,0,0,0,'black',.06);box(g,3.3,11.7,4.22,0,.05,.03,'dark');
 for(const x of [-1.8,1.8]){box(g,.14,12.2,4.5,x,0,.08,'steel',.045);box(g,.13,11.8,.1,x*.94,0,2.33,'black');}
 for(const y of [-6.04,6.04])box(g,3.7,.19,4.5,0,y,.08,'steel',.05);
 box(g,3.35,11.55,.08,0,0,-2.15,'black');
 const holes=[];for(let i=0;i<86;i++)for(const x of [-1.65,1.65])holes.push([x,-5.5+i*.13,2.39]);instances(g,geometry(.035,.06,.008),'black',holes);
 const front=geometry(3.24,.221,.08,.035),body=geometry(3.2,.235,3.85),handle=geometry(1.1,.04,.025,.018),ports=geometry(.09,.045,.03),portPoints=[];
 const count=gpu?18:32,pitch=gpu?.45:.25;
 for(let i=0;i<count;i++){const y=3.96-i*pitch,dg=new T.Group();dg.position.set(0,y,0);g.add(dg);const base=new T.Mesh(body,material('dark'));dg.add(base);base.receiveShadow=true;
 const face=new T.Mesh(front,material(gpu?'silver':'gold'));face.position.z=2.17;face.castShadow=true;dg.add(face);setPick(face,gpu?'GPU':'SLOT',{slot:i});
 const h=new T.Mesh(handle,material('black'));h.position.set(-.68,-.051,2.216);dg.add(h);box(dg,.045,.19,.14,-1.58,0,2.22,'silver',.015);box(dg,.045,.19,.14,1.58,0,2.22,'silver',.015);
 for(let p=0;p<6;p++)portPoints.push([.45+p*.15,y+.025,2.228]);
 const led=box(dg,.045,.018,.015,1.39,.04,2.24,i===slot?'blue':'green');text(dg,String(i).padStart(2,'0'),-.02,.018,2.221,.08,'#414b45');drawers.push(dg);if(i===slot){const edge=box(dg,3.08,.012,.016,0,-.105,2.244,'blue');edge.userData.selection=true;actuators.push({node:dg,base:dg.position.clone(),delta:new T.Vector3(0,0,3.8)});}}
 instances(g,ports,'black',portPoints);
 box(g,3.28,.74,3.8,0,5.08,0,'gold',.11);const grate=[];for(let i=0;i<36;i++)for(let j=0;j<3;j++)grate.push([-1.45+i*.083,4.88+j*.16,1.926]);instances(g,geometry(.045,.11,.02),'black',grate);
 for(const y of [4.45,-4.65,-5.18])for(let i=0;i<5;i++){box(g,.47,.38,3.7,-1.2+i*.6,y,-.1,'ceramic',.035);box(g,.15,.11,.17,-1.2+i*.6,y,1.85,'steel',.025);}
 text(g,gpu?'RUBIN GPU':'NVIDIA GROQ 3 LPX',0,5.74,2.35,.12,'#dce2df');text(g,gpu?'GPU COMPUTE':'RACK '+String(rack).padStart(2,'0')+' / 32 COMPUTE TRAYS',0,-5.7,2.35,.105,'#b4c5c6');
 return{group:g,drawers,actuators,anchors:{SLOT:new T.Vector3(0,3.96-slot*.25,2.32),NETWORK:new T.Vector3(-3,4.75,3)}};
}
function packageChip(parent,x,z,i){const g=new T.Group();g.position.set(x,.18,z);parent.add(g);setPick(box(g,1.91,.13,1.35,0,0,0,'pcb',.025),'LPU',{chip:i});box(g,1.61,.08,1.1,0,.1,0,'gold',.025);box(g,1.12,.065,.8,0,.172,0,'die',.015);const pins=[];for(let j=0;j<14;j++){pins.push([-.78+j*.12,.14,-.52],[ -.78+j*.12,.14,.52]);}instances(g,geometry(.04,.022,.11),'steel',pins);text(g,'GROQ 3 · '+i,0,.212,0,.115,'#d4e6d8',true);return g;}
function boardDetails(parent){const p=[];for(let i=0;i<90;i++){const x=-4.6+(i*137%900)/100,z=-4.1+(i*89%820)/100;if(Math.abs(x)<1.2&&z>1)continue;p.push([x,.15,z]);}instances(parent,geometry(.14,.09,.09),'ceramic',p);const sm=[];for(let i=0;i<70;i++)sm.push([-4.4+(i*71%870)/100,.09,-4+(i*157%810)/100]);instances(parent,geometry(.06,.035,.12),'steel',sm);}
function tray(group,state,fabric=false){const g=new T.Group();group.add(g);const actuators=[],chips=[];box(g,10.35,.14,10.2,0,-.22,0,'steel',.06);box(g,9.9,.075,9.5,0,-.105,-.03,'pcb');for(const x of [-5.12,5.12]){box(g,.14,.76,10,x,.08,0,'dark',.04);box(g,.065,.13,10.6,x+.04,.22,.1,'silver',.03);}
 const screws=screwPositions(9.75,9.3,.13,10);instances(g,new T.CylinderGeometry(.07,.07,.06,8),'steel',screws);
 for(let i=0;i<8;i++){const x=-3.66+(i%4)*2.44,z=-3.3+Math.floor(i/4)*1.95,c=packageChip(g,x,z,i);chips.push(c);const cold=new T.Group();cold.position.set(x,.35,z);g.add(cold);box(cold,1.7,.23,1.12,0,0,0,'silver',.08);fins(cold,0,.2,0,1.3,.85);actuators.push({node:cold,base:cold.position.clone(),delta:new T.Vector3(0,1.7,0)});}
 for(const x of [-3.2,3.2]){const con=box(g,2.8,.4,.24,x,.15,-4.77,'black',.03);setPick(con,'SPINE');const pins=[];for(let i=0;i<24;i++)pins.push([x-1.23+i*.107,.27,-4.63]);instances(g,geometry(.026,.17,.07),'gold',pins);}
 setPick(box(g,3.3,.14,1.05,-.8,.14,.2,'ceramic',.03),'FABRIC');heatSink(g,-.8,.39,.2,2.8,.95);text(g,'FABRIC EXPANSION',-.8,.54,.2,.105,'#344942',true);
 for(let i=0;i<6;i++)box(g,.25,.11,.8,2.1+i*.36,.14,.2,'ceramic',.02);
 setPick(box(g,1.8,.14,1.8,-.42,.15,2.8,'gold',.045),'HOST');heatSink(g,-.42,.49,2.8,1.55,1.55);
 for(let i=0;i<6;i++){box(g,.08,.52,2,-3.86+i*.35,.24,2.25,'pcb');for(let j=0;j<5;j++)box(g,.095,.22,.26,-3.86+i*.35,.39,1.55+j*.31,'ceramic');box(g,.1,.055,2.2,-3.86+i*.35,-.03,2.25,'black');}
 box(g,2.48,.085,2.6,3.15,.02,2.45,'pcb');setPick(box(g,1.12,.13,1.12,3.15,.21,2.55,'gold',.02),'NIC');box(g,.76,.07,.76,3.15,.32,2.55,'die',.03);heatSink(g,3.15,.65,2.55,.9,.9);
 const fp=box(g,10.3,.66,.25,0,.03,5.08,'gold',.1);setPick(fp,'NETWORK');setPick(box(g,.38,.23,.28,-4.22,.06,5.19,'black',.025),'ETHERNET');for(let i=0;i<4;i++)setPick(box(g,.63,.23,.28,-3.65+i*.71,.06,5.19,'black',.025),'C2C_OPTICAL');text(g,'ETH',-4.22,.32,5.23,.10,'#344942');text(g,'C2C OPTICAL',-2.55,.32,5.23,.10,'#344942');for(let i=0;i<5;i++)box(g,.39,.18,.28,1.63+i*.56,.04,5.2,'black',.02);
 for(const x of [-4.9,4.9]){box(g,.22,.67,.52,x,.03,5.21,'silver',.09);pipe(g,[[x,.3,5.4],[x,.35,5.65],[x,-.18,5.65],[x,-.22,5.4]],'steel',.06);}
 box(g,2.8,.10,.015,-2.6,-.17,5.22,'black',.04);box(g,2.8,.10,.015,2.35,-.17,5.22,'black',.04);text(g,'GROQ 3 LPX  /  COMPUTE TRAY',0,.18,5.221,.15,'#424b40');
 boardDetails(g);for(let i=0;i<8;i++){const x=chips[i].position.x,z=chips[i].position.z;pipe(g,[[x,.105,z+.65],[x,.105,.7],[-.8,.105,.7]],'copper',.011);}
 // 冷却管为机械外观示意；不承担动画中的数据流。
 for(const x of [-4.65,4.65])pipe(g,[[x,.38,3.9],[x,.45,-3.9],[x*.77,.43,-4.24]],'dark',.10);
 const cover=new T.Group();g.add(cover);box(cover,10.06,.1,9.7,0,.77,-.05,'dark',.1);fins(cover,0,.85,-.2,8.6,7.8,'dark');text(cover,'GROQ 3 LPX',0,.92,1.2,.35,'#adbeb5',true);actuators.push({node:cover,base:cover.position.clone(),delta:new T.Vector3(-.6,3.2,-9.6)});
 if(fabric){cover.visible=false;for(const a of actuators)if(a.node!==cover)a.node.visible=false;}
 const a={NIC:new T.Vector3(3.15,.68,2.55),NETWORK:new T.Vector3(-4.22,.2,5.4),FABRIC:new T.Vector3(-.8,.66,.2),HOST:new T.Vector3(-.42,.76,2.8),SPINE:new T.Vector3(0,.6,-4.75),LPU:chips[state.chip||0].position.clone().add(new T.Vector3(0,.28,0))};for(let i=0;i<8;i++)a['CHIP'+i]=chips[i].position.clone().add(new T.Vector3(0,.28,0));return{group:g,actuators,chips,anchors:a};
}
function die(group,state){const g=new T.Group();group.add(g);box(g,8.1,.15,9.7,0,-.3,0,'pcb',.07);box(g,7.72,.15,9.3,0,-.13,0,'gold',.06);box(g,7.2,.13,8.7,0,.04,0,'black',.05);const bga=[];for(let x=0;x<20;x++)for(let z=0;z<24;z++)bga.push([-3.5+x*.367,-.43,-4.2+z*.365]);instances(g,new T.SphereGeometry(.067,6,4),'steel',bga);
 const regions={},anchors={};for(const b of Object.values(window.GROQ3_SPACE.map.nodes)){if(b.kind!=='region')continue;const x=(b.x+b.w/2-360)*.009,z=(b.y+b.h/2-445)*.009,w=b.w*.009,d=b.h*.009;const type=b.id.split('_')[0],mat=type==='MXM'?'copper':type==='MEM'?'die':type==='VXM'?'pcb':type==='SXM'?'steel':'dark';const body=box(g,w,.1,d,x,.2,z,mat,.025);setPick(body,type,{region:b.id});regions[b.id]=body;const xs=Math.max(2,Math.floor(w/.15)),zs=Math.max(2,Math.floor(d/.13)),p=[];for(let i=0;i<xs;i++)for(let j=0;j<zs;j++)p.push([x-w/2+(i+.5)*w/xs,.272,z-d/2+(j+.5)*d/zs]);instances(g,geometry(w/xs*.68,.022,d/zs*.72),type==='MEM'?'silver':type==='MXM'?'gold':'black',p);const engraving=text(g,b.label.replace(/\n/g,' '),x,.325,z,Math.min(.38,d*.68),['MEM','MXM','SXM'].includes(type)?'#214339':'#e2eee5',true);if(b.rotate)engraving.rotateZ(T.MathUtils.degToRad(b.rotate));anchors[b.id]=new T.Vector3(x,.42,z);anchors[type]=new T.Vector3(x,.42,z);}
 anchors.MEM=anchors.MEM||new T.Vector3(0,.4,1);anchors.SXM=anchors.SXM||new T.Vector3(0,.4,2);anchors.MXM=anchors.MXM||new T.Vector3(0,.4,-3);anchors.VXM=anchors.VXM||new T.Vector3(0,.4,0);anchors.ICU=anchors.ICU||new T.Vector3(-2.8,.4,0);anchors.C2C=anchors.C2C||new T.Vector3(-3.3,.4,-2);
 text(g,'NVIDIA  /  GROQ 3 LPU',0,.29,4.5,.19,'#1d3d35',true);return{group:g,regions,anchors,actuators:[]};
}
export function buildHardware(level,state){const group=new T.Group();group.name='硬件实体 · '+level;let result;
 if(level==='rack')result=rack(group,state);
 else if(level==='tray'||level==='fabric')result=tray(group,state,level==='fabric');
 else if(level==='chip')result=die(group,state);
 else if(level==='gpu')result=buildRubin(group,{box,instances,geometry,material,text,setPick});
 else{const lp=rack(group,state,[3.5,0,-1],.79);rack(group,{gpu:true},[-1.2,0,-2.2],.79);const laptop=new T.Group();laptop.position.set(-5.5,-4.1,3);group.add(laptop);box(laptop,3,.12,2,0,0,0,'steel',.08);const screen=box(laptop,3,1.85,.09,0,.97,-.83,'dark',.07);box(laptop,2.78,1.58,.015,0,1.02,-.774,'black');text(laptop,'谁是世界上最厉害的大模型？',0,1.02,-.761,.115,'#e6f1ee');const key=[];for(let i=0;i<12;i++)for(let j=0;j<4;j++)key.push([-1.27+i*.23,.08,-.47+j*.22]);instances(laptop,geometry(.18,.035,.15),'ceramic',key);setPick(screen,'USER');box(group,2.3,.6,1.45,-1.8,-4.3,3.1,'dark',.07);text(group,'SERVICE / TOKENIZER',-1.8,-4.26,3.84,.11,'#d2dfd9');pipe(group,[[-5.4,-4.12,2],[-4,-4.4,1.2],[-2,-4.4,2.4]],'dark',.035);
 const net={GPU:new T.Vector3(-1.2,-.2,-.4),CX9:new T.Vector3(-1.55,-3.65,.0),NETWORK:new T.Vector3(.65,-4.12,2.1),SLOT:new T.Vector3(3.5,-.2,.8)};
 const cx=box(group,1.14,.25,.85,net.CX9.x,net.CX9.y,net.CX9.z,'pcb',.025);setPick(cx,'CX9');box(group,.42,.1,.42,-1.55,-3.47,0,'gold',.015);text(group,'GPU SIDE / CX-9',-1.55,-3.17,0,.14,'#4a5b55');
 const sw=box(group,2.7,.38,1.14,net.NETWORK.x,net.NETWORK.y,net.NETWORK.z,'dark',.04);setPick(sw,'SPECTRUM_X');for(let p=0;p<12;p++)box(group,.14,.09,.04,-.47+p*.2,-4.1,2.68,'black');text(group,'SPECTRUM-X ETHERNET',.65,-3.73,2.1,.15,'#4a5b55');
 for(const[a,b]of [['GPU','CX9'],['CX9','NETWORK'],['NETWORK','SLOT']]){const x=net[a],y=net[b];pipe(group,[x.toArray(),[x.x,x.y-.2,(x.z+y.z)/2],[y.x,y.y-.2,(x.z+y.z)/2],y.toArray()],'blue',.022);}
 result={...lp,anchors:{USER:new T.Vector3(-5.5,-2.9,2.3),HOST:new T.Vector3(-1.8,-3.8,3.1),...net}};}
 return{...result,group,level,setExplosion(value){for(const a of result.actuators||[])a.node.position.copy(a.base).addScaledVector(a.delta,value);},anchors:result.anchors,picks(){const out=[];group.traverse(n=>{if(n.userData.pick)out.push(n);});return out;}};
}
export {material,pipe,text};
