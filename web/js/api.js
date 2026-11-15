/**
 * SEO 工具 - API 请求模块 (已加固)
 */


window.API_BASE = '/api';
const API_BASE = window.API_BASE;

// 1. 获取网站 HTML
async function fetchWebsiteHtml(url, ua = 'pc') {
    try {
        const proxyUrl = `${API_BASE}/fetch-html?url=${encodeURIComponent(url)}&ua=${encodeURIComponent(ua)}`;
        const response = await fetch(proxyUrl, {
            credentials: 'include'
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `获取失败: ${response.status}`);
        }
        const data = await response.json();
        return data.contents;
    } catch (error) {
        console.error('fetchWebsiteHtml Error:', error);
        throw error;
    }
}

// 2. 调用后端进行 SEO 分析 (Prompt 逻辑已移至后端)
async function analyzeWithDeepSeek(htmlContent, url) {
    try {
        const response = await fetch(`${API_BASE}/deepseek`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                htmlContent: htmlContent,
                url: url
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `分析请求失败: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('analyzeWithDeepSeek Error:', error);
        throw error;
    }
}

// 3. 保存到数据库
async function saveToDatabase(data, url, stats, score, userAgent = 'pc') {
    try {
        const response = await fetch(`${API_BASE}/save-report`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, score, stats, data, userAgent })
        });
        if (!response.ok) throw new Error('Failed to save to database');
        return await response.json();
    } catch (e) {
        console.error('Database Save Error:', e);
        throw e;
    }
}

// 4. 从数据库获取最新报告
async function getLatestReport() {
    try {
        const response = await fetch(`${API_BASE}/get-latest-report`, {
            credentials: 'include'
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error('Database Load Error:', e);
        return null;
    }
}

// 5. 获取历史记录
async function getHistoryReports(limit = 20, offset = 0, userId = null) {
    try {
        let url = `${API_BASE}/get-history?limit=${limit}&offset=${offset}`;
        if (userId) {
            url += `&userId=${userId}`;
        }
        const response = await fetch(url, {
            credentials: 'include'
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (e) {
        console.error('History Load Error:', e);
        return [];
    }
}

// 6. 获取特定报告
async function getReportById(id) {
    try {
        const response = await fetch(`${API_BASE}/get-report?id=${id}`, {
            credentials: 'include'
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error('Report Load Error:', e);
        return null;
    }
}

// 7. 创建 Agent 分析任务
async function createAgentJob({ url, userAgent = 'pc', analysisTypes = ['seo', 'geo'], aiProvider = 'deepseek' }) {
    const response = await fetch(`${API_BASE}/agent/jobs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, userAgent, analysisTypes, aiProvider })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `创建 Agent 任务失败: ${response.status}`);
    }

    return response.json();
}

// 8. 获取 Agent 分析任务状态
async function getAgentJob(jobId) {
    const response = await fetch(`${API_BASE}/agent/jobs/${encodeURIComponent(jobId)}`, {
        credentials: 'include'
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `获取 Agent 任务失败: ${response.status}`);
    }

    return response.json();
}
