import { PrismaClient, Prisma } from '@prisma/client';

// Define types based on the Prisma schema
type Order = Prisma.OrderGetPayload<{}>;
type OrderItem = Prisma.OrderItemGetPayload<{}>;
type Product = Prisma.ProductGetPayload<{}>;

export interface CreateOrderInput {
  status?: string;
  total: number;
  items: Array<{
    productId: string;
    qty: number;
    price: number;
  }>;
}

export interface UpdateOrderInput {
  status?: string;
  total?: number;
}

export interface OrderWithItems extends Order {
  items: (OrderItem & {
    product: Product;
  })[];
}

export class OrderService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new order with items
   */
  async createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (prisma: any) => {
      // Create the order
      const order = await prisma.order.create({
        data: {
          status: input.status || 'pending',
          total: input.total,
        },
      });

      // Create order items
      const orderItems = await Promise.all(
        input.items.map(item =>
          prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: item.productId,
              qty: item.qty,
              price: item.price,
            },
            include: {
              product: true,
            },
          })
        )
      );

      return {
        ...order,
        items: orderItems,
      };
    });
  }

  /**
   * Get order by ID with items and products
   */
  async getOrderById(id: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        shipments: true,
      },
    });
  }

  /**
   * Update order status and total
   */
  async updateOrder(id: string, input: UpdateOrderInput): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (prisma: any) => {
      const order = await prisma.order.update({
        where: { id },
        data: {
          status: input.status,
          total: input.total,
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      return order;
    });
  }

  /**
   * Get orders with pagination and filtering
   */
  async getOrders(options: {
    page?: number;
    limit?: number;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    orders: OrderWithItems[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          shipments: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get order statistics
   */
  async getOrderStats(): Promise<{
    totalOrders: number;
    totalRevenue: number;
    ordersByStatus: Record<string, number>;
    averageOrderValue: number;
  }> {
    const [
      totalOrders,
      totalRevenue,
      ordersByStatus,
    ] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        _sum: {
          total: true,
        },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: {
          id: true,
        },
      }),
    ]);

    const statusCounts = ordersByStatus.reduce((acc: any, item: any) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    const averageOrderValue = totalOrders > 0 
      ? (totalRevenue._sum.total || 0) / totalOrders 
      : 0;

    return {
      totalOrders,
      totalRevenue: totalRevenue._sum.total || 0,
      ordersByStatus: statusCounts,
      averageOrderValue,
    };
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}