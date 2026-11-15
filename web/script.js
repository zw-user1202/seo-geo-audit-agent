/**
 * SEO 工具 - 主程序入口 (Controller)
 */

let isBatchMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    const seoAuditForm = document.getElementById('seoAuditForm');
    const urlInput = document.getElementById('urlInput');
    const urlTextarea = document.getElementById('urlTextarea');
    const uaSelect = document.getElementById('uaSelect');
    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
    const singleModeBtn = document.getElementById('singleModeBtn');
    const batchModeBtn = document.getElementById('batchModeBtn');
    const singleUrlInput = document.getElementById('singleUrlInput');
    const batchUrlInput = document.getElementById('batchUrlInput');

    // URL输入框自动补全协议
    if (urlInput) {
        urlInput.addEventListener('blur', () => {
            const url = urlInput.value.trim();
            if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
                urlInput.value = `https://${url}`;
            }
        });
    }

    // URL文本域自动补全协议（批量模式）
    if (urlTextarea) {
        urlTextarea.addEventListener('blur', () => {
            const lines = urlTextarea.value.split('\n');
            const normalizedLines = lines.map(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                    return `https://${trimmed}`;
                }
                return line;
            });
            urlTextarea.value = normalizedLines.join('\n');
        });
    }

    // 模式切换
    if (singleModeBtn && batchModeBtn) {
        singleModeBtn.addEventListener('click', () => {
            isBatchMode = false;
            singleModeBtn.classList.add('bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/30');
            singleModeBtn.classList.remove('bg-slate-800', 'text-slate-400', 'border-slate-700');
            batchModeBtn.classList.remove('bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/30');
            batchModeBtn.classList.add('bg-slate-800', 'text-slate-400', 'border-slate-700');
            singleUrlInput.classList.remove('hidden');
            batchUrlInput.classList.add('hidden');
            urlInput.required = true;
            urlTextarea.required = false;
        });

        batchModeBtn.addEventListener('click', () => {
            isBatchMode = true;
            batchModeBtn.classList.add('bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/30');
            batchModeBtn.classList.remove('bg-slate-800', 'text-slate-400', 'border-slate-700');
            singleModeBtn.classList.remove('bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/30');
            singleModeBtn.classList.add('bg-slate-800', 'text-slate-400', 'border-slate-700');
            batchUrlInput.classList.remove('hidden');
            singleUrlInput.classList.add('hidden');
            urlInput.required = false;
            urlTextarea.required = true;
        });
    }

    // 1. 优先绑定事件监听，确保按钮交互始终可用
    if (seoAuditForm) {
        console.log('Event listener attached to form');
        seoAuditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Form submitted');

            const ua = uaSelect ? uaSelect.value : 'pc';

            if (isBatchMode) {
                const urlsText = urlTextarea.value.trim();
                const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u);

                const invalidUrls = urls.filter(u => !isValidUrl(u));
                if (invalidUrls.length > 0) {
                    alert(`以下URL格式无效（必须包含http://或https://）：\n${invalidUrls.slice(0, 3).join('\n')}${invalidUrls.length > 3 ? '\n...' : ''}`);
                    return;
                }

                await handleBatchAnalysis(urlsText, ua);
            } else {
                const url = urlInput.value.trim();
                if (!url) {
                    alert('请输入URL地址');
                    return;
                }
                if (!isValidUrl(url)) {
                    alert('URL格式无效，必须包含http://或https://协议头');
                    return;
                }
                await handleSingleAnalysis(url, ua);
            }
        });
    } else {
        console.error('Initialisation Error: seoAuditForm not found');
    }

    // 2. 刷新历史记录按钮
    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', async () => {
            await loadAndDisplayHistory();
            showNotification('History refreshed', 'info');
        });
    }

    // 3. 初始化：从数据库加载历史记录
    await loadAndDisplayHistory();

    // 4. 初始化：从数据库加载最新报告 (不阻塞交互)
    try {
        const latestReport = await getLatestReport();
        if (latestReport && latestReport.data) {
            if (urlInput) urlInput.value = latestReport.url || '';
            if (typeof displayAnalysisResult === 'function') {
                displayAnalysisResult(latestReport.data, latestReport.url, latestReport.stats, latestReport.score);
            } else {
                console.error('displayAnalysisResult function is missing');
            }
        }
    } catch (err) {
        console.error('Failed to load latest report:', err);
    }
});

// 处理单个URL分析
async function handleSingleAnalysis(url, ua) {
    try {
        showLoadingState();
        updateLoadingProgress('Fetching HTML...', 10);

        const rawHtml = await fetchWebsiteHtml(url, ua);
        updateLoadingProgress('Extracting stats...', 30);

        const pageStats = extractPageStats(rawHtml);
        updateLoadingProgress('Analyzing with AI...', 70);

        // Send raw HTML to backend; backend handles cleaning
        const analysisResult = await analyzeWithDeepSeek(rawHtml, url);
        updateLoadingProgress('Calculating score...', 90);

        const seoScore = calculateSeoScore(analysisResult.summary);
        updateLoadingProgress('Saving results...', 100);

        displayAnalysisResult(analysisResult, url, pageStats, seoScore);
        saveToDatabase(analysisResult, url, pageStats, seoScore);
        await loadAndDisplayHistory();

        showNotification('Analysis completed successfully', 'success');
    } catch (error) {
        console.error('Analysis failed:', error);
        alert(`分析失败: ${error.message}`);
    } finally {
        hideLoadingState();
    }
}

// 处理批量分析
async function handleBatchAnalysis(urlsText, ua) {
    const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u);

    if (urls.length === 0) {
        alert('请输入至少一个URL地址');
        return;
    }

    const results = [];
    const total = urls.length;

    try {
        showLoadingState();
        document.getElementById('batchProgress').classList.remove('hidden');

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            updateBatchProgress(i + 1, total, `Analyzing: ${url}`);
            updateLoadingProgress(`Processing ${i + 1}/${total}...`, Math.round(((i + 1) / total) * 100));

            try {
                const rawHtml = await fetchWebsiteHtml(url, ua);
                const pageStats = extractPageStats(rawHtml);
                // Send raw HTML to backend; backend handles cleaning
                const analysisResult = await analyzeWithDeepSeek(rawHtml, url);
                const seoScore = calculateSeoScore(analysisResult.summary);

                results.push({
                    url,
                    data: analysisResult,
                    stats: pageStats,
                    score: seoScore
                });

                saveToDatabase(analysisResult, url, pageStats, seoScore);
            } catch (error) {
                console.error(`Failed to analyze ${url}:`, error);
                results.push({
                    url,
                    error: error.message
                });
            }
        }

        await loadAndDisplayHistory();

        if (results.length > 0) {
            const successCount = results.filter(r => !r.error).length;
            showNotification(`Batch analysis completed: ${successCount}/${total} successful`, successCount === total ? 'success' : 'warning');
        }

    } catch (error) {
        console.error('Batch analysis failed:', error);
        alert(`批量分析失败: ${error.message}`);
    } finally {
        hideLoadingState();
        document.getElementById('batchProgress').classList.add('hidden');
    }
}

// 更新加载进度
function updateLoadingProgress(text, progress) {
    const loadingText = document.getElementById('loadingText');
    const progressBar = document.getElementById('progressBar');
    if (loadingText) loadingText.textContent = text;
    if (progressBar) progressBar.style.width = `${progress}%`;
}

// 更新批量分析进度
function updateBatchProgress(current, total, text) {
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = `${current} / ${total} completed - ${text}`;
}

// 加载并显示历史记录
async function loadAndDisplayHistory() {
    try {
        const reports = await getHistoryReports(20, 0);
        displayHistory(reports);
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}