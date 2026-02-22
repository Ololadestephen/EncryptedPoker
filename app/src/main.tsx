// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
window.Buffer = Buffer;
import App from './App';
import { Analytics } from '@vercel/analytics/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
);
