import bcrypt from 'bcrypt';
import Visitor from '../models/Visitor.js';
import { env } from '../config/env.js';

// Demo accounts for local development only. The shared password is documented in the README.
export const DEMO_PASSWORD = 'Demo@12345';

export const demoVisitors = [
  { firstName: 'Emma', lastName: 'Carter', email: 'emma.carter@example.com', phone: '(512) 555-0201', emailVerified: true },
  { firstName: 'Liam', lastName: 'Nguyen', email: 'liam.nguyen@example.com', phone: '(206) 555-0202', emailVerified: true },
  { firstName: 'Sofia', lastName: 'Ramirez', email: 'sofia.ramirez@example.com', phone: '(305) 555-0203', emailVerified: true, notificationPreferences: { productUpdates: true } },
  { firstName: 'Noah', lastName: 'Fischer', email: 'noah.fischer@example.com', emailVerified: true },
  { firstName: 'Ava', lastName: 'Thompson', email: 'ava.thompson@example.com', phone: '(312) 555-0205', emailVerified: false }, // unverified email
  { firstName: 'Jack', lastName: 'Morrison', email: 'suspended.demo@example.com', emailVerified: true, accountStatus: 'suspended' }, // cannot log in
];

export async function seedVisitors() {
  await Visitor.deleteMany({});
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_ROUNDS);
  const docs = await Visitor.insertMany(demoVisitors.map((v) => ({ ...v, passwordHash })));
  return docs;
}
