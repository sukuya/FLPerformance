import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, '../../logs');

// Ensure logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'flperformance' },
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
        })
      )
    }),
    // File output - combined logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      ),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // File output - error logs only
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      ),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Create specialized loggers for different components
export const createServiceLogger = (serviceName) => {
  return logger.child({ service: `service-${serviceName}` });
};

export const createBenchmarkLogger = (benchmarkId) => {
  const benchmarkLogger = logger.child({ service: `benchmark-${benchmarkId}` });

  // Create benchmark-specific log file
  const benchmarkLogDir = path.join(logDir, 'benchmarks');
  if (!fs.existsSync(benchmarkLogDir)) {
    fs.mkdirSync(benchmarkLogDir, { recursive: true });
  }

  const benchmarkLogFile = path.join(benchmarkLogDir, `${benchmarkId}.log`);
  benchmarkLogger.add(new winston.transports.File({
    filename: benchmarkLogFile,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length && Object.keys(meta).some(k => k !== 'service')
          ? ' ' + JSON.stringify(meta, null, 2)
          : '';
        return `${timestamp} [${level.toUpperCase()}]: ${message}${metaStr}`;
      })
    ),
    maxsize: 10485760, // 10MB
    maxFiles: 3
  }));

  return benchmarkLogger;
};

export default logger;
