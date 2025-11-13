# AI-Tabrix: Smart Tab Memory

**AI-Tabrix** is a Chrome extension that helps you stay organized and focused by transforming your browser tabs into a smart, searchable memory system — powered by built-in AI summarization and tagging.

Developed as a **solo project** during the *Chrome Built-in AI Hackathon 2025*.

---

##  Overview

Modern browsers are powerful, but managing dozens of open tabs isn’t. **AI-Tabrix** solves tab overload by automatically summarizing and categorizing every tab you open — so you can instantly recall ideas, links, and research, even after you close them.

---

##  Key Features

- **Smart Summaries** – Generates concise AI summaries of each tab in real time.  
- **Auto Tagging** – Adds intelligent tags to help you find any tab later.  
- **Session Memory** – Saves tab sessions for quick reopening.  
- **Sticky Notes** – Add quick thoughts or reminders directly on any page.  
- **Lightweight UI** – Fast, minimal, and built for performance.  

---

##  How It Works

AI-Tabrix uses **Chrome’s built-in AI APIs** and a hybrid summarizer model to:
1. Capture tab content.
2. Summarize it using on-device AI.
3. Generate topic-based tags.
4. Store everything locally for privacy and instant access.

---

##  Tech Stack

- **Frontend:** HTML, CSS, JavaScript  
- **Runtime:** Chrome Extension (Manifest V3)  
- **AI Integration:** Chrome Built-in AI APIs  
- **Storage:** Chrome local storage (session persistence)

---

##  Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/ai-tabrix.git
Open Chrome and navigate to:

chrome://extensions/

Enable Developer Mode (top right corner).

Click “Load unpacked” and select your project folder.

The AI-Tabrix icon should now appear in your toolbar.


## Folder structure

ai-tabrix/
├── src/

│   ├── background/

│   ├── content/

│   ├── popup/

│   └── assets/

├── manifest.json

├── README.md

└── package.json



### Hackathon Context

Built for the Chrome Built-in AI Hackathon 2025 — as a solo developer project.
Focused on solving real-world tab fatigue with a simple, AI-augmented experience.


Contributing

Contributions and feedback are welcome.
If you’d like to suggest a feature or report a bug:
---
- Open an issue on GitHub
- Or submit a pull request with clear commit messages
