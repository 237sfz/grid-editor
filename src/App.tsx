import { useEffect } from 'react';
import GridCanvas from './components/GridCanvas';
import Toolbar from './components/Toolbar';
import { useGridStore } from './state/gridStore';

const App = () => {
  const { loadFromStorage } = useGridStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <div className="app-shell">
      <Toolbar />
      <main className="workspace" aria-label="grid editor workspace">
        <GridCanvas />
      </main>
    </div>
  );
};

export default App;
