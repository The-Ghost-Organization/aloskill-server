/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type { RequestHandler } from 'express';
import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';
import type { DeviceInfo } from '../types/deviceSessionStore.js';

declare module 'express-serve-static-core' {
  interface Request {
    deviceInfo?: DeviceInfo;
  }
}

export const trackDevice: RequestHandler = (req, res, next) => {
  const userAgent = req.headers['user-agent'] ?? 'Unknown';
  const ipAddress = getClientIP(req);

  // Parse user agent
  const parser = new UAParser(userAgent);
  const uaResult = parser.getResult();

  // Determine device type
  const deviceType = determineDeviceType(uaResult);

  // Get location from IP
  const geo = geoip.lookup(ipAddress);

  const deviceInfo: DeviceInfo = {
    userAgent,
    ipAddress,
    deviceType,
    browser: `${uaResult.browser.name ?? 'Unknown'} ${uaResult.browser.version ?? ''}`.trim(),
    os: `${uaResult.os.name ?? 'Unknown'} ${uaResult.os.version ?? ''}`.trim(),
    platform: uaResult.device.type ?? 'desktop',
    location: geo
      ? {
          country: geo.country,
          city: geo.city,
          timezone: geo.timezone,
        }
      : undefined,
  };

  // Attach to request
  req.deviceInfo = deviceInfo;
  next();
};

function getClientIP(req: Parameters<RequestHandler>[0]): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ??
    (req.headers['x-real-ip'] as string) ??
    req.socket.remoteAddress ??
    'Unknown'
  );
}

function determineDeviceType(uaResult: any): 'DESKTOP' | 'MOBILE' | 'TABLET' {
  if (uaResult.device.type === 'mobile') {
    return 'MOBILE';
  }
  if (uaResult.device.type === 'tablet') {
    return 'TABLET';
  }
  return 'DESKTOP';
}
