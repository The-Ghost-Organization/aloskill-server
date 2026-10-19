import type { Request } from "express";
import catchAsync from "../../utils/asyncHandler.js";
import ResponseHandler from "../../utils/response.js";
import { financeService as s } from "./finance.service.js";
const handle = (work: (req: Request) => Promise<unknown>) =>
  catchAsync(async (req, res) => {
    ResponseHandler.ok(res, "Finance request completed.", await work(req));
  });
export const financeController = {
  myOverview: handle(s.myOverview),
  myTransactions: handle((req) => s.transactions(req)),
  myPayouts: handle((req) => s.payouts(req)),
  methods: handle(s.methods),
  saveMethod: handle(s.saveMethod),
  requestPayout: handle(s.requestPayout),
  myPayoutDetail: handle((req) => s.payoutDetail(req)),
  cancelPayout: handle((req) => s.updatePayout(req, false)),
  overview: handle(s.overview),
  transactions: handle((req) => s.transactions(req, true)),
  payouts: handle((req) => s.payouts(req, true)),
  payoutDetail: handle((req) => s.payoutDetail(req, true)),
  updatePayout: handle((req) => s.updatePayout(req, true)),
  settings: handle(s.settings),
  updateSettings: handle(s.updateSettings),
  commissionSuggestion: handle(s.commissionSuggestion),
  updateProductCommission: handle(s.updateProductCommission),
  instructors: handle(s.instructors),
  updateOverride: handle(s.updateOverride),
  refund: handle(s.refund),
};
