import { useEffect } from 'react';
import { AppHeader } from '@/components/common/AppHeader';
import { ToastStack } from '@/components/common/ToastStack';
import { HomeScreen } from '@/components/upload/HomeScreen';
import { AnalyzingScreen } from '@/components/image-analysis/AnalyzingScreen';
import { VerifyScreen } from '@/components/layout-editor/VerifyScreen';
import { ConfigureScreen } from '@/components/configuration/ConfigureScreen';
import { CinemaViewer } from '@/components/viewer/CinemaViewer';
import { CompareScreen } from '@/components/compare/CompareScreen';
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
      <div className="app-shell">
        {stage !== 'viewer' && <AppHeader />}
        <main className="app-main">
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
    <div className="app-shell">
      {stage !== 'viewer' && <AppHeader />}
      <main className="app-main">
        {stage === 'home' && <HomeScreen />}
        {stage === 'analyzing' && <AnalyzingScreen />}
        {stage === 'verify' && <VerifyScreen />}
        {stage === 'configure' && <ConfigureScreen />}
        {stage === 'viewer' && <CinemaViewer />}
        {stage === 'compare' && <CompareScreen />}
      </main>
      <ToastStack />
    </div>
  );
}
