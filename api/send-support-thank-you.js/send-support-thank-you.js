const nodemailer = require('nodemailer');

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let data = '';

    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 20000) {
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

function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    auth: {
      user,
      pass
    }
  });
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || 'https://www.wellbeinginitiativesg.org');
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

  const mailer = getMailer();
  if (!mailer) {
    sendJson(response, 500, {
      message: 'Email delivery is not configured yet. Please add SMTP settings in Vercel.'
    });
    return;
  }

  try {
    const body = await parseBody(request);
    const email = String(body.email || '').trim();
    const name = String(body.name || '').trim() || 'Supporter';
    const amount = Number(body.amount);
    const purpose = String(body.purpose || 'Support contribution').trim();
    const merchantOrderId = String(body.merchant_order_id || '').trim();
    const intentId = String(body.intent_id || '').trim();
    const currencyCode = String(body.currency || 'SGD').toUpperCase();
    const notifyTo = process.env.WELLBEING_NOTIFY_EMAIL || 'wellbeinginitiative2026@gmail.com';
    const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER;

    if (!email) {
      sendJson(response, 400, { message: 'A supporter email address is required.' });
      return;
    }

    if (!Number.isFinite(amount) || amount < 1) {
      sendJson(response, 400, { message: 'A valid payment amount is required.' });
      return;
    }

    const amountText = new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: currencyCode === 'SGD' ? 'SGD' : 'SGD'
    }).format(amount);

    const supporterText = [
      `Hi ${name},`,
      '',
      `Thank you for supporting Wellbeing Initiative Singapore.`,
      `We have received your contribution of ${amountText} for "${purpose}".`,
      '',
      'Your payment details:',
      `- Amount: ${amountText}`,
      `- Purpose: ${purpose}`,
      merchantOrderId ? `- Order reference: ${merchantOrderId}` : null,
      intentId ? `- Payment reference: ${intentId}` : null,
      '',
      'Your support helps us continue our research, outreach, and community work.',
      '',
      'Warm regards,',
      'Wellbeing Initiative Singapore'
    ].filter(Boolean).join('\n');

    const supporterHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.7;color:#202033">
        <p>Hi ${esc(name)},</p>
        <p>Thank you for supporting Wellbeing Initiative Singapore.</p>
        <p>We have received your contribution of <strong>${esc(amountText)}</strong> for <strong>${esc(purpose)}</strong>.</p>
        <p><strong>Your payment details</strong></p>
        <ul>
          <li>Amount: ${esc(amountText)}</li>
          <li>Purpose: ${esc(purpose)}</li>
          ${merchantOrderId ? `<li>Order reference: ${esc(merchantOrderId)}</li>` : ''}
          ${intentId ? `<li>Payment reference: ${esc(intentId)}</li>` : ''}
        </ul>
        <p>Your support helps us continue our research, outreach, and community work.</p>
        <p>Warm regards,<br />Wellbeing Initiative Singapore</p>
      </div>
    `;

    const notifyText = [
      `New contribution received from ${name}.`,
      '',
      `Email: ${email}`,
      `Amount: ${amountText}`,
      `Purpose: ${purpose}`,
      merchantOrderId ? `Order reference: ${merchantOrderId}` : null,
      intentId ? `Payment reference: ${intentId}` : null
    ].filter(Boolean).join('\n');

    const notifyHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.7;color:#202033">
        <p><strong>New contribution received</strong></p>
        <ul>
          <li>Name: ${esc(name)}</li>
          <li>Email: ${esc(email)}</li>
          <li>Amount: ${esc(amountText)}</li>
          <li>Purpose: ${esc(purpose)}</li>
          ${merchantOrderId ? `<li>Order reference: ${esc(merchantOrderId)}</li>` : ''}
          ${intentId ? `<li>Payment reference: ${esc(intentId)}</li>` : ''}
        </ul>
      </div>
    `;

    await Promise.all([
      mailer.sendMail({
        from: fromAddress,
        to: email,
        replyTo: notifyTo,
        subject: `Thank you for supporting Wellbeing Initiative Singapore`,
        text: supporterText,
        html: supporterHtml
      }),
      mailer.sendMail({
        from: fromAddress,
        to: notifyTo,
        replyTo: email,
        subject: `New support payment received: ${amountText}`,
        text: notifyText,
        html: notifyHtml
      })
    ]);

    sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error('Email notification error', {
      message: error.message || 'Unknown error'
    });

    sendJson(response, 500, {
      message: error.message || 'Unable to send email notifications.'
    });
  }
};
