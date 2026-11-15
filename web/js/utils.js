/**
 * SEO 工具 - 工具函数模块
 */

// 1. URL 验证 - 必须包含 http:// 或 https://
function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return false;

    try {
        const parsed = new URL(trimmedUrl);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// 自动补全URL协议
function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return '';

    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
        return trimmedUrl;
    }

    return `https://${trimmedUrl}`;
}

// 2. HTML 转义 (防止 XSS)
function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return unsafe || '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/`/g, "&#96;");
}

// 3. 计算 SEO 得分 (非线性扣分模型：边际递减 + 分类封顶)
/**
 * 混合评分：AI 基础分 (70%) + 技术信号分 (30%)
 * @param {object} summary - AI 返回的 summary 对象
 * @param {string} [htmlContent] - 原始 HTML（可选，用于技术信号提取）
 * @returns {number} 0-100
 */
function calculateSeoScore(summary, htmlContent) {
    if (!summary) return 0;

    // === AI 基础分 (70%) ===
    const aiScore = typeof summary.ai_score === 'number'
        ? Math.max(0, Math.min(100, summary.ai_score))
        : fallbackDeductionScore(summary);

    // === 技术信号分 (30%) ===
    let techScore = 50; // 默认中性分（无 HTML 时）
    if (htmlContent && htmlContent.length > 10) {
        techScore = calculateTechSignals(htmlContent);
    }

    // === 混合 ===
    return Math.round(aiScore * 0.7 + techScore * 0.3);
}

/**
 * 技术信号评分：10 项检查，每项 10 分，总分 100
 */
function calculateTechSignals(html) {
    let score = 0;

    // 1. 有 <title> 标签且内容非空
    if (/<title[^>]*>[^<]+<\/title>/i.test(html)) score += 10;

    // 2. 有 meta description 且 content 非空
    if (/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{10,}["']/i.test(html) ||
        /<meta[^>]+content=["'][^"']{10,}["'][^>]+name=["']description["']/i.test(html)) score += 10;

    // 3. 有 viewport meta（移动端适配）
    if (/<meta[^>]+name=["']viewport["']/i.test(html)) score += 10;

    // 4. 有 H1 标签
    if (/<h1[\s>]/i.test(html)) score += 10;

    // 5. 有 canonical 标签
    if (/<link[^>]+rel=["']canonical["']/i.test(html)) score += 10;

    // 6. 有结构化数据 (JSON-LD)
    if (/application\/ld\+json/i.test(html)) score += 10;

    // 7. 有 favicon
    if (/<link[^>]+rel=["'](shortcut )?icon["']/i.test(html) ||
        /<link[^>]+rel=["']icon["']/i.test(html)) score += 5;

    // 8. 有 Open Graph 标签
    if (/<meta[^>]+property=["']og:/i.test(html)) score += 5;

    // 9. 图片 alt 覆盖率 (按比例给分 0-10)
    const imgMatches = html.match(/<img[\s>]/gi) || [];
    if (imgMatches.length > 0) {
        const withAlt = (html.match(/<img[^>]+alt=["'][^"']+["']/gi) || []).length;
        score += Math.round((withAlt / imgMatches.length) * 10);
    } else {
        score += 5; // 无图片不算失分
    }

    // 10. 未设置 noindex
    if (!/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) {
        score += 10;
    }

    return Math.min(100, score);
}

/**
 * 兜底：无 AI 评分时，用旧的扣分逻辑
 */
function fallbackDeductionScore(summary) {
    let deduction = 0;
    const p0 = summary.p0_count || summary.p0_issues?.length || 0;
    const p1 = summary.p1_count || summary.p1_issues?.length || 0;
    const p2 = summary.p2_count || summary.p2_issues?.length || 0;
    if (p0 > 0) deduction += Math.min(25 + (p0 - 1) * 15, 80);
    if (p1 > 0) deduction += Math.min(10 + (p1 - 1) * 5, 40);
    if (p2 > 0) deduction += Math.min(3 + (p2 - 1) * 1, 20);
    return Math.max(0, 100 - deduction);
}



// 5. 复制到剪贴板
function copyToClipboard(text, buttonElement) {
    if (!navigator.clipboard) {
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        // 显示复制成功反馈
        if (buttonElement) {
            const originalText = buttonElement.innerHTML;
            buttonElement.innerHTML = '<i class="fas fa-check"></i> 已复制';
            buttonElement.classList.add('copied');
            setTimeout(() => {
                buttonElement.innerHTML = originalText;
                buttonElement.classList.remove('copied');
            }, 2000);
        }
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        // 显示复制成功反馈
        if (buttonElement) {
            const originalText = buttonElement.innerHTML;
            buttonElement.innerHTML = '<i class="fas fa-check"></i> 已复制';
            buttonElement.classList.add('copied');
            setTimeout(() => {
                buttonElement.innerHTML = originalText;
                buttonElement.classList.remove('copied');
            }, 2000);
        }
    }).catch(err => {
        console.error('复制失败:', err);
    });
}

// 5. 提取页面统计信息
function extractPageStats(html) {
    if (!html || typeof html !== 'string') {
        return {
            totalLinks: 0,
            internalLinks: 0,
            externalLinks: 0,
            totalImages: 0,
            imagesNoAlt: 0,
            htmlSize: '0 KB',
            topKeywords: []
        };
    }
    const linkMatch = html.match(/<a[^>]+href=["'](.*?)["']/gi) || [];
    const imgMatch = html.match(/<img[^>]+>/gi) || [];
    const imgNoAltMatch = html.match(/<img(?![^>]*\balt=)[^>]*>/gi) || [];

    let internalLinks = 0;
    let externalLinks = 0;
    linkMatch.forEach(tag => {
        if (tag.includes('http')) externalLinks++;
        else internalLinks++;
    });

    return {
        totalLinks: linkMatch.length,
        internalLinks: internalLinks,
        externalLinks: externalLinks,
        totalImages: imgMatch.length,
        imagesNoAlt: imgNoAltMatch.length,
        htmlSize: (html.length / 1024).toFixed(2) + ' KB',
        topKeywords: extractKeywordStats(html)
    };
}

// 6. 提取关键词频率
function extractKeywordStats(html) {
    if (!html || typeof html !== 'string') return [];

    // 1. 移除非内容区域
    let text = html
        // 移除 script/style/svg 内容
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        // 移除 HTML 注释
        .replace(/<!--[\s\S]*?-->/g, ' ')
        // 移除 head 区域（保留 title 和 meta description）
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, (match) => {
            const title = match.match(/<title[^>]*>([^<]*)<\/title>/i);
            const desc = match.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
            return (title ? title[1] + ' ' : '') + (desc ? desc[1] + ' ' : '');
        })
        // 移除所有 HTML 标签，只保留文本
        .replace(/<[^>]+>/g, ' ')
        // 移除 HTML 实体
        .replace(/&[a-z]+;/gi, ' ')
        // 移除多余空白
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();

    // 2. 扩展停用词表
    const stopWords = new Set([
        // 英文停用词
        'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
        'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may',
        'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'not',
        'about', 'after', 'before', 'into', 'through', 'during', 'between', 'under',
        'again', 'further', 'then', 'once', 'here', 'there', 'where', 'when', 'what',
        'which', 'who', 'whom', 'whose', 'why', 'how', 'all', 'each', 'few', 'more',
        'most', 'other', 'some', 'such', 'only', 'own', 'same', 'than', 'too', 'very',
        'just', 'also', 'now', 'any', 'both', 'does', 'did', 'doing', 'being',
        // 常见无意义词
        'version', 'mobile', 'copyright', 'search', 'home', 'page', 'site', 'link',
        'button', 'menu', 'login', 'register', 'submit', 'cancel', 'delete', 'edit',
        'view', 'show', 'hide', 'read', 'more', 'less', 'back', 'next', 'prev',
        'loading', 'error', 'success', 'warning', 'info', 'close', 'open', 'start',
        'end', 'top', 'bottom', 'left', 'right', 'center', 'middle',
        // 中文停用词
        '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
        '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
        '看', '好', '自己', '这', '那', '里', '为', '什么', '他', '她', '它',
        '我们', '你们', '他们', '这个', '那个', '这些', '那些', '可以', '因为',
        '所以', '但是', '如果', '或者', '而且', '还是', '已经', '可能', '应该',
        '这样', '那样', '怎么', '如何', '为什么', '哪里', '哪个', '多少'
    ]);

    // 3. 提取词汇（中文2-6字，英文3字以上）
    const words = text.match(/[\u4e00-\u9fa5]{2,6}|[a-z]{3,}/g) || [];

    // 4. 统计词频
    const freq = {};
    words.forEach(word => {
        if (!stopWords.has(word)) {
            freq[word] = (freq[word] || 0) + 1;
        }
    });

    // 5. 返回前8个高频词
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
}

