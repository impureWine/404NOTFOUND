// 单次真实检索可用性观察：只提交公开合成问题，不调用模型、不使用账号或密钥。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root=path.resolve(process.argv[2]??'.');
const {WikipediaSearchProvider}=await import(pathToFileURL(path.join(root,'backend/src/search/wikipedia-search-provider.js')).href);
const start=Date.now();let observation;
try{
 const provider=new WikipediaSearchProvider({language:'zh',timeoutMs:8000});
 const result=await provider.search({question:'PostgreSQL',limit:2});
 observation={state:result.searchState,sources:result.sources,sourceCount:result.sources.length,success:result.searchState==='SUCCESS'&&result.sources.length>0};
}catch(error){observation={state:['TIMEOUT','SERVICE_UNAVAILABLE'].includes(error.code)?error.code:'UNEXPECTED_FAILURE',sourceCount:0,success:false};}
console.log(JSON.stringify({commit:'3c6b3b3878f5d4e47f82eae23270e58238d73ceb',recordedAt:new Date().toISOString(),provider:'https://zh.wikipedia.org/w/api.php',syntheticQuestion:'PostgreSQL',timeoutMs:8000,elapsedMs:Date.now()-start,...observation},null,2));
// exit0表示探测脚本完成，不表示真实检索成功；判定以success/state字段为准。
