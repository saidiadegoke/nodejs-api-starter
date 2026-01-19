// const pool = require('../../db/pool');

// const campaigns = [
//   {
//     name: 'Membership Dues',
//     slug: 'membership-dues',
//     description: 'Annual membership dues for AAC members to support organizational activities and maintain active membership status.',
//     type: 'dues',
//     target_amount: 50000,
//     current_amount: 0,
//     currency: 'NGN',
//     status: 'active',
//     is_public: true,
//     allow_anonymous: false,
//     min_amount: 5000,
//     max_amount: 100000,
//     suggested_amounts: [5000, 10000, 25000, 50000],
//     start_date: new Date('2024-01-01'),
//     end_date: new Date('2024-12-31'),
//     short_description: 'Annual membership dues for AAC members',
//     long_description: 'Membership dues are essential for maintaining the organization\'s operations, supporting member services, and funding various initiatives. Your dues help us provide better services to our community and advance our mission.',
//     total_donors: 0,
//     total_payments: 0,
//     requires_approval: false,
//     categories: ['membership', 'dues'],
//     tags: ['annual', 'membership', 'dues']
//   },
//   {
//     name: 'Outreach Support',
//     slug: 'outreach-support',
//     description: 'Support our community outreach programs, educational initiatives, and social development projects across Nigeria.',
//     type: 'donation',
//     target_amount: 2000000,
//     current_amount: 0,
//     currency: 'NGN',
//     status: 'active',
//     is_public: true,
//     allow_anonymous: true,
//     min_amount: 1000,
//     max_amount: 1000000,
//     suggested_amounts: [1000, 5000, 10000, 25000, 50000, 100000],
//     start_date: new Date('2024-01-01'),
//     end_date: new Date('2024-12-31'),
//     short_description: 'Support community outreach and educational programs',
//     long_description: 'Our outreach programs focus on education, healthcare, and community development. Your support helps us reach more communities, provide educational resources, and create lasting positive impact across Nigeria.',
//     total_donors: 0,
//     total_payments: 0,
//     requires_approval: false,
//     categories: ['outreach', 'education', 'community'],
//     tags: ['community', 'education', 'healthcare', 'development']
//   },
//   {
//     name: 'Campaign Financing',
//     slug: 'campaign-financing',
//     description: 'Support our political campaigns and electoral activities to promote good governance and democratic values.',
//     type: 'campaign',
//     target_amount: 5000000,
//     current_amount: 0,
//     currency: 'NGN',
//     status: 'active',
//     is_public: true,
//     allow_anonymous: true,
//     min_amount: 1000,
//     max_amount: 2000000,
//     suggested_amounts: [1000, 5000, 10000, 25000, 50000, 100000, 250000],
//     start_date: new Date('2024-01-01'),
//     end_date: new Date('2024-12-31'),
//     short_description: 'Support political campaigns and electoral activities',
//     long_description: 'Campaign financing is crucial for our political activities, voter education, and electoral processes. Your contributions help us promote democratic values, support candidates, and ensure fair electoral processes.',
//     total_donors: 0,
//     total_payments: 0,
//     requires_approval: false,
//     categories: ['campaign', 'politics', 'elections'],
//     tags: ['campaign', 'politics', 'elections', 'democracy']
//   }
// ];

// async function seedCampaigns() {
//   const client = await pool.connect();
  
//   try {
//     console.log('Starting campaign seeding...');
    
//     for (const campaign of campaigns) {
//       // Check if campaign already exists
//       const existingCheck = await client.query(
//         'SELECT id FROM campaigns WHERE slug = $1',
//         [campaign.slug]
//       );
      
//       if (existingCheck.rows.length > 0) {
//         console.log(`Campaign "${campaign.name}" already exists, skipping...`);
//         continue;
//       }
      
//       const query = `
//         INSERT INTO campaigns (
//           name, slug, description, type, target_amount, current_amount, currency,
//           status, is_public, allow_anonymous, min_amount, max_amount, suggested_amounts,
//           start_date, end_date, short_description, long_description,
//           total_donors, total_payments, requires_approval, categories, tags
//         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
//         RETURNING id, name, slug
//       `;
      
//       const values = [
//         campaign.name,
//         campaign.slug,
//         campaign.description,
//         campaign.type,
//         campaign.target_amount,
//         campaign.current_amount,
//         campaign.currency,
//         campaign.status,
//         campaign.is_public,
//         campaign.allow_anonymous,
//         campaign.min_amount,
//         campaign.max_amount,
//         JSON.stringify(campaign.suggested_amounts),
//         campaign.start_date,
//         campaign.end_date,
//         campaign.short_description,
//         campaign.long_description,
//         campaign.total_donors,
//         campaign.total_payments,
//         campaign.requires_approval,
//         JSON.stringify(campaign.categories),
//         JSON.stringify(campaign.tags)
//       ];
      
//       const result = await client.query(query, values);
//       console.log(`✅ Created campaign: ${result.rows[0].name} (${result.rows[0].slug})`);
//     }
    
//     console.log('🎉 Campaign seeding completed successfully!');
    
//   } catch (error) {
//     console.error('❌ Error seeding campaigns:', error);
//     throw error;
//   } finally {
//     client.release();
//   }
// }

// // Run the seeding if this file is executed directly
// if (require.main === module) {
//   seedCampaigns()
//     .then(() => {
//       console.log('Campaign seeding finished');
//       process.exit(0);
//     })
//     .catch((error) => {
//       console.error('Campaign seeding failed:', error);
//       process.exit(1);
//     });
// }

// module.exports = { seedCampaigns }; 