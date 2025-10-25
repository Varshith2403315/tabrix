// src/sidepanel/sidepanel_main.js

import React from 'react';
import ReactDOM from 'react-dom/client';
import SidePanel from './SidePanel';
import "./sidepanel.css";
// Assuming your sidepanel.html has a root div with id="sidepanel-root"
const rootElement = document.getElementById('sidepanel-root');

if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <SidePanel />
      </React.StrictMode>
    );
}