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
  // Returns YYYY-MM-DD of the most recent Saturday on or before `when`.
  // Week boundary is midnight Friday -> Saturday, so the weekly table
  // automatically resets each Saturday morning.
  var d = new Date(when);
  var day = d.getDay(); // 0=Sun .. 6=Sat
  var diff = (day === 6) ? 0 : -(day + 1);
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
  }
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];
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
function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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

app.get('/api/state', (req, res) => res.json(load()));

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
  save(data);
  res.json({ ok: true, order });
});

app.delete('/api/lunch-order/:id', (req, res) => {
  const id = req.params.id;
  const data = load();
  if (!Array.isArray(data.lunchOrders)) data.lunchOrders = [];
  const before = data.lunchOrders.length;
  data.lunchOrders = data.lunchOrders.filter(o => o.id !== id);
  save(data);
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
  save(data);
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

// Single image upload for the newsletter (header, principal, notice).
// Files persist forever so saved snapshots keep working even when the
// admin replaces the editing draft's images.
app.post('/api/upload/newsletter', uploader('nl').single('image'), (req, res) => {
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
    principalMessage: String(b.principalMessage || '').slice(0, 50000),
    importantDates: String(b.importantDates || '').slice(0, 20000),
    studentsWeekImage: b.studentsWeekImage || null,
    studentsWeekMessage: String(b.studentsWeekMessage || '').slice(0, 20000),
    campsDayTrips: String(b.campsDayTrips || '').slice(0, 20000),
    schoolAccountsPayments: String(b.schoolAccountsPayments || '').slice(0, 20000),
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

  const now = Date.now();
  // Update existing snapshot if same termLabel, else create new
  let snap = data.newsletterSnapshots.find(s => s.termLabel === draft.termLabel);
  if (snap) {
    snap.headerImage          = draft.headerImage;
    snap.principalImage       = draft.principalImage;
    snap.principalMessage     = draft.principalMessage;
    snap.importantDates       = draft.importantDates;
    snap.studentsWeekImage    = draft.studentsWeekImage;
    snap.studentsWeekMessage  = draft.studentsWeekMessage;
    snap.campsDayTrips        = draft.campsDayTrips;
    snap.schoolAccountsPayments = draft.schoolAccountsPayments;
    snap.footerImage            = draft.footerImage;
    snap.notices              = draft.notices.map(n => ({ id: n.id, caption: n.caption, filename: n.filename }));
    snap.updatedAt            = now;
  } else {
    const baseSlug = nlSlug(draft.termLabel);
    snap = {
      id: 'ns_' + now + '_' + Math.random().toString(36).slice(2, 8),
      termLabel: draft.termLabel,
      slug: nlUniqueSlug(baseSlug, data.newsletterSnapshots),
      headerImage: draft.headerImage,
      principalImage: draft.principalImage,
      principalMessage: draft.principalMessage,
      importantDates: draft.importantDates,
      studentsWeekImage: draft.studentsWeekImage,
      studentsWeekMessage: draft.studentsWeekMessage,
      campsDayTrips: draft.campsDayTrips,
      schoolAccountsPayments: draft.schoolAccountsPayments,
      footerImage: draft.footerImage,
      notices: draft.notices.map(n => ({ id: n.id, caption: n.caption, filename: n.filename })),
      createdAt: now,
      updatedAt: now
    };
    data.newsletterSnapshots.push(snap);
  }
  save(data);
  res.json({ ok: true, snapshot: snap });
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
    (data.newsletter.notices || []).forEach(n => add(n && n.filename));
  }
  (data.newsletterSnapshots || []).forEach(s => {
    add(s.headerImage);
    add(s.principalImage);
    add(s.studentsWeekImage);
    add(s.footerImage);
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
  save(data);
  res.json({ ok: true, removed: 1, filesRemoved });
});

// Soft-delete: hide a snapshot from the admin list without breaking the URL.
app.post('/api/newsletter-snapshot/:id/hidden', (req, res) => {
  const data = load();
  if (!Array.isArray(data.newsletterSnapshots)) data.newsletterSnapshots = [];
  const snap = data.newsletterSnapshots.find(s => s.id === req.params.id);
  if (!snap) return res.status(404).json({ error: 'Not found' });
  snap.hidden = !!(req.body && req.body.hidden);
  save(data);
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
  const datesHtml = nlEscape(snap.importantDates || '').replace(/\n/g, '<br>');
  const sotwHtml = nlEscape(snap.studentsWeekMessage || '').replace(/\n/g, '<br>');
  const campsHtml = nlEscape(snap.campsDayTrips || '').replace(/\n/g, '<br>');
  const sapHtml = nlEscape(snap.schoolAccountsPayments || '').replace(/\n/g, '<br>');
  const nlFooter = snap.footerImage ? '/uploads/' + nlEscape(snap.footerImage) : null;
  const noticesHtml = (snap.notices || []).filter(n => n.filename).map(n => {
    const url = '/uploads/' + nlEscape(n.filename);
    return `<figure class="nl-pub-notice">
      ${n.caption ? `<figcaption>${nlEscape(n.caption)}</figcaption>` : ''}
      <img src="${url}" alt="${nlEscape(n.caption || 'Notice image')}" onclick="lbOpen('${url}')" />
    </figure>`;
  }).join('');
  const msgHtml = nlEscape(snap.principalMessage || '').replace(/\n/g, '<br>');

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
  .nl-pub h2{color:#1a2b4a;font-size:22px;font-weight:700;border-bottom:2px solid #c0642b;padding-bottom:6px;margin:32px 0 14px;}
  .nl-pub-principal-img{margin:0 0 14px;}
  .nl-pub-principal-img img{max-width:280px;display:block;border-radius:10px;}
  .nl-pub-msg{font-size:15px;color:#333;}
  .nl-pub-msg p{margin-bottom:10px;}
  .nl-pub-notices{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:8px;}
  .nl-pub-notice{display:flex;flex-direction:column;gap:8px;}
  .nl-pub-notice figcaption{font-weight:600;color:#1a2b4a;font-size:14px;}
  .nl-pub-notice img{width:100%;display:block;border-radius:10px;cursor:zoom-in;border:1px solid #eaeaea;}
  .nl-pub-meta{color:#888;font-size:12px;text-align:center;margin-top:40px;}
  #lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;justify-content:center;align-items:center;padding:20px;cursor:zoom-out;}
  #lb.open{display:flex;}
  #lb img{max-width:100%;max-height:100%;border-radius:6px;}
  #lb-close{position:fixed;top:14px;right:18px;background:#fff;border:none;color:#1a2b4a;font-size:22px;width:38px;height:38px;border-radius:50%;cursor:pointer;}
  @media (max-width:768px){
    .nl-pub h1{font-size:26px;}
    .nl-pub h2{font-size:18px;}
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
  <div class="nl-pub-msg"><p>${msgHtml || ''}</p></div>
  ${(nlSotw || sotwHtml) ? `<h2>Students of the Week</h2>${nlSotw ? `<div class="nl-pub-hero"><img src="${nlSotw}" alt=""></div>` : ''}${sotwHtml ? `<div class="nl-pub-msg"><p>${sotwHtml}</p></div>` : ''}` : ''}
  ${datesHtml ? `<h2>Important Dates</h2><div class="nl-pub-msg"><p>${datesHtml}</p></div>` : ''}
  ${noticesHtml ? `<h2>Notices</h2><div class="nl-pub-notices">${noticesHtml}</div>` : ''}
  ${sapHtml ? `<h2>School Accounts and Payments</h2><div class="nl-pub-msg"><p>${sapHtml}</p></div>` : ''}
  ${campsHtml ? `<h2>Camps and Day Trips</h2><div class="nl-pub-msg"><p>${campsHtml}</p></div>` : ''}
  ${nlFooter ? `<div class="nl-pub-hero" style="margin-top:32px;"><img src="${nlFooter}" alt=""></div>` : ''}
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

// Generic save
app.post('/api/save', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  const data = load();
  if (key.startsWith('pageContent.')) {
    data.pageContent[key.slice('pageContent.'.length)] = value;
  } else {
    data[key] = value;
  }
  save(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Auroa Website running at http://localhost:${PORT}`);
});
