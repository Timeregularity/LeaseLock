import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import { pool } from '../db/pool.js'

const mutations=new Set(['POST','PUT','PATCH','DELETE'])

export function requestContext(request,response,next){request.id=request.get('X-Request-Id')?.slice(0,100)||randomUUID();response.set('X-Request-Id',request.id);const started=performance.now();response.on('finish',()=>{const record={level:response.statusCode>=500?'error':'info',type:'http_request',requestId:request.id,method:request.method,path:request.originalUrl,status:response.statusCode,durationMs:Math.round((performance.now()-started)*100)/100};console.log(JSON.stringify(record))});next()}

export function csrfOriginCheck(request,response,next){if(!mutations.has(request.method))return next();const origin=request.get('Origin');if(!origin)return next();if(origin!==config.clientOrigin)return response.status(403).json({code:'CSRF_ORIGIN_REJECTED',message:'This request origin is not allowed.'});next()}

export function auditSuccessfulMutations(request,response,next){if(!mutations.has(request.method))return next();response.on('finish',()=>{if(response.statusCode>=200&&response.statusCode<400){const segments=request.path.split('/').filter(Boolean);pool.query(`INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
      VALUES($1,$2,$3,$4,$5,$6)`,[request.user?.id||null,`${request.method} ${request.baseUrl||''}${request.route?.path||request.path}`,segments[0]||'api',request.params?.id||request.params?.identifier||null,request.id,{status:response.statusCode}]).catch(error=>console.error(JSON.stringify({level:'error',type:'audit_failure',requestId:request.id,message:error.message})))} });next()}
