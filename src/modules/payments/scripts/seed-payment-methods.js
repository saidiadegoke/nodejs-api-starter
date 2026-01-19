const pool = require('../../../db/pool');

async function seedPaymentMethods() {
  const methods = [
    {
      name: 'Flutterwave',
      code: 'flutterwave',
      type: 'gateway',
      is_active: true,
      supported_currencies: JSON.stringify(['NGN']),
      processing_fee: 1.4,
      processing_fee_type: 'percentage',
      api_public_key: process.env.FLW_PUBLIC_KEY || 'FLWPUBK_TEST-8075008032547453384d780abfc18503-X',
      api_secret_key: process.env.FLW_SECRET_KEY || 'FLWSECK_TEST-9ae79996bc7e17b82a662c7292303143-X',
      webhook_secret: process.env.FLW_WEBHOOK_SECRET || '',
      base_url: 'https://api.flutterwave.com/v3',
      display_name: 'Flutterwave',
      description: 'Pay with cards, bank transfer, USSD, and more via Flutterwave.',
      icon_url: 'https://flutterwave.com/images/logo-colored.svg',
    },
    {
      name: 'Paystack',
      code: 'paystack',
      type: 'gateway',
      is_active: true,
      supported_currencies: JSON.stringify(['NGN']),
      processing_fee: 1.5,
      processing_fee_type: 'percentage',
      api_public_key: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_cf77d196515557671ce81173915642cfb53c5094',
      api_secret_key: process.env.PAYSTACK_SECRET_KEY || 'sk_test_f3d021e366de0fe946fe9f4fbb4caea803ba0f6e',
      webhook_secret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
      base_url: 'https://api.paystack.co',
      display_name: 'Paystack',
      description: 'Pay with cards, bank transfer, and more via Paystack.',
      icon_url: 'https://paystack.com/assets/img/logos/paystack-logo-primary.svg',
    },
    {
      name: 'Direct Transfer',
      code: 'direct_transfer',
      type: 'manual',
      is_active: true,
      supported_currencies: JSON.stringify(['NGN', 'USD', 'EUR', 'GBP']),
      processing_fee: 0,
      processing_fee_type: 'fixed',
      api_public_key: null,
      api_secret_key: null,
      webhook_secret: null,
      base_url: null,
      display_name: 'Direct Bank Transfer',
      description: 'Pay directly to our bank account and confirm your payment online.',
      icon_url: 'https://img.icons8.com/ios-filled/50/000000/bank-building.png',
    },
  ];

  for (const method of methods) {
    try {
      await pool.query(
        `INSERT INTO payment_methods
        (name, code, type, is_active, supported_currencies, processing_fee, processing_fee_type, api_public_key, api_secret_key, webhook_secret, base_url, display_name, description, icon_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (code) DO NOTHING`,
        [
          method.name,
          method.code,
          method.type,
          method.is_active,
          method.supported_currencies,
          method.processing_fee,
          method.processing_fee_type,
          method.api_public_key,
          method.api_secret_key,
          method.webhook_secret,
          method.base_url,
          method.display_name,
          method.description,
          method.icon_url
        ]
      );
      console.log(`Seeded payment method: ${method.name}`);
    } catch (error) {
      console.error(`Error seeding payment method ${method.name}:`, error);
    }
  }
  process.exit(0);
}

seedPaymentMethods().catch(err => {
  console.error('Error seeding payment methods:', err);
  process.exit(1);
}); 