/** Bound provider calls while preserving caller cancellation. Never log request headers. */
export const providerFetch:typeof fetch=(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(8000),...(init.signal?[init.signal]:[]),...(input instanceof Request?[input.signal]:[])])});
