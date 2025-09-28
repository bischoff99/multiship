# API Endpoints Reference

This document provides a comprehensive reference for all Multiship API endpoints, including request/response formats, authentication requirements, and usage examples.

## 🔐 Authentication

All API endpoints require authentication using API key in the request header:

```
Authorization: Bearer YOUR_API_KEY
```

or

```
X-API-Key: YOUR_API_KEY
```

## 📊 Response Format

All responses follow this standard format:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "correlationId": "uuid-v4-string"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "correlationId": "uuid-v4-string"
}
```

## 🚛 Orders

### Create Order
**POST** `/api/orders`

Creates a new shipping order with automatic provider selection.

**Request Body:**
```json
{
  "orderNumber": "ORD-001",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "shippingAddress": {
    "street1": "123 Main St",
    "street2": "Apt 4B",
    "city": "Anytown",
    "state": "CA",
    "zip": "12345",
    "country": "US"
  },
  "billingAddress": {
    "street1": "123 Main St",
    "street2": "Apt 4B",
    "city": "Anytown",
    "state": "CA",
    "zip": "12345",
    "country": "US"
  },
  "items": [
    {
      "sku": "ITEM-001",
      "name": "Sample Product",
      "description": "A great product",
      "quantity": 2,
      "weight": 1.5,
      "value": 29.99,
      "dimensions": {
        "length": 10,
        "width": 8,
        "height": 6
      }
    }
  ],
  "preferredProviders": ["easypost", "shippo"],
  "serviceLevel": "standard",
  "metadata": {
    "source": "web",
    "tags": ["priority"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "order_123",
    "orderNumber": "ORD-001",
    "status": "pending",
    "provider": "easypost",
    "trackingNumber": null,
    "estimatedDelivery": "2024-01-05",
    "totalCost": 12.50,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get Order
**GET** `/api/orders/{orderId}`

Retrieves order details by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "order_123",
    "orderNumber": "ORD-001",
    "status": "shipped",
    "provider": "easypost",
    "trackingNumber": "EZ123456789US",
    "trackingUrl": "https://track.easypost.com/EZ123456789US",
    "shippedAt": "2024-01-02T10:30:00.000Z",
    "estimatedDelivery": "2024-01-05",
    "actualDelivery": null,
    "totalCost": 12.50,
    "items": [...],
    "events": [
      {
        "timestamp": "2024-01-01T00:00:00.000Z",
        "status": "order_created",
        "description": "Order created"
      }
    ]
  }
}
```

### List Orders
**GET** `/api/orders`

Retrieves a paginated list of orders with optional filtering.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `status`: Filter by status (pending, shipped, delivered, cancelled)
- `provider`: Filter by provider (easypost, shippo, veeqo)
- `orderNumber`: Filter by order number

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

### Update Order
**PATCH** `/api/orders/{orderId}`

Updates order details (limited fields based on status).

**Request Body:**
```json
{
  "shippingAddress": {
    "street1": "456 New St",
    "city": "New City",
    "state": "NY",
    "zip": "67890"
  },
  "metadata": {
    "priority": "high"
  }
}
```

### Cancel Order
**POST** `/api/orders/{orderId}/cancel`

Cancels an order if it hasn't shipped yet.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "order_123",
    "status": "cancelled",
    "cancelledAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## 📦 Shipments

### Create Shipment
**POST** `/api/shipments`

Creates a shipment directly with a specific provider.

**Request Body:**
```json
{
  "provider": "easypost",
  "serviceLevel": "express",
  "fromAddress": {
    "name": "Sender Name",
    "street1": "100 Sender St",
    "city": "Send City",
    "state": "CA",
    "zip": "12345",
    "country": "US"
  },
  "toAddress": {
    "name": "John Doe",
    "street1": "123 Main St",
    "city": "Anytown",
    "state": "CA",
    "zip": "12345",
    "country": "US"
  },
  "parcel": {
    "length": 10,
    "width": 8,
    "height": 6,
    "weight": 1.5
  },
  "orderId": "order_123"
}
```

### Get Shipment
**GET** `/api/shipments/{shipmentId}`

Retrieves shipment details from the provider.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "shp_123",
    "provider": "easypost",
    "providerShipmentId": "shp_abc123",
    "status": "delivered",
    "trackingNumber": "EZ123456789US",
    "trackingUrl": "https://track.easypost.com/EZ123456789US",
    "estimatedDelivery": "2024-01-05",
    "actualDelivery": "2024-01-04T14:30:00.000Z",
    "cost": 12.50,
    "rates": [...],
    "events": [...]
  }
}
```

### Track Shipment
**GET** `/api/shipments/{shipmentId}/track`

Gets real-time tracking information.

**Response:**
```json
{
  "success": true,
  "data": {
    "trackingNumber": "EZ123456789US",
    "status": "in_transit",
    "estimatedDelivery": "2024-01-05",
    "events": [
      {
        "timestamp": "2024-01-01T09:00:00.000Z",
        "status": "pre_transit",
        "description": "Package received at facility",
        "location": "Los Angeles, CA"
      },
      {
        "timestamp": "2024-01-02T14:30:00.000Z",
        "status": "in_transit",
        "description": "Departed facility",
        "location": "Los Angeles, CA"
      }
    ]
  }
}
```

## 🏭 Providers

### List Providers
**GET** `/api/providers`

Gets all available shipping providers and their status.

**Response:**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "easypost",
        "name": "EasyPost",
        "status": "healthy",
        "services": ["standard", "express", "overnight"],
        "supportedCountries": ["US", "CA", "GB", "AU"],
        "features": ["tracking", "insurance", "returns"]
      },
      {
        "id": "shippo",
        "name": "Shippo",
        "status": "healthy",
        "services": ["standard", "express"],
        "supportedCountries": ["US", "CA", "GB"],
        "features": ["tracking", "labels", "returns"]
      }
    ]
  }
}
```

### Get Provider Rates
**POST** `/api/providers/{providerId}/rates`

Gets shipping rates from a specific provider.

**Request Body:**
```json
{
  "fromAddress": {
    "street1": "100 Sender St",
    "city": "Send City",
    "state": "CA",
    "zip": "12345",
    "country": "US"
  },
  "toAddress": {
    "street1": "123 Main St",
    "city": "Anytown",
    "state": "CA",
    "zip": "12345",
    "country": "US"
  },
  "parcels": [
    {
      "length": 10,
      "width": 8,
      "height": 6,
      "weight": 1.5
    }
  ],
  "serviceLevel": "standard"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "provider": "easypost",
    "rates": [
      {
        "id": "rate_123",
        "service": "USPS Priority Mail",
        "cost": 12.50,
        "currency": "USD",
        "estimatedDays": 2,
        "carrier": "USPS"
      },
      {
        "id": "rate_456",
        "service": "FedEx Ground",
        "cost": 15.75,
        "currency": "USD",
        "estimatedDays": 3,
        "carrier": "FedEx"
      }
    ]
  }
}
```

## 🏥 Health & Monitoring

### Health Check
**GET** `/health`

Basic health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "uptime": "72h 30m 15s"
}
```

### Detailed Health Check
**GET** `/api/health/detailed`

Comprehensive health check including all services.

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": "12ms"
    },
    "redis": {
      "status": "healthy",
      "responseTime": "3ms"
    },
    "providers": {
      "easypost": {
        "status": "healthy",
        "responseTime": "245ms"
      },
      "shippo": {
        "status": "healthy",
        "responseTime": "180ms"
      }
    }
  }
}
```

### Metrics
**GET** `/api/metrics`

Application metrics and performance data.

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": {
      "total": 15420,
      "today": 45,
      "thisWeek": 320
    },
    "providers": {
      "easypost": {
        "requests": 12500,
        "errors": 25,
        "avgResponseTime": "245ms"
      }
    },
    "system": {
      "uptime": "72h 30m 15s",
      "memory": {
        "used": "256MB",
        "total": "512MB"
      },
      "cpu": "45%"
    }
  }
}
```

## 🪝 Webhooks

### List Webhooks
**GET** `/api/webhooks`

Retrieves all configured webhooks.

### Create Webhook
**POST** `/api/webhooks`

Creates a new webhook endpoint.

**Request Body:**
```json
{
  "url": "https://your-app.com/webhooks/multiship",
  "events": ["order.created", "order.shipped", "order.delivered"],
  "secret": "your-webhook-secret",
  "active": true
}
```

### Update Webhook
**PATCH** `/api/webhooks/{webhookId}`

Updates webhook configuration.

### Delete Webhook
**DELETE** `/api/webhooks/{webhookId}`

Removes a webhook configuration.

## ⚠️ Error Codes

### Common HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request (invalid input)
- `401`: Unauthorized (invalid API key)
- `404`: Not Found
- `422`: Unprocessable Entity (validation errors)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

### Error Code Reference

| Code | Description |
|------|-------------|
| `INVALID_API_KEY` | API key is missing or invalid |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `ORDER_NOT_FOUND` | Order does not exist |
| `PROVIDER_ERROR` | External provider API error |
| `INVALID_ADDRESS` | Address validation failed |
| `INSUFFICIENT_CREDIT` | Provider account out of credit |
| `SERVICE_UNAVAILABLE` | Shipping service temporarily unavailable |

## 📝 Rate Limits

### Standard Limits
- **Per minute**: 1000 requests
- **Per hour**: 50,000 requests
- **Per day**: 1,000,000 requests

### Provider-Specific Limits
- **EasyPost**: 100 requests/second
- **Shippo**: 50 requests/second
- **Veeqo**: 10 requests/second

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1609459200
```

## 🔄 Webhook Events

### Order Events
- `order.created`: New order created
- `order.updated`: Order details modified
- `order.cancelled`: Order cancelled
- `order.shipped`: Order shipped
- `order.delivered`: Order delivered
- `order.exception`: Delivery exception occurred

### Shipment Events
- `shipment.created`: Shipment created
- `shipment.label_created`: Shipping label generated
- `shipment.in_transit`: Package in transit
- `shipment.out_for_delivery`: Out for delivery
- `shipment.delivered`: Package delivered
- `shipment.exception`: Delivery exception

### Provider Events
- `provider.rate_limit`: Provider rate limit hit
- `provider.error`: Provider API error
- `provider.recovered`: Provider service recovered

---

*This API documentation is automatically generated and kept in sync with the codebase. Last updated: $(date)*