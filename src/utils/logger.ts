import path from 'path';
import { createLogger, format, transports, type Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import type { TransformableInfo } from 'logform';

const { combine, timestamp, label, printf, errors, colorize, json } = format;

const isProduction = process.env.NODE_ENV === 'production';

interface SafeLogInfo extends TransformableInfo {
  timestamp?: string;
  label?: string;
  message: unknown;
  stack?: unknown;
}

const createAppLogger = (level: 'info' | 'error'): Logger => {
  const logFormatter = printf((info: SafeLogInfo) => {
    // ✅ Safe timestamp
    const ts = info.timestamp ?? new Date().toISOString();
    const date = new Date(ts);
    const hour = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    // ✅ Safe label
    const lbl = info.label ?? 'NO_LABEL';

    // ✅ Safe message
    const message =
      info.message instanceof Error
        ? info.message.message
        : typeof info.message === 'string'
          ? info.message
          : JSON.stringify(info.message);

    // ✅ Safe stack
    const stack =
      info.stack && typeof info.stack === 'string'
        ? info.stack
        : info.stack
          ? JSON.stringify(info.stack, Object.getOwnPropertyNames(info.stack))
          : undefined;

    return stack
      ? `${date.toDateString()} ${hour}:${minutes}:${seconds} [${lbl}] ${info.level}: ${stack}`
      : `${date.toDateString()} ${hour}:${minutes}:${seconds} [${lbl}] ${info.level}: ${message}`;
  });

  return createLogger({
    level,
    format: combine(
      label({ label: 'aloSkill' }),
      timestamp(),
      errors({ stack: true }),
      isProduction ? json() : logFormatter
    ),
    transports: [
      new transports.Console({
        format: combine(colorize(), timestamp(), isProduction ? json() : logFormatter),
      }),
      new DailyRotateFile({
        filename: path.join(
          process.cwd(),
          'src',
          'logs',
          level === 'info' ? 'successes' : 'errors',
          `aloSkill-%DATE%-${level}.log`
        ),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
      }),
    ],
  });
};

export const logger = createAppLogger('info');
export const errorlogger = createAppLogger('error');
