import {Fragment,type ReactNode} from 'react';
import {safeDocumentLink} from '../../../packages/contracts/src/legal';

/** Deliberately small Markdown renderer: React text nodes escape all HTML. */
function inline(text:string):ReactNode[]{
 return text.split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part,i)=>{
  const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);if(link){const href=safeDocumentLink(link[2]);return href?<a key={i} href={href} rel="noopener noreferrer">{link[1]}</a>:<Fragment key={i}>{link[1]}</Fragment>;}
  if(part.startsWith('**')&&part.endsWith('**'))return <strong key={i}>{part.slice(2,-2)}</strong>;
  if(part.startsWith('`')&&part.endsWith('`'))return <code key={i}>{part.slice(1,-1)}</code>;
  return part;
 });
}
export function LegalMarkdown({text}:{text:string}){
 const lines=text.replaceAll('\r','').split('\n'),blocks:ReactNode[]=[];
 for(let i=0;i<lines.length;){const line=lines[i];if(!line.trim()){i++;continue;}
  const heading=/^(#{1,4})\s+(.+)$/.exec(line);if(heading){const content=inline(heading[2]),key=i;blocks.push(heading[1].length===1?<h1 key={key}>{content}</h1>:heading[1].length===2?<h2 key={key}>{content}</h2>:heading[1].length===3?<h3 key={key}>{content}</h3>:<h4 key={key}>{content}</h4>);i++;continue;}
  if(line.trim().startsWith('|')&&/^\s*\|?[ :|-]+\|\s*$/.test(lines[i+1]??'')){
   const cells=(v:string)=>v.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim()),head=cells(line),key=i; i+=2;const rows:string[][]=[];while(i<lines.length&&lines[i].trim().startsWith('|'))rows.push(cells(lines[i++]));
   blocks.push(<div className="dp-legal-table" key={key}><table><thead><tr>{head.map((v,j)=><th key={j}>{inline(v)}</th>)}</tr></thead><tbody>{rows.map((row,j)=><tr key={j}>{row.map((v,k)=><td key={k}>{inline(v)}</td>)}</tr>)}</tbody></table></div>);continue;
  }
  if(/^\s*[-*]\s+/.test(line)){const key=i,items:string[]=[];while(i<lines.length&&/^\s*[-*]\s+/.test(lines[i]))items.push(lines[i++].replace(/^\s*[-*]\s+/,''));blocks.push(<ul key={key}>{items.map((v,j)=><li key={j}>{inline(v)}</li>)}</ul>);continue;}
  if(/^\s*\d+\.\s+/.test(line)){const key=i,items:string[]=[];while(i<lines.length&&/^\s*\d+\.\s+/.test(lines[i]))items.push(lines[i++].replace(/^\s*\d+\.\s+/,''));blocks.push(<ol key={key}>{items.map((v,j)=><li key={j}>{inline(v)}</li>)}</ol>);continue;}
  const key=i,paragraph=[lines[i++]];while(i<lines.length&&lines[i].trim()&&!/^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lines[i]))paragraph.push(lines[i++]);blocks.push(<p key={key}>{inline(paragraph.join(' '))}</p>);
 }
 return <div className="dp-legal-markdown">{blocks}</div>;
}
