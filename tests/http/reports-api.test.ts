import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { ApiApp } from '../../src/http/api';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';
import { IdentityService } from '../../src/modules/identity/service';
const origin='http://localhost:3000'; const config=loadConfig({NODE_ENV:'test',PUBLIC_ORIGIN:origin,AUTH_ALLOW_INSECURE_LOCALHOST:'true'});
const post=(path:string,body:unknown,cookie='')=>new Request(origin+path,{method:'POST',headers:{origin,'x-ourpot-request':'1','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
it('returns a household-scoped report for an inclusive date range', async()=>{
 const db=createDatabaseClient(); const app=new ApiApp(db,config); const email=`report-${randomUUID()}@example.com`; await new IdentityService(db,config).register(email,'correct horse battery staple');
 const login=await app.fetch(post('/api/auth/login',{email,password:'correct horse battery staple'})); const cookie=login.headers.get('set-cookie')?.split(';')[0] ?? '';
 await app.fetch(post('/api/households',{name:'Home',currency:'USD',timezone:'UTC'},cookie));
 const response=await app.fetch(new Request(origin+'/api/reports?from=2026-01-01&to=2026-01-31',{headers:{cookie}})); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({range:{from:'2026-01-01',to:'2026-01-31'},household:{income:0,expense:0,net:0}});
 const invalid=await app.fetch(new Request(origin+'/api/reports?from=bad&to=2026-01-31',{headers:{cookie}})); expect(invalid.status).toBe(400);
});
