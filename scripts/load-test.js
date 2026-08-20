import { performance } from 'node:perf_hooks'

const baseUrl=process.env.LOAD_TEST_URL||'http://localhost:8080'
const total=Math.max(1,Number(process.env.LOAD_TEST_REQUESTS)||500)
const concurrency=Math.max(1,Number(process.env.LOAD_TEST_CONCURRENCY)||25)
const paths=['/v1/health','/v1/events']
const durations=[];let failures=0;let cursor=0

async function worker(){while(true){const index=cursor++;if(index>=total)return;const started=performance.now();try{const response=await fetch(baseUrl+paths[index%paths.length]);if(!response.ok)failures++;await response.arrayBuffer()}catch{failures++}durations.push(performance.now()-started)}}
await Promise.all(Array.from({length:Math.min(concurrency,total)},worker));durations.sort((a,b)=>a-b)
const percentile=value=>Math.round(durations[Math.min(durations.length-1,Math.floor(durations.length*value))]*100)/100
const report={target:baseUrl,requests:total,concurrency,failures,errorRate:failures/total,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99)}
console.log(JSON.stringify(report,null,2));if(report.errorRate>.01)process.exitCode=1
