import express from "express";
import { requireAdmin, requireInstructor } from "../../middleware/auth.js";
import { generalLimiter } from "../../middleware/security.js";
import { financeController as c } from "./finance.controller.js";
const router = express.Router({ caseSensitive: true });
router.use(generalLimiter);
router.get("/instructor/overview", requireInstructor, c.myOverview);
router.get("/instructor/transactions", requireInstructor, c.myTransactions);
router.get("/instructor/payouts", requireInstructor, c.myPayouts);
router.post("/instructor/payouts", requireInstructor, c.requestPayout);
router.get("/instructor/payouts/:id", requireInstructor, c.myPayoutDetail);
router.patch("/instructor/payouts/:id", requireInstructor, c.cancelPayout);
router.get("/instructor/accounts", requireInstructor, c.methods);
router.post("/instructor/accounts", requireInstructor, c.saveMethod);
router.get("/admin/overview", requireAdmin, c.overview);
router.get("/admin/transactions", requireAdmin, c.transactions);
router.get("/admin/payouts", requireAdmin, c.payouts);
router.get("/admin/payouts/:id", requireAdmin, c.payoutDetail);
router.patch("/admin/payouts/:id", requireAdmin, c.updatePayout);
router.get("/admin/settings", requireAdmin, c.settings);
router.patch("/admin/settings", requireAdmin, c.updateSettings);
router.get("/admin/instructors", requireAdmin, c.instructors);
router.patch(
  "/admin/instructors/:id/commission",
  requireAdmin,
  c.updateOverride,
);
router.get(
  "/admin/products/:type/:id/commission",
  requireAdmin,
  c.commissionSuggestion,
);
router.patch(
  "/admin/products/:type/:id/commission",
  requireAdmin,
  c.updateProductCommission,
);
router.post("/admin/order-items/:id/refund", requireAdmin, c.refund);
export const FinanceRoutes = router;
