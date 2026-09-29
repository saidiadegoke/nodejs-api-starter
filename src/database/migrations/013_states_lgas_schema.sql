-- M.10: Nigerian states + LGAs reference tables
--
-- Adds states + lgas tables (INTEGER PKs to match the existing countries
-- table) and back-fills nullable {state_of_origin_id, lga_id, country_id}
-- columns onto profiles + jupeb_next_of_kin so NIN-derived strings can be
-- resolved to system-wide ids. The pre-existing VARCHAR columns
-- (profiles.state_of_origin, profiles.lga, jupeb_next_of_kin.address etc.)
-- are kept for backward compatibility.

CREATE TABLE IF NOT EXISTS states (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(10)  NOT NULL,
  country_id  INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (country_id, code),
  UNIQUE (country_id, name)
);

CREATE INDEX IF NOT EXISTS idx_states_country_id ON states (country_id);

CREATE TABLE IF NOT EXISTS lgas (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  state_id    INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  country_id  INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (state_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lgas_state_id   ON lgas (state_id);
CREATE INDEX IF NOT EXISTS idx_lgas_country_id ON lgas (country_id);

-- Optional id-ref columns alongside the existing VARCHAR fields. Nullable
-- so existing rows / unresolvable NIN strings still work.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS state_of_origin_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lga_id             INTEGER REFERENCES lgas(id)   ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_state_of_origin_id ON profiles (state_of_origin_id);
CREATE INDEX IF NOT EXISTS idx_profiles_lga_id             ON profiles (lga_id);
