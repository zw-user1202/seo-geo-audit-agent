const https = require('https');
const { prepareHtmlForAnalysis } = require('./seo_analyzer');
const logger = require('./logger');

const { getActiveProvider } = require('./ai_config');

const GEO_REPORT_SCHEMA = {
    summary: {
        geo_score: 'number (0-100)',
        grade: 'poor | needs_work | good | strong',
        one_line_diagnosis: 'string',
        p0_count: 'number',
        p1_count: 'number',
        p2_count: 'number',
        top_opportunities: ['string']
    },
    visibility_factors: [
        {
            factor: 'entity_clarity | answer_extractability | trust_signals | semantic_structure | citation_friendliness | topic_coverage',
            score: 'number (0-100)',
            status: 'weak | partial | strong',
            finding: 'string',
            recommendation: 'string'
        }
    ],
    entity_analysis: {
        primary_entity: 'string',
        entity_type: 'brand | product | service | article | local_business | unknown',
        confidence: 'number (0-100)',
        ambiguities: ['string'],
        missing_attributes: ['string']
    },
    answer_blocks: [
        {
            question: 'string',
            current_answer: 'string',
            quality: 'missing | weak | usable | strong',
            improved_answer: 'string'
        }
    ],
    trust_signals: {
        present: ['string'],
        missing: ['string'],
        recommendations: ['string']
    },
    rewrite_suggestions: [
        {
            type: 'definition | faq | comparison | steps | summary | schema',
            title: 'string',
            before: 'string',
            after: 'string',
            rationale: 'string'
        }
    ],
    evidence: [
        {
            source: 'title | meta | heading | body | schema | robots | sitemap',
            excerpt: 'string',
            note: 'string'
        }
    ]
};

function parseJsonContent(content) {
    let cleaned = String(content || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleaned);
}

function performGEOAnalysis(htmlContent, url, pageSignals, callback) {
    const processedHtml = prepareHtmlForAnalysis(htmlContent);
    const prompt = `你是 GEO / AI Search Visibility 分析专家。
你的目标是判断页面内容是否容易被生成式搜索、问答模型和 AI 摘要系统理解、摘取、引用与推荐。

规则：
- 只根据提供的 HTML 和页面信号分析。
- 不要虚构外部事实。
- 不要承诺或暗示保证被 AI 搜索收录、引用或推荐。
- 每条建议都必须能落到页面内容或结构改动。
- 返回严格合法的单一 JSON 对象，不要输出 Markdown。
- 语言使用中文。

评分维度：
- Entity clarity 20%
- Answer extractability 25%
- Trust signals 20%
- Semantic structure 15%
- Citation friendliness 10%
- Topic coverage 10%

目标 URL：${url}

页面信号：
${JSON.stringify(pageSignals || {}, null, 2)}

预期 JSON 结构：
${JSON.stringify(GEO_REPORT_SCHEMA, null, 2)}

HTML：
${processedHtml}`;

    const provider = getActiveProvider();
    const body = JSON.stringify(provider.formatRequest(
        [
            {
                role: 'system',
                content: '你是一个只输出 JSON 数据的 GEO 专家。请基于下方的详细且专业的诊断结果，直接给出具体可落地、代码级修改建议。'
            },
            { role: 'user', content: prompt }
        ],
        { temperature: 0, max_tokens: 16384 }
    ));

    const options = {
        hostname: getActiveProvider().hostname,
        path: getActiveProvider().path,
        method: 'POST',
        timeout: 300000, // 5 minutes timeout
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + getActiveProvider().apiKey,
            'Content-Length': Buffer.byteLength(body)
        }
    };

    logger.info('GEO Analysis Request Details', {
        model: getActiveProvider().model,
        promptLength: prompt.length,
        totalRequestSize: body.length,
        url
    });

    const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    const result = JSON.parse(data);
                    const content = result.choices[0].message.content;
                    callback(null, parseJsonContent(content));
                } catch (error) {
                    callback(new Error(`GEO 返回数据解析失败: ${error.message}`));
                }
            } else {
                callback(new Error(`GEO API 请求失败(${res.statusCode}): ${data}`));
            }
        });
    });

    req.on('error', (error) => callback(error));
    req.write(body);
    req.end();
}

function analyzeGEO(htmlContent, url, pageSignals) {
    return new Promise((resolve, reject) => {
        performGEOAnalysis(htmlContent, url, pageSignals, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
}

module.exports = {
    GEO_REPORT_SCHEMA,
    performGEOAnalysis,
    analyzeGEO,
    parseJsonContent
};
