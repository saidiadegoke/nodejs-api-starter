const pool = require('../../../db/pool');

async function seedBankAccounts() {
  const accounts = [
    {
      bank_name: 'Access Bank',
      account_number: '0707020231',
      account_name: 'Helloworld Technologies',
      is_active: true
    }
  ];

  for (const account of accounts) {
    const exists = await pool.query('SELECT 1 FROM bank_accounts WHERE account_number = $1', [account.account_number]);
    if (exists.rows.length === 0) {
      await pool.query(
        `INSERT INTO bank_accounts (bank_name, account_number, account_name, is_active)
         VALUES ($1, $2, $3, $4)`,
        [
          account.bank_name,
          account.account_number,
          account.account_name,
          account.is_active
        ]
      );
      console.log(`Seeded bank account: ${account.account_name} (${account.bank_name})`);
    } else {
      console.log(`Bank account already exists: ${account.account_name} (${account.bank_name})`);
    }
  }
  process.exit(0);
}

seedBankAccounts().catch(err => {
  console.error('Error seeding bank accounts:', err);
  process.exit(1);
}); 