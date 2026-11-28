import { useEffect } from 'react';
import { ToastStack } from '@/components/common/ToastStack';
import { HomeScreen } from '@/components/upload/HomeScreen';
import { LumenFlow } from '@/components/lumen-flow/LumenFlow';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const stage = useAppStore((state) => state.stage);
  const project = useAppStore((state) => state.project);
  const init = useAppStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  const needsProject = stage !== 'home' && stage !== 'analyzing';
  if (needsProject && !project) {
    return (
      <div className={`app-shell app-shell--${stage}`}>
        <main className="app-main lumen-flow-mount">
          <div className="empty-state" style={{ minHeight: '60vh' }}>
            <h3>No project is open</h3>
            <p>Choose a saved reconstruction or upload a new seating plan.</p>
            <button className="btn btn--primary" onClick={() => useAppStore.getState().goHome()}>
              Return to projects
            </button>
          </div>
        </main>
        <ToastStack />
      </div>
    );
  }

  return (
    <div className={`app-shell app-shell--${stage}`}>
      <main className={`app-main${stage === 'home' ? '' : ' lumen-flow-mount'}`}>
        {stage === 'home' ? <HomeScreen /> : <LumenFlow />}
      </main>
      <ToastStack />
    </div>
  );
}
