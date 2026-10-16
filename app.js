import { createStore, CATEGORIES, StoreError } from './store.js';

const store = createStore(window.localStorage);
const $ = (s) => document.querySelector(s);
const main = $('#main'), dialog = $('#book-dialog');
const money = (n) => '$' + n.toLocaleString('en-US');
const prefs = { q: '', category: '', sort: 'newest' };

// Safe DOM builder: text is always inserted as text nodes, never as HTML.
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
};
let toastTimer;
const toast = (msg) => {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
};
const go = (path) => { location.hash = path; };
const guard = (fn, errEl) => async (...a) => {
  try { errEl && (errEl.textContent = ''); return await fn(...a); }
  catch (e) { if (!(e instanceof StoreError)) console.error(e); const m = e instanceof StoreError ? e.message : 'Something went wrong. Try again.'; errEl ? (errEl.textContent = m) : toast(m); }
};
const field = (label, id, input) => h('div', {}, h('label', { for: id }, label), input);

function renderNav(route) {
  const u = store.currentUser(); const nav = $('#nav'); nav.replaceChildren();
  const link = (href, text) => h('a', { href: '#' + href, 'aria-current': route === href ? 'page' : null }, text);
  nav.append(link('/', 'Catalog'));
  if (u) nav.append(link('/dashboard', u.role === 'freelancer' ? 'My services' : 'My bookings'),
    h('span', { class: 'who' }, u.name), h('button', { onclick: () => { store.logout(); toast('Logged out.'); go('/'); } }, 'Log out'));
  else nav.append(link('/login', 'Log in'), link('/register', 'Sign up'));
}

function catalog() {
  const u = store.currentUser();
  const grid = h('ul', { class: 'grid', 'aria-live': 'polite' });
  const draw = () => {
    const items = store.listServices(prefs); grid.replaceChildren();
    if (!items.length) { grid.append(h('li', { class: 'empty' }, 'No services match. Clear the search or pick another category.')); return; }
    for (const s of items) grid.append(h('li', { class: 'card' },
      h('div', { class: 'meta' }, h('span', { class: 'tag' }, s.category), h('span', { class: 'price' }, money(s.price))),
      h('h3', {}, s.title), h('p', {}, s.description), h('span', { class: 'tag' }, 'by ' + s.ownerName),
      h('button', { class: 'btn', disabled: u?.role === 'freelancer', onclick: () => (u ? openBooking(s) : go('/login')) },
        u?.role === 'freelancer' ? 'Clients only' : u ? 'Book' : 'Log in to book')));
  };
  const q = h('input', { id: 'q', type: 'search', value: prefs.q, oninput: (e) => { prefs.q = e.target.value; draw(); } });
  const cat = h('select', { id: 'cat', onchange: (e) => { prefs.category = e.target.value; draw(); } },
    h('option', { value: '' }, 'All categories'), CATEGORIES.map((c) => h('option', { value: c, selected: prefs.category === c }, c)));
  const sort = h('select', { id: 'sort', onchange: (e) => { prefs.sort = e.target.value; draw(); } },
    [['newest', 'Newest'], ['price-asc', 'Price, low to high'], ['price-desc', 'Price, high to low'], ['title', 'Title A to Z']]
      .map(([v, t]) => h('option', { value: v, selected: prefs.sort === v }, t)));
  draw();
  return [h('h1', {}, 'Book skilled freelancers by the day.'),
    h('p', { class: 'lede' }, 'Browse fixed-price services, pick a date, and track every booking in one place.'),
    h('div', { class: 'tools' }, field('Search', 'q', q), field('Category', 'cat', cat), field('Sort by', 'sort', sort)), grid];
}

function openBooking(s) {
  const err = h('p', { class: 'err', role: 'alert' });
  const date = h('input', { id: 'bd', type: 'date', required: true, min: new Date().toISOString().slice(0, 10) });
  const note = h('textarea', { id: 'bn', maxlength: 200 });
  dialog.replaceChildren(h('h2', { id: 'book-title', style: 'margin-top:0' }, 'Book: ' + s.title),
    h('div', { class: 'form', style: 'border:0;padding:0' }, field('Date', 'bd', date), field('Note (optional)', 'bn', note), err,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: guard(() => { store.book(s.id, date.value, note.value); dialog.close(); toast('Booked.'); }, err) }, 'Confirm booking'),
        h('button', { class: 'btn ghost', onclick: () => dialog.close() }, 'Cancel'))));
  dialog.showModal(); date.focus();
}

function authForm(mode) {
  const err = h('p', { class: 'err', role: 'alert' }); const reg = mode === 'register';
  const f = {
    name: h('input', { id: 'name', autocomplete: 'name', required: true }),
    email: h('input', { id: 'email', type: 'email', autocomplete: 'email', required: true }),
    password: h('input', { id: 'pw', type: 'password', autocomplete: reg ? 'new-password' : 'current-password', required: true }),
    role: h('select', { id: 'role' }, h('option', { value: 'client' }, 'Client: I want to book services'), h('option', { value: 'freelancer' }, 'Freelancer: I offer services')),
  };
  const submit = guard(async (e) => {
    e.preventDefault();
    if (reg) await store.register({ name: f.name.value, email: f.email.value, password: f.password.value, role: f.role.value });
    else await store.login(f.email.value, f.password.value);
    toast(reg ? 'Account created.' : 'Welcome back.'); go(store.currentUser().role === 'freelancer' ? '/dashboard' : '/');
  }, err);
  return [h('h1', {}, reg ? 'Create your account' : 'Log in'),
    h('p', { class: 'lede' }, 'Demo app: accounts are stored in this browser only. Do not use a real password.'),
    h('form', { class: 'form', onsubmit: submit, novalidate: true },
      reg && field('Name', 'name', f.name), field('Email', 'email', f.email), field('Password (8+ characters)', 'pw', f.password),
      reg && field('Account type', 'role', f.role), err,
      h('button', { class: 'btn', type: 'submit' }, reg ? 'Create account' : 'Log in'),
      h('a', { href: reg ? '#/login' : '#/register' }, reg ? 'Already have an account? Log in' : 'New here? Sign up'))];
}

function dashboard() {
  const u = store.currentUser(); if (!u) { go('/login'); return []; }
  const bookings = store.listBookings();
  const bookingList = h('ul', { class: 'list' }, bookings.length ? bookings.map((b) => h('li', {},
    h('div', {}, h('strong', {}, b.service.title), h('div', { class: 'tag' }, b.date + (u.role === 'freelancer' ? ' · ' + b.clientName : '') + (b.note ? ' · ' + b.note : ''))),
    u.role === 'client' && h('button', { class: 'btn danger', onclick: guard(() => { store.cancelBooking(b.id); toast('Booking cancelled.'); render(); }) }, 'Cancel booking')))
    : h('li', { class: 'empty', style: 'display:block;width:100%' }, u.role === 'client' ? 'No bookings yet. Browse the catalog and book a date.' : 'No bookings yet. They will appear here.'));
  if (u.role === 'client') return [h('h1', {}, 'My bookings'), bookingList];

  let editing = null; const err = h('p', { class: 'err', role: 'alert' });
  const mine = () => store.listServices().filter((s) => s.ownerId === u.id);
  const f = {
    title: h('input', { id: 't', required: true, maxlength: 60 }),
    category: h('select', { id: 'c' }, CATEGORIES.map((c) => h('option', { value: c }, c))),
    price: h('input', { id: 'p', type: 'number', min: 1, max: 10000 }),
    description: h('textarea', { id: 'd', maxlength: 300 }),
  };
  const saveBtn = h('button', { class: 'btn', type: 'submit' }, 'Add service');
  const cancelEdit = h('button', { class: 'btn ghost', type: 'button', hidden: true, onclick: () => reset() }, 'Cancel edit');
  const list = h('ul', { class: 'list' });
  const reset = () => { editing = null; for (const k in f) f[k].value = k === 'category' ? CATEGORIES[0] : ''; saveBtn.textContent = 'Add service'; cancelEdit.hidden = true; err.textContent = ''; };
  const draw = () => {
    list.replaceChildren(...(mine().length ? mine().map((s) => h('li', {},
      h('div', {}, h('strong', {}, s.title), h('div', { class: 'tag' }, s.category + ' · ' + money(s.price))),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => { editing = s.id; for (const k in f) f[k].value = s[k]; saveBtn.textContent = 'Save changes'; cancelEdit.hidden = false; f.title.focus(); } }, 'Edit'),
        h('button', { class: 'btn danger', onclick: guard(() => { if (confirm(`Delete "${s.title}" and its bookings?`)) { store.deleteService(s.id); if (editing === s.id) reset(); toast('Service deleted.'); render(); } }) }, 'Delete'))))
      : [h('li', { class: 'empty', style: 'display:block;width:100%' }, 'You have no services yet. Add your first one above.')]));
  };
  const submit = guard((e) => {
    e.preventDefault(); const data = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    if (editing) { store.updateService(editing, data); toast('Changes saved.'); } else { store.createService(data); toast('Service added.'); }
    reset(); render();
  }, err);
  reset(); draw();
  return [h('h1', {}, 'My services'),
    h('form', { class: 'form wide', onsubmit: submit, novalidate: true },
      field('Title', 't', f.title), field('Category', 'c', f.category), field('Price (USD)', 'p', f.price),
      h('div', { class: 'full' }, field('Description', 'd', f.description)), h('div', { class: 'full' }, err),
      h('div', { class: 'full row' }, saveBtn, cancelEdit)),
    h('h2', {}, 'Your listings'), list, h('h2', {}, 'Incoming bookings'), bookingList];
}

const routes = { '/': catalog, '/login': () => authForm('login'), '/register': () => authForm('register'), '/dashboard': dashboard };
function render() {
  const route = location.hash.slice(1) || '/';
  const view = routes[route] || (() => [h('h1', {}, 'Page not found'), h('a', { href: '#/' }, 'Back to the catalog')]);
  renderNav(route); main.replaceChildren(...view());
}
window.addEventListener('hashchange', () => { render(); main.focus(); });
render();
