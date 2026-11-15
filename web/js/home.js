document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('seoAuditForm');
    const singleModeBtn = document.getElementById('singleModeBtn');
    const batchModeBtn = document.getElementById('batchModeBtn');
    const urlInputContainer = document.getElementById('urlInputContainer');
    const batchUrlsContainer = document.getElementById('batchUrlsContainer');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressSteps = document.getElementById('progressSteps');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const agentWorkspace = document.getElementById('agentWorkspace');
    const persistedAgentJobId = window.localStorage ? window.localStorage.getItem('agentJobId') : null;

    let isBatchMode = false;
    let isAnalyzing = false;

    const urlInput = document.getElementById('url');
    const batchUrlsInput = document.getElementById('batchUrls');

    if (singleModeBtn && batchModeBtn) {
        singleModeBtn.addEventListener('click', () => {
            isBatchMode = false;
            singleModeBtn.className = 'mode-button is-active';
            batchModeBtn.className = 'mode-button';

            if (urlInputContainer) urlInputContainer.classList.remove('hidden');
            if (batchUrlsContainer) batchUrlsContainer.classList.add('hidden');

            if (urlInput) urlInput.required = true;
            if (batchUrlsInput) batchUrlsInput.required = false;
        });

        batchModeBtn.addEventListener('click', () => {
            isBatchMode = true;
            batchModeBtn.className = 'mode-button is-active';
            singleModeBtn.className = 'mode-button';

            if (urlInputContainer) urlInputContainer.classList.add('hidden');
            if (batchUrlsContainer) batchUrlsContainer.classList.remove('hidden');

            if (urlInput) urlInput.required = false;
            if (batchUrlsInput) batchUrlsInput.required = true;
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (isAnalyzing) return;
            isAnalyzing = true;

            let urls = [];
            if (isBatchMode) {
                const batchUrlsInput = document.getElementById('batchUrls');
                if (batchUrlsInput) {
                    urls = batchUrlsInput.value.split('\n')
                        .map(url => url.trim())
                        .filter(url => url.length > 0)
                        .map(url => {
                            if (!/^https?:\/\//i.test(url)) return "https://" + url;
                            return url;
                        });
                }
            } else {
                const urlInput = document.getElementById('url');
                if (urlInput && urlInput.value.trim()) {
                    let url = urlInput.value.trim();
                    // 自动补全协议前缀
                    if (!/^https?:\/\//i.test(url)) {
                        url = 'https://' + url;
                        urlInput.value = url;
                    }
                    urls = [url];
                }
            }

            if (urls.length === 0) {
                showNotification('请输入至少一个URL', 'error');
                isAnalyzing = false;
                return;
            }

            for (let url of urls) {
                if (!isValidUrl(url)) {
                    showNotification(`URL格式错误: ${url}`, 'error');
                    isAnalyzing = false;
                    return;
                }
            }

            const scopeSeo = document.getElementById('scopeSeo');
            const scopeGeo = document.getElementById('scopeGeo');
            const analysisTypes = [];
            if (scopeSeo && scopeSeo.checked) analysisTypes.push('seo');
            if (scopeGeo && scopeGeo.checked) analysisTypes.push('geo');

            if (analysisTypes.length === 0) {
                showNotification('请至少选择一种审核类型', 'error');
                isAnalyzing = false;
                return;
            }

            if (loadingIndicator) loadingIndicator.classList.add('show');
            if (analyzeBtn) {
                analyzeBtn.disabled = true;
                analyzeBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>审核中...</span>';
            }

            try {
                if (urls.length === 1) {
                    await analyzeSingleUrl(urls[0], analysisTypes);
                } else {
                    await analyzeBatchUrls(urls, analysisTypes);
                }
            } catch (error) {
                console.error('Analysis failed:', error);
                showNotification(`分析失败: ${error.message}`, 'error');
                // 失败时更新状态文字显示错误
                const statusText = document.getElementById('agentStatusText');
                if (statusText) statusText.textContent = '❌ ' + error.message;
                // 隐藏取消按钮
                const cancelBtn = document.getElementById('cancelJobBtn');
                if (cancelBtn) cancelBtn.classList.add('hidden');
            } finally {
                isAnalyzing = false;
                if (loadingIndicator) loadingIndicator.classList.remove('show');
                if (analyzeBtn) {
                    analyzeBtn.disabled = false;
                    analyzeBtn.innerHTML = '<i class="fas fa-play"></i><span>开始审核</span>';
                }
            }
        });
    }

    if (persistedAgentJobId) {
        resumeAgentJob(persistedAgentJobId);
    }

    async function analyzeSingleUrl(url, analysisTypes = ['seo', 'geo']) {
        const uaSelect = document.getElementById('ua');
        const ua = uaSelect ? uaSelect.value : 'pc';
        const aiProviderSelect = document.getElementById('aiProvider');
        const aiProvider = aiProviderSelect ? aiProviderSelect.value : 'deepseek';

        if (agentWorkspace) agentWorkspace.classList.add('show');
        // Show cancel button
        const cancelBtn = document.getElementById('cancelJobBtn');
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        updateAgentStatus({ status: 'queued', progress: 0, steps: [], analysisTypes });

        const job = await createAgentJob({
            url,
            userAgent: ua,
            analysisTypes,
            aiProvider
        });

        window.currentJobId = job.jobId;
        persistAgentJob(job.jobId);
        await pollAgentJob(job.jobId);
    }

    async function resumeAgentJob(jobId) {
        if (isAnalyzing) return;
        
        // 先检查任务状态，已完成/失败/取消的直接清除
        try {
            const job = await getAgentJob(jobId);
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                clearAgentJob();
                console.log('Old job already ' + job.status + ', cleared.');
                return;
            }
        } catch (e) {
            clearAgentJob();
            console.log('Old job not found, cleared.');
            return;
        }
        
        isAnalyzing = true;
        if (agentWorkspace) agentWorkspace.classList.add('show');
        if (loadingIndicator) loadingIndicator.classList.add('show');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>审核中...</span>';
        }

        try {
            await pollAgentJob(jobId);
        } catch (error) {
            clearAgentJob();
            console.error('Agent resume failed:', error);
            showNotification(`恢复审核任务失败: ${error.message}`, 'error');
        } finally {
            isAnalyzing = false;
            if (loadingIndicator) loadingIndicator.classList.remove('show');
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = '<i class="fas fa-play"></i><span>开始审核</span>';
            }
        }
    }

    async function pollAgentJob(jobId) {
        const startedAt = Date.now();
        const timeoutMs = 10 * 60 * 1000;

        while (Date.now() - startedAt < timeoutMs) {
            const job = await getAgentJob(jobId);
            updateAgentStatus(job);

            if (job.status === 'completed') {
                clearAgentJob();
                if (job.reportId) {
                    window.location.href = `report.html?id=${job.reportId}`;
                    return;
                }
                throw new Error('审核任务完成但没有报告 ID');
            }

            if (job.status === 'failed') {
                clearAgentJob();
                throw new Error(job.error || '审核失败');
            }

            await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        throw new Error('审核超时');
    }

    function updateAgentStatus(job) {
        // Hide cancel button when job is completed/failed/cancelled
        const cancelBtn = document.getElementById('cancelJobBtn');
        if (cancelBtn && ['completed', 'failed', 'cancelled'].includes(job.status)) {
            cancelBtn.classList.add('hidden');
        }
        const statusText = document.getElementById('agentStatusText');
        const progressBar = document.getElementById('agentProgressBar');
        const timeline = document.getElementById('agentTimeline');
        const reportLink = document.getElementById('agentReportLink');

        if (statusText) {
            const typesLabel = (job.analysisTypes || []).map((type) => type.toUpperCase()).join(' 与 ');
            const statusMap = {
                queued: '任务已排队，等待执行',
                running: `正在执行 ${typesLabel} 审核`,
                completed: '✅ 审核完成，即将跳转…',
                failed: '❌ ' + (job.error || '审核失败')
            };
            statusText.textContent = statusMap[job.status] || '任务状态更新中';
            if (job.status === 'running' && job.progress > 0) {
                statusText.textContent += ' — ' + job.progress + '%';
            }
            // failed 状态加红色
            if (job.status === 'failed') {
                statusText.style.color = '#555';
            } else {
                statusText.style.color = '';
            }
        }

        if (progressBar) progressBar.style.width = `${job.progress || 0}%`;

        if (reportLink) {
            if (job.reportId) {
                reportLink.href = `report.html?id=${encodeURIComponent(job.reportId)}`;
                reportLink.classList.remove('hidden'); reportLink.classList.add('show');
            } else {
                reportLink.classList.remove('show'); reportLink.classList.add('hidden');
            }
        }

        if (timeline) {
            timeline.innerHTML = (job.steps || []).map((step) => {
                const stepStatus = normalizeStepStatus(step.status);
                const icon = stepStatus === 'completed' ? 'fa-check' :
                    stepStatus === 'failed' ? 'fa-xmark' :
                    stepStatus === 'skipped' ? 'fa-minus' :
                    stepStatus === 'running' ? 'fa-spinner fa-spin' : 'fa-circle';
                const durSec = step.startedAt && step.completedAt ? Math.round((new Date(step.completedAt) - new Date(step.startedAt)) / 1000) : -1;
                const duration = durSec >= 1 ? durSec + 's' : '';
                return '<div class="agent-step ' + stepStatus + '">' +
                    '<div class="agent-step-icon"><i class="fas ' + icon + '"></i></div>' +
                    '<div style="flex:1;min-width:0">' +
                    '<div class="agent-step-title">' + escapeHtml(step.title || step.stepKey || '未知步骤') + '</div>' +
                    '<div class="agent-step-message">' + escapeHtml(step.message || '等待执行') + (duration ? ' <small style="color:var(--faint);margin-left:6px">' + duration + '</small>' : '') + '</div>' +
                    '</div></div>';
            }).join('');
        }
    }

    function normalizeStepStatus(status) {
        return ['queued', 'running', 'completed', 'failed', 'skipped'].includes(status) ? status : 'queued';
    }

    function persistAgentJob(jobId) {
        if (!window.localStorage || !jobId) return;
        window.localStorage.setItem('agentJobId', jobId);
    }

    function clearAgentJob() {
        if (!window.localStorage) return;
        window.localStorage.removeItem('agentJobId');
    }

    async function analyzeBatchUrls(urls, analysisTypes = ['seo', 'geo']) {
        const uaSelect = document.getElementById('ua');
        const ua = uaSelect ? uaSelect.value : 'pc';
        const totalUrls = urls.length;
        let completedUrls = 0;
        let failedUrls = [];
        const startTime = Date.now();

        if (progressContainer) progressContainer.classList.remove('hidden');
        if (progressSteps) progressSteps.innerHTML = '';

        // 每个任务会发起 LLM 调用，限制并发避免触发限流
        const CONCURRENCY = 3;

        addProgressStep(`开始批量分析 ${totalUrls} 个URL (并发: ${CONCURRENCY})...`, 'info');

        const processUrl = async (url, index) => {
            const taskStartTime = Date.now();
            addProgressStep(`[${index + 1}/${totalUrls}] 开始: ${url}`, 'in_progress');

            try {
                const job = await createAgentJob({ url, userAgent: ua, analysisTypes, aiProvider });
                const reportId = await pollBatchJob(job.jobId);
                const elapsed = ((Date.now() - taskStartTime) / 1000).toFixed(1);

                completedUrls++;
                addProgressStep(`[${index + 1}/${totalUrls}] 成功: ${url} (报告 #${reportId}, ${elapsed}秒)`, 'success');
            } catch (error) {
                console.error(`Failed to analyze ${url}:`, error);
                failedUrls.push({ url, error: error.message });
                completedUrls++;
                addProgressStep(`[${index + 1}/${totalUrls}] 失败: ${url} - ${error.message}`, 'error');
            }

            const progress = Math.round((completedUrls / totalUrls) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            const avgTime = elapsed / completedUrls;
            const remaining = Math.round(avgTime * (totalUrls - completedUrls));

            let etaMsg = completedUrls < totalUrls ? `剩余: ~${remaining}秒` : '完成...';
            updateProgress(progress, `已处理 ${completedUrls}/${totalUrls} 个URL. ${etaMsg}`);
        };

        const workers = [];
        const urlEntries = urls.map((url, index) => ({ url, index }));

        for (let i = 0; i < Math.min(CONCURRENCY, urls.length); i++) {
            workers.push((async () => {
                while (urlEntries.length > 0) {
                    const task = urlEntries.shift();
                    await processUrl(task.url, task.index);
                }
            })());
        }

        await Promise.all(workers);

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        updateProgress(100, `完成! 处理了 ${totalUrls} 个URL，耗时 ${totalTime}秒。`);

        if (failedUrls.length > 0) {
            addProgressStep(`批量完成，${failedUrls.length} 个失败。正在跳转...`, 'warning');
            showNotification(`完成: ${totalUrls - failedUrls.length} 成功, ${failedUrls.length} 失败。`, 'info');
        } else {
            addProgressStep('所有分析完成! 正在跳转...', 'success');
            showNotification(`成功处理 ${totalUrls} 个URL，耗时 ${totalTime}秒!`, 'success');
        }

        setTimeout(() => {
            window.location.href = 'history.html';
        }, 3000);
    }

    async function pollBatchJob(jobId) {
        const startedAt = Date.now();
        const timeoutMs = 10 * 60 * 1000;

        while (Date.now() - startedAt < timeoutMs) {
            const job = await getAgentJob(jobId);

            if (job.status === 'completed') {
                if (job.reportId) return job.reportId;
                throw new Error('审核任务完成但没有报告 ID');
            }

            if (job.status === 'failed') {
                throw new Error(job.error || '审核失败');
            }

            await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        throw new Error('审核超时');
    }

    function updateProgress(percent, message) {
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        if (progressText) {
            progressText.textContent = message;
        }
    }

    function addProgressStep(message, status) {
        if (!progressSteps) return;

        const step = document.createElement('div');
        const colorClass = status === 'error' ? 'text-[var(--danger)]' :
                          status === 'success' ? 'text-[var(--success)]' :
                          status === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]';
        step.className = `progress-step ${colorClass}`;

        let icon = 'fa-circle-notch fa-spin';
        if (status === 'success') icon = 'fa-check-circle';
        if (status === 'error') icon = 'fa-exclamation-circle';
        if (status === 'warning') icon = 'fa-triangle-exclamation';

        step.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
        progressSteps.appendChild(step);
        progressSteps.scrollTop = progressSteps.scrollHeight;
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const bgColor = type === 'success' ? 'var(--success-dim)' : type === 'error' ? 'var(--danger-dim)' : type === 'warning' ? 'var(--warning-dim)' : 'var(--accent-dim)';
        const textColor = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : type === 'warning' ? 'var(--warning)' : 'var(--accent)';
        const borderColor = type === 'success' ? 'rgba(5, 150, 105, 0.15)' : type === 'error' ? 'rgba(225, 29, 72, 0.15)' : type === 'warning' ? 'rgba(217, 119, 6, 0.15)' : 'var(--border-accent)';
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-info-circle';

        notification.className = 'notification-toast fade-in flex items-start gap-3';
        notification.style.cssText = `background: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor};`;
        notification.innerHTML = `<i class="fas ${icon}"></i><span></span>`;
        notification.querySelector('span').textContent = message;

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
});

window.loadHomeRecentReports = async function loadHomeRecentReports() {
    const container = document.getElementById('recentReportsContainer');
    if (!container || typeof getHistoryReports !== 'function') return;

    container.innerHTML = '<div class="home-empty-row">正在加载最近报告...</div>';

    try {
        const reports = await getHistoryReports(3, 0);
        if (!reports || reports.length === 0) {
            container.innerHTML = `
                <div class="home-empty-row">
                    暂无历史报告，完成一次审核后会显示在这里。
                </div>
            `;
            return;
        }

        container.innerHTML = reports.slice(0, 3).map((report) => {
            const score = Number.isFinite(Number(report.score)) ? Math.round(Number(report.score)) : 0;
            const tone = score < 60 ? 'danger' : score < 85 ? 'warning' : 'good';
            const createdAt = report.created_at ? new Date(report.created_at).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }) : '-';

            return `
                <button class="recent-report-item" onclick="window.location.href='report.html?id=${encodeURIComponent(report.id)}'">
                    <div class="recent-report-main">
                        <span>${escapeHtml(report.url || '未命名页面')}</span>
                        <small>${escapeHtml(createdAt)}${report.user_agent ? ` · ${escapeHtml(report.user_agent)}` : ''}</small>
                    </div>
                    <div class="recent-report-score ${tone}">${score}</div>
                </button>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load recent reports:', error);
        container.innerHTML = '<div class="home-empty-row">最近报告加载失败</div>';
    }
}
// Cancel current job
async function cancelCurrentJob() {
    const jobId = window.currentJobId;
    if (!jobId) return;
    
    if (!confirm('确定要取消当前任务吗？')) return;
    
    try {
        const response = await fetch(`/api/agent/jobs/${jobId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Update UI
            document.getElementById('cancelJobBtn').classList.add('hidden');
            document.getElementById('agentStatusText').textContent = '任务已取消';
            document.getElementById('agentProgressBar').style.width = '100%';
            document.getElementById('agentProgressBar').style.background = '#f59e0b';
        } else {
            alert(data.error || '取消失败');
        }
    } catch (error) {
        alert('网络错误，请重试');
    }
}
