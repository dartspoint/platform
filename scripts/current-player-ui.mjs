import ts from 'typescript';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
function directory(path){for(const e of readdirSync(path,{withFileTypes:true})){if(e.isDirectory())directory(path+'/'+e.name);else if(e.name.endsWith('.tsx')&&(/^(darts|player)/.test(e.name)||path.includes('/admin')))update(path+'/'+e.name);}}
function update(path){let s=readFileSync(path,'utf8');const file=ts.createSourceFile(path,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 function walk(node){
  if(ts.isStringLiteral(node)&&node.text==='Nick'){
   if(ts.isPropertyAssignment(node.parent)&&node.parent.name===node)edits.push([node.getStart(file),node.end,'[selfName()]']);
   else edits.push([node.getStart(file),node.end,ts.isJsxAttribute(node.parent)?'{selfName()}':'selfName()']);
  }else if(ts.isJsxText(node)&&/\bNick\b/.test(node.text))edits.push([node.getStart(file),node.end,node.getText(file).replace(/\bNick\b/g,'{selfName()}')]);
  ts.forEachChild(node,walk);
 }
 walk(file);if(edits.length){for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))s=s.slice(0,start)+value+s.slice(end);if(!/import\s*\{[^}]*\bselfName\b[^}]*\}\s*from/.test(s))s=s.replace('"use client";','"use client";\nimport {selfName} from "@/lib/platform-client";');writeFileSync(path,s);}
}
directory('apps/web/components');
