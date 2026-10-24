const ALLOWED_MODEL = 'glm-4.7-flash';
const ALLOWED_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/';

function readTimeoutMs(value) {
  if (value === undefined || value === '') {
    return 30_000;
  }

  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error('模型超时配置无效：ZHIPU_TIMEOUT_MS 必须是 1000 到 60000 的整数。');
  }
  return timeoutMs;
}

/**
 * 读取模型配置，并限制允许调用的模型和地址。
 * 免费状态依据已核对的供应商说明，价格变化需另外复核。
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env - 环境变量。
 * @returns {Readonly<{
 *   provider: string,
 *   model: string,
 *   baseUrl: string,
 *   timeoutMs: number,
 *   maxOutputTokens: number,
 *   maxRetries: number
 * }>} 通过检查的模型配置。
 * @throws {Error} 配置的模型或地址不在允许范围内。
 */
export function getModelConfig(env = process.env) {
  const model = env.ZHIPU_MODEL ?? ALLOWED_MODEL;
  const baseUrl = env.ZHIPU_BASE_URL ?? ALLOWED_BASE_URL;

  if (model !== ALLOWED_MODEL) {
    throw new Error('模型配置被阻止：当前仅允许 glm-4.7-flash。');
  }

  if (baseUrl !== ALLOWED_BASE_URL) {
    throw new Error('接口配置被阻止：当前仅允许指定的智谱官方地址。');
  }

  return Object.freeze({
    provider: 'zhipu',
    model,
    baseUrl,
    timeoutMs: readTimeoutMs(env.ZHIPU_TIMEOUT_MS),
    maxOutputTokens: 256,
    maxRetries: 0,
  });
}
