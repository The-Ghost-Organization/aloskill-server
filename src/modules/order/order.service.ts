/* eslint-disable require-await */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { EPS, generateTransactionId } from 'eps-gateway-nodejs';
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { config } from '../../config/env.js';

import {
  ApplicationStatus,
  Courier,
  EnrollmentStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentMethod,
  PaymentProviders,
  PurchaseFormat,
  TransactionStatus,
  TransactionType,
} from '../../generated/client.js';
import { calculateShippingCost, getDeliveryArea } from '../../services/shipping.service.js';
import {
  createSteadfastConsignment,
  getSteadfastStatusByTrackingCode,
  type SteadfastDeliveryStatus,
} from '../../services/steadfastCourier.service.js';
import { decryptPhoneNumber } from '../../utils/phoneNumber.js';
import type { EPSPayload, UddoktapayPayload } from './order.validation.js';

const courierOrderStatus: Partial<Record<SteadfastDeliveryStatus, OrderStatus>> = {
  in_review: OrderStatus.PROCESSING,
  pending: OrderStatus.SHIPPED,
  delivered_approval_pending: OrderStatus.OUT_FOR_DELIVERY,
  partial_delivered_approval_pending: OrderStatus.OUT_FOR_DELIVERY,
  cancelled_approval_pending: OrderStatus.CANCELLED,
  delivered: OrderStatus.DELIVERED,
  partial_delivered: OrderStatus.DELIVERED,
  cancelled: OrderStatus.CANCELLED,
  hold: OrderStatus.PROCESSING,
};

const createCourierConsignmentForOrder = async (orderId: string) => {
  const order = await executeDbOperation(prisma =>
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        shippingAddress: true,
        orderItems: {
          where: { format: PurchaseFormat.PHYSICAL },
          include: { book: { select: { title: true } } },
        },
      },
    })
  );

  if (!order || order.orderItems.length === 0 || !order.shippingAddress) {
    return null;
  }
  if (order.courierTrackingCode) {
    return order.courierTrackingCode;
  }
  if (order.paymentMethod !== PaymentMethod.CASH_ON_DELIVERY && order.status !== OrderStatus.PAID) {
    return null;
  }

  const claim = await executeDbOperation(prisma =>
    prisma.order.updateMany({
      where: {
        id: order.id,
        courierTrackingCode: null,
        OR: [{ courierStatus: null }, { courierStatus: { not: 'creating' } }],
      },
      data: { courierStatus: 'creating', courierLastError: null },
    })
  );
  if (claim.count !== 1) {
    return null;
  }

  try {
    const itemDescription = order.orderItems
      .map(item => `${item.book?.title ?? 'Book'} x${item.quantity}`)
      .join(', ');
    const address = order.shippingAddress;
    const consignment = await createSteadfastConsignment({
      invoice: order.id,
      recipientName: address.fullName,
      recipientPhone: address.phone,
      recipientAddress: `${address.addressLine}, ${address.city} ${address.postalCode}`,
      codAmount:
        order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? Number(order.totalAmount) : 0,
      note: `Aloskill order ${order.id}`,
      itemDescription,
      totalLot: order.orderItems.reduce((sum, item) => sum + item.quantity, 0),
    });

    await executeDbOperation(prisma =>
      prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            courierName: Courier.STEADFAST,
            courierConsignmentId: String(consignment.consignment_id),
            courierTrackingCode: consignment.tracking_code,
            courierStatus: consignment.status,
            courierStatusUpdatedAt: new Date(),
            courierLastError: null,
            status: courierOrderStatus[consignment.status] ?? OrderStatus.PROCESSING,
          },
        }),
        prisma.orderItem.updateMany({
          where: { orderId: order.id, format: PurchaseFormat.PHYSICAL },
          data: {
            courierName: Courier.STEADFAST,
            trackingNumber: consignment.tracking_code,
            status: OrderItemStatus.SHIPPED,
            shippedAt: new Date(),
          },
        }),
      ])
    );
    return consignment.tracking_code;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Steadfast error';
    await executeDbOperation(prisma =>
      prisma.order.update({
        where: { id: order.id },
        data: { courierStatus: 'creation_failed', courierLastError: message },
      })
    );
    return null;
  }
};

const releasePhysicalStockForFailedOrder = async (orderId: string) => {
  await executeDbOperation(prisma =>
    prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { orderItems: { where: { format: PurchaseFormat.PHYSICAL } } },
      });
      if (!order || order.status !== OrderStatus.PENDING) {
        return;
      }
      for (const item of order.orderItems) {
        if (item.bookId) {
          await tx.book.update({
            where: { id: item.bookId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED, stockReservationExpiresAt: null },
      });
    })
  );
};

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

// for uddoktapay payment gateway Start

const createOrderWithUDDOKTAPAY = async (req: Request) => {
  console.log('hit the uddoktapay');
  const data = req.body as UddoktapayPayload['body'];
  const user = req.user;
  const shippingDetails = data.shippingDetails;
  const isCashOnDelivery = data.paymentMethod === 'CASH_ON_DELIVERY';

  if (!user.email) {
    throw new Error('Unauthorized');
  }

  if (!data.orderSummary) {
    throw new Error('Invalid order summary');
  }

  const createOrder = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      // 1. Verify User
      const userData = await tx.user.findUnique({
        where: {
          email: user.email,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          studentProfile: {
            select: {
              displayName: true,
            },
          },
          instructorProfile: {
            where: {
              deletedAt: null,
              status: 'APPROVED',
            },
            select: {
              displayName: true,
            },
          },
        },
      });

      if (!userData) {
        throw new Error('User not found');
      }

      // Safe fallbacks for items and quantities arrays
      const sessionCourses = data.orderSummary.items.courses;
      const sessionBooks = data.orderSummary.items.books;
      const bookQuantities = data.orderSummary.quantities.books;

      // 2. Fetch courses and books from Database
      const dbCourses = await tx.course.findMany({
        where: {
          id: { in: sessionCourses.map(c => c.id) },
          deletedAt: null,
          status: 'PUBLISHED',
        },
        select: { id: true, originalPrice: true, discountPrice: true, isDiscountActive: true },
      });

      const dbBooks = await tx.book.findMany({
        where: {
          id: { in: sessionBooks.map(b => b.id) },
          deletedAt: null,
          status: 'APPROVED',
        },
        select: {
          id: true,
          physicalRegularPrice: true,
          physicalSalePrice: true,
          digitalRegularPrice: true,
          digitalSalePrice: true,
          weight: true,
          stock: true,
        },
      });

      if (dbCourses.length !== sessionCourses.length) {
        throw new Error('One or more courses not found');
      }
      if (dbBooks.length !== sessionBooks.length) {
        throw new Error('One or more books not found');
      }

      let subtotal = 0;
      let totalWeight = 0;
      const orderItemsData = [];

      // 3. Process Course Prices
      for (const course of dbCourses) {
        const price =
          course.isDiscountActive && course.discountPrice
            ? course.discountPrice
            : course.originalPrice;

        subtotal += Number(price);
        orderItemsData.push({
          courseId: course.id,
          format: PurchaseFormat.DIGITAL,
          price,
          quantity: 1,
        });
      }

      // 4. Process Book Prices with Correct Format Extraction
      let hasPhysicalItems = false;

      for (const bookItem of sessionBooks) {
        const dbBook = dbBooks.find(b => b.id === bookItem.id);
        if (!dbBook) {
          throw new Error('System mismatch fetching book data');
        }

        // Look up the exact format for this specific book from quantities mapping
        const quantityMeta = bookQuantities.find(q => q.bookId === bookItem.id);

        // Determine format safely (fall back to EBOOK/DIGITAL if metadata missing)
        const isPhysical = quantityMeta?.format === 'PHYSICAL';
        const quantity = quantityMeta?.quantity ?? 1;
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw new Error(`Invalid quantity for book: ${bookItem.id}`);
        }
        if (isPhysical) {
          hasPhysicalItems = true;
          // Atomic stock checkpoint. The transaction rolls back every earlier
          // decrement if any physical book cannot satisfy its requested quantity.
          const stockUpdate = await tx.book.updateMany({
            where: { id: dbBook.id, stock: { gte: quantity } },
            data: { stock: { decrement: quantity } },
          });
          if (stockUpdate.count !== 1) {
            throw new Error(
              `Insufficient stock for ${bookItem.title}. Requested ${quantity}, available ${dbBook.stock}.`
            );
          }
        }

        let price = 0;
        if (isPhysical) {
          const decimalPrice = dbBook.physicalSalePrice ?? dbBook.physicalRegularPrice ?? 0;
          price = Number(decimalPrice);
        } else {
          const decimalPrice = dbBook.digitalSalePrice ?? dbBook.digitalRegularPrice ?? 0;
          price = Number(decimalPrice);
        }

        subtotal += price * quantity;
        if (isPhysical) {
          totalWeight += Number(dbBook.weight) * quantity;
        }
        orderItemsData.push({
          bookId: dbBook.id,
          format: isPhysical ? PurchaseFormat.PHYSICAL : PurchaseFormat.DIGITAL,
          price: price * quantity,
          quantity,
        });
      }

      if (hasPhysicalItems && !shippingDetails) {
        throw new Error('Shipping details are required for physical books');
      }
      if (isCashOnDelivery && !hasPhysicalItems) {
        throw new Error('Cash on Delivery is available only for physical books');
      }

      const deliveryArea = shippingDetails
        ? getDeliveryArea({
            districtId: shippingDetails.district.id,
            upazilaId: shippingDetails.upazila.id,
          })
        : null;
      const shippingCost =
        hasPhysicalItems && deliveryArea ? calculateShippingCost(deliveryArea, totalWeight) : 0;
      const total = subtotal + shippingCost;

      // 5. Build dynamic shipping address relation
      let shippingAddressId: string | null = null;

      if (shippingDetails && hasPhysicalItems) {
        const address = await tx.shippingAddress.create({
          data: {
            fullName: shippingDetails.fullName,
            addressLine: shippingDetails.addressLine,
            city: `${shippingDetails.upazila.name}, ${shippingDetails.district.name}, ${shippingDetails.division.name}`,
            postalCode: shippingDetails.postalCode,
            phone: shippingDetails.phoneNumber,
            country: 'Bangladesh',
            deliveryArea,
          },
          select: { id: true },
        });
        shippingAddressId = address.id;
      }

      const orderPayload: any = {
        userId: userData.id,
        totalAmount: total,
        status: 'PENDING',
        provider: 'UDDOKTAPAY',
        paymentMethod: isCashOnDelivery
          ? PaymentMethod.CASH_ON_DELIVERY
          : PaymentMethod.ONLINE_PAYMENT,
        shippingCost,
        totalWeight,
        stockReservationExpiresAt: isCashOnDelivery ? null : new Date(Date.now() + 15 * 60 * 1000),
        orderItems: {
          create: orderItemsData,
        },
      };

      if (isCashOnDelivery) {
        orderPayload.provider = PaymentProviders.CASH_ON_DELIVERY;
      }

      if (shippingAddressId) {
        orderPayload.shippingAddressId = shippingAddressId;
      }

      // 6. Generate final order record
      return {
        ...userData,
        orderData: await tx.order.create({
          data: orderPayload,
          select: {
            id: true,
            totalAmount: true,
            orderItems: {
              select: {
                format: true,
                price: true,
                course: { select: { title: true } },
                book: { select: { title: true } },
              },
            },
            shippingAddress: true,
          },
        }),
      };
    });
  });

  if (!createOrder.orderData.id) {
    throw new Error('Order Creation Failed');
  }

  if (isCashOnDelivery) {
    const trackingCode = await createCourierConsignmentForOrder(createOrder.orderData.id);
    return {
      orderId: createOrder.orderData.id,
      paymentType: 'CASH_ON_DELIVERY' as const,
      courierSubmitted: Boolean(trackingCode),
      trackingCode,
    };
  }

  let payWithUddoktaPay: Response;
  try {
    payWithUddoktaPay = await fetch(`${config.UDDOKTAPAY_URL}/checkout-v2`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'RT-UDDOKTAPAY-API-KEY': config.UDDOKTPAY_CHECKOUT_API,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        full_name:
          createOrder.studentProfile?.displayName ??
          createOrder.instructorProfile?.displayName ??
          'N/A',
        email: createOrder.email,
        amount: String(createOrder.orderData.totalAmount),
        metadata: { user_id: createOrder.id, order_id: createOrder.orderData.id },
        return_type: 'GET',
        redirect_url: `${config.FRONTEND_URL}/success`,
        cancel_url: `${config.FRONTEND_URL}/cancel`,
        ...(config.UDDOKTAPAY_WEBHOOK_URL ? { webhook_url: config.UDDOKTAPAY_WEBHOOK_URL } : {}),
      }),
    });
  } catch (error) {
    await releasePhysicalStockForFailedOrder(createOrder.orderData.id);
    throw error;
  }

  const uddoktaPayData = (await payWithUddoktaPay.json()) as {
    status?: boolean | string;
    message?: string;
    payment_url?: string;
    errors?: Record<string, string[]>;
  };

  if (!payWithUddoktaPay.ok || !uddoktaPayData.payment_url) {
    console.error('UddoktaPay Error Log:', {
      httpStatus: payWithUddoktaPay.status,
      message: uddoktaPayData.message ?? 'No payment URL returned',
      validationErrors: uddoktaPayData.errors ?? null,
      fullResponse: uddoktaPayData,
    });

    await releasePhysicalStockForFailedOrder(createOrder.orderData.id);
    throw new Error(uddoktaPayData.message ?? 'Failed to initiate payment with UddoktaPay');
  }

  return {
    gatewayUrl: uddoktaPayData.payment_url,
    orderId: createOrder.orderData.id,
    paymentType: 'ONLINE_PAYMENT' as const,
  };
};

const verifyPayment = async (req: Request) => {
  const invoice_id = String(req.query.invoice_id ?? req.body?.invoice_id ?? '');

  if (!invoice_id) {
    throw new Error('Invalid request data');
  }

  const verifyPaymentWithUddoktapay = await fetch(config.UDDOKTAPAY_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'RT-UDDOKTAPAY-API-KEY': config.UDDOKTPAY_VERIFY_API,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ invoice_id }),
  });

  const uddoktaPayData = (await verifyPaymentWithUddoktapay.json()) as {
    status: 'COMPLETED' | 'PENDING' | 'FAILED';
    metadata?: { order_id?: string };
    transaction_id?: string;
  };

  const orderId = uddoktaPayData.metadata?.order_id;
  if (uddoktaPayData.status === 'COMPLETED' && orderId) {
    await executeDbOperation(prisma =>
      prisma.order.updateMany({
        where: { id: orderId, status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] } },
        data: {
          status: OrderStatus.PAID,
          providerOrderId: uddoktaPayData.transaction_id ?? invoice_id,
          stockReservationExpiresAt: null,
        },
      })
    );
    await createCourierConsignmentForOrder(orderId);
  }

  return { orderStatus: uddoktaPayData.status, orderId: orderId ?? null };
};

// for uddoktapay payment gateway End

// for EPS payment system Start

const createOrderWithEPS = async (req: Request) => {
  console.log('hit the EPS');
  const data = req.body as EPSPayload['body'];
  const user = req.user;
  const shippingDetails = data.shippingDetails;
  const isCashOnDelivery = data.paymentMethod === 'CASH_ON_DELIVERY';

  if (!user.email) {
    throw new Error('Unauthorized');
  }

  if (!data.orderSummary) {
    throw new Error('Invalid order summary');
  }

  const createOrder = await executeDbOperation(async prisma => {
    return await prisma.$transaction(async tx => {
      // 1. Verify User
      const userData = await tx.user.findUnique({
        where: {
          email: user.email,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          studentProfile: {
            select: {
              displayName: true,
              encryptedPhone: true,
            },
          },
          instructorProfile: {
            where: {
              deletedAt: null,
              status: 'APPROVED',
            },
            select: {
              displayName: true,
              encryptedPhone: true,
            },
          },
        },
      });

      if (!userData) {
        throw new Error('User not found');
      }

      // Safe fallbacks for items and quantities arrays
      const sessionCourses = data.orderSummary.items.courses;
      const sessionBooks = data.orderSummary.items.books;
      const bookQuantities = data.orderSummary.quantities.books;

      // 2. Fetch courses and books from Database
      const dbCourses = await tx.course.findMany({
        where: {
          id: { in: sessionCourses.map(c => c.id) },
          deletedAt: null,
          status: 'PUBLISHED',
        },
        select: { id: true, originalPrice: true, discountPrice: true, isDiscountActive: true },
      });

      const dbBooks = await tx.book.findMany({
        where: {
          id: { in: sessionBooks.map(b => b.id) },
          deletedAt: null,
          status: 'APPROVED',
        },
        select: {
          id: true,
          physicalRegularPrice: true,
          physicalSalePrice: true,
          digitalRegularPrice: true,
          digitalSalePrice: true,
          weight: true,
          stock: true,
        },
      });

      if (dbCourses.length !== sessionCourses.length) {
        throw new Error('One or more courses not found');
      }
      if (dbBooks.length !== sessionBooks.length) {
        throw new Error('One or more books not found');
      }

      let subtotal = 0;
      let totalWeight = 0;
      const orderItemsData = [];

      // 3. Process Course Prices
      for (const course of dbCourses) {
        const price =
          course.isDiscountActive && course.discountPrice
            ? course.discountPrice
            : course.originalPrice;

        subtotal += Number(price);
        orderItemsData.push({
          courseId: course.id,
          format: PurchaseFormat.DIGITAL,
          price,
          quantity: 1,
        });
      }

      // 4. Process Book Prices with Correct Format Extraction
      let hasPhysicalItems = false;

      for (const bookItem of sessionBooks) {
        const dbBook = dbBooks.find(b => b.id === bookItem.id);
        if (!dbBook) {
          throw new Error('System mismatch fetching book data');
        }

        // Look up the exact format for this specific book from quantities mapping
        const quantityMeta = bookQuantities.find(q => q.bookId === bookItem.id);

        // Determine format safely (fall back to EBOOK/DIGITAL if metadata missing)
        const isPhysical = quantityMeta?.format === 'PHYSICAL';
        const quantity = quantityMeta?.quantity ?? 1;
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw new Error(`Invalid quantity for book: ${bookItem.id}`);
        }
        if (isPhysical) {
          hasPhysicalItems = true;
          // Atomic stock checkpoint. The transaction rolls back every earlier
          // decrement if any physical book cannot satisfy its requested quantity.
          const stockUpdate = await tx.book.updateMany({
            where: { id: dbBook.id, stock: { gte: quantity } },
            data: { stock: { decrement: quantity } },
          });
          if (stockUpdate.count !== 1) {
            throw new Error(
              `Insufficient stock for ${bookItem.title}. Requested ${quantity}, available ${dbBook.stock}.`
            );
          }
        }

        let price = 0;
        if (isPhysical) {
          const decimalPrice = dbBook.physicalSalePrice ?? dbBook.physicalRegularPrice ?? 0;
          price = Number(decimalPrice);
        } else {
          const decimalPrice = dbBook.digitalSalePrice ?? dbBook.digitalRegularPrice ?? 0;
          price = Number(decimalPrice);
        }

        subtotal += price * quantity;
        if (isPhysical) {
          totalWeight += Number(dbBook.weight) * quantity;
        }
        orderItemsData.push({
          bookId: dbBook.id,
          format: isPhysical ? PurchaseFormat.PHYSICAL : PurchaseFormat.DIGITAL,
          price: price * quantity,
          quantity,
        });
      }

      if (hasPhysicalItems && !shippingDetails) {
        throw new Error('Shipping details are required for physical books');
      }
      if (isCashOnDelivery && !hasPhysicalItems) {
        throw new Error('Cash on Delivery is available only for physical books');
      }

      const deliveryArea = shippingDetails
        ? getDeliveryArea({
            districtId: shippingDetails.district.id,
            upazilaId: shippingDetails.upazila.id,
          })
        : null;
      const shippingCost =
        hasPhysicalItems && deliveryArea ? calculateShippingCost(deliveryArea, totalWeight) : 0;
      const total = subtotal + shippingCost;

      // 5. Build dynamic shipping address relation
      let shippingAddressId: string | null = null;

      if (shippingDetails && hasPhysicalItems) {
        const address = await tx.shippingAddress.create({
          data: {
            fullName: shippingDetails.fullName,
            addressLine: shippingDetails.addressLine,
            city: `${shippingDetails.upazila.name}, ${shippingDetails.district.name}, ${shippingDetails.division.name}`,
            postalCode: shippingDetails.postalCode,
            phone: shippingDetails.phoneNumber,
            country: 'Bangladesh',
            deliveryArea,
          },
          select: { id: true },
        });
        shippingAddressId = address.id;
      }

      const orderPayload: any = {
        userId: userData.id,
        totalAmount: total,
        status: 'PENDING',
        provider: 'EPS',
        paymentMethod: isCashOnDelivery
          ? PaymentMethod.CASH_ON_DELIVERY
          : PaymentMethod.ONLINE_PAYMENT,
        shippingCost,
        totalWeight,
        stockReservationExpiresAt: isCashOnDelivery ? null : new Date(Date.now() + 15 * 60 * 1000),
        orderItems: {
          create: orderItemsData,
        },
      };

      if (isCashOnDelivery) {
        orderPayload.provider = PaymentProviders.CASH_ON_DELIVERY;
      }

      if (shippingAddressId) {
        orderPayload.shippingAddressId = shippingAddressId;
      }

      // 6. Generate final order record
      return {
        ...userData,
        orderData: await tx.order.create({
          data: orderPayload,
          select: {
            id: true,
            totalAmount: true,
            orderItems: {
              select: {
                format: true,
                price: true,
                course: { select: { title: true } },
                book: { select: { title: true } },
              },
            },
            shippingAddress: true,
          },
        }),
      };
    });
  });

  if (!createOrder.orderData.id) {
    throw new Error('Order Creation Failed');
  }

  if (isCashOnDelivery) {
    const trackingCode = await createCourierConsignmentForOrder(createOrder.orderData.id);
    return {
      orderId: createOrder.orderData.id,
      paymentType: 'CASH_ON_DELIVERY' as const,
      courierSubmitted: Boolean(trackingCode),
      trackingCode,
    };
  }

  const eps = new EPS({
    username: 'Epsdemo@gmail.com',
    password: 'Epsdemo258@',
    hashKey: 'FHZxyzeps56789gfhg678ygu876o=',
    merchantId: '29e86e70-0ac6-45eb-ba04-9fcb0aaed12a',
    storeId: 'd44e705f-9e3a-41de-98b1-1674631637da',
    sandbox: true,
  });

  try {
    const payment = await eps.initializePayment({
      customerOrderId: createOrder.orderData.id,
      merchantTransactionId: generateTransactionId(),
      totalAmount: Number(createOrder.orderData.totalAmount),

      successUrl: `${config.FRONTEND_URL}/payment/success`,
      failUrl: `${config.FRONTEND_URL}/payment/fail`,
      cancelUrl: `${config.FRONTEND_URL}/payment/cancel`,

      customerName:
        createOrder.studentProfile?.displayName ??
        createOrder.instructorProfile?.displayName ??
        'N/A',
      customerEmail: createOrder.email,
      customerPhone: shippingDetails?.phoneNumber ?? '01934567890',
      // customerPhone: createOrder.studentProfile?.encryptedPhone
      //     ? decryptPhoneNumber(createOrder.studentProfile.encryptedPhone)
      //     : createOrder.instructorProfile?.encryptedPhone
      //         ? decryptPhoneNumber(createOrder.instructorProfile.encryptedPhone)
      //         : 'N/A',
      customerAddress: createOrder.orderData.shippingAddress?.addressLine ?? 'N/A',
      customerCity: createOrder.orderData.shippingAddress?.city ?? 'N/A',
      customerState: createOrder.orderData.shippingAddress?.city ?? 'N/A',
      customerPostcode: createOrder.orderData.shippingAddress?.postalCode ?? '1200',

      productName: createOrder.orderData.orderItems
        .map(item => item.course?.title ?? item.book?.title)
        .join(', '),
    });

    console.log('EPS Payment : ', payment);

    if (!payment.TransactionId || !payment.RedirectURL) {
      console.error('EPS Error Log:', {
        httpStatus: payment.ErrorCode,
        message: payment.ErrorMessage ?? 'No payment URL returned',
        fullResponse: payment,
      });

      throw new Error(payment.ErrorMessage ?? 'Failed to initiate payment with EPS');
    }

    return {
      gatewayUrl: payment.RedirectURL,
      orderId: createOrder.orderData.id,
      paymentType: 'ONLINE_PAYMENT' as const,
    };
  } catch (error: any) {
    console.error('EPS initialization failed:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      cause: error?.cause,
      status: error?.response?.status,
      response: error?.response?.data,
      stack: error?.stack,
    });

    await releasePhysicalStockForFailedOrder(createOrder.orderData.id);
    throw error;
  }
};

// for EPS payment system End

const refreshMyOrderTracking = async (req: Request) => {
  const userEmail = req.user?.email;
  const orderId = req.params.orderId as string;
  if (!userEmail) {
    throw new Error('Unauthorized');
  }

  const order = await executeDbOperation(prisma =>
    prisma.order.findFirst({
      where: { id: orderId, user: { email: userEmail } },
      select: { id: true, courierTrackingCode: true },
    })
  );
  if (!order) {
    throw new Error('Order not found');
  }
  if (!order.courierTrackingCode) {
    return { trackingAvailable: false, courierStatus: null };
  }

  const courierStatus = await getSteadfastStatusByTrackingCode(order.courierTrackingCode);
  const mappedOrderStatus = courierOrderStatus[courierStatus];
  const delivered = courierStatus === 'delivered' || courierStatus === 'partial_delivered';
  const cancelled = courierStatus === 'cancelled' || courierStatus === 'cancelled_approval_pending';

  await executeDbOperation(prisma =>
    prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: {
          courierStatus,
          courierStatusUpdatedAt: new Date(),
          courierLastError: null,
          ...(mappedOrderStatus ? { status: mappedOrderStatus } : {}),
        },
      }),
      prisma.orderItem.updateMany({
        where: { orderId: order.id, format: PurchaseFormat.PHYSICAL },
        data: {
          ...(delivered
            ? { status: OrderItemStatus.DELIVERED, deliveredAt: new Date() }
            : cancelled
              ? { status: OrderItemStatus.PENDING }
              : { status: OrderItemStatus.SHIPPED }),
        },
      }),
    ])
  );

  return { trackingAvailable: true, courierStatus };
};

const getShippingQuote = async (req: Request) => {
  const districtId = typeof req.query.districtId === 'string' ? req.query.districtId : '';
  const upazilaId = typeof req.query.upazilaId === 'string' ? req.query.upazilaId : '';
  const weight = Number(req.query.weight ?? 0);
  if (!districtId || !upazilaId || !Number.isFinite(weight) || weight < 0) {
    throw new Error('A valid district, upazila and weight are required');
  }
  const deliveryArea = getDeliveryArea({ districtId, upazilaId });
  return {
    deliveryArea,
    shippingCost: calculateShippingCost(deliveryArea, weight),
    weight,
  };
};

const retrySteadfastConsignment = async (req: Request) => {
  const orderId = req.params.orderId as string;
  const trackingCode = await createCourierConsignmentForOrder(orderId);
  return { courierSubmitted: Boolean(trackingCode), trackingCode };
};

const getMyOrders = async (req: Request) => {
  const userEmail = req.user?.email;
  if (!userEmail) {
    throw new Error('Unauthorized');
  }

  const orders = await executeDbOperation(prisma =>
    prisma.order.findMany({
      where: { user: { email: userEmail }, orderItems: { some: {} } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        totalAmount: true,
        shippingCost: true,
        totalWeight: true,
        currency: true,
        status: true,
        provider: true,
        paymentMethod: true,
        courierName: true,
        courierTrackingCode: true,
        courierStatus: true,
        courierStatusUpdatedAt: true,
        createdAt: true,
        orderItems: {
          select: {
            id: true,
            quantity: true,
            format: true,
            price: true,
            status: true,
            book: { select: { title: true, author: true, coverImage: true } },
            course: { select: { title: true, thumbnailUrl: true } },
          },
        },
      },
    })
  );

  return orders.map(order => ({
    ...order,
    totalAmount: Number(order.totalAmount),
    shippingCost: Number(order.shippingCost),
    totalWeight: Number(order.totalWeight),
    orderItems: order.orderItems.map(item => ({ ...item, price: Number(item.price) })),
  }));
};

const getMyOrderById = async (req: Request) => {
  const userEmail = req.user?.email;
  const orderId = req.params.orderId as string;
  if (!userEmail) {
    throw new Error('Unauthorized');
  }

  const order = await executeDbOperation(prisma =>
    prisma.order.findFirst({
      where: { id: orderId, user: { email: userEmail } },
      select: {
        id: true,
        totalAmount: true,
        shippingCost: true,
        totalWeight: true,
        currency: true,
        status: true,
        provider: true,
        paymentMethod: true,
        providerOrderId: true,
        courierName: true,
        courierConsignmentId: true,
        courierTrackingCode: true,
        courierStatus: true,
        courierStatusUpdatedAt: true,
        courierLastError: true,
        createdAt: true,
        updatedAt: true,
        shippingAddress: true,
        orderItems: {
          select: {
            id: true,
            quantity: true,
            format: true,
            price: true,
            status: true,
            courierName: true,
            trackingNumber: true,
            shippedAt: true,
            deliveredAt: true,
            book: { select: { id: true, title: true, author: true, coverImage: true } },
            course: { select: { id: true, title: true, thumbnailUrl: true } },
          },
        },
      },
    })
  );

  if (!order) {
    throw new Error('Order not found');
  }

  return {
    ...order,
    totalAmount: Number(order.totalAmount),
    shippingCost: Number(order.shippingCost),
    totalWeight: Number(order.totalWeight),
    orderItems: order.orderItems.map(item => ({ ...item, price: Number(item.price) })),
  };
};

export const orderService = {
  createPayment,
  validateIPN,
  createOrderWithUDDOKTAPAY,
  verifyPayment,
  getMyOrders,
  getMyOrderById,
  refreshMyOrderTracking,
  getShippingQuote,
  retrySteadfastConsignment,
  createOrderWithEPS,
};
