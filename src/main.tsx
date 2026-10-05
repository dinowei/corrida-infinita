import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app.css';

if (import.meta.env.DEV) {
  void import('./dev/harness').then((m) => m.installHarness());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
