import crypto from 'crypto';
import type { DeviceInfo } from '../types/deviceSessionStore.js';

export class DeviceFingerprint {
  static generate(fingerprintData: {
    userAgent: string;
    screenResolution?: string;
    timezone?: string;
    language?: string;
    fonts?: string[];
    plugins?: string[];
    canvasFingerprint?: string;
  }): string {
    const fingerprintString = [
      fingerprintData.userAgent,
      fingerprintData.screenResolution,
      fingerprintData.timezone,
      fingerprintData.language,
      fingerprintData.fonts?.join(','),
      fingerprintData.plugins?.join(','),
      fingerprintData.canvasFingerprint,
    ]
      .filter(Boolean)
      .join('|');

    // Hash for privacy
    return crypto.createHash('sha256').update(fingerprintString).digest('hex');
  }

  static generateDeviceId(deviceInfo: DeviceInfo): string {
    const deviceString = [
      deviceInfo.userAgent,
      deviceInfo.ipAddress,
      deviceInfo.browser,
      deviceInfo.os,
    ].join('-');

    return crypto.createHash('md5').update(deviceString).digest('hex');
  }

  static generateFromDeviceInfo(deviceInfo: DeviceInfo): string {
    const fingerprintString = [
      deviceInfo.userAgent,
      deviceInfo.ipAddress,
      deviceInfo.browser,
      deviceInfo.os,
      deviceInfo.platform,
      deviceInfo.location?.country,
      deviceInfo.location?.city,
      deviceInfo.location?.timezone,
    ]
      .filter(Boolean)
      .join('|');

    return crypto.createHash('sha256').update(fingerprintString).digest('hex');
  }
}
