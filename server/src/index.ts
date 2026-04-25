import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { photographersRouter } from './routes/photographers.js';
import { bookingsRouter } from './routes/bookings.js';
import { vouchersRouter } from './routes/vouchers.js';
import { configRouter } from './routes/config.js';
import { stripeWebhookRouter } from './routes/stripeWebhook.js';
import { galleriesRouter } from './routes/galleries.js';
import { supportRouter } from './routes/support.js';
import { authRateLimit } from './middleware/rateLimit.js';
import { startSlotSweeper } from './services/slotSweeper.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(pinoHttp({ logger }));

// Stripe webhooks need the raw body for signature verification — must be mounted
// before the JSON body parser.
app.use('/webhooks/stripe', stripeWebhookRouter);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRateLimit, authRouter);
app.use('/config', configRouter);
app.use('/photographers', photographersRouter);
app.use('/bookings', bookingsRouter);
app.use('/vouchers', vouchersRouter);
app.use('/galleries', galleriesRouter);
app.use('/support', supportRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Capture API listening');
  startSlotSweeper();
});
