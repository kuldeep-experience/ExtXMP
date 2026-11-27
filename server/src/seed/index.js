import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { seedVisitors } from './visitors.js';
import { seedProfessionals } from './professionals.js';
import { seedReviews } from './reviews.js';
import { seedSavedFolders } from './savedFolders.js';
import { seedSavedProfessionals } from './savedProfessionals.js';
import { seedExperienceHistory } from './experienceHistory.js';
import { seedServiceRecords } from './serviceRecords.js';
import { seedConversations } from './conversations.js';
import { seedMessages } from './messages.js';
import { seedSavedSearches } from './savedSearches.js';
import { seedAIConversations } from './aiConversations.js';
import { seedReviewInsights } from './reviewInsights.js';
import { seedRecentlyViewed } from './recentlyViewed.js';
import { seedSearchHistory } from './searchHistory.js';
import { seedComparisons } from './comparisons.js';

// Runs every seeder in dependency order. Each seeder first deletes what it owns, so running this repeatedly never duplicates data.
// (It also removes any visitors, saved items or history created by hand: seeding resets the demo database.)
export async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');
  const ctx = {};
  ctx.visitors = await seedVisitors();
  ctx.professionals = await seedProfessionals();
  ctx.reviews = await seedReviews(ctx);
  ctx.professionals = await mongoose.model('Professional').find().lean(); // reload with the computed ratings
  ctx.folders = await seedSavedFolders(ctx);
  ctx.savedProfessionals = await seedSavedProfessionals(ctx);
  ctx.conversations = await seedConversations(ctx);
  ctx.messages = await seedMessages(ctx);
  ctx.experiences = await seedExperienceHistory(ctx);
  ctx.serviceRecords = await seedServiceRecords(ctx);
  ctx.savedSearches = await seedSavedSearches(ctx);
  await seedAIConversations(ctx);
  await seedReviewInsights(ctx);
  ctx.recentlyViewed = await seedRecentlyViewed(ctx);
  ctx.searchHistory = await seedSearchHistory(ctx);
  ctx.comparisons = await seedComparisons(ctx);

  const count = (name) => mongoose.model(name).countDocuments();
  return {
    visitors: ctx.visitors.length, professionals: ctx.professionals.length, reviews: ctx.reviews.length,
    savedFolders: ctx.folders.length, savedProfessionals: ctx.savedProfessionals.length,
    experiences: ctx.experiences.length, serviceRecords: ctx.serviceRecords.length, conversations: ctx.conversations.length, messages: ctx.messages.length,
    savedSearches: ctx.savedSearches.length, aiConversations: await count('AIConversation'), aiMessages: await count('AIMessage'),
    reviewInsights: await count('ReviewInsight'), recentlyViewed: ctx.recentlyViewed.length, searchHistory: ctx.searchHistory.length, comparisons: ctx.comparisons.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDB } = await import('../config/db.js');
  await connectDB();
  const result = await seed();
  console.log('Seeded:');
  for (const [k, v] of Object.entries(result)) console.log(`  ${k.padEnd(20)} ${v}`);
  await mongoose.disconnect();
}
