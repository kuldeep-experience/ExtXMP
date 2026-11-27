import { env } from '../../config/env.js';

// A provider is { name, label, isDemo, complete({ system, user }) -> Promise<string> }.
// The rest of the app only uses this interface, so providers can be swapped through environment variables.
export const demoProvider = { name: 'demo', label: 'Demo mode', isDemo: true, model: null };

const TIMEOUT_MS = 20000;

async function post(fetchImpl, url, headers, body) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`AI provider responded with HTTP ${res.status}`);
  return res.json();
}

const adapters = {
  // OpenAI and any server that implements the OpenAI chat completions API
  openai: ({ apiKey, model, baseUrl, headers = {} }, fetchImpl) => {
    const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    return {
      name: 'openai', label: `AI provider: ${baseUrl ? 'OpenAI-compatible' : 'OpenAI'}`, isDemo: false, model,
      async complete({ system, user }) {
        const data = await post(fetchImpl, `${base}/chat/completions`, { authorization: `Bearer ${apiKey}`, ...headers }, {
          model, temperature: 0,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          ...(baseUrl ? {} : { response_format: { type: 'json_object' } }),
        });
        return data.choices?.[0]?.message?.content ?? '';
      },
    };
  },
  // OpenRouter: one API key, many models (model ids look like "openai/gpt-4o-mini"). It speaks the OpenAI chat completions protocol.
  openrouter: ({ apiKey, model, baseUrl }, fetchImpl) => ({
    ...adapters.openai({ apiKey, model, baseUrl: baseUrl || 'https://openrouter.ai/api/v1', headers: { 'X-Title': 'Experience.com Visitor Platform' } }, fetchImpl),
    name: 'openrouter', label: 'AI provider: OpenRouter',
  }),
  anthropic: ({ apiKey, model }, fetchImpl) => ({
    name: 'anthropic', label: 'AI provider: Anthropic', isDemo: false, model,
    async complete({ system, user }) {
      const data = await post(fetchImpl, 'https://api.anthropic.com/v1/messages', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, {
        model, max_tokens: 1024, temperature: 0, system, messages: [{ role: 'user', content: user }],
      });
      return data.content?.find((c) => c.type === 'text')?.text ?? '';
    },
  }),
};

export function createProvider(config, fetchImpl = fetch) {
  const { provider, apiKey, model, baseUrl } = config;
  if (!provider || provider === 'demo' || !apiKey || !model || !adapters[provider]) return demoProvider;
  return adapters[provider]({ apiKey, model, baseUrl }, fetchImpl);
}

let cached;
export function getProvider() {
  cached ||= createProvider({ provider: env.AI_PROVIDER, apiKey: env.AI_API_KEY, model: env.AI_MODEL, baseUrl: env.AI_BASE_URL });
  return cached;
}
