import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import healthRoutes from './routes/health.js';
import professionalRoutes from './routes/professionals.js';
import searchRoutes from './routes/searches.js';
import { recentlyViewedRouter, searchHistoryRouter, comparisonsRouter } from './routes/history.js';
import chatRoutes from './routes/chat.js';
import serviceRecordRoutes from './routes/serviceRecords.js';
import experienceRoutes from './routes/experience.js';
import reviewInsightRoutes from './routes/reviewInsights.js';
import aiRoutes from './routes/ai.js';
import authRoutes from './routes/auth.js';
import { savedRouter, foldersRouter } from './routes/saved.js';
import devRoutes from './routes/dev.js';
import { csrfProtection } from './middleware/csrf.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:', 'http:'], // visitors can use any image URL as a profile photo
      'upgrade-insecure-requests': null, // would break plain-http localhost
    },
  },
}));
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, limit: env.API_RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many requests. Please wait a few minutes and try again.' }),
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api/health', healthRoutes);
app.use('/api', csrfProtection);
app.use('/api/professionals', professionalRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/saved-professionals', savedRouter);
app.use('/api/saved-folders', foldersRouter);
app.use('/api/saved-searches', searchRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/review-insights', reviewInsightRoutes);
app.use('/api/conversations', chatRoutes);
app.use('/api/service-records', serviceRecordRoutes);
app.use('/api/experience-history', experienceRoutes);
app.use('/api/recently-viewed', recentlyViewedRouter);
app.use('/api/search-history', searchHistoryRouter);
app.use('/api/recent-comparisons', comparisonsRouter);
if (env.EMAIL_MODE === 'dev') app.use('/api/dev', devRoutes);

if (env.SERVE_CLIENT) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(dist));
  // Single-page app: any non-API GET returns index.html and React Router takes over.
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.use(notFound);
app.use(errorHandler);

export default app;
