const AIRWALLEX_BASE_URLS = {
  demo: 'https://api-demo.airwallex.com/api/v1',
  prod: 'https://api.airwallex.com/api/v1'
};

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function getAllowedOrigin(request) {
  const siteUrl = process.env.SITE_URL || 'https://www.wellbeinginitiativesg.org';
  const allowedOrigins = new Set([
    siteUrl,
    'https://wellbeinginitiativesg.org',
    'https://www.wellbeinginitiativesg.org',
    'https://wellbeinginitiativesg.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ]);
  const origin = request.headers.origin;
  if (!origin) {
    return siteUrl;
  }
  if (allowedOrigins.has(origin) || origin.endsWith('.vercel.app')) {
    return origin;
  }
  return siteUrl;
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let data = '';

    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10000) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(new Error('Invalid JSON request body.'));
      }
    });

    request.on('error', reject);
  });
}

function createRequestId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `wis-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function splitName(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    return {};
  }

  const parts = cleanName.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0] };
  }

  return {
    first_name: parts.slice(0, -1).join(' '),
    last_name: parts[parts.length - 1]
  };
}

async function airwallexRequest(path, options = {}) {
  const env = process.env.AIRWALLEX_ENV === 'demo' ? 'demo' : 'prod';
  const baseUrl = AIRWALLEX_BASE_URLS[env];
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = payload.message || payload.error_description || 'Airwallex request failed.';
    throw new Error(message);
  }

  return { payload, env };
}

module.exports = async function handler(request, response) {
  const allowedOrigin = getAllowedOrigin(request);
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { message: 'Method not allowed.' });
    return;
  }

  if (!process.env.AIRWALLEX_CLIENT_ID || !process.env.AIRWALLEX_API_KEY) {
    sendJson(response, 500, { message: 'Airwallex credentials are not configured.' });
    return;
  }

  try {
    const body = await parseBody(request);
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount < 1) {
      sendJson(response, 400, { message: 'Please enter an amount of at least SGD 1.00.' });
      return;
    }

    if (amount > 10000) {
      sendJson(response, 400, { message: 'Please contact us for contributions above SGD 10,000.' });
      return;
    }

    const siteUrl = (process.env.SITE_URL || 'https://www.wellbeinginitiativesg.org').replace(/\/$/, '');
    const requestId = createRequestId();
    const merchantOrderId = `WIS-${Date.now()}`;

    const { payload: loginPayload, env } = await airwallexRequest('/authentication/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.AIRWALLEX_CLIENT_ID,
        'x-api-key': process.env.AIRWALLEX_API_KEY
      }
    });

    const customer = {
      email: String(body.email || '').trim() || undefined,
      ...splitName(body.name)
    };

    Object.keys(customer).forEach((key) => {
      if (!customer[key]) {
        delete customer[key];
      }
    });

    const { payload: paymentIntent } = await airwallexRequest('/pa/payment_intents/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loginPayload.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        request_id: requestId,
        amount: Number(amount.toFixed(2)),
        currency: 'SGD',
        merchant_order_id: merchantOrderId,
        return_url: `${siteUrl}/payment-success.html`,
        ...(Object.keys(customer).length ? { customer } : {})
      })
    });

    sendJson(response, 200, {
      env,
      currency: paymentIntent.currency || 'SGD',
      intent_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      success_url: `${siteUrl}/payment-success.html`,
      cancel_url: `${siteUrl}/payment-cancelled.html`,
      merchant_order_id: merchantOrderId
    });
  } catch (error) {
    sendJson(response, 500, {
      message: error.message || 'Unable to create payment intent.'
    });
  }
};
