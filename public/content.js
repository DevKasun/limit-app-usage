// Content script: injects/removes blocking overlay based on messages from the background

const OVERLAY_ID = 'lw-block-overlay';

function createOrUpdateOverlay(message) {
    const existing = document.getElementById(OVERLAY_ID);
    const remainingMs = message?.payload?.remainingMs ?? 0;
    const limitMs = message?.payload?.limitMs ?? 0;
    const minutes = Math.floor(limitMs / 60000);

    if (existing) return existing;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.background = 'black';
    overlay.style.color = 'red';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontSize = '28px';
    overlay.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    overlay.style.textAlign = 'center';
    overlay.textContent = `Time limit reached for this site (${minutes} min/day).`;

    document.documentElement.appendChild(overlay);
    return overlay;
}

function removeOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}

async function requestStatus() {
    try {
        const res = await chrome.runtime.sendMessage({
            type: 'LW_GET_STATUS',
            payload: { url: location.href },
        });
        if (!res) return;
        if (res.blocked) {
            createOrUpdateOverlay({ payload: { remainingMs: res.remainingMs, limitMs: res.limitMs } });
        } else {
            removeOverlay();
        }
    } catch { }
}

chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'LW_BLOCK') {
        createOrUpdateOverlay(message);
        return;
    }
    if (message.type === 'LW_UNBLOCK') {
        removeOverlay();
    }
});

// Initial check on load
requestStatus();


