// Day3核心场景探针。只用合成账号、内存PGlite、本机临时HTTP和明确标注的模型/检索替身。
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
const root=path.resolve(process.argv[2]??'.');
const require=createRequire(path.join(root,'backend/package.json'));
const {PGlite}=require('@electric-sql/pglite');
const load=p=>import(pathToFileURL(path.join(root,p)).href);
const {createApp}=await load('backend/src/app.js');
const {AuthService}=await load('backend/src/services/auth-service.js');
const {TaskService}=await load('backend/src/services/task-service.js');
const {ConsentService}=await load('backend/src/services/consent-service.js');
const {NamingCard}=await load('backend/src/ai/naming-card-router.js');
const {MockModelAdapter}=await load('backend/src/ai/mock-model-adapter.js');
const {createSyntheticModelRequest}=await load('backend/test/fixtures/model-requests.js');
const {runMigrations}=await load('backend/src/db/migration-runner.js');
const {sessionStateResponseSchema,searchTaskStateSchema}=await import(pathToFileURL(require.resolve('@404notfound/contracts')).href);
const db=new PGlite();await runMigrations(db);
const auth=new AuthService(db,{profileKey:randomBytes(32)});
const consent=new ConsentService();let mode='instant';let finish;let modelCalls=0;
const fakeResult=()=>({searchState:'SUCCESS',partial:false,hasConflict:false,claims:[],sources:[{id:randomUUID(),title:'合成来源（非真实检索）',url:'https://example.invalid/synthetic',publishedAt:null,retrievedAt:new Date().toISOString(),quality:'UNKNOWN'}]});
const searchProvider={search:async()=>mode==='instant'?fakeResult():new Promise(resolve=>{finish=resolve;})};
const taskService=new TaskService({consentService:consent,searchProvider});
const mock=new MockModelAdapter();
const server=createApp({database:db,authService:auth,consentService:consent,taskService,modelAdapter:{respond:async value=>{modelCalls++;return mock.respond(value);}}}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;const origin='http://127.0.0.1:5173';const checks=[];
const rec=(id,name,expected,actual,pass,kind='contract')=>checks.push({id,name,kind,expected,actual,pass});
async function context(cookie){const r=await fetch(base+'/api/auth/context',{headers:cookie?{Cookie:cookie}:{}});const b=await r.json();return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:b.data.csrfToken};}
async function call(method,route,ctx,body){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Origin:origin,...(ctx?{Cookie:ctx.cookie,'X-CSRF-Token':ctx.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});let value=null;try{value=await r.json();}catch{}return {status:r.status,body:value,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function search(ctx){const sessionReply=await call('POST','/api/sessions',ctx,{requestId:randomUUID(),mode:'SEARCH'});const s=sessionReply.body.data;const payload={sessionId:s.sessionId,activityId:s.activityId,sessionGeneration:s.sessionGeneration,activityGeneration:s.activityGeneration,question:'仅使用合成来源的PM生命周期验证'};const c=await call('POST','/api/consents',ctx,{requestId:randomUUID(),purpose:'SEARCH_PROCESS',operation:'SEARCH_TASK_CREATE',payload});const request={requestId:randomUUID(),...payload,consentId:c.body.data.consentId};return {sessionReply,s,request,consentId:c.body.data.consentId};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
try{
 const routing=[NamingCard.select({emotionWords:['困惑']}),NamingCard.select({emotionWords:['困惑'],need:'LISTEN'}),NamingCard.select({emotionWords:['困惑'],need:'ORGANIZE'}),NamingCard.select({emotionWords:['困惑'],need:'SEARCH'})];
 rec('D3-01','命名卡确定性路由（直接模块）',{targets:[null,'COMPANION','COMPANION','SEARCH'],searchRequiresQuestion:true},{targets:routing.map(x=>x.targetMode),searchRequiresQuestion:routing[3].requiresQuestion},routing[0].targetMode===null&&routing[1].targetMode==='COMPANION'&&routing[2].targetMode==='COMPANION'&&routing[3].requiresQuestion,'module');
 const anon=await context();const password='SYNTHETIC-Day3-only-password';
 await call('POST','/api/auth/register',anon,{requestId:randomUUID(),loginName:'pm_d3_probe',password,confirmPassword:password});
 const login=await call('POST','/api/auth/login',anon,{loginName:'pm_d3_probe',password,target:'PROFILE'});const a=await context(login.cookie);
 const internal=await call('POST','/internal/v1/model/generate',null,createSyntheticModelRequest());
 rec('D3-02','匿名请求不能进入内部模型适配器',{status:'401/403',adapterCalls:0},{status:internal.status,adapterCalls:modelCalls,mock:true},[401,403].includes(internal.status)&&modelCalls===0,'security');
 const agent=await call('POST','/api/agent/tasks',a,{requestId:randomUUID()});
 rec('D3-03','正式陪伴任务入口已登记',{status:'非404；未实现时明确503'},{status:agent.status,code:agent.body?.error?.code},agent.status!==404,'availability');
 const complete=await search(a);const created=await call('POST','/api/search/tasks',a,complete.request);await tick();
 const completed=await call('GET',`/api/search/tasks/${complete.request.requestId}`,a);
 rec('D3-04','查询受理至完成（检索替身）',{accepted:202,status:'completed',sources:1},{accepted:created.status,status:completed.body?.data?.status,sources:completed.body?.data?.sources?.length},created.status===202&&completed.body?.data?.status==='completed'&&completed.body.data.sources.length===1,'http_stub');
 const sessionParsed=sessionStateResponseSchema.safeParse(complete.sessionReply.body.data);
 rec('D3-05','创建会话HTTP响应符合共享Schema',{valid:true},{valid:sessionParsed.success,unknownOwnerKey:Object.hasOwn(complete.sessionReply.body.data,'ownerKey')},sessionParsed.success);
 const taskParsed=searchTaskStateSchema.safeParse(completed.body.data);
 rec('D3-06','查询结果符合共享Schema',{valid:true},{valid:taskParsed.success,sourceKeys:Object.keys(completed.body.data.sources[0]),resultKeys:Object.keys(completed.body.data)},taskParsed.success);
 const other=await context();const wrong=await call('GET',`/api/search/tasks/${complete.request.requestId}`,other);
 rec('D3-07','他人匿名上下文不能读取查询任务',{status:404},{status:wrong.status},wrong.status===404,'http_stub');
 const end=await call('POST',`/api/sessions/${complete.s.sessionId}/actions`,a,{requestId:randomUUID(),action:'END',expectedSessionGeneration:0,expectedActivityGeneration:0});
 const afterEnd=await call('GET',`/api/search/tasks/${complete.request.requestId}`,a);
 rec('D3-08','结束业务会话后完成结果立即不可取',{end:200,resultReadable:false},{end:end.status,resultReadable:Boolean(afterEnd.body?.data?.sources?.length),status:afterEnd.body?.data?.status},end.status===200&&!afterEnd.body?.data?.sources?.length,'lifecycle');
 mode='controlled';const cancel=await search(a);await call('POST','/api/search/tasks',a,cancel.request);await tick();const release=finish;
 const cancelled=await call('POST',`/api/search/tasks/${cancel.request.requestId}/cancel`,a,{requestId:randomUUID()});release(fakeResult());await tick();const late=await call('GET',`/api/search/tasks/${cancel.request.requestId}`,a);
 rec('D3-09','显式取消后迟到结果不回填',{status:'cancelled',sources:false},{cancel:cancelled.status,status:late.body?.data?.status,sources:Boolean(late.body?.data?.sources)},late.body?.data?.status==='cancelled'&&!late.body?.data?.sources,'http_stub');
 mode='instant';const paused=await search(a);await call('POST',`/api/sessions/${paused.s.sessionId}/actions`,a,{requestId:randomUUID(),action:'PAUSE',expectedSessionGeneration:0,expectedActivityGeneration:0});const whilePaused=await call('POST','/api/search/tasks',a,paused.request);await tick();
 rec('D3-10','暂停会话拒绝创建新的外部任务',{status:409},{status:whilePaused.status},whilePaused.status===409,'lifecycle');
 const revoked=await search(a);await call('POST','/api/search/tasks',a,revoked.request);await tick();await call('POST',`/api/consents/${revoked.consentId}/revoke`,a,{requestId:randomUUID()});const afterRevoke=await call('GET',`/api/search/tasks/${revoked.request.requestId}`,a);
 rec('D3-11','撤销检索许可后任务结果不可读取',{resultReadable:false},{status:afterRevoke.status,resultReadable:Boolean(afterRevoke.body?.data?.sources?.length)},!afterRevoke.body?.data?.sources?.length,'lifecycle');
 const anon2=await context();const login2=await call('POST','/api/auth/login',anon2,{loginName:'pm_d3_probe',password,target:'PROFILE'});const b=await context(login2.cookie);
 const changed=await call('POST','/api/auth/change-password',b,{currentPassword:password,newPassword:'SYNTHETIC-Day3-next-password',confirmPassword:'SYNTHETIC-Day3-next-password'});const oldA=await call('GET','/api/profile',a);const oldB=await call('GET','/api/profile',b);
 rec('D3-12','改密撤销同账号两个旧会话',{change:204,a:401,b:401},{change:changed.status,a:oldA.status,b:oldB.status},changed.status===204&&oldA.status===401&&oldB.status===401,'http');
 console.log(JSON.stringify({commit:'1483f8330c3c47ecf88863968f518705a1a84918',recordedAt:new Date().toISOString(),environment:'PGlite + localhost HTTP; synthetic users; model/search substitutes only',checks,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length},null,2));
 process.exitCode=checks.every(x=>x.pass)?0:1;
}finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await db.close();}
