# EasyPost Integration Guide

This guide provides detailed information about integrating with EasyPost, one of the supported shipping providers in Multiship.

## 📋 Overview

EasyPost is a shipping API that provides access to multiple carriers including USPS, FedEx, UPS, DHL, and many others through a single integration.

**Key Features:**
- **Multi-Carrier Support**: Access to 100+ shipping carriers
- **Real-time Rates**: Live shipping rate calculations
- **Address Verification**: Built-in address validation
- **Insurance**: Automatic insurance options
- **Tracking**: Comprehensive tracking information
- **Returns**: Return label generation

## 🚀 Getting Started

### 1. Sign Up for EasyPost
1. Visit [easypost.com](https://easypost.com) and create an account
2. Complete the registration process
3. Verify your email address
4. Access your API keys from the dashboard

### 2. Get API Credentials
- **Test API Key**: For development and testing
- **Production API Key**: For live operations
- **Webhook Secret**: For webhook verification (optional)

### 3. Configure Multiship

Add these environment variables to your `.env` file:

```env
# EasyPost Configuration
EASYPOST_API_KEY=your-test-api-key-here
EASYPOST_WEBHOOK_SECRET=your-webhook-secret-here
EASYPOST_TIMEOUT=30000
EASYPOST_RETRIES=3
```

### 4. Test Integration
```bash
# Start the application
pnpm --filter @multiship/api dev

# Check health endpoint
curl http://localhost:3001/api/providers/easypost/health
```

## 📦 Supported Services

### Domestic Shipping (US)

| Service | Carrier | Estimated Delivery | Insurance |
|---------|---------|-------------------|-----------|
| USPS Priority Mail | USPS | 1-3 days | Included |
| USPS First Class | USPS | 2-5 days | $100 included |
| FedEx Ground | FedEx | 1-5 days | Available |
| FedEx Express Saver | FedEx | 3 days | Available |
| UPS Ground | UPS | 1-5 days | Available |
| UPS 3 Day Select | UPS | 3 days | Available |

### International Shipping

| Service | Destinations | Estimated Delivery | Insurance |
|---------|--------------|-------------------|-----------|
| USPS Priority Mail International | 180+ countries | 6-10 days | Available |
| FedEx International Economy | Global | 2-5 days | Available |
| DHL Express Worldwide | Global | 1-3 days | Available |
| UPS Worldwide Express | Global | 1-3 days | Available |

## 💰 Pricing and Billing

### Rate Calculation
EasyPost provides real-time rates including:
- Base shipping costs
- Fuel surcharges
- Residential delivery fees
- Insurance costs (if selected)
- Taxes and duties (international)

### Billing
- **Test Mode**: No charges during development
- **Production**: Charged per API call and label
- **Billing Cycle**: Monthly invoicing
- **Payment Methods**: Credit card, ACH

## 🏷️ Label Generation

### Supported Formats
- **PDF**: Standard shipping labels (4x6, 8.5x11)
- **PNG**: Image format for web display
- **ZPL**: Zebra printer format
- **EPL**: Eltron printer format

### Label Types
```typescript
// Standard shipping label
{
  format: 'pdf',
  size: '4x6'
}

// Return label
{
  format: 'pdf',
  size: '4x6',
  type: 'return'
}

// Commercial invoice (international)
{
  format: 'pdf',
  size: 'letter',
  type: 'commercial_invoice'
}
```

## 📮 Address Verification

### Address Validation Levels
- **Basic**: Street and city validation
- **Complete**: ZIP+4 and delivery point validation
- **Strict**: Full address standardization

### Example Request
```typescript
const address = {
  street1: '123 main st',
  street2: 'apt 4b',
  city: 'anytown',
  state: 'ca',
  zip: '12345',
  country: 'us'
};

const verifiedAddress = await easypostAdapter.verifyAddress(address);
```

## 🔍 Tracking

### Tracking Information
EasyPost provides detailed tracking with:
- **Real-time Updates**: Live tracking status
- **Estimated Delivery**: Delivery date predictions
- **Proof of Delivery**: Signature and photo proof
- **Exception Handling**: Delay and issue notifications

### Webhook Events
```typescript
// Tracking update webhook payload
{
  "event": "tracker.update",
  "data": {
    "id": "trk_123",
    "tracking_code": "EZ123456789US",
    "status": "in_transit",
    "carrier": "USPS",
    "tracking_details": [
      {
        "object": "TrackingDetail",
        "message": "Shipping Label Created",
        "description": "USPS has received the electronic shipping info",
        "status": "pre_transit",
        "datetime": "2024-01-01T10:00:00Z",
        "source": "USPS",
        "carrier_code": "USPS",
        "tracking_location": {
          "object": "TrackingLocation",
          "city": "Los Angeles",
          "state": "CA",
          "country": "US",
          "zip": "90001"
        }
      }
    ]
  }
}
```

## ⚙️ Configuration Options

### Service Level Mapping

```typescript
// Map Multiship service levels to EasyPost services
const serviceLevelMapping = {
  'standard': ['USPS Priority Mail', 'FedEx Ground', 'UPS Ground'],
  'express': ['FedEx 2Day', 'UPS 2nd Day Air', 'USPS Priority Mail Express'],
  'overnight': ['FedEx Overnight', 'UPS Next Day Air', 'DHL Express'],
  'international': ['USPS Priority Mail International', 'FedEx International']
};
```

### Advanced Options

```typescript
const shipmentOptions = {
  // Insurance
  insurance: {
    amount: 100.00,
    currency: 'USD'
  },

  // Special handling
  specialHandling: ['fragile', 'do_not_stack'],

  // Delivery options
  deliveryOptions: {
    signatureRequired: true,
    adultSignatureRequired: false,
    carbonNeutral: true
  },

  // Customs (international)
  customs: {
    contentsType: 'merchandise',
    customsItems: [
      {
        description: 'Sample Product',
        quantity: 2,
        value: 29.99,
        weight: 1.5,
        originCountry: 'US'
      }
    ]
  }
};
```

## 🧪 Testing

### Test Mode
- Use test API key for development
- Test labels are watermarked
- No real postage charges
- Full API functionality available

### Test Data
```typescript
// Test addresses
const testAddress = {
  name: 'John Doe',
  street1: '358 SW 8th St',
  city: 'Miami',
  state: 'FL',
  zip: '33130',
  country: 'US'
};

// Test parcel
const testParcel = {
  length: 10,
  width: 8,
  height: 6,
  weight: 1.5
};
```

## 🔧 Troubleshooting

### Common Issues

#### Rate Limit Exceeded
**Problem**: `429 Too Many Requests` error
```javascript
// EasyPost rate limits
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests hit the API recently.",
    "details": {
      "limit": 100,
      "period": "second"
    }
  }
}
```

**Solution**:
- Implement exponential backoff
- Use the circuit breaker pattern
- Cache frequently requested rates
- Monitor rate limit headers

#### Address Verification Failed
**Problem**: Address cannot be verified
```javascript
// Common address issues
{
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "Address could not be verified",
    "details": {
      "suggestions": [
        {
          "street1": "123 Main St",
          "city": "Anytown",
          "state": "CA",
          "zip": "12345-6789"
        }
      ]
    }
  }
}
```

**Solution**:
- Check for typos in street, city, state
- Verify ZIP code format
- Include apartment/unit numbers
- Use address autocomplete when possible

#### Tracking Not Updating
**Problem**: Tracking information not updating
**Solution**:
- Verify tracking number format
- Check if package has been scanned
- Contact carrier if needed
- Monitor webhook events for updates

## 📚 API Examples

### Create Shipment
```typescript
import { ProviderFactory } from '@multiship/providers';

const provider = ProviderFactory.getProvider('easypost');

const shipment = await provider.purchase({
  fromAddress: {
    name: 'Sender Name',
    street1: '100 Sender St',
    city: 'Send City',
    state: 'CA',
    zip: '12345',
    country: 'US'
  },
  toAddress: {
    name: 'John Doe',
    street1: '123 Main St',
    city: 'Anytown',
    state: 'CA',
    zip: '12345',
    country: 'US'
  },
  parcel: {
    length: 10,
    width: 8,
    height: 6,
    weight: 1.5
  },
  serviceLevel: 'standard'
});
```

### Get Tracking
```typescript
const tracking = await provider.track('EZ123456789US');

console.log('Status:', tracking.status);
console.log('Estimated Delivery:', tracking.estimatedDelivery);
console.log('Events:', tracking.events);
```

### Handle Webhook
```typescript
// Express.js middleware for EasyPost webhooks
app.post('/webhooks/easypost', (req, res) => {
  const signature = req.headers['x-easypost-signature'];
  const payload = req.body;

  // Verify webhook signature
  if (!verifyEasyPostSignature(payload, signature)) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook event
  switch (payload.event) {
    case 'tracker.update':
      await handleTrackingUpdate(payload.data);
      break;
    case 'batch.created':
      await handleBatchCreated(payload.data);
      break;
  }

  res.json({ received: true });
});
```

## 📊 Monitoring and Analytics

### Health Checks
```typescript
// Provider health check
const isHealthy = await provider.healthCheck();

// Detailed health information
const health = await provider.getHealthDetails();
console.log('Response Time:', health.responseTime);
console.log('Success Rate:', health.successRate);
console.log('Last Error:', health.lastError);
```

### Performance Metrics
- **Average Response Time**: Track API latency
- **Success Rate**: Monitor API reliability
- **Rate Limit Usage**: Track API quota usage
- **Error Rates**: Monitor error patterns

## 🔒 Security Best Practices

### API Key Management
- Store keys in environment variables
- Rotate keys regularly
- Use test keys for development
- Monitor for unauthorized usage

### Data Protection
- Encrypt sensitive shipment data
- Validate all input data
- Use HTTPS for all communications
- Implement proper error handling

### Compliance
- Follow shipping regulations
- Handle hazardous materials properly
- Comply with export/import laws
- Maintain audit trails

## 🚨 Error Handling

### Error Types
```typescript
// Network errors
catch (error) {
  if (error instanceof NetworkError) {
    // Handle network issues
    console.log('Network error:', error.message);
  }
}

// Rate limiting
catch (error) {
  if (error instanceof RateLimitError) {
    // Implement backoff strategy
    await delay(error.retryAfter * 1000);
    // Retry request
  }
}

// Authentication errors
catch (error) {
  if (error instanceof AuthenticationError) {
    // Check API key validity
    console.log('Auth error:', error.message);
  }
}
```

### Retry Strategy
```typescript
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2
};

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < retryConfig.maxRetries && error.isRetryable) {
        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(retryConfig.backoffFactor, attempt),
          retryConfig.maxDelay
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
```

## 📞 Support

### EasyPost Support
- **Documentation**: [docs.easypost.com](https://docs.easypost.com)
- **Support**: support@easypost.com
- **Status Page**: [status.easypost.com](https://status.easypost.com)
- **Community**: [community.easypost.com](https://community.easypost.com)

### Multiship Support
- **Issues**: [GitHub Issues](https://github.com/your-org/multiship/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/multiship/discussions)

---

*This EasyPost integration guide is maintained by the Multiship team. For integration issues, please check the troubleshooting section first.*