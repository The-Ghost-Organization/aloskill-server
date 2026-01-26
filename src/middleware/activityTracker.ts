// import { DeviceService } from '@/modules/device/deviceService.js';
// import type { DeviceInfo } from '@/types/deviceSessionStore.js';
import type { DeviceInfo } from '../types/deviceSessionStore.js';
// import { DeviceFingerprint } from '@/utils/deviceFingerprint.js';
import type { User } from '../generated/client.js';
// import type { RequestHandler } from 'express';

declare module 'express-serve-static-core' {
  export interface Request {
    user: User;
    deviceInfo?: DeviceInfo;
  }
}

// const deviceService = new DeviceService();

// export const trackActivity: RequestHandler = (req, res, next) => {
//   if (req.user && req.deviceInfo) {
//     const deviceId = DeviceFingerprint.generateDeviceId(req.deviceInfo);

//     deviceService.updateLastActivity(req.user.id, deviceId).catch(console.error);
//   }

//   next();
// };
