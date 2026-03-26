import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress runtime error overlay in production/Telegram environment
if (typeof window !== 'undefined') {
  // Completely disable the error overlay from the dev server
  (window as any).__VITE_HMR_CONFIG__ = { overlay: false };
  
  // Create a style element to hide the overlay via CSS as a last resort
  const style = document.createElement('style');
  style.innerHTML = `
    vite-error-overlay, 
    [id^="vite-error-overlay"],
    #vite-error-overlay { 
      display: none !important; 
      visibility: hidden !important; 
      opacity: 0 !important; 
      pointer-events: none !important; 
    }
  `;
  document.head.appendChild(style);
  
  // Try to prevent any error from reaching the overlay
  const originalError = console.error;
  console.error = (...args) => {
    if (args[0] && typeof args[0] === 'string' && (args[0].includes('ResizeObserver') || args[0].includes('Script error'))) {
      return;
    }
    originalError.apply(console, args);
  };

  window.addEventListener('error', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  
  window.addEventListener('unhandledrejection', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
}

createRoot(document.getElementById("root")!).render(<App />);
