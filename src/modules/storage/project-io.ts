import type { ProjectExport, ProjectRecord } from '@/types';
import { APP_VERSION } from '@/utils/defaults';
import { getImage, putImage, saveProjectRecord } from './db';

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image data.'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(',');
  if (!header || body === undefined) throw new Error('Invalid embedded image.');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function buildProjectExport(project: ProjectRecord): Promise<ProjectExport> {
  const image = await getImage(project.image.key);
  if (!image) throw new Error('The project image is missing from local storage.');
  const imageDataUrl = await blobToDataUrl(image);
  return {
    format: 'lumen-cinema-project',
    version: 1,
    exportedAt: Date.now(),
    project,
    imageDataUrl,
  };
}

export function downloadProjectExport(exportData: ProjectExport, projectName: string): void {
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${projectName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-lumen.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function validateProjectExport(input: unknown): ProjectExport {
  if (!input || typeof input !== 'object') throw new Error('The file is not a Lumen project.');
  const candidate = input as Partial<ProjectExport>;
  if (candidate.format !== 'lumen-cinema-project' || candidate.version !== 1) {
    throw new Error('Unsupported project format or version.');
  }
  if (!candidate.project || !candidate.imageDataUrl) {
    throw new Error('The project file is missing its layout or image.');
  }
  const project = candidate.project as ProjectRecord;
  if (
    !project.id ||
    !project.name ||
    !project.layout ||
    !Array.isArray(project.layout.seats) ||
    !Array.isArray(project.layout.rows) ||
    !project.config?.screen
  ) {
    throw new Error('The project file is incomplete.');
  }
  return candidate as ProjectExport;
}

export async function importProjectFile(file: File): Promise<ProjectRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  const data = validateProjectExport(parsed);
  const imageBlob = dataUrlToBlob(data.imageDataUrl);
  const id = `project-${crypto.randomUUID()}`;
  const imageKey = `image-${crypto.randomUUID()}`;
  const now = Date.now();
  const project: ProjectRecord = {
    ...data.project,
    id,
    name: data.project.name || 'Imported cinema',
    createdAt: now,
    updatedAt: now,
    image: {
      ...data.project.image,
      key: imageKey,
      originalKey: undefined,
      name: data.project.image?.name ?? 'imported-seating-plan.png',
      mimeType: imageBlob.type || 'image/png',
      size: imageBlob.size,
      width: data.project.layout.imageWidth,
      height: data.project.layout.imageHeight,
      originalWidth: data.project.layout.imageWidth,
      originalHeight: data.project.layout.imageHeight,
    },
  };
  await putImage(imageKey, imageBlob);
  await saveProjectRecord(project);
  return project;
}

export function projectExportFilename(projectName: string): string {
  return `${projectName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-lumen-v${APP_VERSION}.json`;
}
