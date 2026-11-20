import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Copy,
  Eye,
  FileImage,
  FolderOpen,
  ImagePlus,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { validateImageFile } from '@/modules/image-processing/prepare';
import type { CropRect } from '@/types';
import { CropDialog } from './CropDialog';

const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp);
}

export function HomeScreen() {
  const projects = useAppStore((state) => state.projects);
  const uploadAndAnalyze = useAppStore((state) => state.uploadAndAnalyze);
  const openProject = useAppStore((state) => state.openProject);
  const duplicateProject = useAppStore((state) => state.duplicateProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const importProject = useAppStore((state) => state.importProject);
  const addToast = useAppStore((state) => state.addToast);
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const elements = document.querySelectorAll('.home-reveal');
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const chooseFile = useCallback(
    (file: File) => {
      const error = validateImageFile(file);
      if (error) {
        addToast({ tone: 'error', title: 'Unsupported image', detail: error });
        return;
      }
      const url = URL.createObjectURL(file);
      setPendingFile(file);
      setCropUrl(url);
    },
    [addToast],
  );

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    chooseFile(files[0]);
  };

  const confirmCrop = (crop: CropRect) => {
    if (!pendingFile) return;
    const file = pendingFile;
    const isFull = crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
    setPendingFile(null);
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropUrl(null);
    void uploadAndAnalyze(file, isFull ? undefined : crop);
  };

  const loadSample = async () => {
    setLoadingSample(true);
    try {
      const response = await fetch(publicAsset('test-seating-plan.png'));
      if (!response.ok) throw new Error('The bundled test plan could not be loaded.');
      const blob = await response.blob();
      const file = new File([blob], 'test-seating-plan.png', { type: 'image/png' });
      chooseFile(file);
    } catch (error) {
      addToast({
        tone: 'error',
        title: 'Could not load test plan',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoadingSample(false);
    }
  };

  const recent = useMemo(() => projects.slice(0, 6), [projects]);

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-copy">
          <div className="home-eyebrow">
            <span className="line" />
            <span className="eyebrow">A better view before you book</span>
          </div>
          <h1 className="home-title">
            Know your view
            <br />
            <em>before you take your seat.</em>
          </h1>
          <p className="home-lede">
            Turn a cinema seating-plan screenshot into a room you can explore. Check the
            detected seats, fine-tune the auditorium, and see the screen from the seat
            you have in mind.
          </p>
          <div className="home-hero-actions">
            <button
              className="btn btn--primary btn--lg"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={16} />
              Upload a seat plan
              <ArrowUpRight size={15} />
            </button>
            <a className="btn btn--lg btn--outline" href="#how-it-works">
              See how it works
            </a>
          </div>
          <div className="home-trust-note">
            <span className="home-trust-dot" />
            Private by design. Your plans stay in this browser.
          </div>
          <div className="home-stats">
            <div>
              <div className="home-stat-value">Your image</div>
              <div className="home-stat-label">no account needed</div>
            </div>
            <div>
              <div className="home-stat-value">Every seat</div>
              <div className="home-stat-label">a view to compare</div>
            </div>
            <div>
              <div className="home-stat-value">Your browser</div>
              <div className="home-stat-label">local project storage</div>
            </div>
          </div>
        </div>

      </section>

      <section className="home-how" id="how-it-works">
        <div className="home-how-heading home-reveal">
          <span className="section-kicker">How it works</span>
          <h2>From screenshot to your seat in three steps.</h2>
          <p>No complicated setup. Start with the plan you already have.</p>
        </div>

        <div className="home-steps">
          <article className="home-step home-reveal">
            <div className="home-step-copy">
              <span className="home-step-number">01</span>
              <h3>Bring your seating plan</h3>
              <p>
                Upload a screenshot from a cinema booking page. Lumen reads the layout
                right from the image, including the seat labels.
              </p>
              <span className="home-step-detail">
                <ImagePlus size={15} />
                A screenshot is all you need
              </span>
            </div>
            <div className="home-step-visual step-visual--upload">
              <div className="step-window-bar">
                <span />
                <span />
                <span />
                <small>your-seating-plan.png</small>
              </div>
              <div className="step-image-wrap">
                <img
                  src={publicAsset('test-seating-plan.png')}
                  alt="Example cinema seating plan screenshot"
                  loading="lazy"
                />
              </div>
              <div className="step-float-card">
                <span className="step-float-icon"><UploadCloud size={15} /></span>
                <span><strong>Plan uploaded</strong><small>Ready to scan</small></span>
              </div>
            </div>
          </article>

          <article className="home-step home-reveal">
            <div className="home-step-copy">
              <span className="home-step-number">02</span>
              <h3>Check the seats and room</h3>
              <p>
                Review the detected seat map, make any corrections, and adjust the screen
                or auditorium details when you need to.
              </p>
              <span className="home-step-detail">
                <FileImage size={15} />
                You stay in control of the details
              </span>
            </div>
            <div className="home-step-visual step-visual--review">
              <div className="step-window-bar">
                <span />
                <span />
                <span />
                <small>Review seat map</small>
              </div>
              <div className="step-image-wrap">
                <img
                  src={publicAsset('test-seating-plan-2.png')}
                  alt="Example seating plan ready for review"
                  loading="lazy"
                />
                <div className="step-review-callout">
                  <span className="step-review-dot" />
                  Seat labels stay with your plan
                </div>
              </div>
              <div className="step-status-card">
                <span className="step-status-check">✓</span>
                <span><strong>Review the layout</strong><small>Edit seats or continue</small></span>
              </div>
            </div>
          </article>

          <article className="home-step home-reveal">
            <div className="home-step-copy">
              <span className="home-step-number">03</span>
              <h3>Take a look from your seat</h3>
              <p>
                Choose any seat on the map and explore a first-person view. Compare
                positions, check sightlines, and find the view that feels right.
              </p>
              <span className="home-step-detail">
                <Eye size={15} />
                Pick a seat. Look around.
              </span>
            </div>
            <div className="home-step-visual step-visual--view">
              <div className="step-theatre-screen">
                <video
                  src={publicAsset('cinema-preview.mp4')}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
                <span className="step-view-label">A view from your seat</span>
              </div>
              <div className="step-view-seat">
                <span className="step-view-seat-icon"><Eye size={16} /></span>
                <span><strong>Choose any seat</strong><small>Preview the screen from there</small></span>
                <ArrowUpRight size={15} />
              </div>
            </div>
          </article>
        </div>
        <div className="home-how-cta home-reveal">
          <p>Your next cinema visit starts with a screenshot.</p>
          <button
            className="btn btn--primary btn--lg"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload a seat plan
            <ArrowUpRight size={15} />
          </button>
        </div>
      </section>

      <section className="home-start">
        <div className="home-start-heading">
          <div>
            <span className="section-kicker">Ready when you are</span>
            <h2>Start with a seating plan.</h2>
          </div>
          <p>Upload a screenshot or try the sample plan to explore the workflow.</p>
        </div>
        <div className="home-panel" id="upload">
          <div
            className={`dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}
          >
            <div className="dropzone-icon">
              <UploadCloud size={23} strokeWidth={1.5} />
            </div>
            <h2>Drop your seating-plan screenshot</h2>
            <p>
              Screenshots from cinema booking apps are welcome, including the surrounding
              page.
            </p>
            <div className="dropzone-actions">
              <button
                className="btn btn--primary"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <ImagePlus size={14} />
                Choose screenshot
              </button>
              <button
                className="btn"
                onClick={(event) => {
                  event.stopPropagation();
                  void loadSample();
                }}
                disabled={loadingSample}
              >
                <FileImage size={14} />
                {loadingSample ? 'Loading…' : 'Try a sample'}
              </button>
            </div>
            <div className="dropzone-formats">PNG, JPG or WebP · up to 45 MB</div>
          </div>
          <div className="home-panel-note">
            <FolderOpen size={13} style={{ marginTop: 1, flex: '0 0 auto' }} />
            <span>
              Projects stay in your browser via IndexedDB. No account or cloud AI provider
              is required.
            </span>
          </div>
        </div>
      </section>

      <section className="home-recent" id="projects">
        <div className="home-recent-head">
          <div>
            <div className="section-kicker">Local project archive</div>
            <h2 style={{ marginTop: 8 }}>Recent reconstructions</h2>
          </div>
          <div className="row">
            <button className="btn btn--sm btn--ghost" onClick={() => importInputRef.current?.click()}>
              <UploadCloud size={13} />
              Import JSON
            </button>
          </div>
        </div>

        {recent.length > 0 ? (
          <div className="project-grid">
            {recent.map((project) => (
              <div
                key={project.id}
                className="project-card"
                onClick={() => void openProject(project.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => event.key === 'Enter' && void openProject(project.id)}
              >
                <div className="project-thumb">
                  {project.imageUrl ? (
                    <img src={project.imageUrl} alt="" />
                  ) : (
                    <div className="empty-state" style={{ padding: 20 }}>
                      <ImagePlus size={18} />
                    </div>
                  )}
                </div>
                <div className="project-card-actions">
                  <button
                    className="icon-btn"
                    title="Duplicate"
                    onClick={(event) => {
                      event.stopPropagation();
                      void duplicateProject(project.id);
                    }}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (window.confirm(`Delete “${project.name}” from this browser?`)) {
                        void deleteProject(project.id);
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="project-card-body">
                  <div className="project-card-title">{project.name}</div>
                  <div className="project-card-meta">
                    <span>{project.seatCount} seats</span>
                    <span>{project.rowCount} rows</span>
                    <span>{formatDate(project.updatedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="project-empty">
            <span>No saved reconstructions yet. Your first upload will appear here.</span>
          </div>
        )}
      </section>

      <footer className="home-foot">
        <span className="local-badge">LOCAL-FIRST · INDEXEDDB · NO ACCOUNT</span>
        <span>
          Approximate geometry for planning. Physical auditorium measurements remain
          assumptions unless you provide them.
        </span>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importProject(file);
          event.target.value = '';
        }}
      />
      <CropDialog
        open={Boolean(pendingFile && cropUrl)}
        imageUrl={cropUrl}
        fileName={pendingFile?.name}
        onClose={() => {
          setPendingFile(null);
          if (cropUrl) URL.revokeObjectURL(cropUrl);
          setCropUrl(null);
        }}
        onConfirm={confirmCrop}
      />
    </div>
  );
}
