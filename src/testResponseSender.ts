// import type { Request, Response } from 'express';
// import ResponseHandler from './utils/response.js';
// import { asyncHandler } from './utils/asyncHandler.js';
// import { prisma } from './config/database.js';

// export const getUsers = asyncHandler(async (req: Request, res: Response) => {
//   // ✅ Clean and consistent
//   return ResponseHandler.ok(res, 'Users retrieved successfully', users);
// });

// export const getUserById = asyncHandler(async (req: Request, res: Response) => {
//   const user = await prisma.user.findUnique({
//     where: { id: req.params.id },
//       });

//   if (!user) {
//     // ✅ Proper error handling
//     return ResponseHandler.notFound(res, 'User not found');
//   }

//   return ResponseHandler.ok(res, 'User retrieved successfully', user);
// });

// export const createUser = asyncHandler(async (req: Request, res: Response) => {
//   const user = await prisma.user.create({
//     data: req.body,
//   });

//   // ✅ Correct status code for creation
//   return ResponseHandler.created(res, 'User created successfully', user);
// });

// export const getPaginatedUsers = asyncHandler(async (req: Request, res: Response) => {
//   const page = parseInt(req.query.page as string) || 1;
//   const limit = parseInt(req.query.limit as string) || 10;
//   const skip = (page - 1) * limit;

//   const [users, total] = await Promise.all([
//     prisma.user.findMany({ skip, take: limit }),
//     prisma.user.count(),
//   ]);

//   // ✅ Paginated response with metadata
//   return ResponseHandler.paginated(res, users, total, page, limit, 'Users retrieved successfully');
// });

// export const updateUser = asyncHandler(async (req: Request, res: Response) => {
//   const user = await prisma.user.update({
//     where: { id: req.params.id },
//     data: req.body,
//   });

//   return ResponseHandler.ok(res, 'User updated successfully', user);
// });

// export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
//   await prisma.user.delete({
//     where: { id: req.params.id },
//   });

//   return ResponseHandler.noContent(res, 'User deleted successfully');
// });
