const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

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
  // Returns YYYY-MM-DD of the most recent Friday-3pm boundary at or before `when`.
  // Each week's batch runs Fri 3pm → following Fri 2:59pm. After Friday 3pm the
  // admin's "This week" view automatically flips to a new (empty) week.
  var d = new Date(when);
  var day = d.getDay(); // 0=Sun .. 6=Sat
  var diff;
  if (day === 5) {
    // Friday: split at 3pm local time
    diff = (d.getHours() < 15) ? -7 : 0;
  } else {
    // Days since most recent Friday going backwards
    diff = -((day - 5 + 7) % 7);
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
  }
  // Published version visitors see, distinct from the draft that admins edit.
  // Only the Publish endpoint writes to this — no auto-seeding from the draft,
  // so unpublished edits can never leak to the public view.
  if (typeof data.newsletterPublished === 'undefined') {
    data.newsletterPublished = null;
  }
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];
  if (!Array.isArray(data.hallBookings)) data.hallBookings = [];
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
      const byMime = /image\/(jpeg|png|gif|webp|svg\+xml|x-png|bmp|tiff)/.test(file.mimetype);
      const byExt  = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff?)$/i.test(file.originalname);
      cb(null, byMime || byExt);
    }
  });
}

// ---- middleware ----
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS));

// ---- API ----

// /api/state strips the full editHistory snapshots (30 copies of data is heavy)
// and replaces them with a lightweight count + recent metadata for the Undo UI.
app.get('/api/state', (req, res) => {
  const data = load();
  const {
    editHistory = [],
    vapidPrivateKey, vapidPublicKey,        // server-only
    pushSubscriptions, emailSubscribers,    // contains push endpoints + emails (PII)
    parentMessages = [],                    // filter to messages-page sources only
    parentGroups = [],                      // strip member emails / endpoints (PII)
    ...rest
  } = data;
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

app.post('/api/upload/header', uploader('header').single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.headerImage);
  data.headerImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

app.post('/api/upload/educate', uploader('educate').single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.educateImage);
  data.educateImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

// Full-width image at the bottom of the home page (replaces the old
// text + image info table).
app.post('/api/upload/homefooter', uploader('homefooter').single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = load();
  deleteFile(data.homeFooterImage);
  data.homeFooterImage = req.file.filename;
  save(data);
  res.json({ filename: req.file.filename });
});

app.post('/api/upload/carousel', uploader('carousel').single('image'), (req, res) => {
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
app.post('/api/upload/sport/:sportId', uploader('sport').single('image'), (req, res) => {
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
app.post('/api/upload/pride/:slotId', uploader('pride').single('image'), (req, res) => {
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
app.post('/api/upload/educatefooter/:slot', uploader('educatefooter').single('image'), (req, res) => {
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
app.post('/api/upload/homeinfo/:slot', uploader('homeinfo').single('image'), (req, res) => {
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
app.post('/api/upload/classroom/:slot', uploader('classroom').single('image'), (req, res) => {
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
app.post('/api/upload/staff/:slotId', uploader('staff').single('image'), (req, res) => {
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
}).single('file'), (req, res) => {
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
app.post('/api/upload/contact', uploader('contact').single('image'), (req, res) => {
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
    cb(null, /audio\/(mpeg|wav|wave|x-wav|mp3|ogg|mp4)/.test(file.mimetype) ||
             /\.(mp3|wav|ogg|m4a)$/i.test(file.originalname));
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
app.post('/api/upload/event/:eventId', uploader('event').single('image'), (req, res) => {
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
app.post('/api/upload/newsletter', uploader('nl').single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ filename: req.file.filename });
});

// Single image upload for an admin-composed Messages-page message.
// Files persist forever so the message keeps rendering its image.
app.post('/api/upload/message', uploader('msg').single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ filename: req.file.filename });
});

// Save (or update) the current newsletter draft + create/update a public snapshot.
app.post('/api/newsletter/save', (req, res) => {
  const b = req.body || {};
  const draft = {
    termLabel: String(b.termLabel || '').trim().slice(0, 200) || 'Newsletter',
    headerImage: b.headerImage || null,
    principalImage: b.principalImage || null,
    principalMessage: sanitiseRich(b.principalMessage || '').slice(0, 200000),
    importantDates: sanitiseRich(b.importantDates || '').slice(0, 100000),
    studentsWeekImage: b.studentsWeekImage || null,
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
    })) : []
  };

  const data = load();
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
  res.json({ ok: true });
});

// Explicit publish — creates a new shareable snapshot (or updates the
// matching one if the Term/Week label already exists), then returns its URL.
app.post('/api/newsletter/publish', (req, res) => {
  const data = load();
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];
  const draft = data.newsletter || {};
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
  res.json({ ok: true, snapshot: snap, isNew });
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

  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
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
  const time = String(b.time || '').trim();
  const name = String(b.name || '').trim();
  const details = String(b.details || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Pick a date.' });
  if (!/^\d{1,2}:\d{2}$/.test(time))    return res.status(400).json({ error: 'Pick a time.' });
  if (!name)                            return res.status(400).json({ error: 'Event name is required.' });

  const data = load();
  if (!Array.isArray(data.upcomingEvents)) data.upcomingEvents = [];
  const now = Date.now();
  const event = {
    id: 'ue_' + now + '_' + Math.random().toString(36).slice(2, 8),
    date,
    time,
    name: name.slice(0, 200),
    details: details.slice(0, 4000),
    createdAt: now
  };
  data.upcomingEvents.push(event);
  save(data, { label: 'Upcoming Events' });
  // Notify subscribers of the new event.
  notifyAll({
    title: 'New event: ' + event.name,
    body:  event.date + ' at ' + event.time + (event.details ? '\n\n' + event.details : ''),
    url:   '/',
    source: 'event'
  }).catch(e => console.warn('[notify] event trigger failed:', e.message));
  res.json({ ok: true, event });
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
app.post('/api/upcoming-events/image', uploader('ue').single('image'), (req, res) => {
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
    _webpush.setVapidDetails(
      'mailto:' + (envClean('SMTP_FROM').match(/<([^>]+)>/) || [])[1] ||
        envClean('SMTP_USER') || 'mailto:admin@auroa.school.nz',
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
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Missing subscription' });
  const data = load();
  if (!Array.isArray(data.pushSubscriptions)) data.pushSubscriptions = [];
  if (!Array.isArray(data.emailSubscribers)) data.emailSubscribers = [];
  // Dedupe by endpoint
  data.pushSubscriptions = data.pushSubscriptions.filter(s => s.endpoint !== sub.endpoint);
  data.pushSubscriptions.push(sub);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && data.emailSubscribers.indexOf(email) === -1) {
    data.emailSubscribers.push(email);
  }
  save(data, { silent: true });
  res.json({ ok: true });
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
  const msg = await notifyAll({ title, body, url, source: 'admin', groupId, image });
  res.json({ ok: true, message: msg });
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
async function notifyAll({ title, body, url, source, groupId, image }) {
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
  if (wp && targetSubs.length) {
    const pageCount = data.parentMessages.filter(m => showsOnMessagesPage(m.source)).length;
    const payloadObj = {
      title: msg.title,
      body:  msg.body,
      url:   msg.url
    };
    if (msg.image) payloadObj.image = '/uploads/' + msg.image;
    if (showOnPage) payloadObj.count = pageCount;
    const payload = JSON.stringify(payloadObj);
    const results = await Promise.allSettled(
      targetSubs.map(s => wp.sendNotification(s, payload))
    );
    // Clean up dead subscriptions (410 Gone / 404 Not Found).
    // Filter the full subs list, not just targetSubs.
    const deadEndpoints = new Set();
    targetSubs.forEach((s, i) => {
      const r = results[i];
      if (r.status === 'rejected') {
        const code = r.reason && r.reason.statusCode;
        if (code === 410 || code === 404) deadEndpoints.add(s.endpoint);
        else console.warn('[push] failed', code || '', r.reason && r.reason.message);
      }
    });
    if (deadEndpoints.size) {
      const d2 = load();
      d2.pushSubscriptions = (d2.pushSubscriptions || []).filter(s => !deadEndpoints.has(s.endpoint));
      save(d2, { silent: true });
    }
  }

  // Email fan-out (best-effort, fire and forget).
  const transport = getMailTransport();
  const targetEmails = group
    ? data.emailSubscribers.filter(e => groupEmails.has((e || '').toLowerCase()))
    : data.emailSubscribers;
  if (transport && targetEmails.length) {
    const appUrl = envClean('APP_URL') || '';
    for (const to of targetEmails) {
      transport.sendMail({
        from:    envClean('SMTP_FROM') || envClean('SMTP_USER'),
        to,
        subject: msg.title,
        text:
`${msg.body}
${msg.image && appUrl ? '\n' + appUrl + '/uploads/' + msg.image + '\n' : ''}
${appUrl ? appUrl + msg.url : ''}

You're receiving this because you subscribed to Auroa School notifications.
To stop, open the school website and tap "Turn off notifications".`
      }).catch(e => console.warn('[email] send failed for', to, e.message));
    }
  }

  return msg;
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
});
