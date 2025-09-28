# Getting Started Guide

Welcome to Multiship! This guide will help you get up and running with the Multiship shipping platform in minutes.

## 🎯 What is Multiship?

Multiship is a multi-carrier shipping platform that simplifies shipping operations by providing:

- **Unified API**: Single integration for multiple shipping providers
- **Automatic Provider Selection**: Best rates and delivery times
- **Real-time Tracking**: Live shipment tracking across all providers
- **Advanced Analytics**: Shipping performance and cost analysis
- **Webhook Support**: Real-time updates on shipment status

## 🚀 Quick Start

### 1. Sign Up
1. Visit [multiship.com](https://multiship.com) and click "Get Started"
2. Choose your plan (Free trial available)
3. Complete account setup and verification

### 2. Get API Credentials
After signup, you'll receive:
- **API Key**: For authenticating requests
- **Dashboard Access**: For monitoring and configuration
- **Documentation Access**: Complete API reference

### 3. Set Up Provider Accounts
Connect your existing shipping accounts or create new ones:

#### EasyPost (Recommended for US shipping)
1. Sign up at [easypost.com](https://easypost.com)
2. Get your API key from the dashboard
3. Add to Multiship dashboard: Settings → Providers → EasyPost

#### Shippo (Great for international)
1. Sign up at [goshippo.com](https://goshippo.com)
2. Get your API key from settings
3. Add to Multiship dashboard: Settings → Providers → Shippo

#### Veeqo (For e-commerce integration)
1. Sign up at [veeqo.com](https://veeqo.com)
2. Get your API key from integrations
3. Add to Multiship dashboard: Settings → Providers → Veeqo

### 4. Create Your First Shipment

#### Using the Dashboard
1. **Login** to your Multiship dashboard
2. **Navigate** to "Create Shipment"
3. **Enter Addresses**:
   - From: Your business address
   - To: Customer shipping address
4. **Add Package Details**:
   - Weight and dimensions
   - Value for insurance
   - Description
5. **Select Service Level**:
   - Standard (3-5 days)
   - Express (1-2 days)
   - Overnight (next business day)
6. **Choose Provider**: Let Multiship recommend the best option
7. **Purchase Label**: Complete payment and download label

#### Using the API
```bash
curl -X POST https://api.multiship.com/api/shipments \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": {
      "name": "Your Business Name",
      "street1": "123 Business St",
      "city": "Business City",
      "state": "CA",
      "zip": "12345",
      "country": "US"
    },
    "toAddress": {
      "name": "John Doe",
      "street1": "456 Customer Ave",
      "city": "Customer City",
      "state": "NY",
      "zip": "67890",
      "country": "US"
    },
    "parcel": {
      "length": 12,
      "width": 8,
      "height": 6,
      "weight": 2.5
    },
    "serviceLevel": "standard"
  }'
```

### 5. Track Your Shipment
```bash
# Get shipment details
curl https://api.multiship.com/api/shipments/SHIPMENT_ID \
  -H "Authorization: Bearer YOUR_API_KEY"

# Track shipment
curl https://api.multiship.com/api/shipments/SHIPMENT_ID/track \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 📚 Key Concepts

### Service Levels
- **Standard**: Most economical, 3-5 business days
- **Express**: Faster delivery, 1-2 business days
- **Overnight**: Next business day delivery
- **International**: Cross-border shipping options

### Address Validation
Multiship automatically validates and corrects addresses to ensure:
- Accurate delivery
- Reduced shipping delays
- Lower additional fees
- Better tracking information

### Rate Shopping
The platform automatically compares rates across all connected providers to find:
- Lowest shipping costs
- Fastest delivery times
- Best service quality
- Most reliable carriers

## 💡 Best Practices

### Address Management
```javascript
// Always validate addresses before shipping
const validatedAddress = await multiship.validateAddress({
  street1: "123 main st",
  city: "anytown",
  state: "ca",
  zip: "12345"
});

// Use the validated/corrected address
const shipment = await multiship.createShipment({
  toAddress: validatedAddress,
  // ... other details
});
```

### Error Handling
```javascript
try {
  const shipment = await multiship.createShipment(orderData);
  console.log('Shipment created:', shipment.id);
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Retry the request
  } else if (error.code === 'INVALID_ADDRESS') {
    // Show address correction suggestions to user
    console.log('Address suggestions:', error.suggestions);
  } else {
    // Handle other errors
    console.error('Unexpected error:', error.message);
  }
}
```

### Webhook Setup
```javascript
// Set up webhooks for real-time updates
const webhook = await multiship.createWebhook({
  url: 'https://your-app.com/webhooks/multiship',
  events: [
    'shipment.created',
    'shipment.in_transit',
    'shipment.delivered',
    'shipment.exception'
  ]
});

// Handle webhook events
app.post('/webhooks/multiship', (req, res) => {
  const event = req.body;

  switch (event.type) {
    case 'shipment.delivered':
      await fulfillOrder(event.data.orderId);
      break;
    case 'shipment.exception':
      await handleShippingException(event.data);
      break;
  }

  res.json({ received: true });
});
```

## 🛠️ Advanced Features

### Batch Operations
```javascript
// Create multiple shipments at once
const orders = [/* array of orders */];
const shipments = await multiship.createBatchShipment(orders);

// Track multiple shipments
const trackingInfo = await multiship.batchTrack(shipmentIds);
```

### Analytics and Reporting
```javascript
// Get shipping analytics
const analytics = await multiship.getAnalytics({
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  groupBy: 'provider'
});

// Get cost analysis
const costAnalysis = await multiship.getCostAnalysis({
  period: 'monthly',
  compareWithPrevious: true
});
```

### Custom Rules
```javascript
// Set up shipping rules
await multiship.createRule({
  name: 'Free shipping over $100',
  condition: {
    orderValue: { min: 100 }
  },
  action: {
    type: 'free_shipping',
    provider: 'standard'
  }
});

// Provider preferences
await multiship.setProviderPreferences({
  priority: ['easypost', 'shippo', 'veeqo'],
  fallbackEnabled: true,
  costWeight: 0.7,
  speedWeight: 0.3
});
```

## 🔧 Troubleshooting

### Common Issues

#### "Invalid API Key"
- Verify your API key is correct
- Check if your account is active
- Ensure you're using the right environment (test vs production)

#### "Address Not Found"
- Verify the address format
- Check for typos in street, city, state
- Use address autocomplete when available
- Contact support if address should be valid

#### "Provider Unavailable"
- Check provider status on their website
- Verify your provider account is active
- Check if you've exceeded rate limits
- Try a different provider as fallback

#### "Tracking Not Updating"
- Tracking updates can take 24-48 hours to appear
- Check if the tracking number format is correct
- Verify the shipment was actually picked up
- Contact the carrier if no updates after 48 hours

### Getting Help

#### Self-Service
1. **Documentation**: Check this guide and API reference
2. **Status Page**: [status.multiship.com](https://status.multiship.com)
3. **Community Forum**: [community.multiship.com](https://community.multiship.com)

#### Support Channels
1. **Email**: support@multiship.com
2. **Live Chat**: Available on dashboard
3. **Phone**: 1-800-MULTISHIP (business hours)

## 📈 Next Steps

### Explore Features
- **[API Documentation](../wiki/api/endpoints.md)** - Complete API reference
- **[Provider Guides](../wiki/providers/)** - Detailed provider setup
- **[Dashboard Guide](./dashboard-guide.md)** - Using the web interface

### Optimize Your Setup
- **[Rate Optimization](./rate-optimization.md)** - Get the best shipping rates
- **[Batch Processing](./batch-processing.md)** - Handle multiple shipments
- **[Analytics Guide](./analytics.md)** - Track performance and costs

### Integration Examples
- **[E-commerce Integration](./ecommerce-integration.md)** - Shopify, WooCommerce
- **[Custom Integration](./custom-integration.md)** - Build your own integration
- **[Webhook Examples](./webhook-examples.md)** - Real-time updates

---

🎉 **Congratulations!** You're now ready to start shipping with Multiship. Your first shipment is just a few API calls away!

*Questions? We're here to help at support@multiship.com*