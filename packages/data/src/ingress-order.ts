import {DomainError} from '../../contracts/src/index';

/** Reserves receive order before any asynchronous parsing or authentication.
 * Only durable ingress capture belongs inside run; game processing follows it.
 */
export class IngressOrder {
 private tails=new Map<string,Promise<void>>();
 private pending=new Map<string,number>();
 private total=0;
 constructor(private readonly perScopeLimit=16,private readonly totalLimit=1024){}
 reserve(scope:string){
  const count=this.pending.get(scope)??0;
  if(count>=this.perScopeLimit||this.total>=this.totalLimit)throw new DomainError('command_busy',429,'Wacht op je vorige actie of herstel je verbinding.');
  const previous=this.tails.get(scope)??Promise.resolve();let complete!:()=>void;
  const tail=new Promise<void>(resolve=>{complete=resolve;});this.tails.set(scope,tail);this.pending.set(scope,count+1);this.total++;
  let released=false,used=false;
  const release=()=>{if(released)return;released=true;void previous.then(complete);};
  void tail.then(()=>{this.total--;const remaining=(this.pending.get(scope)??1)-1;if(remaining)this.pending.set(scope,remaining);else this.pending.delete(scope);if(this.tails.get(scope)===tail)this.tails.delete(scope);});
  return {release,run:async<T>(capture:()=>Promise<T>)=>{if(used||released)throw new Error('Ingress ticket already consumed');used=true;await previous;try{return await capture();}finally{release();}}};
 }
}
