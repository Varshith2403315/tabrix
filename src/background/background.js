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
  if (!tabId) {
    console.warn("⚠️ processTabContent called without tabId:", content);
    return;
  }

  // Ensure store is ready (handles background reloads)
  if (!tabsStore || typeof tabsStore !== "object") {
    console.warn("⚠️ tabsStore was undefined — loading from storage...");
    tabsStore = (await loadTabs()) || {};
  }

  // Ensure record exists before writing
  if (!tabsStore[tabId]) {
    console.log(`[AI Pipeline] 🆕 Creating record for tab ${tabId}`);
    tabsStore[tabId] = {
      tabId,
      url: content?.url || "",
      title: content?.title || "",
      rawText: content?.bodyText || "",
      tabNote: "",
      tags: [],
      lastUpdated: Date.now(),
      clusterId: null,
      totalTime: 0,
    };
  }

  if (!content?.bodyText) {
    console.log(`[AI Pipeline] ⚪ Skipping empty content for tab ${tabId}`);
    return;
  }

  try {
    // Step 1: Generate summary first (show immediately)
    const note = await generateTabNote(content.bodyText);

    // Update UI right away with the summary
    Object.assign(tabsStore[tabId], {
      tabNote: note,
      lastUpdated: Date.now(),
    });
    await saveTabs(tabsStore);
    chrome.runtime.sendMessage({ 
      type: "UPDATE_SMART_TAGS", 
      data: { tabId, tabNote: note } 
    }, suppressAsyncError());
    console.log(`[AI Pipeline] 🟢 Summary ready for tab ${tabId}, generating tags in background...`);

    // Step 2: Generate tags asynchronously (non-blocking)
    generateSmartTags(note).then(async (tags) => {
      if (!tabsStore[tabId]) return;
      tabsStore[tabId].tags = tags;
      tabsStore[tabId].lastUpdated = Date.now();
      await saveTabs(tabsStore);
      chrome.runtime.sendMessage({
        type: "UPDATE_SMART_TAGS",
        data: { tabId, tags }
      }, suppressAsyncError());
      console.log(`[AI Pipeline] 🏷️ Tags ready for tab ${tabId}`);
    }).catch(err => console.error(`[AI Pipeline] ⚠️ Tag generation failed for tab ${tabId}:`, err));


    // 🔒 Reconfirm existence (prevents "undefined" during race)
    if (!tabsStore[tabId]) {
      console.warn(`[AI Pipeline] Tab ${tabId} record vanished mid-process, recreating...`);
      tabsStore[tabId] = {};
    }

    Object.assign(tabsStore[tabId], {
      tabNote: note,
      tags,
      lastUpdated: Date.now(),
    });

    await saveTabs(tabsStore);

    const updated = {
      tabId,
      url: tabsStore[tabId].url,
      title: tabsStore[tabId].title,
      tabNote: tabsStore[tabId].tabNote,
      tags: tabsStore[tabId].tags,
      lastUpdated: tabsStore[tabId].lastUpdated,
    };

    chrome.runtime.sendMessage({ type: "UPDATE_SMART_TAGS", data: updated }, suppressAsyncError());
    console.log(`[AI Pipeline] ✅ Completed update for tab ${tabId}`);
  } catch (err) {
    console.error(`[AI Pipeline] ❌ Error for tab ${tabId}:`, err);
  }
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
  if (message.type === "PING") {
    console.log("📶 Received PING from content script");
    sendResponse({ alive: true });
    return true; // keep message channel alive
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

  else if (message.type === "FOCUS_EXISTING_TAB") {
  const { tabId, windowId } = message;
  console.log(`[DuplicateNotifier] 🪄 Focusing existing tab ${tabId} in window ${windowId}`);

  // If windowId is missing, try to fetch it dynamically
  if (!windowId) {
    chrome.tabs.get(tabId, (tabInfo) => {
      if (chrome.runtime.lastError || !tabInfo) {
        console.error("[DuplicateNotifier] Could not get tab info:", chrome.runtime.lastError?.message);
        return;
      }
      const actualWindowId = tabInfo.windowId;
      console.log(`[DuplicateNotifier] 🪄 Found windowId dynamically: ${actualWindowId}`);
      focusTab(actualWindowId, tabId);
    });
  } else {
    focusTab(windowId, tabId);
  }

  function focusTab(winId, tId) {
    // Bring window to front first
    chrome.windows.update(winId, { focused: true }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[DuplicateNotifier] Could not focus window:", chrome.runtime.lastError.message);
      }

      // Then focus tab
      chrome.tabs.update(tId, { active: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("[DuplicateNotifier] ❌ Focus failed:", chrome.runtime.lastError.message);
        } else {
          console.log(`[DuplicateNotifier] ✅ Successfully focused tab ${tId}`);
        }
      });
    });
  }

  return true; // Keep listener alive
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

//Liveupdated duplicate notifier

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url !== "chrome://newtab/") {
    console.log(`[DuplicateNotifier] Tab updated → ${tab.url}`);

    chrome.tabs.query({}, (tabs) => {
      const duplicates = tabs.filter(
        (t) => t.id !== tabId && t.url === tab.url
      );

      if (duplicates.length > 0) {
        const existingTab = duplicates[0];
        console.log(`[DuplicateNotifier] 🚨 Duplicate detected after navigation: ${tab.url}`);

        chrome.tabs.sendMessage(tab.id, {
          type: "DUPLICATE_TAB_FOUND",
          existingTabId: existingTab.id,
          existingWindowId: existingTab.windowId,
          url: tab.url,
        });
      }
    });
  }
});
// background.js (append near bottom)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // inside chrome.runtime.onMessage listener in background.js
if (msg.type === "CREATE_STICKY_NOTE") {
  chrome.storage.local.get("stickyNotes", ({ stickyNotes = {} }) => {
    const url = sender?.tab?.url || (msg.note && msg.note.url) || "";
    if (!stickyNotes[url]) stickyNotes[url] = [];

    // ensure note has id
    if (!msg.note.id) msg.note.id = Date.now();

    const idx = stickyNotes[url].findIndex(n => n.id === msg.note.id);
    if (idx >= 0) {
      // update existing
      stickyNotes[url][idx] = msg.note;
    } else {
      stickyNotes[url].push(msg.note);
    }

    chrome.storage.local.set({ stickyNotes }, () => {
      sendResponse({ success: true });
    });
  });
  return true; // keep sendResponse alive
}

// --- DELETE Sticky Note Handler ---
else if (msg.type === "DELETE_STICKY_NOTE") {
  chrome.storage.local.get("stickyNotes", ({ stickyNotes = {} }) => {
    const url = msg.url;
    if (!stickyNotes[url]) return sendResponse({ success: false });

    stickyNotes[url] = stickyNotes[url].filter(n => n.id !== msg.id);
    chrome.storage.local.set({ stickyNotes }, () => sendResponse({ success: true }));
  });
  return true;
}

  if (msg.type === "GET_STICKY_NOTES") {
    chrome.storage.local.get("stickyNotes", ({ stickyNotes = {} }) => {
      sendResponse(stickyNotes[msg.url] || []);
    });
    return true;
  }

});

// --- Keep-Alive Mechanism ---

function setupKeepAlive() {
  chrome.alarms.create("keepAliveAlarm", { periodInMinutes: 4 });
  console.log("⏰ KeepAlive alarm initialized");
}

chrome.runtime.onInstalled.addListener(setupKeepAlive);
chrome.runtime.onStartup.addListener(setupKeepAlive);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAliveAlarm") {
    console.log("🔄 KeepAlive alarm ping");
    chrome.storage.local.set({ lastKeepAlive: Date.now() });
  }
});
