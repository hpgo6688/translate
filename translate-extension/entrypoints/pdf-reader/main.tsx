import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/tailwind.css';

function App() {
  return <main>PDF reader page</main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
