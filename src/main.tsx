import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Install the public shell after an online visit. An update waits for existing tabs
// to close, so it cannot swap code in the middle of an active workout.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
