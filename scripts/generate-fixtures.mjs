import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const fixtureDir = path.join(root, 'test-fixtures');

const AVAILABLE = '#b84b50';
const OCCUPIED = '#4a4d55';
const UNKNOWN = '#8a6a42';

function escapeXml(value) {
  return String(value).replace(/[<>&"]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      default:
        return '&quot;';
    }
  });
}

function statusFor(index, rowIndex) {
  const value = (index * 7 + rowIndex * 5) % 13;
  if (value < 7) return 'available';
  if (value < 11) return 'occupied';
  return 'unknown';
}

function colorFor(status) {
  return status === 'available' ? AVAILABLE : status === 'occupied' ? OCCUPIED : UNKNOWN;
}

function createPlan({
  width,
  height,
  title,
  screen,
  rows,
  seatWidth,
  seatHeight,
  pitch,
  rowPitch,
  curvature,
  seatRadius,
  fontSize,
  leftLabels = true,
}) {
  const seats = [];
  const rowGroups = [];

  rows.forEach((row, rowIndex) => {
    const rowSeats = [];
    row.slots.forEach((slot, index) => {
      if (row.skips?.includes(slot)) return;
      const x = row.left + slot * pitch;
      const yBase = row.y;
      const normalised = (x + seatWidth / 2 - width / 2) / (width / 2);
      const y = Math.round(yBase + curvature * normalised * normalised);
      const status = statusFor(index, rowIndex);
      const number = String(row.numberStart + index);
      rowSeats.push({
        row: row.label,
        number,
        slot,
        x: x + seatWidth / 2,
        y: y + seatHeight / 2,
        width: seatWidth,
        height: seatHeight,
        status,
      });
    });
    seats.push(...rowSeats);
    rowGroups.push({
      label: row.label,
      y: row.y,
      seats: rowSeats.length,
      firstX: rowSeats[0]?.x,
      lastX: rowSeats[rowSeats.length - 1]?.x,
    });
  });

  const seatMarkup = seats
    .map((seat) => {
      const x = seat.x - seatWidth / 2;
      const y = seat.y - seatHeight / 2;
      return `<g>
        <rect x="${x}" y="${y}" width="${seatWidth}" height="${seatHeight}" rx="${seatRadius}" fill="${colorFor(seat.status)}" stroke="rgba(255,255,255,0.16)" stroke-width="0.8"/>
        <rect x="${x + 2}" y="${y + 2}" width="${seatWidth - 4}" height="${Math.max(2, seatHeight * 0.28)}" rx="${Math.max(1, seatRadius - 1)}" fill="rgba(255,255,255,0.12)"/>
        <text x="${seat.x}" y="${seat.y + fontSize * 0.34}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="rgba(255,255,255,0.78)">${escapeXml(seat.number)}</text>
      </g>`;
    })
    .join('\n');

  const rowLabels = leftLabels
    ? rows
        .map((row) => {
          const first = seats.find((seat) => seat.row === row.label);
          if (!first) return '';
          return `<text x="${row.left - 34}" y="${row.y + seatHeight / 2 + 4}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize + 2}" font-weight="600" fill="#d49b68">${row.label}</text>`;
        })
        .join('\n')
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#191a20"/>
        <stop offset="0.55" stop-color="#131418"/>
        <stop offset="1" stop-color="#0e0f12"/>
      </linearGradient>
      <linearGradient id="screen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#9fa7b2"/>
        <stop offset="0.5" stop-color="#e7e9ec"/>
        <stop offset="1" stop-color="#9fa7b2"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#dfe6ef" stop-opacity="0.24"/>
        <stop offset="1" stop-color="#dfe6ef" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect x="0" y="0" width="${width}" height="62" fill="#1d1e25"/>
    <text x="34" y="38" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#f1f1f2">CINEMA CITY</text>
    <text x="168" y="38" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#9296a0">SCREEN 4 · TONIGHT 19:45</text>
    <text x="${width - 34}" y="38" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#9296a0">Choose your seats</text>
    <text x="${width / 2}" y="${screen.y - 38}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="6" fill="#9296a0">SCREEN</text>
    <ellipse cx="${width / 2}" cy="${screen.y + 20}" rx="${screen.width * 0.62}" ry="72" fill="url(#glow)"/>
    <rect x="${screen.x}" y="${screen.y}" width="${screen.width}" height="${screen.height}" rx="3" fill="url(#screen)"/>
    <rect x="${screen.x}" y="${screen.y}" width="${screen.width}" height="${screen.height}" rx="3" fill="none" stroke="#3a3d45" stroke-width="3"/>
    ${rowLabels}
    ${seatMarkup}
    <rect x="0" y="${height - 58}" width="${width}" height="58" fill="#16171c" stroke="rgba(255,255,255,0.06)"/>
    <g font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#9296a0">
      <circle cx="42" cy="${height - 29}" r="6" fill="${AVAILABLE}"/>
      <text x="56" y="${height - 25}">Available</text>
      <circle cx="152" cy="${height - 29}" r="6" fill="${OCCUPIED}"/>
      <text x="166" y="${height - 25}">Occupied</text>
      <circle cx="262" cy="${height - 29}" r="6" fill="${UNKNOWN}"/>
      <text x="276" y="${height - 25}">Unknown</text>
    </g>
    <text x="${width - 34}" y="${height - 25}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#686c76">${escapeXml(title)}</text>
  </svg>`;

  return { svg, seats, rowGroups, screen };
}

async function writePlan(name, plan, options) {
  const pngPath = path.join(publicDir, name);
  await sharp(Buffer.from(plan.svg)).png().toFile(pngPath);

  const expected = {
    name,
    imageWidth: options.width,
    imageHeight: options.height,
    screen: {
      x1: plan.screen.x / options.width,
      y1: plan.screen.y / options.height,
      x2: (plan.screen.x + plan.screen.width) / options.width,
      y2: plan.screen.y / options.height,
      source: 'detected',
    },
    seatCount: plan.seats.length,
    rowCount: plan.rowGroups.length,
    rows: plan.rowGroups,
    seats: plan.seats.map((seat) => ({
      row: seat.row,
      number: seat.number,
      status: seat.status,
      x: seat.x / options.width,
      y: seat.y / options.height,
      width: seat.width / options.width,
      height: seat.height / options.height,
    })),
    notes: options.notes,
  };

  await writeFile(
    path.join(fixtureDir, `${name.replace('.png', '')}.expected.json`),
    JSON.stringify(expected, null, 2),
  );
  return pngPath;
}

const planA = createPlan({
  width: 1200,
  height: 900,
  title: 'fixture A · asymmetric nine-row plan',
  screen: { x: 250, y: 158, width: 700, height: 18 },
  seatWidth: 26,
  seatHeight: 20,
  pitch: 34,
  rowPitch: 52,
  curvature: 16,
  seatRadius: 5,
  fontSize: 8,
  rows: [
    { label: 'A', left: 430, y: 296, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], numberStart: 1 },
    { label: 'B', left: 410, y: 348, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], numberStart: 1 },
    { label: 'C', left: 390, y: 400, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], skips: [8], numberStart: 1 },
    { label: 'D', left: 360, y: 452, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], skips: [9], numberStart: 1 },
    { label: 'E', left: 350, y: 504, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], skips: [10], numberStart: 1 },
    { label: 'F', left: 370, y: 556, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], skips: [9], numberStart: 1 },
    { label: 'G', left: 400, y: 608, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], skips: [7], numberStart: 1 },
    { label: 'H', left: 430, y: 660, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], numberStart: 1 },
    { label: 'I', left: 470, y: 712, slots: [0, 1, 2, 3, 4, 5, 6, 7], numberStart: 1 },
  ],
});

const planB = createPlan({
  width: 1400,
  height: 1000,
  title: 'fixture B · steep six-row boutique plan',
  screen: { x: 300, y: 132, width: 800, height: 22 },
  seatWidth: 30,
  seatHeight: 24,
  pitch: 44,
  rowPitch: 68,
  curvature: 34,
  seatRadius: 7,
  fontSize: 9,
  rows: [
    { label: 'A', left: 470, y: 336, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], numberStart: 1 },
    { label: 'B', left: 430, y: 404, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], skips: [7], numberStart: 1 },
    { label: 'C', left: 380, y: 472, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], skips: [8], numberStart: 1 },
    { label: 'D', left: 350, y: 540, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], skips: [9], numberStart: 1 },
    { label: 'E', left: 410, y: 608, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], skips: [7], numberStart: 1 },
    { label: 'F', left: 490, y: 676, slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], numberStart: 1 },
  ],
});

await mkdir(publicDir, { recursive: true });
await mkdir(fixtureDir, { recursive: true });

await writePlan('test-seating-plan.png', planA, {
  width: 1200,
  height: 900,
  notes:
    'Synthetic asymmetric nine-row plan with curved rows, central aisle gaps and three availability colours. Expected coordinates are exact source-image centres.',
});
await writePlan('test-seating-plan-2.png', planB, {
  width: 1400,
  height: 1000,
  notes:
    'Synthetic six-row boutique plan with a wider screen, steeper row spacing and a different seat count. Used to prove two screenshots produce different auditoriums.',
});

console.log(`fixture A: ${planA.seats.length} seats in ${planA.rowGroups.length} rows`);
console.log(`fixture B: ${planB.seats.length} seats in ${planB.rowGroups.length} rows`);
