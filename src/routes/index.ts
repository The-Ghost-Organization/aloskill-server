import express from 'express';
import { AdminRoutes } from '../modules/admin/admin.routes.js';
import { AuthRoutes } from '../modules/auth/auth.routes.js';
import { BookRoutes } from '../modules/book/book.routes.js';
import { CartRoutes } from '../modules/cart/cart.routes.js';
import { ChatRoutes } from '../modules/chat/chat.routes.js';
import { ContactRoutes } from '../modules/contact/contact.routes.js';
import { CourseRoutes } from '../modules/course/course.routes.js';
import { NotificationRoutes } from '../modules/notification/notification.routes.js';
import { OrderRoutes } from '../modules/order/order.routes.js';
import { UserRoutes } from '../modules/user/user.routes.js';

const router = express.Router({ caseSensitive: true });

const moduleRoutes = [
  { path: '/auth', route: AuthRoutes },
  { path: '/user', route: UserRoutes },
  { path: '/course', route: CourseRoutes },
  { path: '/order', route: OrderRoutes },
  { path: '/book', route: BookRoutes },
  { path: '/admin', route: AdminRoutes },
  { path: '/cart', route: CartRoutes },
  { path: '/chat', route: ChatRoutes },
  { path: '/notifications', route: NotificationRoutes },
  { path: '/contact', route: ContactRoutes },
];

moduleRoutes.forEach(route => router.use(route.path, route.route));

export default router;
