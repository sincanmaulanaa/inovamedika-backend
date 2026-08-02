import pino from 'pino'

import { env } from './env.js'

const developmentTransport = {
  target: 'pino-pretty',
  options: { colorize: true, singleLine: true },
}

export const logger = pino({
  level: env.logLevel,
  ...(env.nodeEnv === 'development' ? { transport: developmentTransport } : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
      '*.nik',
      '*.subjective',
      '*.assessment',
      '*.plan',
      '*.prescription',
    ],
    censor: '[REDACTED]',
  },
})
