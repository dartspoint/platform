for(let attempt=0;attempt<90;attempt++){
 try{const response=await fetch('http://127.0.0.1:4300/readyz');if(!response.ok)throw new Error('not_ready');const resume=await fetch('http://127.0.0.1:42567/internal/deploy/resume',{method:'POST',headers:{Authorization:'Bearer '+process.env.INTERNAL_DEPLOY_TOKEN}});if(!resume.ok)throw new Error('not_ready');console.log('Local services are ready');process.exit(0);}catch{}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
throw new Error('Local services failed readiness');
