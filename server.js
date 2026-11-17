// Pilates class registration — dependency-free Node server (Node 18+).
// Run: node server.js   →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- storage ----------
function seed() {
  const types = [
    { title: 'Mat Pilates', level: 'All levels', instructor: 'Anna', capacity: 12 },
    { title: 'Reformer Basics', level: 'Beginner', instructor: 'Maria', capacity: 6 },
    { title: 'Reformer Flow', level: 'Intermediate', instructor: 'Maria', capacity: 6 },
    { title: 'Core & Stretch', level: 'All levels', instructor: 'Elena', capacity: 10 },
  ];
  const slots = ['08:00', '12:30', '18:30'];
  const classes = [];
  const today = new Date();
  for (let d = 0; d < 14; d++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
    if (day.getDay() === 0) continue; // closed on Sundays
    slots.forEach((time, i) => {
      const t = types[(d + i) % types.length];
      const [h, m] = time.split(':').map(Number);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      classes.push({
        id: crypto.randomUUID(),
        ...t,
        start: start.toISOString(),
        durationMin: 55,
        registrations: [],
      });
    });
  }
  return { classes };
}

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { const d = seed(); save(d); return d; }
}
function save(d) {
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(d, null, 2));
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}
let db = load();

// ---------- helpers ----------
const publicClass = c => ({
  id: c.id, title: c.title, level: c.level, instructor: c.instructor,
  start: c.start, durationMin: c.durationMin, capacity: c.capacity,
  spotsLeft: c.capacity - c.registrations.length,
});
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = req => new Promise((resolve, reject) => {
  let s = '';
  req.on('data', c => { s += c; if (s.length > 1e5) { reject(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('bad json')); } });
});
const validEmail = e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
const norm = e => e.trim().toLowerCase();

// ---------- admin auth ----------
// Set ADMIN_PASSWORD in the environment; otherwise a random one is generated and printed at startup.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('hex');
const generatedPw = !process.env.ADMIN_PASSWORD;
const sessions = new Map(); // token -> expiry ms
const SESSION_MS = 8 * 3600 * 1000;
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const passwordOk = pw => crypto.timingSafeEqual(sha(pw), sha(ADMIN_PASSWORD));
function isAdmin(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)admin=([a-f0-9]+)/);
  if (!m) return false;
  const exp = sessions.get(m[1]);
  if (!exp || exp < Date.now()) { sessions.delete(m[1]); return false; }
  return true;
}
let loginFails = 0, lockUntil = 0;

function parseClass(body, minCapacity = 1) {
  const str = (v, n) => { v = String(v ?? '').trim(); return v && v.length <= n ? v : null; };
  const title = str(body.title, 100), level = str(body.level, 50), instructor = str(body.instructor, 100);
  const start = new Date(body.start);
  const durationMin = Number(body.durationMin), capacity = Number(body.capacity);
  if (!title) return { error: 'Title is required.' };
  if (!level) return { error: 'Level is required.' };
  if (!instructor) return { error: 'Instructor is required.' };
  if (isNaN(start)) return { error: 'Enter a valid date and time.' };
  if (!Number.isInteger(durationMin) || durationMin < 10 || durationMin > 240) return { error: 'Duration must be 10–240 minutes.' };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return { error: 'Capacity must be 1–100.' };
  if (capacity < minCapacity) return { error: `Capacity can't be below the ${minCapacity} people already registered.` };
  return { value: { title, level, instructor, start: start.toISOString(), durationMin, capacity } };
}
const adminClass = c => ({ ...publicClass(c), registrations: c.registrations });

const MIME ={ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

// ---------- server ----------
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/classes') {
      const now = Date.now();
      return send(res, 200, db.classes.filter(c => new Date(c.start) > now).map(publicClass));
    }

    if (req.method === 'GET' && p === '/api/bookings') {
      const email = url.searchParams.get('email');
      if (!validEmail(email)) return send(res, 400, { error: 'Enter a valid email.' });
      const e = norm(email);
      const mine = db.classes
        .filter(c => new Date(c.start) > Date.now() && c.registrations.some(r => r.email === e))
        .map(publicClass);
      return send(res, 200, mine);
    }

    let m = p.match(/^\/api\/classes\/([\w-]+)\/(register|cancel)$/);
    if (req.method === 'POST' && m) {
      const cls = db.classes.find(c => c.id === m[1]);
      if (!cls) return send(res, 404, { error: 'Class not found.' });
      const body = await readBody(req);
      if (!validEmail(body.email)) return send(res, 400, { error: 'Enter a valid email.' });
      const email = norm(body.email);

      if (m[2] === 'register') {
        const name = String(body.name || '').trim();
        if (!name || name.length > 100) return send(res, 400, { error: 'Enter your name.' });
        if (new Date(cls.start) <= Date.now()) return send(res, 400, { error: 'This class has already started.' });
        if (cls.registrations.some(r => r.email === email)) return send(res, 409, { error: 'You are already registered for this class.' });
        if (cls.registrations.length >= cls.capacity) return send(res, 409, { error: 'Sorry, this class is full.' });
        cls.registrations.push({ name, email, at: new Date().toISOString() });
        save(db);
        return send(res, 201, publicClass(cls));
      }
      const i = cls.registrations.findIndex(r => r.email === email);
      if (i < 0) return send(res, 404, { error: 'No registration found for that email.' });
      cls.registrations.splice(i, 1);
      save(db);
      return send(res, 200, publicClass(cls));
    }

    // ----- admin API -----
    if (req.method === 'POST' && p === '/api/admin/login') {
      if (Date.now() < lockUntil) return send(res, 429, { error: 'Too many attempts. Try again in a minute.' });
      const body = await readBody(req);
      if (!passwordOk(body.password ?? '')) {
        if (++loginFails >= 5) { lockUntil = Date.now() + 60000; loginFails = 0; }
        return send(res, 401, { error: 'Wrong password.' });
      }
      loginFails = 0;
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, Date.now() + SESSION_MS);
      res.setHeader('Set-Cookie', `admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`);
      return send(res, 200, { ok: true });
    }
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required.' });
      if (req.method === 'GET' && p === '/api/admin/me') return send(res, 200, { ok: true });
      if (req.method === 'POST' && p === '/api/admin/logout') {
        const t = (req.headers.cookie.match(/admin=([a-f0-9]+)/) || [])[1]; sessions.delete(t);
        res.setHeader('Set-Cookie', 'admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && p === '/api/admin/classes') {
        return send(res, 200, [...db.classes].sort((a, b) => new Date(a.start) - new Date(b.start)).map(adminClass));
      }
      if (req.method === 'POST' && p === '/api/admin/classes') {
        const r = parseClass(await readBody(req));
        if (r.error) return send(res, 400, { error: r.error });
        const cls = { id: crypto.randomUUID(), ...r.value, registrations: [] };
        db.classes.push(cls); save(db);
        return send(res, 201, adminClass(cls));
      }
      m = p.match(/^\/api\/admin\/classes\/([\w-]+)$/);
      if (m) {
        const cls = db.classes.find(c => c.id === m[1]);
        if (!cls) return send(res, 404, { error: 'Class not found.' });
        if (req.method === 'PUT') {
          const r = parseClass(await readBody(req), cls.registrations.length);
          if (r.error) return send(res, 400, { error: r.error });
          Object.assign(cls, r.value); save(db);
          return send(res, 200, adminClass(cls));
        }
        if (req.method === 'DELETE') {
          db.classes = db.classes.filter(c => c !== cls); save(db);
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: 'Not found' });
    }

    // static files
    if (req.method === 'GET') {
      const file = path.normalize(path.join(PUBLIC_DIR, p === '/' ? 'index.html' : p));
      if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Forbidden' });
      return fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, { error: 'Not found' });
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 400, { error: e.message || 'Bad request' });
  }
}).listen(PORT, () => {
  console.log(`Pilates booking running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
  if (generatedPw) console.log(`Admin password (random for this run; set ADMIN_PASSWORD to fix it): ${ADMIN_PASSWORD}`);
});
