import { useCallback, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { validateImageFile } from '@/modules/image-processing/prepare';
import type { CropRect } from '@/types';
import { CropDialog } from './CropDialog';

const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export function HomeScreen() {
  const uploadAndAnalyze = useAppStore((state) => state.uploadAndAnalyze);
  const addToast = useAppStore((state) => state.addToast);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chooseFile = useCallback((file: File) => {
    const error = validateImageFile(file);
    if (error) {
      addToast({ tone: 'error', title: 'Unsupported image', detail: error });
      return;
    }
    setPendingFile(file);
    setCropUrl(URL.createObjectURL(file));
  }, [addToast]);

  const confirmCrop = (crop: CropRect) => {
    if (!pendingFile) return;
    const isFull = crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
    const file = pendingFile;
    setPendingFile(null);
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropUrl(null);
    void uploadAndAnalyze(file, isFull ? undefined : crop);
  };

  const closeCrop = () => {
    setPendingFile(null);
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropUrl(null);
  };

  const loadSample = async () => {
    setLoadingSample(true);
    try {
      const response = await fetch(publicAsset('test-seating-plan.png'));
      if (!response.ok) throw new Error('The bundled sample could not be loaded.');
      const blob = await response.blob();
      chooseFile(new File([blob], 'sample-seating-plan.png', { type: 'image/png' }));
    } catch (error) {
      addToast({ tone: 'error', title: 'Could not load sample', detail: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <main className="lumen-intro">
      <section className="lumen-intro-card" aria-labelledby="lumen-intro-title">
        <header className="lumen-intro-nav">
          <a className="lumen-intro-brand" href="#top" aria-label="Lumen home">
            Lumen
          </a>
          <button className="lumen-intro-nav-action" type="button" onClick={() => fileInputRef.current?.click()}>Get started</button>
        </header>

        <div className="lumen-intro-hero" id="top">
          <div className="lumen-intro-copy">
            <h1 id="lumen-intro-title">Turn seat plans<br />into 3D rooms.</h1>
            <p className="lumen-intro-description">
              Upload a cinema seating plan, explore the reconstructed auditorium, and preview the view from any seat.
            </p>
            <button
              className="lumen-intro-action"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onPointerMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                event.currentTarget.style.setProperty('--shine-x', `${event.clientX - bounds.left}px`);
                event.currentTarget.style.setProperty('--shine-y', `${event.clientY - bounds.top}px`);
              }}
              onPointerLeave={(event) => {
                event.currentTarget.style.removeProperty('--shine-x');
                event.currentTarget.style.removeProperty('--shine-y');
              }}
            >
              Upload a seat plan <ArrowUpRight size={17} aria-hidden="true" />
            </button>
            <button className="lumen-intro-sample" type="button" onClick={() => void loadSample()} disabled={loadingSample}>
              {loadingSample ? 'Loading sample…' : 'Try a sample seating plan'} <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          </div>

        </div>
        <div className="lumen-intro-corner lumen-intro-corner--left" aria-hidden="true">
          <img src={publicAsset('lumen-cinema-corners.png')} alt="" />
        </div>
        <div className="lumen-intro-corner lumen-intro-corner--right" aria-hidden="true">
          <img src={publicAsset('lumen-cinema-corners.png')} alt="" />
        </div>
      </section>

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) chooseFile(file);
        event.target.value = '';
      }} />
      <CropDialog open={Boolean(pendingFile && cropUrl)} imageUrl={cropUrl} fileName={pendingFile?.name} onClose={closeCrop} onConfirm={confirmCrop} />
    </main>
  );
}
