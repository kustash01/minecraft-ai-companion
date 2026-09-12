import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, '..', '..', 'logs');

const logFormat = winston.format.printf(({ level, message, timestamp, category }) => {
  return `[${timestamp}] [${category || 'DEFAULT'}] [${level.toUpperCase()}] ${message}`;
});

const defaultLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'minecraft-bot' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB limit
      maxFiles: 3,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'bot.log'),
      maxsize: 10 * 1024 * 1024, // 10MB limit
      maxFiles: 3,
      tailable: true,
    })
  ]
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      logFormat
    ),
  });
  consoleTransport.on('error', () => {}); // Prevent EPIPE crash on console stream close
  defaultLogger.add(consoleTransport);
}

/**
 * Creates a child logger with a specific category.
 * Categories: WORLD, AI, PLAN, ACTION, MEMORY, ERROR, BOT
 * 
 * @param {string} category 
 * @returns {winston.Logger}
 */
export function createLogger(category) {
  return defaultLogger.child({ category });
}

export default defaultLogger;
