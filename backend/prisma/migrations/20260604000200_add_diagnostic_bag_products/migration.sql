INSERT INTO "ProductCategory" ("id", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES ('cat_diagnostic_bags', 'Diagnostic Bags', 'X-ray and CT scan bag products', true, NOW(), NOW())
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description",
    "isActive" = true,
    "updatedAt" = NOW();

WITH bag_category AS (
  SELECT "id" FROM "ProductCategory" WHERE "name" = 'Diagnostic Bags' LIMIT 1
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
  'prod_xray_bag_small',
  'XRAY-BAG-10.5X16',
  'X-ray Bag Small',
  'Small X-ray bag, 10.5x16 inch',
  bag_category."id",
  0,
  '10.5x16',
  '10.5x16',
  'OFFSET'::"PrintingType",
  'SINGLE_SIDE'::"ProductSides",
  NULL,
  true,
  NOW(),
  NOW()
FROM bag_category
ON CONFLICT ("sku") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "categoryId" = EXCLUDED."categoryId",
    "sizeInches" = EXCLUDED."sizeInches",
    "openSizeInches" = EXCLUDED."openSizeInches",
    "isActive" = true,
    "updatedAt" = NOW();

WITH bag_category AS (
  SELECT "id" FROM "ProductCategory" WHERE "name" = 'Diagnostic Bags' LIMIT 1
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
  'prod_ct_scan_bag_big',
  'CT-BAG-16X21',
  'CT Scan Bag Big',
  'Big CT scan bag, 16x21 inch',
  bag_category."id",
  0,
  '16x21',
  '16x21',
  'OFFSET'::"PrintingType",
  'SINGLE_SIDE'::"ProductSides",
  NULL,
  true,
  NOW(),
  NOW()
FROM bag_category
ON CONFLICT ("sku") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "categoryId" = EXCLUDED."categoryId",
    "sizeInches" = EXCLUDED."sizeInches",
    "openSizeInches" = EXCLUDED."openSizeInches",
    "isActive" = true,
    "updatedAt" = NOW();
