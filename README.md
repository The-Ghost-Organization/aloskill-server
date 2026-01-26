# Node.js Express TypeScript Server Boilerplate

A production-ready, secure, and scalable Node.js server boilerplate built with Express, TypeScript, and Prisma ORM. This template provides a solid foundation for building robust backend applications with modern best practices.

## Technology Stack

### Core Technologies

- **Node.js** (v18+) - JavaScript runtime
- **Express.js** (v5) - Web framework
- **TypeScript** (v5.9) - Type-safe JavaScript
- **Prisma ORM** (v6) - Next-generation ORM for Node.js
- **PostgreSQL** - Relational database

### Security Features

- JWT authentication with secure cookie handling
- Rate limiting and request throttling
- XSS protection and input sanitization
- Helmet for HTTP security headers
- CORS configuration
- HPP (HTTP Parameter Pollution) protection

### Development Tools

- ESLint with multiple plugins for code quality
- Prettier for consistent code formatting
- Husky and lint-staged for pre-commit hooks
- Winston logger with daily rotation
- Hot reloading with tsx watch

## Project Structure

```
├── prisma/                  # Prisma schema and migrations
├── src/
│   ├── config/              # Configuration files
│   ├── middleware/          # Express middleware
│   ├── modules/             # Feature modules (auth, etc.)
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions
│   ├── validations/         # Zod validation schemas
│   ├── app.ts               # Express app setup
│   └── server.ts            # Server entry point
├── .env                     # Environment variables (create from .env.example)
├── package.json             # Dependencies and scripts
└── tsconfig.json            # TypeScript configuration
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm (v8 or higher)
- PostgreSQL database

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/server-setup-boilerplate.git
   cd server-setup-boilerplate
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:

   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/dbname?schema=public"
   JWT_SECRET="your-secret-key"
   JWT_EXPIRES_IN="7d"
   NODE_ENV="development"
   PORT=5000
   ```

4. Set up the database:

   ```bash
   npm run db:generate   # Generate Prisma client
   npm run db:push       # Push schema to database
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint:fix` - Fix linting issues
- `npm run prettier:fix` - Fix formatting issues
- `npm run db:studio` - Open Prisma Studio to manage database
- `npm run check-all` - Run all checks (typecheck, lint, prettier, security)
- `npm run format-all` - Format all files

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- Additional endpoints as per your application requirements

## Frontend API Integration Guide

### Base Configuration

1. **Base URL**: `/api/v1`
2. **Default Headers**: Set `Content-Type: application/json` for JSON payloads.
3. **Credential Handling**: Enable `withCredentials: true` on client requests so the browser stores the HTTP-only auth cookies returned by the server.

### Authentication Routes

#### 1. Register a User

- **Endpoint**: `POST /api/v1/auth/register`
- **Body Parameters**:
  - `firstName` (string, required)
  - `lastName` (string, required)
  - `email` (string, required, valid email)
  - `password` (string, required unless `googleId` is provided; must include upper/lowercase and number)
  - `role` (enum: `STUDENT | INSTRUCTOR`, optional)
  - `googleId` (string, optional, mutually exclusive with `password`)
  - Optional profile fields: `profilePicture`, `bio`, `phoneNumber`
- **Successful Response**: `200 OK` with user profile payload and auth cookies set.
- **Frontend Tip**: After a conventional signup, prompt users to confirm email via the verification link sent.

```typescript
// Example using Axios
await axios.post(
  '/api/v1/auth/register',
  {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'Secure123',
    role: 'STUDENT',
  },
  { withCredentials: true }
);
```

#### 2. Log In a User

- **Endpoint**: `POST /api/v1/auth/login`
- **Body Parameters**:
  - `email` (string, required)
  - Either `password` (string, optional) or `googleId` (string, optional). Do not supply both.
- **Successful Response**: `200 OK` with user summary and refreshed cookies (`accessToken`, `refreshToken`).
- **Error Handling**: Watch for messages such as `Please Verify Your Email`, `Account locked`, or `Device Limit Exceeded` to inform UX.

```typescript
// Axios login with password
await axios.post(
  '/api/v1/auth/login',
  {
    email: 'ada@example.com',
    password: 'Secure123',
  },
  { withCredentials: true }
);
```

#### 3. Verify User Email

- **Endpoint**: `POST /api/v1/auth/verify-user`
- **Body Parameters**:
  - `id` (string, required)
  - `token` (string, required)
- **Usage Pattern**: Typically triggered after a user clicks the verification link provided in `signupWelcomeTemplate`.

```typescript
await axios.post('/api/v1/auth/verify-user', {
  id: query.id,
  token: query.token,
});
```

#### 4. Request Password Reset

- **Endpoint**: `POST /api/v1/auth/forgot-password`
- **Body Parameters**:
  - `email` (string, required)
- **Response**: `200 OK` even if the email is not found (avoid leaking existence). Provide UI feedback advising the user to check their inbox.

```typescript
await axios.post('/api/v1/auth/forgot-password', { email: 'ada@example.com' });
```

#### 5. Reset Password

- **Endpoint**: `POST /api/v1/auth/reset-password`
- **Query Parameters**:
  - `id` (string, required)
  - `token` (string, required)
- **Body Parameters**:
  - `oldPassword` (string, required)
  - `newPassword` (string, required, must satisfy strength rules)
- **Response**: `200 OK` with confirmation message and updated cookies.

```typescript
await axios.post(
  '/api/v1/auth/reset-password?id=123&token=abc',
  {
    oldPassword: 'Secure123',
    newPassword: 'EvenMoreSecure456',
  },
  { withCredentials: true }
);
```

### Handling API Responses

- **Success**: The backend standardizes responses via `ResponseHandler.ok`, resulting in `{ success: true, message, data }`. Use `message` for toast notifications and persist `data` as needed.
- **Errors**: Unhandled errors throw descriptive messages. Capture `error.response?.data?.message` to surface user-friendly feedback.

### Token Lifecycles

- **Access Token**: Short-lived (`1h`), stored in HTTP-only cookie.
- **Refresh Token**: Stored server-side and returned in HTTP-only cookie. The server rotates/validates as part of login/register.
- **Frontend Action**: Rely on cookies for auth state; avoid storing tokens manually. For SSR frameworks, forward cookies when making API calls.

### Suggested Frontend Utilities

1. **Global Axios Instance** with `baseURL` and `withCredentials` preset.
2. **Global Error Interceptor** to redirect on 401/403 and display toast messages.
3. **Auth Context/Store** to track user object from responses and manage UI state.

## Security Best Practices

This boilerplate implements several security best practices:

1. **Rate Limiting**: Prevents brute force attacks by limiting request frequency
2. **Input Validation**: Uses Zod for schema validation
3. **XSS Protection**: Sanitizes user input to prevent cross-site scripting
4. **Secure Headers**: Uses Helmet to set secure HTTP headers
5. **Environment Variables**: Sensitive information stored in environment variables
6. **Error Handling**: Custom error handling that doesn't leak sensitive information

## Deployment

This application is designed to be deployed to any Node.js hosting environment:

1. Build the application:

   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm run start
   ```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Express.js team for the excellent web framework
- Prisma team for the next-generation ORM
- All open-source contributors whose libraries make this project possible