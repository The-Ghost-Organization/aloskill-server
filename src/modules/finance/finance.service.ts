/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import type { Request } from "express";
import {
  executeDbOperation,
  DatabaseQueryError,
} from "../../config/database.js";
import {
  Prisma,
  type PayoutWorkflowStatus,
  type PlatformFeeType,
} from "../../generated/client.js";
import {
  AppError,
  ValidationError,
  ForbiddenError,
} from "../../middleware/errorHandler.js";
import {
  encryptPhoneNumber,
  decryptPhoneNumber,
} from "../../utils/phoneNumber.js";
import {
  ACTIVE_PAYOUTS,
  allocateDiscount,
  canTransition,
  money,
  rate,
  scaled,
  splitSale,
} from "./finance.math.js";

type Tx = Prisma.TransactionClient;
const D = (v: unknown) => new Prisma.Decimal(String(v ?? 0));
const active = [...ACTIVE_PAYOUTS];
function fail(s: string): never {
  throw new ValidationError(s);
}
const financeId = "aloskill-finance";
const text = (value: unknown, max = 500) =>
  typeof value === "string" && value.trim().length <= max
    ? value.trim()
    : fail("Invalid text field.");
const page = (req: Request) => {
  const p = Number(req.query.page ?? 1),
    size = Number(req.query.pageSize ?? 20);
  if (
    !Number.isInteger(p) ||
    p < 1 ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100
  )
    {fail("Invalid pagination.");}
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
};
const amount = (v: unknown) => {
  try {
    return money(scaled(v));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid amount.");
  }
};
const percentage = (v: unknown) => {
  try {
    return rate(v);
  } catch {
    return fail("Percentage must be 0–100 with at most two decimals.");
  }
};
const audit = (
  tx: Tx,
  userId: string,
  action: string,
  entityId: string,
  after: unknown,
) =>
  tx.auditLog.create({
    data: {
      userId,
      action,
      entityType: "FINANCE",
      entityId,
      changesAfter: JSON.parse(JSON.stringify(after)),
    },
  });
export async function getSettings(tx: Tx) {
  const existing = await tx.platformSettings.findUnique({
    where: { id: financeId },
  });
  if (existing) {return existing;}
  await tx.platformSettings.createMany({
    data: [{ id: financeId, financeActivatedAt: new Date() }],
    skipDuplicates: true,
  });
  return tx.platformSettings.findUniqueOrThrow({ where: { id: financeId } });
}
async function actor(tx: Tx, req: Request, admin = false) {
  const u = await tx.user.findUnique({
    where: { email: req.user.email },
    include: { assignedRole: true, instructorProfile: true },
  });
  if (!u || u.deletedAt || u.status !== "ACTIVE")
    {throw new ForbiddenError("Active account required.");}
  if (admin && !u.assignedRole.some((r) => r.role === "ADMIN"))
    {throw new ForbiddenError("Administrator required.");}
  if (
    !admin &&
    (!u.instructorProfile ||
      u.instructorProfile.deletedAt ||
      u.instructorProfile.status !== "APPROVED" ||
      !u.assignedRole.some((r) => r.role === "INSTRUCTOR"))
  )
    {throw new ForbiddenError("Approved instructor required.");}
  return u;
}
export async function lockInstructor(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}
/** Common ordering: order row, then sorted instructor user rows. */
export async function resolveCommission(
  tx: Tx,
  type: "book" | "course",
  id: string,
) {
  const settings = await getSettings(tx);
  const product =
    type === "book"
      ? await tx.book.findUniqueOrThrow({
          where: { id },
          include: { owner: { include: { instructorProfile: true } } },
        })
      : await tx.course.findUniqueOrThrow({
          where: { id },
          include: { createdBy: true },
        });
  const profile =
    "owner" in product ? product.owner.instructorProfile : product.createdBy;
  const override =
    type === "book"
      ? profile?.bookCommissionRate
      : profile?.courseCommissionRate;
  const global =
    type === "book"
      ? settings.globalBookCommission
      : settings.globalCourseCommission;
  return {
    product,
    profile,
    settings,
    commissionRate: product.commissionRate ?? override ?? global,
    source:
      product.commissionRate !== null
        ? "PRODUCT"
        : override !== null && override !== undefined
          ? "INSTRUCTOR"
          : "GLOBAL",
  };
}
export async function finalizeCommission(
  tx: Tx,
  type: "book" | "course",
  id: string,
  proposed?: unknown,
) {
  const r = await resolveCommission(tx, type, id);
  return {
    commissionRate: D(
      proposed === undefined
        ? percentage(r.commissionRate)
        : percentage(proposed),
    ),
    commissionSource: proposed === undefined ? r.source : "PRODUCT",
    commissionApprovedAt: new Date(),
  };
}
/** Must run inside the SAME transaction that verifies and commits payment success. */
export async function settleVerifiedOrder(
  tx: Tx,
  orderId: string,
  paymentId: string,
  paidAt = new Date(),
) {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { orderItems: { orderBy: { id: "asc" } } },
  });
  if (order.financeSettledAt) {return;}
  const payment = await tx.paymentTransaction.findUniqueOrThrow({
    where: { id: paymentId },
  });
  if (
    payment.orderId !== orderId ||
    payment.status !== "SUCCEEDED" ||
    payment.type !== "PURCHASE" ||
    !payment.amount.equals(order.totalAmount)
  )
    {fail("Verified purchase payment is required for settlement.");}
  if (order.currency !== "BDT")
    {fail("Finance currently supports BDT purchases only.");}
  const settings = await getSettings(tx);
  await tx.$queryRaw`SELECT id FROM platform_settings WHERE id = ${financeId} FOR SHARE`;
  const lines = order.orderItems.map((i) => scaled(i.price.toFixed(2)));
  const nets = allocateDiscount(
    lines,
    scaled(order.totalAmount.toFixed(2)) -
      scaled(order.shippingCost.toFixed(2)),
  );
  const resolved = await Promise.all(
    order.orderItems.map((i) => {
      if (Boolean(i.courseId) === Boolean(i.bookId))
        {return fail("Order item must contain exactly one product.");}
      return resolveCommission(
        tx,
        i.courseId ? "course" : "book",
        (i.courseId ?? i.bookId)!,
      );
    }),
  );
  const users = [
    ...new Set(resolved.flatMap((r) => (r.profile ? [r.profile.userId] : []))),
  ].sort();
  for (const userId of users) {await lockInstructor(tx, userId);}
  for (let i = 0; i < order.orderItems.length; i++) {
    const item = order.orderItems[i],
      r = resolved[i];
    const commissionRate = r.profile ? r.commissionRate : D(100);
    const feeType =
      item.courseId && r.profile ? settings.coursePlatformFeeType : "NONE";
    const feeValue =
      feeType === "NONE" ? D(0) : settings.coursePlatformFeeValue;
    const split = splitSale(
      nets[i],
      commissionRate,
      feeType,
      feeValue,
      Boolean(item.courseId),
    );
    await tx.financialEntry.create({
      data: {
        kind: "SALE",
        orderId,
        orderItemId: item.id,
        paymentId,
        instructorId: r.profile?.userId ?? null,
        productId: (item.courseId ?? item.bookId)!,
        productType: item.courseId ? "COURSE" : "BOOK",
        productTitle: r.product.title,
        quantity: item.quantity,
        currency: order.currency,
        grossAmount: money(lines[i]),
        discountAmount: money(lines[i] - nets[i]),
        netSaleAmount: money(nets[i]),
        commissionRate,
        commissionSource: r.profile ? r.source : "PLATFORM_OWNED",
        commissionAmount: money(split.commissionAmount),
        platformFeeType: feeType,
        platformFeeValue: feeValue,
        platformFeeAmount: money(split.platformFeeAmount),
        instructorEarning: money(split.instructorEarning),
        platformRevenue: money(split.platformRevenue),
        holdingPeriodDays: settings.holdingPeriodDays,
        availableAt: new Date(
          paidAt.getTime() + settings.holdingPeriodDays * 86400000,
        ),
        status: settings.holdingPeriodDays === 0 ? "AVAILABLE" : "PENDING",
        createdAt: paidAt,
        note: "Line price is the stored checkout total after product discounts. Additional order discount allocated proportionally; shipping excluded.",
      },
    });
  }
  await tx.order.update({
    where: { id: orderId },
    data: { financeSettledAt: paidAt },
  });
}
export const releaseMaturedEarnings = (tx: Tx) =>
  tx.financialEntry.updateMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    data: { status: "AVAILABLE" },
  });
async function balances(tx: Tx, instructorId?: string) {
  const where = instructorId
    ? { instructorId }
    : { instructorId: { not: null } };
  const [sales, refunds, pending, eligible, reserved, paid, settings] =
    await Promise.all([
      tx.financialEntry.aggregate({
        where: { ...where, kind: "SALE" },
        _sum: { instructorEarning: true },
      }),
      tx.financialEntry.aggregate({
        where: { ...where, kind: "REFUND" },
        _sum: { instructorEarning: true },
      }),
      tx.financialEntry.aggregate({
        where: { ...where, status: "PENDING" },
        _sum: { instructorEarning: true },
      }),
      tx.financialEntry.aggregate({
        where: { ...where, status: "AVAILABLE" },
        _sum: { instructorEarning: true },
      }),
      tx.payout.aggregate({
        where: {
          ...(instructorId ? { instructorId } : {}),
          workflowStatus: { in: ["REQUESTED", "APPROVED", "PROCESSING"] },
        },
        _sum: { amount: true },
      }),
      tx.payout.aggregate({
        where: {
          ...(instructorId ? { instructorId } : {}),
          workflowStatus: "PAID",
        },
        _sum: { amount: true },
      }),
      getSettings(tx),
    ]);
  const total = D(sales._sum.instructorEarning),
    adjusted = D(refunds._sum.instructorEarning),
    paidSum = D(paid._sum.amount),
    reservedSum = D(reserved._sum.amount);
  return {
    totalEarnings: total.toFixed(2),
    netEarnings: total.plus(adjusted).toFixed(2),
    pendingBalance: D(pending._sum.instructorEarning).toFixed(2),
    availableBalance: D(eligible._sum.instructorEarning)
      .minus(reservedSum)
      .minus(paidSum)
      .toFixed(2),
    requestedProcessing: reservedSum.toFixed(2),
    totalPaid: paidSum.toFixed(2),
    refundedAdjusted: adjusted.abs().toFixed(2),
    minimumPayout: settings.minimumPayout.toFixed(2),
  };
}
function safeMethod(m: {
  id: string;
  type: string;
  bankName: string | null;
  mobileBankingName: string | null;
  accHolderName: string;
  branchName: string | null;
  routingNumber: string | null;
  accountLastFour: string | null;
}) {
  return {
    id: m.id,
    type: m.type,
    bankName: m.bankName,
    mobileBankingName: m.mobileBankingName,
    accHolderName: m.accHolderName,
    branchName: m.branchName,
    routingNumber: m.routingNumber,
    accountLastFour: m.accountLastFour,
  };
}
async function listEntries(tx: Tx, req: Request, instructorId?: string) {
  const p = page(req),
    where: Prisma.FinancialEntryWhereInput = instructorId
      ? { instructorId }
      : {};
  if (req.query.productType) {
    if (!["BOOK", "COURSE"].includes(String(req.query.productType)))
      {fail("Invalid product type.");}
    where.productType = String(req.query.productType);
  }
  const [rows, total] = await Promise.all([
    tx.financialEntry.findMany({
      where,
      skip: p.skip,
      take: p.take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        reversal: { select: { id: true } },
        items: {
          where: { payout: { workflowStatus: { in: active } } },
          select: {
            amount: true,
            payout: { select: { id: true, workflowStatus: true } },
          },
        },
      },
    }),
    tx.financialEntry.count({ where }),
  ]);
  return {
    rows: rows.map((r) => {
      const allocated = r.items.reduce((sum, i) => sum.plus(i.amount), D(0));
      return {
        ...r,
        allocationAmount: allocated.toFixed(2),
        displayStatus:
          r.kind === "REFUND"
            ? "ADJUSTMENT"
            : r.reversal
              ? "REVERSED"
              : allocated.equals(r.instructorEarning) && allocated.gt(0)
                ? r.items.some((i) => i.payout.workflowStatus !== "PAID")
                  ? "RESERVED"
                  : "PAID"
                : allocated.gt(0)
                  ? "PARTIALLY_ALLOCATED"
                  : r.status,
      };
    }),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}
async function listPayouts(tx: Tx, req: Request, instructorId?: string) {
  const p = page(req);
  const where: Prisma.PayoutWhereInput = {
    workflowStatus: { not: null },
    ...(instructorId ? { instructorId } : {}),
  };
  if (req.query.status) {
    if (
      ![
        "REQUESTED",
        "APPROVED",
        "PROCESSING",
        "PAID",
        "REJECTED",
        "CANCELLED",
      ].includes(String(req.query.status))
    )
      {fail("Invalid payout status.");}
    where.workflowStatus = String(
      req.query.status,
    ) as Prisma.EnumPayoutWorkflowStatusNullableFilter["equals"];
  }
  const [rows, total] = await Promise.all([
    tx.payout.findMany({
      where,
      skip: p.skip,
      take: p.take,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        instructorId: true,
        instructor: {
          select: {
            email: true,
            instructorProfile: { select: { displayName: true } },
          },
        },
        amount: true,
        workflowStatus: true,
        methodType: true,
        accountLastFour: true,
        requestedAt: true,
        approvedAt: true,
        processedAt: true,
        paidAt: true,
        transactionReference: true,
        adminNote: true,
        rejectionReason: true,
      },
    }),
    tx.payout.count({ where }),
  ]);
  return { rows, total, page: p.page, pageSize: p.pageSize };
}
function businessError(error: unknown): never {
  if (error instanceof DatabaseQueryError && error.cause instanceof AppError)
    {throw error.cause;}
  throw error;
}
const read = <T>(work: (tx: Tx) => Promise<T>) =>
  executeDbOperation(
    (prisma) =>
      prisma.$transaction(work, {
        isolationLevel: "RepeatableRead",
        timeout: 20000,
      }),
    "Finance read",
  ).catch(businessError);
const write = <T>(work: (tx: Tx) => Promise<T>) =>
  executeDbOperation(
    (prisma) => prisma.$transaction(work, { timeout: 20000 }),
    "Finance write",
  ).catch(businessError);
const myOverview = (req: Request) =>
  read(async (tx) => {
    const u = await actor(tx, req);
    await releaseMaturedEarnings(tx);
    return balances(tx, u.id);
  });
const transactions = (req: Request, admin = false) =>
  read(async (tx) => {
    const u = await actor(tx, req, admin);
    return listEntries(tx, req, admin ? undefined : u.id);
  });
const payouts = (req: Request, admin = false) =>
  read(async (tx) => {
    const u = await actor(tx, req, admin);
    return listPayouts(tx, req, admin ? undefined : u.id);
  });
const methods = (req: Request) =>
  read(async (tx) => {
    const u = await actor(tx, req);
    return (
      await tx.payoutMethod.findMany({
        where: { instructorId: u.id, encryptedAccount: { not: null } },
        orderBy: { createdAt: "desc" },
      })
    ).map(safeMethod);
  });
const saveMethod = (req: Request) =>
  write(async (tx) => {
    const u = await actor(tx, req);
    await lockInstructor(tx, u.id);
    const b = req.body;
    if (!["BANK_TRANSFER", "BKASH", "NAGAD"].includes(b.method))
      {fail("Choose Bank Transfer, bKash or Nagad.");}
    const number = text(b.accountNumber, 40);
    if (!/^\d{6,34}$/.test(number))
      {fail("Account number must contain 6–34 digits.");}
    if (b.method !== "BANK_TRANSFER" && !/^01[3-9]\d{8}$/.test(number))
      {fail(
        "bKash/Nagad accounts must use an 11-digit Bangladesh mobile number.",
      );}
    const holder = text(b.accHolderName, 120);
    if (!holder) {fail("Account holder name required.");}
    const bank = b.method === "BANK_TRANSFER" ? text(b.bankName, 100) : null;
    if (b.method === "BANK_TRANSFER" && !bank) {fail("Bank name required.");}
    const data = {
      type:
        b.method === "BANK_TRANSFER"
          ? ("BANK_TRANSFER" as const)
          : ("MOBILE_WALLET" as const),
      mobileBankingName:
        b.method === "BKASH"
          ? ("BKASH" as const)
          : b.method === "NAGAD"
            ? ("NAGAD" as const)
            : null,
      bankName: bank,
      accHolderName: holder,
      accountNumber: "",
      encryptedAccount: encryptPhoneNumber(number),
      accountLastFour: number.slice(-4),
      branchName:
        b.method === "BANK_TRANSFER" ? text(b.branchName ?? "", 100) : null,
      routingNumber:
        b.method === "BANK_TRANSFER" ? text(b.routingNumber ?? "", 30) : null,
    };
    const existing = b.id
      ? await tx.payoutMethod.findFirst({
          where: { id: String(b.id), instructorId: u.id },
        })
      : null;
    if (b.id && !existing)
      {throw new ForbiddenError("Payout account not found.");}
    const saved = existing
      ? await tx.payoutMethod.update({ where: { id: existing.id }, data })
      : await tx.payoutMethod.create({ data: { ...data, instructorId: u.id } });
    await audit(tx, u.id, "PAYOUT_ACCOUNT_SAVED", saved.id, {
      method: b.method,
      lastFour: saved.accountLastFour,
    });
    return safeMethod(saved);
  });
const requestPayout = (req: Request) =>
  write(async (tx) => {
    const u = await actor(tx, req);
    await lockInstructor(tx, u.id);
    await releaseMaturedEarnings(tx);
    const requestKey = text(req.body.requestKey, 80);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestKey))
      {fail("Payout request key required.");}
    const key = `${u.id}:${requestKey}`;
    const existing = await tx.payout.findUnique({
      where: { requestKey: key },
      select: { id: true, amount: true, workflowStatus: true },
    });
    if (existing) {return existing;}
    const requested = D(amount(req.body.amount));
    const bal = await balances(tx, u.id);
    if (
      requested.lte(0) ||
      requested.lt(bal.minimumPayout) ||
      requested.gt(bal.availableBalance)
    )
      {fail(
        "Request must meet the minimum payout and fit your available balance.",
      );}
    const method = await tx.payoutMethod.findFirst({
      where: {
        id: String(req.body.methodId),
        instructorId: u.id,
        encryptedAccount: { not: null },
      },
    });
    if (!method?.encryptedAccount) {fail("Select an encrypted payout account.");}
    const payout = await tx.payout.create({
      data: {
        instructorId: u.id,
        amount: requested,
        status: "PENDING",
        workflowStatus: "REQUESTED",
        payoutDate: new Date(),
        requestKey: key,
        methodId: method.id,
        methodType: method.mobileBankingName ?? method.type,
        accountLastFour: method.accountLastFour,
        encryptedAccountSnapshot: encryptPhoneNumber(
          JSON.stringify({
            accountNumber: decryptPhoneNumber(method.encryptedAccount),
            holder: method.accHolderName,
            bank: method.bankName,
            branch: method.branchName,
            routing: method.routingNumber,
          }),
        ),
      },
    });
    let need = requested;
    // Allocate all outstanding negative debt first, then enough positive earnings.
    for (const negative of [true, false]) {
      let cursor: string | undefined;
      while (true) {
        const rows = await tx.financialEntry.findMany({
          where: {
            instructorId: u.id,
            status: "AVAILABLE",
            instructorEarning: negative ? { lt: 0 } : { gt: 0 },
          },
          take: 200,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          include: {
            items: {
              where: { payout: { workflowStatus: { in: active } } },
              select: { amount: true },
            },
          },
        });
        for (const entry of rows) {
          const left = entry.instructorEarning.minus(
            entry.items.reduce((sum, i) => sum.plus(i.amount), D(0)),
          );
          if (left.eq(0)) {continue;}
          const allocation = negative ? left : Prisma.Decimal.min(left, need);
          if (allocation.eq(0)) {continue;}
          await tx.payoutItem.create({
            data: {
              payoutId: payout.id,
              earningId: entry.id,
              amount: allocation,
            },
          });
          need = need.minus(allocation);
          if (!negative && need.eq(0)) {break;}
        }
        if (rows.length < 200 || (!negative && need.eq(0))) {break;}
        cursor = rows[rows.length - 1].id;
      }
    }
    if (!need.eq(0)) {fail("Balance changed; retry your payout request.");}
    await audit(tx, u.id, "PAYOUT_REQUESTED", payout.id, {
      amount: requested.toFixed(2),
    });
    return {
      id: payout.id,
      amount: payout.amount,
      workflowStatus: payout.workflowStatus,
    };
  });
const payoutDetail = (req: Request, admin = false) =>
  read(async (tx) => {
    const u = await actor(tx, req, admin);
    const p = await tx.payout.findFirst({
      where: {
        id: String(req.params.id),
        ...(admin ? {} : { instructorId: u.id }),
      },
      include: {
        items: { include: { earning: true } },
        instructor: {
          select: {
            email: true,
            instructorProfile: { select: { displayName: true } },
          },
        },
      },
    });
    if (!p) {fail("Payout not found.");}
    const { encryptedAccountSnapshot, requestKey, ...safe } = p;
    return {
      ...safe,
      ...(admin && encryptedAccountSnapshot
        ? { account: JSON.parse(decryptPhoneNumber(encryptedAccountSnapshot)) }
        : {}),
    };
  });
const updatePayout = (req: Request, admin = true) =>
  write(async (tx) => {
    const u = await actor(tx, req, admin);
    const id = String(req.params.id),
      initial = await tx.payout.findUnique({ where: { id } });
    if (!initial?.workflowStatus) {fail("Payout not found.");}
    if (!admin && initial.instructorId !== u.id)
      {throw new ForbiddenError("Payout access denied.");}
    await lockInstructor(tx, initial.instructorId);
    const p = await tx.payout.findUniqueOrThrow({ where: { id } }),
      next = String(req.body.status);
    if (!admin && (next !== "CANCELLED" || p.workflowStatus !== "REQUESTED"))
      {fail("Only requested payouts can be cancelled by the instructor.");}
    if (!canTransition(p.workflowStatus as string, next))
      {fail("Invalid payout state transition.");}
    const note = text(req.body.note ?? "");
    const reference = text(req.body.transactionReference ?? "", 120);
    if (next === "REJECTED" && note.length < 5)
      {fail("Rejection reason of at least five characters required.");}
    if (next === "CANCELLED" && admin && note.length < 5)
      {fail(
        "Cancellation reason required; confirm any in-flight transfer was stopped.",
      );}
    if (next === "PAID" && !reference)
      {fail("Actual transfer reference required.");}
    const saved = await tx.payout.update({
      where: { id },
      data: {
        workflowStatus: next as PayoutWorkflowStatus,
        status:
          next === "PAID"
            ? "PAID"
            : next === "REJECTED" || next === "CANCELLED"
              ? "FAILED"
              : "PENDING",
        adminNote: note || p.adminNote,
        ...(next === "APPROVED"
          ? { approvedBy: u.id, approvedAt: new Date() }
          : {}),
        ...(next === "PROCESSING" ? { processedAt: new Date() } : {}),
        ...(next === "PAID"
          ? {
              paidAt: new Date(),
              payoutDate: new Date(),
              transactionReference: reference,
            }
          : {}),
        ...(next === "REJECTED" ? { rejectionReason: note } : {}),
      },
      select: { id: true, workflowStatus: true, amount: true },
    });
    await audit(tx, u.id, `PAYOUT_${next}`, id, {
      previous: p.workflowStatus,
      status: next,
      note,
      transactionReference: reference,
    });
    return saved;
  });
const settingsView = (s: Awaited<ReturnType<typeof getSettings>>) => ({
  globalBookCommission: s.globalBookCommission,
  globalCourseCommission: s.globalCourseCommission,
  coursePlatformFeeType: s.coursePlatformFeeType,
  coursePlatformFeeValue: s.coursePlatformFeeValue,
  holdingPeriodDays: s.holdingPeriodDays,
  minimumPayout: s.minimumPayout,
  financeActivatedAt: s.financeActivatedAt,
});
const settings = (req: Request) =>
  read(async (tx) => {
    await actor(tx, req, true);
    return settingsView(await getSettings(tx));
  });
const updateSettings = (req: Request) =>
  write(async (tx) => {
    const u = await actor(tx, req, true),
      previous = await getSettings(tx),
      b = req.body;
    if (!["NONE", "FIXED", "PERCENTAGE"].includes(b.coursePlatformFeeType))
      {fail("Invalid platform fee type.");}
    if (
      !Number.isInteger(b.holdingPeriodDays) ||
      b.holdingPeriodDays < 0 ||
      b.holdingPeriodDays > 3650
    )
      {fail("Holding period must be an integer from 0 to 3650 days.");}
    const data = {
      globalBookCommission: percentage(b.globalBookCommission),
      globalCourseCommission: percentage(b.globalCourseCommission),
      coursePlatformFeeType: b.coursePlatformFeeType as PlatformFeeType,
      coursePlatformFeeValue:
        b.coursePlatformFeeType === "PERCENTAGE"
          ? percentage(b.coursePlatformFeeValue)
          : amount(b.coursePlatformFeeValue),
      holdingPeriodDays: b.holdingPeriodDays,
      minimumPayout: amount(b.minimumPayout),
    };
    const saved = await tx.platformSettings.update({
      where: { id: financeId },
      data,
    });
    await audit(tx, u.id, "FINANCE_SETTINGS_CHANGED", financeId, {
      previous: settingsView(previous),
      next: settingsView(saved),
    });
    return settingsView(saved);
  });
const commissionSuggestion = (req: Request) =>
  read(async (tx) => {
    await actor(tx, req, true);
    const type = String(req.params.type);
    if (!["book", "course"].includes(type)) {fail("Invalid product type.");}
    const r = await resolveCommission(
      tx,
      type as "book" | "course",
      String(req.params.id),
    );
    return {
      rate: r.commissionRate,
      source: r.source,
      approvedSource: r.product.commissionSource,
      instructorId: r.profile?.id ?? null,
    };
  });
const updateProductCommission = (req: Request) =>
  write(async (tx) => {
    const u = await actor(tx, req, true),
      type = String(req.params.type);
    if (!["book", "course"].includes(type)) {fail("Invalid product type.");}
    const id = String(req.params.id),
      r = await resolveCommission(tx, type as "book" | "course", id);
    const data =
      req.body.rate === null
        ? {
            commissionRate: null,
            commissionSource: null,
            commissionApprovedAt: null,
          }
        : await finalizeCommission(
            tx,
            type as "book" | "course",
            id,
            req.body.rate,
          );
    if (type === "book") {await tx.book.update({ where: { id }, data });}
    else {await tx.course.update({ where: { id }, data });}
    await audit(tx, u.id, "PRODUCT_COMMISSION_CHANGED", id, {
      previous: r.product.commissionRate,
      next: data.commissionRate,
    });
    return data;
  });
const instructors = (req: Request) =>
  read(async (tx) => {
    await actor(tx, req, true);
    await releaseMaturedEarnings(tx);
    const p = page(req),
      where = { deletedAt: null, status: "APPROVED" as const };
    const [rows, total] = await Promise.all([
      tx.instructorProfile.findMany({
        where,
        skip: p.skip,
        take: p.take,
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          bookCommissionRate: true,
          courseCommissionRate: true,
        },
      }),
      tx.instructorProfile.count({ where }),
    ]);
    return {
      rows: await Promise.all(
        rows.map(async (i) => ({
          ...i,
          balances: await balances(tx, i.userId),
        })),
      ),
      total,
      page: p.page,
      pageSize: p.pageSize,
    };
  });
const updateOverride = (req: Request) =>
  write(async (tx) => {
    const u = await actor(tx, req, true);
    const id = String(req.params.id),
      old = await tx.instructorProfile.findUniqueOrThrow({ where: { id } });
    const data = {
      bookCommissionRate:
        req.body.bookCommissionRate === null
          ? null
          : D(percentage(req.body.bookCommissionRate)),
      courseCommissionRate:
        req.body.courseCommissionRate === null
          ? null
          : D(percentage(req.body.courseCommissionRate)),
    };
    await tx.instructorProfile.update({ where: { id }, data });
    await audit(tx, u.id, "INSTRUCTOR_COMMISSION_CHANGED", id, {
      previous: {
        book: old.bookCommissionRate,
        course: old.courseCommissionRate,
      },
      next: data,
    });
    return data;
  });
function period(req: Request) {
  const end = req.query.to ? new Date(String(req.query.to)) : new Date(),
    start = req.query.from
      ? new Date(String(req.query.from))
      : new Date(end.getTime() - 30 * 86400000);
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    start > end ||
    end.getTime() - start.getTime() > 366 * 86400000
  )
    {fail("Choose a valid period of up to 366 days.");}
  return { start, end };
}
const overview = (req: Request) =>
  read(async (tx) => {
    await actor(tx, req, true);
    await releaseMaturedEarnings(tx);
    const { start, end } = period(req),
      where = { createdAt: { gte: start, lte: end } };
    const [groups, providerFees, balance, trend, legacy] = await Promise.all([
      tx.financialEntry.groupBy({
        by: ["kind", "productType"],
        where,
        _sum: {
          netSaleAmount: true,
          commissionAmount: true,
          platformFeeAmount: true,
          instructorEarning: true,
          platformRevenue: true,
        },
      }),
      tx.paymentTransaction.aggregate({
        where: {
          status: { in: ["SUCCEEDED", "REFUNDED"] },
          type: "PURCHASE",
          createdAt: { gte: start, lte: end },
          order: { financeSettledAt: { not: null } },
        },
        _sum: { providerFee: true },
        _count: { providerFee: true },
      }),
      balances(tx),
      tx.$queryRaw<
        Array<{
          day: string;
          grossSales: Prisma.Decimal;
          platformRevenue: Prisma.Decimal;
        }>
      >`SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD') AS day, SUM("netSaleAmount") AS "grossSales",SUM("platformRevenue") AS "platformRevenue" FROM financial_entries WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} GROUP BY day ORDER BY day`,
      tx.payout.aggregate({
        where: { workflowStatus: null, status: "PAID" },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);
    const sum = (
      key:
        | "netSaleAmount"
        | "commissionAmount"
        | "platformFeeAmount"
        | "instructorEarning"
        | "platformRevenue",
      kind?: string,
      type?: string,
    ) =>
      groups
        .filter(
          (g) =>
            (!kind || g.kind === kind) && (!type || g.productType === type),
        )
        .reduce((n, g) => n.plus(g._sum[key] ?? 0), D(0));
    const gateway = D(providerFees._sum.providerFee);
    return {
      period: { from: start, to: end },
      grossSales: sum("netSaleAmount", "SALE").toFixed(2),
      bookSales: sum("netSaleAmount", "SALE", "BOOK").toFixed(2),
      courseSales: sum("netSaleAmount", "SALE", "COURSE").toFixed(2),
      commissionRevenue: sum("commissionAmount", "SALE").toFixed(2),
      platformFeeRevenue: sum("platformFeeAmount", "SALE").toFixed(2),
      refundAmount: sum("netSaleAmount", "REFUND").abs().toFixed(2),
      refundRevenueImpact: sum("platformRevenue", "REFUND").abs().toFixed(2),
      grossPlatformRevenue: sum("platformRevenue", "SALE").toFixed(2),
      netPlatformRevenueBeforeUnknownCosts: sum("platformRevenue")
        .minus(gateway)
        .toFixed(2),
      knownGatewayCosts: gateway.toFixed(2),
      paymentsWithKnownGatewayCost: providerFees._count.providerFee,
      periodInstructorEarnings: sum("instructorEarning").toFixed(2),
      balances: balance,
      trend,
      legacyPaidPayouts: {
        count: legacy._count.id,
        amount: D(legacy._sum.amount).toFixed(2),
      },
    };
  });
/** Records an already executed FULL LINE refund; never initiates a gateway transfer. */
const refund = (req: Request) =>
  write(async (tx) => {
    const u = await actor(tx, req, true),
      itemId = String(req.params.id);
    const item = await tx.orderItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${item.orderId} FOR UPDATE`;
    const sale = await tx.financialEntry.findUnique({
      where: { orderItemId_kind: { orderItemId: itemId, kind: "SALE" } },
      include: { reversal: true },
    });
    if (!sale)
      {fail(
        "This sale has no ledger snapshot. Historical imports require reviewed original rules.",
      );}
    if (sale.reversal) {return { id: sale.reversal.id, alreadyRecorded: true };}
    const reference = text(req.body.refundReference, 120),
      note = text(req.body.note);
    if (!reference || note.length < 5)
      {fail("Actual refund reference and reason required.");}
    if (sale.instructorId) {
      await lockInstructor(tx, sale.instructorId);
      const related = await tx.payout.findMany({
        where: {
          workflowStatus: { in: ["REQUESTED", "APPROVED", "PROCESSING"] },
          items: { some: { earningId: sale.id } },
        },
      });
      if (related.some((p) => p.workflowStatus === "PROCESSING"))
        {fail(
          "Payout is processing. Confirm the transfer was stopped and cancel it, or record it paid, before recording this refund.",
        );}
      for (const p of related) {
        await tx.payout.update({
          where: { id: p.id },
          data: {
            workflowStatus: "CANCELLED",
            status: "FAILED",
            adminNote:
              "Automatically cancelled because a reserved sale was refunded.",
          },
        });
        await audit(tx, u.id, "PAYOUT_CANCELLED_FOR_REFUND", p.id, {
          orderItemId: itemId,
        });
      }
    }
    const entry = await tx.financialEntry.create({
      data: {
        kind: "REFUND",
        reversalOfId: sale.id,
        orderItemId: itemId,
        orderId: sale.orderId,
        paymentId: sale.paymentId,
        instructorId: sale.instructorId,
        productId: sale.productId,
        productType: sale.productType,
        productTitle: sale.productTitle,
        quantity: sale.quantity,
        currency: sale.currency,
        grossAmount: sale.grossAmount.negated(),
        discountAmount: sale.discountAmount.negated(),
        netSaleAmount: sale.netSaleAmount.negated(),
        commissionRate: sale.commissionRate,
        commissionSource: sale.commissionSource,
        commissionAmount: sale.commissionAmount.negated(),
        platformFeeType: sale.platformFeeType,
        platformFeeValue: sale.platformFeeValue,
        platformFeeAmount: sale.platformFeeAmount.negated(),
        instructorEarning: sale.instructorEarning.negated(),
        platformRevenue: sale.platformRevenue.negated(),
        holdingPeriodDays: sale.holdingPeriodDays,
        status: sale.status,
        availableAt: sale.availableAt,
        refundReference: reference,
        note,
      },
    });
    await tx.orderItem.update({
      where: { id: itemId },
      data: { status: "REFUNDED" },
    });
    if (item.courseId) {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: item.orderId },
      });
      await tx.enrollment.updateMany({
        where: { courseId: item.courseId, userId: order.userId },
        data: { status: "REFUNDED" },
      });
    }
    const remaining = await tx.orderItem.count({
      where: { orderId: item.orderId, status: { not: "REFUNDED" } },
    });
    if (remaining === 0) {
      await tx.order.update({
        where: { id: item.orderId },
        data: { status: "REFUNDED" },
      });
      await tx.paymentTransaction.update({
        where: { id: sale.paymentId },
        data: { status: "REFUNDED" },
      });
    }
    await audit(tx, u.id, "REFUND_RECORDED", entry.id, {
      saleId: sale.id,
      reference,
      netSaleAmount: sale.netSaleAmount,
      note,
    });
    return { id: entry.id };
  });
export const financeService = {
  myOverview,
  transactions,
  payouts,
  methods,
  saveMethod,
  requestPayout,
  payoutDetail,
  updatePayout,
  settings,
  updateSettings,
  commissionSuggestion,
  updateProductCommission,
  instructors,
  updateOverride,
  overview,
  refund,
};
