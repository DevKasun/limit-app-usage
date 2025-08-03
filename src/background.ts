/*
 * This is the service worker. It runs in the background and acts as the brain
 * of the extension. It tracks time, manages data, and communicates with
 * content scripts.
 */
const CHECK_INTERVAL_ALARM = "checkIntervalAlarm";

// --- Data Management ---
async function getStoredData() {
  const data = await chrome.storage.local.get("trackedSites");
  return data.trackedSites || {};
}

async function setStoredData(data) {
  await chrome.storage.local.set({ trackedSites: data });
}

// --- Time Tracking Logic ---
async function checkTime() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab || !activeTab.url || !activeTab.url.startsWith("http")) return;

  const trackedSites = await getStoredData();
  const url = new URL(activeTab.url);
  const siteData = trackedSites[url.hostname];

  if (!siteData) return;

  const today = new Date().toISOString().split("T")[0];

  // Reset daily time if it's a new day
  if (siteData.lastCheck !== today) {
    siteData.timeSpentToday = 0;
    siteData.overrideToday = 0;
    siteData.lastCheck = today;
  }

  // Increment time spent
  siteData.timeSpentToday += 1; // Incrementing by 1 minute (since alarm is every minute)

  // Check if limit is exceeded
  const totalLimit = siteData.dailyLimit + siteData.overrideToday;
  if (siteData.timeSpentToday > totalLimit) {
    // Send message to content script to block the page
    try {
      await chrome.tabs.sendMessage(activeTab.id, {
        action: "BLOCK_PAGE",
        site: url.hostname,
        limit: siteData.dailyLimit,
      });
    } catch (error) {
      console.log(
        `Could not send message to tab ${activeTab.id}. It might be a chrome:// page or closed.`,
      );
    }
  }

  await setStoredData(trackedSites);
}

// --- Event Listeners ---

// Create an alarm that fires every minute to check the time
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(CHECK_INTERVAL_ALARM, {
    periodInMinutes: 1,
  });
  // Initialize storage on first install
  chrome.storage.local.get("trackedSites", (data) => {
    if (!data.trackedSites) {
      chrome.storage.local.set({ trackedSites: {} });
    }
  });
});

// Listener for the alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CHECK_INTERVAL_ALARM) {
    // Check if the user is idle. If so, don't track time.
    const state = await chrome.idle.queryState(60); // 60 seconds of inactivity
    if (state === "active") {
      checkTime();
    }
  }
});

// Listener for messages from content scripts (for overrides)
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "ADD_TIME") {
    const trackedSites = await getStoredData();
    const siteData = trackedSites[request.site];
    if (siteData) {
      siteData.overrideToday += 5; // Add 5 minutes
      await setStoredData(trackedSites);

      // Unblock the page
      if (sender.tab && sender.tab.id) {
        try {
          await chrome.tabs.sendMessage(sender.tab.id, {
            action: "UNBLOCK_PAGE",
          });
        } catch (e) {
          console.error("Failed to unblock page:", e);
        }
      }
      sendResponse({ success: true });
    }
  }
  return true; // Indicates that the response is sent asynchronously
});
