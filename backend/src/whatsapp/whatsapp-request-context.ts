// Ties a WhatsApp send back to the logged-in user whose request started it, so
// a failed send can be shown on that user's screen (GET /whatsapp/my-failures).
// Sends are fire-and-forget (they finish after the HTTP response), but Node's
// AsyncLocalStorage context follows them, so the user id is still known.
import { AsyncLocalStorage } from 'async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

export const whatsappRequestUser = new AsyncLocalStorage<{ userId: string }>();

// Registered app-wide via APP_INTERCEPTOR in WhatsAppModule. Interceptors run
// after guards, so req.user is set on authenticated routes. Requests without a
// user (login, webhooks, public pages) and cron jobs pass straight through.
@Injectable()
export class WhatsAppRequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const userId: unknown = context.switchToHttp().getRequest()?.user?.id;
    if (typeof userId !== 'string' || !userId) return next.handle();
    return new Observable((subscriber) =>
      whatsappRequestUser.run({ userId }, () => next.handle().subscribe(subscriber)),
    );
  }
}
