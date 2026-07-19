/**
 * 节点 IP 质量检测 · Surge 兼容适配器
 *
 * 原始检测逻辑：MaYIHEI/paperclip loon/ipquality/ipquality.js
 * 适配内容：
 *   1. Surge 模块参数 policy -> 目标节点或策略组
 *   2. Loon $httpClient 的 node -> Surge policy
 *   3. Loon htmlMessage -> Surge 纯文本结果页
 *   4. Loon 通知 openUrl -> Surge open-url action
 *
 * 上游脚本会在每次运行时读取。关键代码锚点发生变化时，本适配器会停止运行并提示，
 * 避免上游更新后悄悄绕过指定策略、误报当前默认出口。
 */

const ADAPTER_VERSION = "2026-07-19.s4";
const UPSTREAM_URL = "https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/loon/ipquality/ipquality.js";
const options = parseArguments(typeof $argument === "string" ? $argument : "");
const maskIP = readBoolean(options.mask, false);
const mediaTest = readBoolean(options.media, true);
const mapNotification = readBoolean(options.map, false);
const targetPolicy = clean(options.policy) || "PROXY";
const displayPolicy = targetPolicy;

console.log(`[INFO] Surge IPQuality adapter ${ADAPTER_VERSION}`);
console.log(`[INFO] 目标策略: ${displayPolicy}`);
loadUpstream();

function loadUpstream() {
    $httpClient.get({
        url: UPSTREAM_URL,
        policy: targetPolicy,
        timeout: 10,
        headers: {
            Accept: "text/plain,*/*",
            "User-Agent": "Surge-IPQuality-Adapter/1.0",
        },
    }, (error, response, body) => {
        if (error) {
            finish(`无法下载上游检测脚本：${String(error)}`);
            return;
        }
        const status = Number(response && (response.status || response.statusCode));
        if (!Number.isFinite(status) || status < 200 || status >= 300 || !body) {
            finish(`上游检测脚本响应异常：HTTP ${status || "?"}`);
            return;
        }

        try {
            const adapted = adaptSource(String(body));
            // 间接 eval 保持上游脚本为独立顶层作用域，同时可使用 Surge 提供的全局 API。
            (0, eval)(adapted);
        } catch (caught) {
            finish(`Surge 适配失败：${errorMessage(caught)}`);
        }
    });
}

function adaptSource(source) {
    const requiredAnchors = [
        'const nodeName = params.node || "";',
        "node: cleanValue(config.node) || nodeName,",
        "htmlMessage: html,",
    ];
    const missing = requiredAnchors.filter((anchor) => source.indexOf(anchor) < 0);
    if (missing.length) {
        throw new Error("上游脚本结构已更新，请升级适配器");
    }

    let result = source;
    result = result.replace(
        'const nodeName = params.node || "";',
        `const nodeName = ${JSON.stringify(displayPolicy)};`
    );
    result = result.replace(
        'const maskIP = readSwitch("MaskIP", false);',
        `const maskIP = ${maskIP};`
    );
    result = result.replace(
        'const mediaEnabled = readSwitch("MediaTest", true);',
        `const mediaEnabled = ${mediaTest};`
    );
    result = result.replace(
        'const mapNotificationEnabled = readSwitch("MapNotification", false);',
        `const mapNotificationEnabled = ${mapNotification};`
    );
    result = result.replace(
        "node: cleanValue(config.node) || nodeName,",
        `policy: cleanValue(config.node) || ${JSON.stringify(targetPolicy)},`
    );
    result = result.replace(
        'if (backendRequest) requestOptions.alpn = "h2";',
        ""
    );
    result = result.replace(
        "{ openUrl: basic.map }",
        '{ action: "open-url", url: basic.map }'
    );
    result = result.replace('source: "Loon",', 'source: "Surge",');
    result = result.replace(
        "Loon 不提供节点 TCP/DNS API",
        "Surge 通用脚本不提供节点 TCP/DNS API"
    );
    result = result.replace(
        'title: "\\u200B",',
        'title: "节点 IP 质量检测",'
    );
    result = result.replace(
        "htmlMessage: html,",
        "content: surgeHtmlToText(html),"
    );

    return `${surgeHelpersSource()}\n${result}`;
}

function surgeHelpersSource() {
    return String.raw`
function surgeHtmlToText(value) {
    return String(value || "")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<\/(?:div|p|section|li|h[1-6])\s*>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
`;
}

function parseArguments(text) {
    const result = {};
    String(text || "").split("&").forEach((part) => {
        if (!part) return;
        const index = part.indexOf("=");
        const rawKey = index >= 0 ? part.slice(0, index) : part;
        const rawValue = index >= 0 ? part.slice(index + 1) : "";
        result[safeDecode(rawKey)] = safeDecode(rawValue);
    });
    return result;
}

function safeDecode(value) {
    try {
        return decodeURIComponent(String(value).replace(/\+/g, "%20"));
    } catch (_) {
        return String(value);
    }
}

function readBoolean(value, fallback) {
    const normalized = clean(value).toLowerCase();
    if (!normalized) return fallback;
    if (["true", "1", "yes", "on"].indexOf(normalized) >= 0) return true;
    if (["false", "0", "no", "off"].indexOf(normalized) >= 0) return false;
    return fallback;
}

function clean(value) {
    return value === null || typeof value === "undefined" ? "" : String(value).trim();
}

function errorMessage(error) {
    return error && error.message ? String(error.message) : String(error);
}

function finish(message) {
    $done({
        title: "节点 IP 质量检测",
        content: message,
        icon: "network.slash",
    });
}
