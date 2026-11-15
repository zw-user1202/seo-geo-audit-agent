const https = require('https');
const logger = require('./logger');

// 🔴 安全提示：建议后续移至 .env 环境变量
// 🔴 安全提示：建议后续移至 .env 环境变量
const { getActiveProvider } = require('./ai_config');

/**
 * 完整的 SEO 诊断 JSON Schema 定义
 */
const SEO_REPORT_SCHEMA = {
    "summary": {
        "ai_score": "number (0-100, SEO综合评分，60以下为差，60-84为待优化，85以上为良好)",
        "p0_count": "number (严重问题数量)",
        "p1_count": "number (高优问题数量)",
        "p2_count": "number (建议项数量)",
        "p3_count": "number (提示项数量)",
        "p0_issues": ["string (严重问题简述列表)"],
        "p1_issues": ["string (高优问题简述列表)"],
        "p2_issues": ["string (建议项简述列表)"],
        "p3_issues": ["string (提示项/最佳实践简述列表)"]
    },
    "meta_section": {
        "critical_issues": [
            { "title": "string", "description": "string", "impact": "string" }
        ],
        "suggestions": [
            { "title": "string", "description": "string" }
        ],
        "optimization_guide": {
            "title_advice": {
                "before": "string",
                "after": "string",
                "rationale": "string"
            },
            "description_advice": {
                "before": "string",
                "after": "string",
                "rationale": "string"
            }
        },
        "code_diffs": [
            {
                "file": "string",
                "context": "string",
                "remove": "string",
                "add": "string"
            }
        ]
    },
    "content_section": [
        {
            "type": "h1_missing | alt_missing | structure_issue | other",
            "title": "string",
            "icon": "string",
            "color": "string",
            "description": "string",
            "code_snippet": {
                "before_label": "string",
                "before_code": "string",
                "after_label": "string",
                "after_code": "string"
            }
        }
    ],
    "tech_section": {
        "cards": [
            { "title": "string", "desc": "string", "code": "string", "color": "string" }
        ],
        "table": [
            { "item": "string", "status": "High/Warn/Opt", "desc": "string" }
        ]
    }
};

/**
 * 智能处理HTML内容，优先保留body部分，并进行清洗
 * 1. 移除脚本、样式、注释等非内容元素
 * 2. 移除 Base64 图片
 * 3. 确保 <html> 结构完整
 */
function cleanHtmlContent(html) {
    if (!html) return '';

    let cleaned = html;

    // 1. 移除 HTML 注释 (首先移除，以免影响后续标签匹配，且防止我们添加的标记被误删)
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

    // 2. 移除 <script>...</script>，但保留 JSON-LD (对于 SEO 至关重要)
    cleaned = cleaned.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs) => {
        if (attrs && /type=["']application\/ld\+json["']/i.test(attrs)) {
            return match;
        }
        return '<!-- script removed -->';
    });

    // 3. 移除 <style>...</style>
    cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<!-- style removed -->');

    // 4. 简化 SVG 内容 (保留标签但移除路径数据，节省大量 Token)
    cleaned = cleaned.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '<svg>...</svg>');

    // 5. 移除 Base64 图片数据 (data:image/...)
    cleaned = cleaned.replace(/src=["']data:image\/[^;]+;base64,[^"']+["']/gi, 'src="[base64_image_removed]"');

    // 6. 移除过多空白
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');

    return cleaned;
}

function prepareHtmlForAnalysis(htmlContent) {
    if (!htmlContent) return '';

    const MAX_LENGTH = 10000; // Reduced from 500000 to save API costs

    // 第一步：清洗内容
    let processed = cleanHtmlContent(htmlContent);

    // 如果清洗后已经足够小，直接返回
    if (processed.length <= MAX_LENGTH) {
        return processed;
    }

    // 第二步：如果仍然过大，尝试保留结构的情况下截断
    // 提取主要标签
    const doctypeMatch = processed.match(/<!DOCTYPE[^>]*>/i);
    const htmlStartMatch = processed.match(/<html[^>]*>/i);
    const headMatch = processed.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    const bodyStartMatch = processed.match(/<body[^>]*>/i);

    // 构建基础骨架
    const doctype = doctypeMatch ? doctypeMatch[0] : '<!DOCTYPE html>';
    const htmlStart = htmlStartMatch ? htmlStartMatch[0] : '<html>';
    const head = headMatch ? headMatch[0] : '<head><title>Page Too Large</title></head>';
    const bodyStart = bodyStartMatch ? bodyStartMatch[0] : '<body>';

    // 提取所有JSON-LD内容（这些对SEO分析至关重要）
    const jsonLdMatches = processed.match(/<script\b([^>]*)type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    const jsonLdContent = jsonLdMatches ? jsonLdMatches.join('\n') : '';

    // 移除body中的JSON-LD，避免重复
    let bodyContentMatch = processed.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    let bodyContent = '';

    if (bodyContentMatch) {
        bodyContent = bodyContentMatch[1];
        // 移除JSON-LD，稍后会在末尾添加
        bodyContent = bodyContent.replace(/<script\b([^>]*)type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, '');
    } else {
        const bodyStartIdx = processed.search(/<body\b[^>]*>/i);
        if (bodyStartIdx !== -1) {
            const match = processed.match(/<body\b[^>]*>/i);
            bodyContent = processed.substring(bodyStartIdx + match[0].length);
            // 移除JSON-LD，稍后会在末尾添加
            bodyContent = bodyContent.replace(/<script\b([^>]*)type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, '');
        } else {
            return processed.substring(0, MAX_LENGTH);
        }
    }

    // 计算骨架占用的长度（包括JSON-LD）
    const shellLength = doctype.length + htmlStart.length + head.length + bodyStart.length + jsonLdContent.length + 16;
    const remainingQuota = MAX_LENGTH - shellLength;

    if (remainingQuota <= 0) {
        // 极端情况：连Head和JSON-LD都放不下，只能硬截断
        return processed.substring(0, MAX_LENGTH);
    }

    // 截断Body内容
    if (bodyContent.length > remainingQuota) {
        bodyContent = bodyContent.substring(0, remainingQuota) + '\n<!-- Content Truncated for AI Analysis -->';
    }

    // 重组：在body末尾添加JSON-LD
    return `${doctype}\n${htmlStart}\n${head}\n${bodyStart}\n${bodyContent}\n${jsonLdContent}\n</body>\n</html>`;
}

/**
 * 核心分析逻辑：构建极致专业且详细的 SEO Prompt 并调用 DeepSeek
 * AI 仅根据提供的 HTML 进行审计，不告知抓取身份。
 */
function performSEOAnalysis(htmlContent, url, robotsSitemapData, callback) {
    const processedHtml = prepareHtmlForAnalysis(htmlContent);

    logger.info('AI Analysis Input Details', {
        url: url,
        originalHtmlSize: htmlContent ? htmlContent.length : 0,
        processedHtmlSize: processedHtml.length,
        htmlPreview: processedHtml.substring(0, 200),
        fullHtml: processedHtml,
        timestamp: new Date().toISOString()
    });

    const prompt = `您是一位拥有 15 年经验的顶级 SEO 技术专家（Google/Baidu SEO 专家）。
请对给定的 HTML 代码进行全方位、深度的 SEO 审计。

### 分析目标:
- **目标网站**: ${url}

### 审计核心维度（必须包含）：
1. **内容完整性与渲染 (Content & Rendering Audit)**:
   - 检查 HTML 源码中是否包含丰富的正文内容。
   - 识别是否存在 SPA/CSR 对爬虫不友好的问题，如果存在则标记为 P0 级严重错误。
2. **三要素深度评析 (TDK Excellence)**:
   - 评估 Title 和 Description 的吸引力、关键词覆盖度及长度是否符合规范。
   - **核心任务**：提供极具竞争力的”Before vs After”改写方案。**[!重要]：before 和 after 字段必须包含完整的 HTML 代码标签（如 <title>...</title> 或 <meta name=”description” content=”...”>），严禁只返回内容文本。**
3. **内容架构与语义 (Content & Structure)**:
   - 检查 H1-H3 逻辑层级是否完整（必须有且仅有一个 H1）。
   - 评估内容的丰富度，是否有隐藏文本风险。
4. **技术 SEO 细节 (Technical Audit)**:
   - **链接检查**：分析是否存在死链风险、nofollow 滥用或关键链接未包含在 <a> 标签中。
   - **多语言与移动化**：检查 Hreflang 标签、Viewport 设置以及移动端适配。
   - **资源分析**：检查图片 Alt 属性、Icon/Favicon 完整性。
   - **HTTPS**：检查页面是否使用 HTTPS，是否有 HTTP→HTTPS 跳转线索。
   - **内部链接**：分析页面内部链接结构、锚文本质量。
5. **结构化数据 (Structured Data)**:
   - 检索并验证 JSON-LD / Schema.org 标记。如果缺失且是电商/新闻类页面，记录为 P1 级建议。
6. **Robots.txt 与 Sitemap (Crawlability)**:
   - 根据下方提供的 robots.txt 和 sitemap.xml 数据进行分析。
   - 检查 robots.txt 是否存在、是否误封关键页面、是否声明了 sitemap。
   - 检查 sitemap.xml 是否存在、URL 数量是否合理。
   - 如果 robots.txt 不存在，记录为 P2 建议。
   - 如果 sitemap.xml 不存在，记录为 P2 建议。
7. **常规规范与提示 (Best Practices & Informational)**:
   - 检查 Robots Meta 标签（是否误设 noindex）、Canonical 权威链接、Favicon 支持。
   - **P3 级别定义**：记录那些不直接扣分、但属于行业”最佳实践”或”体验增强”的建议（如语义化标签的具体建议、性能微调、无障碍增强等）。

### Robots.txt 与 Sitemap 检测数据：
${robotsSitemapData ? JSON.stringify(robotsSitemapData, null, 2) : '（检测失败或不可用）'}

### 评分要求：
- 在 summary.ai_score 中给出 0-100 的 SEO 综合评分。
- 评分标准：90-100 优秀，85-89 良好，60-84 待优化，60 以下差。
- 评分需综合考虑：内容完整性、TDK质量、技术SEO、结构化数据、移动适配、可抓取性。
- 严重问题(P0)应大幅拉低分数，每个P0至少扣10分。

### 返回格式要求：
- **必须**返回严格合法的单一 JSON 对象。
- **严禁**输出任何解释性文字或 Markdown 代码块标记（如 \`\`\`json ）。
- 语言：请使用**中文**回答。

### 预期 JSON 结构详例：
${JSON.stringify(SEO_REPORT_SCHEMA, null, 4)}

---
待分析 HTML 内容（已智能处理，优先保留body部分，最大500,000字符）：
${processedHtml}`;

    const provider = getActiveProvider();
    const body = JSON.stringify(provider.formatRequest(
        [
            {
                role: 'system',
                content: '你是一个只输出 JSON 数据的 SEO 专家。请基于下方的详细且专业的诊断结果，直接给出具体可落地、代码级修改建议。'
            },
            { role: 'user', content: prompt }
        ],
        { temperature: 0, max_tokens: 16384 }
    ));

    logger.info('AI Request Details', {
        model: getActiveProvider().model,
        temperature: 0,
        promptLength: prompt.length,
        totalRequestSize: body.length,
        timestamp: new Date().toISOString()
    });

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

    const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    const result = JSON.parse(data);
                    let content;
                    
                    // Handle different API response formats
                    if (result.choices && result.choices[0]) {
                        // Standard OpenAI format (DeepSeek, Qianwen, Yuanbao)
                        content = result.choices[0].message.content;
                    } else if (result.output) {
                        // Doubao API v3 format
                        const messageOutput = result.output.find(o => o.type === 'message');
                        if (messageOutput && messageOutput.content) {
                            const textContent = messageOutput.content.find(c => c.type === 'output_text');
                            content = textContent ? textContent.text : JSON.stringify(messageOutput.content);
                        } else {
                            content = JSON.stringify(result.output);
                        }
                    } else {
                        throw new Error('Unknown API response format');
                    }

                    // 清理可能存在的 Markdown 标记
                    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                    const firstBrace = content.indexOf('{');
                    const lastBrace = content.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        content = content.substring(firstBrace, lastBrace + 1);
                    }

                    callback(null, JSON.parse(content));
                } catch (e) {
                    callback(new Error('AI 返回数据解析失败: ' + e.message));
                }
            } else {
                callback(new Error(`API 请求失败(${res.statusCode}): ${data}`));
            }
        });
    });

    req.on('timeout', () => {
        req.destroy();
        callback(new Error('Request timeout after 2 minutes'));
    });

    req.on('error', (err) => callback(err));
    req.write(body);
    req.end();
}

module.exports = {
    performSEOAnalysis,
    prepareHtmlForAnalysis,
    cleanHtmlContent
};
