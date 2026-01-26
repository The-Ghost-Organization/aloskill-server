import argon2 from 'argon2';

export const hash = async (plainPassword: string): Promise<string> => {
  return await argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
};

export const verifyHash = async (
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> => {
  return await argon2.verify(hashedPassword, plainPassword);
};
