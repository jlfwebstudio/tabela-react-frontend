// frontend/src/index.js (EXEMPLO)

import React from 'react';
import ReactDOM from 'react-dom/client'; // Importa createRoot do 'react-dom/client'
import './index.css'; // Se você tiver um index.css
import App from './App'; // Importa o seu componente App

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
