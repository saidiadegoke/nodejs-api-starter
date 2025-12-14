Polls
polls (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title VARCHAR,
  description TEXT,
  poll_type VARCHAR, -- yes_no, multiple_choice, slider, rating, binary_choice, image_choice, etc.
  status VARCHAR DEFAULT 'active', -- draft, active, closed
  cover_image TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);


3. Poll Options
(For formats that require options)
poll_options (
  id UUID PRIMARY KEY,
  poll_id UUID REFERENCES polls(id),
  label TEXT,
  image_url TEXT, -- for image choice polls
  value INT,  -- used for slider or numeric polls
  position INT,
  created_at TIMESTAMP
);


4. Poll Responses
Tracks each user’s answer.
poll_responses (
  id UUID PRIMARY KEY,
  poll_id UUID REFERENCES polls(id),
  user_id UUID REFERENCES users(id),
  option_id UUID NULL REFERENCES poll_options(id),
  numeric_value FLOAT,  -- slider, rating, numeric polls
  text_value TEXT, -- for open-ended polls
  created_at TIMESTAMP
);

🔹 This single table supports ALL poll types.
Yes/No → option_id maps to yes or no


Multi choice → option_id


Slider → numeric_value


Rating → numeric_value


Text response → text_value


Image choice → option_id



5. Comments + Replies
poll_comments (
  id UUID PRIMARY KEY,
  poll_id UUID REFERENCES polls(id),
  user_id UUID REFERENCES users(id),
  parent_comment_id UUID NULL REFERENCES poll_comments(id),
  comment TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

Supports nested replies through parent_comment_id.

6. Poll Ratings
Users can rate a poll (separate from rating inside the poll).
poll_ratings (
  id UUID PRIMARY KEY,
  poll_id UUID REFERENCES polls(id),
  user_id UUID REFERENCES users(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMP
);


7. Likes / Favorites / Reposts / Shares
Instead of multiple tables, use one unified engagement table.
poll_engagements (
  id UUID PRIMARY KEY,
  poll_id UUID REFERENCES polls(id),
  user_id UUID REFERENCES users(id),
  engagement_type VARCHAR, -- like, favorite, repost, share, view, bookmark
  metadata JSONB, -- e.g., share platform, repost target, etc.
  created_at TIMESTAMP
);

This lets you add new engagement types later with no schema changes.

8. Engagement Counts (denormalized counters)
To speed up UI.
poll_stats (
  poll_id UUID PRIMARY KEY REFERENCES polls(id),
  views INT DEFAULT 0,
  likes INT DEFAULT 0,
  favorites INT DEFAULT 0,
  shares INT DEFAULT 0,
  reposts INT DEFAULT 0,
  comments INT DEFAULT 0,
  responses INT DEFAULT 0,
  avg_rating FLOAT DEFAULT 0,
  updated_at TIMESTAMP
);

These fields are updated by triggers, cron, or background jobs.

9. Analytics Events (for rewarding users)
🔥 This is key for your requirement
 “Store each stat in case a user who drives engagement needs to be rewarded.”
engagement_events (
  id UUID PRIMARY KEY,
  poll_id UUID REFERENCES polls(id),
  actor_user_id UUID REFERENCES users(id), -- who performed the event?
  target_user_id UUID REFERENCES users(id), -- poll owner
  event_type VARCHAR, -- like, share, repost, comment, response, view
  metadata JSONB,
  created_at TIMESTAMP
);

Examples:
A user shares a poll → log event


A user brings 30 views → log event


A user comments → log event


A user's repost leads to 50 poll responses → log event


This is how you identify top influencers.

10. Repost Tracking (Chain of influence)
If a user reposts a poll and brings traffic:
poll_reposts (
  id UUID PRIMARY KEY,
  poll_id UUID REFERENCES polls(id),
  reposted_by UUID REFERENCES users(id),
  repost_code VARCHAR UNIQUE, -- track how traffic arrived (like referral)
  created_at TIMESTAMP
);

Then a view/responses table references the repost_code for attribution.

11. Poll Sharing Log
poll_share_logs (
  id UUID PRIMARY KEY,
  poll_id UUID REFERENCES polls(id),
  user_id UUID REFERENCES users(id),
  share_platform VARCHAR, -- twitter, fb, whatsapp, etc.
  created_at TIMESTAMP
);


⭐ Summary of All Functionalities Covered
Feature
Supported Tables
Yes/No
polls, poll_options, poll_responses
Multiple Choice
poll_options, poll_responses
Image Choice
poll_options (image_url), poll_responses
Slider
poll_responses.numeric_value
Star Rating
poll_responses.numeric_value
Text Input
poll_responses.text_value
User comments
poll_comments
Replies
poll_comments with parent_comment_id
Likes
poll_engagements
Favorites
poll_engagements
Reposts
poll_engagements + poll_reposts
Shares
poll_engagements + poll_share_logs
Analytics
poll_stats + engagement_events
Influencer rewards
engagement_events + poll_reposts

