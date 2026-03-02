import * as z from "zod";

export const CreateBookSchema = z.object({
  body: z
  .object({
    title: z
      .string()
      .min(1, "Book title is required")
      .regex(/^[^<>]*$/, "Title must not contain any opening or closing HTML tags"),
    author: z
      .string()
      .min(1, "Author name is required")
      .regex(/^[^<>]*$/, "Author name must not contain any opening or closing HTML tags"),
    translator: z
      .string()
      .regex(/^[^<>]*$/, "Translator name must not contain any opening or closing HTML tags")
      .optional(),
    editor: z
      .string()
      .regex(/^[^<>]*$/, "Editor name must not contain any opening or closing HTML tags")
      .optional(),
    publisher: z
      .string()
      .min(1, "Publisher is required")
      .regex(/^[^<>]*$/, "Publisher name must not contain any opening or closing HTML tags"),
    description: z
      .string()
      .min(10, "Description must be at least 10 characters")
      .regex(/^[^<>]*$/, "Description must not contain any opening or closing HTML tags"),

    regularPrice: z.coerce.number().min(0, "Price cannot be negative"),
    salePrice: z.coerce.number().min(0, "Price cannot be negative"),
    stock: z.coerce.number().int().min(0, "Stock cannot be negative"),

    isbn: z
      .string()
      .regex(/^[^<>]*$/, "ISBN must not contain any opening or closing HTML tags")
      .optional(),
    edition: z
      .string()
      .regex(/^[^<>]*$/, "Edition must not contain any opening or closing HTML tags")
      .optional(),
    pages: z.coerce
      .number()
      .int()
      .positive("Pages must not contain any negative numbers")
      .optional(),
    language: z.string().min(1, "Language is required"),
    status: z.enum(["APPROVED", "PENDING", "DRAFT"]).default("PENDING"),

    category: z.string().min(1, "Category is required"),
    formats: z.array(z.string()).min(1, "Select at least one format"),

    metaKeywords: z
      .string()
      .regex(/^[^<>]*$/, "Objectives must not contain any opening or closing HTML tags")
      .optional(),
    metaDescription: z
      .string()
      .regex(/^[^<>]*$/, "Meta description must not contain any opening or closing HTML tags")
      .optional(),
    coverImageUrl: z.url("Cover Image url must be a valid URL"),
    files: z.array(
      z.object({
        name: z
          .string()
          .regex(/^[^<>]*$/, "File names must not contain any opening or closing HTML tags"),
        url: z.url("File url must be a valid URL"),
        fileType: z.enum(["PREVIEW", "EBOOK"]),
      })
    ),
  })
  .refine(
    data => {
      if (data.formats.includes("E-Book") && !data.files.find(f => f.fileType === "EBOOK")) {
        return false;
      }
      return true;
    },
    {
      message: "E-Book PDF file is required when E-Book format is selected",
      path: ["files"],
    }
  )
  .refine(
    data => {
      if (data.regularPrice < data.salePrice) {
        return false;
      }
      return true;
    },
    {
      message: "Selling price cannot be higher than regular price",
      path: ["salePrice"],
    }
  )
});

  export type UploadBookPayload = z.infer<typeof CreateBookSchema>;
