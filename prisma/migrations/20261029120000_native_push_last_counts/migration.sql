-- Native push sends the same "needs attention" digest as web push, so each
-- phone remembers the counts it was last told about.
ALTER TABLE "NativePushDevice" ADD COLUMN "lastCounts" JSONB;
