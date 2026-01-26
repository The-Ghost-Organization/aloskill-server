// User Sessions/Devices Table
export interface UserSession {
  id: string;
  userId: string;
  sessionToken: string;
  deviceId: string;
  userAgent: string;
  ipAddress: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
  platform: string;
  location?: string;
  isActive: boolean;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Device Fingerprinting Table
export interface DeviceFingerprint {
  id: string;
  userId: string;
  fingerprint: string;
  userAgent: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  fonts?: string[];
  plugins?: string[];
  canvasFingerprint?: string;
  createdAt: Date;
}

export interface DeviceInfo {
  userAgent: string;
  ipAddress: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET';
  browser: string;
  os: string;
  platform: string;
  location?: {
    country: string;
    city: string;
    timezone: string;
  };
}
