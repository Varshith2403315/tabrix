// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // Need path utility for cleaner input definition

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // Main popup entry
        popup: path.resolve(__dirname, 'index.html'), 
        // 🌟 NEW SIDE PANEL ENTRY
        sidepanel: path.resolve(__dirname, 'sidepanel.html'),
      }
    }
  }
});