import { createWriteStream } from 'fs';
import { join } from 'path';

class Logger {
  private logStream: NodeJS.WritableStream;

  constructor() {
    this.logStream = createWriteStream(join(__dirname, '../../logs/app.log'), { flags: 'a' });
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}\n`;
  }

  info(message: string, meta?: any) {
    const formatted = this.formatMessage('info', message, meta);
    console.log(formatted.trim());
    this.logStream.write(formatted);
  }

  error(message: string, meta?: any) {
    const formatted = this.formatMessage('error', message, meta);
    console.error(formatted.trim());
    this.logStream.write(formatted);
  }

  warn(message: string, meta?: any) {
    const formatted = this.formatMessage('warn', message, meta);
    console.warn(formatted.trim());
    this.logStream.write(formatted);
  }

  debug(message: string, meta?: any) {
    if (process.env.NODE_ENV === 'development') {
      const formatted = this.formatMessage('debug', message, meta);
      console.log(formatted.trim());
      this.logStream.write(formatted);
    }
  }
}

export default new Logger();