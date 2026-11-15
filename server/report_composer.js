function normalizeScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, number));
}

function calculateOverallScore(seoScore, geoScore) {
    return Math.round(normalizeScore(seoScore) * 0.55 + normalizeScore(geoScore) * 0.45);
}

function getIssueTitle(issue, fallback) {
    if (typeof issue === 'string') return issue;
    if (issue && typeof issue === 'object' && issue.title) return issue.title;
    return fallback;
}

function getIssueRecommendation(issue, fallback) {
    if (issue && typeof issue === 'object' && issue.recommendation) return issue.recommendation;
    return fallback;
}

function pushSeoActions(actions, issues, priority, defaults) {
    (issues || []).forEach((issue) => {
        actions.push({
            source: 'seo',
            priority,
            title: getIssueTitle(issue, defaults.title),
            impact: defaults.impact,
            reason: defaults.reason,
            recommendation: getIssueRecommendation(issue, defaults.recommendation)
        });
    });
}

function buildTopActions(seoResult, geoResult) {
    const actions = [];
    const summary = seoResult?.summary || {};

    pushSeoActions(actions, summary.p0_issues, 'P0', {
        title: 'SEO 严重问题',
        impact: 'high',
        reason: '该问题可能直接影响搜索引擎抓取、索引或核心内容理解。',
        recommendation: '优先修复该 SEO 阻断项。'
    });

    (geoResult?.summary?.top_opportunities || []).forEach((opportunity) => {
        actions.push({
            source: 'geo',
            priority: 'P1',
            title: typeof opportunity === 'string' ? opportunity : getIssueTitle(opportunity, 'GEO 优化机会'),
            impact: 'medium',
            reason: '该优化能提升页面被生成式引擎理解、摘取或总结的机会。',
            recommendation: getIssueRecommendation(opportunity, '将建议转化为清晰、可独立引用的页面内容块。')
        });
    });

    pushSeoActions(actions, summary.p1_issues, 'P1', {
        title: 'SEO 高优问题',
        impact: 'medium',
        reason: '该问题会削弱页面质量信号或搜索结果表现。',
        recommendation: '安排在 P0 后尽快修复。'
    });

    pushSeoActions(actions, summary.p2_issues, 'P2', {
        title: 'SEO 建议项',
        impact: 'low',
        reason: '该建议可进一步改善页面完整度、可维护性或长期搜索表现。',
        recommendation: '在高优先级问题完成后排期优化。'
    });

    return actions.slice(0, 5);
}

function composeAgentReport({ seoResult, geoResult, robotsSitemapData } = {}) {
    const hasSeo = seoResult != null;
    const hasGeo = geoResult != null;
    const seoScore = normalizeScore(seoResult?.score ?? seoResult?.summary?.ai_score);
    const geoScore = normalizeScore(geoResult?.score ?? geoResult?.summary?.geo_score);

    let overallScore;
    if (hasSeo && hasGeo) {
        overallScore = calculateOverallScore(seoScore, geoScore);
    } else if (hasSeo) {
        overallScore = seoScore;
    } else {
        overallScore = geoScore;
    }

    let executiveSummary = geoResult?.summary?.one_line_diagnosis;
    if (!executiveSummary) {
        executiveSummary = hasSeo ? 'Agent 已完成 SEO 分析。' : 'Agent 已完成 GEO 分析。';
    }

    const topActions = buildTopActions(seoResult, geoResult);

    return {
        agent_summary: {
            overall_score: overallScore,
            executive_summary: executiveSummary,
            top_actions: topActions
        },
        seo: {
            score: seoScore,
            summary: seoResult?.summary || {},
            meta_section: seoResult?.meta_section || {},
            content_section: seoResult?.content_section || [],
            tech_section: seoResult?.tech_section || {}
        },
        geo: {
            score: geoScore,
            summary: geoResult?.summary || {},
            visibility_factors: geoResult?.visibility_factors || [],
            answer_blocks: geoResult?.answer_blocks || [],
            entity_analysis: geoResult?.entity_analysis || {},
            trust_signals: geoResult?.trust_signals || {},
            rewrite_suggestions: geoResult?.rewrite_suggestions || []
        },
        evidence: geoResult?.evidence || [],
        robots_sitemap: robotsSitemapData || {}
    };
}

module.exports = {
    calculateOverallScore,
    composeAgentReport
};
