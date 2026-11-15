const { getStepProgress } = require('./agent_steps');
const { isJobCancelled, clearJobCancelled } = require('./cancel_tracker');

function fetchWebsiteHtmlAsync(fetchWebsiteHtml, url, userAgent) {
    return new Promise((resolve, reject) => {
        fetchWebsiteHtml(url, userAgent, (error, html) => error ? reject(error) : resolve(html));
    });
}

function analyzeSEOAsync(performSEOAnalysis, html, url, robotsSitemapData) {
    return new Promise((resolve, reject) => {
        performSEOAnalysis(html, url, robotsSitemapData, (error, result) => error ? reject(error) : resolve(result));
    });
}

function saveReportAsync(db, { url, score, stats, data, userId, userAgent }) {
    return new Promise((resolve, reject) => {
        db.saveReport(url, score, stats, data, userId, userAgent, (error, id) => error ? reject(error) : resolve(id));
    });
}

function buildReportStats(pageSignals = {}) {
    const htmlSize = pageSignals.htmlSize || pageSignals.html_size || '0 KB';
    const totalLinks = pageSignals.links?.total || pageSignals.totalLinks || pageSignals.total_links || 0;
    const internalLinks = pageSignals.links?.internal || pageSignals.internalLinks || pageSignals.internal_links || 0;
    const externalLinks = pageSignals.links?.external || pageSignals.externalLinks || pageSignals.external_links || 0;
    const totalImages = pageSignals.images?.total || pageSignals.totalImages || pageSignals.total_images || 0;
    const imagesNoAlt = pageSignals.images?.missingAlt || pageSignals.imagesNoAlt || pageSignals.images_no_alt || 0;
    const topKeywords = pageSignals.topKeywords || pageSignals.top_keywords || [];

    return {
        htmlSize,
        html_size: htmlSize,
        totalLinks,
        total_links: totalLinks,
        internalLinks,
        internal_links: internalLinks,
        externalLinks,
        external_links: externalLinks,
        totalImages,
        total_images: totalImages,
        imagesNoAlt,
        images_no_alt: imagesNoAlt,
        topKeywords,
        top_keywords: topKeywords
    };
}

function createAgentRunner(deps) {
    const {
        store,
        fetchWebsiteHtmlAsync: fetchHtml,
        fetchRobotsAndSitemap,
        extractPageSignals,
        analyzeSEO,
        analyzeGEO,
        composeAgentReport,
        saveReportAsync: saveReport
    } = deps;

    async function completeStep(jobId, stepKey, message, details, options = {}) {
        const { updateJobProgress = true } = options;
        await store.updateStep(jobId, stepKey, {
            status: 'completed',
            progress: 100,
            message,
            details
        });
        if (updateJobProgress) {
            await store.updateJob(jobId, { currentStep: stepKey, progress: getStepProgress(stepKey) });
        }
    }

    async function runStep(jobId, stepKey, message, fn, options = {}) {
        const { updateJobProgress = true } = options;
        await store.updateStep(jobId, stepKey, { status: 'running', progress: 10, message });
        if (updateJobProgress) {
            await store.updateJob(jobId, { currentStep: stepKey, progress: getStepProgress(stepKey) });
        }

        try {
            return await fn();
        } catch (error) {
            await store.updateStep(jobId, stepKey, { status: 'failed', progress: 100, message: error.message });
            throw error;
        }
    }

    return {
        async run(jobId) {
            const job = await store.getJobWithSteps({ jobId, userId: null, isAdmin: true });
            if (!job) throw new Error('Agent job not found');

            const analysisTypes = String(job.analysis_types || 'seo,geo').split(',')
                .map((type) => type.trim())
                .filter(Boolean);

            let currentStep = 'plan';

            // Check if job is cancelled before starting
            async function checkCancelled() {
                // Check both database and in-memory tracker
                const currentJob = await store.getJobWithSteps({ jobId, userId: null, isAdmin: true });
                if (currentJob && currentJob.status === 'cancelled') {
                    clearJobCancelled(jobId);
                    throw new Error('Job cancelled by user');
                }
                // Also check the global cancel tracker (faster response)
                if (isJobCancelled(jobId)) {
                    clearJobCancelled(jobId);
                    throw new Error('Job cancelled by user');
                }
            }

            try {
                // 设置AI provider（使用job中的配置）
                if (job.ai_provider) {
                    process.env.AI_PROVIDER = job.ai_provider;
                    console.log('Using AI provider', { provider: job.ai_provider, jobId });
                }
                
                await checkCancelled();
                await store.startJob(jobId);

                currentStep = 'plan';
                await runStep(jobId, currentStep, 'Agent 正在规划 SEO 与 GEO 分析', async () => null);
                await completeStep(jobId, currentStep, '已规划 SEO 与 GEO 分析');

                currentStep = 'fetch';
                const fetchResult = await runStep(jobId, currentStep, '正在抓取页面与爬虫配置', async () => {
                    const [html, robotsSitemapData] = await Promise.all([
                        fetchHtml(job.url, job.user_agent),
                        fetchRobotsAndSitemap(job.url).catch((error) => ({ error: error.message }))
                    ]);
                    return { html, robotsSitemapData };
                });
                await completeStep(jobId, currentStep, `已抓取 ${(fetchResult.html.length / 1024).toFixed(2)} KB HTML`);

                currentStep = 'extract';
                const pageSignals = await runStep(jobId, currentStep, '正在提取页面信号', async () => extractPageSignals(fetchResult.html));
                await completeStep(jobId, currentStep, '已提取标题、链接、图片、结构化数据与关键词信号', pageSignals);

                // 标记未选择的审计步骤为跳过
                for (const [stepKey, type] of [['seo_audit', 'seo'], ['geo_audit', 'geo']]) {
                    if (!analysisTypes.includes(type)) {
                        await store.updateStep(jobId, stepKey, { status: 'skipped', progress: 100, message: '未选择该审核，已跳过' });
                    }
                }

                const runAudit = (type, stepKey, message, taskFn) =>
                    analysisTypes.includes(type)
                        ? runStep(jobId, stepKey, message, taskFn, { updateJobProgress: false })
                        : Promise.resolve(null);

                currentStep = 'seo_audit';
                await checkCancelled();
                await store.updateJob(jobId, { currentStep, progress: getStepProgress(currentStep) });
                const auditResults = await Promise.allSettled([
                    runAudit('seo', 'seo_audit', '正在执行 SEO 审计', async () => {
                        const result = await analyzeSEO(fetchResult.html, job.url, fetchResult.robotsSitemapData);
                        await completeStep(jobId, 'seo_audit', 'SEO 审计完成', undefined, { updateJobProgress: false });
                        return result;
                    }),
                    runAudit('geo', 'geo_audit', '正在执行 GEO 审计', async () => {
                        const result = await analyzeGEO(fetchResult.html, job.url, pageSignals);
                        await completeStep(jobId, 'geo_audit', 'GEO 审计完成', undefined, { updateJobProgress: false });
                        return result;
                    })
                ]);

                const failedAudit = auditResults.find((result) => result.status === 'rejected');
                if (failedAudit) throw failedAudit.reason;

                const seoResult = auditResults[0].status === 'fulfilled' ? auditResults[0].value : null;
                const geoResult = auditResults[1].status === 'fulfilled' ? auditResults[1].value : null;
                currentStep = analysisTypes.includes('geo') ? 'geo_audit' : 'seo_audit';
                await store.updateJob(jobId, { currentStep, progress: getStepProgress(currentStep) });

                currentStep = 'compose';
                const report = await runStep(jobId, currentStep, '正在生成行动清单', async () => composeAgentReport({
                    seoResult,
                    geoResult,
                    robotsSitemapData: fetchResult.robotsSitemapData
                }));
                await completeStep(jobId, currentStep, '行动清单已生成');

                currentStep = 'save';
                const reportId = await runStep(jobId, currentStep, '正在保存 Agent 报告', async () => saveReport({
                    url: job.url,
                    score: report.agent_summary.overall_score,
                    stats: buildReportStats(pageSignals),
                    data: report,
                    userId: job.user_id,
                    userAgent: job.user_agent
                }));
                await completeStep(jobId, currentStep, 'Agent 报告已保存', { reportId });

                await store.updateJob(jobId, {
                    status: 'completed',
                    progress: 100,
                    reportId,
                    completedAt: new Date().toISOString()
                });
            } catch (error) {
                await store.updateJob(jobId, {
                    status: 'failed',
                    error: error.message,
                    currentStep,
                    completedAt: new Date().toISOString()
                });
                throw error;
            }
        }
    };
}

module.exports = {
    createAgentRunner,
    fetchWebsiteHtmlAsync,
    analyzeSEOAsync,
    saveReportAsync,
    buildReportStats
};
