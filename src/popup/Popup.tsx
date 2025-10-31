// src/popup/Popup.tsx
import React, { useState, useEffect, useCallback } from "react";

// --- Type Definitions ---
type Feature = 'TabNotes*' | 'SmartTags' | 'MemorySearch';
type ToggleKey = 'duplicateNotifier' | 'stickyNotes';

// Data for the main navigable features
const mainFeatures: { icon: string; name: Feature; description: string }[] = [
    { icon: '📝', name: 'TabNotes*', description: 'AI summaries for all tabs.' },
    { icon: '🏷️', name: 'SmartTags', description: 'Auto-categorize tabs for quick grouping.' },
    { icon: '🔍', name: 'MemorySearch', description: 'Search content using natural language.' },
];

// Initial state for toggles (will be fetched from storage later)
const initialToggles = {
  duplicateNotifier: true,
  stickyNotes: true, // default ON
};

// Function to handle opening the Side Panel
const openSidePanel = (feature: Feature) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
            chrome.runtime.sendMessage({ 
                type: 'OPEN_SIDE_PANEL', 
                feature: feature,
                tabId: tabs[0].id 
            });
        }
    });
    window.close();
};


// --- Main Popup Component ---

export default function Popup() {
    const [toggles, setToggles] = useState(initialToggles);
    // ✅ Load saved toggle states from storage on mount
    useEffect(() => {
      chrome.storage.sync.get("featureToggles", (res) => {
        if (res.featureToggles) setToggles(res.featureToggles);
      });
    }, []);

    const [modelStatus, setModelStatus] = useState('checking...');
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    // 🌗 Theme handling
    const [theme, setTheme] = useState("light");

useEffect(() => {
  chrome.storage.sync.get("theme", (res) => {
    const saved = res.theme || "light";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  });
}, []);

const toggleTheme = () => {
  const next = theme === "light" ? "dark" : "light";
  setTheme(next);
  document.documentElement.classList.toggle("dark", next === "dark");
  chrome.storage.sync.set({ theme: next }); // ✅ save globally
};


    // 1. Core function to fetch current model status from the background worker
    const updateModelStatus = useCallback(() => {
        chrome.runtime.sendMessage({ type: "REQUEST_MODEL_STATUS" }, (status: string) => {
            if (status) {
                setModelStatus(status);
            }
        });
    }, []);

    // 2. Function to trigger model download with user activation (CRITICAL FIX)
    const triggerModelDownload = () => {
        // Ensure the status is downloadable and we aren't already downloading
        if (modelStatus !== 'downloadable' || downloadProgress !== null) return; 

        setIsDownloading(true);
        setDownloadProgress(0.01); // Set a minimal value to show the bar immediately

        // Send message to background to initiate the user-activated create() call
        chrome.runtime.sendMessage({ type: "TRIGGER_MODEL_DOWNLOAD" }, (response: { success: boolean }) => {
            if (!response.success) {
                // If the background script returns immediate failure, reset state
                setIsDownloading(false);
                setDownloadProgress(null); 
                updateModelStatus(); 
            }
        });
    };

    // --- Lifecycle and Message Listener (Handles background communication) ---
    useEffect(() => {
        updateModelStatus(); // Initial load of status
        
        const listener = (message: any) => {
            if (message.type === 'MODEL_DOWNLOAD_PROGRESS' && message.progress !== undefined) {
                // Update progress bar
                setDownloadProgress(message.progress);
            } else if (message.type === 'MODEL_READY') {
                // Download complete and model ready
                setIsDownloading(false);
                setDownloadProgress(null);
                updateModelStatus();
            } else if (message.type === 'MODEL_DOWNLOAD_FAILED') {
                // Handle explicit failure
                setIsDownloading(false);
                setDownloadProgress(null);
                updateModelStatus();
            }
        };

        chrome.runtime.onMessage.addListener(listener);

        return () => {
            chrome.runtime.onMessage.removeListener(listener);
        };
    }, [updateModelStatus]);


    const handleFeatureClick = (feature: Feature) => {
        openSidePanel(feature); 
    };

    // ✅ Save toggles persistently and notify background
    const handleToggle = (key: ToggleKey) => {
      const next = { ...toggles, [key]: !toggles[key] };
      setToggles(next);
      chrome.storage.sync.set({ featureToggles: next }); // save globally
      chrome.runtime.sendMessage({
          type: "TOGGLE_FEATURE",
          feature: key,
          state: next[key],
      });
    };

    
    const isReady = modelStatus === 'available';

    return (
        <div className="p-4 h-auto max-h-[450px] bg-white dark:bg-gray-900 flex flex-col text-gray-900 dark:text-gray-100 transition-colors">
            <div className="flex items-center justify-between mb-4 border-b pb-2">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    AI-Tabrix
                </h1>
                <button
                    onClick={toggleTheme}
                    className="p-1.5 rounded-lg border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    title="Toggle theme"
                >
                    {theme === "light" ? "🌙" : "☀️"}
                </button>
            </div>

            
            {/* --- AI Status and Download Control --- */}
            {modelStatus !== 'available' && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-3 mb-4 text-sm rounded-lg">
                    <p className="font-semibold mb-1">
                        AI Status: {modelStatus.replace(/_/g, ' ').toUpperCase()}
                    </p>
                    
                    {/* SHOW DOWNLOAD BUTTON ONLY IF STATUS IS DOWNLOADABLE AND NOT YET DOWNLOADING */}
                    {modelStatus === 'downloadable' && downloadProgress === null && (
                        <button 
                            onClick={triggerModelDownload}
                            className="mt-2 w-full py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition"
                        >
                            Click to Download AI Model (~2GB)
                        </button>
                    )}
                    
                    {/* SHOW PROGRESS BAR ONLY IF DOWNLOAD HAS STARTED */}
                    {downloadProgress !== null && (
                        <div className="mt-2">
                            Downloading: {downloadProgress > 0.01 ? Math.round(downloadProgress * 100) + '%' : 'Starting download...'}
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${downloadProgress * 100}%` }}></div>
                            </div>
                        </div>
                    )}

                    {(modelStatus === 'UNAVAILABLE_REQUIREMENTS' || modelStatus === 'UNSUPPORTED_BROWSER' || modelStatus === 'DOWNLOAD_FAILED') && (
                        <p className="mt-2 text-xs text-red-700">
                            Check Chrome flags, browser version, and ensure &gt; 22GB free disk space.
                        </p>
                    )}
                </div>
            )}


            {/* --- Main Feature Links (Open Side Panel) */}
            <div className={`flex flex-col space-y-3 mb-5 ${!isReady ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-sm font-semibold text-gray-500 mt-2">Core Features</span>

                {mainFeatures.map((button) => (
                    <button
                        key={button.name}
                        onClick={() => handleFeatureClick(button.name)}
                        className="flex items-center p-2 rounded hover:bg-blue-50 transition-colors text-left"
                        disabled={!isReady} // Disable features if AI isn't ready
                    >
                        <span className="text-xl mr-3">{button.icon}</span>
                        <div className="flex flex-col">
                            <span className="text-base font-medium text-gray-800">{button.name}</span>
                            <span className="text-xs text-gray-500 -mt-0.5">{button.description}</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* --- Toggle Controls (Quick Action) */}
            <span className="text-sm font-semibold text-gray-500 pt-3 border-t mt-3">Productivity Toggles</span>

            {/* Duplicate Notifier Toggle */}
            <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <div className="flex items-center">
                    <span className="text-xl mr-3">✂️</span>
                    <span className="text-base font-medium text-gray-800">Duplicate Notifier</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={toggles.duplicateNotifier} onChange={() => handleToggle('duplicateNotifier')} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
            </div>

            {/* Sticky Notes Toggle */}
            <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
            <div className="flex items-center">
                <span className="text-xl mr-3">🗒️</span>
                <span className="text-base font-medium text-gray-800">Sticky Notes</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input
                type="checkbox"
                checked={toggles.stickyNotes}
                onChange={() => handleToggle('stickyNotes')}
                className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
            </div>

            <p className="text-xs text-center text-gray-400 mt-4 pt-2 border-t">Built for the AI Challenge 2025.</p>
        </div>
    );
}
