const DEFAULT_AGENT_STEPS = [
    { stepKey: 'plan', title: '规划分析', progress: 5 },
    { stepKey: 'fetch', title: '抓取页面', progress: 20 },
    { stepKey: 'extract', title: '提取页面信号', progress: 35 },
    { stepKey: 'seo_audit', title: 'SEO 审计', progress: 55 },
    { stepKey: 'geo_audit', title: 'GEO 审计', progress: 75 },
    { stepKey: 'compose', title: '生成行动清单', progress: 90 },
    { stepKey: 'save', title: '保存报告', progress: 100 }
];

function getStepProgress(stepKey) {
    const step = DEFAULT_AGENT_STEPS.find((entry) => entry.stepKey === stepKey);
    return step ? step.progress : 0;
}

module.exports = {
    DEFAULT_AGENT_STEPS,
    getStepProgress
};
