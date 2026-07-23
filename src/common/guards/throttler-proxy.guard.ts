import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limiting guard tuned for running behind the Dokploy/Traefik reverse proxy.
 *
 * - Tracks the real client IP from the proxy chain (`req.ips`) instead of the
 *   proxy's own address, so one client cannot exhaust the limit for everyone.
 *   Requires `trust proxy` to be enabled in `main.ts`.
 * - Skips non-HTTP execution contexts (e.g. the Socket.IO chat gateway) so
 *   WebSocket traffic is never blocked by the HTTP rate limiter.
 */
@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    return super.canActivate(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.ips as string[] | undefined;
    if (forwarded && forwarded.length > 0) {
      return forwarded[0];
    }
    return req.ip;
  }
}
