import { AlertTriangle, ArrowLeft, Cpu, ScanLine, Sparkles } from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';

export function AnalyzingScreen() {
  const analysis = useAppStore((state) => state.analysis);
  const imageUrl = useAppStore((state) => state.imageUrl);
  const cancelAnalysis = useAppStore((state) => state.cancelAnalysis);
  const goHome = useAppStore((state) => state.goHome);
  const hasError = analysis.status === 'error';

  return (
    <div className="analysis-screen">
      <div className="analysis-card">
        <div className="analysis-visual">
          {imageUrl ? (
            <img src={imageUrl} alt="Seating plan being analysed" />
          ) : (
            <div className="empty-state">
              <ScanLine size={30} />
              <span>Preparing screenshot…</span>
            </div>
          )}
          {!hasError && <div className="scanline" />}
          <div className="analysis-visual-label">
            <span className="pulse" />
            {hasError ? 'ANALYSIS STOPPED' : 'LOCAL VISION PIPELINE'}
          </div>
        </div>
        <div className="analysis-detail">
          <div className="section-kicker">Step 02 / image understanding</div>
          <h1>
            {hasError
              ? 'The seating plan could not be analysed.'
              : analysis.status === 'ocr'
                ? 'Reading the labels.'
                : 'Finding every seat.'}
          </h1>
          <p className="analysis-step">
            {hasError
              ? analysis.error
              : analysis.step ||
                'Colour segmentation, contour scoring and geometric grouping run in a local worker.'}
          </p>

          {hasError ? (
            <div className="notice notice--error" style={{ marginTop: 20 }}>
              <AlertTriangle size={15} />
              <span>
                No project was created. Check the image, try a tighter crop, or continue to
                the editor and add seats manually if detection returns no results.
              </span>
            </div>
          ) : (
            <>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${analysis.percent}%` }} />
              </div>
              <div className="progress-meta">
                <span>{analysis.percent}%</span>
                <span>
                  {analysis.status === 'ocr'
                    ? 'OCR · OPTIONAL'
                    : 'OPENCV + LOCAL HEURISTICS'}
                </span>
              </div>
            </>
          )}

          <ul className="analysis-log">
            {analysis.logs.slice(-7).map((log, index) => (
              <li key={`${log}-${index}`}>{log}</li>
            ))}
          </ul>

          <div className="analysis-actions">
            {hasError ? (
              <>
                <button className="btn btn--primary" onClick={goHome}>
                  <ArrowLeft size={14} />
                  Back to upload
                </button>
              </>
            ) : (
              <>
                <button className="btn" onClick={cancelAnalysis}>
                  Cancel
                </button>
                <span className="row muted" style={{ fontSize: 10 }}>
                  <Cpu size={13} />
                  Processing stays on this device
                </span>
              </>
            )}
          </div>
          {!hasError && (
            <div className="notice notice--info" style={{ marginTop: 18 }}>
              <Sparkles size={14} />
              <span>
                OCR may download a small English recognition model on first use. Seat
                detection itself does not require a network connection.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
