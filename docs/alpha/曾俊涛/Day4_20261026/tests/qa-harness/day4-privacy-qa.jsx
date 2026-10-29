// QA harness only; mounts the existing Day4 DestroyPage unchanged in a local source mirror.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DestroyPage } from './pages/Tools.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(<main className="page-wrap"><DestroyPage /></main>);
