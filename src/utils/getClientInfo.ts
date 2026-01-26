import type { Request } from 'express';
function getClientInfo(req: Request): { userAgent: string; ipAddress: string } {
  return {
    userAgent: req.get('User-Agent') ?? 'Unknown',
    ipAddress:
      req.get('x-forwarded-for')?.split(',')[0] ??
      req.get('x-real-ip') ??
      req.socket.remoteAddress ??
      'Unknown',
  };
}

export default getClientInfo;
