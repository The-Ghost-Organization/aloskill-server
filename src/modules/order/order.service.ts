/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { config } from '../../config/env.js';
import {
  ApplicationStatus,
  EnrollmentStatus,
  OrderStatus,
  PaymentProviders,
  TransactionStatus,
  TransactionType,
} from '../../generated/client.js';
import { decryptPhoneNumber } from '../../utils/phoneNumber.js';

const createPayment = async (req: Request) => {
  const { courseIds, paymentMethod, user } = req.body;

  if (!user) {
    throw new Error('Unauthorized');
  }
  if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
    throw new Error('No order IDs provided');
  }

  const createOrder = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      const userData = await tx.user.findUnique({
        where: {
          id: user,
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          studentProfile: {
            select: {
              encryptedPhone: true,
            },
          },
          instructorProfile: {
            where: {
              deletedAt: null,
              status: ApplicationStatus.APPROVED,
            },
            select: {
              encryptedPhone: true,
              city: true,
              address: true,
            },
          },
        },
      });

      if (!userData) {
        throw new Error('User not found');
      }
      if (!userData.studentProfile && !userData.instructorProfile) {
        throw new Error('User profile not found');
      }
      const encryptedStudentPhone = userData.studentProfile
        ? userData.studentProfile.encryptedPhone
        : '';
      const encryptedInstructorPhone = userData.instructorProfile
        ? userData.instructorProfile.encryptedPhone
        : '';

      const phoneNumber = decryptPhoneNumber(encryptedStudentPhone || encryptedInstructorPhone);

      const courses = await tx.course.findMany({
        where: { id: { in: courseIds }, deletedAt: null },
        select: { id: true, originalPrice: true, discountPrice: true, isDiscountActive: true },
      });

      if (courses.length !== courseIds.length) {
        throw new Error('One or more courses not found');
      }

      let total = 0;
      const orderItemsData = courses.map(course => {
        const price =
          course.isDiscountActive && course.discountPrice
            ? course.discountPrice
            : course.originalPrice;
        total += Number(price);
        return {
          courseId: course.id,
          price,
        };
      });

      return {
        ...userData,
        phoneNumber,
        orderData: await tx.order.create({
          data: {
            userId: userData.id,
            totalAmount: total,
            status: OrderStatus.PENDING,
            provider: PaymentProviders.SSLCommerce,
            orderItems: {
              create: orderItemsData,
            },
          },
          select: {
            id: true,
            totalAmount: true,
            orderItems: {
              select: {
                course: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
        }),
      };
    });
  });
  if (!createOrder.id) {
    throw new Error('Failed to create order');
  }
  if (!createOrder.id) {
    throw new Error('Failed to create order');
  }
  const orderId = createOrder.orderData.id;
  const amount = createOrder.orderData.totalAmount.toString();
  const userPhone = createOrder.phoneNumber;
  const userEmail = createOrder.email;

  try {
    const url = 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';
    const payload = new URLSearchParams({
      store_id: config.SSLCOMMERCE_STORE_ID,
      store_passwd: config.SSLCOMMERCE_STORE_PASSWORD,
      total_amount: amount,
      currency: 'BDT',
      tran_id: orderId,
      success_url: `${config.FRONTEND_URL}/`,
      fail_url: `${config.FRONTEND_URL}/payment/fail`,
      cancel_url: `${config.FRONTEND_URL}/payment/cancel`,
      ipn_url: `${config.IPN_VALIDATION_URL}`,
      // ipn_url: `https://aloskill-backend-production.up.railway.app/api/v1/order/validate-ipn`,
      // ipn_url: `https://fortunate-kindness-production.up.railway.app/api/v1/order/validate-ipn`,
      ...(paymentMethod ? { multi_card_name: paymentMethod } : {}),
      cus_email: userEmail,
      cus_phone: userPhone,
      cus_add1: createOrder.instructorProfile ? createOrder.instructorProfile.address : 'N/A',
      cus_city: createOrder.instructorProfile ? createOrder.instructorProfile.city : 'Dhaka',
      cus_country: 'Bangladesh',

      shipping_method: 'NO',

      product_name: createOrder.orderData.orderItems.map(item => item.course?.title).join(', '),
      product_category: 'Online Course',
      product_profile: 'non-physical-goods',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });
    if (!response.ok) {
      throw new Error('Failed to create payment');
    }
    const data = (await response.json()) as { GatewayPageURL: string };
    return {
      gatewayPageURL: data.GatewayPageURL,
      orderId,
    };
  } catch (_error: unknown) {
    throw new Error('Failed to create payment');
  }
};

const validateIPN = async (req: Request) => {
  // const { tran_id, val_id } = await req.body;
  console.log('IPN req data from ssl : ', await req.body);
  const bodyData = req.body as {
    val_id: string;
    status: string;
  };

  if (!bodyData.val_id) {
    throw new Error('Invalid IPN data');
  }

  if (bodyData.status !== 'VALID') {
    const updateOrderStatus = await executeDbOperation(async prisma => {
      return await prisma.$transaction(async tx => {
        const updatedOrder = await tx.order.update({
          where: { id: bodyData.val_id },
          data: {
            status: bodyData.status === 'FAILED' ? OrderStatus.FAILED : OrderStatus.CANCELLED,
          },
        });

        await tx.paymentTransaction.create({
          data: {
            userId: updatedOrder.userId,
            orderId: updatedOrder.id,
            amount: updatedOrder.totalAmount,
            provider: PaymentProviders.SSLCommerce,
            providerPaymentId: bodyData.val_id,
            status: TransactionStatus.FAILED,
            type: TransactionType.PURCHASE,
            // Optional: you could add a 'notes' field to your schema to store the failure reason
          },
        });
      });
    });
    console.log('Update Order Status for failed/cancelled: ', updateOrderStatus);
    return;
  }

  const verifyTxn = await fetch(
    `https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php?val_id=${bodyData.val_id}&store_id=${config.SSLCOMMERCE_STORE_ID}&store_passwd=${config.SSLCOMMERCE_STORE_PASSWORD}&format=json`
  );

  if (!verifyTxn.ok) {
    throw new Error('Failed to verify transaction');
  }
  const verifyData = await verifyTxn.json();
  console.log('IPN verify data from ssl : ', verifyData);

  const { status, tran_id, val_id, amount, store_amount } = verifyData as {
    status: string;
    tran_id: string;
    val_id: string;
    amount: number;
    store_amount: number;
  };

  const updateOrderStatus = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      if (status === 'VALID' || status === 'VALIDATED') {
        const order = await tx.order.findUnique({
          where: { id: tran_id },
          include: { orderItems: true, user: true },
        });
        if (!order) {
          throw new Error('Order not found');
        }
        if (order.status === 'PAID') {
          throw new Error('Order already paid');
        }

        await tx.order.update({
          where: { id: tran_id },
          data: {
            status: OrderStatus.PAID,
            providerOrderId: val_id,
          },
        });
        // need to update payment method in schema
        // payment method update properly
        // payment method transction id update properly
        await tx.paymentTransaction.create({
          data: {
            userId: order.userId,
            orderId: order.id,
            amount: order.totalAmount,
            provider: PaymentProviders.SSLCommerce,
            providerPaymentId: val_id,
            providerFee: amount - store_amount,
            status: TransactionStatus.SUCCEEDED,
            type: TransactionType.PURCHASE,
          },
        });

        // need to update originalPriceAtTime properly
        // need to update discount at time properly
        for (const item of order.orderItems) {
          await tx.enrollment.create({
            data: {
              userId: order.userId,
              courseId: item.courseId as string,
              pricePaid: amount,
              originalPriceAtTime: item.price,
              status: EnrollmentStatus.ACTIVE,
            },
          });

          const course = await tx.course.update({
            where: { id: item.courseId as string },
            data: {
              enrollmentCount: { increment: 1 },
              totalRevenueAmount: { increment: store_amount },
            },
          });
          if (course.createdById) {
            await tx.instructorProfile.update({
              where: { id: course.createdById },
              data: {
                totalStudents: { increment: 1 },
                totalRevenueAmount: { increment: store_amount },
              },
            });
          }

          await tx.wishlist.deleteMany({
            where: { userId: order.userId, courseId: item.courseId },
          });
        }
      }
    });
  });

  console.log('Update Order Status: ', updateOrderStatus);
};

export const orderService = {
  createPayment,
  validateIPN,
};
