/** Money is integer paisa; rates are integer basis points. No binary floats. */
export function scaled(value: unknown, places = 2): bigint {
  const raw = String(value ?? "").trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(raw))
    throw new Error(
      "Use a non-negative decimal with at most two decimal places.",
    );
  const [whole, fraction = ""] = raw.split(".");
  const result =
    BigInt(whole) * 10n ** BigInt(places) +
    BigInt(fraction.padEnd(places, "0"));
  if (result > 999999999999999n)
    throw new Error("Financial value is too large.");
  return result;
}
export function money(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const v = cents < 0n ? -cents : cents;
  return `${sign}${v / 100n}.${String(v % 100n).padStart(2, "0")}`;
}
export function rate(value: unknown): string {
  const n = scaled(value);
  if (n > 10000n) throw new Error("Percentage must be between 0 and 100.");
  return money(n);
}
export function splitSale(
  net: bigint,
  commission: unknown,
  feeType: string,
  feeValue: unknown,
  course: boolean,
) {
  const commissionAmount = (net * scaled(rate(commission)) + 5000n) / 10000n;
  let fee =
    !course || net === 0n || feeType === "NONE"
      ? 0n
      : feeType === "FIXED"
        ? scaled(feeValue)
        : (net * scaled(rate(feeValue)) + 5000n) / 10000n;
  // A fee can consume the remainder but never create negative sale earnings.
  if (fee > net - commissionAmount) fee = net - commissionAmount;
  return {
    commissionAmount,
    platformFeeAmount: fee,
    instructorEarning: net - commissionAmount - fee,
    platformRevenue: commissionAmount + fee,
  };
}
/** Largest remainder allocation preserves the exact paid product subtotal. Input order must be stable. */
export function allocateDiscount(
  lines: bigint[],
  paidSubtotal: bigint,
): bigint[] {
  const gross = lines.reduce((a, b) => a + b, 0n);
  if (paidSubtotal < 0n || paidSubtotal > gross)
    throw new Error(
      "Order product subtotal cannot be reconciled with line prices.",
    );
  if (gross === 0n) return lines.map(() => 0n);
  const result = lines.map((v) => (v * paidSubtotal) / gross);
  let remainder = paidSubtotal - result.reduce((a, b) => a + b, 0n);
  const ranked = lines
    .map((v, i) => ({ i, r: (v * paidSubtotal) % gross }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const row of ranked) {
    if (remainder === 0n) break;
    result[row.i]++;
    remainder--;
  }
  return result;
}
export const ACTIVE_PAYOUTS = [
  "REQUESTED",
  "APPROVED",
  "PROCESSING",
  "PAID",
] as const;
export function canTransition(from: string, to: string): boolean {
  return (
    (
      {
        REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
        APPROVED: ["PROCESSING", "REJECTED", "CANCELLED"],
        PROCESSING: ["PAID", "CANCELLED"],
      } as Record<string, string[]>
    )[from]?.includes(to) ?? false
  );
}
