import crypto from 'crypto';

export class DeviceService {
  // async updateLastActivity(userId: string, deviceId: string): Promise<void> {
  //   try {
  //     await prisma.userSession.updateMany({
  //       where: {
  //         userId,
  //         deviceId,
  //         isActive: true,
  //       },
  //       data: {
  //         lastActivity: new Date(),
  //         updatedAt: new Date(),
  //       },
  //     });
  //   } catch (error) {
  //     console.error('Error updating last activity:', error);
  //     // Don't throw error - this is a background operation
  //   }
  // }
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
