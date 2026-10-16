// Pure data layer: no DOM access, so it runs in the browser and under `node --test`.
const KEY = 'fb.v1';
export const CATEGORIES = ['Design', 'Development', 'Writing', 'Marketing'];
const SEED = [
  ['Brand identity kit', 'Design', 480, 'Logo, colour palette and type system delivered as a one-page brand guide.'],
  ['Landing page build', 'Development', 650, 'Responsive, accessible landing page built with clean HTML, CSS and JavaScript.'],
  ['Product copywriting', 'Writing', 220, 'Ten product descriptions written in your voice and tuned for search.'],
  ['Social media launch plan', 'Marketing', 310, 'Four-week content calendar with post copy and a posting schedule.'],
  ['Mobile app UI review', 'Design', 390, 'Heuristic review of up to 15 screens with prioritised fixes and mockups.'],
  ['API integration', 'Development', 540, 'Connect your site to a third-party REST API with error handling and tests.'],
].map(([title, category, price, description], i) => ({
  id: 'seed' + i, ownerId: 'seed', ownerName: 'Studio team', title, category, price, description,
}));

export class StoreError extends Error {}
const fail = (m) => { throw new StoreError(m); };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const hash = async (pw, salt) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pw)));
const pub = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role };

export function validateService(d) {
  const title = String(d.title ?? '').trim();
  const description = String(d.description ?? '').trim();
  const price = Number(d.price);
  if (title.length < 3 || title.length > 60) fail('Title must be 3 to 60 characters.');
  if (!CATEGORIES.includes(d.category)) fail('Choose a category.');
  if (!Number.isFinite(price) || price <= 0 || price > 10000) fail('Price must be between 1 and 10,000.');
  if (description.length < 10 || description.length > 300) fail('Description must be 10 to 300 characters.');
  return { title, category: d.category, price: Math.round(price), description };
}

export function createStore(storage, now = () => new Date()) {
  let db = load();
  function load() {
    try {
      const d = JSON.parse(storage.getItem(KEY));
      if (d && Array.isArray(d.users) && Array.isArray(d.services) && Array.isArray(d.bookings)) return d;
    } catch { /* corrupted or missing: fall through to a fresh database */ }
    return { users: [], services: SEED.map((s) => ({ ...s })), bookings: [], session: null };
  }
  const save = () => storage.setItem(KEY, JSON.stringify(db));
  const me = () => db.users.find((u) => u.id === db.session) || null;
  const need = (role) => {
    const u = me();
    if (!u) fail('Log in to continue.');
    if (role && u.role !== role) fail(`Only ${role}s can do that.`);
    return u;
  };

  return {
    currentUser: () => pub(me()),
    async register({ name, email, password, role }) {
      name = String(name ?? '').trim(); email = String(email ?? '').trim().toLowerCase();
      if (name.length < 2) fail('Enter your name.');
      if (!/^\S+@\S+\.\S+$/.test(email)) fail('Enter a valid email address.');
      if (String(password ?? '').length < 8) fail('Password must be at least 8 characters.');
      if (!['client', 'freelancer'].includes(role)) fail('Choose an account type.');
      if (db.users.some((u) => u.email === email)) fail('An account with this email already exists.');
      const salt = uid();
      const user = { id: uid(), name, email, role, salt, hash: await hash(password, salt) };
      db.users.push(user); db.session = user.id; save();
      return pub(user);
    },
    async login(email, password) {
      const u = db.users.find((x) => x.email === String(email ?? '').trim().toLowerCase());
      if (!u || (await hash(String(password ?? ''), u.salt)) !== u.hash) fail('Email or password is incorrect.');
      db.session = u.id; save();
      return pub(u);
    },
    logout() { db.session = null; save(); },

    listServices({ q = '', category = '', sort = 'newest' } = {}) {
      const term = q.trim().toLowerCase();
      const out = db.services.filter((s) =>
        (!category || s.category === category) &&
        (!term || `${s.title} ${s.description} ${s.ownerName}`.toLowerCase().includes(term)));
      const by = {
        'price-asc': (a, b) => a.price - b.price,
        'price-desc': (a, b) => b.price - a.price,
        title: (a, b) => a.title.localeCompare(b.title),
      }[sort];
      return by ? out.sort(by) : out.slice().reverse();
    },
    createService(data) {
      const u = need('freelancer');
      const s = { id: uid(), ownerId: u.id, ownerName: u.name, ...validateService(data) };
      db.services.push(s); save(); return s;
    },
    updateService(id, data) {
      const u = need('freelancer');
      const s = db.services.find((x) => x.id === id);
      if (!s) fail('That service no longer exists.');
      if (s.ownerId !== u.id) fail('You can only edit your own services.');
      Object.assign(s, validateService(data)); save(); return s;
    },
    deleteService(id) {
      const u = need('freelancer');
      const s = db.services.find((x) => x.id === id);
      if (!s) fail('That service no longer exists.');
      if (s.ownerId !== u.id) fail('You can only delete your own services.');
      db.services = db.services.filter((x) => x.id !== id);
      db.bookings = db.bookings.filter((b) => b.serviceId !== id);
      save();
    },

    book(serviceId, date, note = '') {
      const u = need('client');
      const s = db.services.find((x) => x.id === serviceId);
      if (!s) fail('That service no longer exists.');
      const today = now().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) fail('Pick a date today or later.');
      if (db.bookings.some((b) => b.clientId === u.id && b.serviceId === serviceId && b.date === date))
        fail('You already booked this service for that date.');
      const b = { id: uid(), serviceId, clientId: u.id, clientName: u.name, date, note: String(note).trim().slice(0, 200) };
      db.bookings.push(b); save(); return b;
    },
    listBookings() {
      const u = need();
      const mine = db.bookings.filter((b) => (u.role === 'client' ? b.clientId === u.id
        : db.services.find((s) => s.id === b.serviceId)?.ownerId === u.id));
      return mine.map((b) => ({ ...b, service: db.services.find((s) => s.id === b.serviceId) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    cancelBooking(id) {
      const u = need('client');
      const b = db.bookings.find((x) => x.id === id && x.clientId === u.id);
      if (!b) fail('Booking not found.');
      db.bookings = db.bookings.filter((x) => x.id !== id); save();
    },
  };
}
