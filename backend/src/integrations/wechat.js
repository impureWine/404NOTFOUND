import express from 'express';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { TaskService } from '../services/task-service.js';
import { ConsentService } from '../services/consent-service.js';

export function signature(token, timestamp, nonce, encrypted = null) {
  return createHash('sha1').update([token, timestamp, nonce, ...(encrypted === null ? [] : [encrypted])].sort().join('')).digest('hex');
}
function equals(a, b) { return typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export function field(xml, name, required = true) {
  if (typeof xml !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('无效 XML');
  const matches = [...xml.matchAll(new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${name}>`, 'g'))];
  if (matches.length !== 1) { if (!required && matches.length === 0) return ''; throw new Error('消息字段无效'); }
  return matches[0][1] ?? matches[0][2].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
const cdata = value => `<![CDATA[${String(value).replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
export function encryptXml(xml, keyText, appId) {
  const key = Buffer.from(keyText + '=', 'base64'); if (key.length !== 32 || !appId) throw new Error('微信加密配置无效');
  const text = Buffer.from(xml), length = Buffer.alloc(4); length.writeUInt32BE(text.length);
  const input = Buffer.concat([randomBytes(16), length, text, Buffer.from(appId)]);
  const padding = 32 - input.length % 32;
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0,16)); cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(Buffer.concat([input, Buffer.alloc(padding, padding)])), cipher.final()]).toString('base64');
}
export function decryptXml(encrypted, keyText, appId) {
  const key = Buffer.from(keyText + '=', 'base64'); if (key.length !== 32 || !appId) throw new Error('微信加密配置无效');
  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0,16)); decipher.setAutoPadding(false);
  let body = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
  const padding = body.at(-1); if (padding < 1 || padding > 32 || !body.subarray(-padding).every(value => value === padding)) throw new Error('微信消息填充无效');
  body = body.subarray(0, -padding); if (body.length < 20) throw new Error('微信消息无效');
  const length = body.readUInt32BE(16); if (length > body.length - 20 || !equals(body.subarray(20 + length).toString(), appId)) throw new Error('微信应用标识不匹配');
  return body.subarray(20,20+length).toString();
}
export function createWechatRouter({ env = process.env, modelAdapter, searchProvider, now = Date.now } = {}) {
  const router = express.Router(), consentService = new ConsentService();
  const tasks = new TaskService({ consentService, modelAdapter, searchProvider });
  const users = new Map(), duplicates = new Map();
  const token = env.WECHAT_TOKEN;
  const web = env.WECHAT_WEB_URL && /^https:\/\//.test(env.WECHAT_WEB_URL) ? env.WECHAT_WEB_URL : '';
  const forget = context => {
    tasks.invalidateContext(context);
    const ownerKey = tasks.ownerKey(context);
    for (const [key, value] of tasks.sessions) if (value.ownerKey === ownerKey) tasks.sessions.delete(key);
    for (const map of [tasks.agentTasks, tasks.searchTasks]) for (const [key, value] of map) if (value.ownerKey === ownerKey) map.delete(key);
  };
  const help = `这是 404NOTFOUND 微信入口。回复“同意”，允许未来五分钟内明确提交的问题交给模型或检索服务处理；不保存历史，不读取 Web/桌面记录。之后可发送文字倾诉，或“查 具体问题”。发送“结果”取回本次回复，“结束”清理当前临时会话。${web ? `完整功能：${web}` : '完整功能网址尚未配置。'}`;
  router.use(express.text({ type: ['text/xml', 'application/xml'], limit: '32kb' }));
  router.use((request, response, next) => {
    if (!token) return response.status(503).send('微信服务未配置');
    const { timestamp, nonce } = request.query;
    if (typeof timestamp !== 'string' || typeof nonce !== 'string' || nonce.length > 256 || !/^\d+$/.test(timestamp) || Math.abs(now()/1000 - Number(timestamp)) > 300) return response.status(403).send('签名时间无效');
    const encrypted = typeof request.body === 'string' && request.body.includes('<Encrypt>');
    try {
      if (encrypted) {
        const content = field(request.body, 'Encrypt');
        if (!equals(signature(token,timestamp,nonce,content), request.query.msg_signature)) return response.status(403).send('签名无效');
        request.wechatXml = decryptXml(content, env.WECHAT_ENCODING_AES_KEY || '', env.WECHAT_APP_ID || '');
      } else {
        if (!equals(signature(token,timestamp,nonce), request.query.signature)) return response.status(403).send('签名无效');
        request.wechatXml = request.body;
      }
      request.wechatEncrypted = encrypted; next();
    } catch { response.status(400).send('微信消息或加密配置无效'); }
  });
  router.get('/', (request, response) => {
    const echo = request.query.echostr;
    if (typeof echo !== 'string' || echo.length > 2048) return response.status(400).send('验证参数无效');
    response.type('text/plain').send(echo);
  });
  router.post('/', (request, response) => {
    try {
      const xml = request.wechatXml;
      if (typeof xml !== 'string' || !/^\s*<xml>[\s\S]*<\/xml>\s*$/.test(xml)) throw new Error('消息根节点无效');
      const from = field(xml,'FromUserName'), to = field(xml,'ToUserName'), type = field(xml,'MsgType');
      if (from.length > 128 || to.length > 128) throw new Error('标识过长');
      if (type !== 'text') return response.type('text/plain').send('success');
      const content = field(xml,'Content').trim(); if (Array.from(content).length > 4000) throw new Error('文本过长');
      const owner = createHash('sha256').update(from).digest('hex');
      const context = { accountId: null, sessionId: `wechat:${owner}` };
      for (const [key, value] of users) if (value.expires < now()) { forget(value.context); users.delete(key); }
      for (const [key, value] of duplicates) if (value.expires < now()) duplicates.delete(key);
      const duplicateKey = createHash('sha256').update(`${owner}:${field(xml,'MsgId',false) || field(xml,'CreateTime',false)}:${content}`).digest('hex');
      if (duplicates.has(duplicateKey)) return response.type('application/xml').send(duplicates.get(duplicateKey).xml);
      if (users.size >= 1000 || duplicates.size >= 3000) return response.status(503).send('服务繁忙');
      for (const [key, value] of consentService.consents) if (value.expiresAt.getTime() < now()) consentService.consents.delete(key);
      let answer = help, user = users.get(owner);
      if (content === '同意') { if (user) forget(context); user = { context, expires: now()+300000, latest: null, session: null }; users.set(owner,user); answer = '已确认。请发送本次想表达的内容；之后发送“结果”取回回复。'; }
      else if (content === '结束') { forget(context); users.delete(owner); for (const [key, value] of duplicates) if (value.owner === owner) duplicates.delete(key); answer = '当前临时会话已结束。'; }
      else if (content === '结果' && user?.latest) {
        const task = user.search ? tasks.getSearchTask(context,user.latest) : tasks.getAgentTask(context,user.latest);
        answer = task.status === 'completed' ? user.search ? task.sources.map(source => `${source.title}\n${source.url}`).join('\n') || '没有检索结果。' : task.result.text : ['failed','cancelled','expired'].includes(task.status) ? `任务未完成：${task.failureReason || task.status}` : '正在处理，请稍后再发送“结果”。';
      } else if (user && !['帮助','开始'].includes(content)) {
        if (user.latest) { const old = user.search ? tasks.getSearchTask(context,user.latest) : tasks.getAgentTask(context,user.latest); if (['pending','running'].includes(old.status)) answer = '上次请求仍在处理，请发送“结果”或“结束”。'; else user.latest = null; }
        if (!user.latest) {
          const search = content.startsWith('查 '), text = search ? content.slice(2).trim() : content;
          const session = tasks.createSession(context,{ requestId: randomUUID(), mode: search ? 'SEARCH' : 'LISTEN' });
          user.session = session;
          const payload = { sessionId:session.sessionId, activityId:session.activityId, sessionGeneration:session.sessionGeneration, activityGeneration:session.activityGeneration,
            ...(search ? { question:text } : { mode:'LISTEN', operation:'REPLY', selectedText:text, selectedContextIds:[] }) };
          const consent = consentService.create(context,{ requestId:randomUUID(), purpose:search?'SEARCH_PROCESS':'AI_PROCESS', operation:search?'SEARCH_TASK_CREATE':'AGENT_TASK_CREATE', payload });
          const body = { ...payload, requestId:randomUUID(), consentId:consent.consentId };
          const task = search ? tasks.createSearchTask(context,body) : tasks.createAgentTask(context,body);
          user.latest = task.requestId; user.search = search; answer = '真实服务已接受请求，请稍后发送“结果”。';
        }
      }
      let reply = `<xml><ToUserName>${cdata(from)}</ToUserName><FromUserName>${cdata(to)}</FromUserName><CreateTime>${Math.floor(now()/1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content>${cdata(answer)}</Content></xml>`;
      if (request.wechatEncrypted) { const encrypted = encryptXml(reply,env.WECHAT_ENCODING_AES_KEY,env.WECHAT_APP_ID), stamp=String(Math.floor(now()/1000)), nonce=randomBytes(12).toString('hex'); reply=`<xml><Encrypt>${cdata(encrypted)}</Encrypt><MsgSignature>${cdata(signature(token,stamp,nonce,encrypted))}</MsgSignature><TimeStamp>${stamp}</TimeStamp><Nonce>${cdata(nonce)}</Nonce></xml>`; }
      duplicates.set(duplicateKey,{ owner, xml:reply, expires:now()+300000 });
      response.type('application/xml').send(reply);
    } catch { response.status(400).type('text/plain').send('消息无效，或真实服务未就绪'); }
  });
  return router;
}
