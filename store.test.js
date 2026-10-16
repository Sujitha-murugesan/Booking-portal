import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, StoreError } from '../js/store.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const fixed = () => new Date('2026-10-16T09:00:00Z');
const fl = { name: 'Asha', email: 'asha@example.com', password: 'password1', role: 'freelancer' };
const cl = { name: 'Ravi', email: 'ravi@example.com', password: 'password1', role: 'client' };
const rejects = (p, re) => assert.rejects(Promise.resolve().then(p), (e) => e instanceof StoreError && re.test(e.message));
const throwsStore = (f, re) => assert.throws(f, (e) => e instanceof StoreError && re.test(e.message));
const svc = { title: 'Logo design', category: 'Design', price: 100, description: 'A simple logo with two revisions.' };

test('seeds the catalog on first load', () => assert.equal(createStore(mem()).listServices().length, 6));

test('register validates input and rejects duplicates', async () => {
  const s = createStore(mem(), fixed);
  await rejects(() => s.register({ ...fl, password: 'short' }), /8 characters/);
  await rejects(() => s.register({ ...fl, email: 'nope' }), /valid email/);
  await s.register(fl);
  await rejects(() => s.register(fl), /already exists/);
});

test('passwords are never stored in plain text', async () => {
  const st = mem(); await createStore(st, fixed).register(fl);
  assert.ok(!st.getItem('fb.v1').includes('password1'));
});

test('login, logout and session persistence across reloads', async () => {
  const st = mem(); const s = createStore(st, fixed);
  await s.register(fl); s.logout(); assert.equal(s.currentUser(), null);
  await rejects(() => s.login(fl.email, 'wrongpass1'), /incorrect/);
  await s.login('ASHA@example.com', fl.password);
  assert.equal(createStore(st, fixed).currentUser().email, fl.email);
});

test('freelancer CRUD with ownership rules', async () => {
  const s = createStore(mem(), fixed);
  await s.register(fl);
  const made = s.createService(svc);
  assert.equal(s.updateService(made.id, { ...svc, price: 150 }).price, 150);
  throwsStore(() => s.updateService('seed0', svc), /own services/);
  throwsStore(() => s.createService({ ...svc, price: -5 }), /Price/);
  s.deleteService(made.id);
  assert.equal(s.listServices({ q: 'Logo design' }).length, 0);
});

test('clients cannot manage services; guests cannot book', async () => {
  const s = createStore(mem(), fixed);
  throwsStore(() => s.book('seed0', '2026-11-01'), /Log in/);
  await s.register(cl);
  throwsStore(() => s.createService(svc), /freelancers/);
});

test('booking rules: past dates, duplicates, cancel', async () => {
  const s = createStore(mem(), fixed); await s.register(cl);
  throwsStore(() => s.book('seed0', '2026-10-15'), /today or later/);
  const b = s.book('seed0', '2026-10-16');
  throwsStore(() => s.book('seed0', '2026-10-16'), /already booked/);
  assert.equal(s.listBookings().length, 1);
  s.cancelBooking(b.id); assert.equal(s.listBookings().length, 0);
});

test('freelancer sees bookings on own services; deleting a service removes them', async () => {
  const a = createStore(mem(), fixed);
  await a.register(fl); const made = a.createService(svc); a.logout();
  await a.register(cl); a.book(made.id, '2026-12-01'); a.logout();
  await a.login(fl.email, fl.password);
  assert.equal(a.listBookings()[0].clientName, 'Ravi');
  a.deleteService(made.id); assert.equal(a.listBookings().length, 0);
});

test('search, filter and sort', () => {
  const s = createStore(mem());
  assert.ok(s.listServices({ category: 'Design' }).every((x) => x.category === 'Design'));
  assert.equal(s.listServices({ q: 'landing' }).length, 1);
  const p = s.listServices({ sort: 'price-asc' }).map((x) => x.price);
  assert.deepEqual(p, [...p].sort((x, y) => x - y));
});

test('corrupted storage falls back to a clean database', () => {
  const st = mem(); st.setItem('fb.v1', '{oops');
  assert.equal(createStore(st).listServices().length, 6);
});
