-- ============================================================================
-- FILES, LOCATIONS, ORDERS, AND ADDRESSES MANAGEMENT
-- ============================================================================

-- ============================================================================
-- COUNTRIES - Reference table for countries
-- ============================================================================

CREATE TABLE IF NOT EXISTS countries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  iso_code_2 CHAR(2) NOT NULL UNIQUE,          -- ISO 3166-1 alpha-2 (NG, US, GB, etc.)
  iso_code_3 CHAR(3) NOT NULL UNIQUE,          -- ISO 3166-1 alpha-3 (NGA, USA, GBR, etc.)
  phone_code VARCHAR(10),                      -- International dialing code (+234, +1, etc.)
  currency_code CHAR(3),                       -- ISO 4217 (NGN, USD, GBP, etc.)
  currency_name VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_countries_iso2 ON countries(iso_code_2);
CREATE INDEX idx_countries_iso3 ON countries(iso_code_3);
CREATE INDEX idx_countries_active ON countries(is_active) WHERE is_active = true;

COMMENT ON TABLE countries IS 'Reference table for countries with ISO codes and currency information';

-- Insert common countries (can be expanded)
INSERT INTO countries (name, iso_code_2, iso_code_3, phone_code, currency_code, currency_name) VALUES
('Nigeria', 'NG', 'NGA', '+234', 'NGN', 'Nigerian Naira'),
('United States', 'US', 'USA', '+1', 'USD', 'US Dollar'),
('United Kingdom', 'GB', 'GBR', '+44', 'GBP', 'British Pound'),
('Ghana', 'GH', 'GHA', '+233', 'GHS', 'Ghanaian Cedi'),
('Kenya', 'KE', 'KEN', '+254', 'KES', 'Kenyan Shilling'),
('South Africa', 'ZA', 'ZAF', '+27', 'ZAR', 'South African Rand'),
('Canada', 'CA', 'CAN', '+1', 'CAD', 'Canadian Dollar'),
('Germany', 'DE', 'DEU', '+49', 'EUR', 'Euro'),
('France', 'FR', 'FRA', '+33', 'EUR', 'Euro'),
('China', 'CN', 'CHN', '+86', 'CNY', 'Chinese Yuan')
ON CONFLICT (iso_code_2) DO NOTHING;


-- ============================================================================
-- FILES MANAGEMENT - Centralized file storage for all platform assets
-- ============================================================================

-- Files table (centralized storage for all file assets)
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(50) NOT NULL,              -- s3, r2, cloudinary, dropbox, etc.
  provider_path TEXT NOT NULL,                -- Path/key in provider storage
  file_url TEXT NOT NULL,                     -- Public or signed URL
  file_type VARCHAR(100),                     -- MIME type (image/jpeg, application/pdf, etc.)
  file_size BIGINT,                           -- Size in bytes
  uploaded_by UUID,                           -- user_id who uploaded
  context VARCHAR(50),                        -- profile_photo, order_reference, progress_photo, etc.
  metadata JSONB,                             -- Additional metadata (dimensions, duration, etc.)
  is_public BOOLEAN DEFAULT false,            -- Whether file is publicly accessible
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,                  -- Soft delete
  
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_context ON files(context);
CREATE INDEX idx_files_created_at ON files(created_at);
CREATE INDEX idx_files_provider ON files(provider);
CREATE INDEX idx_files_deleted ON files(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN files.context IS 'Valid contexts: profile_photo, order_reference, progress_photo, receipt, kyc_document, delivery_photo, dispute_evidence, chat_attachment';


-- ============================================================================
-- LOCATIONS - Centralized location/address storage for reusability
-- ============================================================================

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- GPS coordinates (nullable - might not always be available)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  accuracy DECIMAL(10, 2),                     -- GPS accuracy in meters
  altitude DECIMAL(10, 2),                     -- Altitude in meters (optional)
  heading DECIMAL(5, 2),                       -- Direction in degrees (0-360)
  speed DECIMAL(10, 2),                        -- Speed in km/h (optional)
  
  -- Address components
  address_line1 TEXT,
  address_line2 TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country_id INTEGER,                          -- References countries table
  postal_code VARCHAR(20),
  
  -- Full formatted address
  formatted_address TEXT,
  
  -- Place details
  place_id VARCHAR(200),                       -- Google Places ID or similar
  place_name VARCHAR(200),                     -- Landmark, building name, store name
  
  -- Location capture method
  location_type VARCHAR(50),                   -- gps, wifi, cell_tower, manual, ip_address, geocoded
  
  -- Network-based location (fallback when GPS unavailable)
  ip_address INET,
  cell_tower_id VARCHAR(100),
  wifi_bssid VARCHAR(100),
  
  -- Metadata
  metadata JSONB,                              -- Additional location data
  
  -- Tracking
  created_by UUID,                             -- User who created this location
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL,
  
  -- At least one location identifier must be provided
  CONSTRAINT check_location_data CHECK (
    latitude IS NOT NULL OR 
    formatted_address IS NOT NULL OR 
    place_name IS NOT NULL OR
    ip_address IS NOT NULL OR
    address_line1 IS NOT NULL
  )
);

CREATE INDEX idx_locations_coordinates ON locations(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX idx_locations_city ON locations(city);
CREATE INDEX idx_locations_country ON locations(country_id);
CREATE INDEX idx_locations_place_id ON locations(place_id) WHERE place_id IS NOT NULL;
CREATE INDEX idx_locations_type ON locations(location_type);
CREATE INDEX idx_locations_created_at ON locations(created_at);

COMMENT ON TABLE locations IS 'Centralized location storage supporting GPS coordinates, addresses, and fallback location methods. Used across user addresses, orders, and tracking.';

COMMENT ON COLUMN locations.location_type IS 'Valid types: gps, wifi, cell_tower, manual, ip_address, geocoded, bluetooth_beacon';


-- ============================================================================
-- USER ADDRESSES - Multiple delivery addresses per user
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  location_id UUID NOT NULL,                   -- References locations table
  
  -- Address metadata
  label VARCHAR(100),                          -- Home, Office, Mom's Place, etc.
  
  -- Additional delivery info
  delivery_instructions TEXT,                  -- Gate code, directions, etc.
  contact_name VARCHAR(200),                   -- Recipient name if different
  contact_phone VARCHAR(20),                   -- Recipient phone if different
  
  -- Flags
  is_default BOOLEAN DEFAULT false,            -- Default delivery address
  is_verified BOOLEAN DEFAULT false,           -- Address has been verified
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,                   -- Soft delete
  last_used_at TIMESTAMP,                      -- When last used for an order
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
);

CREATE INDEX idx_addresses_user ON user_addresses(user_id);
CREATE INDEX idx_addresses_location ON user_addresses(location_id);
CREATE INDEX idx_addresses_default ON user_addresses(is_default) WHERE is_default = true;
CREATE INDEX idx_addresses_deleted ON user_addresses(deleted_at) WHERE deleted_at IS NULL;

-- Ensure only one default address per user
CREATE UNIQUE INDEX idx_addresses_user_default ON user_addresses(user_id) 
  WHERE is_default = true AND deleted_at IS NULL;

COMMENT ON TABLE user_addresses IS 'User delivery addresses. Users can have multiple addresses with one marked as default. Location data stored in locations table.';

COMMENT ON COLUMN user_addresses.delivery_instructions IS 'Special delivery instructions like gate codes, security procedures, preferred delivery times, etc.';


-- ============================================================================
-- ORDER MANAGEMENT SYSTEM
-- ============================================================================

-- Main orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Customer info
  customer_id UUID NOT NULL,
  
  -- Order details
  title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,                -- groceries, electronics, documents, medicine, clothing, other
  
  -- Store location (reference to locations table)
  store_location_id UUID NOT NULL,
  store_name VARCHAR(200) NOT NULL,             -- Cached for quick access
  
  -- Delivery location (reference to locations table)
  delivery_location_id UUID NOT NULL,
  
  -- Financial
  estimated_item_cost INTEGER NOT NULL,        -- In kobo/cents
  actual_item_cost INTEGER,                    -- Actual cost after shopping
  shopper_fee INTEGER,
  dispatcher_fee INTEGER,
  platform_fee INTEGER,
  total_cost INTEGER,
  
  -- Special instructions
  special_instructions TEXT,
  is_urgent BOOLEAN DEFAULT false,
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending_payment',
  -- Status flow: pending_payment → pending_shopper → shopper_assigned → in_shopping → 
  --              shopping_completed → pending_dispatcher → dispatcher_assigned → 
  --              in_transit → delivered → completed → (cancelled/disputed)
  
  -- Service providers
  shopper_id UUID,
  dispatcher_id UUID,
  
  -- Timeline
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payment_completed_at TIMESTAMP,
  shopper_assigned_at TIMESTAMP,
  shopping_started_at TIMESTAMP,
  shopping_completed_at TIMESTAMP,
  dispatcher_assigned_at TIMESTAMP,
  pickup_completed_at TIMESTAMP,
  delivery_started_at TIMESTAMP,
  delivered_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Cancellation
  cancelled_by UUID,
  cancellation_reason TEXT,
  
  -- Foreign keys
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (store_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (delivery_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (shopper_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (dispatcher_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_shopper ON orders(shopper_id);
CREATE INDEX idx_orders_dispatcher ON orders(dispatcher_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_category ON orders(category);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_store_location ON orders(store_location_id);
CREATE INDEX idx_orders_delivery_location ON orders(delivery_location_id);

COMMENT ON COLUMN orders.status IS 'Valid statuses: pending_payment, pending_shopper, shopper_assigned, in_shopping, shopping_completed, pending_dispatcher, dispatcher_assigned, in_transit, delivered, completed, cancelled, disputed';

-- Order reference photos (customer uploaded)
CREATE TABLE IF NOT EXISTS order_reference_photos (
  id SERIAL PRIMARY KEY,
  order_id UUID NOT NULL,
  file_id UUID NOT NULL,                       -- References files.id
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX idx_order_ref_photos_order ON order_reference_photos(order_id);
CREATE INDEX idx_order_ref_photos_file ON order_reference_photos(file_id);

-- Order progress photos (shopper/dispatcher uploaded)
CREATE TABLE IF NOT EXISTS order_progress_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL,
  file_id UUID NOT NULL,                       -- References files.id
  stage VARCHAR(50) NOT NULL,                  -- item_found, receipt, handoff, delivery
  uploaded_by UUID NOT NULL,                   -- user_id of shopper/dispatcher
  caption TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_order_progress_photos_order ON order_progress_photos(order_id);
CREATE INDEX idx_order_progress_photos_file ON order_progress_photos(file_id);
CREATE INDEX idx_order_progress_photos_stage ON order_progress_photos(stage);
CREATE INDEX idx_order_progress_photos_uploaded_by ON order_progress_photos(uploaded_by);

COMMENT ON COLUMN order_progress_photos.stage IS 'Valid stages: item_found, receipt, handoff, delivery';

-- Order items breakdown (provided by shopper after shopping)
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,                -- In kobo/cents
  total_price INTEGER NOT NULL,               -- quantity * unit_price
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Order timeline/history (track all status changes)
CREATE TABLE IF NOT EXISTS order_timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,
  changed_by UUID,                             -- user_id who triggered the change
  notes TEXT,
  metadata JSONB,                              -- Additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_order_timeline_order ON order_timeline(order_id);
CREATE INDEX idx_order_timeline_created_at ON order_timeline(created_at);

-- Order location tracking (for real-time tracking of shopper/dispatcher)
CREATE TABLE IF NOT EXISTS order_location_tracking (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,                       -- Shopper or dispatcher
  location_id UUID NOT NULL,                   -- References locations table
  
  -- Tracking context
  status VARCHAR(50),                          -- at_store, in_transit, at_delivery, etc.
  notes TEXT,                                  -- Additional context
  
  -- Device metadata
  battery_level INTEGER,                       -- Device battery percentage
  network_type VARCHAR(20),                    -- wifi, 4g, 5g, etc.
  is_background BOOLEAN DEFAULT false,         -- Background vs foreground update
  metadata JSONB,                              -- Additional tracking data
  
  -- Timestamps
  timestamp TIMESTAMP NOT NULL,                -- When location was captured
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When record was created
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
);

CREATE INDEX idx_location_tracking_order ON order_location_tracking(order_id);
CREATE INDEX idx_location_tracking_user ON order_location_tracking(user_id);
CREATE INDEX idx_location_tracking_location ON order_location_tracking(location_id);
CREATE INDEX idx_location_tracking_timestamp ON order_location_tracking(timestamp);
CREATE INDEX idx_location_tracking_status ON order_location_tracking(status);

COMMENT ON COLUMN order_location_tracking.status IS 'Valid statuses: heading_to_store, at_store, shopping, heading_to_pickup, at_pickup_point, heading_to_delivery, at_delivery, delivered';

COMMENT ON TABLE order_location_tracking IS 'Real-time location tracking of shoppers and dispatchers during order fulfillment. All location data stored in locations table.';
