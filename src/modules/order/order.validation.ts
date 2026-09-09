import { z } from 'zod';

export const CreateOrderWithUDDOKTAPAY = z.object({
  body: z.object({
    paymentMethod: z.enum(['CASH_ON_DELIVERY', 'ONLINE_PAYMENT']),
    shippingDetails: z
      .object({
        fullName: z.string().trim().min(1),
        phoneNumber: z.string().trim().min(1),
        addressLine: z.string().trim().min(1),
        city: z.string().trim().min(1),
        postalCode: z.string().trim().min(1),
        deliveryArea: z.enum(['INSIDE_DHAKA', 'OUTSIDE_DHAKA']),
      })
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

export type UddoktapayPayload = z.infer<typeof CreateOrderWithUDDOKTAPAY>;
