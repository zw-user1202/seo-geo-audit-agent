function normalizeHtml(html) {
    return typeof html === 'string' ? html : '';
}

function stripTags(value) {
    return (value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;|&#\d+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractFirst(html, regex) {
    const match = html.match(regex);
    return match ? stripTags(match[1]) : '';
}

function getAttribute(tag, name) {
    const regex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const match = tag.match(regex);
    return match ? (match[1] || match[2] || match[3] || '').trim() : '';
}

function extractHeadings(html, tagName) {
    const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
    const headings = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
        const text = stripTags(match[1]);
        if (text) headings.push(text);
    }

    return headings;
}

function extractLinks(html) {
    const tags = html.match(/<a\b[^>]*>/gi) || [];
    let internal = 0;
    let external = 0;

    tags.forEach(tag => {
        const href = getAttribute(tag, 'href');
        if (!isMeaningfulCrawlHref(href)) return;

        if (/^(https?:)?\/\//i.test(href)) {
            external++;
        } else {
            internal++;
        }
    });

    return {
        total: internal + external,
        internal: internal,
        external: external
    };
}

function isMeaningfulCrawlHref(href) {
    if (!href) return false;

    const normalized = href.trim();
    if (!normalized || normalized.startsWith('#')) return false;
    if (/^(mailto|tel|javascript):/i.test(normalized)) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^https?:/i.test(normalized)) return false;

    return true;
}

function extractImages(html) {
    const tags = html.match(/<img\b[^>]*>/gi) || [];
    let withAlt = 0;

    tags.forEach(tag => {
        if (/\balt\s*=/i.test(tag) && getAttribute(tag, 'alt')) {
            withAlt++;
        }
    });

    return {
        total: tags.length,
        withAlt: withAlt,
        missingAlt: tags.length - withAlt
    };
}

function collectSchemaTypes(value, types) {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
        value.forEach(item => collectSchemaTypes(item, types));
        return;
    }

    if (value['@type']) {
        if (Array.isArray(value['@type'])) {
            value['@type'].forEach(type => {
                if (typeof type === 'string') types.add(type);
            });
        } else if (typeof value['@type'] === 'string') {
            types.add(value['@type']);
        }
    }

    Object.keys(value).forEach(key => {
        if (key === '@context') return;
        collectSchemaTypes(value[key], types);
    });
}

function extractSchema(html) {
    const regex = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
    const types = new Set();
    let count = 0;
    let match;

    while ((match = regex.exec(html)) !== null) {
        const scriptTag = match[0];
        if (getAttribute(scriptTag, 'type').toLowerCase() !== 'application/ld+json') {
            continue;
        }

        count++;
        const body = extractScriptBody(scriptTag);
        try {
            collectSchemaTypes(JSON.parse(body.trim()), types);
        } catch (err) {
            collectSchemaTypesFromText(body, types);
        }
    }

    return {
        hasJsonLd: count > 0,
        jsonLdCount: count,
        types: Array.from(types)
    };
}

function extractScriptBody(scriptTag) {
    const match = scriptTag.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    return match ? match[1] : '';
}

function collectSchemaTypesFromText(text, types) {
    const regex = /"@type"\s*:\s*(?:"([^"]+)"|\[([\s\S]*?)\])/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
            addSchemaType(types, match[1]);
        } else if (match[2]) {
            const values = match[2].match(/"([^"]+)"/g) || [];
            values.forEach(value => addSchemaType(types, value.replace(/^"|"$/g, '')));
        }
    }
}

function addSchemaType(types, type) {
    if (typeof type !== 'string') return;

    const normalized = type.trim();
    if (!normalized || normalized.startsWith('@')) return;

    types.add(normalized);
}

function extractDescription(html) {
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    const descriptionTag = metaTags.find(tag => getAttribute(tag, 'name').toLowerCase() === 'description');
    return descriptionTag ? getAttribute(descriptionTag, 'content') : '';
}

function extractKeywordStats(html) {
    html = normalizeHtml(html);
    if (!html) return [];

    const text = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, match => {
            const title = extractFirst(match, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
            const description = extractDescription(match);
            return `${title} ${description}`;
        })
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;|&#\d+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();

    if (!text) return [];

    const stopWords = new Set([
        'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
        'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may',
        'might', 'must', 'shall', 'can', 'not', 'about', 'after', 'before', 'into',
        'through', 'during', 'between', 'under', 'again', 'then', 'once', 'here',
        'there', 'where', 'when', 'what', 'which', 'who', 'why', 'how', 'all',
        'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
        'same', 'than', 'too', 'very', 'just', 'also', 'now', 'any', 'both',
        'does', 'did', 'doing', 'being', 'version', 'mobile', 'copyright', 'home',
        'page', 'site', 'link', 'button', 'menu', 'login', 'register', 'submit',
        'cancel', 'delete', 'edit', 'view', 'show', 'hide', 'read', 'less',
        'back', 'next', 'prev', 'loading', 'error', 'success', 'warning', 'info',
        'close', 'open', 'start', 'end', 'top', 'bottom', 'left', 'right',
        'center', 'middle', '的', '了', '是', '在', '我', '有', '和', '就',
        '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要',
        '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '里',
        '为', '什么', '他', '她', '它', '我们', '你们', '他们', '这个', '那个',
        '这些', '那些', '可以', '因为', '所以', '但是', '如果', '或者', '而且',
        '还是', '已经', '可能', '应该', '这样', '那样', '怎么', '如何',
        '为什么', '哪里', '哪个', '多少'
    ]);

    const words = text.match(/[\u4e00-\u9fa5]{2,6}|[a-z]{3,}/g) || [];
    const freq = {};

    words.forEach(word => {
        if (!stopWords.has(word)) {
            freq[word] = (freq[word] || 0) + 1;
        }
    });

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
}

function extractPageSignals(html) {
    html = normalizeHtml(html);

    return {
        title: extractFirst(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i),
        description: extractDescription(html),
        headings: {
            h1: extractHeadings(html, 'h1'),
            h2: extractHeadings(html, 'h2'),
            h3: extractHeadings(html, 'h3')
        },
        links: extractLinks(html),
        images: extractImages(html),
        schema: extractSchema(html),
        htmlSize: (html.length / 1024).toFixed(2) + ' KB',
        topKeywords: extractKeywordStats(html)
    };
}

module.exports = {
    extractPageSignals,
    extractKeywordStats
};
