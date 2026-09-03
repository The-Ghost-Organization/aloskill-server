/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Request } from 'express';
import { executeDbOperation } from '../../config/database.js';
import { config } from '../../config/env.js';
import {
  ApplicationStatus,
  EnrollmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentProviders,
  PurchaseFormat,
  TransactionStatus,
  TransactionType,
} from '../../generated/client.js';
import { decryptPhoneNumber } from '../../utils/phoneNumber.js';
import { type UddoktapayPayload } from './order.validation.js';

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

      const baseShippingCost = hasPhysicalItems
        ? shippingDetails?.deliveryArea === 'INSIDE_DHAKA'
          ? 80
          : 130
        : 0;
      const extraWeightCharge = hasPhysicalItems ? Math.ceil(Math.max(0, totalWeight - 2)) * 20 : 0;
      const shippingCost = baseShippingCost + extraWeightCharge;
      const total = subtotal + shippingCost;

      // 5. Build dynamic shipping address relation
      let shippingAddressId: string | null = null;

      if (shippingDetails && hasPhysicalItems) {
        const address = await tx.shippingAddress.create({
          data: {
            fullName: shippingDetails.fullName,
            addressLine: shippingDetails.addressLine,
            city: shippingDetails.city,
            postalCode: shippingDetails.postalCode,
            phone: shippingDetails.phoneNumber,
            country: 'Bangladesh',
            deliveryArea: shippingDetails.deliveryArea,
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
    return {
      orderId: createOrder.orderData.id,
      paymentType: 'CASH_ON_DELIVERY' as const,
    };
  }

  const payWithUddoktaPay = await fetch(`${config.UDDOKTAPAY_URL}/checkout-v2`, {
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
      webhook_url: 'http://localhost:5000/ipn',
    }),
  });

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

    throw new Error(uddoktaPayData.message ?? 'Failed to initiate payment with UddoktaPay');
  }

  return {
    gatewayUrl: uddoktaPayData.payment_url,
    orderId: createOrder.orderData.id,
    paymentType: 'ONLINE_PAYMENT' as const,
  };
};

const verifyPayment = async (req: Request) => {
  const { invoice_id } = req.query as { invoice_id: string };

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
  };
  return { orderStatus: uddoktaPayData.status };
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
};
