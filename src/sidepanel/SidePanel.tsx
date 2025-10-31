// src/sidepanel/SidePanel.tsx

import React, { useState, useEffect, useCallback } from 'react';

type Feature = 'TabNotes' | 'SmartTags' | 'MemorySearch';
const FEATURE_KEY = 'activeSidePanelFeature';

// src/sidepanel/SidePanel.tsx (Focusing on the TabNotesView update)

// --- Type Definitions (Ensure these match your background data structure) ---
type TabInfo = {
    tabId: number;
    title: string;
    url: string;
    tabNote: string; 
    tags: string[]; 
    lastUpdated: number;
};
type SearchResult = TabInfo;
// --- End Type Definitions ---


// --- TabNotes List View (REPLACING THE PLACEHOLDER) ---

const TabNotesView: React.FC = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // This fetches the data from the background service worker
    const fetchTabs = useCallback(() => {
        setIsLoading(true);
        // Request ALL stored AI-enriched tab data
        chrome.runtime.sendMessage({ type: "REQUEST_TABS_DATA" }, (response: TabInfo[]) => {
            if (response && Array.isArray(response)) {
                // Filter out tabs without a title or proper URL for a clean list
                const filtered = response.filter(t => t.title && (t.url?.startsWith('http') || t.tabNote));
                setTabs(filtered);
            }
            setIsLoading(false);
        });
    }, []);

    useEffect(() => {
        fetchTabs();
        // Listener for 'DATA_UPDATED' event from the background script
        const listener = (message: any) => {
            if (message.type === 'DATA_UPDATED') {
                fetchTabs();
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => { chrome.runtime.onMessage.removeListener(listener); };
    }, [fetchTabs]);


    return (
        <div className="p-4 w-full h-full flex flex-col">
            <h3 className="text-xl font-bold mb-4">Ai-Tab Notes</h3>
            <h4>Click on the note to go to the pages</h4>
            {isLoading && <div className="text-center text-gray-500 py-4">Loading and summarizing tabs...</div>}

            <div className="overflow-y-auto flex-1 space-y-3">
                {!isLoading && tabs.length === 0 && (
                    <div className="text-center text-gray-500 pt-10">Open a few web pages to see AI summaries here.</div>
                )}
                
                {tabs.map((tab) => (
                    <div
                        key={tab.tabId}
                        className="p-3 bg-white rounded-lg shadow-sm cursor-pointer border-l-4 border-blue-500 hover:shadow-md"
                        onClick={() => chrome.tabs.update(tab.tabId, { active: true, highlighted: true })}
                    >
                        <h4 className="font-semibold text-gray-800 truncate">{tab.title}</h4>
                        
                        {/* TabNotes Display (Will now show the live summary) */}
                        <p className="text-sm text-gray-600 mt-1 italic">{tab.tabNote}</p>
                        
                        {/* SmartTags Display (Mock data for now) */}
                        <div className="mt-2 flex flex-wrap gap-1">
                            {tab.tags.map((tag, i) => (
                                <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ... (Rest of SidePanel.tsx, including the main SidePanel component and renderFeature function, remains the same)
const SmartTagsView: React.FC = () => {
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // --- Fetch all tabs with tags from background ---
    const fetchTabs = useCallback(() => {
        setIsLoading(true);
        chrome.runtime.sendMessage({ type: "REQUEST_TABS_DATA" }, (response: TabInfo[]) => {
            if (response && Array.isArray(response)) {
                const filtered = response.filter(t => Array.isArray(t.tags) && t.tags.length > 0);
                setTabs(filtered);
            }
            setIsLoading(false);
        });
    }, []);

    // --- Listen for live updates from background ---
    useEffect(() => {
        fetchTabs();

        const listener = (message: any) => {
            if (message.type === 'DATA_UPDATED' || message.type === 'UPDATE_SMART_TAGS') {
                fetchTabs();
            }
        };

        chrome.runtime.onMessage.addListener(listener);
        return () => {
            chrome.runtime.onMessage.removeListener(listener);
        };
    }, [fetchTabs]);

    // --- Build tag frequency map ---
    const tagGroups = useCallback(() => {
        const groups: Record<string, TabInfo[]> = {};
        tabs.forEach(tab => {
            tab.tags.forEach(tag => {
                if (!groups[tag]) groups[tag] = [];
                groups[tag].push(tab);
            });
        });
        return groups;
    }, [tabs]);

    const grouped = tagGroups();

    // --- UI Rendering ---
    if (isLoading) {
        return <div className="p-4 text-gray-500 text-center">Loading tags...</div>;
    }

    if (tabs.length === 0) {
        return <div className="p-4 text-gray-500 text-center">No Smart Tags generated yet. Try browsing some pages!</div>;
    }

    return (
        <div className="p-4 w-full h-full flex flex-col">
            <h3 className="text-xl font-bold mb-4">🏷️ Smart Tags</h3>

            {/* Tag list */}
            {!selectedTag && (
                <div className="space-y-2">
                    {Object.entries(grouped).map(([tag, tagTabs]) => (
                        <button
                            key={tag}
                            onClick={() => setSelectedTag(tag)}
                            className="w-full flex justify-between items-center bg-white hover:bg-blue-50 border border-gray-200 rounded-lg px-3 py-2 shadow-sm transition"
                        >
                            <span className="font-medium text-gray-800">{tag}</span>
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                {tagTabs.length}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Tag details */}
            {selectedTag && (
                <div className="space-y-3">
                    <button
                        onClick={() => setSelectedTag(null)}
                        className="text-sm text-blue-600 mb-2 hover:underline"
                    >
                        ← Back to all tags
                    </button>

                    <h4 className="text-lg font-semibold mb-2">{selectedTag}</h4>
                    {grouped[selectedTag]?.map(tab => (
                        <div
                            key={tab.tabId}
                            className="bg-white border-l-4 border-green-500 p-3 rounded-lg shadow-sm cursor-pointer hover:shadow-md"
                            onClick={() => chrome.tabs.update(tab.tabId, { active: true })}
                        >
                            <h5 className="font-medium text-gray-800 truncate">{tab.title}</h5>
                            <p className="text-sm text-gray-600 mt-1">{tab.tabNote}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const MemorySearchView: React.FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchPerformed, setSearchPerformed] = useState(false);
    // --- 🔔 Listen for AI refined results from background ---
    useEffect(() => {
    const handleMessage = (message: any) => {
        if (message.type === "AI_MEMORY_RESULTS") {
        console.log("💡 Received AI refined memory search:", message.results);
        setResults(message.results);
        setIsLoading(false);
        }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, []);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsLoading(true);
        setSearchPerformed(true);
        setResults([]); // Clear old results

        // 1. Send query to background service worker for AI ranking
        chrome.runtime.sendMessage({ type: 'MEMORY_SEARCH_QUERY', query: query.trim() }, (response: SearchResult[]) => {
            if (chrome.runtime.lastError) {
                console.error("Memory Search failed:", chrome.runtime.lastError);
                setResults([]);
            } else if (response && Array.isArray(response)) {
                // 2. Receive and set the ranked results
                setResults(response);
            }
            setIsLoading(false);
        });
    };

    return (
        <div className="p-4 w-full h-full flex flex-col">
            <h3 className="text-xl font-bold mb-4">🔍 Semantic Tab Search</h3>
            
            {/* Search Input Form */}
            <form onSubmit={handleSearch} className="mb-4 sticky top-0 z-20">
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Input about what are searching for"
                    className="
                        w-full p-2 rounded-lg
                        border border-gray-300 dark:border-gray-600
                        bg-white dark:bg-gray-800
                        text-black dark:text-white
                        placeholder-gray-400 dark:placeholder-gray-500
                        focus:ring-blue-500 focus:border-blue-500"
                />
            </form>

            {/* Loading/Status */}
            {isLoading && <div className="text-center text-blue-600 py-4">🧠 Ranking results with Gemini Nano...</div>}
            
            {/* Results Area */}
            <div className="flex-1 overflow-y-auto space-y-3">
                {searchPerformed && !isLoading && results.length === 0 && (
                    <div className="text-center text-gray-500 pt-10">
                        No tabs found matching your query. Try rephrasing or checking Tab Notes first.
                    </div>
                )}
                
                {results.map((tab) => (
                    <div
                        key={tab.tabId}
                        className="p-3 bg-white rounded-lg shadow-md cursor-pointer border-l-4 border-purple-500 hover:shadow-lg"
                        onClick={() => chrome.tabs.update(tab.tabId, { active: true, highlighted: true })}
                    >
                        <h4 className="font-semibold text-gray-800 truncate">{tab.title}</h4>
                        <p className="text-xs text-purple-600 mt-1 font-mono">Ranked Semantic Match</p>
                        <p className="text-sm text-gray-600 mt-1">{tab.tabNote}</p> 
                        {/* Display tags for context */}
                        <div className="mt-2 flex flex-wrap gap-1">
                            {tab.tags.map((tag, i) => (
                                <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
// --- End Placeholder Components ---


const renderFeature = (feature: Feature) => {
    switch (feature) {
        case 'TabNotes': return <TabNotesView />;
        case 'SmartTags': return <SmartTagsView />;
        case 'MemorySearch': return <MemorySearchView />;
        default: return <TabNotesView />;
    }
};

const navButtons: { icon: string; name: Feature }[] = [
    { icon: '📝', name: 'TabNotes' },
    { icon: '🏷️', name: 'SmartTags' },
    { icon: '🔍', name: 'MemorySearch' },
];

export default function SidePanel() {
    const [activeFeature, setActiveFeature] = useState<Feature>('TabNotes');

    // 1. Read the initial feature when the panel loads
    const loadActiveFeature = useCallback(() => {
        chrome.storage.local.get(FEATURE_KEY, (result) => {
            if (result[FEATURE_KEY]) {
                setActiveFeature(result[FEATURE_KEY] as Feature);
            }
        });
    }, []);
    useEffect(() => {
  // Get initial theme from sync storage
  chrome.storage.sync.get("theme", (res) => {
    const currentTheme = res.theme || "light";
    document.documentElement.classList.toggle("dark", currentTheme === "dark");
  });

  // Listen for changes to sync storage (so popup toggles update the sidepanel live)
  const handleStorageChange = (changes: { [k: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName === 'sync' && changes.theme) {
      const newTheme = changes.theme.newValue;
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
    }
  };

  chrome.storage.onChanged.addListener(handleStorageChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  };
}, []);


    useEffect(() => {
        loadActiveFeature();
        // Optional: Listen for storage changes if external code updates the feature
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes[FEATURE_KEY]) {
                setActiveFeature(changes[FEATURE_KEY].newValue as Feature);
            }
        });
    }, [loadActiveFeature]);

    // 2. Handle navigation click: save new state and update UI
    const handleNavClick = (feature: Feature) => {
        setActiveFeature(feature);
        chrome.storage.local.set({ [FEATURE_KEY]: feature });
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
            {/* --- Top Navigation Bar (The three buttons) --- */}
            <div className="flex justify-around p-3 bg-[#FFF0DD] dark:bg-gray-900 border-b border-gray-200 shadow-sm sticky top-0 z-10">
                {navButtons.map((button) => (
                    <button
                        key={button.name}
                        onClick={() => handleNavClick(button.name)}
                        className={`text-sm py-1 px-2 rounded-full transition-colors duration-150 ${
                            activeFeature === button.name
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        {button.icon} {button.name}
                    </button>
                ))}
            </div>

            {/* --- Main Feature Content Area --- */}
            <div className="flex-1 bg-[#f8e8cf] dark:bg-[#272631] overflow-y-auto">
                {renderFeature(activeFeature)}
            </div>

            {/* Simple Footer/Branding */}
            <div className="p-2 text-center text-xs text-gray-400 border-t">
                AI-Tabrix | Gemini Nano
            </div>
        </div>
    );
}