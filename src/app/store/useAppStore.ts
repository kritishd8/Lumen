import { create } from 'zustand';
import type {
  AnalysisProgress,
  AppStage,
  AuditoriumConfig,
  CameraCommand,
  CameraMode,
  ConfigFieldKey,
  DetectionResult,
  EditorTool,
  FloorPreset,
  LookRequest,
  MaterialPreset,
  ProjectRecord,
  ProjectSummary,
  Seat,
  SeatSection,
  SeatingLayout,
  ToastMessage,
} from '@/types';
import {
  createDefaultConfig,
  SCREEN_PRESETS,
  FLOOR_PRESETS,
  aspectValue,
} from '@/utils/defaults';
import { applyEstimates } from '@/modules/reconstruction/calibration';
import {
  addAisleToLayout,
  addSectionToLayout,
  createSeatAt,
  findNearestRowId,
  moveSeatToRow,
  nextSeatNumber,
  normaliseLayout,
  removeSectionFromLayout,
} from '@/modules/reconstruction/layout-utils';
import { screenBasis, projectToScreenAxes, rowLabelForIndex } from '@/modules/reconstruction/coordinates';
import { groupCandidatesIntoRows } from '@/modules/image-processing/segmentation';
import type { SeatCandidate } from '@/modules/image-processing/preprocessing';
import { prepareImage, validateImageFile } from '@/modules/image-processing/prepare';
import { detectionResultToLayout } from '@/modules/image-processing/detection';
import { runOcr } from '@/modules/image-processing/ocr';
import type { WorkerResponse } from '@/modules/image-processing/analysis.worker';
import {
  deleteProjectRecord,
  getImage,
  getProjectRecord,
  getProjectWithImage,
  listProjectSummaries,
  putImage,
  saveProjectRecord,
} from '@/modules/storage/db';
import {
  buildProjectExport,
  downloadProjectExport,
  importProjectFile,
} from '@/modules/storage/project-io';
import { clamp } from '@/modules/reconstruction/coordinates';

interface AppState {
  stage: AppStage;
  project: ProjectRecord | null;
  projects: ProjectSummary[];
  imageUrl: string | null;
  originalImageUrl: string | null;
  analysis: AnalysisProgress;
  toasts: ToastMessage[];
  pastLayouts: SeatingLayout[];
  futureLayouts: SeatingLayout[];
  selectedSeatIds: string[];
  editorTool: EditorTool;
  overlayVisible: boolean;
  cameraMode: CameraMode;
  compareSeatIds: [string | null, string | null];
  cameraCommand: CameraCommand;
  lookRequest: LookRequest;
  busy: boolean;
  configDirtyNonce: number;

  init: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  uploadAndAnalyze: (file: File, crop?: { x: number; y: number; width: number; height: number }) => Promise<void>;
  cancelAnalysis: () => void;
  openProject: (id: string) => Promise<void>;
  setStage: (stage: AppStage) => void;
  goHome: () => void;

  setEditorTool: (tool: EditorTool) => void;
  setOverlayVisible: (visible: boolean) => void;
  selectSeat: (id: string | null, additive?: boolean) => void;
  setSelectedSeats: (ids: string[]) => void;
  updateSeat: (id: string, patch: Partial<Seat>) => void;
  updateSeats: (ids: string[], patch: Partial<Seat>) => void;
  addSeat: (x: number, y: number, rowId?: string) => string | null;
  deleteSeats: (ids: string[]) => void;
  moveSeatToRow: (seatId: string, rowId: string) => void;
  setScreenPlacement: (screen: Partial<SeatingLayout['screen']>) => void;
  regroupRows: () => void;
  addAisle: (x: number, y: number, orientation?: 'vertical' | 'horizontal') => void;
  deleteAisle: (id: string) => void;
  addSection: () => void;
  removeSection: (id: string) => void;
  renameSection: (id: string, name: string) => void;
  assignSeatsToSection: (ids: string[], sectionId: string) => void;
  undo: () => void;
  redo: () => void;

  updateConfigField: (field: ConfigFieldKey, value: number | string) => void;
  setScreenPreset: (presetId: string, widthM: number) => void;
  setAspectPreset: (preset: AuditoriumConfig['screen']['aspectRatio']) => void;
  setFloorPreset: (preset: FloorPreset) => void;
  setMaterialPreset: (preset: MaterialPreset, customColor?: string) => void;
  setScreenImage: (dataUrl: string | undefined) => void;
  setConfigFlag: (field: 'stage.enabled' | 'screen.curved', value: boolean) => void;
  resetConfig: () => void;

  setCameraMode: (mode: CameraMode) => void;
  enterSeatView: (seatId: string) => void;
  exitSeatView: () => void;
  requestCamera: (type: CameraCommand['type']) => void;
  requestLook: (yawDeg: number, pitchDeg: number) => void;
  setCompareSeat: (index: 0 | 1, seatId: string | null) => void;
  enterComparison: () => void;

  renameProject: (name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  exportCurrentProject: () => Promise<void>;
  importProject: (file: File) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

const initialAnalysis: AnalysisProgress = {
  status: 'idle',
  percent: 0,
  step: '',
  logs: [],
};

let analysisWorker: Worker | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function projectNameFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return 'Untitled cinema';
  return base.replace(/\b\w/g, (character) => character.toUpperCase());
}

function setNestedNumber(
  config: AuditoriumConfig,
  field: ConfigFieldKey,
  value: number,
): void {
  const [group, key] = field.split('.');
  if (key) {
    const target = (config as unknown as Record<string, Record<string, number>>)[group];
    if (target) target[key] = value;
  } else {
    (config as unknown as Record<string, number>)[group] = value;
  }
}

function updateLayoutWithHistory(
  state: AppState,
  layout: SeatingLayout,
  history = true,
): Partial<AppState> {
  if (!state.project) return {};
  const nextLayout = normaliseLayout(layout);
  return {
    project: {
      ...state.project,
      layout: nextLayout,
      updatedAt: Date.now(),
    },
    pastLayouts: history
      ? [...state.pastLayouts, state.project.layout].slice(-60)
      : state.pastLayouts,
    futureLayouts: history ? [] : state.futureLayouts,
    selectedSeatIds: state.selectedSeatIds.filter((id) =>
      nextLayout.seats.some((seat) => seat.id === id),
    ),
    compareSeatIds: [
      nextLayout.seats.some((seat) => seat.id === state.compareSeatIds[0])
        ? state.compareSeatIds[0]
        : null,
      nextLayout.seats.some((seat) => seat.id === state.compareSeatIds[1])
        ? state.compareSeatIds[1]
        : null,
    ],
  };
}

function pseudoCandidates(layout: SeatingLayout): SeatCandidate[] {
  return layout.seats.map((seat) => ({
    x: seat.x * layout.imageWidth - (seat.width * layout.imageWidth) / 2,
    y: seat.y * layout.imageHeight - (seat.depth * layout.imageHeight) / 2,
    w: Math.max(2, seat.width * layout.imageWidth),
    h: Math.max(2, seat.depth * layout.imageHeight),
    cx: seat.x * layout.imageWidth,
    cy: seat.y * layout.imageHeight,
    area: seat.width * layout.imageWidth * seat.depth * layout.imageHeight,
    fill: 0.8,
    color: { r: 80, g: 80, b: 80 },
    saturation: 0,
    luminance: 0.3,
    support: 1,
    score: 1,
    maskName: 'manual',
  }));
}

function regroupLayoutRows(layout: SeatingLayout): SeatingLayout {
  if (!layout.seats.length) return layout;
  const basis = screenBasis(layout.screen, layout.imageWidth, layout.imageHeight, layout.seats);
  const candidates = pseudoCandidates(layout);
  const grouped = groupCandidatesIntoRows(
    candidates,
    basis,
    layout.imageWidth,
    layout.imageHeight,
  );
  const assignmentBySeatIndex = new Map(
    grouped.assignments.map((assignment) => [assignment.candidateIndex, assignment]),
  );
  const nextSeats = layout.seats.map((seat, index) => {
    const assignment = assignmentBySeatIndex.get(index);
    const rowIndex = assignment?.rowIndex ?? 0;
    return {
      ...seat,
      rowId: `row-${rowIndex + 1}`,
      rowLabel: rowLabelForIndex(rowIndex),
    };
  });
  const rows = Array.from({ length: grouped.rowCount }, (_, index) => {
    const rowSeats = nextSeats.filter((seat) => seat.rowId === `row-${index + 1}`);
    return {
      id: `row-${index + 1}`,
      label: rowLabelForIndex(index),
      index,
      depth: (grouped.rowDepths[index] ?? 0) / layout.imageHeight,
      seatIds: rowSeats.map((seat) => seat.id),
      confidence: rowSeats.length
        ? rowSeats.reduce((sum, seat) => sum + seat.confidence, 0) / rowSeats.length
        : 0.4,
    };
  });
  return normaliseLayout({ ...layout, seats: nextSeats, rows });
}

export const useAppStore = create<AppState>((set, get) => ({
  stage: 'home',
  project: null,
  projects: [],
  imageUrl: null,
  originalImageUrl: null,
  analysis: initialAnalysis,
  toasts: [],
  pastLayouts: [],
  futureLayouts: [],
  selectedSeatIds: [],
  editorTool: 'select',
  overlayVisible: true,
  cameraMode: 'overview',
  compareSeatIds: [null, null],
  cameraCommand: { type: 'fit', nonce: 0 },
  lookRequest: { yawDeg: 0, pitchDeg: 0, nonce: 0 },
  busy: false,
  configDirtyNonce: 0,

  init: async () => {
    await get().refreshProjects();
  },

  refreshProjects: async () => {
    try {
      const projects = await listProjectSummaries();
      set({ projects });
    } catch (error) {
      get().addToast({
        tone: 'error',
        title: 'Could not read local projects',
        detail: error instanceof Error ? error.message : 'IndexedDB is unavailable.',
      });
    }
  },

  uploadAndAnalyze: async (file, crop) => {
    const validationError = validateImageFile(file);
    if (validationError) {
      get().addToast({ tone: 'error', title: 'Unsupported image', detail: validationError });
      return;
    }
    analysisWorker?.terminate();
    analysisWorker = null;
    set({
      stage: 'analyzing',
      analysis: {
        status: 'preparing',
        percent: 2,
        step: 'Preparing screenshot',
        logs: ['Validating image and preparing a local analysis copy.'],
      },
      project: null,
      imageUrl: null,
      originalImageUrl: null,
      cameraMode: 'overview',
      pastLayouts: [],
      futureLayouts: [],
      selectedSeatIds: [],
    });

    try {
      const prepared = await prepareImage(file, crop);
      set({
        imageUrl: prepared.analysisUrl,
        originalImageUrl: prepared.originalUrl,
        analysis: {
          status: 'detecting',
          percent: 8,
          step: 'Starting vision worker',
          logs: [
            `Analysed at ${prepared.width} × ${prepared.height}px${
              prepared.wasScaled ? ' (downscaled from the original for speed)' : ''
            }.`,
            'Running colour segmentation, shape scoring, row grouping and OpenCV cleanup locally.',
          ],
        },
      });

      const worker = new Worker(
        new URL('../../modules/image-processing/analysis.worker.ts', import.meta.url),
        { type: 'module' },
      );
      analysisWorker = worker;

      const result = await new Promise<DetectionResult>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const message = event.data;
          if (message.type === 'progress') {
            set((state) => ({
              analysis: {
                ...state.analysis,
                status: 'detecting',
                percent: Math.max(state.analysis.percent, message.percent),
                step: message.step,
                logs:
                  state.analysis.logs[state.analysis.logs.length - 1] === message.step
                    ? state.analysis.logs
                    : [...state.analysis.logs, message.step],
              },
            }));
          } else if (message.type === 'result') {
            resolve(message.result);
          } else if (message.type === 'error') {
            reject(new Error(message.message));
          }
        };
        worker.onerror = (event) => reject(new Error(event.message || 'Vision worker failed.'));
        worker.postMessage({
          type: 'analyze',
          imageData: prepared.imageData,
          originalWidth: prepared.originalWidth,
          originalHeight: prepared.originalHeight,
        });
      });
      worker.terminate();
      analysisWorker = null;

      let layout = detectionResultToLayout(result);
      let ocrNote = '';
      set((state) => ({
        analysis: {
          ...state.analysis,
          status: 'ocr',
          percent: 91,
          step: 'Reading visible seat labels',
          logs: [
            ...state.analysis.logs,
            'Seat map found. Reading seat numbers and row labels with local OCR.',
          ],
        },
      }));

      try {
        const ocrResult = await Promise.race([
          runOcr(prepared.analysisUrl, layout, (percent, step) => {
            set((state) => ({
              analysis: {
                ...state.analysis,
                percent: 91 + Math.round(percent * 0.07),
                step,
              },
            }));
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('OCR timed out')), 28000),
          ),
        ]);
        layout = ocrResult.layout;
        ocrNote = `OCR read ${ocrResult.seatNumbersRead} seat numbers and ${ocrResult.rowLabelsRead} row labels.`;
        if (!ocrResult.seatNumbersRead) {
          ocrNote += ' No reliable seat numbers were found; labels can be added in the editor.';
        }
      } catch (error) {
        layout.stats = {
          ...layout.stats,
          ocrUsed: false,
          warnings: [
            ...layout.stats.warnings,
            'OCR labels could not be read (the language model may not be available offline). Seat geometry is unaffected; labels can be entered manually.',
          ],
        };
        ocrNote = 'OCR was skipped or unavailable. Seat geometry is unaffected.';
      }

      let config = createDefaultConfig();
      const estimateResult = applyEstimates(layout, config);
      config = estimateResult.config;
      const now = Date.now();
      const projectId = `project-${crypto.randomUUID()}`;
      const imageKey = `image-${crypto.randomUUID()}`;
      const originalKey = `original-${crypto.randomUUID()}`;
      await putImage(imageKey, prepared.analysisBlob);
      await putImage(originalKey, prepared.file);

      const project: ProjectRecord = {
        id: projectId,
        version: 1,
        name: projectNameFromFile(file.name),
        createdAt: now,
        updatedAt: now,
        stage: 'verify',
        image: {
          key: imageKey,
          originalKey,
          crop: prepared.crop,
          name: file.name,
          mimeType: file.type || 'image/png',
          size: file.size,
          width: prepared.width,
          height: prepared.height,
          originalWidth: prepared.originalWidth,
          originalHeight: prepared.originalHeight,
        },
        layout,
        config,
        analysisNotes: [
          ...layout.stats.warnings,
          ...estimateResult.assumptions,
          ocrNote,
        ],
      };
      await saveProjectRecord(project);
      set({
        project,
        stage: 'verify',
        analysis: {
          status: 'complete',
          percent: 100,
          step: 'Auditorium ready',
          logs: [
            ...get().analysis.logs,
            ocrNote,
            `${layout.seats.length} seats in ${layout.rows.length} rows across ${layout.sections.length} section${layout.sections.length === 1 ? '' : 's'}.`,
            'Review the detected plan, then open the live auditorium.',
          ],
        },
      });
      await get().refreshProjects();
      get().addToast({
        tone: layout.seats.length ? 'success' : 'warning',
        title: layout.seats.length ? 'Seat plan ready to review' : 'No seats found',
        detail: layout.seats.length
          ? `${layout.seats.length} seats detected. Check the plan before opening the auditorium.`
          : 'Use the plan editor to add seats manually or try a tighter crop.',
      });
    } catch (error) {
      analysisWorker?.terminate();
      analysisWorker = null;
      const message = error instanceof Error ? error.message : 'Image analysis failed.';
      set((state) => ({
        analysis: {
          ...state.analysis,
          status: 'error',
          step: 'Analysis failed',
          error: message,
          logs: [...state.analysis.logs, message],
        },
      }));
      get().addToast({ tone: 'error', title: 'Analysis failed', detail: message });
    }
  },

  cancelAnalysis: () => {
    analysisWorker?.terminate();
    analysisWorker = null;
    set({ stage: 'home', analysis: initialAnalysis, imageUrl: null, originalImageUrl: null });
  },

  openProject: async (id) => {
    try {
      set({ busy: true });
      const loaded = await getProjectWithImage(id);
      if (!loaded) throw new Error('Project or image data is missing.');
      const stage: AppStage =
        loaded.project.stage === 'home' || loaded.project.stage === 'analyzing'
          ? loaded.project.layout.seats.length
            ? 'verify'
            : 'home'
          : loaded.project.stage;
      set({
        project: loaded.project,
        imageUrl: loaded.imageUrl,
        originalImageUrl: loaded.originalUrl ?? null,
        stage,
        selectedSeatIds: [],
        pastLayouts: [],
        futureLayouts: [],
        cameraMode: 'overview',
        compareSeatIds: [null, null],
        editorTool: 'select',
        overlayVisible: true,
      });
    } catch (error) {
      get().addToast({
        tone: 'error',
        title: 'Could not open project',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      set({ busy: false });
    }
  },

  setStage: (stage) => {
    const { project } = get();
    if (!project) {
      set({ stage });
      return;
    }
    set({
      stage,
      project: { ...project, stage, updatedAt: Date.now() },
      ...(stage === 'compare'
        ? {
            compareSeatIds: [
              project.layout.seats.some((seat) => seat.id === get().selectedSeatIds[0])
                ? get().selectedSeatIds[0]
                : project.layout.seats[0]?.id ?? null,
              project.layout.seats.some((seat) => seat.id === get().compareSeatIds[1])
                ? get().compareSeatIds[1]
                : project.layout.seats[1]?.id ?? project.layout.seats[0]?.id ?? null,
            ],
          }
        : {}),
    });
  },

  goHome: () => {
    set({
      stage: 'home',
      cameraMode: 'overview',
      selectedSeatIds: [],
      editorTool: 'select',
    });
    void get().refreshProjects();
  },

  setEditorTool: (editorTool) => set({ editorTool }),
  setOverlayVisible: (overlayVisible) => set({ overlayVisible }),

  selectSeat: (id, additive = false) => {
    if (!id) {
      set({ selectedSeatIds: [] });
      return;
    }
    if (additive) {
      const current = get().selectedSeatIds;
      set({
        selectedSeatIds: current.includes(id)
          ? current.filter((seatId) => seatId !== id)
          : [...current, id],
      });
    } else {
      set({ selectedSeatIds: [id] });
    }
  },

  setSelectedSeats: (selectedSeatIds) => set({ selectedSeatIds }),

  updateSeat: (id, patch) => {
    const state = get();
    if (!state.project) return;
    const layout = state.project.layout;
    const seats = layout.seats.map((seat) => (seat.id === id ? { ...seat, ...patch } : seat));
    let rows = layout.rows;
    if (patch.rowId) {
      const row = layout.rows.find((item) => item.id === patch.rowId);
      if (row) {
        const seat = seats.find((item) => item.id === id);
        if (seat) {
          seat.rowLabel = row.label;
          if (!seat.seatNumber) seat.seatNumber = nextSeatNumber(layout, row.id);
        }
      }
    }
    if (patch.rowLabel) {
      rows = layout.rows.map((row) =>
        row.id === seats.find((seat) => seat.id === id)?.rowId
          ? { ...row, label: patch.rowLabel as string }
          : row,
      );
    }
    set(updateLayoutWithHistory(state, { ...layout, seats, rows }));
  },

  updateSeats: (ids, patch) => {
    const state = get();
    if (!state.project) return;
    const idSet = new Set(ids);
    const layout = state.project.layout;
    const seats = layout.seats.map((seat) => (idSet.has(seat.id) ? { ...seat, ...patch } : seat));
    set(updateLayoutWithHistory(state, { ...layout, seats }));
  },

  addSeat: (x, y, rowId) => {
    const state = get();
    if (!state.project) return null;
    let layout = state.project.layout;
    if (!layout.rows.length) {
      layout = {
        ...layout,
        rows: [
          {
            id: 'row-1',
            label: 'A',
            index: 0,
            depth: y,
            seatIds: [],
            confidence: 1,
          },
        ],
      };
    }
    const targetRow = rowId ?? findNearestRowId(layout, x, y);
    const seat = createSeatAt(layout, x, y, targetRow ?? undefined);
    const next = normaliseLayout({
      ...layout,
      seats: [...layout.seats, seat],
    });
    set({
      ...updateLayoutWithHistory(state, next),
      selectedSeatIds: [seat.id],
      editorTool: 'select',
    });
    return seat.id;
  },

  deleteSeats: (ids) => {
    const state = get();
    if (!state.project) return;
    const idSet = new Set(ids);
    const layout = state.project.layout;
    let seats = layout.seats.filter((seat) => !idSet.has(seat.id));
    let rows = layout.rows
      .map((row) => ({ ...row, seatIds: row.seatIds.filter((id) => !idSet.has(id)) }))
      .filter((row) => row.seatIds.length > 0)
      .map((row, index) => ({ ...row, index }));
    // Empty rows are retained when they carry a user-visible label and no
    // seats remain? Removing them keeps row counts honest.
    const next = normaliseLayout({ ...layout, seats, rows });
    set({
      ...updateLayoutWithHistory(state, next),
      selectedSeatIds: [],
    });
  },

  moveSeatToRow: (seatId, rowId) => {
    const state = get();
    if (!state.project) return;
    const next = moveSeatToRow(state.project.layout, seatId, rowId);
    set(updateLayoutWithHistory(state, next));
  },

  setScreenPlacement: (patch) => {
    const state = get();
    if (!state.project) return;
    const layout = {
      ...state.project.layout,
      screen: {
        ...state.project.layout.screen,
        ...patch,
        source: 'manual' as const,
        confidence: 1,
      },
    };
    const regrouped = regroupLayoutRows(layout);
    set(updateLayoutWithHistory(state, regrouped));
  },

  regroupRows: () => {
    const state = get();
    if (!state.project) return;
    set(updateLayoutWithHistory(state, regroupLayoutRows(state.project.layout)));
  },

  addAisle: (x, y, orientation = 'vertical') => {
    const state = get();
    if (!state.project) return;
    set(updateLayoutWithHistory(state, addAisleToLayout(state.project.layout, x, y, orientation)));
  },

  deleteAisle: (id) => {
    const state = get();
    if (!state.project) return;
    set(
      updateLayoutWithHistory(state, {
        ...state.project.layout,
        aisles: state.project.layout.aisles.filter((aisle) => aisle.id !== id),
      }),
    );
  },

  addSection: () => {
    const state = get();
    if (!state.project) return;
    set(updateLayoutWithHistory(state, addSectionToLayout(state.project.layout)));
  },

  removeSection: (id) => {
    const state = get();
    if (!state.project) return;
    set(updateLayoutWithHistory(state, removeSectionFromLayout(state.project.layout, id)));
  },

  renameSection: (id, name) => {
    const state = get();
    if (!state.project) return;
    set(
      updateLayoutWithHistory(state, {
        ...state.project.layout,
        sections: state.project.layout.sections.map((section) =>
          section.id === id ? { ...section, name } : section,
        ),
      }),
    );
  },

  assignSeatsToSection: (ids, sectionId) => {
    const state = get();
    if (!state.project) return;
    const idSet = new Set(ids);
    const layout = state.project.layout;
    const seats = layout.seats.map((seat) =>
      idSet.has(seat.id) ? { ...seat, sectionId } : seat,
    );
    set(updateLayoutWithHistory(state, { ...layout, seats }));
  },

  undo: () => {
    const state = get();
    if (!state.project || !state.pastLayouts.length) return;
    const previous = state.pastLayouts[state.pastLayouts.length - 1];
    set({
      project: { ...state.project, layout: previous, updatedAt: Date.now() },
      pastLayouts: state.pastLayouts.slice(0, -1),
      futureLayouts: [state.project.layout, ...state.futureLayouts].slice(0, 60),
      selectedSeatIds: state.selectedSeatIds.filter((id) =>
        previous.seats.some((seat) => seat.id === id),
      ),
    });
  },

  redo: () => {
    const state = get();
    if (!state.project || !state.futureLayouts.length) return;
    const next = state.futureLayouts[0];
    set({
      project: { ...state.project, layout: next, updatedAt: Date.now() },
      pastLayouts: [...state.pastLayouts, state.project.layout].slice(-60),
      futureLayouts: state.futureLayouts.slice(1),
    });
  },

  updateConfigField: (field, value) => {
    const state = get();
    if (!state.project) return;
    let config = structuredClone(state.project.config);
    if (field === 'screen.aspectRatio') {
      config.screen.aspectRatio = value as AuditoriumConfig['screen']['aspectRatio'];
      config.sources[field] = 'user';
      if (config.sources['screen.heightM'] !== 'user') {
        config.screen.heightM =
          config.screen.widthM /
          Math.max(1, aspectValue(config.screen.aspectRatio, config.screen.customAspect));
        config.sources['screen.heightM'] = 'estimated';
      }
    } else if (field === 'screen.customAspect') {
      config.screen.customAspect = Math.max(1, Number(value));
      config.screen.aspectRatio = 'custom';
      config.sources[field] = 'user';
      config.sources['screen.aspectRatio'] = 'user';
      if (config.sources['screen.heightM'] !== 'user') {
        config.screen.heightM = config.screen.widthM / config.screen.customAspect;
        config.sources['screen.heightM'] = 'estimated';
      }
    } else if (field === 'screen.widthM') {
      config.screen.widthM = Number(value);
      config.sources[field] = 'user';
      if (config.sources['screen.heightM'] !== 'user') {
        config.screen.heightM =
          config.screen.widthM /
          Math.max(1, aspectValue(config.screen.aspectRatio, config.screen.customAspect));
        config.sources['screen.heightM'] = 'estimated';
      }
      if (!SCREEN_PRESETS.some((preset) => preset.widthM === config.screen.widthM)) {
        config.screen.preset = 'custom';
      }
    } else if (field === 'floor.slopePercent') {
      const numeric = Number(value);
      config.floor.slopePercent = numeric;
      const matching = Object.entries(FLOOR_PRESETS).find(
        ([, preset]) => preset.slopePercent === numeric,
      );
      config.floor.preset = (matching?.[0] as FloorPreset) ?? 'custom';
      config.sources[field] = 'user';
    } else {
      const numeric = Number(value);
      setNestedNumber(config, field, numeric);
      config.sources[field] = 'user';
      if (field === 'seatWidthM' || field === 'seating.seatWidthM') {
        config.seatWidthM = numeric;
        config.seating.seatWidthM = numeric;
        config.sources.seatWidthM = 'user';
        config.sources['seating.seatWidthM'] = 'user';
      }
      if (field === 'seatDepthM' || field === 'seating.seatDepthM') {
        config.seatDepthM = numeric;
        config.seating.seatDepthM = numeric;
        config.sources.seatDepthM = 'user';
        config.sources['seating.seatDepthM'] = 'user';
      }
    }
    config = applyEstimates(state.project.layout, config).config;
    set({
      project: { ...state.project, config, updatedAt: Date.now() },
      configDirtyNonce: state.configDirtyNonce + 1,
    });
  },

  setScreenPreset: (presetId, widthM) => {
    const state = get();
    if (!state.project) return;
    let config = structuredClone(state.project.config);
    config.screen.preset = presetId;
    config.screen.widthM = widthM;
    config.sources['screen.widthM'] = 'user';
    if (config.sources['screen.heightM'] !== 'user') {
      config.screen.heightM =
        widthM / Math.max(1, aspectValue(config.screen.aspectRatio, config.screen.customAspect));
      config.sources['screen.heightM'] = 'estimated';
    }
    config = applyEstimates(state.project.layout, config).config;
    set({ project: { ...state.project, config, updatedAt: Date.now() } });
  },

  setAspectPreset: (preset) => {
    get().updateConfigField('screen.aspectRatio', preset);
  },

  setFloorPreset: (preset) => {
    const state = get();
    if (!state.project) return;
    let config = structuredClone(state.project.config);
    config.floor.preset = preset;
    config.floor.slopePercent = FLOOR_PRESETS[preset].slopePercent;
    config.sources['floor.slopePercent'] = preset === 'custom' ? 'user' : 'user';
    config = applyEstimates(state.project.layout, config).config;
    set({ project: { ...state.project, config, updatedAt: Date.now() } });
  },

  setMaterialPreset: (preset, customColor) => {
    const state = get();
    if (!state.project) return;
    const config = structuredClone(state.project.config);
    config.materialPreset = preset;
    if (customColor) config.customSeatColor = customColor;
    set({ project: { ...state.project, config, updatedAt: Date.now() } });
  },

  setScreenImage: (dataUrl) => {
    const state = get();
    if (!state.project) return;
    const config = structuredClone(state.project.config);
    config.screenImageDataUrl = dataUrl;
    set({ project: { ...state.project, config, updatedAt: Date.now() } });
  },

  setConfigFlag: (field, value) => {
    const state = get();
    if (!state.project) return;
    const config = structuredClone(state.project.config);
    if (field === 'stage.enabled') config.stage.enabled = value;
    if (field === 'screen.curved') config.screen.curved = value;
    set({ project: { ...state.project, config, updatedAt: Date.now() } });
  },

  resetConfig: () => {
    const state = get();
    if (!state.project) return;
    const config = applyEstimates(state.project.layout, createDefaultConfig()).config;
    set({ project: { ...state.project, config, updatedAt: Date.now() } });
    get().addToast({
      tone: 'info',
      title: 'Auditorium settings reset',
      detail: 'Measurements returned to estimates and defaults. Detected seat positions are unchanged.',
    });
  },

  setCameraMode: (cameraMode) => set({ cameraMode }),
  enterSeatView: (seatId) =>
    set({
      cameraMode: 'seat',
      selectedSeatIds: [seatId],
    }),
  exitSeatView: () =>
    set((state) => ({
      cameraMode: 'overview',
      cameraCommand: { type: 'fit', nonce: state.cameraCommand.nonce + 1 },
    })),
  requestCamera: (type) =>
    set((state) => ({
      cameraCommand: { type, nonce: state.cameraCommand.nonce + 1 },
    })),
  requestLook: (yawDeg, pitchDeg) =>
    set((state) => ({
      lookRequest: {
        yawDeg,
        pitchDeg,
        nonce: state.lookRequest.nonce + 1,
      },
    })),
  setCompareSeat: (index, seatId) =>
    set((state) => {
      const next: [string | null, string | null] = [...state.compareSeatIds];
      next[index] = seatId;
      return { compareSeatIds: next };
    }),
  enterComparison: () => {
    const state = get();
    if (!state.project) return;
    const selected = state.selectedSeatIds[0] ?? state.project.layout.seats[0]?.id ?? null;
    const other =
      state.compareSeatIds[1] ??
      state.project.layout.seats.find((seat) => seat.id !== selected)?.id ??
      selected;
    set({
      stage: 'compare',
      compareSeatIds: [selected, other],
      project: { ...state.project, stage: 'compare', updatedAt: Date.now() },
    });
  },

  renameProject: async (name) => {
    const state = get();
    if (!state.project) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = { ...state.project, name: trimmed, updatedAt: Date.now() };
    set({ project });
    await saveProjectRecord(project);
    await get().refreshProjects();
  },

  deleteProject: async (id) => {
    const state = get();
    const record = await getProjectRecord(id);
    if (record) await deleteProjectRecord(record);
    if (state.project?.id === id) {
      set({
        project: null,
        stage: 'home',
        imageUrl: null,
        originalImageUrl: null,
        selectedSeatIds: [],
      });
    }
    await get().refreshProjects();
    get().addToast({ tone: 'success', title: 'Project deleted' });
  },

  duplicateProject: async (id) => {
    try {
      const record = await getProjectRecord(id);
      if (!record) throw new Error('Project not found.');
      const image = await getImage(record.image.key);
      if (!image) throw new Error('Project image not found.');
      const newId = `project-${crypto.randomUUID()}`;
      const imageKey = `image-${crypto.randomUUID()}`;
      const originalKey = record.image.originalKey
        ? `original-${crypto.randomUUID()}`
        : undefined;
      await putImage(imageKey, image);
      if (record.image.originalKey && originalKey) {
        const original = await getImage(record.image.originalKey);
        if (original) await putImage(originalKey, original);
      }
      const now = Date.now();
      const duplicate: ProjectRecord = {
        ...structuredClone(record),
        id: newId,
        name: `${record.name} copy`,
        createdAt: now,
        updatedAt: now,
        stage: 'verify',
        image: {
          ...record.image,
          key: imageKey,
          originalKey,
        },
      };
      await saveProjectRecord(duplicate);
      await get().refreshProjects();
      get().addToast({ tone: 'success', title: 'Project duplicated' });
    } catch (error) {
      get().addToast({
        tone: 'error',
        title: 'Could not duplicate project',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  exportCurrentProject: async () => {
    const state = get();
    if (!state.project) return;
    try {
      const data = await buildProjectExport(state.project);
      downloadProjectExport(data, state.project.name);
      get().addToast({ tone: 'success', title: 'Project exported', detail: 'JSON includes the layout, settings and screenshot.' });
    } catch (error) {
      get().addToast({
        tone: 'error',
        title: 'Export failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  importProject: async (file) => {
    try {
      const project = await importProjectFile(file);
      await get().refreshProjects();
      await get().openProject(project.id);
      get().addToast({ tone: 'success', title: 'Project imported', detail: project.name });
    } catch (error) {
      get().addToast({
        tone: 'error',
        title: 'Import failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  saveCurrentProject: async () => {
    const state = get();
    if (!state.project) return;
    const project = { ...state.project, updatedAt: Date.now() };
    set({ project });
    await saveProjectRecord(project);
    get().addToast({ tone: 'success', title: 'Project saved locally' });
  },

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => get().removeToast(id), 5200);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

// Debounced auto-save. Every project mutation updates the project object, so
// the app survives refreshes without requiring a manual save.
useAppStore.subscribe((state, previous) => {
  if (!state.project || state.project === previous.project) return;
  if (saveTimer) clearTimeout(saveTimer);
  const project = state.project;
  saveTimer = setTimeout(() => {
    void saveProjectRecord(project).catch((error) => {
      console.error('Auto-save failed', error);
    });
  }, 450);
});
