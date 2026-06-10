INSERT INTO "ProductCategory" ("id", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES ('cat_pp_files', 'PP Files', 'PP file products with punching, clip, creasing and pocket options', true, NOW(), NOW())
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description",
    "isActive" = true,
    "updatedAt" = NOW();

WITH pp_category AS (
  SELECT "id" FROM "ProductCategory" WHERE "name" = 'PP Files' LIMIT 1
)
INSERT INTO "Product" (
  "id",
  "sku",
  "name",
  "description",
  "categoryId",
  "gsm",
  "sizeInches",
  "openSizeInches",
  "printingType",
  "sides",
  "weightPerUnitGrams",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'prod_pp_file_punching',
  'PP-FILE-PUNCH',
  'PP Files with Punching',
  'PP files with optional clip, single/double creasing and one/two side pocket',
  pp_category."id",
  300,
  '12x18',
  '12x18',
  'OFFSET'::"PrintingType",
  'SINGLE_SIDE'::"ProductSides",
  NULL,
  true,
  NOW(),
  NOW()
FROM pp_category
ON CONFLICT ("sku") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "categoryId" = EXCLUDED."categoryId",
    "gsm" = EXCLUDED."gsm",
    "sizeInches" = EXCLUDED."sizeInches",
    "openSizeInches" = EXCLUDED."openSizeInches",
    "printingType" = EXCLUDED."printingType",
    "sides" = EXCLUDED."sides",
    "isActive" = true,
    "updatedAt" = NOW();
