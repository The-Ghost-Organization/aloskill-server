import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { executeDbOperation } from '../config/database.js';
import { config } from '../config/env.js';
import JwtService from '../utils/jwt.js';

type RealtimeUser = { id: string; email: string; roles: string[] };

class RealtimeService {
  private io: Server | null = null;

  initialize(server: HttpServer): Server {
    if (this.io) return this.io;
    this.io = new Server(server, {
      path: '/socket.io',
      cors: { origin: config.FRONTEND_URL, credentials: true },
      transports: ['websocket', 'polling'],
    });
    this.io.use(async (socket, next) => {
      try {
        const authorization = socket.handshake.headers.authorization;
        const token = socket.handshake.auth?.token ?? authorization?.replace(/^Bearer\s+/i, '');
        if (!token || typeof token !== 'string') return next(new Error('Authentication required'));
        const decoded = JwtService.verifyToken(token, 'ACCESS');
        const user = await executeDbOperation(prisma => prisma.user.findFirst({
          where: { ...(decoded.id ? { id: decoded.id } : { email: decoded.email }), deletedAt: null, status: 'ACTIVE' },
          select: { id: true, email: true, assignedRole: { select: { role: true } } },
        }), 'Authenticate socket');
        if (!user) return next(new Error('Account is not active'));
        socket.data.user = { id: user.id, email: user.email, roles: user.assignedRole.map(item => item.role) } satisfies RealtimeUser;
        next();
      } catch {
        next(new Error('Invalid or expired access token'));
      }
    });
    this.io.on('connection', socket => {
      const user = socket.data.user as RealtimeUser;
      void socket.join(this.userRoom(user.id));
      socket.emit('realtime:ready', { connected: true });
    });
    return this.io;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.io?.to(this.userRoom(userId)).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    for (const userId of new Set(userIds)) this.emitToUser(userId, event, payload);
  }

  disconnectUser(userId: string): void {
    this.io?.in(this.userRoom(userId)).disconnectSockets(true);
  }

  async close(): Promise<void> {
    if (!this.io) return;
    await new Promise<void>(resolve => this.io?.close(() => resolve()));
    this.io = null;
  }

  private userRoom(userId: string): string { return `user:${userId}`; }
}

export const realtimeService = new RealtimeService();
