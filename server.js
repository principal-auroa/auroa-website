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
function mondayKey(when) {
  var d = new Date(when);
  var day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
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
    weekKey: mondayKey(now),
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
