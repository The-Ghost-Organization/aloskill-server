import * as z from 'zod';

export const CreateBookSchema = z.object({
  body: z
    .object({
      title: z
        .string()
        .min(1, 'Book title is required')
        .regex(/^[^<>]*$/, 'Title must not contain any opening or closing HTML tags'),
      author: z
        .string()
        .min(1, 'Author name is required')
        .regex(/^[^<>]*$/, 'Author name must not contain any opening or closing HTML tags'),
      translator: z
        .string()
        .regex(/^[^<>]*$/, 'Translator name must not contain any opening or closing HTML tags')
        .optional(),
      editor: z
        .string()
        .regex(/^[^<>]*$/, 'Editor name must not contain any opening or closing HTML tags')
        .optional(),
      publisher: z
        .string()
        .min(1, 'Publisher is required')
        .regex(/^[^<>]*$/, 'Publisher name must not contain any opening or closing HTML tags'),
      publishYear: z
        .string()
        .min(1, 'Publish year is required')
        .regex(/^\d{4}$/, 'Must be a valid 4-digit year (e.g., 2024)')
        .refine(val => {
          const year = parseInt(val, 10);
          const currentYear = new Date().getFullYear();
          return year >= 1000 && year <= currentYear + 1;
        }, 'Year must be between 1000 and next year'),
      ratings: z
        .string()
        .min(1, 'Ratings is required')
        .max(5, 'Ratings cannot exceed 5')
        .regex(/^[^<>]*$/, 'Ratings must not contain any opening or closing HTML tags'),
      description: z
        .string()
        .min(10, 'Description must be at least 10 characters')
        .regex(/^[^<>]*$/, 'Description must not contain any opening or closing HTML tags'),

      physicalRegularPrice: z.coerce.number().min(0, 'Physical Regular Price cannot be negative'),
      physicalSalePrice: z.coerce
        .number()
        .min(0, 'Physical Sale Price cannot be negative')
        .optional(),
      digitalRegularPrice: z.coerce
        .number()
        .min(0, 'Digital Regular Price cannot be negative')
        .optional(),
      digitalSalePrice: z.coerce
        .number()
        .min(0, 'Digital Sale Price cannot be negative')
        .optional(),
      stock: z.coerce.number().int().min(0, 'Stock cannot be negative').optional(),

      isbn: z
        .string()
        .regex(/^[^<>]*$/, 'ISBN must not contain any opening or closing HTML tags')
        .optional(),
      edition: z
        .string()
        .regex(/^[^<>]*$/, 'Edition must not contain any opening or closing HTML tags')
        .optional(),
      pages: z.coerce
        .number()
        .int()
        .positive('Pages must not contain any negative numbers')
        .min(1, 'Pages is required'),
      weight: z.coerce.number().positive('Weight must not contain any negative numbers').optional(),
      language: z.string().min(1, 'Language is required'),

      category: z.string().min(1, 'Category is required'),
      formats: z.array(z.string()).min(1, 'Select at least one format'),
      status: z.enum(['APPROVED', 'PENDING', 'DRAFT']).default('PENDING'),

      metaKeywords: z
        .string()
        .regex(/^[^<>]*$/, 'Objectives must not contain any opening or closing HTML tags')
        .optional(),
      metaDescription: z
        .string()
        .regex(/^[^<>]*$/, 'Meta description must not contain any opening or closing HTML tags')
        .optional(),
      coverImageUrl: z.url('Cover Image url must be a valid URL'),
      files: z.array(
        z.object({
          name: z
            .string()
            .regex(/^[^<>]*$/, 'File names must not contain any opening or closing HTML tags'),
          url: z.url('File url must be a valid URL'),
          fileType: z.enum(['PREVIEW', 'EBOOK']),
        })
      ),
    })
    .refine(
      data => {
        if (data.formats.includes('E-Book') && !data.digitalRegularPrice) {
          return false;
        }
        return true;
      },
      {
        message: 'Digital Prices are required when E-Book format is selected',
        path: ['digitalRegularPrice'],
      }
    )
    .refine(
      data => {
        if (data.physicalSalePrice) {
          if (data.physicalRegularPrice < data.physicalSalePrice) {
            return false;
          }
          return true;
        }
        return true;
      },
      {
        message: 'HardCover Selling price cannot be higher than regular price',
        path: ['physicalSalePrice'],
      }
    )
    .refine(
      data => {
        if (data.formats.includes('E-Book')) {
          if (data.digitalSalePrice && data.digitalRegularPrice) {
            if (data.digitalRegularPrice < data.digitalSalePrice) {
              return false;
            }
            return true;
          }
        }
        return true;
      },
      {
        message: 'Ebook Selling price cannot be higher than regular price',
        path: ['digitalSalePrice'],
      }
    ),
});

export type UploadBookPayload = z.infer<typeof CreateBookSchema>;

export const CreateBookBodySchema = CreateBookSchema.shape.body;
export type CreateBookInput = z.infer<typeof CreateBookBodySchema>;
