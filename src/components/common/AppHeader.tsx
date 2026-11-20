import {
  ArrowLeft,
  Download,
  Home,
  Save,
} from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';

export function AppHeader() {
  const stage = useAppStore((state) => state.stage);
  const project = useAppStore((state) => state.project);
  const goHome = useAppStore((state) => state.goHome);
  const saveCurrentProject = useAppStore((state) => state.saveCurrentProject);
  const exportCurrentProject = useAppStore((state) => state.exportCurrentProject);

  return (
    <header
      className={`app-header ${stage === 'viewer' ? 'app-header--viewer' : ''} ${
        stage === 'home' ? 'app-header--landing' : 'app-header--workspace'
      }`}
    >
      {stage === 'home' ? (
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#projects">Projects</a>
          <a className="btn btn--primary btn--sm" href="#upload">
            Get started
          </a>
        </nav>
      ) : (
        project && (
          <div className="header-context">
            <div className="header-project">
              <span className="header-project-name">{project.name}</span>
              <span className="header-project-meta">
                {project.layout.seats.length} seats · {project.layout.rows.length} rows ·{' '}
                {project.layout.sections.length} section
                {project.layout.sections.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        )
      )}

      <div className="header-actions">
        {stage !== 'home' && stage !== 'analyzing' && (
          <button className="btn btn--ghost btn--sm" onClick={goHome}>
            <Home size={13} />
            <span>Projects</span>
          </button>
        )}
        {project && stage !== 'home' && stage !== 'analyzing' && (
          <>
            <button
              className="icon-btn"
              onClick={() => void exportCurrentProject()}
              title="Export project JSON"
            >
              <Download size={15} />
            </button>
            <button
              className="btn btn--sm"
              onClick={() => void saveCurrentProject()}
              title="Save locally"
            >
              <Save size={13} />
              <span>Save</span>
            </button>
          </>
        )}
        {stage === 'analyzing' && (
          <button className="btn btn--sm btn--ghost" onClick={goHome}>
            <ArrowLeft size={13} />
            Cancel
          </button>
        )}
      </div>
    </header>
  );
}
