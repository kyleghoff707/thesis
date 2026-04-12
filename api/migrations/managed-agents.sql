-- Migration: Managed Agents pipeline
-- Adds session_id to pipeline_runs for tracking Managed Agent sessions.
-- Creates managed_agents table for caching coordinator agent IDs.
--
-- Run with:
--   wrangler d1 execute thes1s --file=api/migrations/managed-agents.sql

ALTER TABLE pipeline_runs ADD COLUMN session_id TEXT;

CREATE TABLE IF NOT EXISTS managed_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  prompt_hash TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
