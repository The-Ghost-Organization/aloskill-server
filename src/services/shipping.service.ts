import { config } from '../config/env.js';
import { DeliveryArea } from '../generated/client.js';

type LocationInput = {
  districtId: string;
  upazilaId: string;
};

// IDs come from the Bangladesh location JSON used by the checkout UI.
const DHAKA_DISTRICT_ID = '1';
const TEJGAON_CIRCLE_UPAZILA_ID = '6';

export function getDeliveryArea(location: LocationInput): DeliveryArea {
  if (location.districtId !== DHAKA_DISTRICT_ID) {
    return DeliveryArea.OUTSIDE_DHAKA;
  }
  if (location.upazilaId === TEJGAON_CIRCLE_UPAZILA_ID) {
    return DeliveryArea.INSIDE_DHAKA;
  }
  return DeliveryArea.DHAKA_SUBURBAN;
}

export function calculateShippingCost(area: DeliveryArea, totalWeightKg: number): number {
  const baseRate = {
    [DeliveryArea.INSIDE_DHAKA]: config.SHIPPING_INSIDE_DHAKA,
    [DeliveryArea.DHAKA_SUBURBAN]: config.SHIPPING_DHAKA_SUBURBAN,
    [DeliveryArea.OUTSIDE_DHAKA]: config.SHIPPING_OUTSIDE_DHAKA,
  }[area];

  const extraWeightKg = Math.max(0, Math.ceil(totalWeightKg - config.SHIPPING_BASE_WEIGHT_KG));
  return baseRate + extraWeightKg * config.SHIPPING_EXTRA_PER_KG;
}
