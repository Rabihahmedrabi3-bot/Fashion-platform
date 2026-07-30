import ExcelJS from "exceljs";
import multer from "multer";
import type { ZodError } from "zod";
import { createProductRequestSchema, createProductVariantRequestSchema } from "@fashion-platform/validation";
import type { Database } from "../db/client.js";
import { createCategoriesRepo } from "../repositories/categoriesRepo.js";
import { createCollectionsRepo } from "../repositories/collectionsRepo.js";
import { createInventoryRepo } from "../repositories/inventoryRepo.js";
import { createProductsRepo } from "../repositories/productsRepo.js";
import { createProductVariantsRepo } from "../repositories/productVariantsRepo.js";
import type { TenantScope } from "../repositories/tenantScope.js";
import { isUniqueViolation } from "./dbErrors.js";
import { UnprocessableEntityError } from "./errors.js";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

/**
 * A dedicated multer instance, separate from imageUploadMiddleware - a
 * spreadsheet has different size/type expectations than a product photo.
 * The row-count cap (MAX_IMPORT_ROWS) only applies after the whole file is
 * already parsed into memory, so this file-size limit is the first line of
 * defense against a hostile/oversized upload.
 */
export const productImportUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES },
});

/**
 * Single source of truth for the spreadsheet contract - both the header text a
 * merchant sees and the internal key are derived from this list, so the
 * template-writer and the parser can never drift out of sync with each other.
 */
const COLUMN_DEFINITIONS = [
  { key: "productName", header: "Product Name" },
  { key: "slug", header: "Product Slug" },
  { key: "description", header: "Description" },
  { key: "category", header: "Category" },
  { key: "collections", header: "Collections" },
  { key: "subcategory", header: "Subcategory" },
  { key: "gender", header: "Gender" },
  { key: "style", header: "Style" },
  { key: "occasion", header: "Occasion" },
  { key: "season", header: "Season" },
  { key: "fit", header: "Fit" },
  { key: "material", header: "Material" },
  { key: "brand", header: "Brand" },
  { key: "sku", header: "SKU" },
  { key: "size", header: "Size" },
  { key: "color", header: "Color" },
  { key: "priceDollars", header: "Price" },
  { key: "quantity", header: "Quantity" },
] as const;

type ColumnKey = (typeof COLUMN_DEFINITIONS)[number]["key"];

/** Required every row - grouping (Product Name) and the two things a variant can't exist without. */
const REQUIRED_KEYS: ColumnKey[] = ["productName", "sku", "priceDollars"];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const HEADER_TO_KEY = new Map<string, ColumnKey>(COLUMN_DEFINITIONS.map((def) => [normalizeHeader(def.header), def.key]));
const KEY_TO_LABEL = new Map<ColumnKey, string>(COLUMN_DEFINITIONS.map((def) => [def.key, def.header]));

export interface RawImportRow {
  rowNumber: number;
  values: Partial<Record<ColumnKey, string>>;
}

export interface ImportRowResult {
  row: number;
  productName: string;
  sku: string;
  status: "created" | "error";
  error?: string;
}

/**
 * lowercase(name) -> "not found" (absent from map) | id | "ambiguous". Categories/
 * collections are only unique per-tenant on slug, not name (schema.ts has no
 * name-uniqueness constraint), so two rows could genuinely share a display name -
 * silently resolving to whichever was seen last would be wrong, not just imprecise.
 */
function buildNameMap(rows: Array<{ id: string; name: string }>): Map<string, string | "ambiguous"> {
  const map = new Map<string, string | "ambiguous">();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    map.set(key, map.has(key) ? "ambiguous" : row.id);
  }
  return map;
}

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ");
}

/**
 * Lowercase, hyphenated, trimmed to what slugSchema accepts. Only used when a
 * row's Product Slug column is blank - the result still runs through the same
 * createProductRequestSchema as everything else, so a name that can't produce a
 * legal slug (e.g. all symbols) surfaces as a normal per-group validation error,
 * not a silent failure.
 */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 63 ? slug.slice(0, 63).replace(/-+$/, "") : slug;
}

/** Coerces exceljs's non-trivial cell value shapes (Date, formula result, rich text) down to a plain trimmed string. */
function cellToString(value: ExcelJS.CellValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      const text = value.richText.map((part) => part.text).join("").trim();
      return text === "" ? undefined : text;
    }
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") {
      const trimmed = value.text.trim();
      return trimmed === "" ? undefined : trimmed;
    }
  }
  return undefined;
}

/**
 * Loads an uploaded .xlsx buffer into plain row objects. A load failure (not a
 * valid zip/xlsx container) is a much stronger and simpler validator than
 * fighting with magic-byte sniffing for this format.
 */
export async function parseImportWorkbook(buffer: Buffer): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's own type defs declare a global `interface Buffer extends ArrayBuffer {}`
    // (node_modules/exceljs/index.d.ts:1), which merges into and corrupts the
    // `Buffer` identifier itself for the whole program - so casting *to* Buffer
    // doesn't help, the target type is the broken one. `any` is the correct
    // escape hatch here (not laziness): a real Node Buffer works fine at runtime.
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new UnprocessableEntityError("invalid or corrupted Excel file");
  }

  // Read by known sheet name, not unconditionally index 0 - a merchant re-saving
  // the template from another tool (e.g. Google Sheets) isn't guaranteed to
  // preserve tab order.
  const worksheet = workbook.getWorksheet("Products") ?? workbook.worksheets[0];
  if (!worksheet) throw new UnprocessableEntityError("the workbook has no worksheet to import");

  const headerRow = worksheet.getRow(1);
  const columnIndexToKey = new Map<number, ColumnKey>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = HEADER_TO_KEY.get(normalizeHeader(String(cell.value ?? "")));
    if (key) columnIndexToKey.set(colNumber, key);
  });

  const foundKeys = new Set(columnIndexToKey.values());
  const missing = REQUIRED_KEYS.filter((key) => !foundKeys.has(key));
  if (missing.length > 0) {
    throw new UnprocessableEntityError(
      `missing required column(s): ${missing.map((key) => KEY_TO_LABEL.get(key)).join(", ")}`,
    );
  }

  const rows: RawImportRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const values: Partial<Record<ColumnKey, string>> = {};
    for (const [colNumber, key] of columnIndexToKey) {
      const stringValue = cellToString(row.getCell(colNumber).value);
      if (stringValue !== undefined) values[key] = stringValue;
    }

    // Trailing styled-but-empty rows are common after copy/paste - a row only
    // counts as real data if it has a product name or a sku.
    if (!values.productName && !values.sku) return;

    rows.push({ rowNumber, values });
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new UnprocessableEntityError(`too many rows (${rows.length}) - split into files of ${MAX_IMPORT_ROWS} or fewer`);
  }

  return rows;
}

/** Builds a fresh, tenant-aware template workbook: a Products sheet with headers + one example row, and a Reference sheet with the tenant's real category/collection names. */
export async function buildImportTemplateWorkbook(categoryNames: string[], collectionNames: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const products = workbook.addWorksheet("Products");
  const headers = COLUMN_DEFINITIONS.map((def) => def.header);
  products.addRow(headers);
  products.addRow([
    "Classic Tee",
    "",
    "A comfortable everyday tee",
    categoryNames[0] ?? "",
    "",
    "t-shirt",
    "unisex",
    "casual",
    "everyday",
    "",
    "regular",
    "cotton",
    "",
    "TEE-001-S-BLK",
    "S",
    "Black",
    "19.99",
    "10",
  ]);

  const reference = workbook.addWorksheet("Reference");
  reference.addRow(["Notes"]);
  reference.addRow(["Product Name groups rows into one product - repeat the same name across each size/color variant row."]);
  reference.addRow(["Product Slug, Description, Category, Collections, and taxonomy fields are only read from the first row of each Product Name group."]);
  reference.addRow(["Category must match one of your existing category names exactly (see below) - it is not created automatically."]);
  reference.addRow(["Collections: separate multiple names with a semicolon (;), not a comma."]);
  reference.addRow(["Format the SKU column as Text before typing values, or a numeric-looking SKU (e.g. 00123) will lose its leading zeros."]);
  reference.addRow([]);
  reference.addRow(["Your categories:"]);
  for (const name of categoryNames) reference.addRow([name]);
  reference.addRow([]);
  reference.addRow(["Your collections:"]);
  for (const name of collectionNames) reference.addRow([name]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

interface ProductGroup {
  displayName: string;
  rows: RawImportRow[];
}

function failGroup(group: ProductGroup, message: string, results: ImportRowResult[]): void {
  for (const row of group.rows) {
    results.push({ row: row.rowNumber, productName: group.displayName, sku: row.values.sku ?? "", status: "error", error: message });
  }
}

/**
 * Create-only: never updates or attaches variants to an already-existing product.
 * A slug collision with an existing product surfaces as the normal
 * isUniqueViolation "already exists" conflict, same as the single-item route.
 */
export async function importProducts(db: Database, scope: TenantScope, rawRows: RawImportRow[]): Promise<ImportRowResult[]> {
  const results: ImportRowResult[] = [];

  // 1. Group rows by Product Name, case-insensitive+trimmed (same normalization
  // rule as Category/Collection resolution below - one consistent rule, not two).
  const groups = new Map<string, ProductGroup>();
  const groupOrder: string[] = [];
  for (const raw of rawRows) {
    const name = raw.values.productName;
    if (!name) {
      results.push({ row: raw.rowNumber, productName: "", sku: raw.values.sku ?? "", status: "error", error: "Product Name is required" });
      continue;
    }
    const key = name.trim().toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { displayName: name.trim(), rows: [] };
      groups.set(key, group);
      groupOrder.push(key);
    }
    group.rows.push(raw);
  }

  // 2. Resolve name -> id once, not per-row/group.
  const categoryMap = buildNameMap(await createCategoriesRepo(db, scope).list());
  const collectionMap = buildNameMap(await createCollectionsRepo(db, scope).list());

  const productsRepo = createProductsRepo(db, scope);

  for (const key of groupOrder) {
    const group = groups.get(key)!;
    const first = group.rows[0]!.values;

    // 3. Resolve Category/Collections BEFORE creating anything - a bad name
    // must never leave an orphaned product behind.
    let categoryId: string | undefined;
    if (first.category) {
      const resolved = categoryMap.get(first.category.trim().toLowerCase());
      if (resolved === undefined) {
        failGroup(group, `category "${first.category}" not found`, results);
        continue;
      }
      if (resolved === "ambiguous") {
        failGroup(group, `category "${first.category}" matches more than one category - rename one or use a unique name`, results);
        continue;
      }
      categoryId = resolved;
    }

    const collectionIds: string[] = [];
    if (first.collections) {
      const names = first.collections.split(";").map((name) => name.trim()).filter(Boolean);
      let collectionsFailed = false;
      for (const name of names) {
        const resolved = collectionMap.get(name.toLowerCase());
        if (resolved === undefined) {
          failGroup(group, `collection "${name}" not found`, results);
          collectionsFailed = true;
          break;
        }
        if (resolved === "ambiguous") {
          failGroup(group, `collection "${name}" matches more than one collection - rename one or use a unique name`, results);
          collectionsFailed = true;
          break;
        }
        collectionIds.push(resolved);
      }
      if (collectionsFailed) continue;
    }

    // 4. Validate + create the product.
    const parsedProduct = createProductRequestSchema.safeParse({
      name: group.displayName,
      slug: first.slug ?? slugify(group.displayName),
      description: first.description,
      categoryId,
      subcategory: first.subcategory,
      gender: first.gender,
      style: first.style,
      occasion: first.occasion,
      season: first.season,
      fit: first.fit,
      material: first.material,
      brand: first.brand,
    });
    if (!parsedProduct.success) {
      failGroup(group, formatZodError(parsedProduct.error), results);
      continue;
    }

    let productId: string;
    try {
      productId = (await productsRepo.create(parsedProduct.data)).id;
    } catch (error) {
      failGroup(group, isUniqueViolation(error) ? "a product with this slug already exists" : "failed to create product", results);
      continue;
    }

    for (const collectionId of collectionIds) {
      await productsRepo.addToCollection(productId, collectionId);
    }

    // 6. Variants - one row at a time, each its own transaction, so one bad SKU
    // never affects the product or its other already-created variants.
    for (const row of group.rows) {
      const sku = row.values.sku ?? "";
      if (!sku) {
        results.push({ row: row.rowNumber, productName: group.displayName, sku, status: "error", error: "SKU is required" });
        continue;
      }

      const priceDollars = row.values.priceDollars !== undefined ? Number(row.values.priceDollars) : NaN;
      if (Number.isNaN(priceDollars)) {
        results.push({ row: row.rowNumber, productName: group.displayName, sku, status: "error", error: "Price must be a number" });
        continue;
      }

      let quantity = 0;
      if (row.values.quantity !== undefined) {
        const parsedQuantity = Number(row.values.quantity);
        if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
          results.push({ row: row.rowNumber, productName: group.displayName, sku, status: "error", error: "Quantity must be a non-negative whole number" });
          continue;
        }
        quantity = parsedQuantity;
      }

      const parsedVariant = createProductVariantRequestSchema.safeParse({
        sku,
        size: row.values.size,
        color: row.values.color,
        priceCents: Math.round(priceDollars * 100),
      });
      if (!parsedVariant.success) {
        results.push({ row: row.rowNumber, productName: group.displayName, sku, status: "error", error: formatZodError(parsedVariant.error) });
        continue;
      }

      try {
        await db.transaction(async (tx) => {
          const variant = await createProductVariantsRepo(tx, scope).create(productId, parsedVariant.data);
          // Quantity passed directly at creation time, not a separate follow-up
          // setQuantity() call - keeps the whole import under CATALOG_CREATE
          // (INVENTORY_UPDATE is reserved for the dedicated adjustment endpoint).
          await createInventoryRepo(tx, scope).createForVariant(variant.id, quantity);
        });
        results.push({ row: row.rowNumber, productName: group.displayName, sku, status: "created" });
      } catch (error) {
        results.push({
          row: row.rowNumber,
          productName: group.displayName,
          sku,
          status: "error",
          error: isUniqueViolation(error) ? "a variant with this SKU already exists" : "failed to create variant",
        });
      }
    }
  }

  // Groups are processed in first-seen order, not strict row order - a merchant
  // could interleave two products' rows in the sheet. Sort so the response
  // always matches the spreadsheet's visual top-to-bottom order.
  return results.sort((a, b) => a.row - b.row);
}
