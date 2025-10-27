// --- background.js ---
import { loadTabs, saveTabs } from '../utils/storage.js';
import {
  initAI,
  generateTabNote,
  generateSmartTags,
  unifiedMemorySearch,
  getModelStatus,
  createAndMonitorSummarizer,
  clusterTabsByTags
} from '../utils/aiClient.js';


console.log("✅ Background service worker loaded and initialized.");

let tabsStore = {};
let isAiReady = false;

// --- Suppression Helper ---
function suppressAsyncError() {
  return () => {
    if (chrome.runtime.lastError) {
      const errorMsg = chrome.runtime.lastError.message;
      if (!errorMsg.includes("Receiving end does not exist")) {
        console.error("Unexpected Message Send Error:", errorMsg);
      }
    }
  };
}

// --- Inject content scripts into all tabs ---
function injectScriptsIntoExistingTabs() {
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        console.log(`Manually injecting content script into existing tab ID: ${tab.id}`);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content.js']
        }).catch(err => {
          if (!err.message.includes("Cannot access contents") && !err.message.includes("The message port closed")) {
            console.error(`Error injecting into existing tab ${tab.id}:`, err);
          }
        });
      }
    });
  });
}

// --- Initialization ---
async function initialize() {
  tabsStore = await loadTabs();
  isAiReady = await initAI();
  injectScriptsIntoExistingTabs();
  console.log(` Loaded ${Object.keys(tabsStore).length} tabs from storage. AI ready: ${isAiReady}`);
}
initialize();

// --- AI Pipeline ---
async function processTabContent(tabId, content) {
  if (!tabsStore[tabId] || !content.bodyText) return;

  const note = await generateTabNote(content.bodyText);
  const tags = await generateSmartTags(note);

  tabsStore[tabId].tabNote = note;
  tabsStore[tabId].tags = tags;
  tabsStore[tabId].lastUpdated = Date.now();
  saveTabs(tabsStore);
   // Notify UI that tab data changed (existing)
  chrome.runtime.sendMessage({ type: 'DATA_UPDATED' }, suppressAsyncError());
   //  NEW: Send the updated tab entry to the side panel so it can update Smart Tags view
  const updatedTabEntry = {
  tabId,
  url: tabsStore[tabId].url,
  title: tabsStore[tabId].title,
  tabNote: tabsStore[tabId].tabNote,
  tags: tabsStore[tabId].tags,
  lastUpdated: tabsStore[tabId].lastUpdated
  };
  chrome.runtime.sendMessage(
    { type: 'UPDATE_SMART_TAGS', data: updatedTabEntry },
    suppressAsyncError()
  );

}

// --- Tab Lifecycle Management ---
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabsStore[tabId]) {
    delete tabsStore[tabId];
    saveTabs(tabsStore);
    chrome.runtime.sendMessage({ type: 'DATA_UPDATED' }, suppressAsyncError());
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const isWebPage = tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));
  if (isWebPage && (changeInfo.status === 'complete' || changeInfo.url)) {
    console.log(`Injecting script into tab ${tabId} due to navigation.`);
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['src/content/content.js']
    }).catch(err => {
      if (!err.message.includes("Cannot access contents")) {
        console.error(`Error injecting into tab ${tabId}:`, err);
      }
    });
  }
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id || message.tabId;

  if (message.type === 'AI_COMPUTATION_START') {
    console.log("Resetting Service Worker idle timer for AI computation...");
    return false;
  }

  if (message.type === "PAGE_CONTENT" && tabId) {
    tabsStore[tabId] = tabsStore[tabId] || {
      tabId,
      url: message.data.url,
      title: message.data.title,
      rawText: message.data.bodyText,
      tabNote: "Generating...",
      tags: [],
      lastUpdated: Date.now(),
      clusterId: null,
      totalTime: 0
    };

    processTabContent(tabId, message.data)
      .then(() => {
        if (tabsStore[tabId]?.tabNote) {
          const summaryPreview = tabsStore[tabId].tabNote.substring(0, 100) + "...";
          const tagsList = tabsStore[tabId].tags.join(", ");
          console.log(` Tab ${tabId} Summary Complete: "${summaryPreview}"`);
          console.log(` Tags Generated: [${tagsList}]`);
        }
      })
      .catch(err => console.error(` Error during pipeline for tab ${tabId}:`, err));

  } else if (message.type === "REQUEST_TABS_DATA") {
    const tabList = Object.values(tabsStore).sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
    sendResponse(tabList);
    return true;

  } else if (message.type === "REQUEST_MODEL_STATUS") {
    sendResponse(getModelStatus());
    return true;

  } else if (message.type === "TRIGGER_MODEL_DOWNLOAD") {
    async function handleDownload() {
      const callback = (status) => { chrome.runtime.sendMessage(status); };
      const success = await createAndMonitorSummarizer(callback);
      if (success) {
        isAiReady = true;
        for (const id in tabsStore) {
          const tabIdInt = parseInt(id);
          if (tabsStore[id].rawText) {
            processTabContent(tabIdInt, { bodyText: tabsStore[id].rawText });
          }
        }
      }
      sendResponse({ success });
    }
    handleDownload();
    return true;

  } else if (message.type === "MEMORY_SEARCH_QUERY") {
  const userQuery = (message.query || '').trim();
  console.log("MEMORY_SEARCH_QUERY received:", userQuery);

  if (!userQuery) {
    sendResponse({ results: [] });
    return true;
  }

  (async () => {
    try {
      const tabsArray = Object.values(tabsStore);
      const results = await unifiedMemorySearch(userQuery, tabsArray);

      if (results?.length) {
        console.log("Unified Memory Search results:", results);
        chrome.runtime.sendMessage({
          type: "AI_MEMORY_RESULTS",
          results
        });
      } else {
        console.log("⚠️ No matching tabs found for:", userQuery);
      }

      sendResponse({ results });
    } catch (err) {
      console.error("Unified Memory Search failed:", err);
      sendResponse({ results: [] });
    }
  })();

  return true; // keep async alive
}



  // --- 🔹 Side Panel Management ---
  else if (message.type === 'OPEN_SIDE_PANEL') {
    const targetTabId = message.tabId;
    const FEATURE_KEY = 'activeSidePanelFeature';

    if (chrome.sidePanel && targetTabId) {
      chrome.storage.local.set({ [FEATURE_KEY]: message.feature }, () => {
        if (chrome.runtime.lastError) {
          console.error("Side Panel storage error:", chrome.runtime.lastError);
          return;
        }

        chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
        chrome.sidePanel.open({ tabId: targetTabId }, (opened) => {
          if (chrome.runtime.lastError) {
            console.error("Side Panel open error:", chrome.runtime.lastError);
            return;
          }
          console.log("✅ Side Panel opened successfully for tab", targetTabId);
          sendResponse({ success: true });
        });
      });
    } else {
      sendResponse({ success: false, error: 'Side Panel API or Tab ID unavailable' });
    }
    return true;
  }

  // --- 🔹 Feature Toggle ---
  else if (message.type === 'TOGGLE_FEATURE') {
    console.log(`Feature Toggled: ${message.feature} is now ${message.state}`);
  }
    // --- 🔹 Focus existing duplicate tab ---
  else if (message.type === "FOCUS_EXISTING_TAB") {
    const { tabId, windowId } = message;
    console.log(`[DuplicateNotifier] 🪄 Focusing existing tab ${tabId} in window ${windowId}`);

    // First, bring the window to the front
    chrome.windows.update(windowId, { focused: true }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[DuplicateNotifier] Could not focus window:", chrome.runtime.lastError.message);
      }

      // Then, activate the existing tab
      chrome.tabs.update(tabId, { active: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("[DuplicateNotifier] Failed to activate tab:", chrome.runtime.lastError.message);
        } else {
          console.log(`[DuplicateNotifier] ✅ Successfully focused tab ${tabId}`);
        }
      });
    });
  }

});

// --- Duplicate Tab Notifier with Debug Logs ---
console.log("[DuplicateNotifier] Background script loaded");

chrome.tabs.onCreated.addListener(async (newTab) => {
  console.log("[DuplicateNotifier] New tab created:", newTab.id, newTab.url);

  try {
    setTimeout(async () => {
      console.log("[DuplicateNotifier] Checking duplicates for:", newTab.id, newTab.url);
      if (!newTab.url) {
        console.log("[DuplicateNotifier] New tab has no URL yet, skipping...");
        return;
      }

      const allTabs = await chrome.tabs.query({});
      const duplicate = allTabs.find(
        (t) => t.id !== newTab.id && t.url === newTab.url
      );

      if (duplicate) {
        console.log(`[DuplicateNotifier] ⚠️ Duplicate found for ${newTab.url}`);
        console.log("Existing tab:", duplicate.id, "Window:", duplicate.windowId);

        //Safer: check if content script is alive
        chrome.tabs.sendMessage(
          newTab.id,
          {
            type: "DUPLICATE_TAB_FOUND",
            existingTabId: duplicate.id,
            windowId: duplicate.windowId,
            url: duplicate.url,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[DuplicateNotifier] No content script found. Injecting manually..."
              );
              chrome.scripting.executeScript({
                target: { tabId: newTab.id },
                files: ["src/content/content.js"],
              }, () => {
                console.log("[DuplicateNotifier] Re-trying message after injection");
                chrome.tabs.sendMessage(newTab.id, {
                  type: "DUPLICATE_TAB_FOUND",
                  existingTabId: duplicate.id,
                  windowId: duplicate.windowId,
                  url: duplicate.url,
                });
              });
            } else {
              console.log("[DuplicateNotifier] Message delivered successfully ");
            }
          }
        );
      } else {
        console.log("[DuplicateNotifier]  No duplicates found for:", newTab.url);
      }
    }, 1000); // little longer delay to let content script load
  } catch (err) {
    console.error("[DuplicateNotifier] Error checking duplicates:", err);
  }
});
