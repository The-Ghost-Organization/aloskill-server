import { z } from 'zod';

export const CreateOrderWithUDDOKTAPAY = z.object({
  body: z.object({
    paymentMethod: z.enum(['CASH_ON_DELIVERY', 'ONLINE_PAYMENT']),
    shippingDetails: z
      .object({
        fullName: z.string().trim().min(1),
        phoneNumber: z
          .string()
          .trim()
          .regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number'),
        addressLine: z.string().trim().min(1),
        postalCode: z.string().trim().min(1),
        division: z.object({ id: z.string().min(1), name: z.string().min(1) }),
        district: z.object({ id: z.string().min(1), name: z.string().min(1) }),
        upazila: z.object({ id: z.string().min(1), name: z.string().min(1) }),
      })
      .strict()
      .nullable(),
    orderSummary: z
      .object({
        items: z.object({
          books: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              category: z.string().optional(),
              thumbnailUrl: z.string().optional(),
              weight: z.number(),
              physicalRegularPrice: z.number().nullable(),
              physicalSalePrice: z.number().nullable(),
              digitalRegularPrice: z.number().nullable(),
              digitalSalePrice: z.number().nullable(),
              hasDigital: z.boolean().optional(),
            })
          ),
          courses: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              category: z.string().optional(),
              discountPrice: z.number().optional(),
              originalPrice: z.number(),
              thumbnailUrl: z.string().optional(),
            })
          ),
        }),
        quantities: z.object({
          courses: z.array(
            z.object({
              courseId: z.string(),
              quantity: z.number().int().positive(),
            })
          ),
          books: z.array(
            z.object({
              bookId: z.string(),
              quantity: z.number().int().positive(),
              format: z.enum(['PHYSICAL', 'EBOOK']),
            })
          ),
        }),
        subtotal: z.number(),
      })
      .strict(),
  }),
});

export const CreateOrderWithEPS = z.object({
  body: z.object({
    paymentMethod: z.enum(['CASH_ON_DELIVERY', 'ONLINE_PAYMENT']),
    shippingDetails: z
      .object({
        fullName: z.string().trim().min(1),
        phoneNumber: z
          .string()
          .trim()
          .regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number'),
        addressLine: z.string().trim().min(1),
        postalCode: z.string().trim().min(1),
        division: z.object({ id: z.string().min(1), name: z.string().min(1) }),
        district: z.object({ id: z.string().min(1), name: z.string().min(1) }),
        upazila: z.object({ id: z.string().min(1), name: z.string().min(1) }),
      })
      .strict()
      .nullable(),
    orderSummary: z
      .object({
        items: z.object({
          books: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              category: z.string().optional(),
              thumbnailUrl: z.string().optional(),
              weight: z.number(),
              physicalRegularPrice: z.number().nullable(),
              physicalSalePrice: z.number().nullable(),
              digitalRegularPrice: z.number().nullable(),
              digitalSalePrice: z.number().nullable(),
              hasDigital: z.boolean().optional(),
            })
          ),
          courses: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              category: z.string().optional(),
              discountPrice: z.number().optional(),
              originalPrice: z.number(),
              thumbnailUrl: z.string().optional(),
            })
          ),
        }),
        quantities: z.object({
          courses: z.array(
            z.object({
              courseId: z.string(),
              quantity: z.number().int().positive(),
            })
          ),
          books: z.array(
            z.object({
              bookId: z.string(),
              quantity: z.number().int().positive(),
              format: z.enum(['PHYSICAL', 'EBOOK']),
            })
          ),
        }),
        subtotal: z.number(),
      })
      .strict(),
  }),
});

export const VerifyEPSPayment = z.object({
  body: z
    .object({
      merchantTransactionId: z.string().regex(/^\d{17}$/, 'Invalid EPS transaction ID'),
      expectedOutcome: z.enum(['success', 'fail', 'cancel']).default('success'),
    })
    .strict(),
});

export type UddoktapayPayload = z.infer<typeof CreateOrderWithUDDOKTAPAY>;
export type EPSPayload = z.infer<typeof CreateOrderWithEPS>;
