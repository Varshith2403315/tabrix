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