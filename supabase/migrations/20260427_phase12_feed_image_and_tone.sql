-- Phase 12 — Feature depth, 2026-04-27.
-- Visual + tone upgrades to feed_items.
--
--   image_url:  nullable text. Extracted from RSS <media:content>,
--               <enclosure>, or <image> by intelligence-feed; null if
--               the source feed didn't carry one. Drives the new
--               thumbnail-left card layout in feed.html.
--   is_positive: nullable boolean. Set true by intelligence-feed when
--               the item matches the hiring/training/opportunity regex
--               OR when item_type IN ('hiring-surge','opportunity').
--               Drives the "Positive news only" filter chip on the
--               layoffs tab.
--
-- Idempotent. No data backfill — existing rows leave both nullable;
-- next cron run hydrates fresh items, old items just don't show
-- thumbnails.

alter table public.feed_items
  add column if not exists image_url   text,
  add column if not exists is_positive boolean default false;

-- Index supports the "positive news only" filter without a sequential
-- scan. Partial index keeps it cheap (most rows are not positive).
create index if not exists feed_items_positive_published_idx
  on public.feed_items (published_at desc)
  where is_positive = true and is_published = true;
