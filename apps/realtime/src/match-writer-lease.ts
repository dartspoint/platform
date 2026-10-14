type LeaseEvent='match_lease_renewal_failed'|'match_lease_release_failed'|'match_lease_disconnect_failed';
type LeaseActions={renew:()=>Promise<boolean>;release:()=>Promise<unknown>;disconnect:()=>Promise<unknown>;report:(event:LeaseEvent)=>void};

/** A room owns one renewal at a time; disposal releases after that DB work settles. */
export class MatchWriterLease {
 private pending:Promise<boolean>|undefined;
 private closing=false;
 private disposal:Promise<void>|undefined;
 constructor(private readonly actions:LeaseActions){}
 get isClosing(){return this.closing;}
 async renew():Promise<void>{
  if(this.closing||this.pending)return;
  const pending=Promise.resolve().then(()=>this.closing?false:this.actions.renew());this.pending=pending;
  let owned=false;
  try{owned=await pending;}
  catch{this.actions.report('match_lease_renewal_failed');}
  finally{this.pending=undefined;}
  if(owned||this.closing)return;
  this.closing=true;
  // The tracked DB promise has settled before disconnect can call dispose().
  try{await this.actions.disconnect();}
  catch{this.actions.report('match_lease_disconnect_failed');}
 }
 dispose():Promise<void>{
  this.closing=true;
  return this.disposal??=this.releaseAfterRenewal();
 }
 private async releaseAfterRenewal():Promise<void>{
  // Clock.clear() cancels future callbacks, not a renewal already in flight.
  try{await this.pending;}catch{}
  try{await this.actions.release();}
  catch{this.actions.report('match_lease_release_failed');}
 }
}
