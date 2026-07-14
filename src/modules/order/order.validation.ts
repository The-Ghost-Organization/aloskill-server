import { z } from 'zod';

export const CreateOrderWithEPS = z.object({
  body: z.object({
      sessionId: z.string().nullable(),
      paymentMethod: z.string(),
      shippingDetails: z
        .object({
          fullName: z.string(),
          phoneNumber: z.string(),
          addressLine: z.string(),
          city: z.string(),
          postalCode: z.string(),
        })
        .nullable(),
      amount: z.number().positive(),
    }),
});
