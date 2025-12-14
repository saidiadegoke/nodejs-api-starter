If polls are backed by research, stories, evidence, or context, that context must be:

Structured (not just a blob of text)

Reusable across polls

Versionable

Citable (for B2B trust)

Analytics-aware (prove voters actually engaged with it)

Below is a clean, extensible way to factor this into your poll schema without breaking what you already built.

🎯 Design Principle

A poll does not “own” its context — it references one or more context assets.

This allows:

One research piece → multiple polls

One poll → multiple context pieces

Context updates without poll duplication

🧱 Core Concept: “Poll Context / Evidence Layer”

We introduce three new core entities:

Context Sources (research, articles, stories, datasets)

Context Blocks (how the context is presented)

Poll ↔ Context Link

🧩 1. Context Sources (Canonical Truth)

This represents the source of truth.

context_sources (
  id UUID PRIMARY KEY,
  source_type VARCHAR, 
  -- research, news_article, blog_post, whitepaper, dataset, report, story

  title TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  publisher TEXT,
  source_url TEXT,
  publication_date DATE,

  credibility_score FLOAT, -- optional (AI or editorial)
  tags TEXT[],

  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);


🔹 This lets you say:

“This poll is based on World Bank 2023 Agriculture Report.”

🧱 2. Context Blocks (How It’s Displayed)

Context is rarely shown as one big blob.
This table allows rich storytelling.

context_blocks (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES context_sources(id),

  block_type VARCHAR,
  -- text, quote, image, chart, video, dataset_preview, statistic

  content TEXT,        -- markdown / HTML
  media_url TEXT,      -- images, video
  citation TEXT,       -- inline citation
  order_index INT,

  created_at TIMESTAMP
);


Examples:

Short explanation before the poll

A key statistic

A quote from a report

A chart image

🔗 3. Poll ↔ Context Mapping

A poll can reference multiple context sources.

poll_contexts (
  poll_id UUID REFERENCES polls(id),
  source_id UUID REFERENCES context_sources(id),

  display_position VARCHAR,
  -- pre_poll, inline, post_poll

  is_required BOOLEAN DEFAULT FALSE, 
  -- must read before voting?

  PRIMARY KEY (poll_id, source_id)
);


This enables:

Context shown before voting

Context revealed after voting

Optional or mandatory reading

📊 4. Context Engagement Analytics (Very Important)

To prove value to customers and reward users.

context_engagements (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES context_sources(id),
  poll_id UUID REFERENCES polls(id),
  user_id UUID REFERENCES users(id),

  engagement_type VARCHAR,
  -- view, scroll_complete, click_source, expand, download

  duration_seconds INT,
  created_at TIMESTAMP
);


Now you can answer:

Did voters actually read the research?

Did reading context change vote behavior?

Which sources drive more informed voting?

⭐ Optional but Powerful Extensions
5. Context Versions (for Research Updates)
context_versions (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES context_sources(id),
  version_number INT,
  content_hash TEXT,
  created_at TIMESTAMP
);


Allows:

Research updates without poll deletion

Audit trails (important for politics / policy)

6. AI Summaries (For Fast Consumption)
context_ai_summaries (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES context_sources(id),
  summary_type VARCHAR,
  -- tl;dr, neutral, opposing_view, youth_friendly

  content TEXT,
  created_at TIMESTAMP
);

🧠 How This Fits Your Existing Poll Schema

✅ No breaking changes
✅ Polls stay lightweight
✅ Context becomes reusable
✅ B2B-grade credibility
✅ Analytics-ready

Your poll now looks like:

Poll
 ├── Options
 ├── Votes
 ├── Comments
 ├── Engagements
 ├── Ratings
 └── Context Sources
       ├── Blocks
       ├── Engagements
       └── Versions

🔥 Example User Flow

User opens poll

Reads summary context block

Scrolls through chart & quote

Votes

Shares poll + research

Analytics show:

Context read time

Vote shift after context

Influencers who drove informed engagement