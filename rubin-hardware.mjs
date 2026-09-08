/* UTF-8 · Rubin 封装：依据 NVIDIA 图 7 与 LPX 图 5 的双计算裸片 / 八 HBM4 外形。 */
import * as T from 'three';
export const RUBIN_SOURCES={article:'https://developer.nvidia.com/blog/inside-the-nvidia-rubin-platform-six-new-chips-one-ai-supercomputer/',figure:'https://developer-blogs.nvidia.com/wp-content/uploads/2026/01/image-33-1.png',comparison:'https://developer-blogs.nvidia.com/wp-content/uploads/2026/03/LPX05-Rubin_GPU_and_Groq_3_LPU.webp'};
export const RUBIN_SPEC={computeDies:2,hbmStacks:8,sms:224,hbmBytes:288e9,hbmBandwidth:22e12,nvlinkBandwidth:3.6e12};
export function buildRubin(parent,{box,instances,geometry,material,text,setPick}){
 const g=new T.Group();g.name='NVIDIA Rubin · 双裸片封装';parent.add(g);
 box(g,9.05,.16,8.05,0,-.30,0,'pcb',.035);box(g,8.9,.16,7.9,0,-.14,0,'gold',.055);
 box(g,7.8,.05,6.88,0,-.025,0,'black',.06);
 const frameMat=new T.MeshStandardMaterial({color:0xb9ad70,metalness:.94,roughness:.28});
 for(const x of [-4.15,4.15]){const m=box(g,.50,.11,7.77,x,-.02,0,'gold',.025);m.material=frameMat;}
 for(const z of [-3.70,3.70]){const m=box(g,8.35,.11,.44,0,-.02,z,'gold',.025);m.material=frameMat;}
 const dies=[],memories=[],anchor={};
 for(let d=0;d<2;d++){
  const x=d===0?-1.50:1.50,die=box(g,2.93,.09,3.13,x,.08,0,'die',.012);setPick(die,'RUBIN_DIE',{die:d});dies.push(die);anchor['DIE'+d]=new T.Vector3(x,.36,0);
  // 可见纹理按公开照片的重复电路区域排列，不将纹理小格命名为某个真实 SM。
  const tile=[];for(let row=0;row<6;row++)for(let col=0;col<6;col++)tile.push([x-1.04+col*.395,.143,-1.06+row*.407]);instances(g,geometry(.325,.009,.31),'pcb',tile);
  const cells=[];for(const p of tile)for(let i=0;i<3;i++)for(let j=0;j<3;j++)cells.push([p[0]-.105+i*.105,.157,p[2]-.098+j*.098]);instances(g,geometry(.064,.009,.049),'gold',cells);
  const strips=[];for(let i=0;i<30;i++)strips.push([x-1.38,.15,-1.4+i*.098],[x+1.34,.15,-1.4+i*.098]);instances(g,geometry(.145,.015,.035),'steel',strips);
  for(const z of [-1.43,1.43]){box(g,2.62,.018,.09,x,.15,z,'silver');const v=[];for(let i=0;i<31;i++)v.push([x-1.25+i*.083,.166,z]);instances(g,geometry(.037,.009,.07),'ceramic',v);}
  text(g,'COMPUTE DIE '+d,x,.20,0,.22,'#e4eee8',true);
 }
 // 两个裸片之间的封装连接缝：不把它当作 GPU 对外 NVLink 接口。
 box(g,.047,.012,3.08,0,.16,0,'copper');
 for(let side=0;side<2;side++)for(let col=0;col<4;col++){
  const i=side*4+col,x=-1.76+col*1.17,z=side===0?-2.17:2.17;
  const hb=box(g,1.13,.12,1.1,x,.072,z,'gold',.015);setPick(hb,'HBM4',{stack:i});memories.push(hb);anchor['HBM'+i]=new T.Vector3(x,.34,z);text(g,'HBM4',x,.142,z,.17,'#3b493c',true);
  for(let line=0;line<4;line++)box(g,1.12,.008,1.08,x,.045+line*.018,z,'steel');
 }
 const caps=[];for(let i=0;i<64;i++)caps.push([-3.12+i*.098,.08,-3.18],[-3.12+i*.098,.08,3.18]);for(let i=0;i<39;i++)caps.push([-3.46,.08,-2.55+i*.136],[3.46,.08,-2.55+i*.136]);instances(g,geometry(.043,.047,.057),'silver',caps);
 text(g,'NVIDIA RUBIN',0,.035,3.70,.19,'#3a4735',true);
 const pins=[];for(let x=0;x<26;x++)for(let z=0;z<24;z++)pins.push([-4+x*.32,-.43,-3.61+z*.313]);instances(g,new T.SphereGeometry(.047,6,4),'silver',pins);
 const io=new T.Vector3(3.73,.32,0),compute=new T.Vector3(-1.5,.37,0),memory=anchor.HBM0.clone(),cache=anchor.HBM7.clone();
 return{group:g,actuators:[],dies,memories,spec:RUBIN_SPEC,sources:RUBIN_SOURCES,anchors:{...anchor,GPU:compute,EMBED:memory,MATRIX:compute,VECTOR:compute.clone(),CACHE:cache,QKV:compute.clone(),RESIDUAL:cache.clone(),INDEX:compute.clone(),NETWORK:io,MEM:memory,MXM:compute.clone(),VXM:compute.clone(),ROOT:compute.clone(),PEER:anchor.DIE1.clone(),SM:compute.clone()}};
}
