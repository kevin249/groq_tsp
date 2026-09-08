/* UTF-8 · 检查报告统一写入忽略目录，不向项目根目录生成过程文档。 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
function writeReport(name,content){
 const dir=path.resolve(__dirname,'../reports');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,name),content,'utf8');
}
module.exports={writeReport};
