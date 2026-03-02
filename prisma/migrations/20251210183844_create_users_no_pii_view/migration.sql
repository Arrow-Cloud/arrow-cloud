-- Create view for users table without PII
-- Only exposes: id, alias, createdAt
CREATE OR REPLACE VIEW users_no_pii AS
SELECT 
  id,
  alias,
  "createdAt"
FROM "User";
