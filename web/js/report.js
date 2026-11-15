const urlParams = new URLSearchParams(window.location.search);
const reportId = urlParams.get('id');

// User Agent 显示名称映射
function getUserAgentLabel(ua) {
    const uaLabels = {
        'pc': 'PC (Chrome)',
        'mobile': 'Mobile (Safari)',
        'google': 'Googlebot',
        'baidu': 'Baiduspider (PC)',
        'baidu-mobile': 'Baiduspider (Mobile)'
    };
    return uaLabels[ua] || ua || 'PC (Chrome)';
}

function renderReportLoadingState(icon, title, description, buttonText = '新建 Agent 分析') {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsContainer = document.getElementById('resultsContainer');
    if (resultsContainer) resultsContainer.classList.add('hidden');
    if (!loadingIndicator) return;

    loadingIndicator.classList.remove('hidden');
    loadingIndicator.innerHTML = `
        <div style="text-align:center;padding:48px 24px">
            <div style="width:56px;height:56px;border-radius:50%;background:var(--surface-soft);border:1px solid var(--border-subtle);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">
                <i class="fas ${icon}" style="font-size:20px;color:var(--text-muted)"></i>
            </div>
            <p style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:6px">${title}</p>
            ${description ? `<p style="font-size:13px;color:var(--text-muted);line-height:1.55;max-width:360px;margin:0 auto">${description}</p>` : ''}
            <button onclick="window.location.href='/'" class="action-button" style="margin-top:20px">
                <i class="fas fa-plus" style="font-size:10px"></i>
                ${buttonText}
            </button>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!reportId) {
        renderReportLoadingState('fa-exclamation-triangle', '缺少报告 ID', '请从历史记录或分析结果页重新打开报告。');
        return;
    }

    try {
        const report = await getReportById(reportId);

        if (!report || !report.data) {
            renderReportLoadingState('fa-file-circle-xmark', '未找到报告', '该报告可能已被删除，或你当前无权访问。');
            return;
        }

        document.getElementById('loadingIndicator').classList.add('hidden');
        document.getElementById('resultsContainer').classList.remove('hidden');

        // Set header URL display
        const headerUrl = document.getElementById('headerUrl');
        if (headerUrl) {
            headerUrl.textContent = report.url || '—';
            headerUrl.title = report.url || '';
        }

        // Set header meta (time + user agent)
        const headerMeta = document.getElementById('headerMeta');
        if (headerMeta && report.created_at) {
            const d = new Date(report.created_at);
            const timeStr = d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const uaLabel = getUserAgentLabel(report.user_agent);
            headerMeta.textContent = `${timeStr} · ${uaLabel}`;
            headerMeta.style.display = '';
        }

        const isAgentReport = report.data && report.data.agent_summary && report.data.geo;

        // Update page title
        document.title = `${isAgentReport ? 'SEO & GEO' : 'SEO Audit'} — ${report.url || 'Report'}`;

        if (isAgentReport) {
            displayAgentReport(report.data, report.url, report.stats, report.score);
        } else {
            displayAnalysisResult(report.data, report.url, report.stats, report.score);
        }

    } catch (error) {
        console.error('Failed to load report:', error);
        renderReportLoadingState('fa-exclamation-circle', '加载报告失败', error.message || '请稍后重试。');
    }
});
