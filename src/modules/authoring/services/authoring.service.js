const pool = require('../../../db/pool');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const csv = require('csv-parser');
const { createReadStream } = require('fs');
const UserActivityService = require('../../users/services/user-activity.service');

/**
 * Create multiple polls in bulk
 */
const createBulkPolls = async (polls, userId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const createdPolls = [];
    const errors = [];
    
    for (let i = 0; i < polls.length; i++) {
      const poll = polls[i];
      
      try {
        // Validate required fields
        if (!poll.question || !poll.options || !Array.isArray(poll.options) || poll.options.length < 2) {
          errors.push({
            index: i,
            error: 'Poll must have a question and at least 2 options'
          });
          continue;
        }

        const pollId = uuidv4();
        
        // Insert poll
        const pollResult = await client.query(
          `INSERT INTO polls (id, question, created_by, poll_type, is_public, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING *`,
          [
            pollId,
            poll.question,
            userId,
            poll.poll_type || 'multiple_choice',
            poll.is_public !== false, // Default to true
            poll.expires_at || null
          ]
        );

        // Insert options
        const optionPromises = poll.options.map((option, index) => {
          const optionId = uuidv4();
          return client.query(
            `INSERT INTO poll_options (id, poll_id, option_text, option_order, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [optionId, pollId, option, index]
          );
        });

        await Promise.all(optionPromises);
        
        createdPolls.push({
          index: i,
          poll: pollResult.rows[0]
        });
        
      } catch (error) {
        errors.push({
          index: i,
          error: error.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    // Log bulk creation activity using existing activity tracking
    if (createdPolls.length > 0) {
      await UserActivityService.createBulkPollActivity(userId, createdPolls.length, errors.length);
    }
    
    return {
      created: createdPolls,
      errors: errors,
      summary: {
        total_attempted: polls.length,
        successful: createdPolls.length,
        failed: errors.length
      }
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Create multiple stories in bulk
 */
const createBulkStories = async (stories, userId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const createdStories = [];
    const errors = [];
    
    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      
      try {
        // Validate required fields
        if (!story.title || !story.content) {
          errors.push({
            index: i,
            error: 'Story must have a title and content'
          });
          continue;
        }

        const storyId = uuidv4();
        
        // Insert story
        const storyResult = await client.query(
          `INSERT INTO context_sources (id, title, content, created_by, is_public, source_type, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING *`,
          [
            storyId,
            story.title,
            story.content,
            userId,
            story.is_public !== false, // Default to true
            story.source_type || 'article'
          ]
        );
        
        createdStories.push({
          index: i,
          story: storyResult.rows[0]
        });
        
      } catch (error) {
        errors.push({
          index: i,
          error: error.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    // Log bulk creation activity using existing activity tracking
    if (createdStories.length > 0) {
      await UserActivityService.createBulkStoryActivity(userId, createdStories.length, errors.length);
    }
    
    return {
      created: createdStories,
      errors: errors,
      summary: {
        total_attempted: stories.length,
        successful: createdStories.length,
        failed: errors.length
      }
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get templates for bulk creation
 */
const getTemplates = async () => {
  return {
    poll_template: {
      question: "Your poll question here",
      options: ["Option 1", "Option 2", "Option 3"],
      poll_type: "multiple_choice",
      is_public: true,
      expires_at: null
    },
    story_template: {
      title: "Your story title here",
      content: "Your story content here...",
      source_type: "article",
      is_public: true
    },
    bulk_poll_example: [
      {
        question: "What's your favorite programming language?",
        options: ["JavaScript", "Python", "Java", "C++"],
        poll_type: "multiple_choice",
        is_public: true
      },
      {
        question: "How often do you code?",
        options: ["Daily", "Weekly", "Monthly", "Rarely"],
        poll_type: "multiple_choice",
        is_public: true
      }
    ],
    bulk_story_example: [
      {
        title: "The Future of AI",
        content: "Artificial Intelligence is rapidly evolving...",
        source_type: "article",
        is_public: true
      },
      {
        title: "Climate Change Solutions",
        content: "Innovative approaches to combat climate change...",
        source_type: "article",
        is_public: true
      }
    ]
  };
};

/**
 * Get authoring activity history for a user using the existing activity tracking system
 */
const getAuthoringHistory = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  
  // Get authoring-related activities directly from the database
  const result = await pool.query(
    `SELECT * FROM user_activities 
     WHERE user_id = $1 
     AND activity_type IN ('bulk_polls_created', 'bulk_stories_created', 'bulk_creation_completed', 'wizard_poll_created', 'wizard_story_created')
     ORDER BY created_at DESC 
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM user_activities 
     WHERE user_id = $1 
     AND activity_type IN ('bulk_polls_created', 'bulk_stories_created', 'bulk_creation_completed', 'wizard_poll_created', 'wizard_story_created')`,
    [userId]
  );

  return {
    history: result.rows.map(activity => ({
      id: activity.id,
      activity_type: activity.activity_type,
      title: activity.title,
      description: activity.description,
      metadata: activity.metadata,
      created_at: activity.created_at
    })),
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count),
      pages: Math.ceil(countResult.rows[0].count / limit)
    }
  };
};

/**
 * Process uploaded file for bulk creation
 */
const processUploadedFile = async (file, contentType, userId) => {
  try {
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    let data;

    if (fileExtension === 'json') {
      const fileContent = await fs.readFile(file.path, 'utf8');
      data = JSON.parse(fileContent);
    } else if (fileExtension === 'csv') {
      data = await parseCSVFile(file.path, contentType);
    } else {
      throw new Error('Unsupported file format. Only JSON and CSV files are supported.');
    }

    // Clean up uploaded file
    await fs.unlink(file.path);

    // Process the data based on content type
    if (contentType === 'polls') {
      return await createBulkPolls(data, userId);
    } else if (contentType === 'stories') {
      return await createBulkStories(data, userId);
    }

  } catch (error) {
    // Clean up file on error
    try {
      await fs.unlink(file.path);
    } catch (unlinkError) {
      console.error('Error cleaning up file:', unlinkError);
    }
    throw error;
  }
};

/**
 * Parse CSV file based on content type
 */
const parseCSVFile = (filePath, contentType) => {
  return new Promise((resolve, reject) => {
    const results = [];
    
    createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          if (contentType === 'polls') {
            // Expected CSV format for polls: question, option1, option2, option3, ..., poll_type, is_public
            const question = row.question;
            const options = [];
            
            // Extract options (option1, option2, etc.)
            Object.keys(row).forEach(key => {
              if (key.startsWith('option') && row[key]) {
                options.push(row[key]);
              }
            });

            if (question && options.length >= 2) {
              results.push({
                question,
                options,
                poll_type: row.poll_type || 'multiple_choice',
                is_public: row.is_public !== 'false'
              });
            }
          } else if (contentType === 'stories') {
            // Expected CSV format for stories: title, content, source_type, is_public
            if (row.title && row.content) {
              results.push({
                title: row.title,
                content: row.content,
                source_type: row.source_type || 'article',
                is_public: row.is_public !== 'false'
              });
            }
          }
        } catch (error) {
          console.error('Error parsing CSV row:', error);
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

/**
 * Create single poll using wizard
 */
const createPollWithWizard = async (wizardData, userId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { 
      question, 
      options, 
      poll_type, 
      is_public, 
      expires_at, 
      context_sources,
      category,
      duration,
      description,
      // Likert scale specific
      likert_scale_type,
      // Slider specific
      slider_min,
      slider_max,
      slider_unit,
      // Multi-select specific
      max_selections,
      // A/B test specific
      test_mode,
      // Gamified specific
      game_mode,
      // Prediction market specific
      prediction_description,
      prediction_datetime,
      // Map-based specific
      map_locations,
      // Timeline specific
      time_points
    } = wizardData;
    
    // Validate required fields
    if (!question) {
      throw new Error('Poll question is required');
    }

    // Validate options based on poll type (some types auto-generate options)
    const needsCustomOptions = ['multipleChoice', 'multiSelect', 'ranking', 'abcTest', 'gamified'];
    if (needsCustomOptions.includes(poll_type) && (!options || !Array.isArray(options) || options.length < 2)) {
      throw new Error(`${poll_type} polls must have at least 2 options`);
    }

    const pollId = uuidv4();
    
    // Calculate expiry date if duration is provided
    let expiresAt = null;
    if (duration) {
      const now = new Date();
      if (duration.endsWith('h')) {
        now.setHours(now.getHours() + parseInt(duration));
      } else if (duration.endsWith('d')) {
        now.setDate(now.getDate() + parseInt(duration));
      }
      expiresAt = now;
    }
    
    // Build configuration object based on poll type
    let config = {};
    if (poll_type === 'likertScale') {
      config = { scaleType: likert_scale_type || 'agreement', scaleRange: 5 };
    } else if (poll_type === 'slider') {
      config = { 
        sliderMin: slider_min || 0, 
        sliderMax: slider_max || 100, 
        unit: slider_unit || '' 
      };
    } else if (poll_type === 'multiSelect') {
      config = { maxSelections: max_selections || 3 };
    } else if (poll_type === 'abcTest') {
      config = { testMode: test_mode || 'sideBySide' };
    } else if (poll_type === 'gamified') {
      config = { gameMode: game_mode || 'spinToVote' };
    } else if (poll_type === 'predictionMarket') {
      config = { predictionType: 'percentage' };
    } else if (poll_type === 'mapBased') {
      config = { mapType: 'usa_states' };
    } else if (poll_type === 'timeline') {
      config = { timePoints: time_points || ['Before', 'After'] };
    }
    
    // Insert poll using the seeder format
    const pollResult = await client.query(
      `INSERT INTO polls (id, user_id, title, question, description, poll_type, category, config, status, visibility, duration, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING *`,
      [
        pollId,
        userId,
        question, // Use question as title
        question,
        description || null,
        poll_type || 'yesno',
        category || 'General',
        JSON.stringify(config),
        'active',
        is_public !== false ? 'public' : 'private',
        duration || null,
        expiresAt
      ]
    );

    // Insert options based on poll type
    if (poll_type === 'yesno' || poll_type === 'binaryWithExplanation') {
      const yesNoOptions = [
        { label: 'Yes', position: 0 },
        { label: 'No', position: 1 }
      ];
      for (const option of yesNoOptions) {
        const optionId = uuidv4();
        await client.query(
          `INSERT INTO poll_options (id, poll_id, label, position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [optionId, pollId, option.label, option.position]
        );
      }
    } else if (poll_type === 'likertScale') {
      // Generate Likert scale options based on scale type
      const scaleLabels = {
        agreement: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
        satisfaction: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'],
        concern: ['Not at all concerned', 'Slightly concerned', 'Moderately concerned', 'Very concerned', 'Extremely concerned'],
        frequency: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
        importance: ['Not Important', 'Slightly Important', 'Moderately Important', 'Very Important', 'Extremely Important']
      };
      const labels = scaleLabels[likert_scale_type] || scaleLabels.agreement;
      
      for (let i = 0; i < labels.length; i++) {
        const optionId = uuidv4();
        await client.query(
          `INSERT INTO poll_options (id, poll_id, label, position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [optionId, pollId, labels[i], i]
        );
      }
    } else if (poll_type === 'agreementDistribution') {
      const agreementOptions = [
        { label: 'Strongly Support', position: 0 },
        { label: 'Support', position: 1 },
        { label: 'Neutral', position: 2 },
        { label: 'Oppose', position: 3 },
        { label: 'Strongly Oppose', position: 4 }
      ];
      for (const option of agreementOptions) {
        const optionId = uuidv4();
        await client.query(
          `INSERT INTO poll_options (id, poll_id, label, position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [optionId, pollId, option.label, option.position]
        );
      }
    } else if (options && Array.isArray(options)) {
      // Handle custom options for other poll types
      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (option && option.trim()) {
          const optionId = uuidv4();
          await client.query(
            `INSERT INTO poll_options (id, poll_id, label, position, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [optionId, pollId, option.trim(), i]
          );
        }
      }
    }
    
    // Link context sources if provided
    if (context_sources && Array.isArray(context_sources)) {
      const contextPromises = context_sources.map(contextId => 
        client.query(
          `INSERT INTO poll_context_links (poll_id, source_id, display_position, is_required, order_index)
           VALUES ($1, $2, $3, $4, $5)`,
          [pollId, contextId, 'pre_poll', false, 0]
        )
      );
      await Promise.all(contextPromises);
    }
    
    await client.query('COMMIT');
    
    // Log wizard poll creation activity
    await UserActivityService.createWizardPollActivity(userId, pollResult.rows[0].id, pollResult.rows[0].question);
    
    return {
      poll: pollResult.rows[0],
      success: true,
      message: 'Poll created successfully with wizard'
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Create single story using wizard
 */
const createStoryWithWizard = async (wizardData, userId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { 
      title, 
      summary, 
      source_type, 
      author, 
      publisher, 
      source_url, 
      publication_date, 
      credibility_score, 
      tags, 
      blocks 
    } = wizardData;
    
    // Validate required fields
    if (!title) {
      throw new Error('Story title is required');
    }

    if (title.length < 5) {
      throw new Error('Title must be at least 5 characters');
    }

    if (credibility_score !== undefined && (credibility_score < 0 || credibility_score > 10)) {
      throw new Error('Credibility score must be between 0 and 10');
    }

    const storyId = uuidv4();
    
    // Insert context source using the full schema
    const storyResult = await client.query(
      `INSERT INTO context_sources (id, created_by, source_type, title, summary, author, publisher, source_url, publication_date, credibility_score, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        storyId,
        userId,
        source_type || 'story',
        title,
        summary || null,
        author || null,
        publisher || null,
        source_url || null,
        publication_date || null,
        credibility_score || null,
        tags || null
      ]
    );
    
    // Insert content blocks if provided
    if (blocks && Array.isArray(blocks)) {
      for (const block of blocks) {
        const blockId = uuidv4();
        await client.query(
          `INSERT INTO context_blocks (id, source_id, block_type, content, order_index, display_config, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            blockId,
            storyId,
            block.block_type || 'text',
            block.content || '',
            block.order_index || 0,
            JSON.stringify(block.metadata || {})
          ]
        );
      }
    } else if (summary) {
      // If no blocks provided but summary exists, create a default text block
      const blockId = uuidv4();
      await client.query(
        `INSERT INTO context_blocks (id, source_id, block_type, content, order_index, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [blockId, storyId, 'text', summary, 0]
      );
    }
    
    await client.query('COMMIT');
    
    // Log wizard story creation activity
    await UserActivityService.createWizardStoryActivity(userId, storyResult.rows[0].id, storyResult.rows[0].title);
    
    return {
      story: storyResult.rows[0],
      success: true,
      message: 'Context source created successfully with wizard'
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Create content using wizard (single item creation)
 */
const createWithWizard = async (wizardType, wizardData, userId) => {
  switch (wizardType) {
    case 'poll_wizard':
    case 'quick_poll_wizard':
    case 'advanced_poll_wizard':
      return await createPollWithWizard(wizardData, userId);
    case 'story_wizard':
      return await createStoryWithWizard(wizardData, userId);
    default:
      throw new Error(`Unknown wizard type: ${wizardType}`);
  }
};

/**
 * Get wizard configurations and templates
 */
const getWizardConfigurations = async () => {
  return {
    poll_wizard: {
      name: 'Poll Creation Wizard',
      description: 'Step-by-step guided poll creation with all poll types',
      steps: [
        {
          step: 1,
          title: 'Poll Type & Question',
          fields: [
            { 
              name: 'poll_type', 
              type: 'select', 
              required: true, 
              label: 'Poll Type', 
              options: [
                'yesno', 'multipleChoice', 'multiSelect', 'ranking', 'likertScale', 'slider',
                'imageBased', 'abcTest', 'openEnded', 'predictionMarket', 'agreementDistribution',
                'mapBased', 'timeline', 'binaryWithExplanation', 'gamified'
              ], 
              default: 'yesno',
              descriptions: {
                'yesno': 'Simple Yes/No question',
                'multipleChoice': 'Choose one from multiple options',
                'multiSelect': 'Choose multiple options',
                'ranking': 'Rank items in order of preference',
                'likertScale': 'Rate on a scale (e.g., Strongly Agree to Strongly Disagree)',
                'slider': 'Select a value on a numeric range',
                'imageBased': 'Vote on images',
                'abcTest': 'Compare different variants',
                'openEnded': 'Free text responses',
                'predictionMarket': 'Predict future outcomes',
                'agreementDistribution': 'Show distribution of agreement',
                'mapBased': 'Vote on geographic locations',
                'timeline': 'Vote on timeline events',
                'binaryWithExplanation': 'Yes/No with explanation required',
                'gamified': 'Gamified voting experience'
              }
            },
            { name: 'question', type: 'textarea', required: true, label: 'Poll Question', placeholder: 'What would you like to ask?', maxLength: 280 },
            { name: 'description', type: 'textarea', required: false, label: 'Description (optional)', placeholder: 'Additional context for your poll' }
          ]
        },
        {
          step: 2,
          title: 'Poll Options & Configuration',
          fields: [
            { name: 'options', type: 'dynamic_array', required: true, label: 'Poll Options', min_items: 2, max_items: 10, conditional: 'poll_type' },
            { name: 'likert_scale_type', type: 'select', required: false, label: 'Scale Type', options: ['agreement', 'satisfaction', 'concern', 'frequency', 'importance'], default: 'agreement', conditional: 'poll_type=likertScale' },
            { name: 'slider_min', type: 'number', required: false, label: 'Minimum Value', default: 0, conditional: 'poll_type=slider' },
            { name: 'slider_max', type: 'number', required: false, label: 'Maximum Value', default: 100, conditional: 'poll_type=slider' },
            { name: 'slider_unit', type: 'text', required: false, label: 'Unit (optional)', placeholder: '%', conditional: 'poll_type=slider' },
            { name: 'max_selections', type: 'number', required: false, label: 'Maximum Selections', default: 3, min: 1, max: 10, conditional: 'poll_type=multiSelect' },
            { name: 'test_mode', type: 'select', required: false, label: 'Test Mode', options: ['sideBySide', 'randomized'], default: 'sideBySide', conditional: 'poll_type=abcTest' },
            { name: 'game_mode', type: 'select', required: false, label: 'Game Mode', options: ['spinToVote', 'swipeToVote', 'streakRewards'], default: 'spinToVote', conditional: 'poll_type=gamified' },
            { name: 'prediction_description', type: 'textarea', required: false, label: 'Prediction Description', placeholder: 'What event are users predicting?', conditional: 'poll_type=predictionMarket' },
            { name: 'prediction_datetime', type: 'datetime', required: false, label: 'Prediction End Date', conditional: 'poll_type=predictionMarket' },
            { name: 'map_locations', type: 'array', required: false, label: 'Locations', min_items: 2, max_items: 10, conditional: 'poll_type=mapBased' },
            { name: 'time_points', type: 'array', required: false, label: 'Time Points', min_items: 2, max_items: 8, conditional: 'poll_type=timeline' }
          ]
        },
        {
          step: 3,
          title: 'Settings & Publishing',
          fields: [
            { name: 'category', type: 'select', required: true, label: 'Category', options: ['Technology', 'Politics', 'Society', 'Business', 'Environment', 'Lifestyle', 'Sports', 'Entertainment'], default: 'Technology' },
            { name: 'duration', type: 'select', required: true, label: 'Duration', options: ['1h', '6h', '1d', '3d', '7d', '14d', '30d'], default: '1d' },
            { name: 'is_public', type: 'boolean', required: false, label: 'Make Public', default: true },
            { name: 'context_sources', type: 'multiselect', required: false, label: 'Link to Context Sources (optional)' }
          ]
        }
      ],
      example: {
        question: 'What is your favorite programming language?',
        options: ['JavaScript', 'Python', 'Java', 'C++'],
        poll_type: 'multipleChoice',
        category: 'Technology',
        duration: '7d',
        is_public: true,
        context_sources: []
      }
    },
    story_wizard: {
      name: 'Context Source Creation Wizard',
      description: 'Step-by-step guided context source creation with rich content blocks',
      steps: [
        {
          step: 1,
          title: 'Basic Information',
          fields: [
            { 
              name: 'source_type', 
              type: 'select', 
              required: true, 
              label: 'Source Type', 
              options: ['research', 'news_article', 'blog_post', 'whitepaper', 'dataset', 'report', 'story', 'study', 'survey'], 
              default: 'research',
              descriptions: {
                'research': 'Academic research paper',
                'news_article': 'News article or report',
                'blog_post': 'Blog post or opinion piece',
                'whitepaper': 'Technical whitepaper',
                'dataset': 'Data collection or dataset',
                'report': 'Official report or analysis',
                'story': 'Narrative story or case study',
                'study': 'Research study or investigation',
                'survey': 'Survey results or analysis'
              }
            },
            { name: 'title', type: 'text', required: true, label: 'Title', placeholder: 'Enter a descriptive title', minLength: 5 },
            { name: 'summary', type: 'richtext', required: false, label: 'Summary (optional)', placeholder: 'Brief summary of the content' }
          ]
        },
        {
          step: 2,
          title: 'Source Details',
          fields: [
            { name: 'author', type: 'text', required: false, label: 'Author', placeholder: 'Author name' },
            { name: 'publisher', type: 'text', required: false, label: 'Publisher', placeholder: 'Publisher or organization' },
            { name: 'source_url', type: 'url', required: false, label: 'Source URL', placeholder: 'https://example.com/source' },
            { name: 'publication_date', type: 'date', required: false, label: 'Publication Date' },
            { name: 'credibility_score', type: 'number', required: false, label: 'Credibility Score (0-10)', min: 0, max: 10, step: 0.1, placeholder: '8.5' },
            { name: 'tags', type: 'tags', required: false, label: 'Tags', placeholder: 'Add relevant tags' }
          ]
        },
        {
          step: 3,
          title: 'Content Blocks',
          fields: [
            { 
              name: 'blocks', 
              type: 'content_blocks', 
              required: false, 
              label: 'Content Blocks',
              block_types: [
                { value: 'text', label: 'Text', description: 'Rich text content' },
                { value: 'quote', label: 'Quote', description: 'Highlighted quote with optional attribution' },
                { value: 'statistic', label: 'Statistic', description: 'Key statistic or data point' },
                { value: 'key_finding', label: 'Key Finding', description: 'Important finding or conclusion' },
                { value: 'methodology', label: 'Methodology', description: 'Research methodology or approach' },
                { value: 'chart', label: 'Chart', description: 'Chart or graph with image' },
                { value: 'image', label: 'Image', description: 'Image with optional caption' },
                { value: 'video', label: 'Video', description: 'Video content' },
                { value: 'dataset_preview', label: 'Dataset Preview', description: 'Preview of dataset or data' }
              ]
            }
          ]
        }
      ],
      example: {
        title: 'The Future of Remote Work',
        source_type: 'research',
        summary: 'A comprehensive study on remote work trends and productivity.',
        author: 'Dr. Jane Smith',
        publisher: 'Future Work Institute',
        credibility_score: 8.5,
        tags: ['remote-work', 'productivity', 'future-of-work'],
        blocks: [
          {
            block_type: 'text',
            content: 'Remote work has fundamentally changed how we approach productivity and work-life balance.',
            order_index: 0
          },
          {
            block_type: 'statistic',
            content: '73% of workers report higher productivity when working remotely.',
            order_index: 1,
            metadata: { value: '73%' }
          }
        ]
      }
    },
    quick_poll_wizard: {
      name: 'Quick Poll Wizard',
      description: 'Create a simple poll in just 2 steps',
      steps: [
        {
          step: 1,
          title: 'Poll Question & Type',
          fields: [
            { name: 'question', type: 'textarea', required: true, label: 'Poll Question', placeholder: 'What would you like to ask?', maxLength: 280 },
            { name: 'poll_type', type: 'select', required: true, label: 'Poll Type', options: ['yesno', 'multipleChoice', 'multiSelect', 'likertScale'], default: 'yesno' }
          ]
        },
        {
          step: 2,
          title: 'Options & Settings',
          fields: [
            { name: 'options', type: 'dynamic_array', required: true, label: 'Poll Options', min_items: 2, max_items: 5, conditional: 'poll_type' },
            { name: 'category', type: 'select', required: true, label: 'Category', options: ['Technology', 'Politics', 'Society', 'Business', 'Environment', 'Lifestyle', 'Sports', 'Entertainment'], default: 'Technology' },
            { name: 'duration', type: 'select', required: true, label: 'Duration', options: ['1h', '6h', '1d', '3d', '7d'], default: '1d' }
          ]
        }
      ]
    },
    advanced_poll_wizard: {
      name: 'Advanced Poll Wizard',
      description: 'Create complex polls with advanced features and context linking',
      steps: [
        {
          step: 1,
          title: 'Poll Type & Configuration',
          fields: [
            { 
              name: 'poll_type', 
              type: 'select', 
              required: true, 
              label: 'Advanced Poll Type', 
              options: ['imageBased', 'abcTest', 'predictionMarket', 'mapBased', 'timeline', 'gamified'],
              descriptions: {
                'imageBased': 'Users vote on uploaded images',
                'abcTest': 'Compare different variants or options',
                'predictionMarket': 'Predict future outcomes with probability',
                'mapBased': 'Vote on geographic locations',
                'timeline': 'Vote on timeline events or sequences',
                'gamified': 'Engaging gamified voting experience'
              }
            },
            { name: 'question', type: 'textarea', required: true, label: 'Poll Question', placeholder: 'What would you like to ask?', maxLength: 280 },
            { name: 'description', type: 'textarea', required: false, label: 'Description', placeholder: 'Additional context for your poll' }
          ]
        },
        {
          step: 2,
          title: 'Advanced Configuration',
          fields: [
            { name: 'options', type: 'dynamic_array', required: true, label: 'Poll Options', conditional: 'poll_type' },
            { name: 'images', type: 'file_upload', required: false, label: 'Upload Images', accept: 'image/*', multiple: true, maxFiles: 6, conditional: 'poll_type=imageBased' },
            { name: 'test_mode', type: 'select', required: false, label: 'Test Mode', options: ['sideBySide', 'randomized'], default: 'sideBySide', conditional: 'poll_type=abcTest' },
            { name: 'prediction_description', type: 'textarea', required: false, label: 'Prediction Description', conditional: 'poll_type=predictionMarket' },
            { name: 'prediction_datetime', type: 'datetime', required: false, label: 'Prediction End Date', conditional: 'poll_type=predictionMarket' },
            { name: 'map_locations', type: 'array', required: false, label: 'Locations', conditional: 'poll_type=mapBased' },
            { name: 'time_points', type: 'array', required: false, label: 'Time Points', conditional: 'poll_type=timeline' },
            { name: 'game_mode', type: 'select', required: false, label: 'Game Mode', options: ['spinToVote', 'swipeToVote', 'streakRewards'], conditional: 'poll_type=gamified' }
          ]
        },
        {
          step: 3,
          title: 'Context & Publishing',
          fields: [
            { name: 'context_sources', type: 'multiselect', required: false, label: 'Link Context Sources' },
            { name: 'category', type: 'select', required: true, label: 'Category', options: ['Technology', 'Politics', 'Society', 'Business', 'Environment', 'Lifestyle', 'Sports', 'Entertainment'], default: 'Technology' },
            { name: 'duration', type: 'select', required: true, label: 'Duration', options: ['1h', '6h', '1d', '3d', '7d', '14d', '30d'], default: '7d' },
            { name: 'is_public', type: 'boolean', required: false, label: 'Make Public', default: true }
          ]
        }
      ]
    }
  };
};

/**
 * Process bulk creation file following polls.seeder.js format
 */
const processBulkCreationFile = async (file, userId) => {
  try {
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    let data;

    if (fileExtension === 'json') {
      const fileContent = await fs.readFile(file.path, 'utf8');
      data = JSON.parse(fileContent);
    } else if (fileExtension === 'csv') {
      data = await parseBulkCreationCSV(file.path);
    } else {
      throw new Error('Unsupported file format. Only JSON and CSV files are supported.');
    }

    // Clean up uploaded file
    await fs.unlink(file.path);

    // Process the data following polls.seeder.js format
    return await processBulkCreationData(data, userId);

  } catch (error) {
    // Clean up file on error
    try {
      await fs.unlink(file.path);
    } catch (unlinkError) {
      console.error('Error cleaning up file:', unlinkError);
    }
    throw error;
  }
};

/**
 * Process bulk creation data (polls and stories mixed)
 */
const processBulkCreationData = async (data, userId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let createdPolls = 0;
    let createdStories = 0;
    const errors = [];
    const details = [];
    
    // Process polls if provided
    if (data.polls && Array.isArray(data.polls)) {
      for (let i = 0; i < data.polls.length; i++) {
        const pollData = data.polls[i];
        try {
          const poll = await createPollFromSeederFormat(pollData, userId, client);
          createdPolls++;
          details.push({
            type: 'poll',
            id: poll.id,
            question: poll.question,
            poll_type: poll.poll_type
          });
        } catch (error) {
          errors.push(`Poll ${i + 1}: ${error.message}`);
        }
      }
    }
    
    // Process stories/context sources if provided
    if (data.stories && Array.isArray(data.stories)) {
      for (let i = 0; i < data.stories.length; i++) {
        const storyData = data.stories[i];
        try {
          const story = await createStoryFromSeederFormat(storyData, userId, client);
          createdStories++;
          details.push({
            type: 'story',
            id: story.id,
            title: story.title,
            source_type: story.source_type
          });
        } catch (error) {
          errors.push(`Story ${i + 1}: ${error.message}`);
        }
      }
    }
    
    // Process poll-context links if provided
    if (data.poll_context_links && Array.isArray(data.poll_context_links)) {
      for (const link of data.poll_context_links) {
        try {
          await client.query(
            'INSERT INTO poll_context_links (poll_id, source_id, display_position, is_required, order_index) VALUES ($1, $2, $3, $4, $5)',
            [link.poll_id, link.source_id, link.display_position || 'pre_poll', link.is_required || false, link.order_index || 0]
          );
        } catch (error) {
          errors.push(`Poll-context link: ${error.message}`);
        }
      }
    }
    
    await client.query('COMMIT');
    
    // Log bulk creation activity
    if (createdPolls > 0 || createdStories > 0) {
      await UserActivityService.createBulkCreationActivity(userId, createdPolls, createdStories, errors.length);
    }
    
    return {
      created_polls: createdPolls,
      created_stories: createdStories,
      errors,
      details
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Create poll from seeder format
 */
const createPollFromSeederFormat = async (pollData, userId, client) => {
  const pollId = uuidv4();
  
  // Calculate expiry date if duration is provided
  let expiresAt = null;
  if (pollData.duration) {
    const now = new Date();
    const duration = pollData.duration;
    if (duration.endsWith('h')) {
      now.setHours(now.getHours() + parseInt(duration));
    } else if (duration.endsWith('d')) {
      now.setDate(now.getDate() + parseInt(duration));
    }
    expiresAt = now;
  }
  
  // Insert poll
  const pollResult = await client.query(
    `INSERT INTO polls (id, user_id, title, question, description, poll_type, category, config, status, visibility, duration, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
     RETURNING *`,
    [
      pollId,
      userId,
      pollData.question, // Use question as title for now
      pollData.question,
      pollData.description || null,
      pollData.poll_type || 'multipleChoice',
      pollData.category || 'General',
      JSON.stringify(pollData.config || {}),
      'active',
      'public',
      pollData.duration || null,
      expiresAt
    ]
  );
  
  // Insert options if provided
  if (pollData.options && Array.isArray(pollData.options)) {
    for (const option of pollData.options) {
      const optionId = uuidv4();
      await client.query(
        `INSERT INTO poll_options (id, poll_id, label, description, image_url, value, position, variant_name, variant_content, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          optionId,
          pollId,
          option.label,
          option.description || null,
          option.image_url || null,
          option.value || null,
          option.position || 0,
          option.variant_name || null,
          option.variant_content || null
        ]
      );
    }
  }
  
  // Poll stats are automatically initialized by the trigger
  
  return pollResult.rows[0];
};

/**
 * Create story from seeder format (following context test format)
 */
const createStoryFromSeederFormat = async (storyData, userId, client) => {
  const storyId = uuidv4();
  
  // Insert context source
  const storyResult = await client.query(
    `INSERT INTO context_sources (id, created_by, source_type, title, summary, author, publisher, source_url, publication_date, credibility_score, tags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
     RETURNING *`,
    [
      storyId,
      userId,
      storyData.source_type || 'article',
      storyData.title,
      storyData.summary || null,
      storyData.author || null,
      storyData.publisher || null,
      storyData.source_url || null,
      storyData.publication_date || null,
      storyData.credibility_score || null,
      storyData.tags || null
    ]
  );
  
  // Insert blocks if provided
  if (storyData.blocks && Array.isArray(storyData.blocks)) {
    for (const block of storyData.blocks) {
      const blockId = uuidv4();
      await client.query(
        `INSERT INTO context_blocks (id, source_id, block_type, content, order_index, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          blockId,
          storyId,
          block.block_type,
          block.content,
          block.order_index || 0
        ]
      );
    }
  }
  
  return storyResult.rows[0];
};



/**
 * Generate template file for bulk creation
 */
const generateTemplate = async (format) => {
  const templateData = {
    polls: [
      // 1. Yes/No Poll
      {
        question: 'Is remote work more productive?',
        poll_type: 'yesno',
        description: 'The debate continues about whether remote work increases or decreases productivity.',
        category: 'Business',
        duration: '7d',
        config: {},
        options: [
          { label: 'Yes', position: 0 },
          { label: 'No', position: 1 }
        ]
      },

      // 2. Multiple Choice Poll
      {
        question: 'Should AI regulation be stricter?',
        poll_type: 'multipleChoice',
        description: 'As AI technology advances rapidly, many are calling for stricter regulations.',
        category: 'Technology',
        duration: '5d',
        config: {},
        options: [
          { label: 'Much stricter', position: 0 },
          { label: 'Somewhat stricter', position: 1 },
          { label: 'Current level is fine', position: 2 },
          { label: 'Less regulation needed', position: 3 }
        ]
      },

      // 3. Multi-Select Poll
      {
        question: 'Which issues should government prioritize?',
        poll_type: 'multiSelect',
        description: 'Select up to 3 issues you think the government should focus on.',
        category: 'Politics',
        duration: '10d',
        config: { maxSelections: 3 },
        options: [
          { label: 'Climate Change', position: 0 },
          { label: 'Healthcare', position: 1 },
          { label: 'Education', position: 2 },
          { label: 'Economy', position: 3 },
          { label: 'Security', position: 4 }
        ]
      },

      // 4. Ranking Poll
      {
        question: 'Rank the top 5 technology innovations by impact',
        poll_type: 'ranking',
        description: 'Drag and drop to rank these technologies from most to least impactful.',
        category: 'Technology',
        duration: '7d',
        config: {},
        options: [
          { label: 'Artificial Intelligence', position: 0 },
          { label: 'Renewable Energy', position: 1 },
          { label: 'Biotechnology', position: 2 },
          { label: 'Quantum Computing', position: 3 },
          { label: 'Space Exploration', position: 4 }
        ]
      },

      // 5. Likert Scale Poll
      {
        question: 'How concerned are you about climate change?',
        poll_type: 'likertScale',
        description: 'Rate your level of concern about climate change.',
        category: 'Environment',
        duration: '14d',
        config: { scaleType: 'concern', scaleRange: 5 },
        options: [
          { label: 'Not at all concerned', position: 0 },
          { label: 'Slightly concerned', position: 1 },
          { label: 'Moderately concerned', position: 2 },
          { label: 'Very concerned', position: 3 },
          { label: 'Extremely concerned', position: 4 }
        ]
      },

      // 6. Slider Poll
      {
        question: 'How optimistic are you about the economy (0-100)?',
        poll_type: 'slider',
        description: 'Move the slider to indicate your economic outlook.',
        category: 'Business',
        duration: '7d',
        config: { sliderMin: 0, sliderMax: 100, unit: '%' },
        options: []
      },

      // 7. Image-Based Poll
      {
        question: 'Which logo do you prefer?',
        poll_type: 'imageBased',
        description: 'Vote on your preferred logo design.',
        category: 'Design',
        duration: '5d',
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
          }
        ]
      },

      // 8. A/B/C Test Poll
      {
        question: 'Which headline is more convincing?',
        poll_type: 'abcTest',
        description: 'Help us choose the best marketing message for our new product.',
        category: 'Marketing',
        duration: '3d',
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
          }
        ]
      },

      // 9. Open-Ended Poll
      {
        question: 'What is your biggest frustration with public transit?',
        poll_type: 'openEnded',
        description: 'Share your thoughts and frustrations with us.',
        category: 'Transportation',
        duration: '14d',
        config: {},
        options: []
      },

      // 10. Prediction Market Poll
      {
        question: 'What % chance that fuel prices rise in the next quarter?',
        poll_type: 'predictionMarket',
        description: 'Predict the likelihood of fuel prices rising in the next quarter.',
        category: 'Economy',
        duration: '30d',
        config: { predictionType: 'percentage' },
        options: []
      },

      // 11. Agreement Distribution Poll
      {
        question: 'Should government increase renewable energy subsidies?',
        poll_type: 'agreementDistribution',
        description: 'Express your level of agreement with increasing government subsidies.',
        category: 'Environment',
        duration: '21d',
        config: {},
        options: [
          { label: 'Strongly Support', position: 0 },
          { label: 'Support', position: 1 },
          { label: 'Neutral', position: 2 },
          { label: 'Oppose', position: 3 },
          { label: 'Strongly Oppose', position: 4 }
        ]
      },

      // 12. Map-Based Poll
      {
        question: 'Rate healthcare quality in your state',
        poll_type: 'mapBased',
        description: 'Help us create a map of healthcare quality across states.',
        category: 'Healthcare',
        duration: '30d',
        config: { mapType: 'usa_states' },
        options: []
      },

      // 13. Timeline Poll
      {
        question: 'How did your opinion change before/after the policy announcement?',
        poll_type: 'timeline',
        description: 'Track how opinions change over time.',
        category: 'Politics',
        duration: '14d',
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
        category: 'Environment',
        duration: '10d',
        config: {},
        options: [
          { label: 'Yes', position: 0 },
          { label: 'No', position: 1 }
        ]
      },

      // 15. Gamified Poll
      {
        question: 'Spin to vote on your favorite app feature!',
        poll_type: 'gamified',
        description: 'Make voting fun! Spin the wheel to vote.',
        category: 'Technology',
        duration: '7d',
        config: { gameMode: 'spinToVote' },
        options: [
          { label: 'Dark Mode', position: 0 },
          { label: 'Voice Commands', position: 1 },
          { label: 'AI Assistant', position: 2 },
          { label: 'Offline Mode', position: 3 },
          { label: 'Social Sharing', position: 4 }
        ]
      }
    ],
    stories: [
      {
        source_type: 'research',
        title: 'Climate Change Research Study 2024',
        summary: 'A comprehensive study on climate change impacts and mitigation strategies.',
        author: 'Dr. Jane Smith',
        publisher: 'Environmental Research Institute',
        source_url: 'https://example.com/climate-study-2024',
        publication_date: '2024-01-15',
        credibility_score: 8.5,
        tags: ['climate', 'environment', 'research', 'sustainability'],
        blocks: [
          {
            block_type: 'text',
            content: 'This study examines the latest trends in climate change.',
            order_index: 0
          },
          {
            block_type: 'statistic',
            content: 'Global temperature has increased by 1.2°C since pre-industrial times.',
            order_index: 1
          },
          {
            block_type: 'key_finding',
            content: 'Renewable energy adoption must increase by 300% to meet 2030 targets.',
            order_index: 2
          }
        ]
      },
      {
        source_type: 'article',
        title: 'The Future of Remote Work',
        summary: 'How remote work is changing the workplace forever.',
        author: 'John Smith',
        publisher: 'Tech Today',
        source_url: 'https://example.com/remote-work-future',
        publication_date: '2024-02-01',
        credibility_score: 7.8,
        tags: ['remote-work', 'technology', 'workplace', 'productivity'],
        blocks: [
          {
            block_type: 'text',
            content: 'Remote work has fundamentally changed how we approach productivity.',
            order_index: 0
          },
          {
            block_type: 'statistic',
            content: '42% of companies now offer fully remote positions.',
            order_index: 1
          },
          {
            block_type: 'methodology',
            content: 'Data collected from 1,000+ companies across various industries.',
            order_index: 2
          }
        ]
      }
    ]
  };
  
  if (format === 'json') {
    return JSON.stringify(templateData, null, 2);
  } else if (format === 'csv') {
    // Generate CSV format with examples of different poll types
    let csv = 'type,question,option1,option2,option3,option4,option5,poll_type,category,duration,config,title,content,source_type\n';
    csv += 'poll,"Is remote work more productive?",Yes,No,,,,,yesno,Business,7d,{},,,\n';
    csv += 'poll,"Should AI regulation be stricter?","Much stricter","Somewhat stricter","Current level is fine","Less regulation needed",,multipleChoice,Technology,5d,{},,,\n';
    csv += 'poll,"Which issues should government prioritize?","Climate Change",Healthcare,Education,Economy,Security,multiSelect,Politics,10d,"{""maxSelections"": 3}",,,\n';
    csv += 'poll,"How concerned are you about climate change?","Not at all concerned","Slightly concerned","Moderately concerned","Very concerned","Extremely concerned",likertScale,Environment,14d,"{""scaleType"": ""concern"", ""scaleRange"": 5}",,,\n';
    csv += 'poll,"How optimistic are you about the economy (0-100)?",,,,,,,slider,Business,7d,"{""sliderMin"": 0, ""sliderMax"": 100, ""unit"": ""%""}",,,\n';
    csv += 'poll,"What is your biggest frustration with public transit?",,,,,,,openEnded,Transportation,14d,{},,,\n';
    csv += 'story,"","","","","","","","","","","Climate Change Research Study 2024","This study examines the latest trends in climate change.","research"\n';
    csv += 'story,"","","","","","","","","","","The Future of Remote Work","Remote work has fundamentally changed how we approach productivity.","article"\n';
    return csv;
  }
  
  throw new Error('Unsupported format');
};

/**
 * Parse CSV for bulk creation
 */
const parseBulkCreationCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const polls = [];
    const stories = [];
    
    createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          if (row.type === 'poll' && row.question) {
            const options = [];
            Object.keys(row).forEach(key => {
              if (key.startsWith('option') && row[key]) {
                options.push({ label: row[key], position: options.length });
              }
            });
            
            if (options.length >= 2) {
              polls.push({
                question: row.question,
                poll_type: row.poll_type || 'multipleChoice',
                category: row.category || 'General',
                duration: row.duration || null,
                options
              });
            }
          } else if (row.type === 'story' && row.title && row.content) {
            stories.push({
              title: row.title,
              summary: row.content,
              source_type: row.source_type || 'article',
              blocks: [
                {
                  block_type: 'text',
                  content: row.content,
                  order_index: 0
                }
              ]
            });
          }
        } catch (error) {
          console.error('Error parsing CSV row:', error);
        }
      })
      .on('end', () => {
        resolve({ polls, stories });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

module.exports = {
  createBulkPolls,
  createBulkStories,
  processUploadedFile,
  processBulkCreationFile,
  generateTemplate,
  createWithWizard,
  getWizardConfigurations,
  getTemplates,
  getAuthoringHistory,
};