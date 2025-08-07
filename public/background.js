// Background script: tracks active tab usage per limited domain and informs content scripts to block when limit reached

const STORAGE_KEYS = {
    LIMITS: 'limits', // [{ domain: 'facebook.com', minutesPerDay: 10 }]
    USAGE: 'usage',   // { [dateKey]: { [domain]: milliseconds } }
    LAST_ACTIVE: 'lastActiveState', // persisted snapshot across SW restarts
};

const ONE_MINUTE_MS = 60 * 1000;

function getDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function domainMatches(hostname, limitedDomain) {
    if (!hostname || !limitedDomain) return false;
    if (hostname === limitedDomain) return true;
    return hostname.endsWith(`.${limitedDomain}`);
}

async function getLimits() {
    const { [STORAGE_KEYS.LIMITS]: limits } = await chrome.storage.sync.get(STORAGE_KEYS.LIMITS);
    return Array.isArray(limits) ? limits : [];
}

async function getUsage(dateKey) {
    const { [STORAGE_KEYS.USAGE]: usage } = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
    const all = usage && typeof usage === 'object' ? usage : {};
    return { all, today: all[dateKey] || {} };
}

async function saveUsage(dateKey, domain, addMs) {
    if (!domain || addMs <= 0) return;
    const { all, today } = await getUsage(dateKey);
    const current = today[domain] || 0;
    const updated = current + addMs;
    const updatedToday = { ...today, [domain]: updated };
    const updatedAll = { ...all, [dateKey]: updatedToday };
    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: updatedAll });
}

async function getLimitForDomain(hostname) {
    const limits = await getLimits();
    for (const item of limits) {
        if (!item || !item.domain || typeof item.minutesPerDay !== 'number') continue;
        if (domainMatches(hostname, item.domain)) {
            return { domain: item.domain, limitMs: Math.max(0, item.minutesPerDay) * ONE_MINUTE_MS };
        }
    }
    return null;
}

async function getUsageForDomainToday(hostname) {
    const limitInfo = await getLimitForDomain(hostname);
    if (!limitInfo) return { limitInfo: null, usedMs: 0 };
    const dateKey = getDateKey();
    const { today } = await getUsage(dateKey);
    const usedMs = today[limitInfo.domain] || 0;
    return { limitInfo, usedMs };
}

async function isBlocked(hostname) {
    const { limitInfo, usedMs } = await getUsageForDomainToday(hostname);
    if (!limitInfo) return { blocked: false, usedMs: 0, limitMs: 0 };
    return { blocked: usedMs >= limitInfo.limitMs, usedMs, limitMs: limitInfo.limitMs };
}

async function notifyTabBlockState(tabId, shouldBlock, remainingMs, limitMs) {
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: shouldBlock ? 'LW_BLOCK' : 'LW_UNBLOCK',
            payload: { remainingMs, limitMs },
        });
    } catch {
        // tab may not have content script yet or message failed; ignore
    }
}

// Active state kept in memory and persisted lightly to survive SW suspension
let activeState = {
    tabId: null,
    windowId: null,
    hostname: '',
    url: '',
    lastTickMs: Date.now(),
    windowFocused: true,
};

async function restoreActiveState() {
    try {
        const { [STORAGE_KEYS.LAST_ACTIVE]: saved } = await chrome.storage.local.get(STORAGE_KEYS.LAST_ACTIVE);
        if (saved && typeof saved === 'object') {
            activeState = { ...activeState, ...saved, lastTickMs: Date.now() };
        }
    } catch { }
}

async function persistActiveState() {
    const { tabId, windowId, hostname, url, windowFocused } = activeState;
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_ACTIVE]: { tabId, windowId, hostname, url, windowFocused } });
}

async function updateActiveFromTabId(tabId) {
    if (typeof tabId !== 'number') return;
    try {
        const tab = await chrome.tabs.get(tabId);
        const hostname = getHostname(tab.url || '');
        activeState.tabId = tab.id ?? null;
        activeState.windowId = tab.windowId ?? null;
        activeState.hostname = hostname;
        activeState.url = tab.url || '';
        activeState.lastTickMs = Date.now();
        await persistActiveState();
        await evaluateAndNotifyBlock(tab.id, hostname);
    } catch { }
}

async function evaluateAndNotifyBlock(tabId, hostname) {
    if (!tabId || !hostname) return;
    const { blocked, usedMs, limitMs } = await isBlocked(hostname);
    const remainingMs = Math.max(0, limitMs - usedMs);
    await notifyTabBlockState(tabId, blocked, remainingMs, limitMs);
}

async function applyDeltaIfActive() {
    const now = Date.now();
    const { tabId, hostname, lastTickMs, windowFocused } = activeState;
    if (!tabId || !hostname || !windowFocused) {
        activeState.lastTickMs = now;
        return;
    }

    const delta = now - (lastTickMs || now);
    activeState.lastTickMs = now;

    const limitInfo = await getLimitForDomain(hostname);
    if (!limitInfo) return; // not a limited domain

    const dateKey = getDateKey();
    await saveUsage(dateKey, limitInfo.domain, delta);

    const { blocked, usedMs, limitMs } = await isBlocked(hostname);
    const remainingMs = Math.max(0, limitMs - usedMs);
    await notifyTabBlockState(tabId, blocked, remainingMs, limitMs);
}

// Alarms tick every minute to account for time spent on the same page
async function ensureAlarm() {
    const alarmName = 'lw-tick';
    const existing = await chrome.alarms.get(alarmName);
    if (!existing) {
        await chrome.alarms.create(alarmName, { periodInMinutes: 1 });
    }
}

chrome.runtime.onInstalled.addListener(async () => {
    await ensureAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'lw-tick') return;
    await applyDeltaIfActive();
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await applyDeltaIfActive();
    await updateActiveFromTabId(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || (changeInfo.url && typeof changeInfo.url === 'string')) {
        if (activeState.tabId === tabId) {
            await applyDeltaIfActive();
        }
        const hostname = getHostname((changeInfo.url || tab.url) || '');
        if (hostname) {
            activeState.tabId = tabId;
            activeState.windowId = tab.windowId ?? null;
            activeState.hostname = hostname;
            activeState.url = (changeInfo.url || tab.url) || '';
            activeState.lastTickMs = Date.now();
            await persistActiveState();
            await evaluateAndNotifyBlock(tabId, hostname);
        }
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    activeState.windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
    await persistActiveState();
    await applyDeltaIfActive();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (activeState.tabId === tabId) {
        await applyDeltaIfActive();
        activeState.tabId = null;
        activeState.hostname = '';
        activeState.url = '';
        await persistActiveState();
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        if (!message || typeof message !== 'object') return;
        const { type, payload } = message;

        if (type === 'LW_GET_STATUS') {
            const url = payload?.url || '';
            const hostname = getHostname(url);
            const { blocked, usedMs, limitMs } = await isBlocked(hostname);
            sendResponse({ blocked, usedMs, limitMs, remainingMs: Math.max(0, limitMs - usedMs) });
            return;
        }

        if (type === 'LW_GET_LIMITS') {
            const limits = await getLimits();
            sendResponse({ limits });
            return;
        }

        if (type === 'LW_SET_LIMIT') {
            const item = payload?.item;
            if (!item || !item.domain || typeof item.minutesPerDay !== 'number') {
                sendResponse({ ok: false, error: 'Invalid limit' });
                return;
            }
            const existing = await getLimits();
            const filtered = existing.filter((l) => l.domain !== item.domain);
            const updated = [...filtered, { domain: item.domain, minutesPerDay: Math.max(0, item.minutesPerDay) }];
            await chrome.storage.sync.set({ [STORAGE_KEYS.LIMITS]: updated });
            sendResponse({ ok: true });
            return;
        }

        if (type === 'LW_REMOVE_LIMIT') {
            const domain = payload?.domain;
            const existing = await getLimits();
            const updated = existing.filter((l) => l.domain !== domain);
            await chrome.storage.sync.set({ [STORAGE_KEYS.LIMITS]: updated });
            sendResponse({ ok: true });
            return;
        }

        if (type === 'LW_GET_ALL_STATUS') {
            const dateKey = getDateKey();
            const limits = await getLimits();
            const { today } = await getUsage(dateKey);
            const items = limits.map((l) => {
                const limitMs = Math.max(0, l.minutesPerDay) * ONE_MINUTE_MS;
                const usedMs = today[l.domain] || 0;
                const remainingMs = Math.max(0, limitMs - usedMs);
                return { domain: l.domain, minutesPerDay: l.minutesPerDay, usedMs, limitMs, remainingMs };
            });
            sendResponse({ items });
            return;
        }
    })();
    // returning true keeps the sendResponse channel open for async
    return true;
});

// Attempt to restore when SW starts
restoreActiveState();
ensureAlarm();


