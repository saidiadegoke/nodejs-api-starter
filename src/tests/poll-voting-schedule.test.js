const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

// Ensure environment is loaded before getting BASE_URL
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5010';
const TEST_TIMEOUT = 30000; // 30 seconds

// Log configuration at start
console.warn(`\n🧪 Poll Voting Schedule Test Configuration:`);
console.warn(`   API Base URL: ${BASE_URL}`);
console.warn(`   Environment: ${process.env.NODE_ENV}`);
console.warn(`   Mock OTP: ${process.env.USE_MOCK_OTP}\n`);

// Test data storage
let testUser = null;
let authToken = null;
let testPoll = null;
let testPollWithSchedule = null;

// Track all created resources for cleanup
let createdResources = {
  users: [],
  polls: [],
  responses: []
};

// Helper function to create axios instance with auth
const createAuthClient = (token) => {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return axios.create({
    baseURL: BASE_URL,
    headers
  });
};

// Helper to get future date
const getFutureDate = (hoursFromNow) => {
  const date = new Date();
  date.setHours(date.getHours() + hoursFromNow);
  return date.toISOString();
};

// Helper to get past date
const getPastDate = (hoursAgo) => {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return date.toISOString();
};

describe('Poll Voting Schedule API', () => {
  // Setup: Create test user and authenticate
  beforeAll(async () => {
    console.warn('🔧 Setting up poll voting schedule tests...');

    const client = createAuthClient();

    // Create test user
    const userData = {
      email: `voting-schedule-test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      first_name: 'Schedule',
      last_name: 'Tester',
      role: 'user'
    };

    try {
      // Register user
      const signupResponse = await client.post('/auth/register', userData);
      testUser = signupResponse.data.data;
      createdResources.users.push(testUser.user_id);

      // Login to get token
      const loginResponse = await client.post('/auth/login', {
        identifier: userData.email,
        password: userData.password
      });
      authToken = loginResponse.data.data.access_token;

      console.warn(`✅ Test user created and authenticated: ${testUser.email}`);
    } catch (error) {
      console.error('❌ Failed to create test user:', error.response?.data || error.message);
      throw error;
    }
  }, TEST_TIMEOUT);

  // Cleanup after all tests
  afterAll(async () => {
    console.warn('\n🧹 Cleaning up poll voting schedule test resources...');

    try {
      const authClient = createAuthClient(authToken);

      // Delete polls
      for (const pollId of createdResources.polls) {
        try {
          await authClient.delete(`/polls/${pollId}`);
        } catch (error) {
          console.warn(`⚠️  Failed to delete poll: ${error.message}`);
        }
      }

      // Clean up users and other resources
      await cleanupAll(createdResources);
      logCleanupResults();
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }, TEST_TIMEOUT);

  describe('Poll Creation with Voting Schedule', () => {
    test('should create a poll without voting schedule (default behavior)', async () => {
      const authClient = createAuthClient(authToken);

      const pollData = {
        question: 'What is your favorite programming language?',
        description: 'A simple poll without any voting restrictions',
        poll_type: 'multipleChoice',
        category: 'Technology',
        duration: '7d',
        config: {},
        options: [
          { label: 'JavaScript', position: 0 },
          { label: 'Python', position: 1 },
          { label: 'Java', position: 2 },
          { label: 'Go', position: 3 }
        ]
      };

      const response = await authClient.post('/polls', pollData);

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data.question).toBe(pollData.question);

      testPoll = response.data.data;
      createdResources.polls.push(testPoll.id);

      console.warn(`✅ Poll created without schedule: ${testPoll.id}`);
    }, TEST_TIMEOUT);

    test('should create a poll with complete voting schedule', async () => {
      const authClient = createAuthClient(authToken);

      const pollData = {
        question: 'What should be our office lunch policy?',
        description: 'Poll with business hours voting restrictions',
        poll_type: 'multipleChoice',
        category: 'Office',
        duration: '30d',
        config: {},
        options: [
          { label: 'Free lunch daily', position: 0 },
          { label: 'Lunch stipend', position: 1 },
          { label: 'Food trucks on site', position: 2 },
          { label: 'No change', position: 3 }
        ],
        // Voting schedule
        voting_starts_at: getFutureDate(1), // Starts in 1 hour
        voting_ends_at: getFutureDate(168), // Ends in 7 days
        voting_days_of_week: [1, 2, 3, 4, 5], // Monday-Friday
        voting_time_start: '09:00:00',
        voting_time_end: '17:00:00',
        allow_revote: false,
        vote_frequency_type: 'daily',
        vote_frequency_value: 1
      };

      const response = await authClient.post('/polls', pollData);

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data.voting_days_of_week).toEqual([1, 2, 3, 4, 5]);
      expect(response.data.data.voting_time_start).toBe('09:00:00');
      expect(response.data.data.voting_time_end).toBe('17:00:00');
      expect(response.data.data.allow_revote).toBe(false);
      expect(response.data.data.vote_frequency_type).toBe('daily');
      expect(response.data.data.vote_frequency_value).toBe(1);

      testPollWithSchedule = response.data.data;
      createdResources.polls.push(testPollWithSchedule.id);

      console.warn(`✅ Poll created with voting schedule: ${testPollWithSchedule.id}`);
    }, TEST_TIMEOUT);
  });

  describe('Get Voting Schedule', () => {
    test('should get voting schedule for poll', async () => {
      const client = createAuthClient(); // Public endpoint

      const response = await client.get(`/polls/${testPollWithSchedule.id}/voting-schedule`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.votingDaysOfWeek).toEqual([1, 2, 3, 4, 5]);
      expect(response.data.data.votingTimeStart).toBe('09:00:00');
      expect(response.data.data.votingTimeEnd).toBe('17:00:00');
      expect(response.data.data.allowRevote).toBe(false);
      expect(response.data.data.voteFrequencyType).toBe('daily');
      expect(response.data.data.voteFrequencyValue).toBe(1);
      expect(response.data.data).toHaveProperty('effectiveStartsAt');
      expect(response.data.data).toHaveProperty('effectiveEndsAt');

      console.warn(`✅ Retrieved voting schedule for poll ${testPollWithSchedule.id}`);
    }, TEST_TIMEOUT);

    test('should get default voting schedule for poll without schedule', async () => {
      const client = createAuthClient();

      const response = await client.get(`/polls/${testPoll.id}/voting-schedule`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.votingDaysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]); // All days
      expect(response.data.data.votingTimeStart).toBe('00:00:00');
      expect(response.data.data.votingTimeEnd).toBe('23:59:59');
      expect(response.data.data.voteFrequencyType).toBe('once');

      console.warn(`✅ Retrieved default voting schedule for poll ${testPoll.id}`);
    }, TEST_TIMEOUT);
  });

  describe('Update Voting Schedule', () => {
    test('should update voting schedule (poll owner)', async () => {
      const authClient = createAuthClient(authToken);

      const scheduleUpdates = {
        voting_days_of_week: [1, 2, 3], // Monday-Wednesday
        voting_time_start: '10:00:00',
        voting_time_end: '16:00:00',
        vote_frequency_type: 'weekly',
        vote_frequency_value: 2
      };

      const response = await authClient.put(`/polls/${testPoll.id}/voting-schedule`, scheduleUpdates);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.votingDaysOfWeek).toEqual([1, 2, 3]);
      expect(response.data.data.votingTimeStart).toBe('10:00:00');
      expect(response.data.data.votingTimeEnd).toBe('16:00:00');
      expect(response.data.data.voteFrequencyType).toBe('weekly');
      expect(response.data.data.voteFrequencyValue).toBe(2);

      console.warn(`✅ Updated voting schedule for poll ${testPoll.id}`);
    }, TEST_TIMEOUT);

    test('should update allow_revote setting', async () => {
      const authClient = createAuthClient(authToken);

      const scheduleUpdates = {
        allow_revote: true
      };

      const response = await authClient.put(`/polls/${testPoll.id}/voting-schedule`, scheduleUpdates);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.allowRevote).toBe(true);

      console.warn(`✅ Updated allow_revote setting for poll ${testPoll.id}`);
    }, TEST_TIMEOUT);

    test('should reject unauthorized voting schedule update', async () => {
      // Create another user
      const client = createAuthClient();
      const userData = {
        email: `schedule-test-2-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        first_name: 'Schedule2',
        last_name: 'Tester',
        role: 'user'
      };

      const signupResponse = await client.post('/auth/register', userData);
      createdResources.users.push(signupResponse.data.data.user_id);

      const loginResponse = await client.post('/auth/login', {
        identifier: userData.email,
        password: userData.password
      });
      const unauthorizedToken = loginResponse.data.data.access_token;

      const unauthorizedClient = createAuthClient(unauthorizedToken);

      try {
        await unauthorizedClient.put(`/polls/${testPoll.id}/voting-schedule`, {
          vote_frequency_type: 'unlimited'
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.message).toContain('Not authorized');
      }

      console.warn(`✅ Rejected unauthorized voting schedule update`);
    }, TEST_TIMEOUT);

    test('should reject invalid voting schedule values', async () => {
      const authClient = createAuthClient(authToken);

      const invalidUpdates = {
        voting_days_of_week: [0, 7], // 7 is invalid (should be 0-6)
      };

      try {
        await authClient.put(`/polls/${testPoll.id}/voting-schedule`, invalidUpdates);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(422);
        expect(error.response.data.message).toContain('Validation failed');
      }

      console.warn(`✅ Rejected invalid voting days of week`);
    }, TEST_TIMEOUT);
  });

  describe('Voting Eligibility', () => {
    let votingNowPoll = null;

    beforeAll(async () => {
      const authClient = createAuthClient(authToken);

      // Create a poll that allows voting right now
      const pollData = {
        question: 'Can you vote on this poll right now?',
        poll_type: 'yesno',
        category: 'Test',
        duration: '7d',
        options: [
          { label: 'Yes', position: 0 },
          { label: 'No', position: 1 }
        ],
        voting_starts_at: getPastDate(1), // Started 1 hour ago
        voting_ends_at: getFutureDate(24), // Ends in 24 hours
        allow_revote: false,
        vote_frequency_type: 'once',
        vote_frequency_value: 1
      };

      const response = await authClient.post('/polls', pollData);
      votingNowPoll = response.data.data;
      createdResources.polls.push(votingNowPoll.id);

      console.warn(`✅ Created poll for eligibility testing: ${votingNowPoll.id}`);
    }, TEST_TIMEOUT);

    test('should check voting eligibility for eligible user', async () => {
      const authClient = createAuthClient(authToken);

      const response = await authClient.get(`/polls/${votingNowPoll.id}/voting-eligibility`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.allowed).toBe(true);
      expect(response.data.data.reason).toContain('can vote');
      expect(response.data.data).toHaveProperty('schedule');
      expect(response.data.data.schedule.voteFrequencyType).toBe('once');

      console.warn(`✅ User is eligible to vote on poll ${votingNowPoll.id}`);
    }, TEST_TIMEOUT);

    test('should submit vote when eligible', async () => {
      const authClient = createAuthClient(authToken);

      const voteData = {
        option_id: votingNowPoll.options[0].id // Vote "Yes"
      };

      const response = await authClient.post(`/polls/${votingNowPoll.id}/responses`, voteData);

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.option_id).toBe(votingNowPoll.options[0].id);

      console.warn(`✅ Successfully voted on poll ${votingNowPoll.id}`);
    }, TEST_TIMEOUT);

    test('should reject second vote when frequency is "once"', async () => {
      const authClient = createAuthClient(authToken);

      const voteData = {
        option_id: votingNowPoll.options[1].id // Try to vote "No"
      };

      try {
        await authClient.post(`/polls/${votingNowPoll.id}/responses`, voteData);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.message).toContain('already voted');
      }

      console.warn(`✅ Rejected second vote on "once" frequency poll`);
    }, TEST_TIMEOUT);

    test('should show user as ineligible after voting', async () => {
      const authClient = createAuthClient(authToken);

      const response = await authClient.get(`/polls/${votingNowPoll.id}/voting-eligibility`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.allowed).toBe(false);
      expect(response.data.data.reason).toContain('already voted');

      console.warn(`✅ User is now ineligible after voting on poll ${votingNowPoll.id}`);
    }, TEST_TIMEOUT);
  });

  describe('Time-Based Voting Restrictions', () => {
    test('should reject vote when voting has not started yet', async () => {
      const authClient = createAuthClient(authToken);

      // Create poll that starts in the future
      const pollData = {
        question: 'This poll has not started yet',
        poll_type: 'yesno',
        category: 'Test',
        duration: '7d',
        options: [
          { label: 'Yes', position: 0 },
          { label: 'No', position: 1 }
        ],
        voting_starts_at: getFutureDate(24), // Starts in 24 hours
        voting_ends_at: getFutureDate(48), // Ends in 48 hours
        vote_frequency_type: 'once'
      };

      const createResponse = await authClient.post('/polls', pollData);
      const futurePoll = createResponse.data.data;
      createdResources.polls.push(futurePoll.id);

      // Try to vote
      try {
        await authClient.post(`/polls/${futurePoll.id}/responses`, {
          option_id: futurePoll.options[0].id
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.message).toContain('not started');
      }

      console.warn(`✅ Rejected vote on poll that hasn't started yet`);
    }, TEST_TIMEOUT);

    test('should reject vote when voting has ended', async () => {
      const authClient = createAuthClient(authToken);

      // Create poll that has already ended
      const pollData = {
        question: 'This poll has ended',
        poll_type: 'yesno',
        category: 'Test',
        duration: '7d',
        options: [
          { label: 'Yes', position: 0 },
          { label: 'No', position: 1 }
        ],
        voting_starts_at: getPastDate(48), // Started 48 hours ago
        voting_ends_at: getPastDate(1), // Ended 1 hour ago
        vote_frequency_type: 'once'
      };

      const createResponse = await authClient.post('/polls', pollData);
      const endedPoll = createResponse.data.data;
      createdResources.polls.push(endedPoll.id);

      // Try to vote
      try {
        await authClient.post(`/polls/${endedPoll.id}/responses`, {
          option_id: endedPoll.options[0].id
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.message).toContain('ended');
      }

      console.warn(`✅ Rejected vote on poll that has ended`);
    }, TEST_TIMEOUT);
  });

  describe('Frequency-Based Voting', () => {
    test('should allow unlimited votes when frequency is "unlimited"', async () => {
      const authClient = createAuthClient(authToken);

      // Create poll with unlimited voting
      const pollData = {
        question: 'Vote as many times as you want!',
        poll_type: 'multipleChoice',
        category: 'Test',
        duration: '7d',
        options: [
          { label: 'Option A', position: 0 },
          { label: 'Option B', position: 1 }
        ],
        allow_revote: true,
        vote_frequency_type: 'unlimited'
      };

      const createResponse = await authClient.post('/polls', pollData);
      const unlimitedPoll = createResponse.data.data;
      createdResources.polls.push(unlimitedPoll.id);

      // Vote first time
      const vote1 = await authClient.post(`/polls/${unlimitedPoll.id}/responses`, {
        option_id: unlimitedPoll.options[0].id
      });
      expect(vote1.status).toBe(201);

      // Vote second time (should succeed)
      const vote2 = await authClient.post(`/polls/${unlimitedPoll.id}/responses`, {
        option_id: unlimitedPoll.options[1].id
      });
      expect(vote2.status).toBe(201);

      // Check eligibility (should still be allowed)
      const eligibilityResponse = await authClient.get(`/polls/${unlimitedPoll.id}/voting-eligibility`);
      expect(eligibilityResponse.data.data.allowed).toBe(true);

      console.warn(`✅ Successfully voted multiple times with unlimited frequency`);
    }, TEST_TIMEOUT);

    test('should allow daily voting (vote once per day)', async () => {
      const authClient = createAuthClient(authToken);

      // Create poll with daily voting
      const pollData = {
        question: 'How are you feeling today?',
        poll_type: 'multipleChoice',
        category: 'Test',
        duration: '30d',
        options: [
          { label: 'Great', position: 0 },
          { label: 'Good', position: 1 },
          { label: 'Okay', position: 2 },
          { label: 'Not great', position: 3 }
        ],
        allow_revote: true,
        vote_frequency_type: 'daily',
        vote_frequency_value: 1
      };

      const createResponse = await authClient.post('/polls', pollData);
      const dailyPoll = createResponse.data.data;
      createdResources.polls.push(dailyPoll.id);

      // Vote first time
      const vote1 = await authClient.post(`/polls/${dailyPoll.id}/responses`, {
        option_id: dailyPoll.options[0].id
      });
      expect(vote1.status).toBe(201);

      // Try to vote again immediately (should fail - within same day)
      try {
        await authClient.post(`/polls/${dailyPoll.id}/responses`, {
          option_id: dailyPoll.options[1].id
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.message).toContain('limit reached');
      }

      console.warn(`✅ Daily voting frequency limit enforced correctly`);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling and Validation', () => {
    test('should reject invalid frequency type', async () => {
      const authClient = createAuthClient(authToken);

      const pollData = {
        question: 'Invalid frequency poll',
        poll_type: 'yesno',
        category: 'Test',
        duration: '7d',
        options: [
          { label: 'Yes', position: 0 },
          { label: 'No', position: 1 }
        ],
        vote_frequency_type: 'invalid_frequency'
      };

      try {
        await authClient.post('/polls', pollData);
        fail('Should have thrown an error');
      } catch (error) {
        // The database constraint should catch this
        expect(error.response.status).toBeGreaterThanOrEqual(400);
      }

      console.warn(`✅ Rejected invalid frequency type`);
    }, TEST_TIMEOUT);

    test('should reject invalid time format', async () => {
      const authClient = createAuthClient(authToken);

      const scheduleUpdates = {
        voting_time_start: '25:00:00' // Invalid hour
      };

      try {
        await authClient.put(`/polls/${testPoll.id}/voting-schedule`, scheduleUpdates);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(422);
        expect(error.response.data.message).toContain('Validation failed');
      }

      console.warn(`✅ Rejected invalid time format`);
    }, TEST_TIMEOUT);

    test('should reject negative frequency value', async () => {
      const authClient = createAuthClient(authToken);

      const scheduleUpdates = {
        vote_frequency_value: -1
      };

      try {
        await authClient.put(`/polls/${testPoll.id}/voting-schedule`, scheduleUpdates);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(422);
        expect(error.response.data.message).toContain('Validation failed');
      }

      console.warn(`✅ Rejected negative frequency value`);
    }, TEST_TIMEOUT);

    test('should reject getting voting eligibility for non-existent poll', async () => {
      const authClient = createAuthClient(authToken);

      try {
        await authClient.get('/polls/00000000-0000-0000-0000-000000000000/voting-eligibility');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.message).toContain('not found');
      }

      console.warn(`✅ Rejected voting eligibility check for non-existent poll`);
    }, TEST_TIMEOUT);

    test('should reject getting voting schedule for non-existent poll', async () => {
      const client = createAuthClient();

      try {
        await client.get('/polls/00000000-0000-0000-0000-000000000000/voting-schedule');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.message).toContain('not found');
      }

      console.warn(`✅ Rejected voting schedule retrieval for non-existent poll`);
    }, TEST_TIMEOUT);
  });

  describe('Complex Voting Schedule Scenarios', () => {
    test('should enforce business hours poll (Mon-Fri, 9-5)', async () => {
      const authClient = createAuthClient(authToken);

      const pollData = {
        question: 'Office poll: What should we have for team lunch?',
        poll_type: 'multipleChoice',
        category: 'Office',
        duration: '7d',
        options: [
          { label: 'Pizza', position: 0 },
          { label: 'Burgers', position: 1 },
          { label: 'Salads', position: 2 }
        ],
        voting_days_of_week: [1, 2, 3, 4, 5], // Monday-Friday
        voting_time_start: '09:00:00',
        voting_time_end: '17:00:00',
        vote_frequency_type: 'once'
      };

      const createResponse = await authClient.post('/polls', pollData);
      const businessPoll = createResponse.data.data;
      createdResources.polls.push(businessPoll.id);

      // Get voting schedule to verify
      const scheduleResponse = await authClient.get(`/polls/${businessPoll.id}/voting-schedule`);
      expect(scheduleResponse.data.data.votingDaysOfWeek).toEqual([1, 2, 3, 4, 5]);
      expect(scheduleResponse.data.data.votingTimeStart).toBe('09:00:00');
      expect(scheduleResponse.data.data.votingTimeEnd).toBe('17:00:00');

      console.warn(`✅ Created business hours poll with proper restrictions`);
    }, TEST_TIMEOUT);

    test('should create event-specific poll (specific date range)', async () => {
      const authClient = createAuthClient(authToken);

      const pollData = {
        question: 'Live event poll: Which session are you attending?',
        poll_type: 'multipleChoice',
        category: 'Events',
        duration: '30d',
        options: [
          { label: 'Morning keynote', position: 0 },
          { label: 'Afternoon workshop', position: 1 },
          { label: 'Evening networking', position: 2 }
        ],
        voting_starts_at: getFutureDate(24), // Event in 1 day
        voting_ends_at: getFutureDate(30), // Event lasts 6 hours
        vote_frequency_type: 'unlimited', // Can change mind during event
        allow_revote: true
      };

      const createResponse = await authClient.post('/polls', pollData);
      const eventPoll = createResponse.data.data;
      createdResources.polls.push(eventPoll.id);

      // Verify schedule
      const scheduleResponse = await authClient.get(`/polls/${eventPoll.id}/voting-schedule`);
      expect(scheduleResponse.data.data.voteFrequencyType).toBe('unlimited');
      expect(scheduleResponse.data.data.allowRevote).toBe(true);

      console.warn(`✅ Created event-specific poll with time window`);
    }, TEST_TIMEOUT);

    test('should create weekly recurring poll (e.g., weekly mood check)', async () => {
      const authClient = createAuthClient(authToken);

      const pollData = {
        question: 'How productive was your week?',
        poll_type: 'likertScale',
        category: 'Wellness',
        duration: '90d',
        config: {
          scaleType: 'satisfaction',
          scaleRange: 5
        },
        options: [
          { label: 'Strongly Disagree' },
          { label: 'Disagree' },
          { label: 'Neutral' },
          { label: 'Agree' },
          { label: 'Strongly Agree' }
        ],
        vote_frequency_type: 'weekly',
        vote_frequency_value: 1,
        allow_revote: false
      };

      const createResponse = await authClient.post('/polls', pollData);
      const weeklyPoll = createResponse.data.data;
      createdResources.polls.push(weeklyPoll.id);

      // Verify schedule
      const scheduleResponse = await authClient.get(`/polls/${weeklyPoll.id}/voting-schedule`);
      expect(scheduleResponse.data.data.voteFrequencyType).toBe('weekly');
      expect(scheduleResponse.data.data.voteFrequencyValue).toBe(1);

      console.warn(`✅ Created weekly recurring poll`);
    }, TEST_TIMEOUT);
  });

  describe('Poll Editing with Voting Schedule', () => {
    test('should edit poll and update voting schedule', async () => {
      console.warn('\n🧪 Testing poll edit with voting schedule update...');
      const authClient = createAuthClient(authToken);

      // Create a poll with initial voting schedule
      const initialPollData = {
        question: 'What is your favorite season?',
        poll_type: 'multipleChoice',
        category: 'lifestyle',
        options: [
          { label: 'Spring' },
          { label: 'Summer' },
          { label: 'Fall' },
          { label: 'Winter' }
        ],
        voting_days_of_week: [1, 2, 3, 4, 5], // Weekdays only
        voting_time_start: '09:00:00',
        voting_time_end: '17:00:00',
        vote_frequency_type: 'once'
      };

      const createResponse = await authClient.post('/polls', initialPollData);
      const poll = createResponse.data.data;
      createdResources.polls.push(poll.id);

      console.warn(`📝 Created poll ${poll.id} with weekday-only voting`);

      // Verify initial schedule
      const initialSchedule = await authClient.get(`/polls/${poll.id}/voting-schedule`);
      expect(initialSchedule.data.data.votingDaysOfWeek).toEqual([1, 2, 3, 4, 5]);
      expect(initialSchedule.data.data.votingTimeStart).toBe('09:00:00');
      expect(initialSchedule.data.data.votingTimeEnd).toBe('17:00:00');

      // Update the voting schedule to allow all days, 24/7
      const updatedSchedule = {
        voting_days_of_week: [0, 1, 2, 3, 4, 5, 6], // All days
        voting_time_start: '00:00:00',
        voting_time_end: '23:59:59',
        vote_frequency_type: 'daily',
        vote_frequency_value: 1
      };

      const updateResponse = await authClient.put(`/polls/${poll.id}/voting-schedule`, updatedSchedule);
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.success).toBe(true);

      // Verify updated schedule
      const verifySchedule = await authClient.get(`/polls/${poll.id}/voting-schedule`);
      expect(verifySchedule.data.data.votingDaysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(verifySchedule.data.data.votingTimeStart).toBe('00:00:00');
      expect(verifySchedule.data.data.votingTimeEnd).toBe('23:59:59');
      expect(verifySchedule.data.data.voteFrequencyType).toBe('daily');

      console.warn(`✅ Successfully edited poll voting schedule`);
    }, TEST_TIMEOUT);

    test('should remove time restrictions from voting schedule', async () => {
      console.warn('\n🧪 Testing removal of time restrictions...');
      const authClient = createAuthClient(authToken);

      // Create a poll with time restrictions
      const pollData = {
        question: 'Rate your weekend',
        poll_type: 'likertScale',
        category: 'lifestyle',
        config: {
          scaleType: 'satisfaction',
          scaleRange: 5
        },
        options: [
          { label: 'Very Unsatisfied' },
          { label: 'Unsatisfied' },
          { label: 'Neutral' },
          { label: 'Satisfied' },
          { label: 'Very Satisfied' }
        ],
        voting_days_of_week: [6, 0], // Weekends only
        voting_time_start: '10:00:00',
        voting_time_end: '20:00:00'
      };

      const createResponse = await authClient.post('/polls', pollData);
      const poll = createResponse.data.data;
      createdResources.polls.push(poll.id);

      console.warn(`📝 Created poll ${poll.id} with weekend-only voting`);

      // Remove time restrictions - allow voting all day, every day
      const updatedSchedule = {
        voting_days_of_week: [0, 1, 2, 3, 4, 5, 6],
        voting_time_start: '00:00:00',
        voting_time_end: '23:59:59'
      };

      const updateResponse = await authClient.put(`/polls/${poll.id}/voting-schedule`, updatedSchedule);
      expect(updateResponse.status).toBe(200);

      // Verify restrictions were removed
      const schedule = await authClient.get(`/polls/${poll.id}/voting-schedule`);
      expect(schedule.data.data.votingDaysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(schedule.data.data.votingTimeStart).toBe('00:00:00');
      expect(schedule.data.data.votingTimeEnd).toBe('23:59:59');

      console.warn(`✅ Successfully removed time restrictions`);
    }, TEST_TIMEOUT);

    test('should update vote frequency settings', async () => {
      console.warn('\n🧪 Testing vote frequency update...');
      const authClient = createAuthClient(authToken);

      // Create a poll with "once" voting
      const pollData = {
        question: 'What is your mood today?',
        poll_type: 'multipleChoice',
        category: 'lifestyle',
        options: [
          { label: 'Happy' },
          { label: 'Sad' },
          { label: 'Excited' },
          { label: 'Tired' }
        ],
        vote_frequency_type: 'once'
      };

      const createResponse = await authClient.post('/polls', pollData);
      const poll = createResponse.data.data;
      createdResources.polls.push(poll.id);

      console.warn(`📝 Created poll ${poll.id} with "once" voting`);

      // Change to unlimited voting
      const updatedSchedule = {
        vote_frequency_type: 'unlimited',
        allow_revote: true
      };

      const updateResponse = await authClient.put(`/polls/${poll.id}/voting-schedule`, updatedSchedule);
      expect(updateResponse.status).toBe(200);

      // Verify frequency was updated
      const schedule = await authClient.get(`/polls/${poll.id}/voting-schedule`);
      expect(schedule.data.data.voteFrequencyType).toBe('unlimited');
      expect(schedule.data.data.allowRevote).toBe(true);

      console.warn(`✅ Successfully updated vote frequency to unlimited`);
    }, TEST_TIMEOUT);

    test('should not allow non-owner to edit voting schedule', async () => {
      console.warn('\n🧪 Testing unauthorized voting schedule edit...');

      // Create a second user for unauthorized access test
      const client = createAuthClient();
      const otherUserData = {
        email: `other-user-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        first_name: 'Other',
        last_name: 'User',
        role: 'user'
      };

      const signupResponse = await client.post('/auth/register', otherUserData);
      const otherUser = signupResponse.data.data;
      createdResources.users.push(otherUser.user_id);

      const loginResponse = await client.post('/auth/login', {
        identifier: otherUserData.email,
        password: otherUserData.password
      });
      const otherUserToken = loginResponse.data.data.access_token;
      const otherClient = createAuthClient(otherUserToken);

      // Original user (with authToken) creates a poll
      const ownerClient = createAuthClient(authToken);
      const pollData = {
        question: 'Owner-created poll',
        poll_type: 'multipleChoice',
        category: 'other',
        options: [
          { label: 'Option 1' },
          { label: 'Option 2' }
        ]
      };

      const createResponse = await ownerClient.post('/polls', pollData);
      const poll = createResponse.data.data;
      createdResources.polls.push(poll.id);

      console.warn(`📝 Created poll ${poll.id} by owner`);

      // Other user tries to edit voting schedule
      const updatedSchedule = {
        vote_frequency_type: 'unlimited'
      };

      try {
        await otherClient.put(`/polls/${poll.id}/voting-schedule`, updatedSchedule);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(403);
        expect(error.response.data.message.toLowerCase()).toContain('not authorized');
      }

      console.warn(`✅ Successfully rejected unauthorized edit`);
    }, TEST_TIMEOUT);

    test('should add absolute time window to existing poll', async () => {
      console.warn('\n🧪 Testing adding absolute time window...');
      const authClient = createAuthClient(authToken);

      // Create a poll without time window
      const pollData = {
        question: 'General opinion poll',
        poll_type: 'multipleChoice',
        category: 'other',
        options: [
          { label: 'Yes' },
          { label: 'No' },
          { label: 'Maybe' }
        ]
      };

      const createResponse = await authClient.post('/polls', pollData);
      const poll = createResponse.data.data;
      createdResources.polls.push(poll.id);

      console.warn(`📝 Created poll ${poll.id} without time window`);

      // Add absolute time window
      const futureStart = getFutureDate(1);
      const futureEnd = getFutureDate(72);

      const updatedSchedule = {
        voting_starts_at: futureStart,
        voting_ends_at: futureEnd
      };

      const updateResponse = await authClient.put(`/polls/${poll.id}/voting-schedule`, updatedSchedule);
      expect(updateResponse.status).toBe(200);

      // Verify time window was added
      const schedule = await authClient.get(`/polls/${poll.id}/voting-schedule`);
      expect(schedule.data.data.votingStartsAt).not.toBeNull();
      expect(schedule.data.data.votingEndsAt).not.toBeNull();

      // Verify timestamps are in the expected range (allowing for timezone differences)
      const receivedStart = new Date(schedule.data.data.votingStartsAt);
      const receivedEnd = new Date(schedule.data.data.votingEndsAt);
      const expectedStart = new Date(futureStart);
      const expectedEnd = new Date(futureEnd);

      // Allow 1 hour difference for timezone issues
      const timeDiffStart = Math.abs(receivedStart - expectedStart);
      const timeDiffEnd = Math.abs(receivedEnd - expectedEnd);
      expect(timeDiffStart).toBeLessThanOrEqual(60 * 60 * 1000); // Less than or equal to 1 hour
      expect(timeDiffEnd).toBeLessThanOrEqual(60 * 60 * 1000); // Less than or equal to 1 hour

      console.warn(`✅ Successfully added absolute time window`);
    }, TEST_TIMEOUT);
  });
});
