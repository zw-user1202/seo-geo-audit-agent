document.addEventListener('DOMContentLoaded', async () => {
    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');

    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', async () => {
            await loadAndDisplayHistory();
            showNotification('已刷新', 'success');
        });
    }

    await loadAndDisplayHistory();
});

async function loadAndDisplayHistory() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const historyContainer = document.getElementById('historyContainer');

    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const filterUserId = urlParams.get('userId');

        const reports = await getHistoryReports(50, 0, filterUserId);
        await displayHistory(reports);

        if (filterUserId && reports.length > 0) {
            const username = reports[0].username || 'User';
            document.querySelector('h1').textContent = `${username} 的 历史任务`;
        }
    } catch (error) {
        console.error('Failed to load history:', error);
        if (historyContainer) {
            historyContainer.innerHTML = `
                <div class="empty-state fade-in">
                    <i class="fas fa-exclamation-circle text-2xl mb-3 opacity-30"></i>
                    <p class="text-base text-[var(--text-secondary)]">加载失败</p>
                    <p class="text-sm mt-2 opacity-80">${escapeHtml(error.message || '请稍后重试')}</p>
                </div>
            `;
        }
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
}

// 缓存已加载的报告详情
const reportCache = {};

async function displayHistory(reports) {
    const container = document.getElementById('historyContainer');
    if (!container) return;

    if (!reports || reports.length === 0) {
        container.innerHTML = `
            <div class="empty-state fade-in">
                <i class="fas fa-inbox text-3xl mb-3 opacity-30"></i>
                <p class="text-base text-[var(--text-secondary)]">暂无 历史任务</p>
                <button onclick="window.location.href='/'" class="btn-tech mt-4">开始 Agent 分析</button>
            </div>
        `;
        return;
    }

    container.innerHTML = reports.map((report, index) => {
        const score = normalizeHistoryScore(report.score);
        let scoreClass = 'score-good';
        let scoreLabel = '良好';
        if (score < 60) {
            scoreClass = 'score-danger';
            scoreLabel = '严重';
        } else if (score < 85) {
            scoreClass = 'score-warning';
            scoreLabel = '待优化';
        } else {
            scoreClass = 'score-excellent';
            scoreLabel = '优秀';
        }

        const date = new Date(report.created_at).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="glass-panel overflow-hidden fade-in" style="animation-delay: ${index * 0.05}s" id="report-card-${report.id}">
                <!-- 主信息行 -->
                <div class="p-5 cursor-pointer hover:bg-[var(--accent-dim)] transition-colors" onclick="toggleReportDetail(${report.id})">
                    <div class="flex items-center justify-between gap-4">
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-mono text-[var(--text-secondary)] truncate mb-2 leading-relaxed">${escapeHtml(report.url)}</div>
                            <div class="text-xs text-[var(--text-muted)] leading-relaxed">
                                <i class="fas fa-clock mr-1"></i>${date}
                                ${report.username ? `<span class="ml-3"><i class="fas fa-user mr-1"></i>${escapeHtml(report.username)}</span>` : ''}
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right">
                                <div class="text-2xl font-bold font-mono ${scoreClass}">${score}</div>
                                <div class="text-[11px] uppercase tracking-[0.16em] ${scoreClass}">Agent ${scoreLabel}</div>
                            </div>
                            <i class="fas fa-chevron-down text-[var(--text-muted)] transition-transform duration-200" id="chevron-${report.id}"></i>
                        </div>
                    </div>
                </div>
                <!-- 详情区域 -->
                <div class="hidden border-t border-[var(--border-medium)]" id="detail-${report.id}">
                    <div class="p-4 bg-[var(--bg-void)]" id="detail-content-${report.id}">
                        <div class="flex items-center justify-center py-4 text-[var(--text-muted)]">
                            <div class="loading-spinner"></div>
                            <span class="ml-2 text-xs">加载详情...</span>
                        </div>
                    </div>
                </div>
                <!-- 操作按钮 -->
                <div class="px-5 py-3 border-t border-[var(--border-light)] bg-[var(--bg-surface)] flex justify-end gap-3">
                    <button onclick="event.stopPropagation(); viewReport(${report.id})" class="btn-tech py-2 px-3.5 text-xs">
                        <i class="fas fa-external-link-alt"></i>
                        <span>完整报告</span>
                    </button>
                    <button onclick="event.stopPropagation(); deleteReport(${report.id})" class="btn-tech py-2 px-3.5 text-xs text-[var(--danger)] hover:text-[var(--danger)]">
                        <i class="fas fa-trash"></i>
                        <span>删除</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleReportDetail(reportId) {
    const detailEl = document.getElementById(`detail-${reportId}`);
    const detailContentEl = document.getElementById(`detail-content-${reportId}`);
    const chevronEl = document.getElementById(`chevron-${reportId}`);

    if (!detailEl) return;

    const isHidden = detailEl.classList.contains('hidden');

    if (isHidden) {
        // 展开
        detailEl.classList.remove('hidden');
        chevronEl?.classList.add('rotate-180');

        // 加载详情
        if (!reportCache[reportId]) {
            try {
                console.log('[History] Loading report detail for ID:', reportId);
                const report = await getReportById(reportId);
                console.log('[History] Report data:', report);

                if (report && report.data) {
                    reportCache[reportId] = report;
                    renderReportDetail(reportId, report);
                } else {
                    // 显示错误信息
                    if (detailContentEl) {
                        detailContentEl.innerHTML = `
                            <div class="text-center py-5">
                                <i class="fas fa-exclamation-circle text-[var(--warning)] mb-2"></i>
                                <p class="text-sm text-[var(--text-secondary)]">无法加载报告详情</p>
                                <p class="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">可能需要重新登录或报告已被删除</p>
                            </div>
                        `;
                    }
                }
            } catch (error) {
                console.error('[History] Failed to load report detail:', error);
                if (detailContentEl) {
                    detailContentEl.innerHTML = `
                        <div class="text-center py-5">
                            <i class="fas fa-exclamation-circle text-[var(--danger)] mb-2"></i>
                            <p class="text-sm text-[var(--danger)]">加载失败: ${escapeHtml(error.message || '请稍后重试')}</p>
                        </div>
                    `;
                }
            }
        } else {
            renderReportDetail(reportId, reportCache[reportId]);
        }
    } else {
        // 收起
        detailEl.classList.add('hidden');
        chevronEl?.classList.remove('rotate-180');
    }
}

function renderReportDetail(reportId, report) {
    const detailContentEl = document.getElementById(`detail-content-${reportId}`);
    if (!detailContentEl) return;

    const data = report.data || {};
    const stats = report.stats || {};
    const isAgentReport = !!(data.agent_summary && data.geo);
    const summary = isAgentReport ? (data.seo?.summary || {}) : (data.summary || {});
    const overallScore = normalizeHistoryScore(data.agent_summary?.overall_score ?? report.score);
    const seoScore = normalizeHistoryScore(data.seo?.score ?? data.seo?.summary?.ai_score);
    const geoScore = normalizeHistoryScore(data.geo?.score ?? data.geo?.summary?.geo_score);

    const p0 = summary.p0_count || 0;
    const p1 = summary.p1_count || 0;
    const p2 = summary.p2_count || 0;
    const p3 = summary.p3_count || 0;

    const uaLabels = {
        'pc': 'PC', 'mobile': 'Mobile', 'google': 'Googlebot',
        'baidu': 'Baiduspider', 'baidu-mobile': 'Baidu Mobile'
    };
    const uaLabel = uaLabels[report.user_agent] || report.user_agent || 'PC';

    detailContentEl.innerHTML = `
        <!-- UA -->
        <div class="text-xs text-[var(--text-muted)] mb-4">抓取身份: ${uaLabel}</div>

        ${isAgentReport ? `
        <div class="grid grid-cols-3 gap-3 mb-4 text-center">
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <div class="font-mono text-lg font-bold" style="color: var(--accent)">${overallScore}</div>
                <div class="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.16em]">Overall</div>
            </div>
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <div class="font-mono text-lg font-bold">${seoScore}</div>
                <div class="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.16em]">SEO</div>
            </div>
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <div class="font-mono text-lg font-bold">${geoScore}</div>
                <div class="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.16em]">GEO</div>
            </div>
        </div>` : ''}

        <!-- 统计 -->
        <div class="grid grid-cols-4 gap-3 mb-4 text-center">
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <div class="font-mono text-lg font-bold" style="color: var(--danger)">${p0}</div>
                <div class="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.16em]">P0</div>
            </div>
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <div class="font-mono text-lg font-bold" style="color: var(--warning)">${p1}</div>
                <div class="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.16em]">P1</div>
            </div>
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <div class="font-mono text-lg font-bold" style="color: var(--accent)">${p2}</div>
                <div class="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.16em]">P2</div>
            </div>
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <div class="font-mono text-lg font-bold">${p3}</div>
                <div class="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.16em]">P3</div>
            </div>
        </div>

        <!-- 页面信息 -->
        <div class="grid grid-cols-3 gap-3 text-sm mb-4">
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <span class="text-[var(--text-muted)]">HTML:</span>
                <span class="font-mono">${stats.htmlSize || stats.html_size || '-'}</span>
            </div>
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <span class="text-[var(--text-muted)]">链接:</span>
                <span class="font-mono">${stats.totalLinks || stats.total_links || 0}</span>
            </div>
            <div class="p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                <span class="text-[var(--text-muted)]">图片:</span>
                <span class="font-mono">${stats.totalImages || stats.total_images || 0}</span>
            </div>
        </div>

        <a href="report.html?id=${reportId}" class="btn-tech text-xs py-2.5 px-3 w-full text-center">查看完整报告</a>
    `;
}

function viewReport(id) {
    window.location.href = `report.html?id=${id}`;
}

function normalizeHistoryScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, Math.round(number)));
}

async function deleteReport(reportId) {
    if (!confirm('确定要删除这份报告吗？此操作无法撤销。')) return;

    try {
        const response = await fetch(`/api/reports/${reportId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('删除失败');
        }

        const card = document.getElementById(`report-card-${reportId}`);
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'translateX(-100%)';
            setTimeout(() => card.remove(), 300);
        }

        delete reportCache[reportId];
        showNotification('报告已删除', 'success');
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('删除失败: ' + error.message, 'error');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'var(--success-dim)' : type === 'error' ? 'var(--danger-dim)' : type === 'warning' ? 'var(--warning-dim)' : 'var(--accent-dim)';
    const textColor = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : type === 'warning' ? 'var(--warning)' : 'var(--accent)';
    const borderColor = type === 'success' ? 'rgba(5, 150, 105, 0.15)' : type === 'error' ? 'rgba(225, 29, 72, 0.15)' : type === 'warning' ? 'rgba(217, 119, 6, 0.15)' : 'var(--border-accent)';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-info-circle';

    notification.className = 'notification-toast fade-in flex items-start gap-3';
    notification.style.cssText = `background: ${bgColor}; color: ${textColor}; border-color: ${borderColor};`;
    notification.innerHTML = `<i class="fas ${icon}"></i><span></span>`;
    notification.querySelector('span').textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
