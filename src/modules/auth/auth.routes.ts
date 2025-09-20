import express from "express";
import { authController } from "./auth.controller.js";
import { authLimiter } from "@/middleware/security.js";
import { requireAuth } from "@/middleware/auth.js";
import { validate } from "@/middleware/validation.js";
import { loginSchema, registerSchema } from "@/validations/auth.js";

const router = express.Router({ caseSensitive: true });

//middleware
router.use(authLimiter);

//routes
router.post('/login', requireAuth, validate(loginSchema), authController.loginUser);
router.post('/register', validate(registerSchema), authController.registerUser);

//named export
export const AuthRoutes = router;
