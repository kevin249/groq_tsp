/* UTF-8 · 内嵌 Three.js、OrbitControls 与 CSS3DRenderer；浏览器无需 CDN。 */
const path=require('node:path'),fs=require('node:fs');
const license=fs.readFileSync(path.join(__dirname,'node_modules/three/LICENSE'),'utf8');
require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../spatial-lab-source.mjs')],outfile:path.resolve(__dirname,'../spatial-lab.js'),bundle:true,minify:true,format:'iife',target:'es2020',charset:'utf8',legalComments:'eof',banner:{js:'/*! Three.js · MIT 许可原文\n'+license+'\n*/'},nodePaths:[path.join(__dirname,'node_modules')]});
console.log('三维场景已构建，包含 Three.js 与所需控件。');
