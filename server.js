const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_DIR  = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const UPLOADS   = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

// ---- lunch menu (single source of truth) ----
const LUNCH_MENU = [
  { id: 'pie_chips',     name: 'Small pie and chips',  price: 6.50 },
  { id: 'pizza_chips',   name: 'Pizza and chips',      price: 7.50 },
  { id: 'hotdog_chips',  name: 'Hot dog and chips',    price: 9.00 },
  { id: 'tenders_chips', name: '2 tenders and chips',  price: 10.00 },
  { id: 'juice',         name: 'Juice drink',          price: 3.00 },
  { id: 'donut',         name: 'Donut',                price: 5.00 }
];
function lunchMenuLookup(id) {
  for (var i = 0; i < LUNCH_MENU.length; i++) {
    if (LUNCH_MENU[i].id === id) return LUNCH_MENU[i];
  }
  return null;
}
function weekKeyFor(when) {
  // Returns YYYY-MM-DD of the most recent Thursday-3pm boundary at or before `when`.
  // Each week's batch runs Thu 3pm → following Thu 2:59pm. After Thursday 3pm the
  // admin's "This week" view automatically flips to a new (empty) week.
  var d = new Date(when);
  var day = d.getDay(); // 0=Sun .. 6=Sat
  var diff;
  if (day === 4) {
    // Thursday: split at 3pm local time
    diff = (d.getHours() < 15) ? -7 : 0;
  } else {
    // Days since most recent Thursday going backwards
    diff = -((day - 4 + 7) % 7);
  }
  d.setDate(d.getDate() + diff);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

// ---- defaults ----
function defaultTable() {
  return [
    ['Team name',      ''],
    ['Year level',     ''],
    ['Student names',  ''],
    ['Coach/Manager',  '']
  ];
}

function defaultSports() {
  const list = [
    ['sport_netball',         'Netball'],
    ['sport_cricket',         'Cricket'],
    ['sport_junior_cricket',  'Junior Cricket'],
    ['sport_basketball',      'Basketball'],
    ['sport_rippa_rugby',     'Rippa Rugby'],
    ['sport_school_swimming', 'School Swimming Sports'],
    ['sport_mt_spa_swimming', 'Mt Spa Swimming Sports'],
    ['sport_netball_seniors', 'Netball Seniors'],
    ['sport_football',        'Football Tournament'],
    ['sport_fast_five',       'Fast Five Rugby'],
    ['sport_crowley',         'Crowley Cup'],
    ['sport_barrett',         'Barrett Cup'],
  ];
  const sports = {};
  list.forEach(([id, name]) => {
    sports[id] = { name, tableData: defaultTable(), notes: '', images: [] };
  });
  return sports;
}

function defaultTerms() {
  return [
    { id: 'term1', title: 'Term 1', sportIds: ['sport_netball','sport_cricket','sport_junior_cricket','sport_basketball','sport_rippa_rugby','sport_school_swimming','sport_mt_spa_swimming'] },
    { id: 'term2', title: 'Term 2', sportIds: ['sport_basketball','sport_netball_seniors','sport_football','sport_fast_five','sport_crowley','sport_barrett'] },
    { id: 'term3', title: 'Term 3', sportIds: [] },
    { id: 'term4', title: 'Term 4', sportIds: [] },
  ];
}

// ---- data helpers ----
function load() {
  let data;
  if (fs.existsSync(DATA_FILE)) {
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
  }
  if (!data) data = {
    headerImage: null, educateImage: null, carouselImages: [],
    enrolLink: '', importantLinks: [
      { id: 'ilink_1', title: 'School Newsletter',  content: '<p>Latest newsletters will be posted here.</p>' },
      { id: 'ilink_3', title: 'Term Dates',         content: '<p>School term dates for the year.</p>' }
    ],
    pageContent: {}
  };
  if (!data.sports)          data.sports          = defaultSports();
  if (!data.sportTerms)      data.sportTerms      = defaultTerms();
  if (!data.eventsData)      data.eventsData      = {};
  if (!data.pageAudio)       data.pageAudio       = {};
  if (!data.neSlots) data.neSlots = [
    { id: 'ne_1', filename: null },
    { id: 'ne_2', filename: null },
    { id: 'ne_3', filename: null }
  ];
  if (!data.prideImages)       data.prideImages       = {};
  if (!data.homeinfoImages)    data.homeinfoImages    = {};
  if (!data.classroomImages)   data.classroomImages   = {};
  if (!data.staffSlots)        data.staffSlots        = {};
  if (!Array.isArray(data.lunchOrders)) data.lunchOrders = [];
  if (typeof data.lunchResetAt !== 'number') data.lunchResetAt = 0;
  if (!Array.isArray(data.lunchTermArchives)) data.lunchTermArchives = [];
  if (typeof data.lastUpdate !== 'number') data.lastUpdate = Date.now();
  if (typeof data.lastUpdateLabel !== 'string') data.lastUpdateLabel = '';
  if (!Array.isArray(data.editHistory)) data.editHistory = [];
  if (!data.newsletter) {
    data.newsletter = {
      termLabel: 'Term 1, Week 1',
      headerImage: null,
      principalImage: null,
      principalMessage: '',
      importantDates: '',
      studentsWeekImage: null,
      studentsWeekMessage: '',
      notices: [
        { id: 'nt_1', caption: '', filename: null },
        { id: 'nt_2', caption: '', filename: null },
        { id: 'nt_3', caption: '', filename: null }
      ]
    };
  }
  // Migrate older drafts that don't have the new fields
  if (data.newsletter) {
    if (typeof data.newsletter.importantDates !== 'string') data.newsletter.importantDates = '';
    if (typeof data.newsletter.studentsWeekImage === 'undefined') data.newsletter.studentsWeekImage = null;
    if (typeof data.newsletter.studentsWeekMessage !== 'string') data.newsletter.studentsWeekMessage = '';
    if (typeof data.newsletter.campsDayTrips !== 'string') data.newsletter.campsDayTrips = '';
    if (typeof data.newsletter.schoolAccountsPayments !== 'string') data.newsletter.schoolAccountsPayments = '';
    if (typeof data.newsletter.footerImage === 'undefined') data.newsletter.footerImage = null;
    if (typeof data.newsletter.uniformPortraitImage === 'undefined') data.newsletter.uniformPortraitImage = null;
    if (typeof data.newsletter.uniformLandscapeImage === 'undefined') data.newsletter.uniformLandscapeImage = null;
    if (typeof data.newsletter.importantDatesImage === 'undefined') data.newsletter.importantDatesImage = null;
    if (!Array.isArray(data.newsletter.weekPhotos)) data.newsletter.weekPhotos = [];
    // `rev` is a monotonically-increasing version stamp used by the stale-write
    // guard so an old (e.g. frozen-PWA) client can't overwrite newer content.
    if (typeof data.newsletter.rev !== 'number') data.newsletter.rev = 0;
  }
  // Published version visitors see, distinct from the draft that admins edit.
  // Only the Publish endpoint writes to this — no auto-seeding from the draft,
  // so unpublished edits can never leak to the public view.
  if (typeof data.newsletterPublished === 'undefined') {
    data.newsletterPublished = null;
  }
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];
  if (!Array.isArray(data.hallBookings)) data.hallBookings = [];
  if (!Array.isArray(data.absences)) data.absences = [];
  if (!Array.isArray(data.upcomingEvents)) data.upcomingEvents = [];
  if (!Array.isArray(data.upcomingEventImages)) data.upcomingEventImages = [];
  if (!Array.isArray(data.pushSubscriptions)) data.pushSubscriptions = [];
  if (!Array.isArray(data.emailSubscribers)) data.emailSubscribers = [];
  if (!Array.isArray(data.parentMessages)) data.parentMessages = [];
  if (!Array.isArray(data.parentGroups)) data.parentGroups = [];
  // Migration: re-key any orders that were stored under the old Monday-based scheme
  data.lunchOrders.forEach(function(o) {
    if (o.submittedAt) {
      var expected = weekKeyFor(o.submittedAt);
      if (o.weekKey !== expected) o.weekKey = expected;
    }
  });
  // ensure every term has an eventIds array
  data.sportTerms.forEach(t => { if (!t.eventIds) t.eventIds = []; });
  return data;
}
// ---- edit history (for undo) ----
const HISTORY_LIMIT = 30;

// Snapshot everything except the history itself, so undo states stay small
// and never recursively include older snapshots of themselves.
function snapshotForHistory(data) {
  const { editHistory, ...rest } = data;
  return JSON.parse(JSON.stringify(rest));
}

function save(data, opts) {
  opts = opts || {};
  const now = Date.now();
  if (!opts.skipHistory) {
    let prior = null;
    if (fs.existsSync(DATA_FILE)) {
      try { prior = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
    }
    if (prior) {
      if (!Array.isArray(data.editHistory)) data.editHistory = [];
      data.editHistory.push({
        id: 'h_' + now + '_' + Math.random().toString(36).slice(2, 6),
        savedAt: now,
        label: opts.label || '',
        snapshot: snapshotForHistory(prior)
      });
      if (data.editHistory.length > HISTORY_LIMIT) {
        data.editHistory.splice(0, data.editHistory.length - HISTORY_LIMIT);
      }
    }
  }
  // `silent` writes (parent lunch orders, admin housekeeping, newsletter
  // DRAFT edits) don't bump the visible version, so visitors don't get an
  // "updates available" banner. `versionLabel` lets a save use a different
  // label for the public banner than for the undo history (e.g. publish
  // records "Newsletter published" in history but shows "Newsletter" to
  // visitors so the banner reads "Newsletter updated").
  if (!opts.silent) {
    data.lastUpdate = now;
    data.lastUpdateLabel = opts.versionLabel || opts.label || '';
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Friendly tag for a save key — used to populate the update banner.
function saveLabelForKey(key) {
  if (!key) return '';
  const map = {
    'enrolLink':         'Site settings',
    'stationeryLink':    'Site settings',
    'contactImage':      'Site settings',
    'newsletter':        'Newsletter',
    'newsletterSnapshots':'Newsletter',
    'calendarData':      'Upcoming Events',
    'importantLinks':    'Important links',
    'sports':            'Sports & Events',
    'sportTerms':        'Sports & Events',
    'eventsData':        'Upcoming Events',
    'pageAudio':         'Page audio',
    'hitColWidths':      'Home page',
    'busColWidths':      'Buses',
    'busHeights':        'Buses',
    'busLayout':         'Buses',
    'pageConfig':        'Site navigation'
  };
  if (map[key]) return map[key];
  const pageLabels = {
    'pg-home':'Home page','pg-educate':'About us','pg-newentrant':'New Entrant Info',
    'pg-buses':'Buses','pg-year78':'Year 7/8','pg-classroom':'Classroom Lists',
    'pg-staff':'Staff','pg-sports':'Sports & Events','pg-events':'Upcoming Events',
    'pg-sport':'Sports & Events','pg-event':'Upcoming Events','pg-newsletter':'Newsletter',
    'pg-lunch-orders':'School Lunch Orders','pg-linkdetail':'Important links'
  };
  if (key.startsWith('pageContent.')) {
    const pg = key.slice('pageContent.'.length);
    return pageLabels[pg] || 'Page content';
  }
  return 'Content';
}
function deleteFile(filename) {
  if (!filename) return;
  const p = path.join(UPLOADS, filename);
  if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch(e) {}
}

// ---- image shrinking ----
// Parents' phones upload raw camera photos (48-megapixel iPhone shots are
// 5712x4284 ≈ 93 MB of RAM once decoded). A newsletter full of them is
// several hundred MB of image memory — phones kill the tab ("A problem
// repeatedly occurred" / the app shutting down). No photo on this site is
// ever shown larger than ~1600 CSS px, so cap everything at 1800px.
let sharp = null;
try { sharp = require('sharp'); }
catch (e) { console.error('[img] sharp unavailable — images will not be shrunk:', e.message); }
const MAX_IMG_DIM = 1800;
const RESIZABLE = /\.(jpe?g|png|webp)$/i;

async function shrinkImage(filePath) {
  if (!sharp) return false;                      // native lib missing: serve as-is
  if (!RESIZABLE.test(filePath)) return false;   // svg/gif/pdf etc: leave alone
  try {
    const meta = await sharp(filePath).metadata();
    if (!meta.width || !meta.height) return false;
    if (Math.max(meta.width, meta.height) <= MAX_IMG_DIM) return false;
    const isPng = /\.png$/i.test(filePath);
    const tmp = filePath + '.resizing';
    const pipe = sharp(filePath)
      .rotate()   // bake in EXIF orientation before it's lost
      .resize(MAX_IMG_DIM, MAX_IMG_DIM, { fit: 'inside', withoutEnlargement: true });
    if (isPng) await pipe.png({ compressionLevel: 9 }).toFile(tmp);
    else if (/\.webp$/i.test(filePath)) await pipe.webp({ quality: 84 }).toFile(tmp);
    else await pipe.jpeg({ quality: 84, mozjpeg: true }).toFile(tmp);
    fs.renameSync(tmp, filePath);
    return true;
  } catch (e) {
    console.error('[img] shrink failed for', path.basename(filePath), e.message);
    try { fs.unlinkSync(filePath + '.resizing'); } catch (_) {}
    return false;
  }
}

// Route middleware: shrink whatever multer just saved before replying.
function resizeUpload(req, res, next) {
  if (!req.file || !req.file.path) return next();
  shrinkImage(req.file.path).then(() => next(), () => next());
}

// One-time (idempotent) boot migration: shrink oversized images already on the
// volume. Runs in the background after startup; a marker file skips the scan
// on later boots. Sequential so a Railway container never holds more than one
// decode at a time.
const IMG_MIGRATION_MARKER = path.join(DATA_DIR, 'img-shrink-v1.done');
async function migrateOversizedImages() {
  if (fs.existsSync(IMG_MIGRATION_MARKER)) return;
  let files = [];
  try { files = fs.readdirSync(UPLOADS).filter(f => RESIZABLE.test(f)); } catch (e) { return; }
  let shrunk = 0;
  for (const f of files) {
    if (await shrinkImage(path.join(UPLOADS, f))) {
      shrunk++;
      console.log('[img] shrunk', f);
    }
  }
  fs.writeFileSync(IMG_MIGRATION_MARKER, new Date().toISOString() + ' shrunk ' + shrunk + ' of ' + files.length + '\n');
  console.log('[img] migration done:', shrunk, 'of', files.length, 'images shrunk');
}

// ---- multer factory ----
function uploader(prefix) {
  return multer({
    storage: multer.diskStorage({
      destination: UPLOADS,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, prefix + '-' + Date.now() + ext);
      }
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const byMime = /image\/(jpeg|png|gif|webp|x-png|bmp|tiff)/.test(file.mimetype);
      const byExt  = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(file.originalname);
      cb(null, byMime || byExt);
    }
  });
}

// ---- middleware ----
app.use(express.json({ limit: '2mb' }));
// The HTML shell and the service worker must NEVER be held in the browser's
// HTTP cache — otherwise a bad build can get stuck on a device (a device that
// caches old index.html/sw.js can loop or show stale UI and can't pick up a
// fix). no-store guarantees every load fetches the current version from the
// origin. Uploaded media + icons keep their default long-lived caching.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: function (res, filePath) {
    if (/\.html$/i.test(filePath) || /[\\/]sw\.js$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
    }
  }
}));
app.use('/uploads', express.static(UPLOADS));

// ---- API ----

// /api/state strips the full editHistory snapshots (30 copies of data is heavy)
// and replaces them with a lightweight count + recent metadata for the Undo UI.
// ==================== ADMIN AUTHENTICATION ====================
// Real, server-side auth. The admin password lives in the ADMIN_PW environment
// variable (set it in Railway) — it is NEVER sent to the browser. A correct
// password gets a signed, HttpOnly session cookie; the gate below then requires
// that cookie on every state-changing or private endpoint. Deny-by-default:
// anything under /api that is not in PUBLIC_API needs a valid admin session.
function adminPassword() { return envClean('ADMIN_PW') || 'piri2010'; }

let _cachedSecret = null;
function sessionSecret() {
  if (_cachedSecret) return _cachedSecret;
  const fromEnv = envClean('SESSION_SECRET');
  if (fromEnv) return (_cachedSecret = fromEnv);
  // No env secret: generate one once and persist it so tokens survive restarts.
  const data = load();
  if (!data._sessionSecret) {
    data._sessionSecret = crypto.randomBytes(32).toString('hex');
    save(data, { silent: true });
  }
  return (_cachedSecret = data._sessionSecret);
}

function makeToken() {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30-day session
  const sig = crypto.createHmac('sha256', sessionSecret()).update(String(exp)).digest('hex');
  return exp + '.' + sig;
}
function tokenValid(tok) {
  if (!tok) return false;
  const i = tok.indexOf('.');
  if (i < 0) return false;
  const exp = tok.slice(0, i), sig = tok.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const want = crypto.createHmac('sha256', sessionSecret()).update(exp).digest('hex');
  try {
    return sig.length === want.length &&
      crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(want, 'hex'));
  } catch (e) { return false; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}
function isAdminReq(req) { return tokenValid(parseCookies(req).auroa_admin); }

// Brute-force limiter for the login endpoint: per-IP, 8 tries per 15 minutes.
const loginHits = new Map();
function loginBlocked(ip) {
  const rec = loginHits.get(ip);
  return !!(rec && Date.now() < rec.until && rec.count >= 8);
}
function loginFail(ip) {
  const now = Date.now(), win = 15 * 60 * 1000;
  let rec = loginHits.get(ip);
  if (!rec || now >= rec.until) rec = { count: 0, until: now + win };
  rec.count++; loginHits.set(ip, rec);
}

// Public endpoints anyone may call (paths are relative to the /api mount).
// Everything else under /api requires a valid admin session.
const PUBLIC_API = [
  ['GET',  /^\/state$/], ['GET', /^\/version$/], ['GET', /^\/lunch-menu$/],
  ['GET',  /^\/newsletter\/current$/], ['GET', /^\/push\/vapid-public-key$/],
  ['GET',  /^\/parent-messages$/], ['GET', /^\/parent-groups\/[^/]+$/],
  ['GET',  /^\/admin-status$/],
  ['POST', /^\/login$/], ['POST', /^\/logout$/],
  ['POST', /^\/lunch-order$/], ['POST', /^\/absence$/], ['POST', /^\/client-log$/],
  ['POST', /^\/survey\/submit$/], ['POST', /^\/hall-bookings$/],
  ['POST', /^\/push\/(subscribe|unsubscribe|test)$/],
  ['POST', /^\/parent-groups\/[^/]+\/join$/],
];
app.use('/api', (req, res, next) => {
  const isPublic = PUBLIC_API.some(([m, re]) => m === req.method && re.test(req.path));
  if (isPublic) return next();
  if (isAdminReq(req)) return next();
  return res.status(401).json({ error: 'Admin login required' });
});

app.post('/api/login', (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (loginBlocked(ip)) return res.status(429).json({ error: 'Too many attempts — please wait a few minutes.' });
  const pw = String((req.body || {}).password || '');
  const want = adminPassword();
  let ok = false;
  try { ok = pw.length === want.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(want)); } catch (e) { ok = false; }
  if (!ok) { loginFail(ip); return res.status(403).json({ error: 'Wrong password' }); }
  res.set('Set-Cookie', 'auroa_admin=' + makeToken() +
    '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + (30 * 24 * 60 * 60));
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  res.set('Set-Cookie', 'auroa_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin-status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ admin: isAdminReq(req) });
});

app.get('/api/state', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = load();
  const {
    editHistory = [],
    vapidPrivateKey, vapidPublicKey,        // server-only
    _sessionSecret,                         // server-only session signing key
    pushSubscriptions, emailSubscribers,    // contains push endpoints + emails (PII)
    parentMessages = [],                    // filter to messages-page sources only
    parentGroups = [],                      // strip member emails / endpoints (PII)
    absences,                               // student names + medical reasons — admin-only, never public
    newsletterSnapshots = [],               // heavy archived bodies — send metadata only
    lunchOrders = [],                       // other families' orders (PII) — admins only
    newsletter: newsletterDraft,            // unpublished draft — admins only
    ...rest
  } = data;
  const isAdmin = isAdminReq(req);
  // Past newsletters: the client only needs the archive link metadata (the full
  // content is served by the /newsletter/:slug page). Stripping the bodies here
  // cut ~130KB off every page load, which was leaving phones on weak signal
  // stuck on a blank screen while /api/state downloaded.
  const snapshotMeta = newsletterSnapshots.map(s => ({
    id: s.id, slug: s.slug, termLabel: s.termLabel,
    createdAt: s.createdAt, updatedAt: s.updatedAt, hidden: !!s.hidden
  }));
  const recent = editHistory.slice(-5).reverse().map(h => ({
    id: h.id, savedAt: h.savedAt, label: h.label || ''
  }));
  // Public-safe view of groups: name, description, color, member names + count.
  // Emails and push endpoints stay server-side.
  const publicGroups = parentGroups.map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    color: g.color,
    createdAt: g.createdAt,
    memberCount: Array.isArray(g.members) ? g.members.length : 0,
    memberNames: Array.isArray(g.members) ? g.members.map(m => m.name) : []
  }));
  res.json(Object.assign({}, rest, {
    parentMessages: parentMessages.filter(m => showsOnMessagesPage(m.source)),
    parentGroups: publicGroups,
    newsletterSnapshots: snapshotMeta,
    // Lunch orders carry other families' names — send them only to a logged-in
    // admin (the parent order form doesn't need anyone else's orders).
    lunchOrders: isAdmin ? lunchOrders : [],
    // The newsletter DRAFT is admin-only; parents see the published version.
    newsletter: isAdmin ? newsletterDraft : undefined,
    editHistoryCount: editHistory.length,
    editHistoryRecent: recent,
    pushSubscriberCount: Array.isArray(data.pushSubscriptions) ? data.pushSubscriptions.length : 0,
    emailSubscriberCount: Array.isArray(data.emailSubscribers) ? data.emailSubscribers.length : 0
  }));
});

// Undo: pop the most recent history entry and overwrite current data with it.
// The undo itself is NOT pushed to history (otherwise undo would loop forever).
app.post('/api/undo', (req, res) => {
  const data = load();
  if (!Array.isArray(data.editHistory) || data.editHistory.length === 0) {
    return res.status(400).json({ error: 'Nothing to undo' });
  }
  const entry = data.editHistory.pop();
  // Restore the snapshot fields onto current data, preserving the trimmed history
  const restored = Object.assign({}, entry.snapshot, { editHistory: data.editHistory });
  save(restored, { skipHistory: true });
  res.json({ ok: true, restoredFromLabel: entry.label, savedAt: entry.savedAt, remaining: restored.editHistory.length });
});

// Tiny version endpoint — clients poll this to detect content changes.
// Cheaper than fetching the whole state every time.
app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = load();
  res.json({ version: data.lastUpdate || 0, label: data.lastUpdateLabel || '' });
});

app.post('/api/upload/header', uploader('header').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.headerImage);
  data.headerImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

app.post('/api/upload/educate', uploader('educate').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.educateImage);
  data.educateImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

// Centred image on the Apple Distinguished School page.
app.post('/api/upload/apple', uploader('apple').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.appleImage);
  data.appleImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

// Second image on the Apple Distinguished School page (under the video).
app.post('/api/upload/apple2', uploader('apple2').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.appleImage2);
  data.appleImage2 = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

// Full-width image above the video on the home page.
app.post('/api/upload/homeabove', uploader('homeabove').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.homeAboveImage);
  data.homeAboveImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

// Remove the above-video home image (the ✕ button).
app.delete('/api/homeabove-image', (req, res) => {
  const data = load();
  deleteFile(data.homeAboveImage);
  data.homeAboveImage = null;
  save(data);
  res.json({ ok: true });
});

// Full-width image at the bottom of the home page (replaces the old
// text + image info table).
app.post('/api/upload/homefooter', uploader('homefooter').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.homeFooterImage);
  data.homeFooterImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

app.post('/api/upload/carousel', uploader('carousel').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  data.carouselImages.push(req.file.filename);
  save(data);
  res.json({ filename: req.file.filename, carouselImages: data.carouselImages });
});

app.delete('/api/carousel/:filename', (req, res) => {
  const name = path.basename(req.params.filename);
  const data = load();
  data.carouselImages = data.carouselImages.filter(f => f !== name);
  save(data);
  deleteFile(name);
  res.json({ carouselImages: data.carouselImages });
});

// Upload a sport image
app.post('/api/upload/sport/:sportId', uploader('sport').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (!data.sports[req.params.sportId]) return res.status(404).json({ error: 'Unknown sport' });
  data.sports[req.params.sportId].images.push(req.file.filename);
  save(data);
  res.json({ filename: req.file.filename });
});

// Delete a sport image
app.delete('/api/sport-image/:filename', (req, res) => {
  const name = path.basename(req.params.filename);
  const data = load();
  Object.values(data.sports).forEach(s => { s.images = s.images.filter(f => f !== name); });
  save(data);
  deleteFile(name);
  res.json({ ok: true });
});

// Upload a pride slot image
app.post('/api/upload/pride/:slotId', uploader('pride').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (data.prideImages[req.params.slotId]) deleteFile(data.prideImages[req.params.slotId]);
  data.prideImages[req.params.slotId] = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

// Delete a pride slot image
app.delete('/api/pride-image/:slotId', (req, res) => {
  const slotId = req.params.slotId;
  const data = load();
  if (data.prideImages[slotId]) { deleteFile(data.prideImages[slotId]); delete data.prideImages[slotId]; save(data); }
  res.json({ ok: true });
});

// Upload an About Us footer image (slot '1'..'4', full-width boxes at the
// bottom of the About Us page).
app.post('/api/upload/educatefooter/:slot', uploader('educatefooter').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const slot = String(req.params.slot);
  const data = load();
  if (!data.educateFooterImages || typeof data.educateFooterImages !== 'object') {
    data.educateFooterImages = {};
  }
  if (data.educateFooterImages[slot]) deleteFile(data.educateFooterImages[slot]);
  data.educateFooterImages[slot] = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

// Upload a homeinfo image (slot '1' or '2')
app.post('/api/upload/homeinfo/:slot', uploader('homeinfo').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (data.homeinfoImages[req.params.slot]) deleteFile(data.homeinfoImages[req.params.slot]);
  data.homeinfoImages[req.params.slot] = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

app.delete('/api/homeinfo-image/:slot', (req, res) => {
  const slot = req.params.slot;
  const data = load();
  if (data.homeinfoImages[slot]) {
    deleteFile(data.homeinfoImages[slot]);
    delete data.homeinfoImages[slot];
    save(data);
  }
  res.json({ ok: true });
});

// Upload a classroom full-width image (slot '1' or '2')
app.post('/api/upload/classroom/:slot', uploader('classroom').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (!data.classroomImages) data.classroomImages = {};
  if (data.classroomImages[req.params.slot]) deleteFile(data.classroomImages[req.params.slot]);
  data.classroomImages[req.params.slot] = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

app.delete('/api/classroom-image/:slot', (req, res) => {
  const slot = req.params.slot;
  const data = load();
  if (!data.classroomImages) data.classroomImages = {};
  if (data.classroomImages[slot]) { deleteFile(data.classroomImages[slot]); delete data.classroomImages[slot]; save(data); }
  res.json({ ok: true });
});

// Upload a staff slot image
app.post('/api/upload/staff/:slotId', uploader('staff').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (!data.staffSlots[req.params.slotId]) data.staffSlots[req.params.slotId] = { images: [], locks: {} };
  data.staffSlots[req.params.slotId].images.push(req.file.filename);
  save(data);
  res.json({ filename: req.file.filename });
});

// Delete a staff slot image
app.delete('/api/staff-image/:slotId/:filename', (req, res) => {
  const { slotId, filename } = req.params;
  const name = path.basename(filename);
  const data = load();
  if (data.staffSlots[slotId]) {
    data.staffSlots[slotId].images = data.staffSlots[slotId].images.filter(f => f !== name);
    if (data.staffSlots[slotId].locks) delete data.staffSlots[slotId].locks[name];
  }
  save(data);
  deleteFile(name);
  res.json({ ok: true });
});

// Upload new entrant file (images + documents) — admin-only, accept all common types
app.post('/api/upload/ne', multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      cb(null, 'ne-' + Date.now() + ext);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
}).single('file'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ filename: req.file.filename });
});

// Delete new entrant image
app.delete('/api/ne-image/:filename', (req, res) => {
  const name = path.basename(req.params.filename);
  deleteFile(name);
  res.json({ ok: true });
});

// Upload contact button image
app.post('/api/upload/contact', uploader('contact').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (data.contactImage) deleteFile(data.contactImage);
  data.contactImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

app.delete('/api/contact-image', (req, res) => {
  const data = load();
  if (data.contactImage) { deleteFile(data.contactImage); data.contactImage = null; save(data); }
  res.json({ ok: true });
});

// Upload page audio
app.post('/api/upload/audio/:pageId', multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
      cb(null, 'audio-' + req.params.pageId + '-' + Date.now() + ext);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Accept any audio/* type (covers audio/mpeg for MP3) or a common audio
    // extension — some browsers send octet-stream for MP3s, so also allow by
    // file name.
    cb(null, /^audio\//i.test(file.mimetype) ||
             /\.(mp3|m4a|wav|wave|ogg|oga|aac|flac|mp4|weba|webm)$/i.test(file.originalname));
  }
}).single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (data.pageAudio[req.params.pageId]) deleteFile(data.pageAudio[req.params.pageId]);
  data.pageAudio[req.params.pageId] = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

// Delete page audio
app.delete('/api/audio/:pageId', (req, res) => {
  const data = load();
  const filename = data.pageAudio[req.params.pageId];
  if (filename) { deleteFile(filename); delete data.pageAudio[req.params.pageId]; save(data); }
  res.json({ ok: true });
});

// Upload an event image
app.post('/api/upload/event/:eventId', uploader('event').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (!data.eventsData[req.params.eventId]) return res.status(404).json({ error: 'Unknown event' });
  data.eventsData[req.params.eventId].images.push(req.file.filename);
  save(data);
  res.json({ filename: req.file.filename });
});

// Delete an event image
app.delete('/api/event-image/:filename', (req, res) => {
  const name = path.basename(req.params.filename);
  const data = load();
  Object.values(data.eventsData).forEach(ev => { ev.images = ev.images.filter(f => f !== name); });
  save(data);
  deleteFile(name);
  res.json({ ok: true });
});

// ---- Lunch orders ----
app.get('/api/lunch-menu', (req, res) => res.json(LUNCH_MENU));

app.post('/api/lunch-order', (req, res) => {
  const b = req.body || {};
  const studentName = String(b.studentName || '').trim();
  if (!studentName) return res.status(400).json({ error: 'Student name required' });
  if (studentName.length > 100) return res.status(400).json({ error: 'Student name too long' });

  const raw = Array.isArray(b.items) ? b.items : [];
  const items = [];
  let total = 0;
  for (const it of raw) {
    const menu = lunchMenuLookup(String(it && it.id || ''));
    if (!menu) continue;
    const qty = Math.floor(Number(it.qty));
    if (!qty || qty < 1 || qty > 20) continue;
    items.push({ id: menu.id, name: menu.name, price: menu.price, qty });
    total += menu.price * qty;
  }
  if (!items.length) return res.status(400).json({ error: 'Please choose at least one item' });

  const now = Date.now();
  const order = {
    id: 'lo_' + now + '_' + Math.random().toString(36).slice(2, 8),
    studentName,
    items,
    total: Math.round(total * 100) / 100,
    weekKey: weekKeyFor(now),
    submittedAt: now
  };

  const data = load();
  if (!Array.isArray(data.lunchOrders)) data.lunchOrders = [];
  data.lunchOrders.push(order);
  save(data, { silent: true }); // parent submission — don't notify other parents
  res.json({ ok: true, order });
});

// ===================== STUDENT ABSENCES =====================
// Absences hold student names + reasons (incl. medical), so they are NEVER
// included in the public /api/state. Admin reads them via a password-gated
// endpoint (same admin password as the site login).
const ABSENCE_ADMIN_PW = envClean('ADMIN_PW') || 'piri2010';
const ABSENCE_REASONS = ['medical', 'holiday', 'doctor appointment',
  'dentist appointment', 'optometrist', 'other learning', 'counsellor', 'other'];

// Public: a parent submits an absence notification.
app.post('/api/absence', (req, res) => {
  const b = req.body || {};
  const firstName = String(b.firstName || '').trim();
  const lastName  = String(b.lastName  || '').trim();
  if (!firstName || !lastName) return res.status(400).json({ error: 'Please enter the student\'s first and last name.' });
  // Accept one or many date+reason entries (parents can list multiple days).
  const rawEntries = Array.isArray(b.entries) && b.entries.length
    ? b.entries
    : [{ reason: b.reason, detail: b.detail, date: b.date }];
  const records = [];
  for (const e of rawEntries) {
    const reason = String((e && e.reason) || '').trim();
    if (!reason) continue; // skip blank rows
    if (!ABSENCE_REASONS.includes(reason)) return res.status(400).json({ error: 'Please choose a valid reason for each absence.' });
    const detail = String((e && e.detail) || '').trim();
    if ((reason === 'other' || reason === 'other learning') && !detail) {
      return res.status(400).json({ error: 'Please add more detail for the "' + reason + '" absence.' });
    }
    const date = String((e && e.date) || '').trim(); // YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Please choose a date for each absence.' });
    records.push({
      id: 'abs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      firstName: firstName.slice(0, 100),
      lastName:  lastName.slice(0, 100),
      reason,
      detail:    detail.slice(0, 1000),
      date,
      createdAt: Date.now()
    });
  }
  if (!records.length) return res.status(400).json({ error: 'Please choose at least one date and reason.' });
  const data = load();
  if (!Array.isArray(data.absences)) data.absences = [];
  data.absences.push(...records);
  save(data, { silent: true }); // parent submission — no public update banner
  res.json({ ok: true, count: records.length });
});

// Admin: list absences (password-gated), most recent first.
app.post('/api/absences/list', (req, res) => {
  const data = load();
  const list = (data.absences || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ absences: list });
});

// Admin: delete an absence entry (password-gated).
app.post('/api/absences/delete', (req, res) => {
  const b = req.body || {};
  const data = load();
  data.absences = (data.absences || []).filter(a => a.id !== String(b.id || ''));
  save(data, { silent: true });
  res.json({ ok: true });
});

// ---- Client crash/error telemetry ----
// Installed apps that crash can't be debugged from here: the page dies before
// it can say anything. The client beacons JS errors and "the app died while
// open on page X" sentinels to this endpoint; the log is a capped JSON file
// on the data volume so it survives restarts.
const CLIENT_LOG_FILE = path.join(DATA_DIR, 'client-log.json');
app.post('/api/client-log', (req, res) => {
  const b = req.body || {};
  const entry = {
    ts: Date.now(),
    kind: String(b.kind || '').slice(0, 40),
    page: String(b.page || '').slice(0, 60),
    detail: String(b.detail || '').slice(0, 500),
    standalone: !!b.standalone,
    ua: String(req.get('user-agent') || '').slice(0, 220),
  };
  if (!entry.kind) return res.status(400).json({ error: 'kind required' });
  fs.readFile(CLIENT_LOG_FILE, 'utf8', (err, raw) => {
    let list = [];
    if (!err) { try { list = JSON.parse(raw) || []; } catch (e) {} }
    list.push(entry);
    if (list.length > 400) list = list.slice(-400);
    fs.writeFile(CLIENT_LOG_FILE, JSON.stringify(list), () => res.json({ ok: true }));
  });
});

// Admin: read the client telemetry log (password-gated, newest first).
app.post('/api/client-log/read', (req, res) => {
  fs.readFile(CLIENT_LOG_FILE, 'utf8', (err, raw) => {
    let list = [];
    if (!err) { try { list = JSON.parse(raw) || []; } catch (e) {} }
    res.json({ entries: list.slice().reverse() });
  });
});

// ---- School survey (Strategic Planning 2027-2029) ----
// Anonymous responses stored in their own capped file on the data volume;
// results are read back with the admin password (same gate as absences).
const SURVEY_FILE = path.join(DATA_DIR, 'survey-responses.json');
app.post('/api/survey/submit', (req, res) => {
  const answers = (req.body || {}).answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'Missing answers' });
  }
  const raw = JSON.stringify(answers);
  if (raw.length > 30000) return res.status(400).json({ error: 'Response too large' });
  fs.readFile(SURVEY_FILE, 'utf8', (err, txt) => {
    let list = [];
    if (!err) { try { list = JSON.parse(txt) || []; } catch (e) {} }
    list.push({ ts: Date.now(), answers: JSON.parse(raw) });
    if (list.length > 5000) list = list.slice(-5000);
    fs.writeFile(SURVEY_FILE, JSON.stringify(list), () => res.json({ ok: true }));
  });
});

app.post('/api/survey/results', (req, res) => {
  fs.readFile(SURVEY_FILE, 'utf8', (err, txt) => {
    let list = [];
    if (!err) { try { list = JSON.parse(txt) || []; } catch (e) {} }
    res.json({ responses: list });
  });
});

// Admin: wipe all survey responses (e.g. clearing test submissions before
// the survey goes live). A timestamped backup is kept next to the file.
app.post('/api/survey/clear', (req, res) => {
  fs.readFile(SURVEY_FILE, 'utf8', (err, txt) => {
    let count = 0;
    if (!err && txt) {
      try { count = (JSON.parse(txt) || []).length; } catch (e) {}
      try { fs.writeFileSync(SURVEY_FILE + '.cleared-' + Date.now() + '.bak', txt); } catch (e) {}
    }
    fs.writeFile(SURVEY_FILE, '[]', () => res.json({ ok: true, cleared: count }));
  });
});

app.delete('/api/lunch-order/:id', (req, res) => {
  const id = req.params.id;
  const data = load();
  if (!Array.isArray(data.lunchOrders)) data.lunchOrders = [];
  const before = data.lunchOrders.length;
  data.lunchOrders = data.lunchOrders.filter(o => o.id !== id);
  save(data, { silent: true });
  res.json({ ok: true, removed: before - data.lunchOrders.length });
});

// Snapshot current running totals, then bump the reset point so subsequent
// running-totals views start from zero (used at end of term).
app.post('/api/lunch-orders/reset', (req, res) => {
  const data = load();
  if (!Array.isArray(data.lunchOrders)) data.lunchOrders = [];
  if (!Array.isArray(data.lunchTermArchives)) data.lunchTermArchives = [];

  const label = String((req.body && req.body.label) || '').trim().slice(0, 80);
  const since = Number(data.lunchResetAt) || 0;
  const now = Date.now();
  const inTerm = data.lunchOrders.filter(o => (o.submittedAt || 0) >= since);

  const perItem = {};
  inTerm.forEach(o => {
    (o.items || []).forEach(i => {
      if (!perItem[i.id]) perItem[i.id] = { id: i.id, name: i.name, price: i.price, qty: 0, revenue: 0 };
      perItem[i.id].qty += i.qty;
      perItem[i.id].revenue += i.qty * i.price;
    });
  });

  const byWeek = {};
  inTerm.forEach(o => {
    if (!byWeek[o.weekKey]) byWeek[o.weekKey] = { weekKey: o.weekKey, perItem: {}, total: 0 };
    (o.items || []).forEach(i => {
      if (!byWeek[o.weekKey].perItem[i.id]) byWeek[o.weekKey].perItem[i.id] = { qty: 0, revenue: 0 };
      byWeek[o.weekKey].perItem[i.id].qty += i.qty;
      byWeek[o.weekKey].perItem[i.id].revenue += i.qty * i.price;
      byWeek[o.weekKey].total += i.qty * i.price;
    });
  });

  let grandQty = 0; let grandRevenue = 0;
  Object.values(perItem).forEach(t => { grandQty += t.qty; grandRevenue += t.revenue; });

  const archive = {
    id: 'lt_' + now + '_' + Math.random().toString(36).slice(2, 8),
    label: label || ('Term reset ' + new Date(now).toISOString().slice(0, 10)),
    snapshotTakenAt: now,
    fromTime: since,
    toTime: now,
    orderCount: inTerm.length,
    perItem: Object.values(perItem),
    byWeek: Object.values(byWeek),
    grandQty,
    grandRevenue: Math.round(grandRevenue * 100) / 100
  };

  data.lunchTermArchives.push(archive);
  data.lunchResetAt = now;
  save(data, { silent: true }); // admin term rollover — internal, no parent banner
  res.json({ ok: true, archive });
});

// ---- Newsletter ----
function nlSlug(label) {
  return String(label || 'newsletter')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'newsletter';
}
function nlUniqueSlug(base, snapshots, ignoreId) {
  let slug = base;
  let i = 1;
  while (snapshots.some(s => s.slug === slug && s.id !== ignoreId)) {
    i += 1;
    slug = base + '-' + i;
  }
  return slug;
}
function nlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// HTML sanitiser for newsletter rich-text fields. Strips dangerous tags and
// also paste-bombed styling (CSS variables from Tailwind, foreign class
// attributes) that would otherwise inflate stored content 5-10x.
function sanitiseRich(s) {
  return String(s == null ? '' : s)
    .replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style\b[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
    // Strip style attributes that contain CSS variables (Tailwind/etc. bloat
    // — these take 1-2 KB per paragraph and aren't needed for display here).
    .replace(/\s*style\s*=\s*"[^"]*--[a-z-]+\s*:[^"]*"/gi, '')
    .replace(/\s*style\s*=\s*'[^']*--[a-z-]+\s*:[^']*'/gi, '')
    // Strip class attributes — they reference foreign stylesheets and add
    // no value (the format toolbar uses inline styles instead).
    .replace(/\s*class\s*=\s*"[^"]*"/gi, '')
    .replace(/\s*class\s*=\s*'[^']*'/gi, '');
}

// Single image upload for the newsletter (header, principal, notice).
// Files persist forever so saved snapshots keep working even when the
// admin replaces the editing draft's images.
app.post('/api/upload/newsletter', uploader('nl').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ filename: req.file.filename });
});

// Single image upload for an admin-composed Messages-page message.
// Files persist forever so the message keeps rendering its image.
app.post('/api/upload/message', uploader('msg').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ filename: req.file.filename });
});

// Timestamped backups of the newsletter draft, written to DATA_DIR/nl-backups
// so a bad overwrite is always recoverable. Auto-save ('save') backups are
// throttled to one per 5 min to avoid a flood while typing; 'publish' always
// writes one. Pruned to the most recent 60 files.
const NL_BACKUP_DIR = path.join(DATA_DIR, 'nl-backups');
let _nlLastSaveBackup = 0;
function nlBackup(prior, tag) {
  try {
    if (!prior) return;
    const now = Date.now();
    if (tag === 'save') {
      if (now - _nlLastSaveBackup < 5 * 60 * 1000) return;
      _nlLastSaveBackup = now;
    }
    if (!fs.existsSync(NL_BACKUP_DIR)) fs.mkdirSync(NL_BACKUP_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(NL_BACKUP_DIR, 'nl-' + now + '-' + (tag || 'save') + '.json'),
      JSON.stringify(prior, null, 2)
    );
    const files = fs.readdirSync(NL_BACKUP_DIR).filter(n => n.endsWith('.json')).sort();
    if (files.length > 60) {
      files.slice(0, files.length - 60).forEach(n => { try { fs.unlinkSync(path.join(NL_BACKUP_DIR, n)); } catch (e) {} });
    }
  } catch (e) { console.warn('[nl-backup] failed:', e.message); }
}

// Lightweight fetch of the current newsletter draft + version, used by the
// client to re-sync when an installed PWA is resumed from an old session.
app.get('/api/newsletter/current', (req, res) => {
  const data = load();
  res.set('Cache-Control', 'no-store');
  res.json({
    newsletter: data.newsletter || null,
    published: data.newsletterPublished || null,
    snapshots: data.newsletterSnapshots || [],
    rev: (data.newsletter && data.newsletter.rev) || 0
  });
});

// Save (or update) the current newsletter draft + create/update a public snapshot.
app.post('/api/newsletter/save', (req, res) => {
  const b = req.body || {};
  const data = load();
  const curRev = (data.newsletter && typeof data.newsletter.rev === 'number') ? data.newsletter.rev : 0;
  const baseRev = Number(b.baseRev);

  // Stale-write guard. The newsletter draft is a single shared object; every
  // admin browser overwrites it wholesale. A page resumed from an old session
  // (classically an installed PWA frozen for days on a phone) still holds the
  // newsletter as it looked when that page first loaded — its save would revert
  // the draft, TEXT AND IMAGES, to that old state. A client may only overwrite
  // the draft if it was editing the CURRENT version (baseRev >= stored rev).
  // Pre-guard clients send no numeric baseRev and must reload before they can
  // save again. Rejected saves return the current rev so the client can resync.
  if (!Number.isFinite(baseRev) || baseRev < curRev) {
    return res.status(409).json({ ok: false, stale: true, rev: curRev });
  }

  const draft = {
    termLabel: String(b.termLabel || '').trim().slice(0, 200) || 'Newsletter',
    headerImage: b.headerImage || null,
    principalImage: b.principalImage || null,
    principalMessage: sanitiseRich(b.principalMessage || '').slice(0, 200000),
    importantDates: sanitiseRich(b.importantDates || '').slice(0, 100000),
    studentsWeekImage: b.studentsWeekImage || null,
    weekPhotos: Array.isArray(b.weekPhotos) ? b.weekPhotos.slice(0, 5).map(function (fn) { return fn || null; }) : [],
    studentsWeekMessage: sanitiseRich(b.studentsWeekMessage || '').slice(0, 100000),
    campsDayTrips: sanitiseRich(b.campsDayTrips || '').slice(0, 100000),
    schoolAccountsPayments: sanitiseRich(b.schoolAccountsPayments || '').slice(0, 100000),
    uniformPortraitImage: b.uniformPortraitImage || null,
    uniformLandscapeImage: b.uniformLandscapeImage || null,
    importantDatesImage: b.importantDatesImage || null,
    footerImage: b.footerImage || null,
    notices: Array.isArray(b.notices) ? b.notices.slice(0, 50).map((n, idx) => ({
      id: String((n && n.id) || ('nt_' + (idx + 1))).slice(0, 32),
      caption: String((n && n.caption) || '').slice(0, 500),
      filename: (n && n.filename) || null
    })) : [],
    // New version stamp. Strictly increases (Date.now() > any prior rev), so
    // the next save from this client must carry this value to be accepted.
    rev: Math.max(Date.now(), curRev + 1)
  };

  nlBackup(data.newsletter, 'save');   // keep the prior draft recoverable
  data.newsletter = draft;
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];

  // Auto-save ONLY persists the live draft. Snapshots (the shareable links
  // shown in "Saved newsletters") are touched only by /api/newsletter/publish,
  // i.e. the explicit Save Newsletter button. This prevents auto-save from
  // creating or mutating snapshot copies as the admin types.
  //
  // `silent` so editing the draft does NOT bump the public version: visitors
  // must only be told the newsletter changed when it is actually PUBLISHED,
  // not on every keystroke while an admin edits the draft. (Undo history is
  // still recorded — that's controlled by `skipHistory`, not `silent`.)
  save(data, { label: 'Newsletter', silent: true });
  res.json({ ok: true, rev: draft.rev });
});

// Explicit publish — creates a new shareable snapshot (or updates the
// matching one if the Term/Week label already exists), then returns its URL.
app.post('/api/newsletter/publish', (req, res) => {
  const data = load();
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];
  const draft = data.newsletter || {};
  nlBackup(data.newsletterPublished || draft, 'publish');  // checkpoint before going public
  const termLabel = String(draft.termLabel || '').trim() || 'Newsletter';
  const now = Date.now();
  let snap = data.newsletterSnapshots.find(s => s.termLabel === termLabel);
  let isNew = false;
  if (snap) {
    snap.headerImage           = draft.headerImage || null;
    snap.principalImage        = draft.principalImage || null;
    snap.principalMessage      = draft.principalMessage || '';
    snap.importantDates        = draft.importantDates || '';
    snap.studentsWeekImage     = draft.studentsWeekImage || null;
    snap.weekPhotos            = Array.isArray(draft.weekPhotos) ? draft.weekPhotos.slice(0, 5) : [];
    snap.studentsWeekMessage   = draft.studentsWeekMessage || '';
    snap.campsDayTrips         = draft.campsDayTrips || '';
    snap.schoolAccountsPayments = draft.schoolAccountsPayments || '';
    snap.footerImage           = draft.footerImage || null;
    snap.uniformPortraitImage  = draft.uniformPortraitImage || null;
    snap.uniformLandscapeImage = draft.uniformLandscapeImage || null;
    snap.importantDatesImage   = draft.importantDatesImage || null;
    snap.notices               = (draft.notices || []).map(n => ({ id: n.id, caption: n.caption || '', filename: n.filename || null }));
    snap.updatedAt             = now;
  } else {
    isNew = true;
    const baseSlug = nlSlug(termLabel);
    snap = {
      id: 'ns_' + now + '_' + Math.random().toString(36).slice(2, 8),
      termLabel,
      slug: nlUniqueSlug(baseSlug, data.newsletterSnapshots),
      headerImage: draft.headerImage || null,
      principalImage: draft.principalImage || null,
      principalMessage: draft.principalMessage || '',
      importantDates: draft.importantDates || '',
      studentsWeekImage: draft.studentsWeekImage || null,
      weekPhotos: Array.isArray(draft.weekPhotos) ? draft.weekPhotos.slice(0, 5) : [],
      studentsWeekMessage: draft.studentsWeekMessage || '',
      campsDayTrips: draft.campsDayTrips || '',
      schoolAccountsPayments: draft.schoolAccountsPayments || '',
      footerImage: draft.footerImage || null,
      uniformPortraitImage: draft.uniformPortraitImage || null,
      uniformLandscapeImage: draft.uniformLandscapeImage || null,
      importantDatesImage: draft.importantDatesImage || null,
      notices: (draft.notices || []).map(n => ({ id: n.id, caption: n.caption || '', filename: n.filename || null })),
      createdAt: now,
      updatedAt: now
    };
    data.newsletterSnapshots.push(snap);
  }
  // Mirror the current draft into the public-facing copy. Visitors render
  // from this; admins continue editing data.newsletter without it leaking.
  data.newsletterPublished = JSON.parse(JSON.stringify(data.newsletter || {}));
  // Publishing IS a public change — bump the version so visitors see the
  // update banner. `versionLabel: 'Newsletter'` makes that banner read
  // "Newsletter updated" while the undo history keeps "Newsletter published".
  save(data, { label: 'Newsletter published', versionLabel: 'Newsletter' });
  // Fire-and-forget notification to all subscribers. Also persists a card
  // on the Messages page (link points to the newly-published newsletter).
  notifyAll({
    title: 'Newsletter published: ' + termLabel,
    body:  'The latest school newsletter is now available.',
    url:   '/newsletter/' + snap.slug,
    source: 'newsletter'
  }).catch(e => console.warn('[notify] newsletter trigger failed:', e.message));
  res.json({ ok: true, snapshot: snap, isNew, rev: (data.newsletter && data.newsletter.rev) || 0 });
});

// Collect every image filename still referenced somewhere — used to decide
// which files are safe to remove when a snapshot is permanently deleted.
function collectReferencedFiles(data) {
  const refs = new Set();
  const add = (f) => { if (f) refs.add(f); };
  if (data.newsletter) {
    add(data.newsletter.headerImage);
    add(data.newsletter.principalImage);
    add(data.newsletter.studentsWeekImage);
    add(data.newsletter.footerImage);
    add(data.newsletter.uniformPortraitImage);
    add(data.newsletter.uniformLandscapeImage);
    add(data.newsletter.importantDatesImage);
    (data.newsletter.weekPhotos || []).forEach(add);
    (data.newsletter.notices || []).forEach(n => add(n && n.filename));
  }
  (data.newsletterSnapshots || []).forEach(s => {
    add(s.headerImage);
    add(s.principalImage);
    add(s.studentsWeekImage);
    add(s.footerImage);
    add(s.uniformPortraitImage);
    add(s.uniformLandscapeImage);
    add(s.importantDatesImage);
    (s.weekPhotos || []).forEach(add);
    (s.notices || []).forEach(n => add(n && n.filename));
  });
  return refs;
}

// Permanently delete a snapshot. URL stops working. Image files used by
// no other snapshot or the live draft are also removed from disk.
app.delete('/api/newsletter-snapshot/:id', (req, res) => {
  const data = load();
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];
  const target = data.newsletterSnapshots.find(s => s.id === req.params.id);
  if (!target) return res.json({ ok: true, removed: 0 });

  const filesInTarget = new Set();
  const add = (f) => { if (f) filesInTarget.add(f); };
  add(target.headerImage);
  add(target.principalImage);
  add(target.studentsWeekImage);
  add(target.footerImage);
  add(target.uniformPortraitImage);
  add(target.uniformLandscapeImage);
  add(target.importantDatesImage);
  (target.weekPhotos || []).forEach(add);
  (target.notices || []).forEach(n => add(n && n.filename));

  // Drop the snapshot first so we can compute "still referenced" correctly
  data.newsletterSnapshots = data.newsletterSnapshots.filter(s => s.id !== req.params.id);
  const stillReferenced = collectReferencedFiles(data);
  let filesRemoved = 0;
  filesInTarget.forEach(name => {
    if (!stillReferenced.has(name)) {
      deleteFile(name);
      filesRemoved += 1;
    }
  });
  save(data, { silent: true }); // admin housekeeping — no parent banner
  res.json({ ok: true, removed: 1, filesRemoved });
});

// Soft-delete: hide a snapshot from the admin list without breaking the URL.
app.post('/api/newsletter-snapshot/:id/hidden', (req, res) => {
  const data = load();
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];
  const snap = data.newsletterSnapshots.find(s => s.id === req.params.id);
  if (!snap) return res.status(404).json({ error: 'Not found' });
  snap.hidden = !!(req.body && req.body.hidden);
  save(data, { silent: true });
  res.json({ ok: true, snapshot: snap });
});

// Permanent, shareable URLs for the SPA's lunch ordering page. Hitting any
// of these returns index.html with a tiny inline marker the client uses to
// navigate to the right page once it has loaded.
['/lunch-orders', '/lunch', '/order-lunch'].forEach(p => {
  app.get(p, (req, res) => {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, html) => {
      if (err) return res.status(500).send('Error loading page');
      const inject = '<script>window.__autoPage="pg-lunch-orders";</script>';
      res.set('Content-Type', 'text/html; charset=utf-8')
         .set('Cache-Control', 'no-store')
         .send(html.replace('</head>', inject + '</head>'));
    });
  });
});

['/messages'].forEach(p => {
  app.get(p, (req, res) => {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, html) => {
      if (err) return res.status(500).send('Error loading page');
      const inject = '<script>window.__autoPage="pg-messages";</script>';
      res.set('Content-Type', 'text/html; charset=utf-8')
         .set('Cache-Control', 'no-store')
         .send(html.replace('</head>', inject + '</head>'));
    });
  });
});

// Deep-link routes for sport/event detail pages — the client navigates to the
// matching record once state has loaded.
function serveSpaWithMarker(req, res, marker) {
  fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error loading page');
    res.set('Content-Type', 'text/html; charset=utf-8')
         .set('Cache-Control', 'no-store')
       .send(html.replace('</head>', marker + '</head>'));
  });
}
app.get('/sport/:sportId', (req, res) => {
  serveSpaWithMarker(req, res,
    `<script>window.__autoSportId=${JSON.stringify(req.params.sportId)};</script>`);
});
app.get('/event/:eventId', (req, res) => {
  serveSpaWithMarker(req, res,
    `<script>window.__autoEventId=${JSON.stringify(req.params.eventId)};</script>`);
});

// Public route — renders a saved snapshot as a standalone HTML page.
app.get('/newsletter/:slug', (req, res) => {
  const data = load();
  const snaps = data.newsletterSnapshots || [];
  const snap = snaps.find(s => s.slug === req.params.slug);
  if (!snap) {
    return res.status(404).send(`<!doctype html><meta charset="utf-8"><title>Not found</title>
      <body style="font-family:sans-serif;max-width:520px;margin:80px auto;padding:0 20px;color:#444;text-align:center;">
        <h1 style="color:#1a2b4a;">Newsletter not found</h1>
        <p>This newsletter may have been removed.</p>
        <p><a href="/" style="color:#1a2b4a;">Back to Auroa School</a></p>
      </body>`);
  }
  const schoolHeader = data.headerImage ? '/uploads/' + nlEscape(data.headerImage) : null;
  const nlHeader = snap.headerImage ? '/uploads/' + nlEscape(snap.headerImage) : null;
  const nlPrincipal = snap.principalImage ? '/uploads/' + nlEscape(snap.principalImage) : null;
  const nlSotw = snap.studentsWeekImage ? '/uploads/' + nlEscape(snap.studentsWeekImage) : null;
  // Rich-text fields now hold HTML (bullets, colour spans). Older content is plain
  // text — detect and escape that, otherwise pass HTML straight through.
  const richField = (raw) => {
    const s = String(raw == null ? '' : raw);
    if (/<\/?(p|br|ul|ol|li|strong|em|span|b|i|u|a|div)\b/i.test(s)) return s;
    return nlEscape(s).replace(/\n/g, '<br>');
  };
  const datesHtml = richField(snap.importantDates);
  const sotwHtml  = richField(snap.studentsWeekMessage);
  const campsHtml = richField(snap.campsDayTrips);
  const sapHtml   = richField(snap.schoolAccountsPayments);
  const nlFooter = snap.footerImage ? '/uploads/' + nlEscape(snap.footerImage) : null;
  const nlUniP = snap.uniformPortraitImage ? '/uploads/' + nlEscape(snap.uniformPortraitImage) : null;
  const nlUniL = snap.uniformLandscapeImage ? '/uploads/' + nlEscape(snap.uniformLandscapeImage) : null;
  const nlDatesImg = snap.importantDatesImage ? '/uploads/' + nlEscape(snap.importantDatesImage) : null;
  const noticesHtml = (snap.notices || []).filter(n => n.filename).map(n => {
    const url = '/uploads/' + nlEscape(n.filename);
    return `<figure class="nl-pub-notice">
      ${n.caption ? `<figcaption>${nlEscape(n.caption)}</figcaption>` : ''}
      <img src="${url}" alt="${nlEscape(n.caption || 'Notice image')}" onclick="lbOpen('${url}')" />
    </figure>`;
  }).join('');
  const msgHtml = richField(snap.principalMessage);
  const weekPhotosHtml = (snap.weekPhotos || []).filter(Boolean).map(fn => {
    const url = '/uploads/' + nlEscape(fn);
    return `<div class="nl-pub-wphoto" onclick="lbOpen('${url}')"><img src="${url}" alt=""></div>`;
  }).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${nlEscape(snap.termLabel)} - Auroa School Newsletter</title>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;font-family:'Quicksand',sans-serif;}
  body{background:#f5f6f8;color:#222;line-height:1.5;}
  .nl-pub{max-width:820px;margin:0 auto;padding:24px 22px 80px;background:#fff;min-height:100vh;}
  .nl-pub-school-hdr{margin:0 auto 22px;max-width:70%;}
  .nl-pub-school-hdr img{width:100%;display:block;border-radius:10px;}
  .nl-pub h1{color:#1a2b4a;font-size:36px;font-weight:700;text-align:center;margin:8px 0 24px;letter-spacing:0.5px;}
  .nl-pub-hero{margin:0 0 28px;}
  .nl-pub-hero img{width:100%;display:block;border-radius:12px;}
  .nl-pub h2{color:#c0642b;font-size:26px;font-weight:400;border-bottom:2px solid #c0642b;padding-bottom:6px;margin:28px 0 12px;letter-spacing:0.3px;}
  .nl-pub-principal-img{margin:0 0 14px;}
  .nl-pub-principal-img img{width:100%;height:auto;display:block;border-radius:10px;}
  .nl-pub-msg{font-size:15px;color:#333;line-height:1.3;}
  .nl-pub-msg p,.nl-pub-msg div{margin:0;}
  /* Empty paragraphs / divs (from pressing Enter twice for a blank line)
     get a small height so they show as a visible spacer line. */
  .nl-pub-msg p:empty,.nl-pub-msg div:empty{height:1em;}
  .nl-pub-msg ul,.nl-pub-msg ol{padding-left:2em;margin:0.3em 0 0.6em 1.5em;}
  .nl-pub-msg li{margin:0;padding-left:0.25em;line-height:1.3;}
  .nl-pub-notices{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:8px;}
  .nl-pub-notice{display:flex;flex-direction:column;gap:8px;}
  .nl-pub-notice figcaption{font-weight:600;color:#1a2b4a;font-size:14px;}
  .nl-pub-notice img{width:100%;display:block;border-radius:10px;cursor:zoom-in;border:1px solid #eaeaea;}
  .nl-pub-wphotos{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;}
  .nl-pub-wphotos .nl-pub-wphoto{flex:1 1 calc(20% - 8px);min-width:130px;}
  .nl-pub-wphotos .nl-pub-wphoto img{width:100%;display:block;border-radius:8px;cursor:zoom-in;border:1px solid #eaeaea;}
  .nl-pub-uni-portrait{display:flex;justify-content:center;margin:8px 0 16px;}
  .nl-pub-uni-portrait img{max-width:320px;width:auto;height:auto;display:block;border-radius:10px;cursor:zoom-in;border:1px solid #eaeaea;}
  .nl-pub-uni-landscape{margin:8px 0 16px;}
  .nl-pub-uni-landscape img{width:100%;height:auto;display:block;border-radius:10px;cursor:zoom-in;border:1px solid #eaeaea;}
  .nl-pub-meta{color:#888;font-size:12px;text-align:center;margin-top:40px;}
  #lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;justify-content:center;align-items:center;padding:20px;cursor:zoom-out;}
  #lb.open{display:flex;}
  #lb img{max-width:100%;max-height:100%;border-radius:6px;}
  #lb-close{position:fixed;top:14px;right:18px;background:#fff;border:none;color:#1a2b4a;font-size:22px;width:38px;height:38px;border-radius:50%;cursor:pointer;}
  @media (max-width:768px){
    .nl-pub h1{font-size:26px;}
    .nl-pub h2{font-size:20px;}
    .nl-pub-notices{grid-template-columns:1fr;}
  }
</style>
</head>
<body>
<div class="nl-pub">
  ${schoolHeader ? `<div class="nl-pub-school-hdr"><img src="${schoolHeader}" alt="Auroa School"></div>` : ''}
  <h1>${nlEscape(snap.termLabel)}</h1>
  ${nlHeader ? `<div class="nl-pub-hero"><img src="${nlHeader}" alt=""></div>` : ''}
  <h2>Principal's Message</h2>
  ${nlPrincipal ? `<div class="nl-pub-principal-img"><img src="${nlPrincipal}" alt=""></div>` : ''}
  <div class="nl-pub-msg">${msgHtml || ''}</div>
  ${weekPhotosHtml ? `<div class="nl-pub-wphotos">${weekPhotosHtml}</div>` : ''}
  ${(nlSotw || sotwHtml) ? `<h2>Students of the Week</h2>${nlSotw ? `<div class="nl-pub-hero"><img src="${nlSotw}" alt=""></div>` : ''}${sotwHtml ? `<div class="nl-pub-msg">${sotwHtml}</div>` : ''}` : ''}
  ${(datesHtml || nlDatesImg) ? `<h2>Important Dates</h2>${datesHtml ? `<div class="nl-pub-msg">${datesHtml}</div>` : ''}${nlDatesImg ? `<div class="nl-pub-hero" style="margin-top:14px;" onclick="lbOpen('${nlDatesImg}')"><img src="${nlDatesImg}" alt=""></div>` : ''}` : ''}
  ${sapHtml ? `<h2>School Accounts and Payments</h2><div class="nl-pub-msg">${sapHtml}</div>` : ''}
  ${campsHtml ? `<h2>Camps and Day Trips</h2><div class="nl-pub-msg">${campsHtml}</div>` : ''}
  ${noticesHtml ? `<h2>Notices</h2><div class="nl-pub-notices">${noticesHtml}</div>` : ''}
  ${(nlUniP || nlUniL) ? `<h2>School Uniform</h2>
    ${nlUniP ? `<div class="nl-pub-uni-portrait" onclick="lbOpen('${nlUniP}')"><img src="${nlUniP}" alt=""></div>` : ''}
    ${nlUniL ? `<div class="nl-pub-uni-landscape" onclick="lbOpen('${nlUniL}')"><img src="${nlUniL}" alt=""></div>` : ''}` : ''}
  ${nlFooter ? `<hr style="border:none;border-top:2px solid #c0642b;margin:32px 0 18px;"><div class="nl-pub-hero" style="margin-top:32px;"><img src="${nlFooter}" alt=""></div>` : ''}
  <div class="nl-pub-meta">Saved ${new Date(snap.updatedAt || snap.createdAt).toLocaleString()}</div>
</div>
<div id="lb" onclick="lbClose()">
  <button id="lb-close" type="button" onclick="lbClose(event)">&times;</button>
  <img id="lb-img" alt="">
</div>
<script>
  function lbOpen(src){ var lb=document.getElementById('lb'); document.getElementById('lb-img').src=src; lb.classList.add('open'); }
  function lbClose(e){ if(e) e.stopPropagation(); document.getElementById('lb').classList.remove('open'); }
</script>
</body>
</html>`;

  res.set('Content-Type', 'text/html; charset=utf-8')
         .set('Cache-Control', 'no-store').send(html);
});

// Batched save — accepts an array of { key, value } and writes them in ONE
// disk write, so a multi-field page save creates a single undo history entry
// rather than one per field.
app.post('/api/save-batch', (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  if (!items.length) return res.json({ ok: true });
  const data = load();
  if (!data.pageContent) data.pageContent = {};
  items.forEach(it => {
    if (!it || !it.key) return;
    if (it.key.startsWith('pageContent.')) {
      data.pageContent[it.key.slice('pageContent.'.length)] = it.value;
    } else {
      data[it.key] = it.value;
    }
  });
  // Most batch saves cover one page (e.g. all .editable blocks on About us);
  // use the first item's label so the banner says something specific.
  save(data, { label: saveLabelForKey(items[0] && items[0].key) });
  res.json({ ok: true });
});

// ---- Hall bookings ----
// Pricing rule: up to 1 hour = $40; >1 to 2 hours = $80; >2 hours = $250.
function calcHallCost(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const toMin = (t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t));
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  const s = toMin(startTime); const e = toMin(endTime);
  if (s == null || e == null || e <= s) return 0;
  const hours = (e - s) / 60;
  if (hours <= 1) return 40;
  if (hours <= 2) return 80;
  return 250;
}

// Lazy nodemailer transporter — set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM
// env vars to enable confirmation emails. Without them, emails are skipped
// and the booking still confirms normally.
let _mailTransport = null;
function envClean(name) {
  // Trim whitespace + strip any stray quotes that copy-paste through
  // Railway's UI sometimes adds. Returns '' if not set.
  return String(process.env[name] || '').trim().replace(/^["']|["']$/g, '').trim();
}
function getMailTransport() {
  if (_mailTransport) return _mailTransport;
  const user = envClean('SMTP_USER');
  const host = envClean('SMTP_HOST') || 'smtp.gmail.com';
  const pass = envClean('SMTP_PASS');
  // Require at least a user (auth) and a non-default host setup so we don't
  // silently try Gmail without credentials.
  if (!user || !pass) {
    console.warn('[hall] SMTP not configured — missing SMTP_USER or SMTP_PASS');
    return null;
  }
  try {
    const nm = require('nodemailer');
    _mailTransport = nm.createTransport({
      host,
      port:   parseInt(envClean('SMTP_PORT') || '587', 10),
      secure: envClean('SMTP_SECURE').toLowerCase() === 'true',
      auth: { user, pass }
    });
    return _mailTransport;
  } catch (e) {
    console.warn('[hall] nodemailer not available:', e.message);
    return null;
  }
}

app.post('/api/hall-bookings', (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim();
  const name  = String(b.name  || '').trim();
  const phone = String(b.phone || '').trim();
  const date  = String(b.date  || '').trim();
  const start = String(b.startTime || '').trim();
  const end   = String(b.endTime   || '').trim();
  const desc  = String(b.description || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid email address is required.' });
  if (!name)  return res.status(400).json({ error: 'Contact name is required.' });
  if (!phone) return res.status(400).json({ error: 'Contact phone is required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Pick a date for the booking.' });
  if (!/^\d{1,2}:(00|30)$/.test(start) || !/^\d{1,2}:(00|30)$/.test(end)) return res.status(400).json({ error: 'Times must be on the hour or half-hour (e.g. 18:00 or 18:30).' });
  const cost = calcHallCost(start, end);
  if (!cost) return res.status(400).json({ error: 'End time must be after start time.' });

  const data = load();
  if (!Array.isArray(data.hallBookings)) data.hallBookings = [];
  const now = Date.now();
  const booking = {
    id: 'hb_' + now + '_' + Math.random().toString(36).slice(2, 8),
    email: email.slice(0, 200),
    name: name.slice(0, 120),
    phone: phone.slice(0, 60),
    date,
    startTime: start,
    endTime: end,
    description: desc.slice(0, 2000),
    cost,
    status: 'pending',
    createdAt: now,
    confirmedAt: null
  };
  data.hallBookings.push(booking);
  save(data, { label: 'Hall booking' });
  res.json({ ok: true, booking });
});

app.post('/api/hall-bookings/:id/confirm', async (req, res) => {
  const data = load();
  if (!Array.isArray(data.hallBookings)) data.hallBookings = [];
  const booking = data.hallBookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status === 'confirmed') return res.json({ ok: true, booking, emailed: false, alreadyConfirmed: true });
  booking.status = 'confirmed';
  booking.confirmedAt = Date.now();
  save(data, { silent: true });

  let emailed = false; let emailError = null;
  const transport = getMailTransport();
  if (transport && booking.email) {
    try {
      await transport.sendMail({
        from:    envClean('SMTP_FROM') || envClean('SMTP_USER'),
        to:      booking.email,
        subject: 'Hall booking confirmed — Auroa School',
        text:
`Kia ora ${booking.name},

Your hall booking has been confirmed:

  Date:        ${booking.date}
  Time:        ${booking.startTime} – ${booking.endTime}
  Description: ${booking.description || '(none)'}
  Cost:        $${booking.cost}

Please contact the school office if you need to change or cancel this booking.

Ngā mihi,
Auroa School`
      });
      emailed = true;
    } catch (e) {
      emailError = e.message || 'send failed';
      console.warn('[hall] email send failed:', emailError);
    }
  }
  res.json({ ok: true, booking, emailed, emailError });
});

app.delete('/api/hall-bookings/:id', (req, res) => {
  const data = load();
  if (!Array.isArray(data.hallBookings)) data.hallBookings = [];
  const before = data.hallBookings.length;
  data.hallBookings = data.hallBookings.filter(b => b.id !== req.params.id);
  save(data, { silent: true });
  res.json({ ok: true, removed: before - data.hallBookings.length });
});

// ---- Upcoming events (calendar) ----
app.post('/api/upcoming-events', (req, res) => {
  const b = req.body || {};
  const date = String(b.date || '').trim();
  let   endDate = String(b.endDate || '').trim();
  const time = String(b.time || '').trim();
  const name = String(b.name || '').trim();
  const details = String(b.details || '').trim();
  let   color = String(b.color || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Pick a date.' });
  if (!/^\d{1,2}:\d{2}$/.test(time))    return res.status(400).json({ error: 'Pick a time.' });
  if (!name)                            return res.status(400).json({ error: 'Event name is required.' });
  // End date is optional; ignore if blank/malformed, and never let it precede
  // the start date (a single-day event just stores endDate === date).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date) endDate = date;
  // Highlight colour: accept #rgb or #rrggbb, else fall back to the default.
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) color = '#dbeafe';

  const data = load();
  if (!Array.isArray(data.upcomingEvents)) data.upcomingEvents = [];
  const now = Date.now();
  const event = {
    id: 'ue_' + now + '_' + Math.random().toString(36).slice(2, 8),
    date,
    endDate,
    time,
    name: name.slice(0, 200),
    details: details.slice(0, 4000),
    color,
    createdAt: now
  };
  data.upcomingEvents.push(event);
  save(data, { label: 'Upcoming Events' });
  // Notify subscribers of the new event.
  const whenText = (endDate && endDate !== date) ? (date + ' – ' + endDate) : date;
  notifyAll({
    title: 'New event: ' + event.name,
    body:  whenText + ' at ' + event.time + (event.details ? '\n\n' + event.details : ''),
    url:   '/',
    source: 'event'
  }).catch(e => console.warn('[notify] event trigger failed:', e.message));
  res.json({ ok: true, event });
});

// Edit an existing event (admin — gated by the /api middleware). Same
// validation as add, but keeps the id + createdAt and does NOT re-notify
// subscribers (editing shouldn't fire a "new event" push).
app.put('/api/upcoming-events/:id', (req, res) => {
  const b = req.body || {};
  const date = String(b.date || '').trim();
  let   endDate = String(b.endDate || '').trim();
  const time = String(b.time || '').trim();
  const name = String(b.name || '').trim();
  const details = String(b.details || '').trim();
  let   color = String(b.color || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Pick a date.' });
  if (!/^\d{1,2}:\d{2}$/.test(time))    return res.status(400).json({ error: 'Pick a time.' });
  if (!name)                            return res.status(400).json({ error: 'Event name is required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date) endDate = date;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) color = '#dbeafe';

  const data = load();
  if (!Array.isArray(data.upcomingEvents)) data.upcomingEvents = [];
  const ev = data.upcomingEvents.find(e => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  ev.date = date;
  ev.endDate = endDate;
  ev.time = time;
  ev.name = name.slice(0, 200);
  ev.details = details.slice(0, 4000);
  ev.color = color;
  save(data, { label: 'Upcoming Events' });
  res.json({ ok: true, event: ev });
});

app.delete('/api/upcoming-events/:id', (req, res) => {
  const data = load();
  if (!Array.isArray(data.upcomingEvents)) data.upcomingEvents = [];
  const before = data.upcomingEvents.length;
  data.upcomingEvents = data.upcomingEvents.filter(e => e.id !== req.params.id);
  save(data, { silent: true });
  res.json({ ok: true, removed: before - data.upcomingEvents.length });
});

// Upload one or more event images
app.post('/api/upcoming-events/image', uploader('ue').single('image'), resizeUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  if (!Array.isArray(data.upcomingEventImages)) data.upcomingEventImages = [];
  data.upcomingEventImages.push(req.file.filename);
  save(data, { label: 'Upcoming Events' });
  res.json({ ok: true, filename: req.file.filename, images: data.upcomingEventImages });
});

app.delete('/api/upcoming-events/image/:filename', (req, res) => {
  const name = path.basename(req.params.filename);
  const data = load();
  if (!Array.isArray(data.upcomingEventImages)) data.upcomingEventImages = [];
  data.upcomingEventImages = data.upcomingEventImages.filter(f => f !== name);
  deleteFile(name);
  save(data, { silent: true });
  res.json({ ok: true, images: data.upcomingEventImages });
});

// ---- PUSH + EMAIL NOTIFICATIONS (anonymous device subscriptions) ----
//
// On first call, VAPID keys are generated and stored in data.json. The
// public half is shipped to the browser on subscribe; the private half
// stays on the server.

let _webpush = null;
function getWebPush() {
  if (_webpush) return _webpush;
  try {
    _webpush = require('web-push');
    const data = load();
    if (!data.vapidPublicKey || !data.vapidPrivateKey) {
      const keys = _webpush.generateVAPIDKeys();
      data.vapidPublicKey = keys.publicKey;
      data.vapidPrivateKey = keys.privateKey;
      save(data, { silent: true });
    }
    // VAPID "subject" — a contact mailto for the push service. This MUST be a
    // valid mailto:, or strict push services (Apple's) can refuse delivery.
    // Previously this expression had an operator-precedence bug: `+` binds
    // tighter than `||`, so when SMTP_FROM had no angle-bracket address it
    // produced the literal string "mailto:undefined" instead of falling back.
    const fromAddr =
      (envClean('SMTP_FROM').match(/<([^>]+)>/) || [])[1] ||  // "Name <a@b>" form
      (envClean('SMTP_FROM').includes('@') ? envClean('SMTP_FROM') : '') || // bare email
      envClean('SMTP_USER') ||
      'admin@auroa.school.nz';
    _webpush.setVapidDetails(
      'mailto:' + fromAddr,
      data.vapidPublicKey,
      data.vapidPrivateKey
    );
    return _webpush;
  } catch (e) {
    console.warn('[push] web-push not available:', e.message);
    return null;
  }
}

app.get('/api/push/vapid-public-key', (req, res) => {
  getWebPush(); // ensures keys exist
  const data = load();
  res.json({ key: data.vapidPublicKey || null });
});

app.post('/api/push/subscribe', (req, res) => {
  const b = req.body || {};
  const sub = b.subscription;
  const email = String(b.email || '').trim();
  const name = String(b.name || '').trim().slice(0, 60);
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Missing subscription' });
  const data = load();
  if (!Array.isArray(data.pushSubscriptions)) data.pushSubscriptions = [];
  if (!Array.isArray(data.emailSubscribers)) data.emailSubscribers = [];
  // Dedupe by endpoint. The daily re-sync POSTs without any form input, so a
  // replacement record must KEEP the stored name (and the zombie strike count
  // — otherwise every re-sync resets strikes and dead-but-2xx endpoints are
  // never pruned).
  const prevSub = data.pushSubscriptions.find(s => s.endpoint === sub.endpoint);
  data.pushSubscriptions = data.pushSubscriptions.filter(s => s.endpoint !== sub.endpoint);
  const record = Object.assign({}, sub);
  if (name) record.name = name;
  else if (prevSub && prevSub.name) record.name = prevSub.name;
  if (prevSub && prevSub.failCount) record.failCount = prevSub.failCount;
  record.lastSeen = Date.now();
  data.pushSubscriptions.push(record);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && data.emailSubscribers.indexOf(email) === -1) {
    data.emailSubscribers.push(email);
  }
  save(data, { silent: true });
  res.json({ ok: true });
});

// Admin: who is subscribed on which device — names only (no endpoints/keys),
// same names-only exposure as group member lists in /api/state.
app.get('/api/push/subscribers', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = load();
  const subscribers = (data.pushSubscriptions || []).map(s => ({
    name: s.name || null,
    lastSeen: s.lastSeen || null,
    strikes: s.failCount || 0
  })).sort((a, b) => (a.name || 'zzz').localeCompare(b.name || 'zzz'));
  res.json({ subscribers });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const endpoint = (req.body && req.body.endpoint) || '';
  if (!endpoint) return res.json({ ok: true });
  const data = load();
  if (Array.isArray(data.pushSubscriptions)) {
    data.pushSubscriptions = data.pushSubscriptions.filter(s => s.endpoint !== endpoint);
    save(data, { silent: true });
  }
  res.json({ ok: true });
});

// Self-test: push a single notification to ONE device (the caller's own
// subscription endpoint). Lets anyone confirm the full pipeline end-to-end on
// their own phone without spamming everyone. Returns a precise result so the
// UI can say exactly what happened.
app.post('/api/push/test', async (req, res) => {
  const endpoint = (req.body && req.body.endpoint) || '';
  const wp = getWebPush();
  if (!wp) return res.json({ ok: false, reason: 'not-configured' });
  if (!endpoint) return res.json({ ok: false, reason: 'no-endpoint' });
  const data = load();
  const sub = (data.pushSubscriptions || []).find(s => s.endpoint === endpoint);
  if (!sub) return res.json({ ok: false, reason: 'not-subscribed' });
  const payload = JSON.stringify({
    title: 'Auroa School',
    body:  'Test notification — if you can see this, push is working on this device. 🎉',
    url:   '/messages'
  });
  try {
    await wp.sendNotification(sub, payload, { urgency: 'high', TTL: 60 * 60 });
    return res.json({ ok: true });
  } catch (e) {
    const code = e && e.statusCode;
    // Dead endpoint — prune it so the device re-registers a fresh one.
    if (code === 410 || code === 404) {
      const d2 = load();
      d2.pushSubscriptions = (d2.pushSubscriptions || []).filter(s => s.endpoint !== endpoint);
      save(d2, { silent: true });
    }
    return res.json({ ok: false, reason: 'send-failed', code: code || null });
  }
});

// Sources whose messages render on the public Messages page.
// 'admin' = composed via the Messages-page admin form.
// 'newsletter' = auto-created when the admin presses the newsletter Publish
// button; the message links to the newly-published newsletter URL.
// Other sources (e.g. 'event') still fire push + email but don't appear here.
function showsOnMessagesPage(source) {
  return source === 'admin' || source === 'newsletter';
}

// Public: list messages so the page can render them.
app.get('/api/parent-messages', (req, res) => {
  const data = load();
  const all = data.parentMessages || [];
  res.json({ messages: all.filter(m => showsOnMessagesPage(m.source)) });
});

// Admin manual send. Calls notifyAll which appends + pushes + emails.
// Optional groupId targets only members of that group.
app.post('/api/parent-messages', async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const body  = String(b.body || '').trim();
  const url   = String(b.url || '/').trim() || '/';
  const groupId = b.groupId ? String(b.groupId) : null;
  const image = b.image ? String(b.image).trim() : null;
  if (!title) return res.status(400).json({ error: 'Title required' });
  if (groupId) {
    const data = load();
    const g = (data.parentGroups || []).find(x => x.id === groupId);
    if (!g) return res.status(400).json({ error: 'Unknown group' });
  }
  // Manual Messages-page send — this is the only thing that pushes a notification.
  const msg = await notifyAll({ title, body, url, source: 'admin', groupId, image, pushOut: true });
  res.json({ ok: true, message: msg, push: msg._push || null });
});

app.delete('/api/parent-messages/:id', (req, res) => {
  const data = load();
  if (!Array.isArray(data.parentMessages)) data.parentMessages = [];
  data.parentMessages = data.parentMessages.filter(m => m.id !== req.params.id);
  save(data, { silent: true });
  res.json({ ok: true });
});

// ===================== PARENT GROUPS =====================
// Auto-assigned palette for new groups. Cycles when exhausted.
const GROUP_COLORS = [
  '#16a34a', '#7c3aed', '#ea580c', '#0891b2',
  '#c026d3', '#65a30d', '#dc2626', '#0284c7'
];

// Admin creates a group. Auto-fires a join-invitation message to ALL
// subscribers with a link to the join form.
app.post('/api/parent-groups', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const description = String(b.description || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name required' });
  const data = load();
  if (!Array.isArray(data.parentGroups)) data.parentGroups = [];
  const now = Date.now();
  const color = GROUP_COLORS[data.parentGroups.length % GROUP_COLORS.length];
  const group = {
    id: 'grp_' + now + '_' + Math.random().toString(36).slice(2, 8),
    name: name.slice(0, 200),
    description: description.slice(0, 1000),
    color,
    createdAt: now,
    members: []
  };
  data.parentGroups.push(group);
  save(data, { label: 'Group created' });
  // Invite-to-join push goes to EVERYONE — not restricted to the new group
  // (since it would be empty). Source 'admin' so it appears on Messages page.
  await notifyAll({
    title: 'New group: ' + group.name,
    body:  (group.description ? group.description + '\n\n' : '') +
           'Tap below to join this group.',
    url:   '/join-group/' + group.id,
    source: 'admin'
  });
  res.json({ ok: true, group: {
    id: group.id, name: group.name, description: group.description,
    color: group.color, createdAt: group.createdAt, memberCount: 0, memberNames: []
  }});
});

// Public: fetch one group's name + description (for the join-page header).
app.get('/api/parent-groups/:id', (req, res) => {
  const data = load();
  const g = (data.parentGroups || []).find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  res.json({ group: {
    id: g.id, name: g.name, description: g.description, color: g.color
  }});
});

// Public: parent submits the join form. Saves name + email + optional push
// endpoint to the group's members. Idempotent on email (no duplicates).
app.post('/api/parent-groups/:id/join', (req, res) => {
  const data = load();
  if (!Array.isArray(data.parentGroups)) data.parentGroups = [];
  const g = data.parentGroups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  const b = req.body || {};
  const name  = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const endpoint = b.endpoint ? String(b.endpoint) : null;
  if (!name)  return res.status(400).json({ error: 'Name required' });
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!Array.isArray(g.members)) g.members = [];
  let member = g.members.find(m => m.email === email);
  if (member) {
    // Existing member — refresh name and add new endpoint if provided.
    member.name = name.slice(0, 200);
    if (endpoint && !(member.endpoints || []).includes(endpoint)) {
      member.endpoints = (member.endpoints || []).concat(endpoint);
    }
  } else {
    member = {
      id: 'mem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name:  name.slice(0, 200),
      email: email.slice(0, 200),
      joinedAt: Date.now(),
      endpoints: endpoint ? [endpoint] : []
    };
    g.members.push(member);
  }
  save(data, { silent: true });
  res.json({ ok: true, groupId: g.id, groupName: g.name, groupColor: g.color });
});

// Admin: delete a group.
app.delete('/api/parent-groups/:id', (req, res) => {
  const data = load();
  if (!Array.isArray(data.parentGroups)) data.parentGroups = [];
  data.parentGroups = data.parentGroups.filter(g => g.id !== req.params.id);
  save(data, { silent: true });
  res.json({ ok: true });
});

// Deep-link route so /join-group/<id> opens the SPA on the join page.
app.get('/join-group/:id', (req, res) => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const injected = indexHtml.replace(
    '</head>',
    '<script>window.__autoPage="pg-join-group";window.__autoJoinGroupId=' +
      JSON.stringify(req.params.id) + ';</script></head>'
  );
  res.send(injected);
});

// Fan-out push notifications + email to subscribers. Admin-composed
// messages are also persisted to data.parentMessages so they render on the
// Messages page; auto triggers (newsletter publish, etc.) only send.
// If groupId is provided, push + email are restricted to that group's
// members (matched by stored endpoint or email). The message record still
// stores the groupId so the client can filter rendering by membership.
// `pushOut` controls whether a push notification + email actually go out.
// Only manual Messages-page sends push; newsletter/event/group triggers still
// record their Messages-page card (if any) but do not push notifications.
async function notifyAll({ title, body, url, source, groupId, image, pushOut }) {
  const data = load();
  if (!Array.isArray(data.parentMessages))   data.parentMessages   = [];
  if (!Array.isArray(data.pushSubscriptions)) data.pushSubscriptions = [];
  if (!Array.isArray(data.emailSubscribers))  data.emailSubscribers  = [];
  if (!Array.isArray(data.parentGroups))      data.parentGroups      = [];

  const group = groupId ? data.parentGroups.find(g => g.id === groupId) : null;
  // Collect group member endpoints + emails for targeted fan-out.
  const groupEndpoints = group ? new Set(
    (group.members || []).flatMap(m => m.endpoints || [])
  ) : null;
  const groupEmails = group ? new Set(
    (group.members || []).map(m => (m.email || '').toLowerCase()).filter(Boolean)
  ) : null;
  const groupColor = group ? group.color : null;

  const now = Date.now();
  const msg = {
    id: 'pm_' + now + '_' + Math.random().toString(36).slice(2, 8),
    title:   String(title || '').slice(0, 200),
    body:    String(body  || '').slice(0, 4000),
    url:     String(url   || '/').slice(0, 400),
    source:  String(source || 'auto'),
    image:   image ? String(image).slice(0, 400) : null,
    groupId: group ? group.id : null,
    groupColor: groupColor,
    createdAt: now
  };
  const showOnPage = showsOnMessagesPage(msg.source);
  if (showOnPage) {
    data.parentMessages.push(msg);
    save(data, { label: 'Messages' });
  }

  // Push fan-out. Only sources that appear on the Messages page bump the
  // app-icon badge; the badge represents unread items on that page.
  const wp = getWebPush();
  // For group sends, only push to subscriptions whose endpoint is registered
  // to a member of that group. For all-subscriber sends, push to everyone.
  const targetSubs = group
    ? data.pushSubscriptions.filter(s => groupEndpoints.has(s.endpoint))
    : data.pushSubscriptions;
  // A post pushes if it explicitly asked to (pushOut, e.g. the manual admin
  // send) OR if it lands on the Messages page (admin + newsletter). The latter
  // is why publishing a newsletter notifies devices: an earlier change gated
  // push on pushOut alone and accidentally silenced newsletter publishes.
  const doPush = !!pushOut || showOnPage;
  // Delivery diagnostics so the admin can see whether a send actually reached
  // devices (returned to the Messages page after a manual send).
  const pushStats = {
    configured: !!wp,          // web-push library + VAPID keys ready
    requested: doPush,         // did this send push?
    targets: targetSubs.length,// devices we attempted
    sent: 0,                   // accepted by the push service
    failed: 0,                 // errored
    removed: 0,                // dead endpoints pruned
    failures: [],              // per-failure {name, removed} so the admin sees WHO
    sentNames: []              // names of devices the push service accepted (null = unnamed)
  };
  if (doPush && wp && targetSubs.length) {
    const pageCount = data.parentMessages.filter(m => showsOnMessagesPage(m.source)).length;
    const payloadObj = {
      title: msg.title,
      // The notification preview is plain text, so show link markup as just
      // its visible words: "[school site](https://…)" -> "school site".
      body:  msg.body.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1'),
      url:   msg.url
    };
    if (msg.image) payloadObj.image = '/uploads/' + msg.image;
    if (showOnPage) payloadObj.count = pageCount;
    const payload = JSON.stringify(payloadObj);
    // urgency:'high' tells Apple/Google to deliver NOW. Without it the default
    // is "normal", which iOS batches and can hold for hours (delivering only
    // when the person next wakes their phone) — that was the "messages arrive
    // late in the day" symptom. TTL 3 days: if a phone is off longer than that
    // the alert has gone stale, so it expires rather than popping up days later.
    const sendOpts = { urgency: 'high', TTL: 3 * 24 * 60 * 60 };
    const results = await Promise.allSettled(
      targetSubs.map(s => wp.sendNotification(s, payload, sendOpts))
    );
    // Clean up subscriptions that can no longer receive. Two cases:
    //  - 410 Gone / 404 Not Found: the push service says it's dead → remove now.
    //  - anything else (timeouts, 5xx, 429, 400…): could be transient, so we
    //    count consecutive failures per device and only remove after 3 strikes.
    //    A successful send resets the counter. This stops "zombie" subs that
    //    fail every send (but never return 410) from inflating the fail count
    //    forever. Filter the full subs list, not just targetSubs.
    const deadEndpoints = new Set();
    const failBump = {};   // endpoint -> new failCount (0 = reset)
    targetSubs.forEach((s, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') { pushStats.sent++; pushStats.sentNames.push(s.name || null); failBump[s.endpoint] = 0; return; }
      pushStats.failed++;
      const code = r.reason && r.reason.statusCode;
      if (code === 410 || code === 404) {
        deadEndpoints.add(s.endpoint);
      } else {
        const n = (s.failCount || 0) + 1;
        failBump[s.endpoint] = n;
        if (n >= 3) deadEndpoints.add(s.endpoint);
        console.warn('[push] failed', code || '', '(strike ' + n + ')', r.reason && r.reason.message);
      }
      pushStats.failures.push({ name: s.name || null, removed: deadEndpoints.has(s.endpoint) });
    });
    pushStats.removed = deadEndpoints.size;
    if (deadEndpoints.size || Object.keys(failBump).length) {
      const d2 = load();
      d2.pushSubscriptions = (d2.pushSubscriptions || [])
        .filter(s => !deadEndpoints.has(s.endpoint))
        .map(s => {
          if (Object.prototype.hasOwnProperty.call(failBump, s.endpoint)) {
            const n = failBump[s.endpoint];
            if (n === 0) { delete s.failCount; }   // a success cleared the streak
            else s.failCount = n;
          }
          return s;
        });
      save(d2, { silent: true });
    }
  }

  // Email fan-out (best-effort, fire and forget).
  const transport = getMailTransport();
  const targetEmails = group
    ? data.emailSubscribers.filter(e => groupEmails.has((e || '').toLowerCase()))
    : data.emailSubscribers;
  // Same gate as push: manual admin sends (pushOut) and Messages-page posts
  // (newsletter publishes) email subscribers; events/absences do not.
  if (doPush && transport && targetEmails.length) {
    // Default to the live site so the email always has a working link even
    // when APP_URL isn't set in the environment.
    const appUrl   = envClean('APP_URL') || 'https://www.auroa.school.nz';
    const link     = appUrl + (msg.url || '/');
    const fromAddr = envClean('SMTP_FROM') || envClean('SMTP_USER');
    const from     = fromAddr ? ('"Auroa School" <' + fromAddr + '>') : undefined;
    const bodyText = String(msg.body || '').trim();
    const imgUrl   = msg.image ? (appUrl + '/uploads/' + msg.image) : '';
    // Plain-text version — the title is included in the body (not just the
    // subject) so the email is never blank.
    const text =
`${msg.title}

${bodyText ? bodyText + '\n\n' : ''}${imgUrl ? imgUrl + '\n\n' : ''}View on the school website: ${link}

You're receiving this because you subscribed to Auroa School notifications.
To stop, open the school website and tap "Turn off notifications".`;
    // HTML version for a readable, branded email.
    const html =
`<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.6;max-width:560px;margin:0 auto;">
  <h2 style="color:#1a2b4a;margin:0 0 12px;">${nlEscape(msg.title)}</h2>
  ${bodyText ? '<p style="white-space:pre-wrap;margin:0 0 14px;">' + nlEscape(bodyText) + '</p>' : ''}
  ${imgUrl ? '<p style="margin:0 0 14px;"><img src="' + nlEscape(imgUrl) + '" alt="" style="max-width:100%;border-radius:8px;"></p>' : ''}
  <p style="margin:0 0 18px;"><a href="${nlEscape(link)}" style="display:inline-block;background:#1a2b4a;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;">View on the school website</a></p>
  <hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 12px;">
  <p style="font-size:12px;color:#888888;margin:0;">You're receiving this because you subscribed to Auroa School notifications. To stop, open the school website and tap "Turn off notifications".</p>
</div>`;
    for (const to of targetEmails) {
      transport.sendMail({ from, to, subject: msg.title, text, html })
        .catch(e => console.warn('[email] send failed for', to, e.message));
    }
  }

  // Shallow copy so delivery stats reach the caller without polluting the
  // stored Messages-page card.
  return Object.assign({}, msg, { _push: pushStats });
}

app.post('/api/save', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  const data = load();
  if (key.startsWith('pageContent.')) {
    data.pageContent[key.slice('pageContent.'.length)] = value;
  } else {
    data[key] = value;
  }
  save(data, { label: saveLabelForKey(key) });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Auroa Website running at http://localhost:${PORT}`);
  // Shrink any oversized images already on the volume (idempotent, background).
  migrateOversizedImages().catch(e => console.error('[img] migration error:', e.message));
});
