import { useEffect } from 'react';
import {
  ArrowRight,
  Crosshair,
  DoorOpen,
  Hand,
  Monitor,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  ScanLine,
  Undo2,
} from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { LayoutCanvas } from './LayoutCanvas';
import { SeatInspector } from './SeatInspector';

const TOOLS = [
  { id: 'select', label: 'Select / move', icon: MousePointer2, shortcut: 'V' },
  { id: 'add-seat', label: 'Add seat', icon: Plus, shortcut: 'A' },
  { id: 'screen', label: 'Screen line', icon: Monitor, shortcut: 'S' },
  { id: 'aisle', label: 'Aisle marker', icon: DoorOpen, shortcut: 'I' },
  { id: 'pan', label: 'Pan', icon: Hand, shortcut: 'H' },
] as const;

export function VerifyScreen() {
  const project = useAppStore((state) => state.project);
  const tool = useAppStore((state) => state.editorTool);
  const setTool = useAppStore((state) => state.setEditorTool);
  const selectedSeatIds = useAppStore((state) => state.selectedSeatIds);
  const deleteSeats = useAppStore((state) => state.deleteSeats);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const past = useAppStore((state) => state.pastLayouts.length);
  const future = useAppStore((state) => state.futureLayouts.length);
  const setStage = useAppStore((state) => state.setStage);
  const setSelectedSeats = useAppStore((state) => state.setSelectedSeats);
  const setOverlayVisible = useAppStore((state) => state.setOverlayVisible);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedSeatIds.length) {
          event.preventDefault();
          deleteSeats(selectedSeatIds);
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === 'Escape') {
        setSelectedSeats([]);
      } else if (event.key.toLowerCase() === 'v') {
        setTool('select');
      } else if (event.key.toLowerCase() === 'a') {
        setTool('add-seat');
      } else if (event.key.toLowerCase() === 's') {
        setTool('screen');
      } else if (event.key.toLowerCase() === 'i') {
        setTool('aisle');
      } else if (event.key.toLowerCase() === 'h') {
        setTool('pan');
      } else if (event.key.toLowerCase() === 'o') {
        setOverlayVisible(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deleteSeats, redo, selectedSeatIds, setOverlayVisible, setSelectedSeats, setTool, undo]);

  if (!project) return null;
  const { layout } = project;

  return (
    <div className="verify-screen">
      <div className="verify-topbar">
        <div className="verify-title">
          <strong>Verify seat map</strong>
          <span>Step 02 · correct before 3D</span>
        </div>
        <div className="verify-stats">
          <div className="verify-stat">
            <strong>{layout.seats.length}</strong>
            <span>seats</span>
          </div>
          <div className="verify-stat">
            <strong>{layout.rows.length}</strong>
            <span>rows</span>
          </div>
          <div className="verify-stat">
            <strong>{layout.sections.length}</strong>
            <span>sections</span>
          </div>
          <div className={`verify-stat ${layout.stats.uncertainSeats ? 'is-warning' : ''}`}>
            <strong>{layout.stats.uncertainSeats}</strong>
            <span>review</span>
          </div>
          <div className="verify-stat">
            <strong>{layout.stats.unreadableLabels}</strong>
            <span>unread labels</span>
          </div>
        </div>
        <div className="verify-toolbar-spacer" />
        <button className="btn btn--sm btn--ghost" onClick={undo} disabled={!past}>
          <Undo2 size={13} />
          Undo
        </button>
        <button className="btn btn--sm btn--ghost" onClick={redo} disabled={!future}>
          <Redo2 size={13} />
          Redo
        </button>
        <button className="btn btn--primary btn--sm" onClick={() => setStage('configure')}>
          Auditorium settings
          <ArrowRight size={13} />
        </button>
      </div>
      <div className="verify-body">
        <div className="editor-rail">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`icon-btn ${tool === item.id ? 'is-active' : ''}`}
                onClick={() => setTool(item.id)}
                title={`${item.label} (${item.shortcut})`}
              >
                <Icon size={16} />
              </button>
            );
          })}
          <div className="editor-rail-divider" />
          <button className="icon-btn" onClick={undo} disabled={!past} title="Undo (⌘Z)">
            <Undo2 size={16} />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!future} title="Redo (⇧⌘Z)">
            <Redo2 size={16} />
          </button>
          <div className="editor-rail-divider" />
          <button
            className="icon-btn"
            onClick={() => setSelectedSeats(layout.seats.map((seat) => seat.id))}
            title="Select all seats"
          >
            <Crosshair size={16} />
          </button>
          <button className="icon-btn" onClick={() => setStage('configure')} title="Continue">
            <ScanLine size={16} />
          </button>
        </div>
        <LayoutCanvas />
        <SeatInspector />
      </div>
    </div>
  );
}
