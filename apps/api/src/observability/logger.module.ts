import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppConfigModule, AppConfigService } from '../config/config.module';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Structured request logging. Every request gets a `requestId` (respected from
 * an inbound `x-request-id` header or generated) that is echoed back on the
 * response and attached to every log line for that request.
 *
 * Secrets are redacted here as a hard backstop; code must still never pass
 * tokens/passwords/keys to the logger in the first place.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isProduction ? 'info' : 'debug',
          transport: config.isDevelopment
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:standard' },
              }
            : undefined,
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const existing = req.headers[REQUEST_ID_HEADER];
            const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
            res.setHeader(REQUEST_ID_HEADER, id);
            return id;
          },
          customProps: (
            req: IncomingMessage & { user?: { id?: string; organizationId?: string } },
          ) => ({
            userId: req.user?.id ?? null,
            organizationId: req.user?.organizationId ?? null,
          }),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.refreshToken',
              'res.headers["set-cookie"]',
              '*.privateKey',
              '*.certificate',
              '*.token',
            ],
            remove: true,
          },
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url === '/api/v1/health',
          },
        },
      }),
    }),
  ],
})
export class LoggerModule {}

export { REQUEST_ID_HEADER };
