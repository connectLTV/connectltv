-- The refresh touches ~40k rows; allow it more than the API's default statement timeout.
ALTER FUNCTION v2_refresh_helpers() SET statement_timeout = '180s';
