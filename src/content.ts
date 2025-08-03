// --- File: src/content.js --- (MOVED HERE)
/*
 * This script is injected into every webpage the user visits.
 * It's responsible for creating and removing the block screen overlay.
 */
const OVERLAY_ID = "solid-time-limiter-overlay";

function createBlockScreen(site, limit) {
  // Don't create if it already exists
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.backgroundColor = "rgba(0, 0, 0, 0.95)";
  overlay.style.zIndex = "2147483647";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.color = "white";
  overlay.style.fontFamily = "sans-serif";

  const content = `
    <div style="text-align: center; padding: 40px; background: #222; border-radius: 10px;">
      <h1 style="font-size: 3em; margin: 0 0 20px 0;">Time's Up!</h1>
      <p style="font-size: 1.2em;">You've reached your daily limit of ${limit} minutes on <strong>${site}</strong>.</p>
      <button id="add-time-btn" style="margin-top: 30px; padding: 15px 30px; font-size: 1.2em; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 5px;">
        Add 5 More Minutes
      </button>
    </div>
  `;

  overlay.innerHTML = content;
  document.body.appendChild(overlay);

  document.getElementById("add-time-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "ADD_TIME", site: site });
  });
}

function removeBlockScreen() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.remove();
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "BLOCK_PAGE") {
    createBlockScreen(request.site, request.limit);
  } else if (request.action === "UNBLOCK_PAGE") {
    removeBlockScreen();
  }
});
