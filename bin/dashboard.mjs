#!/usr/bin/env node
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDashboardServer} from '../src/dashboard/server.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
try {
  const args=process.argv.slice(2);
  if(args.includes('--help')) {
    console.log('Usage: node bin/dashboard.mjs [--port 8787] [--runs-root PATH ...]\nLocal read-only dashboard. Never launches inference. --port 0 chooses an available port.');
  } else {
    let port=8787;const roots=[];
    for(let i=0;i<args.length;i+=2) {
      const value=args[i+1];if(value===undefined)throw new Error('INVALID_ARGUMENTS');
      if(args[i]==='--port'&&/^\d+$/.test(value))port=Number(value);
      else if(args[i]==='--runs-root')roots.push(resolve(value));
      else throw new Error('INVALID_ARGUMENTS');
    }
    if(!Number.isInteger(port)||port<0||port>65535||roots.length>8)throw new Error('INVALID_ARGUMENTS');
    if(!roots.length)roots.push(resolve(repo,'benchmark-runs'),resolve(repo,'../personal-os-jev-lab/runs'));
    const server=createDashboardServer({roots});
    server.on('error',()=>{console.error('{"error":"DASHBOARD_LISTEN_FAILED"}');process.exitCode=1;});
    server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,read_only:true,inference_enabled:false})));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
  }
} catch {console.error('{"error":"INVALID_DASHBOARD_CONFIGURATION"}');process.exitCode=2;}
