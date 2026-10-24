import { LangChainModelAdapter } from '../src/ai/langchain-model-adapter.js';
import { createSyntheticModelRequest } from '../test/fixtures/model-requests.js';

try {
  process.loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

const requestId = `req-live-smoke-${Date.now()}`;
const result = await new LangChainModelAdapter().respond(createSyntheticModelRequest({
  request_id: requestId,
  metadata: {
    trace_id: `trace-live-smoke-${Date.now()}`,
    prompt_version: 'companion-v1',
  },
}));

// 只打印验收所需元数据和合成回复，不打印密钥、请求头或供应商原始错误。
console.log(JSON.stringify({
  request_id: result.request_id,
  status: result.status,
  content: result.result?.content ?? null,
  error: result.error
    ? { code: result.error.code, user_message: result.error.user_message }
    : null,
  model_info: result.model_info,
  usage: result.usage ?? null,
  timing: result.timing,
}, null, 2));

process.exitCode = result.status === 'success' ? 0 : 1;
