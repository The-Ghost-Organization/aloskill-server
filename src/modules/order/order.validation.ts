import { z } from 'zod';

export const CreateOrderWithUDDOKTAPAY = z.object({
  body: z.object({
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
      orderSummary: z
        .object({
          items: z.object({
            books: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                category: z.string().optional(),
                discountPrice: z.number().optional(),
                originalPrice: z.number(),
                thumbnailUrl: z.string().optional(),
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
                quantity: z.number(),
              })
            ),
            books: z.array(
              z.object({
                bookId: z.string(),
                quantity: z.number(),
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
