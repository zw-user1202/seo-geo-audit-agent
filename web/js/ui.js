/**
 * SEO 工具 - UI 渲染模块
 * 科技感设计版本
 */

function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return unsafe || '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function displayAnalysisResult(data, url, stats, score) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    if (!data || typeof data !== 'object') {
        container.innerHTML = '<div style="text-align:center;padding:48px 24px;color:var(--text-muted);font-size:13px">报告数据不可用</div>';
        container.classList.remove('hidden');
        return;
    }

    const safeScore = typeof score === 'number' ? score : 0;

    const safeStats = {
        htmlSize: stats?.htmlSize || stats?.html_size || '0 KB',
        totalLinks: stats?.totalLinks || stats?.total_links || 0,
        internalLinks: stats?.internalLinks || stats?.internal_links || 0,
        externalLinks: stats?.externalLinks || stats?.external_links || 0,
        totalImages: stats?.totalImages || stats?.total_images || 0,
        imagesNoAlt: stats?.imagesNoAlt || stats?.images_no_alt || 0,
        topKeywords: stats?.topKeywords || stats?.top_keywords || []
    };

    // Store for metric strip access
    window._reportStats = safeStats;

    document.getElementById('loadingIndicator')?.classList.add('hidden');
    container.classList.remove('hidden');

    // Render into separate containers
    const heroEl = document.getElementById('reportHero');
    const metricEl = document.getElementById('metricStrip');
    const insightEl = document.getElementById('insightStrip');
    const issueEl = document.getElementById('issueBoard');
    const detailsEl = document.getElementById('detailsSection');

    if (heroEl) heroEl.innerHTML = buildReportHero(safeScore, safeStats, data);
    if (metricEl) metricEl.innerHTML = buildMetricStrip(safeScore, safeStats, data);
    if (insightEl) insightEl.innerHTML = buildInsightStrip(data);
    if (issueEl) issueEl.innerHTML = buildIssueBoard(data);
    if (detailsEl) detailsEl.innerHTML = buildDetailsSection(data);
}

function displayAgentReport(data, url, stats, score) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    if (!data || typeof data !== 'object') {
        container.innerHTML = '<div style="text-align:center;padding:48px 24px;color:var(--text-muted);font-size:13px">报告数据不可用</div>';
        container.classList.remove('hidden');
        return;
    }

    const safeStats = {
        htmlSize: stats?.htmlSize || stats?.html_size || '0 KB',
        totalLinks: stats?.totalLinks || stats?.total_links || 0,
        internalLinks: stats?.internalLinks || stats?.internal_links || 0,
        externalLinks: stats?.externalLinks || stats?.external_links || 0,
        totalImages: stats?.totalImages || stats?.total_images || 0,
        imagesNoAlt: stats?.imagesNoAlt || stats?.images_no_alt || 0
    };

    document.getElementById('loadingIndicator')?.classList.add('hidden');
    container.classList.remove('hidden');

    const heroEl = document.getElementById('reportHero');
    const metricEl = document.getElementById('metricStrip');
    const insightEl = document.getElementById('insightStrip');
    const issueEl = document.getElementById('issueBoard');
    const detailsEl = document.getElementById('detailsSection');

    const summary = data.agent_summary || {};
    const seo = data.seo || {};
    const geo = data.geo || {};
    const overallScore = normalizeReportScore(summary.overall_score ?? score);
    const seoScore = normalizeReportScore(seo.score ?? seo.summary?.ai_score);
    const geoScore = normalizeReportScore(geo.score ?? geo.summary?.geo_score);
    const topActions = Array.isArray(summary.top_actions) ? summary.top_actions : [];

    if (heroEl) {
        heroEl.innerHTML = buildAgentHero(summary, overallScore, seoScore, geoScore, topActions, {
            // 单审计报告（seo 或 geo 缺失）：Hero 只显示存在一侧的胶囊
            hasSeo: !!(data.seo && (data.seo.score > 0 || (data.seo.summary && Object.keys(data.seo.summary).length > 0))),
            hasGeo: !!(data.geo && (data.geo.score > 0 || (data.geo.visibility_factors || []).length > 0 || (data.geo.summary && Object.keys(data.geo.summary).length > 0)))
        });
    }

    if (metricEl) {
        metricEl.innerHTML = buildAgentMetricStrip(safeStats, geo, topActions);
    }

    if (insightEl) {
        insightEl.innerHTML = buildAgentInsightStrip(data);
    }

    if (issueEl) {
        issueEl.innerHTML = buildAgentActions(topActions);
    }

    if (detailsEl) {
        detailsEl.innerHTML = buildAgentDetails(data);
    }
}

function normalizeReportScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, Math.round(number)));
}

const GEO_FACTOR_LABELS = {
    entity_clarity: '实体清晰度',
    answer_extractability: '答案可摘取性',
    trust_signals: '信任信号',
    semantic_structure: '语义结构',
    citation_friendliness: '引用友好度',
    topic_coverage: '主题覆盖度'
};

const GEO_STATUS_LABELS = {
    weak: '薄弱',
    partial: '部分具备',
    strong: '较强',
    missing: '缺失',
    usable: '可用',
    good: '良好',
    poor: '较差',
    needs_work: '待优化'
};

const GEO_SOURCE_LABELS = {
    title: '标题',
    meta: 'Meta 信息',
    heading: '页面标题结构',
    body: '正文内容',
    schema: '结构化数据',
    robots: 'Robots',
    sitemap: 'Sitemap'
};

const GEO_REWRITE_LABELS = {
    definition: '定义说明',
    faq: 'FAQ 问答',
    comparison: '对比内容',
    steps: '步骤说明',
    summary: '摘要内容',
    schema: '结构化数据'
};

function labelFromMap(value, map, fallback = '未分类') {
    if (!value) return fallback;
    const key = String(value).trim();
    return map[key] || key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function formatListValue(value, emptyText = '暂无数据') {
    if (Array.isArray(value)) return value.length ? value.map(item => String(item)).join('、') : emptyText;
    if (value && typeof value === 'object') return Object.entries(value).map(([key, entry]) => `${key}: ${Array.isArray(entry) ? entry.join('、') : entry}`).join('；');
    return value ? String(value) : emptyText;
}

function getStatusToneByText(value, options = {}) {
    const text = String(value || '').toLowerCase();

    // GEO 维度紫色分支：仅在调用方显式开启 geoMode 时生效，且先于通用三档判定。
    // 不开启时行为与旧版完全一致，不影响信号概览、因子行分数等既有语义色。
    if (options.geoMode && /strong|较强/.test(text)) {
        return { kind: 'geo', color: 'var(--geo-strong)', bg: 'var(--geo-soft)', border: 'var(--geo-border)' };
    }

    if (/weak|missing|poor|差|缺失|薄弱|失败|风险|严重/.test(text)) {
        return { kind: 'critical', color: 'var(--critical)', bg: 'var(--critical-soft)', border: 'var(--critical-border)' };
    }
    if (/partial|needs_work|warn|待优化|部分|建议|警告/.test(text)) {
        return { kind: 'high', color: 'var(--high)', bg: 'var(--high-soft)', border: 'var(--high-border)' };
    }
    if (/strong|good|usable|pass|较强|良好|可用|通过|已配置/.test(text)) {
        return { kind: 'success', color: 'var(--success)', bg: 'var(--success-dim)', border: 'rgba(5, 150, 105, 0.16)' };
    }
    return { kind: 'neutral', color: 'var(--text-secondary)', bg: 'var(--surface-soft)', border: 'var(--border-subtle)' };
}

function buildGaugeArc(score) {
    const safeScore = normalizeReportScore(score);
    const circumference = 188.5; // 半圆周长（π × 60，viewBox 0 0 150 84）
    const offset = circumference * (1 - safeScore / 100);
    return `
        <svg viewBox="0 0 150 84" aria-hidden="true">
            <path d="M15 78 A60 60 0 0 1 135 78" fill="none" stroke="var(--gauge-track)" stroke-width="12" stroke-linecap="round"/>
            <path d="M15 78 A60 60 0 0 1 135 78" fill="none" stroke="url(#gauge-gradient)" stroke-width="12" stroke-linecap="round"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
            <defs>
                <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#dc2626"/>
                    <stop offset="50%" stop-color="#f59e0b"/>
                    <stop offset="100%" stop-color="#10b981"/>
                </linearGradient>
            </defs>
        </svg>`;
}

function buildAgentHero(summary, overallScore, seoScore, geoScore, actions = [], flags = {}) {
    const score = normalizeReportScore(overallScore);
    const scoreColor = score < 60 ? 'var(--critical)' : score < 85 ? 'var(--high)' : 'var(--success)';
    const scoreLabel = score < 60 ? '需要优先处理' : score < 85 ? '可继续优化' : '表现良好';
    const executiveSummary = summary.executive_summary || '已完成 SEO 与 GEO 综合分析。';
    const hasSeo = flags.hasSeo !== false;
    const hasGeo = flags.hasGeo !== false;

    return `
    <div class="report-module-heading">
        <div>
            <div class="report-module-kicker">01 · 总览</div>
            <h2>总览结论</h2>
            <p>页面健康度、搜索可见性和 AI 可读性的综合结果。</p>
        </div>
    </div>
    <div class="gauge-hero">
        <div class="gauge-hero-gauge">
            ${buildGaugeArc(score)}
            <div class="gauge-score-overlay">
                <span class="gauge-score">${score}</span>
                <span class="gauge-score-label" style="color:${scoreColor}">${scoreLabel}</span>
            </div>
        </div>
        <div class="gauge-hero-info">
            <div class="gauge-hero-title">综合健康度</div>
            <p class="gauge-hero-summary">${escapeHtml(executiveSummary)}</p>
            <div class="gauge-hero-pills">
                ${hasSeo ? `<span class="hero-pill hero-pill-cyan"><i class="fas fa-search"></i>SEO ${normalizeReportScore(seoScore)}</span>` : ''}
                ${hasGeo ? `<span class="hero-pill hero-pill-geo"><i class="fas fa-brain"></i>GEO ${normalizeReportScore(geoScore)}</span>` : ''}
            </div>
        </div>
    </div>`;
}

function buildAgentMetricStrip(stats, geo, actions) {
    const opportunities = geo.summary?.top_opportunities || [];
    const rewrites = geo.rewrite_suggestions || [];
    const actionsCount = actions.length;
    const sizeParts = String(stats.htmlSize || '0 KB').match(/^([\d.]+)\s*(.*)$/);
    const sizeNumber = sizeParts ? sizeParts[1] : String(stats.htmlSize || '0');
    const sizeUnit = sizeParts ? sizeParts[2] : '';

    return `
        <div class="metric-tile metric-tile-cyan">
            <div class="metric-tile-icon"><i class="fas fa-file-code"></i></div>
            <div class="metric-tile-info">
                <div class="metric-tile-value">${sizeNumber}${sizeUnit ? `<span class="metric-tile-unit">${escapeHtml(sizeUnit)}</span>` : ''}</div>
                <div class="metric-tile-label">页面体积</div>
            </div>
        </div>
        <div class="metric-tile metric-tile-geo">
            <div class="metric-tile-icon"><i class="fas fa-brain"></i></div>
            <div class="metric-tile-info">
                <div class="metric-tile-value">${opportunities.length}</div>
                <div class="metric-tile-label">GEO 机会</div>
            </div>
        </div>
        <div class="metric-tile metric-tile-green">
            <div class="metric-tile-icon"><i class="fas fa-pen-nib"></i></div>
            <div class="metric-tile-info">
                <div class="metric-tile-value">${rewrites.length}</div>
                <div class="metric-tile-label">改写建议</div>
            </div>
        </div>
        <div class="metric-tile ${actionsCount > 0 ? 'metric-tile-amber' : 'metric-tile-neutral'}">
            <div class="metric-tile-icon"><i class="fas fa-list-check"></i></div>
            <div class="metric-tile-info">
                <div class="metric-tile-value">${actionsCount}</div>
                <div class="metric-tile-label">行动项</div>
            </div>
        </div>
    `;
}

function buildAgentInsightStrip(data) {
    const geo = data.geo || {};
    const insights = [];

    const pushInsight = (icon, text, kind) => {
        if (text) insights.push({ icon, text, kind });
    };

    // GEO 维度因子：geoMode 下「较强/strong」走 GEO 紫，其余沿用通用三档语义
    (geo.visibility_factors || []).slice(0, 4).forEach((factor) => {
        const factorLabel = labelFromMap(factor.factor, GEO_FACTOR_LABELS, 'GEO 因子');
        const statusLabel = labelFromMap(factor.status, GEO_STATUS_LABELS, '');
        const label = [factorLabel, statusLabel].filter(Boolean).join(' · ');
        if (label) pushInsight('fa-brain', label, getStatusToneByText(label, { geoMode: true }).kind);
    });

    // 实体清晰度：优先取显式状态；无状态字段时从实体数据推导展示文案（仅展示层推导）
    let entityStatus = geo.entity_analysis?.status || geo.entity_analysis?.clarity;
    if (!entityStatus && geo.entity_analysis?.primary_entity) entityStatus = '主体明确';
    if (entityStatus) {
        const tone = getStatusToneByText(entityStatus);
        pushInsight('fa-fingerprint', `实体清晰度 · ${entityStatus}`, tone.kind === 'neutral' ? 'cyan' : tone.kind);
    }

    // 信任信号：优先取显式状态；无状态字段时按 present/missing 推导
    let trustStatus = geo.trust_signals?.status || geo.trust_signals?.summary;
    if (!trustStatus && geo.trust_signals && Array.isArray(geo.trust_signals.missing)) {
        trustStatus = geo.trust_signals.missing.length > 0 ? '缺失' : '良好';
    }
    if (trustStatus) {
        const tone = getStatusToneByText(trustStatus);
        pushInsight(tone.kind === 'critical' ? 'fa-triangle-exclamation' : 'fa-shield-halved', `信任信号 · ${trustStatus}`, tone.kind);
    }

    const rs = data.robots_sitemap;
    if (rs) {
        if (rs.robots && !rs.robots.exists) pushInsight('fa-robot', '缺少 robots.txt', 'high');
        if (rs.sitemap && !rs.sitemap.exists) pushInsight('fa-sitemap', '缺少 sitemap.xml', 'high');
    }

    if (insights.length === 0) {
        pushInsight('fa-check-circle', '已生成综合报告', 'success');
    }

    return insights.slice(0, 6).map((insight) => `
        <span class="tone-pill tone-pill-${insight.kind}">
            <i class="fas ${insight.icon}"></i>
            ${escapeHtml(insight.text)}
        </span>
    `).join('');
}

/* ==================== REPORT HERO ==================== */
function buildReportHero(score, stats, data) {
    const s = data?.summary || {};
    const p0 = s.p0_count || 0;
    const p1 = s.p1_count || 0;
    const p2 = s.p2_count || 0;
    const p3 = s.p3_count || 0;
    const issueCount = p0 + p1;

    let scoreColor = 'var(--success)';
    let scoreLabel = '良好';
    let statusText = '当前页面整体表现良好';
    if (score < 60) {
        scoreColor = 'var(--critical)';
        scoreLabel = '差';
        statusText = '搜索引擎可能无法稳定抓取核心内容';
    } else if (score < 85) {
        scoreColor = 'var(--high)';
        scoreLabel = '待优化';
        statusText = '存在影响搜索排名的关键问题需要修复';
    }

    const circum = 2 * Math.PI * 46;
    const offset = circum * (1 - score / 100);

    // Top findings from P0/P1 issues — use title only, keep short
    const findings = [];
    const truncate = (t, max) => {
        if (!t || t.length <= max) return t;
        const cut = t.lastIndexOf('，', max) || t.lastIndexOf('。', max) || t.lastIndexOf('、', max) || max;
        return t.substring(0, cut > 10 ? cut : max) + '…';
    };
    (s.p0_issues || []).slice(0, 2).forEach(i => {
        const raw = typeof i === 'string' ? i : (i.title || i.description || '');
        if (raw) findings.push({ severity: 'critical', text: truncate(raw, 45) });
    });
    (s.p1_issues || []).slice(0, 1).forEach(i => {
        const raw = typeof i === 'string' ? i : (i.title || i.description || '');
        if (raw) findings.push({ severity: 'high', text: truncate(raw, 45) });
    });

    const keywords = stats.topKeywords || [];

    return `
    <div class="report-hero-grid">
        <!-- Score Panel -->
        <div class="score-panel">
            <div class="score-ring-wrap">
                <svg width="110" height="110" viewBox="0 0 110 110">
                    <circle cx="55" cy="55" r="46" stroke="var(--border-subtle)" stroke-width="4" fill="none"/>
                    <circle cx="55" cy="55" r="46" stroke="${scoreColor}" stroke-width="4" fill="none"
                        stroke-dasharray="${circum}" stroke-dashoffset="${offset}"
                        stroke-linecap="round" transform="rotate(-90 55 55)"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
                    <span class="score-number" style="color:${scoreColor}">${score}</span>
                    <span style="font-size:9px;color:var(--text-faint);margin-top:2px;font-weight:400;opacity:0.5">/ 100</span>
                </div>
            </div>
            <div class="score-status" style="color:${scoreColor}">${scoreLabel}</div>
            <div class="score-summary">${statusText}</div>
        </div>

        <!-- Top Findings -->
        <div class="hero-findings">
            <div style="font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">关键发现</div>
            ${findings.length > 0 ? findings.map(f => `
                <div class="finding-item">
                    <span class="finding-dot status-dot-${f.severity}"></span>
                    <span class="finding-text">${escapeHtml(f.text)}</span>
                </div>
            `).join('') : '<div class="finding-item"><span class="finding-dot status-dot-success"></span><span class="finding-text">未发现关键问题</span></div>'}
            ${findings.length > 1 ? `<div class="finding-more">还有 ${findings.length - 1} 条发现，见下方问题诊断</div>` : ''}
        </div>

        <!-- Issue Distribution -->
        <div class="issue-dist">
            <div style="font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">问题分布</div>
            <div class="issue-dist-row">
                <span class="issue-dist-label"><span class="status-dot status-dot-critical"></span> 严重</span>
                <span class="issue-dist-count" style="color:var(--critical)">${p0}</span>
            </div>
            <div class="issue-dist-row">
                <span class="issue-dist-label"><span class="status-dot status-dot-high"></span> 高优</span>
                <span class="issue-dist-count" style="color:var(--high)">${p1}</span>
            </div>
            <div class="issue-dist-row">
                <span class="issue-dist-label"><span class="status-dot status-dot-medium"></span> 建议</span>
                <span class="issue-dist-count" style="color:var(--medium)">${p2}</span>
            </div>
            <div class="issue-dist-row">
                <span class="issue-dist-label"><span class="status-dot status-dot-low"></span> 提示</span>
                <span class="issue-dist-count" style="color:var(--low)">${p3}</span>
            </div>
        </div>
    </div>
    ${keywords.length > 0 ? `
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.04em;flex-shrink:0">Top Keywords</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${keywords.slice(0, 6).map(([word, count]) => `
                <span style="padding:3px 10px;border-radius:8px;font-size:12px;font-family:'JetBrains Mono',monospace;background:var(--surface-soft);border:1px solid var(--border-subtle);color:var(--text-secondary)">
                    ${escapeHtml(word)}<span style="color:var(--text-faint);margin-left:3px">${count}</span>
                </span>
            `).join('')}
        </div>
    </div>` : ''}
    `;
}

/* ==================== METRIC STRIP ==================== */
function buildMetricStrip(score, stats, data) {
    const s = data?.summary || {};
    const issueCount = (s.p0_count || 0) + (s.p1_count || 0);
    const noAlt = stats.imagesNoAlt || 0;

    return `
        <div class="metric-card">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <i class="fas fa-file-code" style="font-size:10px;color:var(--text-faint)"></i>
                <span class="metric-card-label" style="margin:0">页面体积</span>
            </div>
            <div class="metric-card-value">${stats.htmlSize}</div>
        </div>
        <div class="metric-card">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <i class="fas fa-link" style="font-size:10px;color:var(--text-faint)"></i>
                <span class="metric-card-label" style="margin:0">链接</span>
            </div>
            <div class="metric-card-value">${stats.totalLinks}</div>
            <div style="font-size:11px;color:var(--text-faint);margin-top:2px">内 ${stats.internalLinks} / 外 ${stats.externalLinks}</div>
        </div>
        <div class="metric-card">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <i class="fas fa-image" style="font-size:10px;color:var(--text-faint)"></i>
                <span class="metric-card-label" style="margin:0">图片</span>
            </div>
            <div class="metric-card-value">${stats.totalImages}</div>
            ${noAlt > 0 ? `<div style="font-size:11px;color:var(--high);margin-top:2px">${noAlt} 张缺少 alt</div>` : ''}
        </div>
        <div class="metric-card ${issueCount > 0 ? 'metric-card-accent' : ''}">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <i class="fas fa-flag" style="font-size:10px;color:${issueCount > 0 ? 'var(--high)' : 'var(--text-faint)'}"></i>
                <span class="metric-card-label" style="margin:0">优先处理</span>
            </div>
            <div class="metric-card-value">${issueCount}</div>
        </div>
    `;
}

/* ==================== INSIGHT STRIP ==================== */
function buildInsightStrip(data) {
    const meta = data?.meta_section || {};
    const summary = data?.summary || {};
    const rs = data?.robots_sitemap;
    const p0 = summary.p0_count || 0;
    const p1 = summary.p1_count || 0;
    const insights = [];

    if (p0 > 0) insights.push({ icon: 'fa-shield-halved', text: '渲染风险' });

    const allText = (summary.p0_issues || [])
        .map(i => (typeof i === 'string' ? i : (i?.title || '') + ' ' + (i?.description || '')).toLowerCase()).join(' ');

    if (/h1|标题|heading/.test(allText)) insights.push({ icon: 'fa-heading', text: 'H1 信号缺失' });
    if (/hreflang|多语言|international|国际化/.test(allText)) insights.push({ icon: 'fa-globe', text: '国际化不完整' });
    if (/meta.*description|描述/.test(allText)) insights.push({ icon: 'fa-tag', text: 'Meta 描述待优化' });
    if (/alt|图片/.test(allText)) insights.push({ icon: 'fa-image', text: '图片可访问性不足' });
    if (/canonical/.test(allText)) insights.push({ icon: 'fa-link', text: 'Canonical 问题' });
    if (/viewport|移动端|mobile/.test(allText)) insights.push({ icon: 'fa-mobile-alt', text: '移动端适配问题' });

    // Robots/Sitemap
    if (rs) {
        if (!rs.robots?.exists) insights.push({ icon: 'fa-robot', text: '缺少 robots.txt' });
        if (!rs.sitemap?.exists) insights.push({ icon: 'fa-sitemap', text: '缺少 sitemap.xml' });
    }

    if (insights.length === 0 && (p0 + p1) === 0) {
        insights.push({ icon: 'fa-check-circle', text: '核心信号正常' });
    }

    if (insights.length === 0) return '';

    return insights.slice(0, 6).map(i => `
        <span class="insight-pill">
            <i class="fas ${i.icon}"></i>
            ${escapeHtml(i.text)}
        </span>
    `).join('');
}

/* ==================== ISSUE TRIAGE BOARD ==================== */
function generateRecommendation(title) {
    const t = (title || '').toLowerCase();
    if (/csr|spa|javascript|渲染|render/.test(t)) return '建议将核心内容服务端预渲染，或为爬虫提供静态 HTML 快照';
    if (/h1|标题|heading/.test(t)) return '确保页面有且仅有一个 H1 标签，包含核心关键词';
    if (/meta.*description|描述/.test(t)) return '编写 120-160 字符的 Meta Description，包含目标关键词和行动号召';
    if (/title|标题标签/.test(t)) return '优化 Title 标签，控制在 50-60 字符，前置核心关键词';
    if (/alt|图片/.test(t)) return '为所有信息性图片添加描述性 alt 属性';
    if (/canonical/.test(t)) return '检查并修正 Canonical 标签，确保指向正确的权威 URL';
    if (/hreflang|国际化|多语言/.test(t)) return '补充完整的 hreflang 标签配置';
    if (/viewport|移动端|mobile/.test(t)) return '添加 viewport meta 标签并确保移动端响应式布局';
    if (/robots|noindex|索引/.test(t)) return '检查 robots meta 标签，确保未误设 noindex';
    if (/链接|link|a\s*href/.test(t)) return '检查死链并确保关键页面可通过 HTML 链接抓取';
    if (/结构化|schema|json-ld|rich/.test(t)) return '添加 JSON-LD 结构化数据标记';
    if (/速度|performance|core.?web/.test(t)) return '优化页面加载速度，关注 Core Web Vitals 指标';
    return '建议根据具体场景评估修复方案';
}

function buildIssueBoard(data) {
    const summary = data?.summary || {};

    const extractIssue = (issue) => {
        if (typeof issue === 'string') return { title: issue, description: '', recommendation: generateRecommendation(issue) };
        if (typeof issue === 'object' && issue !== null) {
            const title = issue.title || issue.name || issue.text || '';
            return {
                title,
                description: issue.description || issue.desc || '',
                recommendation: issue.recommendation || issue.recommend || generateRecommendation(title)
            };
        }
        return { title: String(issue), description: '', recommendation: '' };
    };

    const issues = {
        P0: (summary.p0_issues || []).map(extractIssue),
        P1: (summary.p1_issues || []).map(extractIssue),
        P2: (summary.p2_issues || []).map(extractIssue),
        P3: (summary.p3_issues || []).map(extractIssue)
    };

    const total = issues.P0.length + issues.P1.length + issues.P2.length + issues.P3.length;

    if (total === 0) {
        return `
        <div style="text-align:center;padding:48px 24px">
            <div style="width:48px;height:48px;border-radius:50%;background:var(--success-dim);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
                <svg width="24" height="24" fill="none" stroke="var(--success)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:4px">未发现严重问题</div>
            <div style="font-size:13px;color:var(--text-muted)">页面 SEO 状态良好，可继续针对细节项做增强</div>
        </div>`;
    }

    const config = {
        P0: { key: 'critical', label: '严重', note: '优先处理', cssClass: 'severity-badge-critical', cardClass: 'issue-card-critical' },
        P1: { key: 'high', label: '高优', note: '尽快优化', cssClass: 'severity-badge-high', cardClass: 'issue-card-high' },
        P2: { key: 'medium', label: '建议', note: '可继续完善', cssClass: 'severity-badge-medium', cardClass: 'issue-card-medium' },
        P3: { key: 'low', label: '提示', note: '辅助参考', cssClass: 'severity-badge-low', cardClass: 'issue-card-low' }
    };

    const impactMap = {
        P0: '高影响',
        P1: '中高影响',
        P2: '中等影响',
        P3: '低影响'
    };

    const effortMap = {
        P0: '需立即处理',
        P1: '建议尽快',
        P2: '可安排优化',
        P3: '参考即可'
    };

    return `
    <div class="issue-board-header">
        <div class="issue-board-title">问题诊断</div>
        <div class="issue-board-count"><strong>${total}</strong> 项待关注</div>
    </div>

    ${['P0', 'P1', 'P2', 'P3'].map(priority => {
        const list = issues[priority];
        if (list.length === 0) return '';
        const c = config[priority];

        return `
        <div class="issue-section">
            <div class="issue-section-header">
                <div class="issue-section-header-left">
                    <span class="severity-badge ${c.cssClass}">${priority}</span>
                    <span class="issue-section-label">${c.label}</span>
                </div>
                <span class="issue-section-count" style="color:var(--${c.key})">${list.length}</span>
            </div>
            <div class="issue-card-list">
                ${list.map((issue, idx) => `
                    <div class="issue-card ${c.cardClass}">
                        <div class="issue-card-top">
                            <span class="issue-card-severity ${c.cssClass}">${priority}</span>
                            <span style="font-size:11px;color:var(--text-faint)">${impactMap[priority]}</span>
                        </div>
                        <div class="issue-card-title">${escapeHtml(issue.title)}</div>
                        ${issue.description ? `<div class="issue-card-desc">${escapeHtml(issue.description)}</div>` : ''}
                        ${issue.recommendation ? `<div class="issue-card-rec"><i class="fas fa-arrow-right" style="font-size:9px;opacity:0.5;margin-right:5px"></i>${escapeHtml(issue.recommendation)}</div>` : ''}
                        <div class="issue-card-actions">
                            <span style="font-size:11px;color:var(--text-faint);display:inline-flex;align-items:center;gap:4px">
                                <i class="fas fa-wrench" style="font-size:9px;opacity:0.4"></i>
                                ${effortMap[priority]}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        `;
    }).join('')}
    `;
}

function buildDetailsSection(data) {
    const meta = data?.meta_section || {};
    const content = data?.content_section || [];
    const tech = data?.tech_section || {};

    const sections = [];

    const getStatusTone = (value) => {
        const text = String(value || '').toLowerCase();

        if (/p0|严重|错误|失败|缺失|未设置|异常|风险|不通过|error|fail|missing|invalid/.test(text)) {
            return {
                text: 'var(--critical)',
                border: 'var(--critical-border)',
                bg: 'var(--critical-soft)'
            };
        }

        if (/p1|较差|警告|待优化|可优化|需优化|弱|warning|warn|needs?|todo/.test(text)) {
            return {
                text: 'var(--high)',
                border: 'var(--high-border)',
                bg: 'var(--high-soft)'
            };
        }

        if (/p2|建议|一般|可改进|提示|notice|info|suggest/.test(text)) {
            return {
                text: 'var(--medium)',
                border: 'var(--medium-border)',
                bg: 'var(--medium-soft)'
            };
        }

        if (/通过|正常|良好|已设置|已启用|优秀|ok|pass|good|success|enabled|valid/.test(text)) {
            return {
                text: 'var(--success)',
                border: 'rgba(5, 150, 105, 0.15)',
                bg: 'var(--success-dim)'
            };
        }

        return {
            text: 'var(--text-secondary)',
            border: 'var(--border-subtle)',
            bg: 'var(--surface-soft)'
        };
    };

    if (meta.critical_issues?.length > 0) {
        sections.push(`
            <div class="detail-card">
                <div class="detail-card-header">
                    <div class="detail-card-header-bar" style="background:var(--critical)"></div>
                    <div class="detail-card-title">严重问题</div>
                </div>
                <div class="detail-card-body">
                    <div style="display:flex;flex-direction:column;gap:10px">
                        ${meta.critical_issues.map(issue => `
                            <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--critical-soft);border:1px solid var(--critical-border)">
                                <div style="width:6px;height:6px;border-radius:50%;background:var(--critical);margin-top:7px;flex-shrink:0"></div>
                                <div>
                                    <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escapeHtml(issue.title || '')}</div>
                                    ${issue.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.55">${escapeHtml(issue.description)}</div>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `);
    }

    if (meta.suggestions?.length > 0) {
        sections.push(`
            <div class="detail-card">
                <div class="detail-card-header">
                    <div class="detail-card-header-bar" style="background:var(--brand)"></div>
                    <div class="detail-card-title">优化建议</div>
                </div>
                <div class="detail-card-body">
                    <div style="display:flex;flex-direction:column;gap:10px">
                        ${meta.suggestions.map(s => `
                            <div style="display:flex;align-items:flex-start;gap:10px">
                                <div style="width:6px;height:6px;border-radius:50%;background:var(--brand);margin-top:7px;flex-shrink:0"></div>
                                <div style="font-size:13px;line-height:1.55;color:var(--text-secondary)">
                                    <strong style="color:var(--text-primary)">${escapeHtml(s.title || '')}</strong>
                                    ${s.description ? `<span style="color:var(--text-muted)"> — ${escapeHtml(s.description)}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `);
    }

    const opt = meta.optimization_guide || {};
    if (opt.title_advice || opt.description_advice) {
        const renderCompare = (label, before, after) => `
            <div>
                <div style="font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">${label}</div>
                <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:stretch">
                    <div style="padding:14px 16px;border-radius:var(--radius-sm);border:1px solid var(--border-default);background:var(--surface-soft)">
                        <div style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:var(--text-faint);margin-bottom:8px;padding:2px 6px;border-radius:4px;background:rgba(148,163,184,0.1)">
                            <i class="fas fa-xmark" style="font-size:8px;opacity:0.5"></i> 当前
                        </div>
                        <div style="font-size:13px;color:var(--text-secondary);line-height:1.65">${escapeHtml(before || '-')}</div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:center;color:var(--text-faint)">
                        <i class="fas fa-arrow-right" style="font-size:12px"></i>
                    </div>
                    <div style="padding:14px 16px;border-radius:var(--radius-sm);border:1px solid rgba(5,150,105,0.18);background:var(--success-dim)">
                        <div style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:var(--success);margin-bottom:8px;padding:2px 6px;border-radius:4px;background:rgba(5,150,105,0.08)">
                            <i class="fas fa-check" style="font-size:8px"></i> 建议
                        </div>
                        <div style="font-size:13px;color:var(--text-primary);line-height:1.65;font-weight:500">${escapeHtml(after || '-')}</div>
                    </div>
                </div>
            </div>
        `;
        sections.push(`
            <div class="detail-card">
                <div class="detail-card-header">
                    <div class="detail-card-header-bar" style="background:var(--accent-secondary)"></div>
                    <div class="detail-card-title">改写建议</div>
                </div>
                <div class="detail-card-body">
                    <div style="display:flex;flex-direction:column;gap:20px">
                        ${opt.title_advice ? renderCompare('Title', opt.title_advice.before, opt.title_advice.after) : ''}
                        ${opt.description_advice ? renderCompare('Description', opt.description_advice.before, opt.description_advice.after) : ''}
                    </div>
                </div>
            </div>
        `);
    }

    if (content.length > 0) {
        sections.push(`
            <div class="detail-card">
                <div class="detail-card-header">
                    <div class="detail-card-header-bar" style="background:var(--success)"></div>
                    <div class="detail-card-title">内容结构</div>
                </div>
                <div class="detail-card-body">
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
                        ${content.slice(0, 6).map(item => `
                            <div style="padding:12px 14px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);background:var(--surface-soft)">
                                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${escapeHtml(item.title || '')}</div>
                                ${item.description ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.55">${escapeHtml(item.description)}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `);
    }

    const techTable = tech.table || [];
    if (techTable.length > 0) {
        sections.push(`
            <div class="detail-card">
                <div class="detail-card-header">
                    <div class="detail-card-header-bar" style="background:var(--text-muted)"></div>
                    <div class="detail-card-title">技术检查</div>
                </div>
                <div style="overflow-x:auto">
                    <table class="tech-check-table">
                        <thead>
                            <tr>
                                <th>检查项</th>
                                <th>状态</th>
                                <th>说明</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${techTable.slice(0, 10).map(row => {
                                const tone = getStatusTone(row.status);
                                return `
                                <tr>
                                    <td style="white-space:nowrap;font-weight:500">${escapeHtml(row.item || '')}</td>
                                    <td>
                                        <span class="status-pill" style="color:${tone.text};border:1px solid ${tone.border};background:${tone.bg}">${escapeHtml(row.status || '')}</span>
                                    </td>
                                    <td style="font-size:12px;color:var(--text-muted);line-height:1.5">${escapeHtml(row.desc || '')}</td>
                                </tr>
                            `;}).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    }

    // Robots & Sitemap
    const rs = data?.robots_sitemap;
    if (rs) {
        const rsRows = [];
        if (rs.robots) {
            rsRows.push({ item: 'robots.txt', status: rs.robots.exists ? '已配置' : '缺失', desc: rs.robots.exists ? `包含 ${rs.robots.disallowRules?.length || 0} 条 Disallow 规则` : '建议创建 robots.txt 文件' });
            if (rs.robots.sitemapUrl) {
                rsRows.push({ item: 'Sitemap 声明', status: '已配置', desc: rs.robots.sitemapUrl });
            }
        }
        if (rs.sitemap) {
            rsRows.push({ item: 'sitemap.xml', status: rs.sitemap.exists ? '已配置' : '缺失', desc: rs.sitemap.exists ? `包含 ${rs.sitemap.urlCount} 个 URL` : '建议创建 sitemap.xml 文件' });
        }
        if (rsRows.length > 0) {
            sections.push(`
                <div class="detail-card">
                    <div class="detail-card-header">
                        <div class="detail-card-header-bar" style="background:var(--brand)"></div>
                        <div class="detail-card-title">可抓取性</div>
                    </div>
                    <div style="overflow-x:auto">
                        <table class="tech-check-table">
                            <thead><tr><th>检查项</th><th>状态</th><th>说明</th></tr></thead>
                            <tbody>
                                ${rsRows.map(row => {
                                    const tone = getStatusTone(row.status);
                                    return `<tr>
                                        <td style="white-space:nowrap;font-weight:500">${escapeHtml(row.item)}</td>
                                        <td><span class="status-pill" style="color:${tone.text};border:1px solid ${tone.border};background:${tone.bg}">${escapeHtml(row.status)}</span></td>
                                        <td style="font-size:12px;color:var(--text-muted);line-height:1.5">${escapeHtml(row.desc)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `);
        }
    }

    if (sections.length === 0) return '';

    return `
    <div class="details-section-header">详细诊断</div>
    ${sections.join('')}
    `;
}

function buildAgentActions(actions) {
    if (!actions.length) {
        return `
        <div class="report-module-heading">
            <div>
                <div class="report-module-kicker">04 · 修复</div>
                <h2>优先修复</h2>
                <p>建议优先处理的关键问题和改进事项。</p>
            </div>
            <div class="action-count"><strong>0</strong> 项待关注</div>
        </div>
        <div class="action-empty">
            <i class="fas fa-check-circle"></i>
            <div class="action-empty-title">暂无高优先级行动项</div>
            <div class="action-empty-copy">当前没有需要立即处理的 SEO 或 GEO 行动项</div>
        </div>`;
    }

    const priorityTone = {
        P0: { card: 'action-card-p0', badge: 'action-badge-p0', fallbackImpact: '高影响' },
        P1: { card: 'action-card-p1', badge: 'action-badge-p1', fallbackImpact: '中高影响' },
        P2: { card: 'action-card-p2', badge: 'action-badge-p2', fallbackImpact: '中等影响' },
        P3: { card: 'action-card-p3', badge: 'action-badge-p3', fallbackImpact: '低影响' }
    };
    const impactLabels = { high: '高影响', medium: '中影响', low: '低影响' };
    const sourceMeta = {
        seo: { icon: 'fa-search', label: 'SEO' },
        geo: { icon: 'fa-brain', label: 'GEO' },
        combined: { icon: 'fa-robot', label: '综合' }
    };

    return `
    <div class="report-module-heading">
        <div>
            <div class="report-module-kicker">04 · 修复</div>
            <h2>优先修复</h2>
            <p>按影响程度排序，建议从上到下处理。</p>
        </div>
        <div class="action-count"><strong>${actions.length}</strong> 项待关注</div>
    </div>
    <div class="action-card-list">
        ${actions.map((action) => {
            const priority = action.priority || 'P1';
            const tone = priorityTone[priority] || priorityTone.P1;
            const src = sourceMeta[action.source] || sourceMeta.combined;
            const impact = impactLabels[action.impact] || action.impact || tone.fallbackImpact;

            return `
            <div class="action-card ${tone.card}">
                <div class="action-card-top">
                    <span class="action-badge ${tone.badge}">${escapeHtml(priority)}</span>
                    <span class="action-card-meta"><i class="fas ${src.icon}"></i>${escapeHtml(src.label)} · ${escapeHtml(impact)}</span>
                </div>
                <div class="action-card-title">${escapeHtml(action.title || '未命名行动项')}</div>
                ${action.reason ? `<div class="action-card-reason">${escapeHtml(action.reason)}</div>` : ''}
                ${action.recommendation ? `<div class="action-card-rec"><i class="fas fa-arrow-right"></i>${escapeHtml(action.recommendation)}</div>` : ''}
            </div>`;
        }).join('')}
    </div>`;
}

function buildDetailHead(iconToneClass, icon, title, subtitle) {
    return `
        <div class="detail-head">
            <div class="detail-head-icon ${iconToneClass}"><i class="fas ${icon}"></i></div>
            <div class="detail-head-text">
                <div class="detail-head-title">${escapeHtml(title)}</div>
                ${subtitle ? `<div class="detail-head-subtitle">${escapeHtml(subtitle)}</div>` : ''}
            </div>
        </div>`;
}

function buildAgentDetails(data) {
    const seo = data.seo || {};
    const geo = data.geo || {};
    const factors = geo.visibility_factors || [];
    const answerBlocks = geo.answer_blocks || [];
    const rewrites = geo.rewrite_suggestions || [];
    const evidence = data.evidence || [];
    const sections = [];

    sections.push(buildSignalOverview(data));

    sections.push(`
        <div class="detail-head-card">
            ${buildDetailHead('detail-head-icon-cyan', 'fa-brain', 'GEO 可见性', '页面是否容易被 AI 搜索理解、摘取和引用')}
            <div class="detail-head-body">
                ${buildGeoFactorRows(factors)}
                <div class="agent-two-column detail-head-extra">
                    ${buildAgentObjectSummary('实体识别', geo.entity_analysis)}
                    ${buildAgentObjectSummary('信任信号', geo.trust_signals)}
                </div>
            </div>
        </div>
    `);

    sections.push(`
        <div class="detail-head-card">
            ${buildDetailHead('detail-head-icon-geo', 'fa-comment-dots', '可摘取答案', '适合出现在 AI 回答中的问答与定义内容')}
            <div class="detail-head-body">
                ${buildAnswerBlockRows(answerBlocks)}
            </div>
        </div>
    `);

    sections.push(`
        <div class="detail-head-card">
            ${buildDetailHead('detail-head-icon-green', 'fa-pen-nib', '内容改写建议', '可用于更新页面内容或结构的建议')}
            <div class="detail-head-body">
                ${buildRewriteSuggestions(rewrites)}
            </div>
        </div>
    `);

    sections.push(`
        <div class="detail-head-card">
            ${buildDetailHead('detail-head-icon-red', 'fa-triangle-exclamation', 'SEO 问题明细', '按 P0/P1/P2/P3 展开的传统搜索问题')}
            <div class="detail-head-body">
                ${buildIssueBoard({ summary: seo.summary || {} })}
            </div>
        </div>
    `);

    const robotsSitemap = buildAgentRobotsSitemap(data.robots_sitemap);
    if (robotsSitemap) sections.push(robotsSitemap);

    if (evidence.length > 0) {
        sections.push(`
            <div class="detail-head-card">
                ${buildDetailHead('detail-head-icon-neutral', 'fa-file-lines', '判断依据', '支撑本次判断的页面证据，默认展示前 10 条')}
                <div class="detail-head-body">
                    ${buildEvidenceList(evidence)}
                </div>
            </div>
        `);
    }

    return `
        <div class="report-module-heading">
            <div>
                <div class="report-module-kicker">05 · 详情</div>
                <h2>报告详情</h2>
                <p>查看基础信号、GEO 可见性、可摘取答案、内容建议和页面证据。</p>
            </div>
        </div>
        ${sections.join('')}
    `;
}

function buildGeoFactorRows(factors) {
    if (!factors.length) {
        return '<p class="detail-head-empty">暂无 GEO 维度数据</p>';
    }

    return factors.map((factor) => {
        const tone = getStatusToneByText(factor.status || '');
        const score = normalizeReportScore(factor.score);
        const statusLabel = labelFromMap(factor.status, GEO_STATUS_LABELS, '');

        return `
        <div class="factor-row">
            <div class="factor-row-main">
                <strong>${escapeHtml(labelFromMap(factor.factor || factor.name, GEO_FACTOR_LABELS, 'GEO 因子'))}</strong>
                <p>${escapeHtml(factor.finding || factor.description || '')}</p>
                ${factor.recommendation ? `<small>${escapeHtml(factor.recommendation)}</small>` : ''}
            </div>
            <div class="factor-row-score">
                <span style="color:${tone.color}">${score}</span>
                ${statusLabel ? `<em>${escapeHtml(statusLabel)}</em>` : ''}
            </div>
        </div>`;
    }).join('');
}

function buildAnswerBlockRows(answerBlocks) {
    if (!answerBlocks.length) {
        return '<p class="detail-head-empty">暂无答案块机会</p>';
    }

    return answerBlocks.map((block) => `
        <div class="answer-block">
            <div class="answer-question"><i class="fas fa-circle-question"></i>${escapeHtml(block.title || block.question || block.type || '可摘取内容')}</div>
            ${block.current_answer ? `<div class="answer-current"><span>当前</span>${escapeHtml(block.current_answer)}</div>` : ''}
            ${block.improved_answer ? `<div class="answer-improved"><span>建议</span>${escapeHtml(block.improved_answer)}</div>` : ''}
            ${!block.current_answer && !block.improved_answer ? `<div class="answer-current">${escapeHtml(block.finding || block.recommendation || block.content || '')}</div>` : ''}
            ${block.quality ? `<div class="answer-meta">质量：${escapeHtml(labelFromMap(block.quality, GEO_STATUS_LABELS, block.quality))}</div>` : ''}
        </div>
    `).join('');
}

function buildAgentObjectSummary(label, value) {
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) {
        return `
            <div style="padding:12px 0;border-bottom:1px solid var(--border-subtle)">
                <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${escapeHtml(label)}</div>
                <div style="font-size:12px;color:var(--text-muted)">暂无数据</div>
            </div>`;
    }

    const keyLabels = {
        primary_entity: '主体实体',
        entity_type: '实体类型',
        confidence: '置信度',
        ambiguities: '模糊点',
        missing_attributes: '缺失属性',
        present: '已具备',
        missing: '缺失项',
        recommendations: '建议'
    };

    const rows = Object.entries(value).slice(0, 8).map(([key, entry]) => {
        const text = Array.isArray(entry) ? entry.join('、') : typeof entry === 'object' ? JSON.stringify(entry) : entry;
        return `
            <div class="agent-object-row">
                <div>${escapeHtml(keyLabels[key] || key)}</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.55">${escapeHtml(String(text || ''))}</div>
            </div>`;
    }).join('');

    return `
        <div class="agent-object-card">
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px">${escapeHtml(label)}</div>
            ${rows}
        </div>`;
}

function buildRewriteSuggestions(rewrites) {
    if (!rewrites.length) {
        return '<p class="text-[var(--text-muted)]">暂无改写建议</p>';
    }

    return rewrites.map((item) => {
        const after = String(item.after || item.suggestion || item.content || '');
        const copyText = escapeHtml(JSON.stringify(after));

        return `
        <div class="code-diff-block">
            <div class="code-diff-header">
                <span>${escapeHtml(item.title || labelFromMap(item.type, GEO_REWRITE_LABELS, '建议'))}</span>
                ${after ? `<button class="copy-btn" onclick="copyToClipboard(${copyText}, this)">复制</button>` : ''}
            </div>
            ${item.before ? `<div style="font-size:11px;color:var(--text-faint);margin-bottom:6px">当前</div><pre><code>${escapeHtml(item.before)}</code></pre>` : ''}
            ${after ? `<div style="font-size:11px;color:var(--text-faint);margin:10px 0 6px">建议</div><pre><code>${escapeHtml(after)}</code></pre>` : ''}
            ${item.rationale ? `<p class="rewrite-rationale">${escapeHtml(item.rationale)}</p>` : ''}
        </div>`;
    }).join('');
}

function buildEvidenceList(evidence) {
    return evidence.slice(0, 10).map((item) => {
        const text = typeof item === 'string' ? item : (item.snippet || item.text || item.excerpt || item.evidence || item.finding || '');
        const source = typeof item === 'object' ? (item.source || item.type || item.section || '') : '';
        const note = typeof item === 'object' ? (item.note || item.reason || '') : '';

        return `
            <div class="agent-evidence-item">
                ${source ? `<div class="agent-evidence-source">${escapeHtml(labelFromMap(source, GEO_SOURCE_LABELS, source))}</div>` : ''}
                <div class="agent-evidence-text">${escapeHtml(text)}</div>
                ${note ? `<div class="agent-mini-meta">${escapeHtml(note)}</div>` : ''}
            </div>`;
    }).join('');
}

function buildSignalOverview(data) {
    const seoSummary = data.seo?.summary || {};
    const meta = data.seo?.meta_section || {};
    const rs = data.robots_sitemap || {};
    const geo = data.geo || {};
    const signals = [];

    const titleAdvice = meta.optimization_guide?.title_advice;
    const descriptionAdvice = meta.optimization_guide?.description_advice;
    signals.push({
        label: 'Title',
        status: titleAdvice ? '待优化' : '已检查',
        desc: titleAdvice?.before || '标题已纳入 SEO 审核'
    });
    signals.push({
        label: 'Description',
        status: descriptionAdvice ? '待优化' : '已检查',
        desc: descriptionAdvice?.before || 'Meta 描述已纳入 SEO 审核'
    });
    signals.push({
        label: '严重问题',
        status: (seoSummary.p0_count || 0) > 0 ? '存在风险' : '未发现',
        desc: `${seoSummary.p0_count || 0} 个 P0，${seoSummary.p1_count || 0} 个 P1`
    });
    signals.push({
        label: 'Robots',
        status: rs.robots?.exists ? '已配置' : '缺失',
        desc: rs.robots?.exists ? `Disallow 规则 ${rs.robots.disallowRules?.length || 0} 条` : '建议补充 robots.txt'
    });
    signals.push({
        label: 'Sitemap',
        status: rs.sitemap?.exists ? '已配置' : '缺失',
        desc: rs.sitemap?.exists ? `${rs.sitemap.urlCount || 0} 个 URL` : '建议补充 sitemap.xml'
    });
    signals.push({
        label: '结构化数据',
        status: geo.entity_analysis?.primary_entity ? '可识别' : '待增强',
        desc: geo.entity_analysis?.primary_entity || '需要增强实体和 Schema 信号'
    });

    return `
        <div class="detail-head-card">
            ${buildDetailHead('detail-head-icon-cyan', 'fa-wave-square', '信号概览', '搜索引擎和 AI 理解页面核心信息所依赖的基础信号')}
            <div class="detail-head-body">
                <div class="agent-signal-grid">
                    ${signals.map(signal => {
                        const tone = getStatusToneByText(signal.status);
                        return `
                        <div class="agent-signal-card">
                            <div class="agent-signal-top">
                                <strong>${escapeHtml(signal.label)}</strong>
                                <span style="color:${tone.color};background:${tone.bg};border-color:${tone.border}">${escapeHtml(signal.status)}</span>
                            </div>
                            <p>${escapeHtml(signal.desc)}</p>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

function buildAgentRobotsSitemap(rs) {
    if (!rs || typeof rs !== 'object' || Object.keys(rs).length === 0) return '';

    const rows = [];
    if (rs.robots) {
        rows.push({
            item: 'robots.txt',
            status: rs.robots.exists ? '已配置' : '缺失',
            desc: rs.robots.exists ? `包含 ${rs.robots.disallowRules?.length || 0} 条 Disallow 规则` : '建议创建 robots.txt 文件'
        });
        if (rs.robots.sitemapUrl) {
            rows.push({ item: 'Sitemap 声明', status: '已配置', desc: rs.robots.sitemapUrl });
        }
    }
    if (rs.sitemap) {
        rows.push({
            item: 'sitemap.xml',
            status: rs.sitemap.exists ? '已配置' : '缺失',
            desc: rs.sitemap.exists ? `包含 ${rs.sitemap.urlCount || 0} 个 URL` : '建议创建 sitemap.xml 文件'
        });
    }
    if (rows.length === 0) return '';

    return `
        <div class="detail-head-card">
            ${buildDetailHead('detail-head-icon-neutral', 'fa-robot', 'Robots & Sitemap', 'robots.txt 与 sitemap.xml 抓取配置')}
            <div class="detail-head-body">
                <div style="overflow-x:auto">
                    <table class="tech-check-table">
                        <thead><tr><th>检查项</th><th>状态</th><th>说明</th></tr></thead>
                        <tbody>
                            ${rows.map((row) => {
                                const tone = getStatusToneByText(row.status);
                                return `
                                <tr>
                                    <td style="white-space:nowrap;font-weight:500">${escapeHtml(row.item)}</td>
                                    <td><span class="status-pill" style="color:${tone.color};border:1px solid ${tone.border};background:${tone.bg}">${escapeHtml(row.status)}</span></td>
                                    <td style="font-size:12px;color:var(--text-muted);line-height:1.5">${escapeHtml(row.desc)}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
}

function displayHistory(reports) {
    const container = document.getElementById('historyContainer');
    if (!container) return;

    if (!reports || reports.length === 0) {
        container.innerHTML = `
            <div class="empty-state fade-in">
                <i class="fas fa-inbox text-3xl mb-3 opacity-30"></i>
                <p class="text-base text-[var(--text-secondary)]">暂无分析记录</p>
            </div>
        `;
        return;
    }

    container.innerHTML = reports.map((report, index) => {
        const score = report.score || 0;
        let scoreColor = 'var(--success)';
        if (score < 60) scoreColor = 'var(--danger)';
        else if (score < 85) scoreColor = 'var(--warning)';

        const date = new Date(report.created_at).toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        return `
            <div class="glass-panel p-4 cursor-pointer group fade-in hover:border-[var(--accent)] transition-all"
                 style="animation-delay: ${index * 0.05}s"
                 onclick="window.location.href='report.html?id=${report.id}'">
                <div class="flex items-center justify-between gap-4">
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-mono truncate mb-1.5 leading-relaxed">${escapeHtml(report.url)}</div>
                        <div class="text-xs text-[var(--text-muted)]">${date}</div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-lg flex items-center justify-center" style="background: ${scoreColor}15; border: 1px solid ${scoreColor}30">
                            <span class="text-lg font-bold font-mono" style="color: ${scoreColor}">${score}</span>
                        </div>
                        <svg class="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'var(--success-dim)' : type === 'error' ? 'var(--danger-dim)' : type === 'warning' ? 'var(--warning-dim)' : 'var(--accent-dim)';
    const textColor = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : type === 'warning' ? 'var(--warning)' : 'var(--accent)';
    const borderColor = type === 'success' ? 'rgba(5, 150, 105, 0.15)' : type === 'error' ? 'rgba(225, 29, 72, 0.15)' : type === 'warning' ? 'rgba(217, 119, 6, 0.15)' : 'var(--border-accent)';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-info-circle';

    notification.className = 'notification-toast fade-in flex items-start gap-3';
    notification.style.cssText = `background: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor};`;
    notification.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
