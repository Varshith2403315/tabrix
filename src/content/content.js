// src/content/content.js
console.log("Content script loaded ✅");

// Heuristically find the main content block for better summarization
function getMainContentText() {
    
    // 1. Prioritize standard article container elements
    const article = document.querySelector('main, article, [role="main"], #content, .content-main, .post');
    if (article) {
        return article.innerText;
    }

    // 2. Fallback: Find the element that contains the most text
    let maxTextLength = 0;
    let mainText = document.body.innerText;

    document.querySelectorAll('div, p, section').forEach(el => {
        const text = el.innerText;
        // Check for displayed elements with high text density
        if (el.offsetParent !== null && text.length > maxTextLength * 1.5) { 
            maxTextLength = text.length;
            mainText = text;
        }
    });
    
    // Clean up excessive whitespace/newlines
    return mainText.replace(/(\n\s*){3,}/g, '\n\n').trim();
}

// Function to extract page info and send to background
function extractPageData() {
    const pageData = {
        title: document.title || "",
        url: window.location.href || "",
        bodyText: getMainContentText(), // Use the robust content extractor
    };
    return pageData;
}

// Send extracted data to background service worker for AI processing
chrome.runtime.sendMessage({
    type: "PAGE_CONTENT",
    data: extractPageData()
});

// --- 🔁 Duplicate Notifier UI with Debug Logs ---
console.log("[DuplicateNotifier] Content script loaded on:", window.location.href);

function showDuplicatePopup(existingTabId, windowId) {
  console.log("[DuplicateNotifier] Showing popup for duplicate:", existingTabId);

  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.top = "30px";
  popup.style.right = "30px";
  popup.style.background = "#CD2C58";
  popup.style.color = "#fff";
  popup.style.fontSize = "15px";
  popup.style.padding = "14px 18px";
  popup.style.borderRadius = "10px";
  popup.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
  popup.style.display = "flex";
  popup.style.alignItems = "center";
  popup.style.gap = "8px";
  popup.style.zIndex = "999999";


  popup.innerHTML = `
    <span>🔁This page is already open</span>
    <button style="
      background-color:#3b82f6;
      border:none;
      color:white;
      padding:3px 8px;
      border-radius:4px;
      cursor:pointer;
    ">Go</button>
  `;

    const button = popup.querySelector("button");
  button.addEventListener("click", () => {
    console.log("[DuplicateNotifier] 'Go' button clicked → focusing tab:", existingTabId);

    // Give background service worker a tiny delay to wake up properly
    setTimeout(() => {
      chrome.runtime.sendMessage(
        {
          type: "FOCUS_EXISTING_TAB",
          tabId: existingTabId,
          windowId,
        },
        (response) => {
          console.log("[DuplicateNotifier] Background responded:", response);
        }
      );
    }, 100); // small delay (100ms) improves reliability

    popup.remove();
  });


  document.body.appendChild(popup);
  setTimeout(() => {
    console.log("[DuplicateNotifier] Popup auto-removed");
    popup.remove();
  }, 10000);
}

chrome.runtime.onMessage.addListener((msg) => {
  console.log("[DuplicateNotifier] Message received:", msg);

  if (msg.type === "DUPLICATE_TAB_FOUND") {
    showDuplicatePopup(msg.existingTabId, msg.windowId);
  }
});
 