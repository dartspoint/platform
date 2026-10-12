// One-time adapter migration: keep source presentation while awaiting server writes.
import ts from 'typescript';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const names=new Set(process.argv.slice(2));
function visitDirectory(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){if(entry.isDirectory())visitDirectory(directory+'/'+entry.name);else if(entry.name.endsWith('.tsx'))update(directory+'/'+entry.name);}}
function update(path){let text=readFileSync(path,'utf8');const file=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const inserts=new Map();const functions=new Set();
 function walk(node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&names.has(node.expression.text)&&!ts.isAwaitExpression(node.parent)){
  let fn=node.parent;while(fn&&!ts.isFunctionLike(fn))fn=fn.parent;
  if(fn){if(ts.isFunctionDeclaration(fn)&&fn.name&&/^[A-Z]/.test(fn.name.text)){console.log('Manual render action: '+path+':'+node.expression.text);return;}
   inserts.set(node.getStart(file),'await ');functions.add(fn);
  }
 }ts.forEachChild(node,walk);}
 walk(file);for(const fn of functions){if(!fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))inserts.set(fn.getStart(file),'async ');}
 if(inserts.size){for(const [pos,value] of [...inserts].sort((a,b)=>b[0]-a[0]))text=text.slice(0,pos)+value+text.slice(pos);writeFileSync(path,text);}
}
visitDirectory('apps/web/components');
