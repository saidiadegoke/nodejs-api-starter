/**
 * Poll Seeder
 *
 * Seeds the database with polls matching the exact mock data from the frontend
 * This uses the data structure from /opinionpulse-web/lib/mock-polls.ts
 * Includes proper configuration for all 15 poll types
 *
 * Run with: npm run seed:polls
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_URL || 'http://localhost:5010';

// Authors from mock-polls.ts
const AUTHORS = [
  {
    name: 'Alex Chen',
    handle: 'alexchen',
    first_name: 'Alex',
    last_name: 'Chen',
    email: 'alex.chen@example.com',
    password: 'password123',
    role: 'user',
    verified: true
  },
  {
    name: 'Jordan Smith',
    handle: 'jordansmith',
    first_name: 'Jordan',
    last_name: 'Smith',
    email: 'jordan.smith@example.com',
    password: 'password123',
    role: 'user',
    verified: false
  },
  {
    name: 'Sam Taylor',
    handle: 'samtaylor',
    first_name: 'Sam',
    last_name: 'Taylor',
    email: 'sam.taylor@example.com',
    password: 'password123',
    role: 'user',
    verified: true
  },
  {
    name: 'Casey Kim',
    handle: 'caseyk',
    first_name: 'Casey',
    last_name: 'Kim',
    email: 'casey.kim@example.com',
    password: 'password123',
    role: 'user',
    verified: false
  },
];

// Categories from mock-polls.ts
const CATEGORIES = [
  'Technology',
  'Politics',
  'Society',
  'Business',
  'Environment',
  'Lifestyle',
  'Sports',
  'Entertainment',
];

// Durations from mock-polls.ts
const DURATIONS = ['1h', '6h', '1d', '3d', '7d'];

// Poll questions from mock-polls.ts - comprehensive data with all poll type configurations
const POLL_QUESTIONS = [
  // 1. Yes/No Poll
  {
    question: 'Is remote work more productive?',
    poll_type: 'yesno',
    description: 'The debate continues about whether remote work increases or decreases productivity.',
    config: {},
    options: [
      { label: 'Yes', position: 0 },
      { label: 'No', position: 1 },
    ]
  },

  // 2. Multiple Choice Poll
  {
    question: 'Should AI regulation be stricter?',
    poll_type: 'multipleChoice',
    description: 'As AI technology advances rapidly, many are calling for stricter regulations to ensure safety and ethical use.',
    config: {},
    options: [
      { label: 'Option A', position: 0 },
      { label: 'Option B', position: 1 },
      { label: 'Option C', position: 2 },
      { label: 'Option D', position: 3 },
    ]
  },

  // 3. Multi-Select Poll
  {
    question: 'Which issues should government prioritize?',
    poll_type: 'multiSelect',
    description: 'Select up to 3 issues you think the government should focus on.',
    config: { maxSelections: 3 },
    options: [
      { label: 'Climate Change', position: 0 },
      { label: 'Healthcare', position: 1 },
      { label: 'Education', position: 2 },
      { label: 'Economy', position: 3 },
      { label: 'Security', position: 4 },
    ]
  },

  // 4. Ranking Poll
  {
    question: 'Rank the top 5 technology innovations by impact',
    poll_type: 'ranking',
    description: 'Drag and drop to rank these technologies from most to least impactful.',
    config: {},
    options: [
      { label: 'Artificial Intelligence', position: 0 },
      { label: 'Renewable Energy', position: 1 },
      { label: 'Biotechnology', position: 2 },
      { label: 'Quantum Computing', position: 3 },
      { label: 'Space Exploration', position: 4 },
    ]
  },

  // 5. Likert Scale Poll
  {
    question: 'How concerned are you about climate change?',
    poll_type: 'likertScale',
    description: 'Rate your level of concern about climate change.',
    config: { scaleType: 'concern', scaleRange: 5 },
    options: [
      { label: 'Not at all concerned', position: 0 },
      { label: 'Slightly concerned', position: 1 },
      { label: 'Moderately concerned', position: 2 },
      { label: 'Very concerned', position: 3 },
      { label: 'Extremely concerned', position: 4 },
    ]
  },

  // 6. Slider Poll
  {
    question: 'How optimistic are you about the economy (0-100)?',
    poll_type: 'slider',
    description: 'Move the slider to indicate your economic outlook.',
    config: { sliderMin: 0, sliderMax: 100, unit: '%' },
    options: []
  },

  // 7. Image-Based Poll
  {
    question: 'Which logo do you prefer?',
    poll_type: 'imageBased',
    description: 'Vote on your preferred logo design.',
    config: {},
    options: [
      {
        label: 'Option A',
        position: 0,
        image_url: 'https://via.placeholder.com/400x300/0ea5e9/ffffff?text=Logo+A'
      },
      {
        label: 'Option B',
        position: 1,
        image_url: 'https://via.placeholder.com/400x300/8b5cf6/ffffff?text=Logo+B'
      },
    ]
  },

  // 8. A/B/C Test Poll
  {
    question: 'Which headline is more convincing?',
    poll_type: 'abcTest',
    description: 'Help us choose the best marketing message for our new product.',
    config: { testMode: 'sideBySide' },
    options: [
      {
        label: 'Variant A',
        position: 0,
        variant_name: 'Variant A',
        variant_content: 'Our new product is amazing and will change your life'
      },
      {
        label: 'Variant B',
        position: 1,
        variant_name: 'Variant B',
        variant_content: 'Discover how our solution solves your biggest problems'
      },
      {
        label: 'Variant C',
        position: 2,
        variant_name: 'Variant C',
        variant_content: 'Join thousands who are already experiencing the difference'
      },
    ]
  },

  // 9. Open-Ended Poll
  {
    question: 'What is your biggest frustration with public transit?',
    poll_type: 'openEnded',
    description: 'Share your thoughts and frustrations with us.',
    config: {},
    options: []
  },

  // 10. Prediction Market Poll
  {
    question: 'What % chance that fuel prices rise in the next quarter?',
    poll_type: 'predictionMarket',
    description: 'Predict the likelihood of fuel prices rising in the next quarter.',
    config: { predictionType: 'percentage' },
    options: []
  },

  // 11. Agreement Distribution Poll
  {
    question: 'Should government increase renewable energy subsidies?',
    poll_type: 'agreementDistribution',
    description: 'Express your level of agreement with increasing government subsidies for renewable energy.',
    config: {},
    options: [
      { label: 'Strongly Support', position: 0 },
      { label: 'Support', position: 1 },
      { label: 'Neutral', position: 2 },
      { label: 'Oppose', position: 3 },
      { label: 'Strongly Oppose', position: 4 },
    ]
  },

  // 12. Map-Based Poll
  {
    question: 'Rate healthcare quality in your state',
    poll_type: 'mapBased',
    description: 'Help us create a map of healthcare quality across states.',
    config: { mapType: 'usa_states' },
    options: []
  },

  // 13. Timeline Poll
  {
    question: 'How did your opinion change before/after the policy announcement?',
    poll_type: 'timeline',
    description: 'Track how opinions change over time.',
    config: {
      timePoints: ['Before Announcement', 'After Announcement', 'After Review']
    },
    options: []
  },

  // 14. Binary with Explanation Poll
  {
    question: 'Do you support the new climate policy? Why?',
    poll_type: 'binaryWithExplanation',
    description: 'Vote and explain your reasoning.',
    config: {},
    options: [
      { label: 'Yes', position: 0 },
      { label: 'No', position: 1 },
    ]
  },

  // 15. Gamified Poll
  {
    question: 'Spin to vote on your favorite app feature!',
    poll_type: 'gamified',
    description: 'Make voting fun! Spin the wheel to vote.',
    config: { gameMode: 'spinToVote' },
    options: [
      { label: 'Feature A', position: 0 },
      { label: 'Feature B', position: 1 },
      { label: 'Feature C', position: 2 },
      { label: 'Feature D', position: 3 },
      { label: 'Feature E', position: 4 },
    ]
  },
];

/**
 * Create or login user and return access token
 */
async function getAuthToken(user) {
  try {
    // Try to register
    const registerData = {
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      password: user.password,
      role: user.role
    };
    await axios.post(`${API_BASE_URL}/auth/register`, registerData);
    console.log(`   ✅ Created user: ${user.name}`);
  } catch (error) {
    // User might already exist, that's fine
    if (error.response?.status !== 409 && error.response?.status !== 400) {
      console.log(`   ⚠️  User ${user.name} might already exist`);
    }
  }

  // Login
  try {
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      identifier: user.email,
      password: user.password
    });
    return loginResponse.data.data.access_token;
  } catch (error) {
    console.error(`   ❌ Failed to login ${user.email}:`, error.response?.data?.message || error.message);
    throw error;
  }
}

/**
 * Create a poll using the API
 */
async function createPoll(pollData, token) {
  try {
    const response = await axios.post(`${API_BASE_URL}/polls`, pollData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data.data;
  } catch (error) {
    console.error('      Error details:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Main seeder function
 */
async function seedPolls() {
  console.log('🌱 Starting poll seeder (using frontend mock data with comprehensive poll type configurations)...');
  console.log(`📡 API Base URL: ${API_BASE_URL}\n`);

  try {
    // Authenticate users
    console.log('👥 Authenticating users...');
    const userTokens = [];
    for (const user of AUTHORS) {
      const token = await getAuthToken(user);
      userTokens.push({ token, user });
    }
    console.log(`   ✅ Authenticated ${userTokens.length} users\n`);

    // Create polls - cycle through all 15 poll types
    console.log('📊 Creating polls with comprehensive configurations...');
    let createdCount = 0;
    const totalPolls = 30; // Create 30 polls to have multiple of each type

    for (let i = 0; i < totalPolls; i++) {
      const pollTemplate = POLL_QUESTIONS[i % POLL_QUESTIONS.length];
      const userInfo = userTokens[i % userTokens.length];
      const category = CATEGORIES[i % CATEGORIES.length];
      const duration = DURATIONS[i % DURATIONS.length];

      const pollData = {
        question: pollTemplate.question,
        poll_type: pollTemplate.poll_type,
        category: category,
        description: pollTemplate.description,
        duration: duration,
        config: pollTemplate.config || {},
        options: pollTemplate.options || []
      };

      try {
        await createPoll(pollData, userInfo.token);
        createdCount++;
        console.log(`   ✅ [${createdCount}/${totalPolls}] ${pollTemplate.poll_type.padEnd(25)} - ${pollTemplate.question.substring(0, 50)}... (by ${userInfo.user.name})`);
      } catch (error) {
        console.error(`   ❌ [${i + 1}/${totalPolls}] Failed: ${pollTemplate.question.substring(0, 50)}...`);
      }

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n✨ Seeding complete!`);
    console.log(`   📊 Created ${createdCount} polls`);
    console.log(`   🎨 Covering all ${POLL_QUESTIONS.length} poll types`);
    console.log(`   👥 Using ${AUTHORS.length} authors`);
    console.log(`   🏷️  Across ${CATEGORIES.length} categories`);
    console.log(`   ⏱️  With ${DURATIONS.length} different durations\n`);

    console.log('📋 Poll types created:');
    POLL_QUESTIONS.forEach((poll, idx) => {
      console.log(`   ${idx + 1}. ${poll.poll_type.padEnd(25)} - ${poll.question.substring(0, 60)}`);
    });

    console.log('\n🎉 You can now view the polls at http://localhost:3000');
    console.log('\n📝 Test user credentials (all use password: password123):');
    AUTHORS.forEach(author => {
      console.log(`   - ${author.email}`);
    });

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the seeder
if (require.main === module) {
  seedPolls()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { seedPolls };
