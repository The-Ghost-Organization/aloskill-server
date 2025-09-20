// Token types
export type TokenType = 'ACCESS' | 'REFRESH';

// Token payload interface
export interface JwtPayload {
  email: string;
  role: string;
  type: TokenType;
  iat?: number;
  exp?: number;
}

// Token generation options
export interface TokenOptions {
  expiresIn: string;
  type: TokenType;
}

// Token pair interface
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
