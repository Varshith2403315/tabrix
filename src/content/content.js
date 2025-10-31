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
    chrome.storage.sync.get("featureToggles", (res) => {
      if (res.featureToggles?.duplicateNotifier === false) {
        console.log("[DuplicateNotifier] Disabled via toggle, skipping popup.");
        return;
      }
      showDuplicatePopup(msg.existingTabId, msg.windowId);
    });
  }
});

// content.js — Sticky notes (replacement block)
window.activeNotes = window.activeNotes || [];
const activeNotes = window.activeNotes;

// Helper: safely read the stickyNotes toggle (returns Promise<boolean>)
function isStickyEnabled() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("featureToggles", (res) => {
      // default ON if unset
      const enabled = res.featureToggles?.stickyNotes;
      resolve(enabled === undefined ? true : !!enabled);
    });
  });
}

// Render function kept mostly as-is (I reused your renderNote but kept it self-contained)
function renderNote(note) {
  // create container
  const div = document.createElement("div");
  div.className = "ai-tabrix-sticky";
  div.style.position = "absolute";
  div.style.left = (note.x ?? 100) + "px";
  div.style.top = (note.y ?? 100) + "px";
  div.style.background = "#fff8b3";
  div.style.padding = "8px 10px";
  div.style.borderRadius = "8px";
  div.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
  div.style.zIndex = 999999;
  div.style.minWidth = "120px";
  div.style.minHeight = "60px";
  div.style.overflow = "hidden";
  div.style.display = "inline-block";
  div.style.cursor = "default";

  // header (holds delete button)
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "flex-end";
  header.style.alignItems = "center";
  header.style.marginBottom = "4px";
  header.style.pointerEvents = "none";

  const delBtn = document.createElement("button");
  delBtn.textContent = "×";
  delBtn.title = "Delete note";
  delBtn.style.pointerEvents = "auto";
  delBtn.style.border = "none";
  delBtn.style.background = "transparent";
  delBtn.style.cursor = "pointer";
  delBtn.style.fontSize = "16px";
  delBtn.style.color = "#444";
  delBtn.style.fontWeight = "700";
  delBtn.style.lineHeight = "1";
  delBtn.style.opacity = "0";
  delBtn.style.transition = "opacity 120ms ease";

  div.addEventListener("mouseenter", () => (delBtn.style.opacity = "1"));
  div.addEventListener("mouseleave", () => (delBtn.style.opacity = "0"));
  header.appendChild(delBtn);

  const textDiv = document.createElement("div");
  textDiv.contentEditable = true;
  textDiv.innerText = note.text || "";
  textDiv.style.outline = "none";
  textDiv.style.paddingRight = "8px";
  textDiv.style.minHeight = "40px";
  textDiv.style.whiteSpace = "pre-wrap";
  textDiv.style.wordBreak = "break-word";
  textDiv.style.color = "#000"
  // apply saved font size from storage (async)
  chrome.storage.local.get("stickyFontSize", ({ stickyFontSize = "16px" }) => {
    textDiv.style.fontSize = stickyFontSize;
  });

  // save text on blur (upsert)
  textDiv.addEventListener("blur", () => {
    note.text = textDiv.innerText;
    chrome.runtime.sendMessage({ type: "CREATE_STICKY_NOTE", note });
  });

  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    div.remove();
    chrome.runtime.sendMessage({
      type: "DELETE_STICKY_NOTE",
      id: note.id,
      url: window.location.href
    });
  });

  // draggable
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  div.addEventListener("mousedown", (e) => {
    if (e.target === textDiv || e.target === delBtn) return;
    isDragging = true;
    offsetX = e.clientX - div.getBoundingClientRect().left;
    offsetY = e.clientY - div.getBoundingClientRect().top;
    div.style.cursor = "grabbing";
    e.preventDefault();
  });

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const left = e.clientX - offsetX;
    const top = e.clientY - offsetY;
    div.style.left = `${left}px`;
    div.style.top = `${top}px`;
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    div.style.cursor = "default";
    note.x = parseInt(div.style.left, 10);
    note.y = parseInt(div.style.top, 10);
    chrome.runtime.sendMessage({ type: "CREATE_STICKY_NOTE", note });
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  // assemble and attach
  div.appendChild(header);
  div.appendChild(textDiv);
  document.body.appendChild(div);
  activeNotes.push(div);
}

// Initialize sticky notes (load saved notes) if toggle ON
(async () => {
  const enabled = await isStickyEnabled();
  if (!enabled) {
    console.log("[StickyNotes] Disabled at load.");
    return;
  }

  console.log("[StickyNotes] Enabled → initializing...");

  // load saved notes for this page
  chrome.runtime.sendMessage({ type: "GET_STICKY_NOTES", url: window.location.href }, (notes = []) => {
    notes.forEach(renderNote);
  });
})();

// dblclick handler: check toggle at runtime before creating a new note
document.addEventListener("dblclick", async (e) => {
  const enabled = await isStickyEnabled();
  if (!enabled) {
    // ignore dblclick if sticky notes disabled
    return;
  }

  const newNote = {
    id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now(),
    text: "New Note",
    x: e.pageX,
    y: e.pageY,
    url: window.location.href
  };
  renderNote(newNote);
  chrome.runtime.sendMessage({ type: "CREATE_STICKY_NOTE", note: newNote });
});

// react to toggle changes: if user turns stickyNotes OFF, remove all active notes from DOM.
// if turned ON, load saved notes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.featureToggles) {
    const prev = changes.featureToggles.oldValue?.stickyNotes;
    const next = changes.featureToggles.newValue?.stickyNotes;
    const prevOn = prev === undefined ? true : !!prev;
    const nextOn = next === undefined ? true : !!next;

    if (!nextOn && prevOn) {
      // user turned off -> remove existing notes
      activeNotes.forEach(n => n.remove());
      activeNotes = [];
      console.log("[StickyNotes] Disabled at runtime -> removed active notes");
    } else if (nextOn && !prevOn) {
      // user turned on -> load saved notes for this page
      chrome.runtime.sendMessage({ type: "GET_STICKY_NOTES", url: window.location.href }, (notes = []) => {
        notes.forEach(renderNote);
        console.log("[StickyNotes] Enabled at runtime -> restored notes");
      });
    }
  }
});
console.log("🧩 Content script loaded ✅");

// Heuristically find the main content block (for your existing summarizer)
function getMainContentText() {
  const article = document.querySelector('main, article, [role="main"], #content, .content-main, .post');
  if (article) return article.innerText;
  return document.body.innerText;
}

// --- Background keep-alive ping ---
function startPingLoop() {
  const PING_INTERVAL_MS = 30 * 1000; // every 30 seconds

  async function sendPing() {
    try {
      await chrome.runtime.sendMessage({ type: "PING" });
      console.log("📡 PING sent to background");
    } catch (err) {
      // This happens if the service worker is temporarily unloaded
      console.warn("⚠️ PING failed:", err);
    }
  }

  sendPing(); // initial ping
  setInterval(sendPing, PING_INTERVAL_MS);
}

startPingLoop();
