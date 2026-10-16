import {z} from 'zod';

const fields={
 name:z.string().min(1),title:z.string().min(1),level:z.enum(['WARN','ERROR']),
 facing:z.enum(['INTERNAL','EXTERNAL']),categories:z.array(z.string().min(1)).min(1).refine(values=>values.includes('SECURITY')),
 description:z.string().min(1),detail:z.string(),remediation:z.string().url(),metadata:z.record(z.string(),z.unknown()),
};
const issue=z.object({...fields,cacheKey:z.string().min(1)}).strict();
const plainIssue=z.object({...fields,cache_key:z.string().min(1)}).strict();
const envelope=z.object({results:z.array(issue),message:z.literal('db advisors')}).strict();
export type SecurityAdvisorIssue=z.infer<typeof issue>;

/** Supabase CLI 2.109.1 emits camelCase in its explicit JSON envelope and
 * snake_case in the plain, non-agent JSON list. Unknown output fails closed. */
export function parseSecurityAdvisorOutput(stdout:string):SecurityAdvisorIssue[]{
 const value:unknown=JSON.parse(stdout);
 if(Array.isArray(value))return z.array(plainIssue).parse(value).map(({cache_key,...fields})=>({...fields,cacheKey:cache_key}));
 return envelope.parse(value).results;
}
