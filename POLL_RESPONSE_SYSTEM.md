# Poll Response System Documentation

Complete guide to the poll response validation, storage, and retrieval system.

## Overview

The poll response system ensures that user responses conform to poll type specifications and stores them in a format optimized for retrieval and aggregation.

## Architecture

### 3-Layer Validation & Formatting System

1. **Validation Layer** (`poll-response.validator.js`)
   - Validates responses based on poll type
   - Ensures data integrity before storage
   - Returns normalized response data

2. **Storage Layer** (`poll-response.model.js`)
   - Stores responses in universal schema
   - Supports all 15 poll types
   - Uses appropriate fields based on poll type

3. **Formatting Layer** (`response-formatter.js`)
   - Transforms stored data for frontend
   - Aggregates results by poll type
   - Provides type-specific analytics

## Response Storage by Poll Type

### Database Schema Fields

The `poll_responses` table has these fields:
- `option_id` - Single option selection (UUID)
- `option_ids` - Multiple option selection (UUID[])
- `numeric_value` - Numeric responses (FLOAT)
- `text_value` - Text responses (TEXT)
- `ranking_data` - Ranking data (JSONB)
- `metadata` - Additional data (JSONB)
- `explanation` - Text explanation (TEXT)

### Storage Mapping

| Poll Type | Primary Field | Additional Fields | Example |
|-----------|--------------|-------------------|---------|
| yesno | option_id | - | `{option_id: "uuid"}` |
| multipleChoice | option_id | - | `{option_id: "uuid"}` |
| multiSelect | option_ids | - | `{option_ids: ["uuid1", "uuid2"]}` |
| ranking | ranking_data | - | `{ranking_data: [{option_id: "uuid", rank: 1}]}` |
| likertScale | option_id | - | `{option_id: "uuid"}` |
| slider | numeric_value | - | `{numeric_value: 75}` |
| imageBased | option_id | - | `{option_id: "uuid"}` |
| abcTest | option_id | - | `{option_id: "uuid"}` |
| openEnded | text_value | metadata (sentiment) | `{text_value: "My response..."}` |
| predictionMarket | numeric_value | - | `{numeric_value: 65}` |
| agreementDistribution | option_id | - | `{option_id: "uuid"}` |
| mapBased | metadata | - | `{metadata: {location: "CA", rating: 4}}` |
| timeline | metadata | - | `{metadata: {timepoint: "Before", value: 50}}` |
| binaryWithExplanation | option_id | explanation | `{option_id: "uuid", explanation: "Because..."}` |
| gamified | option_id | metadata | `{option_id: "uuid"}` |

## Validation Rules by Poll Type

### 1. Yes/No Poll
```javascript
{
  option_id: "uuid" // Must be "Yes" or "No"
}
```
**Rules:**
- Exactly one option required
- Must be one of the two Yes/No options

### 2. Multiple Choice Poll
```javascript
{
  option_id: "uuid"
}
```
**Rules:**
- Exactly one option required
- Option must belong to the poll
- 2-10 options allowed

### 3. Multi-Select Poll
```javascript
{
  option_ids: ["uuid1", "uuid2"]
}
```
**Rules:**
- At least one option required
- Cannot exceed maxSelections
- All option IDs must be valid
- 2-10 options allowed

### 4. Ranking Poll
```javascript
{
  ranking_data: [
    {option_id: "uuid1", rank: 1},
    {option_id: "uuid2", rank: 2},
    {option_id: "uuid3", rank: 3}
  ]
}
```
**Rules:**
- All options must be ranked
- Ranks must be unique
- Ranks must be sequential (1, 2, 3, ...)
- 3-8 items allowed

### 5. Likert Scale Poll
```javascript
{
  option_id: "uuid"
}
```
**Rules:**
- Exactly one scale option required
- Must match scaleRange (5 or 7)
- Valid scaleTypes: agreement, satisfaction, concern, frequency, importance

### 6. Slider Poll
```javascript
{
  numeric_value: 75
}
```
**Rules:**
- Numeric value required
- Must be between sliderMin and sliderMax
- Can be float or integer

### 7. Image-Based Poll
```javascript
{
  option_id: "uuid"
}
```
**Rules:**
- Exactly one image option required
- 2-6 images allowed
- Must have valid image URLs

### 8. A/B/C Test Poll
```javascript
{
  option_id: "uuid"
}
```
**Rules:**
- Exactly one variant required
- 2-5 variants allowed
- Variant content is optional

### 9. Open-Ended Poll
```javascript
{
  text_value: "My response text here"
}
```
**Rules:**
- Text response required
- Minimum 3 characters
- Maximum 5000 characters
- Trimmed automatically

### 10. Prediction Market Poll
```javascript
{
  numeric_value: 65 // Percentage or numeric
}
```
**Rules:**
- Numeric value required
- For percentage: 0-100
- For numeric: any valid number

### 11. Agreement Distribution Poll
```javascript
{
  option_id: "uuid"
}
```
**Rules:**
- Exactly one agreement option required
- Must have 5 options (Strongly Support, Support, Neutral, Oppose, Strongly Oppose)

### 12. Map-Based Poll
```javascript
{
  metadata: {
    location: "California",
    rating: 4 // Optional
  }
}
```
**Rules:**
- Location is required
- Rating is optional (1-5 if provided)
- Valid mapTypes: usa_states, world_countries, custom

### 13. Timeline Poll
```javascript
{
  metadata: {
    timepoint: "Before Announcement",
    value: 50 // Optional sentiment score
  }
}
```
**Rules:**
- Timepoint must be one of the configured timePoints
- Value is optional numeric data

### 14. Binary with Explanation Poll
```javascript
{
  option_id: "uuid",
  explanation: "I chose this because..."
}
```
**Rules:**
- Must select Yes or No
- Explanation is required
- Explanation: 10-1000 characters

### 15. Gamified Poll
```javascript
{
  option_id: "uuid",
  metadata: {} // Optional game state
}
```
**Rules:**
- Exactly one option required
- 2-6 options allowed
- Valid gameModes: spinToVote, swipeToVote, streakRewards

## Response Formatting

### Individual Response Format

Each poll type returns a specific format when retrieved:

#### Single Option Types (yesno, multipleChoice, etc.)
```json
{
  "id": "response-uuid",
  "type": "single_option",
  "selected_option": {
    "id": "option-uuid",
    "label": "Option A"
  },
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### Multi-Select
```json
{
  "id": "response-uuid",
  "type": "multiple_options",
  "selected_options": [
    {"id": "uuid1", "label": "Climate Change"},
    {"id": "uuid2", "label": "Healthcare"}
  ],
  "selection_count": 2
}
```

#### Ranking
```json
{
  "id": "response-uuid",
  "type": "ranking",
  "ranked_items": [
    {"id": "uuid1", "label": "AI", "rank": 1},
    {"id": "uuid2", "label": "Renewable Energy", "rank": 2}
  ]
}
```

#### Numeric (Slider/Prediction)
```json
{
  "id": "response-uuid",
  "type": "numeric",
  "value": 75,
  "min": 0,
  "max": 100,
  "unit": "%"
}
```

### Aggregated Results Format

#### Single Choice Results
```json
{
  "total_responses": 1250,
  "results": [
    {
      "id": "option-uuid",
      "label": "Option A",
      "count": 450,
      "percentage": 36
    }
  ]
}
```

#### Ranking Results
```json
{
  "total_responses": 500,
  "results": [
    {
      "id": "option-uuid",
      "label": "AI",
      "average_rank": 1.45,
      "vote_count": 500
    }
  ]
}
```

#### Numeric Results
```json
{
  "total_responses": 800,
  "average": 67.5,
  "min": 0,
  "max": 100,
  "median": 70,
  "distribution": [
    {"range_start": 0, "range_end": 10, "count": 50},
    {"range_start": 10, "range_end": 20, "count": 75}
  ]
}
```

## API Usage Examples

### Submit a Response

```javascript
// Yes/No Poll
POST /polls/:pollId/responses
{
  "option_id": "uuid"
}

// Multi-Select Poll
POST /polls/:pollId/responses
{
  "option_ids": ["uuid1", "uuid2", "uuid3"]
}

// Slider Poll
POST /polls/:pollId/responses
{
  "numeric_value": 75
}

// Open-Ended Poll
POST /polls/:pollId/responses
{
  "text_value": "This is my response"
}

// Binary with Explanation
POST /polls/:pollId/responses
{
  "option_id": "uuid",
  "explanation": "I chose this because..."
}
```

### Get Poll Results

```javascript
GET /polls/:pollId/results

// Returns aggregated results formatted by poll type
{
  "poll_id": "uuid",
  "poll_type": "multipleChoice",
  "total_responses": 1250,
  "results": [...]
}
```

### Get User's Response

```javascript
GET /polls/:pollId/my-response

// Returns formatted individual response
{
  "id": "response-uuid",
  "type": "single_option",
  "selected_option": {...}
}
```

## Error Handling

All validation errors are returned as:

```json
{
  "success": false,
  "message": "Validation error message; Another error",
  "errors": [
    "Validation error message",
    "Another error"
  ]
}
```

Common validation errors:
- Missing required fields
- Invalid option IDs
- Out of range values
- Duplicate ranks
- Text too long/short
- Exceeded maxSelections

## Performance Considerations

1. **Indexing**: Option lookups are fast due to UUID indexes
2. **Aggregation**: Results are cached when possible
3. **Pagination**: Large response sets use pagination
4. **Lazy Loading**: Metadata is only parsed when needed

## Testing

To test responses for each poll type, use the seeder:

```bash
npm run seed:polls
```

This creates polls with all 15 types and proper configurations.

Then test voting:

```bash
# Create a response
curl -X POST http://localhost:5010/polls/:pollId/responses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"option_id": "uuid"}'

# Get results
curl http://localhost:5010/polls/:pollId/results
```

## Extending the System

To add a new poll type:

1. Add type to `poll-type.validator.js`
2. Add validation in `poll-response.validator.js`
3. Add formatting in `response-formatter.js`
4. Update documentation

The system is designed to be extensible while maintaining type safety.
