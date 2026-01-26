/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import crypto from 'crypto';
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { UserRole, UserStatus } from '../../generated/client.js';
import type { DeviceInfo } from '../../types/deviceSessionStore.js';
import { DeviceFingerprint } from '../../utils/deviceFingerprint.js';
import { hash, verifyHash } from '../../utils/hashing.js';
import { encryptPhoneNumber } from '../../utils/phoneNumber.js';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

const LOGIN_USER_SELECT = {
  id: true,
  email: true,
  status: true,
  avatarUrl: true,
  assignedRole: {
    select: {
      role: true,
    },
  },
  studentProfile: {
    select: {
      displayName: true,
    },
  },
  instructorProfile: {
    select: {
      displayName: true,
    },
  },
  emailVerificationTokenHash: true,
  passwordResetTokenHash: true,
};

const buildUserProfile = (user: {
  id: string;
  email: string;
  status: UserStatus;
  avatarUrl: string | null;
  assignedRole: { role: string }[];
  studentProfile?: { displayName: string } | null;
  instructorProfile?: { displayName: string } | null;
  emailVerificationTokenHash?: string | null;
  passwordResetTokenHash?: string | null;
}) => ({
  id: user.id,
  email: user.email,
  status: user.status,
  role: user.assignedRole.map(data => data.role),
  displayName: user.studentProfile?.displayName ?? user.instructorProfile?.displayName,
  profilePicture: user.avatarUrl,
  emailVerificationToken: user.emailVerificationTokenHash,
  passwordResetToken: user.passwordResetTokenHash,
});

const generateRefreshToken = () => {
  const refreshToken = crypto.randomBytes(64).toString('hex');

  return {
    refreshToken,
    hashedToken: crypto.createHash('sha256').update(refreshToken).digest('hex'),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
  };
};

const hashRefreshToken = (token: string) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const authHeadersValidate = (req: Request) => {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

const loginUser = async (req: Request) => {
  const data = req.body;
  const deviceData = req.deviceInfo as DeviceInfo;
  const deviceId = DeviceFingerprint.generateDeviceId(deviceData);
  const { refreshToken, hashedToken, expiresAt } = generateRefreshToken();

  if (data.password && data.googleId) {
    throw new Error('Cannot use both password and Google ID');
  }
  if (!data.password && !data.googleId) {
    throw new Error('Invalid login method');
  }
  if (!data.email) {
    throw new Error('Email is not provided for login');
  }

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.findFirst({
      where: {
        email: data.email,
        deletedAt: null,
      },
      include: { sessions: { include: { refreshTokens: true } } },
    });
  });

  if (!user) {
    throw new Error('User does not exist');
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new Error('Your account has been deactivated or Suspended');
  }

  // Enforce device limit (3 devices max)
  const activeSessions = user.sessions.filter(session => session.isActive);
  if (activeSessions.length >= 3) {
    throw new Error('Device limit exceeded');
  }

  if (data.googleId) {
    if (!user.googleId) {
      throw new Error('Invalid login method');
    }
    if (user.googleId !== data.googleId) {
      throw new Error('Google ID mismatch for existing user');
    }

    const result = await executeDbOperation(async prisma => {
      const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      return await prisma.$transaction(async tx => {
        // Update user last login
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            lastLogin: new Date(),
            lastLoginIP: deviceData.ipAddress,
          },
          select: LOGIN_USER_SELECT,
        });

        // Check for existing session on this device
        const existingSession = await tx.userSession.findUnique({
          where: { userId_deviceId: { userId: user.id, deviceId } },
          include: {
            refreshTokens: {
              where: { revoked: false },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        let newRefreshToken;

        if (existingSession) {
          // === ROTATE REFRESH TOKEN ===
          const oldToken = existingSession.refreshTokens[0];
          if (oldToken) {
            newRefreshToken = await tx.refreshToken.create({
              data: {
                token: hashedToken,
                sessionId: existingSession.id,
                expiresAt,
                replacesToken: { connect: { id: oldToken.id } },
              },
            });

            await tx.refreshToken.update({
              where: { id: oldToken.id },
              data: {
                revoked: true,
                revokedAt: new Date(),
                replacedByTokenId: newRefreshToken.id,
              },
            });
          } else {
            // First token for this session
            newRefreshToken = await tx.refreshToken.create({
              data: {
                token: hashedToken,
                sessionId: existingSession.id,
                expiresAt,
              },
            });
          }

          // Update session
          await tx.userSession.update({
            where: { id: existingSession.id },
            data: {
              sessionToken: hashRefreshToken(crypto.randomBytes(64).toString('hex')),
              expiresAt,
              lastActivity: new Date(),
              ipAddress: deviceData.ipAddress,
              userAgent: deviceData.userAgent,
              isActive: true,
            },
          });
        } else {
          // === NEW SESSION ===
          const fingerprint = DeviceFingerprint.generateFromDeviceInfo(deviceData);
          const { location, ...otherDeviceData } = deviceData;
          const newSession = await tx.userSession.create({
            data: {
              deviceId,
              deviceFingerprint: fingerprint,
              userId: user.id,
              sessionToken: hashRefreshToken(crypto.randomBytes(64).toString('hex')),
              // ...deviceData,
              ...otherDeviceData, // Spread everything EXCEPT location
              ...location, // Map location to geoLocation
              expiresAt: sessionExpiresAt,
              refreshTokens: {
                create: {
                  token: hashedToken,
                  expiresAt,
                },
              },
            },
            include: { refreshTokens: true },
          });

          newRefreshToken = newSession.refreshTokens[0];
        }

        return { updatedUser, newRefreshToken };
      });
    }, 'Update Google ID User');

    const { updatedUser } = result;

    return {
      user: buildUserProfile(updatedUser),
      refreshToken,
    };
  }

  if (data.password) {
    if (!data.password || typeof data.password !== 'string' || data.password.trim() === '') {
      throw new Error('Invalid Password');
    }
    if (!user.password) {
      throw new Error('Invalid login method');
    }
    if (!user.isEmailVerified) {
      throw new Error('Please Verify Your Email');
    } else if (user.lockUntil && user.lockUntil > new Date()) {
      throw new Error(`Account locked. Try again after ${user.lockUntil.toLocaleTimeString()}`);
    }

    const isPasswordValid = await verifyHash(data.password as string, user.password);

    if (!isPasswordValid) {
      const updateUserFailedAttempt = await executeDbOperation(async prisma => {
        return await prisma.user.update({
          where: {
            id: user.id,
          },
          data: (() => {
            const shouldResetAttempts =
              !user.failedLoginAt || user.failedLoginAt < new Date(Date.now() - 30 * 60 * 1000);
            const newAttemptCount = shouldResetAttempts ? 1 : user.loginAttempts + 1;

            const updatePayload: any = shouldResetAttempts
              ? {
                  loginAttempts: 1,
                  failedLoginAt: new Date(),
                }
              : {
                  loginAttempts: { increment: 1 },
                };

            if (newAttemptCount >= 5) {
              const lockUntilTime = new Date(Date.now() + 1 * 60 * 60 * 1000);
              updatePayload.lockUntil = lockUntilTime;
            }
            return updatePayload;
          })(),
        });
      }, 'update user');
      throw new Error(
        updateUserFailedAttempt.lockUntil
          ? `Account locked. Try again after ${updateUserFailedAttempt.lockUntil.toLocaleTimeString()}`
          : 'Incorrect password'
      );
    }

    const result = await executeDbOperation(async prisma => {
      const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      return await prisma.$transaction(async tx => {
        // Update user last login
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: 0,
            lockUntil: null,
            failedLoginAt: null,
            lastLogin: new Date(),
            lastLoginIP: deviceData.ipAddress,
          },
          select: LOGIN_USER_SELECT,
        });

        // Check for existing session on this device
        const existingSession = await tx.userSession.findUnique({
          where: { userId_deviceId: { userId: user.id, deviceId } },
          include: {
            refreshTokens: {
              where: { revoked: false },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        let newRefreshToken;

        if (existingSession) {
          // === ROTATE REFRESH TOKEN ===
          const oldToken = existingSession.refreshTokens[0];
          if (oldToken) {
            newRefreshToken = await tx.refreshToken.create({
              data: {
                token: hashedToken,
                sessionId: existingSession.id,
                expiresAt,
                replacesToken: { connect: { id: oldToken.id } },
              },
            });

            await tx.refreshToken.update({
              where: { id: oldToken.id },
              data: {
                revoked: true,
                revokedAt: new Date(),
                replacedByTokenId: newRefreshToken.id,
              },
            });
          } else {
            // First token for this session
            newRefreshToken = await tx.refreshToken.create({
              data: {
                token: hashedToken,
                sessionId: existingSession.id,
                expiresAt,
              },
            });
          }

          // Update session
          await tx.userSession.update({
            where: { id: existingSession.id },
            data: {
              sessionToken: hashRefreshToken(crypto.randomBytes(64).toString('hex')),
              expiresAt,
              lastActivity: new Date(),
              ipAddress: deviceData.ipAddress,
              userAgent: deviceData.userAgent,
              isActive: true,
            },
          });
        } else {
          // === NEW SESSION ===
          const fingerprint = DeviceFingerprint.generateFromDeviceInfo(deviceData);
          const { location, ...otherDeviceData } = deviceData;
          const newSession = await tx.userSession.create({
            data: {
              deviceId,
              deviceFingerprint: fingerprint,
              userId: user.id,
              sessionToken: hashRefreshToken(crypto.randomBytes(64).toString('hex')),
              // ...deviceData,
              ...otherDeviceData,
              ...location,
              expiresAt: sessionExpiresAt,
              refreshTokens: {
                create: {
                  token: hashedToken,
                  expiresAt,
                },
              },
            },
            include: { refreshTokens: true },
          });

          newRefreshToken = newSession.refreshTokens[0];
        }

        return { updatedUser, newRefreshToken };
      });
    }, 'Update Credentials User');

    const { updatedUser } = result;

    return {
      user: buildUserProfile(updatedUser),
      refreshToken,
    };
  }

  throw new Error('Invalid login payload');
};

const registerStudent = async (req: Request) => {
  const data = req.body;

  const deviceData = req.deviceInfo as DeviceInfo;
  const { location, ...othersDeviceData } = deviceData;

  const { password, googleId } = data;
  if (!password && !googleId) {
    throw new Error('Password or Google ID must be provided');
  }
  if (password && googleId) {
    throw new Error('Cannot use both password and Google ID');
  }

  const { refreshToken, hashedToken, expiresAt } = generateRefreshToken();

  const existingUser = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });
  }, 'User Exist');

  if (!existingUser) {
    if (password) {
      const hashedPassword = await hash(password as string);
      data.password = hashedPassword;
      const { email, avatarUrl, password: hashPassword, phoneNumber, ...restData } = data;
      const encryptedPhoneNumber = encryptPhoneNumber(phoneNumber as string);
      restData.encryptedPhone = encryptedPhoneNumber;
      restData.phoneLastFour = phoneNumber.slice(-4);

      const user = await executeDbOperation(async prisma => {
        return await prisma.user.create({
          data: {
            email,
            password: hashPassword,
            avatarUrl,
            emailVerificationTokenHash: crypto.randomBytes(64).toString('hex'),
            emailVerificationExpires: new Date(Date.now() + 6 * 60 * 60 * 1000),
            assignedRole: {
              create: {
                role: UserRole.STUDENT,
              },
            },
            studentProfile: {
              create: {
                ...restData,
              },
            },
          },
          select: {
            ...LOGIN_USER_SELECT,
            emailVerificationTokenHash: true,
          },
        });
      }, 'create user');

      return {
        user: buildUserProfile(user),
        refreshToken,
      };
    }
    if (googleId) {
      const user = await executeDbOperation(async prisma => {
        const { email, avatarUrl, phoneNumber, googleId: google, ...restData } = data;
        const encryptedPhoneNumber = encryptPhoneNumber(phoneNumber as string);
        restData.encryptedPhone = encryptedPhoneNumber;
        restData.phoneLastFour = phoneNumber.slice(-4);

        return await prisma.user.create({
          data: {
            email,
            avatarUrl,
            googleId: google,
            isEmailVerified: true,
            status: UserStatus.ACTIVE,
            lastLogin: new Date(),
            lastLoginIP: deviceData.ipAddress,
            sessions: {
              create: {
                deviceId: DeviceFingerprint.generateDeviceId(deviceData),
                deviceFingerprint: DeviceFingerprint.generateFromDeviceInfo(deviceData),
                sessionToken: hashedToken,
                ...othersDeviceData,
                ...location,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                refreshTokens: {
                  create: {
                    token: hashedToken,
                    expiresAt,
                  },
                },
              },
            },
            assignedRole: {
              create: {
                role: UserRole.STUDENT,
              },
            },
            studentProfile: {
              create: {
                ...restData,
              },
            },
          },
          select: {
            ...LOGIN_USER_SELECT,
            emailVerificationTokenHash: true,
          },
        });
      }, 'create user');

      return {
        user: buildUserProfile(user),
        refreshToken,
      };
    }
  }

  if (existingUser) {
    if (password) {
      if (existingUser.status !== UserStatus.ACTIVE) {
        throw new Error('Your account is Inactive or Suspended');
      }
      if (existingUser.password && existingUser.emailVerificationTokenHash) {
        throw new Error('Email already sent, verify it and try to login');
      }
      if (existingUser.password) {
        throw new Error('User already exists');
      }
      const updateUserWithPassword = await executeDbOperation(async prisma => {
        return prisma.user.update({
          where: {
            id: existingUser.id,
          },
          data: {
            password: await hash(password as string),
          },
          select: LOGIN_USER_SELECT,
        });
      }, 'Update Password User');

      return {
        user: buildUserProfile(updateUserWithPassword),
        refreshToken,
      };
    }

    if (googleId) {
      if (existingUser.googleId) {
        throw new Error('User already exists');
      }
      const updateUserWithGoogleID = await executeDbOperation(async prisma => {
        return await prisma.user.update({
          where: {
            id: existingUser.id,
          },
          data: {
            googleId: googleId as string,
            emailVerificationTokenHash: null,
            emailVerificationExpires: null,
            isEmailVerified: true,
            status: UserStatus.ACTIVE,
          },
          select: LOGIN_USER_SELECT,
        });
      }, 'Update Google ID User');

      return {
        user: buildUserProfile(updateUserWithGoogleID),
        refreshToken,
      };
    }
  }
};

const registerInstructor = async (req: Request) => {
  const data = req.body;
  if (data.DOB) {
    data.DOB = new Date(data.DOB as string);
  }

  if (!data.email) {
    throw new Error('User Email not found');
  }

  const existingUser = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        email: data.email,
      },
      select: LOGIN_USER_SELECT,
    });
  }, 'User Exist in Instructor Registration');

  if (!existingUser) {
    if (!data.password) {
      throw new Error('Password Required for Instructor Registration');
    }
    const hashedPassword = await hash(data.password as string);
    data.password = hashedPassword;
    const { email, password, phoneNumber, skills, socialAccount, ...restData } = data;
    const encryptedPhoneNumber = encryptPhoneNumber(phoneNumber as string);
    restData.encryptedPhone = encryptedPhoneNumber;
    restData.phoneLastFour = phoneNumber.slice(-4);

    const user = await executeDbOperation(async prisma => {
      return await prisma.user.create({
        data: {
          email,
          password,
          emailVerificationTokenHash: crypto.randomBytes(64).toString('hex'),
          emailVerificationExpires: new Date(Date.now() + 6 * 60 * 60 * 1000),
          instructorProfile: {
            create: {
              ...restData,
              skills: {
                createMany: {
                  data: skills.map((skillName: string) => ({
                    skill: skillName,
                  })),
                  skipDuplicates: true,
                },
              },
              socialAccount: {
                createMany: {
                  data: socialAccount.map((social: any) => ({ ...social })),
                  skipDuplicates: true,
                },
              },
            },
          },
        },
        select: {
          ...LOGIN_USER_SELECT,
          emailVerificationTokenHash: true,
        },
      });
    }, 'create instructor profile');

    return buildUserProfile(user);
  }

  if (existingUser.status === UserStatus.INACTIVE) {
    throw new Error('Your account has been deactivated or Suspended');
  }

  if (existingUser?.instructorProfile) {
    throw new Error('Profile Already Exists with this email');
  }

  // === If user exist but does not have an instructor profile ===
  const {
    email: _email,
    password: _password,
    phoneNumber,
    skills,
    socialAccount,
    ...restData
  } = data;
  const encryptedPhoneNumber = encryptPhoneNumber(phoneNumber as string);
  restData.encryptedPhone = encryptedPhoneNumber;
  restData.phoneLastFour = phoneNumber.slice(-4);

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.update({
      where: {
        email: data.email,
      },
      data: {
        instructorProfile: {
          create: {
            ...restData,
            skills: {
              createMany: {
                data: skills.map((skillName: string) => ({
                  skill: skillName,
                })),
                skipDuplicates: true,
              },
            },
            socialAccount: {
              createMany: {
                data: socialAccount.map((social: any) => ({ ...social })),
                skipDuplicates: true,
              },
            },
          },
        },
      },
      select: {
        ...LOGIN_USER_SELECT,
      },
    });
  }, 'create instructor profile');

  return buildUserProfile(user);
};

const verifyUser = async (req: Request) => {
  const { id, token } = req.body;

  if (!id || typeof id !== 'string') {
    throw new Error('Invalid User');
  }

  if (!token || typeof token !== 'string') {
    throw new Error('Invalid Token');
  }

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        id,
      },
    });
  });

  if (!user) {
    throw new Error('User Does Not Exist');
  } else {
    if (user.status !== UserStatus.ACTIVE) {
      throw new Error('Your account has been deactivated or Suspended');
    }
    if (user.emailVerificationTokenHash !== token) {
      throw new Error('Invalid Verification Link');
    } else {
      if (new Date(user.emailVerificationExpires as unknown as number) < new Date()) {
        throw new Error('Link Expired');
      } else {
        const updateUser = await executeDbOperation(async prisma => {
          return await prisma.user.update({
            where: {
              id,
            },
            data: {
              isEmailVerified: true,
              status: UserStatus.ACTIVE,
              emailVerificationTokenHash: null,
              emailVerificationExpires: null,
            },
            select: LOGIN_USER_SELECT,
          });
        }, 'Verify Email');
        return updateUser;
      }
    }
  }
};

const resendVerificationEmail = async (req: Request) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    throw new Error('Invalid email address');
  }

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.status === UserStatus.INACTIVE) {
    throw new Error('Your account has been deactivated or Suspended');
  }

  if (user.isEmailVerified) {
    throw new Error('Email is already verified');
  }

  const verificationToken = crypto.randomBytes(64).toString('hex');
  const verificationExpires = new Date(Date.now() + 12 * 60 * 60 * 1000);

  const updatedUser = await executeDbOperation(async prisma => {
    return await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: verificationToken,
        emailVerificationExpires: verificationExpires,
        status: UserStatus.PENDING_VERIFICATION,
      },
      select: {
        ...LOGIN_USER_SELECT,
        emailVerificationTokenHash: true,
      },
    });
  }, 'Resend Verification Email');

  return buildUserProfile(updatedUser);
};

const forgotPassword = async (req: Request) => {
  const { email } = req.body;

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        email,
      },
    });
  }, 'find User in forgot password');

  if (!user) {
    throw new Error('User Does Not Exist');
  } else {
    if (user.status !== UserStatus.ACTIVE) {
      throw new Error('Your account has been deactivated or Suspended');
    }
    if (!user.password) {
      throw new Error('User not registered');
    } else if (!user.isEmailVerified) {
      throw new Error('Please Verify Your Email first');
    } else {
      const refreshToken = crypto.randomBytes(64).toString('hex');

      const forgotPasswordUser = await executeDbOperation(async prisma => {
        return await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            passwordResetTokenHash: refreshToken,
            passwordResetExpires: new Date(Date.now() + 12 * 60 * 60 * 1000),
          },
          select: {
            ...LOGIN_USER_SELECT,
            passwordResetTokenHash: true,
          },
        });
      }, 'Forgot Password');
      return buildUserProfile(forgotPasswordUser);
    }
  }
};

const resetPassword = async (req: Request) => {
  const { confirmPassword } = req.body;
  const { id, token } = req.query;

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        id: id as string,
      },
    });
  }, 'find User in Reset Password');

  if (!user) {
    throw new Error('User Not Found');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new Error('Your account has been deactivated or Suspended');
  }
  if (user.passwordResetTokenHash !== token) {
    throw new Error('Invalid Reset Token');
  } else {
    if (new Date(user.passwordResetExpires as unknown as number) < new Date()) {
      throw new Error('Password Reset Link Expired');
    } else {
      const hashedConfirmPassword = await hash(confirmPassword as string);
      const updatedUser = await executeDbOperation(async prisma => {
        return await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            password: hashedConfirmPassword,
            passwordChangedAt: new Date(),
            passwordResetTokenHash: null,
            passwordResetExpires: null,
          },
          select: LOGIN_USER_SELECT,
        });
      }, 'updatedUser in Reset Password');
      return updatedUser;
    }
  }
};

const changePassword = async (req: Request) => {
  const { id, token, oldPassword, newPassword } = req.body;

  const user = await executeDbOperation(async prisma => {
    return await prisma.user.findUnique({
      where: {
        id: id as string,
      },
    });
  }, 'find User in Reset Password');

  if (!user) {
    throw new Error('User Not Found');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new Error('Your account has been deactivated or Suspended');
  }
  if (user.passwordResetTokenHash !== token) {
    throw new Error('Invalid Reset Token');
  } else {
    if (new Date(user.passwordResetExpires as unknown as number) < new Date()) {
      throw new Error('Password Reset Link Expired');
    } else {
      const isOldPasswordValid = await verifyHash(oldPassword as string, user.password as string);
      if (!isOldPasswordValid) {
        throw new Error('Invalid Old Password');
      } else {
        const hashedNewPassword = await hash(newPassword as string);
        const updatedUser = await executeDbOperation(async prisma => {
          return await prisma.user.update({
            where: {
              id: user.id,
            },
            data: {
              password: hashedNewPassword,
              passwordChangedAt: new Date(),
              passwordResetTokenHash: null,
              passwordResetExpires: null,
            },
            select: LOGIN_USER_SELECT,
          });
        }, 'updatedUser in Reset Password');
        return updatedUser;
      }
    }
  }
};

// === Logout from current device ===
const logoutCurrentDevice = async (req: Request) => {
  const refreshToken = authHeadersValidate(req);
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new Error('Invalid refresh token');
  }

  const hashedToken = hashRefreshToken(refreshToken);

  const session = await executeDbOperation(async prisma => {
    return await prisma.userSession.findFirst({
      where: { refreshTokens: { some: { token: hashedToken } } },
      include: { refreshTokens: true },
    });
  }, 'Find Session in Logout Current Device');

  if (!session) {
    throw new Error('Session not found or already logged out');
  }

  if (!session.isActive) {
    throw new Error('Already Logged Out');
  }

  const updateRefreshTokenAndSession = await executeDbOperation(async prisma => {
    return await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: {
          sessionId: session.id,
          id: { in: session.refreshTokens.map(t => t.id) },
          revoked: false,
        },
        data: {
          revoked: true,
          revokedAt: new Date(),
        },
      }),
      prisma.userSession.update({
        where: { id: session.id },
        data: {
          isActive: false,
          isCompromised: false,
          expiresAt: new Date(),
          updatedAt: new Date(),
        },
        select: { id: true, userId: true },
      }),
    ]);
  }, 'Update RefreshToken in Logout current Device');

  const [revokedTokens, updatedSession] = updateRefreshTokenAndSession as unknown as [
    { count: number },
    { count: number; userId: string },
  ];

  if (!revokedTokens || !updatedSession) {
    throw new Error('Logout operation failed.');
  }

  if (revokedTokens.count === 0) {
    throw new Error('No active refresh tokens found to revoke.');
  }

  if (updatedSession.count === 0) {
    throw new Error('No active session found for this device.');
  }

  return {
    user: updatedSession.userId,
  };
};

// === Logout from all devices ===
const logoutAllDevices = async (req: Request) => {
  // === 1️⃣ Extract refresh token from cookie
  const refreshToken = authHeadersValidate(req);
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new Error('Invalid or missing refresh token.');
  }

  // === 2️⃣ Hash token for lookup
  const hashedToken = hashRefreshToken(refreshToken);

  // === 3️⃣ Find session and associated user
  const session = await executeDbOperation(async prisma => {
    return await prisma.userSession.findFirst({
      where: { refreshTokens: { some: { token: hashedToken, revoked: false } } },
      select: { id: true, userId: true },
    });
  }, 'Find user from refresh token during logout-all-devices');

  if (!session) {
    throw new Error('Active session not found or already logged out.');
  }

  // === 4️⃣ Revoke all refresh tokens + deactivate all user sessions
  const [revokedTokens, updatedSessions] = await executeDbOperation(async prisma => {
    return await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: {
          // sessionId: session.id,
          revoked: false,
        },
        data: {
          revoked: true,
          revokedAt: new Date(),
        },
      }),
      prisma.userSession.updateMany({
        where: { userId: session.userId, isActive: true },
        data: {
          isActive: false,
          expiresAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ]);
  }, 'Revoke all refresh tokens and deactivate sessions');

  if (!revokedTokens || !updatedSessions) {
    throw new Error(
      'Unexpected database response. Logout operation failed. Please try again later.'
    );
  }

  return {
    message: 'Successfully logged out of all devices.',
    loggedOutDevices:
      updatedSessions.count > 0 ? `Logged out ${updatedSessions.count} sessions.` : '',
  };
};

// === Refresh access token ===
const refreshAccessToken = async (req: Request) => {
  const { refreshToken, hashedToken, expiresAt } = generateRefreshToken();
  const oldRefreshToken = authHeadersValidate(req);

  if (!oldRefreshToken || typeof oldRefreshToken !== 'string') {
    throw new Error('Refresh token not provided');
  }

  const hashedOldToken = hashRefreshToken(oldRefreshToken);

  // 1️⃣ Find the existing refresh token
  const existingToken = await executeDbOperation(async prisma => {
    return await prisma.refreshToken.findUnique({
      where: { token: hashedOldToken },
      include: { session: true },
    });
  }, 'Find Existing Refresh Token');

  if (!existingToken) {
    throw new Error('Token not found');
  }

  // Check if expired or revoked
  if (existingToken.revoked) {
    await executeDbOperation(async prisma => {
      return await prisma.userSession.update({
        where: { id: existingToken.sessionId as string },
        data: { isActive: false },
      });
    }, 'Deactivate Session on Revoked Token');
    throw new Error('Refresh token is revoked.');
  }

  if (existingToken.expiresAt < new Date()) {
    throw new Error('Refresh token is expired.');
  }

  // Check if session is active and not expired
  if (existingToken.session) {
    if (!existingToken.session.isActive || existingToken.session.expiresAt < new Date()) {
      throw new Error('Session is inactive or expired.');
    }
  }

  // 3️⃣ Transaction to rotate tokens
  const rotateRefreshToken = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      const revokedToken = await tx.refreshToken.update({
        where: { id: existingToken.id },
        data: {
          revoked: true,
          revokedAt: new Date(),
        },
      });

      const newToken = await tx.refreshToken.create({
        data: {
          token: hashedToken,
          sessionId: existingToken.sessionId,
          expiresAt,
          replacesToken: { connect: { id: existingToken.id } },
        },
      });

      await tx.refreshToken.update({
        where: { id: existingToken.id },
        data: { replacedByTokenId: newToken.id },
      });

      const updatedSession = await tx.userSession.update({
        where: { id: existingToken.sessionId as string },
        data: { lastActivity: new Date() },
        include: {
          user: {
            select: LOGIN_USER_SELECT,
          },
        },
      });

      return { revokedToken, newToken, updatedSession };
    });
  }, 'Rotate Tokens');

  if (!rotateRefreshToken) {
    throw new Error('Token rotation failed: no transaction result received.');
  }

  const { revokedToken, newToken, updatedSession } = rotateRefreshToken;

  if (!revokedToken || !newToken || !updatedSession) {
    throw new Error('Token rotation incomplete: missing data from transaction.');
  }

  if (!revokedToken.revoked) {
    throw new Error('Old refresh token was not properly revoked.');
  }

  if (newToken.expiresAt <= new Date()) {
    throw new Error('New refresh token has invalid expiry date.');
  }

  if (updatedSession.isActive === false) {
    throw new Error('Session was inactive during rotation.');
  }

  return {
    user: buildUserProfile(updatedSession.user),
    refreshToken,
  };
};

export const authService = {
  loginUser,
  registerStudent,
  registerInstructor,
  verifyUser,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  logoutCurrentDevice,
  logoutAllDevices,
  changePassword,
  refreshAccessToken,
};
