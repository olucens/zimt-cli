import { Injectable, ConsoleLogger, LogLevel } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService extends ConsoleLogger {
  private readonly logDir = process.env.LOG_DIR || 'logs';
  private readonly maxFileSize =
    (parseInt(process.env.LOG_FILE_SIZE_KB || '10') || 10) * 1024;
  private readonly logLevels: LogLevel[] = [
    'error',
    'warn',
    'log',
    'debug',
    'verbose',
  ];
  private currentLogLevel: number;

  constructor() {
    super();
    this.currentLogLevel = parseInt(process.env.LOG_LEVEL || '2') || 2;
    this.setLogLevels(this.logLevels.slice(0, this.currentLogLevel + 1));

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir);
    }
  }

  log(message: any, ...optionalParams: any[]) {
    super.log(message, ...optionalParams);
    this.writeToFile('log', message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    super.error(message, ...optionalParams);
    this.writeToFile('error', message, ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    super.warn(message, ...optionalParams);
    this.writeToFile('warn', message, ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    super.debug(message, ...optionalParams);
    this.writeToFile('debug', message, ...optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    super.verbose(message, ...optionalParams);
    this.writeToFile('verbose', message, ...optionalParams);
  }

  private writeToFile(level: string, message: any, ...optionalParams: any[]) {
    if (this.logLevels.indexOf(level as LogLevel) > this.currentLogLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} [${level.toUpperCase()}] ${message} ${JSON.stringify(optionalParams)}\n`;

    this.rotateAndWrite('app.log', logMessage);

    if (level === 'error') {
      this.rotateAndWrite('error.log', logMessage);
    }
  }

  private rotateAndWrite(filename: string, message: string) {
    const filePath = path.join(this.logDir, filename);

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size >= this.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const newName = path.join(
          this.logDir,
          `${filename.split('.')[0]}_${timestamp}.log`,
        );
        fs.renameSync(filePath, newName);
      }
    }

    fs.appendFileSync(filePath, message);
  }
}
