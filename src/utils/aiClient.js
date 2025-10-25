// --- aiClient.js ---

let summarizerInstance = null;
let promptInstance = null;
let modelStatus = 'checking...';

// --- Availability & Status Management ---
export function getModelStatus() {
  return modelStatus;
}

export async function initAI() {
  if (!('Summarizer' in self)) {
    modelStatus = 'UNSUPPORTED_BROWSER';
    return false;
  }

  try {
    if (!summarizerInstance) {
      summarizerInstance = await Summarizer.create({
        type: 'tldr',
        format: 'plain-text',
        length: 'short',
      });
      console.log("✅ Summarizer initialized successfully.");
    }

    // Try locating the Prompt API
    let Prompter = self.LanguageModel || (chrome?.ai?.languageModel ?? null);
    console.log("🧩 Detected Prompter source:", Prompter);

    if (Prompter && typeof Prompter.create === 'function') {
      try {
        promptInstance = await Prompter.create(['en']);
        console.log("✅ Prompt API initialized successfully.");
        await runPromptApiTest();
      } catch (error) {
        console.error("❌ Prompt API creation failed:", error);
        promptInstance = null;
      }
    }

    if (!promptInstance) {
      console.warn("⚠️ Prompt API not available. SmartTags/MemorySearch will fallback.");
    }

    modelStatus = 'available';
    return true;

  } catch (err) {
    console.error("❌ AI Initialization Failed:", err);
    modelStatus = 'INITIALIZATION_FAILED';
    return false;
  }
}

// --- Tab Summarization ---
export async function generateTabNote(text) {
  if (!summarizerInstance) return `AI Status: ${modelStatus}. Summary unavailable.`;
  if (!text?.trim() || text.length < 100) return "Not enough readable content for AI summary.";

  try {
    const result = await summarizerInstance.summarize(text.substring(0, 15000));
    const summaryText = result?.output || result?.summary || (typeof result === 'string' ? result : null);
    return summaryText?.trim() || "Summary could not be generated.";
  } catch (err) {
    console.error("Summarize execution error:", err);
    return "AI execution failed.";
  }
}

// --- Smart Tags using Prompt API ---
const AI_CATEGORIES = [
  "Research",
  "Work/Projects",
  "Study",
  "Entertainment",
  "News",
  "Shopping",
  "Social Media"
];

export async function generateSmartTags(tabNote) {
  if (!promptInstance) {
    console.warn("⚠️ Prompt API not initialized; using fallback tag.");
    return ["Uncategorized"];
  }

  if (!tabNote || tabNote.startsWith("AI Status:")) return ["Uncategorized"];

  const tagPrompt = `
You are a smart browser tab categorizer.
Choose the single most relevant category from this list:
${AI_CATEGORIES.join(", ")}.

Text:
"${tabNote}"

Respond with ONLY one category name from the list above.
`;

  try {
    console.log("🧠 Sending Smart Tag prompt to AI...");
    const response = await promptInstance.prompt(tagPrompt);
    const tag = response?.trim?.() || response?.text?.trim?.() || "Uncategorized";
    console.log("🏷️ Smart Tag result:", tag);
    return [tag];
  } catch (err) {
    console.error("❌ Smart Tag generation failed:", err);
    return ["Uncategorized"];
  }
}

// ====================================================
// 🧠 Unified Memory Search (Hybrid: Keyword + Prompt API)
// ====================================================

export async function unifiedMemorySearch(query, tabsStore) {
  try {
    console.log("🧠 Unified Memory Search for:", query);

    // Step 1 — Basic local keyword search
    const keywordMatches = tabsStore.filter(t =>
      t.tabNote?.toLowerCase().includes(query.toLowerCase()) ||
      t.title?.toLowerCase().includes(query.toLowerCase())
    );

    if (keywordMatches.length > 0) {
      console.log(`📄 Found ${keywordMatches.length} local match(es).`);
      return keywordMatches;
    }

    // Step 2 — Semantic reasoning (Prompt API fallback)
    if (!promptInstance) {
      console.warn("⚠️ Prompt API not initialized; returning no matches.");
      return [];
    }

    const tabList = tabsStore.map(t =>
      `• [${t.tabId}] "${t.title}" — ${t.tabNote || 'No summary.'} (Tags: ${t.tags?.join(', ') || 'none'})`
    ).join('\n');

    const prompt = `
You are a semantic search assistant for browser tabs.
User query: "${query}"

Available tabs:
${tabList}

Return a JSON array (max 5) of the most relevant tabs with reasoning.
Example:
[{"tabId": 12, "reason": "About JavaScript closures"}]
`;

    const response = await promptInstance.prompt(prompt);
    console.log("🧩 Prompt AI raw output:", response);

    // 🧹 Step 3 — Clean AI response before parsing
    let cleaned = response.trim();
    cleaned = cleaned.replace(/```json|```/g, '').trim();

    let parsed = [];
    try {
      parsed = JSON.parse(cleaned);
      console.log("✅ Parsed AI JSON:", parsed);
    } catch (err) {
      console.warn("⚠️ Could not parse JSON:", err, cleaned);
      return [];
    }

    // Step 4 — Map found tabIds to actual tab objects
    const semanticMatches = parsed
      .map(p => tabsStore.find(t => t.tabId === p.tabId))
      .filter(Boolean);

    return semanticMatches;

  } catch (err) {
    console.error("❌ Unified memory search failed:", err);
    return [];
  }
}




// --- Cluster Tabs ---
export async function clusterTabsByTags(tabDataArray) {
  if (!promptInstance) return {};

  const tabTagsMap = tabDataArray
    .map(tab => tab.tags[0] || 'Uncategorized')
    .filter(t => t !== 'Uncategorized')
    .join(',');

  const baseName = tabTagsMap.includes('Research') || tabTagsMap.includes('Study')
    ? "Research Session"
    : "General Browsing";

  return {
    id: 'CLUSTER_AI_01',
    name: baseName,
    tabIds: tabDataArray.map(t => t.tabId)
  };
}

// --- Prompt API Debug Utility ---
async function runPromptApiTest() {
  console.log("🚀 Starting Prompt API test...");
  try {
    const session = await LanguageModel.create(['en']);
    const poem = await session.prompt("Write a 1-line Chrome extension joke.");
    console.log("✅ Prompt test output:", poem);
    session.destroy();
    console.log("🧹 Session destroyed. Prompt API OK.");
  } catch (error) {
    console.error("❌ Error during Prompt API test:", error);
  }
}

// --- Model Download / Monitor ---
export async function createAndMonitorSummarizer(callback) {
  const success = await initAI();
  if (success) callback({ type: 'MODEL_READY' });
  return success;
}
