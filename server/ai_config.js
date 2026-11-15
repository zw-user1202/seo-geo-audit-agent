// AI Provider Configuration
const PROVIDERS = {
    deepseek: {
        hostname: 'api.deepseek.com',
        model: 'deepseek-v4-pro',
        path: '/v1/chat/completions',
        getKey: () => process.env.DEEPSEEK_API_KEY,
        formatRequest: (messages, options) => ({
            model: options.model || 'deepseek-v4-pro',
            messages: messages,
            temperature: options.temperature || 0.3,
            max_tokens: options.max_tokens || 4000
        })
    },
    doubao: {
        hostname: 'ark.cn-beijing.volces.com',
        model: 'doubao-seed-character-260628',
        path: '/api/v3/chat/completions',
        getKey: () => process.env.DOUBAO_API_KEY,
        formatRequest: (messages, options) => ({
            model: options.model || 'doubao-seed-evolving',
            messages: messages,
            temperature: options.temperature || 0.3,
            max_tokens: options.max_tokens || 4000
        })
    },
    qianwen: {
        hostname: 'dashscope.aliyuncs.com',
        model: 'qwen-max',
        path: '/compatible-mode/v1/chat/completions',
        getKey: () => process.env.QIANWEN_API_KEY,
        formatRequest: (messages, options) => ({
            model: options.model || 'qwen-max',
            messages: messages,
            temperature: options.temperature || 0.3,
            max_tokens: options.max_tokens || 4000
        })
    },
    yuanbao: {
        hostname: 'hunyuan.tencentcloudapi.com',
        model: 'hunyuan-pro',
        path: '/v1/chat/completions',
        getKey: () => process.env.YUANBAO_API_KEY,
        formatRequest: (messages, options) => ({
            model: options.model || 'hunyuan-pro',
            messages: messages,
            temperature: options.temperature || 0.3,
            max_tokens: options.max_tokens || 4000
        })
    }
};

function getActiveProvider() {
    const name = process.env.AI_PROVIDER || 'deepseek';
    const provider = PROVIDERS[name];
    if (!provider) {
        console.warn('Unknown AI_PROVIDER:', name + ', falling back to deepseek');
        return { ...PROVIDERS.deepseek, name: 'deepseek' };
    }
    const key = provider.getKey();
    if (!key || key.startsWith('your_')) {
        throw new Error('API Key not configured for: ' + name + '. Please set ' + name.toUpperCase() + '_API_KEY in .env');
    }
    return { ...provider, apiKey: key, name: name };
}

module.exports = { getActiveProvider, PROVIDERS };
