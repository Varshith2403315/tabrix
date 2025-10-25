// src/sidepanel/applyTheme.js

chrome.storage?.sync?.get("theme", ({ theme }) => {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
});
