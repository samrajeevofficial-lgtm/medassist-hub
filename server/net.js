// Network tuning for outgoing API calls (Gemini, OpenStreetMap, openFDA).
//
// Why: Node tries IPv6 and IPv4 addresses in turn, giving each only 250 ms to connect.
// On slower or high-latency networks every attempt can give up, and fetch fails with a timeout
// even though the site is reachable. Preferring IPv4 and allowing more time per attempt fixes this.
const dns = require('dns');
const net = require('net');

dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === 'function') {
    net.setDefaultAutoSelectFamilyAttemptTimeout(2000);
}

// fetch() with a timeout and a readable error message (fetch hides the real cause in err.cause).
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000, label = 'Request') {
    try {
        return await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(timeoutMs) });
    } catch (e) {
        throw new Error(describeFetchError(e, label, timeoutMs));
    }
}

function describeFetchError(e, label = 'Request', timeoutMs) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        return `${label} timed out${timeoutMs ? ` after ${Math.round(timeoutMs / 1000)}s` : ''}`;
    }
    const cause = e?.cause;
    const code = cause?.code || cause?.errors?.[0]?.code;
    const reasons = {
        ENOTFOUND: 'could not look up the server name (check your internet/DNS)',
        EAI_AGAIN: 'DNS lookup failed (check your internet connection)',
        ECONNREFUSED: 'connection refused',
        ECONNRESET: 'connection was reset',
        ETIMEDOUT: 'connection timed out (network or firewall is blocking it)',
        ENETUNREACH: 'network unreachable',
        UND_ERR_CONNECT_TIMEOUT: 'connection timed out',
        CERT_HAS_EXPIRED: 'SSL certificate problem',
        UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'SSL certificate problem (proxy or antivirus intercepting HTTPS?)',
    };
    return `${label} failed: ${reasons[code] || cause?.message || e?.message || 'unknown error'}${code ? ` [${code}]` : ''}`;
}

module.exports = { fetchWithTimeout, describeFetchError };
