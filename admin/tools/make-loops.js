'use strict';
// Builds the hover loops for gallery cards from full-length videos.
//
//   node admin/tools/make-loops.js <videos-folder> [card-id=file ...]
//
// For each video it looks for the 2.5 s with the most movement, skipping the
// opening and the end (titles, credits), any window with a cut in it (a loop
// across a cut jumps) and dark or white frames (title cards, fades). Black
// bars are cropped, the picture is cut to a centred square like the card
// thumbnail, scaled to 480 px, muted, H.264 MP4 with faststart.
// Output: site/images/loops/<card-id>.mp4 and a contact sheet per loop in
// the system temp folder, for checking by eye.
//
// Needs ffmpeg/ffprobe (brew install ffmpeg).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');
const OUT = path.join(REPO, 'site', 'images', 'loops');
const SHEETS = path.join(os.tmpdir(), 'portfolio-loop-sheets');
const WIN = 2.5;        // loop length, seconds
const FPS = 8;          // analysis frame rate
const SIZE = 480;       // output square, px

const run = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

function duration(file) {
  return parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]));
}

// per analysed frame: time, scene-change score (how different from the
// previous frame, 0..1) and average brightness
function analyse(file) {
  const txt = run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-an', '-vf',
    `fps=${FPS},scale=160:-2,select='gte(scene\\,0)',signalstats,metadata=print:file=-`, '-f', 'null', '-']);
  const frames = [];
  let cur = null;
  for (const line of txt.split('\n')) {
    const t = /pts_time:([\d.]+)/.exec(line);
    if (t) { cur = { t: parseFloat(t[1]), s: 0, y: 128 }; frames.push(cur); continue; }
    const s = /lavfi\.scene_score=([\d.]+)/.exec(line); if (s && cur) cur.s = parseFloat(s[1]);
    const y = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(line); if (y && cur) cur.y = parseFloat(y[1]);
  }
  return frames;
}

// range: optional [from, to] in seconds to search in (default: skip the
// first 8 % and the last 12 %). The cut threshold starts strict and is
// relaxed only if nothing passes (hand-drawn animation on twos jumps more).
function bestWindow(frames, dur, range) {
  const n = Math.round(WIN * FPS);
  const from = range ? range[0] : dur * 0.08, to = (range ? range[1] : dur * 0.88) - WIN;
  for (const cut of [0.12, 0.18, 0.25, 0.3]) {
    let best = null;
    for (let i = 1; i + n < frames.length; i++) {
      const t = frames[i].t;
      if (t < from || t > to) continue;
      const w = frames.slice(i, i + n);
      if (w.some((f) => f.s > cut)) continue;                                // a cut inside
      if (w.some((f) => f.y < 22 || f.y > 240)) continue;                     // fade to black/white
      const y = w.reduce((a, f) => a + f.y, 0) / n;
      if (y < 45 || y > 220) continue;                                       // dark / title card
      const motion = w.reduce((a, f) => a + Math.min(f.s, cut / 2), 0) / n;
      if (!best || motion > best.motion) best = { t, motion, y, cut };
    }
    if (best) return best;
  }
  return null;
}

// black bars (letterbox) measured over the chosen window; cropdetect
// reports on stderr, the last line is the settled value
function detectCrop(file, start) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(start), '-t', String(WIN), '-i', file,
    '-vf', 'cropdetect=24:2:0', '-f', 'null', '-'], { encoding: 'utf8' });
  const all = [...String(r.stderr || '').matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  return all.length ? all[all.length - 1][0] : null;
}

// spec: "file", "file@12.5" (start there) or "file@3-38" (search only there)
function makeLoop(spec, id, dir) {
  const [name, at] = spec.split('@');
  const file = path.join(dir, name);
  const dur = duration(file);
  let win;
  if (at && !at.includes('-')) win = { t: parseFloat(at), motion: 0, cut: 'manual' };
  else {
    const range = at ? at.split('-').map(Number) : null;
    win = bestWindow(analyse(file), dur, range);
  }
  if (!win) return { id, error: 'no usable 2.5 s window (every candidate had a cut, or was too dark/bright)' };
  const crop = detectCrop(file, win.t);
  const vf = [crop, `crop='min(iw,ih)':'min(iw,ih)'`, `scale=${SIZE}:${SIZE}`, 'fps=25', 'format=yuv420p'].filter(Boolean).join(',');
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, id + '.mp4');
  run('ffmpeg', ['-v', 'error', '-y', '-ss', win.t.toFixed(2), '-t', String(WIN), '-i', file, '-an', '-vf', vf,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', out]);
  fs.mkdirSync(SHEETS, { recursive: true });
  run('ffmpeg', ['-v', 'error', '-y', '-i', out, '-vf', `fps=1.6,scale=160:160,tile=4x1`, '-frames:v', '1', path.join(SHEETS, id + '.png')]);
  return { id, start: win.t.toFixed(1), of: dur.toFixed(0), motion: win.motion.toFixed(3), cutLimit: win.cut, crop: crop || 'none', kb: Math.round(fs.statSync(out).size / 1024) };
}

const [dir, ...pairs] = process.argv.slice(2);
for (const pair of pairs) {
  const i = pair.indexOf('=');
  const id = pair.slice(0, i), spec = pair.slice(i + 1);
  try { console.log(JSON.stringify(makeLoop(spec, id, dir))); }
  catch (e) { console.log(JSON.stringify({ id, error: String(e.message).split('\n')[0] })); }
}
console.log('contact sheets:', SHEETS);
