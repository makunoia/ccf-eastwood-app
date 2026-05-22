-- SiteSettings singleton table
CREATE TABLE IF NOT EXISTS "SiteSettings" (
  "id"                         TEXT NOT NULL DEFAULT 'singleton',
  "joinPageTitle"              TEXT NOT NULL DEFAULT 'Find Your Small Group',
  "joinPageDescription"        TEXT NOT NULL DEFAULT 'Tell us about yourself and we''ll suggest the best small groups for you.',
  "joinPageLogoUrl"            TEXT NOT NULL DEFAULT '',
  "joinPageBackgroundImageUrl" TEXT NOT NULL DEFAULT '',
  "joinPageAccentColor"        TEXT NOT NULL DEFAULT '',
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);
