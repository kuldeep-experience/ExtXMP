import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/evp_seedverify_test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.BCRYPT_ROUNDS = '4';
const { connectDB } = await import('../src/config/db.js');
const { seed } = await import('../src/seed/index.js');
const { verifySeed } = await import('../src/seed/verify.js');
const { default: mongoose } = await import('mongoose');

before(async () => { await connectDB(); await Promise.all(Object.values(mongoose.models).map((m) => m.init())); });
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

const counts = async () => Object.fromEntries(await Promise.all(Object.keys(mongoose.models).sort().map(async (n) => [n, await mongoose.model(n).countDocuments()])));

test('the seed satisfies every volume, reference and consistency requirement', async () => {
  const summary = await seed();
  assert.ok(summary.professionals >= 30 && summary.visitors >= 5 && summary.reviews >= 30 * 15);
  const checks = await verifySeed();
  assert.ok(checks.length >= 60);
  const failed = checks.filter((c) => !c.ok);
  assert.deepEqual(failed, [], failed.map((c) => `${c.name}: ${c.detail}`).join('\n'));
});

test('seeding is repeatable: running it again changes no counts and creates no duplicates', async () => {
  const first = await counts();
  assert.ok(Object.entries(first).filter(([n]) => n !== 'DevEmail').every(([, c]) => c > 0), 'every collection has data');
  await seed();
  await seed();
  const again = await counts();
  assert.deepEqual(again, first);
  assert.deepEqual((await verifySeed()).filter((c) => !c.ok), []);
});

test('the verifier really detects broken data', async () => {
  const { default: SavedProfessional } = await import('../src/models/SavedProfessional.js');
  const { default: Professional } = await import('../src/models/Professional.js');
  const saved = await SavedProfessional.findOne();
  await SavedProfessional.updateOne({ _id: saved._id }, { professional: new mongoose.Types.ObjectId() }); // a dangling reference
  let failed = (await verifySeed()).filter((c) => !c.ok).map((c) => c.name);
  assert.ok(failed.includes('SavedProfessional.professional -> Professional'));
  await seed();
  const pro = await Professional.findOne({ profileStatus: 'active' });
  await Professional.updateOne({ _id: pro._id }, { averageRating: 1.1 }); // a rating that no longer matches the reviews
  failed = (await verifySeed()).filter((c) => !c.ok).map((c) => c.name);
  assert.ok(failed.includes('review counts and average ratings match the review data'));
  await seed();
});
