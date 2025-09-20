import { AuthRoutes } from '@/modules/auth/auth.routes.js';
import express from 'express';

const router = express.Router({ caseSensitive: true });

const moduleRoutes = [{ path: '/auth', route: AuthRoutes }];

moduleRoutes.forEach(route => router.use(route.path, route.route));

export default router;
