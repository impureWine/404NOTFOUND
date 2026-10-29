import assert from 'node:assert/strict';
import test from 'node:test';
import { listenForHttp } from '../helpers/http.js';
import express from 'express';
import { createWechatRouter, signature, encryptXml, decryptXml, field } from '../../src/integrations/wechat.js';
const stamp = () => String(Math.floor(Date.now()/1000));
const token = 'test-token-only';
const key = Buffer.alloc(32,7).toString('base64').replace(/=$/,'');
const appId = 'test-app';
function xml(text, msgId) { return `<xml><ToUserName><![CDATA[test-account]]></ToUserName><FromUserName><![CDATA[test-user]]></FromUserName><CreateTime>${stamp()}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${text}]]></Content><MsgId>${msgId}</MsgId></xml>`; }
test('WeChat verifies signatures, rejects XML entities, deduplicates and dispatches only consented real tasks', async () => {
  let calls=0;
  const app=express(); app.use('/wechat',createWechatRouter({ env:{ WECHAT_TOKEN:token }, modelAdapter:{ respond:async()=>{ calls++;return { status:'success', result:{ content:'受控服务回复' } }; } } }));
  const server=await listenForHttp(app);
  const base=`http://127.0.0.1:${server.address().port}/wechat`;
  const query=()=>{const timestamp=stamp(),nonce='test-nonce';return `timestamp=${timestamp}&nonce=${nonce}&signature=${signature(token,timestamp,nonce)}`;};
  const send=(text,id)=>fetch(`${base}?${query()}`,{method:'POST',headers:{'Content-Type':'application/xml'},body:xml(text,id)});
  try {
    assert.equal((await fetch(`${base}?timestamp=${stamp()}&nonce=x&signature=invalid`)).status,403);
    assert.equal(await (await fetch(`${base}?${query()}&echostr=hello`)).text(),'hello');
    assert.match(await (await send('我想说一句话','1')).text(),/同意/); assert.equal(calls,0);
    assert.equal((await send('同意','2')).status,200);
    assert.match(await (await send('我今天很疲惫','3')).text(),/真实服务已接受/);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,1);
    await send('我今天很疲惫','3');assert.equal(calls,1);
    assert.match(await (await send('结果','4')).text(),/受控服务回复/);
    assert.equal((await fetch(`${base}?${query()}`,{method:'POST',headers:{'Content-Type':'application/xml'},body:'<!DOCTYPE xml [<!ENTITY e SYSTEM "file:///secret">]><xml></xml>'})).status,400);
    await send('结束','5');assert.match(await (await send('再次发送','6')).text(),/同意/); assert.equal(calls,1);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('WeChat AES envelope validates app identity and serves encrypted replies', async()=>{
  const sample=xml('帮助','20');const encoded=encryptXml(sample,key,appId);assert.equal(decryptXml(encoded,key,appId),sample);assert.throws(()=>decryptXml(encoded,key,'wrong-app'));
  const app=express();app.use('/wechat',createWechatRouter({env:{WECHAT_TOKEN:token,WECHAT_ENCODING_AES_KEY:key,WECHAT_APP_ID:appId}}));
  const server=await listenForHttp(app);
  try{const timestamp=stamp(),nonce='aes-test';const response=await fetch(`http://127.0.0.1:${server.address().port}/wechat?timestamp=${timestamp}&nonce=${nonce}&msg_signature=${signature(token,timestamp,nonce,encoded)}`,{method:'POST',headers:{'Content-Type':'application/xml'},body:`<xml><Encrypt><![CDATA[${encoded}]]></Encrypt></xml>`});assert.equal(response.status,200);const reply=await response.text();const cipher=field(reply,'Encrypt');assert.match(decryptXml(cipher,key,appId),/同意/);assert.equal(field(reply,'MsgSignature'),signature(token,field(reply,'TimeStamp'),field(reply,'Nonce'),cipher));}
  finally{await new Promise(resolve=>server.close(resolve));}
});
