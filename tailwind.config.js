/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // ✅ good
  content: [
    "./src/**/*.{js,jsx,ts,tsx,html}", // React + HTML in src
    "./public/**/*.html",              // ✅ built or static HTMLs
    "./*.html",                        // ✅ top-level HTMLs like sidepanel.html, popup.html
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
