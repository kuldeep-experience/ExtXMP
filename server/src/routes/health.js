import { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

const router = Router();
const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];

router.get('/', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    uptime: Math.round(process.uptime()),
    database: states[mongoose.connection.readyState],
    devMailbox: env.EMAIL_MODE === 'dev',
    timestamp: new Date().toISOString(),
  });
});

export default router;
