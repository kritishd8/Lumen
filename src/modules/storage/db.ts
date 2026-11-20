import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProjectRecord, ProjectSummary } from '@/types';

interface CinemaDb extends DBSchema {
  projects: {
    key: string;
    value: ProjectRecord;
    indexes: { 'by-updated': number };
  };
  images: {
    key: string;
    value: Blob;
  };
}

let dbPromise: Promise<IDBPDatabase<CinemaDb>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<CinemaDb>('lumen-cinema-reconstruction', 1, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('by-updated', 'updatedAt');
        db.createObjectStore('images');
      },
    });
  }
  return dbPromise;
}

export async function putImage(key: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('images', blob, key);
}

export async function getImage(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('images', key);
}

export async function deleteImage(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('images', key);
}

export async function saveProjectRecord(project: ProjectRecord): Promise<void> {
  const db = await getDb();
  await db.put('projects', project);
}

export async function getProjectRecord(id: string): Promise<ProjectRecord | undefined> {
  const db = await getDb();
  return db.get('projects', id);
}

export async function deleteProjectRecord(project: ProjectRecord): Promise<void> {
  const db = await getDb();
  await db.delete('projects', project.id);
  await db.delete('images', project.image.key);
  if (project.image.originalKey) {
    await db.delete('images', project.image.originalKey);
  }
}

export async function listProjectRecords(): Promise<ProjectRecord[]> {
  const db = await getDb();
  const records = await db.getAll('projects');
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const records = await listProjectRecords();
  return Promise.all(
    records.map(async (record) => {
      const image = await getImage(record.image.key);
      return {
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        stage: record.stage,
        seatCount: record.layout.seats.length,
        rowCount: record.layout.rows.length,
        imageUrl: image ? URL.createObjectURL(image) : undefined,
      };
    }),
  );
}

export async function getProjectWithImage(
  id: string,
): Promise<{ project: ProjectRecord; imageUrl: string; originalUrl?: string } | null> {
  const project = await getProjectRecord(id);
  if (!project) return null;
  const image = await getImage(project.image.key);
  if (!image) return null;
  const original = project.image.originalKey
    ? await getImage(project.image.originalKey)
    : undefined;
  return {
    project,
    imageUrl: URL.createObjectURL(image),
    originalUrl: original ? URL.createObjectURL(original) : undefined,
  };
}

export async function clearAllProjects(): Promise<void> {
  const db = await getDb();
  await db.clear('projects');
  await db.clear('images');
}
