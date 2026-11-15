const dns = require('node:dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');

function isPrivateIpv4(address) {
    const octets = address.split('.').map(Number);

    return (
        octets[0] === 10 ||
        octets[0] === 127 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        octets[0] === 0
    );
}

function isPrivateIpv6(address) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
        const mappedIpv4 = normalized.replace('::ffff:', '');
        if (net.isIP(mappedIpv4) === 4) return isPrivateIpv4(mappedIpv4);
    }

    return normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe80:');
}

function isPrivateAddress(address) {
    const family = net.isIP(address);

    if (family === 4) return isPrivateIpv4(address);
    if (family === 6) return isPrivateIpv6(address);

    return false;
}

async function resolveSafeFetchTarget(targetUrl, { resolveHostname = dns.lookup } = {}) {
    const parsed = new URL(targetUrl);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only http and https URLs are allowed');
    }

    if (parsed.username || parsed.password) {
        throw new Error('URLs with embedded credentials are not allowed');
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        throw new Error('Fetch target must not point to localhost');
    }

    const directFamily = net.isIP(hostname);
    const addresses = directFamily
        ? [{ address: hostname, family: directFamily }]
        : await resolveHostname(hostname, { all: true });

    if (!addresses || addresses.length === 0) {
        throw new Error('Unable to resolve target hostname');
    }

    for (const record of addresses) {
        if (isPrivateAddress(record.address)) {
            throw new Error('Fetch target resolves to a private or loopback address');
        }
    }

    const firstAddress = addresses[0];
    const family = firstAddress.family || net.isIP(firstAddress.address);
    if (!family) {
        throw new Error('Unable to determine target address family');
    }

    return { parsed, address: firstAddress.address, family };
}

async function assertSafeFetchUrl(targetUrl, options = {}) {
    const { parsed } = await resolveSafeFetchTarget(targetUrl, options);
    return parsed;
}

function createPinnedLookup({ address, family }) {
    return (hostname, options, callback) => {
        const done = typeof options === 'function' ? options : callback;
        const lookupOptions = typeof options === 'function' ? {} : (options || {});

        if (lookupOptions.all) {
            done(null, [{ address, family }]);
            return;
        }

        done(null, address, family);
    };
}

function fetchWebsiteHtml(targetUrl, uaKey = 'pc', callback, fetchOptions = {}) {
    let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    if (uaKey === 'google') {
        userAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    } else if (uaKey === 'baidu') {
        // 使用官方 Baiduspider-render PC 端 UA
        userAgent = 'Mozilla/5.0 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)';
    } else if (uaKey === 'baidu-mobile') {
        // 使用官方 Baiduspider-render 移动端 UA
        userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)';
    } else if (uaKey === 'mobile') {
        userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
    }

    console.log(`[Fetcher] 启动抓取: ${targetUrl} | 身份标识: ${uaKey} | User-Agent: ${userAgent.substring(0, 50)}...`);

    const fetchUrlWithRedirects = async (currentUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
            return callback(new Error('Too many redirects'));
        }

        try {
            const safeTarget = await resolveSafeFetchTarget(currentUrl, fetchOptions);
            const currentParsed = safeTarget.parsed;
            const protocol = currentParsed.protocol === 'https:' ? https : http;

            const options = {
                hostname: currentParsed.hostname,
                port: currentParsed.port || undefined,
                path: currentParsed.pathname + (currentParsed.search || ''),
                method: 'GET',
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Connection': 'keep-alive'
                },
                lookup: createPinnedLookup(safeTarget),
                timeout: 60000
            };

            const request = protocol.request(options, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    const redirectUrl = new URL(response.headers.location, currentUrl).toString();
                    fetchUrlWithRedirects(redirectUrl, redirectCount + 1).catch((err) => callback(err));
                    return;
                }

                response.setEncoding('utf8');
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        callback(null, data);
                    } else {
                        callback(new Error(`Request failed with status ${response.statusCode}`));
                    }
                });
            });

            request.on('error', (err) => callback(err));
            request.on('timeout', () => {
                request.destroy();
                callback(new Error('Request timed out'));
            });
            request.end();

        } catch (e) {
            callback(e);
        }
    };

    fetchUrlWithRedirects(targetUrl).catch((err) => callback(err));
}

/**
 * 抓取 robots.txt 和 sitemap.xml
 * @param {string} targetUrl - 目标网站 URL
 * @returns {Promise<{robots: object, sitemap: object}>}
 */
async function fetchRobotsAndSitemap(targetUrl) {
    const parsed = new URL(targetUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;

    const result = {
        robots: { exists: false, content: null, disallowRules: [], sitemapUrl: null, error: null },
        sitemap: { exists: false, urlCount: 0, sampleUrls: [], error: null }
    };

    // Fetch robots.txt
    try {
        const robotsUrl = `${origin}/robots.txt`;
        const robotsContent = await fetchTextContent(robotsUrl, 5000);
        if (robotsContent) {
            result.robots.exists = true;
            result.robots.content = robotsContent.substring(0, 2000);

            // Parse disallow rules
            const disallowMatches = robotsContent.match(/^Disallow:\s*(.+)$/gim) || [];
            result.robots.disallowRules = disallowMatches.map(m => m.replace(/^Disallow:\s*/i, '').trim()).filter(Boolean);

            // Extract sitemap URL
            const sitemapMatch = robotsContent.match(/^Sitemap:\s*(.+)$/im);
            if (sitemapMatch) {
                result.robots.sitemapUrl = sitemapMatch[1].trim();
            }
        }
    } catch (e) {
        result.robots.error = e.message;
    }

    // Fetch sitemap.xml
    const sitemapUrl = result.robots.sitemapUrl || `${origin}/sitemap.xml`;
    try {
        const sitemapContent = await fetchTextContent(sitemapUrl, 10000);
        if (sitemapContent) {
            result.sitemap.exists = true;
            result.sitemap.url = sitemapUrl;

            // Count URLs in sitemap
            const urlMatches = sitemapContent.match(/<loc>([^<]+)<\/loc>/gi) || [];
            result.sitemap.urlCount = urlMatches.length;
            result.sitemap.sampleUrls = urlMatches.slice(0, 5).map(m =>
                m.replace(/<\/?loc>/gi, '').trim()
            );
        }
    } catch (e) {
        result.sitemap.error = e.message;
    }

    return result;
}

/**
 * 简单抓取文本内容（带超时）
 */
async function fetchTextContent(url, timeout = 5000, fetchOptions = {}) {
    const safeTarget = await resolveSafeFetchTarget(url, fetchOptions);
    const parsed = safeTarget.parsed;

    return new Promise((resolve, reject) => {
        const protocol = parsed.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || undefined,
            path: parsed.pathname + (parsed.search || ''),
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)' },
            lookup: createPinnedLookup(safeTarget),
            timeout
        };

        const req = protocol.request(options, (res) => {
            // Follow one redirect
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                fetchTextContent(redirectUrl, timeout, fetchOptions).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            } else {
                resolve(null);
            }
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
    });
}

module.exports = {
    fetchWebsiteHtml,
    assertSafeFetchUrl,
    fetchRobotsAndSitemap
};
