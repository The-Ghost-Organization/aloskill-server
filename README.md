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