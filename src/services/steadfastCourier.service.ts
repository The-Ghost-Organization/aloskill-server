import { config } from '../config/env.js';

export type SteadfastDeliveryStatus =
  | 'in_review'
  | 'pending'
  | 'delivered_approval_pending'
  | 'partial_delivered_approval_pending'
  | 'cancelled_approval_pending'
  | 'unknown_approval_pending'
  | 'delivered'
  | 'partial_delivered'
  | 'cancelled'
  | 'hold'
  | 'unknown';

type CreateConsignmentInput = {
  invoice: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  codAmount: number;
  note?: string;
  itemDescription?: string;
  totalLot?: number;
};

type CreateConsignmentResponse = {
  status: number;
  message: string;
  consignment: {
    consignment_id: number | string;
    invoice: string;
    tracking_code: string;
    status: SteadfastDeliveryStatus;
  };
};

function assertConfigured(): void {
  if (!config.STEADFAST_API_KEY || !config.STEADFAST_SECRET_KEY) {
    throw new Error('Steadfast API credentials are not configured');
  }
}

function normalizeBangladeshiPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('880') ? `0${digits.slice(3)}` : digits;
  if (!/^01[3-9]\d{8}$/.test(normalized)) {
    throw new Error('Steadfast requires a valid 11-digit Bangladeshi mobile number');
  }
  return normalized;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertConfigured();
  const response = await fetch(`${config.STEADFAST_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Api-Key': config.STEADFAST_API_KEY,
      'Secret-Key': config.STEADFAST_SECRET_KEY,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Steadfast request failed (${response.status})`);
  }
  return body;
}

export async function createSteadfastConsignment(
  input: CreateConsignmentInput
): Promise<CreateConsignmentResponse['consignment']> {
  const result = await request<CreateConsignmentResponse>('/create_order', {
    method: 'POST',
    body: JSON.stringify({
      invoice: input.invoice,
      recipient_name: input.recipientName.slice(0, 100),
      recipient_phone: normalizeBangladeshiPhone(input.recipientPhone),
      recipient_address: input.recipientAddress.slice(0, 250),
      cod_amount: input.codAmount,
      note: input.note,
      item_description: input.itemDescription,
      total_lot: input.totalLot,
      delivery_type: 0,
    }),
  });
  if (result.status !== 200 || !result.consignment?.tracking_code) {
    throw new Error(result.message || 'Steadfast did not create the consignment');
  }
  return result.consignment;
}

export async function getSteadfastStatusByTrackingCode(
  trackingCode: string
): Promise<SteadfastDeliveryStatus> {
  const result = await request<{ status: number; delivery_status: SteadfastDeliveryStatus }>(
    `/status_by_trackingcode/${encodeURIComponent(trackingCode)}`
  );
  if (result.status !== 200 || !result.delivery_status) {
    throw new Error('Steadfast did not return a delivery status');
  }
  return result.delivery_status;
}
