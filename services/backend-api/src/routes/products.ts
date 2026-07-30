import { Router } from "express";
import {
  createProductRequestSchema,
  createProductVariantRequestSchema,
  listProductsQuerySchema,
  updateInventoryRequestSchema,
  updateProductRequestSchema,
  updateProductVariantRequestSchema,
  type CreateProductRequestInput,
  type CreateProductVariantRequestInput,
  type UpdateInventoryRequestInput,
  type UpdateProductRequestInput,
  type UpdateProductVariantRequestInput,
} from "@fashion-platform/validation";
import { PERMISSION_KEYS } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import type { Database } from "../db/client.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isUniqueViolation } from "../lib/dbErrors.js";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { imageUploadMiddleware, validateImageBuffer } from "../lib/imageUpload.js";
import { requireParam } from "../lib/params.js";
import {
  buildImportTemplateWorkbook,
  importProducts,
  parseImportWorkbook,
  productImportUploadMiddleware,
} from "../lib/productImport.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { createCategoriesRepo } from "../repositories/categoriesRepo.js";
import { createCollectionsRepo } from "../repositories/collectionsRepo.js";
import { createInventoryRepo } from "../repositories/inventoryRepo.js";
import { createProductsRepo, type ProductRow } from "../repositories/productsRepo.js";
import { createProductVariantsRepo } from "../repositories/productVariantsRepo.js";
import type { TenantScope } from "../repositories/tenantScope.js";

/**
 * Returns a shape that matches @fashion-platform/shared-types' ProductWithVariants
 * once JSON-serialized by res.json() (Date -> ISO string happens automatically
 * at that boundary) - not typed against it directly here, since internally
 * this still carries real Date objects from the DB row.
 */
async function buildProductWithVariants(db: Database, scope: TenantScope, product: ProductRow) {
  const variantsRepo = createProductVariantsRepo(db, scope);
  const inventoryRepo = createInventoryRepo(db, scope);
  const productsRepo = createProductsRepo(db, scope);

  const [variants, collectionIds] = await Promise.all([
    variantsRepo.listForProduct(product.id),
    productsRepo.listCollectionIds(product.id),
  ]);

  const variantsWithInventory = await Promise.all(
    variants.map(async (variant) => {
      const inventoryRow = await inventoryRepo.getForVariant(variant.id);
      return { ...variant, quantity: inventoryRow?.quantity ?? 0 };
    }),
  );

  return { ...product, variants: variantsWithInventory, collectionIds };
}

export function createProductsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/:id/products",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const query = listProductsQuerySchema.parse(req.query);
      const repo = createProductsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      res.status(200).json(await repo.list(query));
    }),
  );

  router.post(
    "/:id/products",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_CREATE),
    validateBody(createProductRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const repo = createProductsRepo(deps.db, scope);
      const input = req.body as CreateProductRequestInput;
      try {
        const product = await repo.create(input);
        res.status(201).json(await buildProductWithVariants(deps.db, scope, product));
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("a product with this slug already exists");
        throw error;
      }
    }),
  );

  router.get(
    "/:id/products/:productId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const repo = createProductsRepo(deps.db, scope);
      const product = await repo.findById(requireParam(req.params, "productId"));
      if (!product) throw new NotFoundError("product not found");
      res.status(200).json(await buildProductWithVariants(deps.db, scope, product));
    }),
  );

  router.patch(
    "/:id/products/:productId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_UPDATE),
    validateBody(updateProductRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const repo = createProductsRepo(deps.db, scope);
      const productId = requireParam(req.params, "productId");
      const input = req.body as UpdateProductRequestInput;
      try {
        const product = await repo.update(productId, input);
        if (!product) throw new NotFoundError("product not found");
        res.status(200).json(await buildProductWithVariants(deps.db, scope, product));
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("a product with this slug already exists");
        throw error;
      }
    }),
  );

  router.delete(
    "/:id/products/:productId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_DELETE),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const repo = createProductsRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      const product = await repo.archive(requireParam(req.params, "productId"));
      if (!product) throw new NotFoundError("product not found");
      res.status(200).json(product);
    }),
  );

  router.post(
    "/:id/products/:productId/image",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_UPDATE),
    imageUploadMiddleware.single("image"),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const productId = requireParam(req.params, "productId");

      const productsRepo = createProductsRepo(deps.db, scope);
      const product = await productsRepo.findById(productId);
      if (!product) throw new NotFoundError("product not found");

      if (!req.file) throw new BadRequestError("no image file provided (field name: image)");

      const detected = await validateImageBuffer(req.file.buffer);
      const { url } = await deps.imageStorage.upload(req.file.buffer, "products", detected.ext);

      const updated = await productsRepo.update(productId, { imageUrl: url });
      if (!updated) throw new NotFoundError("product not found");

      res.status(200).json(await buildProductWithVariants(deps.db, scope, updated));
    }),
  );

  // --- Bulk import ---
  // Both routes below are static segments ("import", "import/template") at the
  // same path depth as the dynamic :productId routes above. Express matches
  // path patterns in registration order (unlike React Router v6) - a
  // merchant's product id is a uuid so it can never literally collide with
  // "import", but any future same-depth dynamic route should be registered
  // AFTER these two, not before, so it can't accidentally shadow them.

  router.post(
    "/:id/products/import",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_CREATE),
    productImportUploadMiddleware.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      if (!req.file) throw new BadRequestError("no file provided (field name: file)");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };

      const rawRows = await parseImportWorkbook(req.file.buffer);
      const results = await importProducts(deps.db, scope, rawRows);
      res.status(200).json({ results });
    }),
  );

  // Gated on CATALOG_CREATE, not CATALOG_READ like this router's other read
  // endpoints - an intentional deviation, since only someone who can actually
  // import needs the template.
  router.get(
    "/:id/products/import/template",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_CREATE),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };

      const [categories, collections] = await Promise.all([
        createCategoriesRepo(deps.db, scope).list(),
        createCollectionsRepo(deps.db, scope).list(),
      ]);
      const buffer = await buildImportTemplateWorkbook(
        categories.map((category) => category.name),
        collections.map((collection) => collection.name),
      );

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="product-import-template.xlsx"');
      res.status(200).send(buffer);
    }),
  );

  // --- Variants ---

  router.get(
    "/:id/products/:productId/variants",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const productId = requireParam(req.params, "productId");
      const product = await createProductsRepo(deps.db, scope).findById(productId);
      if (!product) throw new NotFoundError("product not found");
      res.status(200).json(await createProductVariantsRepo(deps.db, scope).listForProduct(productId));
    }),
  );

  router.post(
    "/:id/products/:productId/variants",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_CREATE),
    validateBody(createProductVariantRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const productId = requireParam(req.params, "productId");
      const input = req.body as CreateProductVariantRequestInput;

      // A variant's FK only proves the product exists somewhere - it doesn't
      // prove it belongs to this tenant. Confirm that explicitly first.
      const product = await createProductsRepo(deps.db, scope).findById(productId);
      if (!product) throw new NotFoundError("product not found");

      try {
        const result = await deps.db.transaction(async (tx) => {
          const variant = await createProductVariantsRepo(tx, scope).create(productId, input);
          const inventoryRow = await createInventoryRepo(tx, scope).createForVariant(variant.id, 0);
          return { variant, inventoryRow };
        });
        res.status(201).json({ ...result.variant, quantity: result.inventoryRow.quantity });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("a variant with this SKU already exists");
        throw error;
      }
    }),
  );

  router.patch(
    "/:id/products/:productId/variants/:variantId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_UPDATE),
    validateBody(updateProductVariantRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const productId = requireParam(req.params, "productId");
      const variantId = requireParam(req.params, "variantId");
      const input = req.body as UpdateProductVariantRequestInput;

      const variantsRepo = createProductVariantsRepo(deps.db, scope);
      const existing = await variantsRepo.findById(variantId);
      if (!existing || existing.productId !== productId) throw new NotFoundError("variant not found");

      try {
        const variant = await variantsRepo.update(variantId, input);
        if (!variant) throw new NotFoundError("variant not found");
        res.status(200).json(variant);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("a variant with this SKU already exists");
        throw error;
      }
    }),
  );

  router.delete(
    "/:id/products/:productId/variants/:variantId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_DELETE),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const productId = requireParam(req.params, "productId");
      const variantId = requireParam(req.params, "variantId");

      const variantsRepo = createProductVariantsRepo(deps.db, scope);
      const existing = await variantsRepo.findById(variantId);
      if (!existing || existing.productId !== productId) throw new NotFoundError("variant not found");

      const variant = await variantsRepo.archive(variantId);
      if (!variant) throw new NotFoundError("variant not found");
      res.status(200).json(variant);
    }),
  );

  // --- Inventory ---

  router.patch(
    "/:id/products/:productId/variants/:variantId/inventory",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.INVENTORY_UPDATE),
    validateBody(updateInventoryRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const productId = requireParam(req.params, "productId");
      const variantId = requireParam(req.params, "variantId");
      const { quantity } = req.body as UpdateInventoryRequestInput;

      const variant = await createProductVariantsRepo(deps.db, scope).findById(variantId);
      if (!variant || variant.productId !== productId) throw new NotFoundError("variant not found");

      const inventoryRow = await createInventoryRepo(deps.db, scope).setQuantity(variantId, quantity);
      if (!inventoryRow) throw new NotFoundError("inventory record not found");
      res.status(200).json(inventoryRow);
    }),
  );

  // --- Collection membership ---

  router.post(
    "/:id/products/:productId/collections/:collectionId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_UPDATE),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const productId = requireParam(req.params, "productId");
      const collectionId = requireParam(req.params, "collectionId");

      const productsRepo = createProductsRepo(deps.db, scope);
      const product = await productsRepo.findById(productId);
      if (!product) throw new NotFoundError("product not found");

      const collection = await createCollectionsRepo(deps.db, scope).findById(collectionId);
      if (!collection) throw new NotFoundError("collection not found");

      await productsRepo.addToCollection(productId, collectionId);
      res.status(204).send();
    }),
  );

  router.delete(
    "/:id/products/:productId/collections/:collectionId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.CATALOG_UPDATE),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const productId = requireParam(req.params, "productId");
      const collectionId = requireParam(req.params, "collectionId");

      const product = await createProductsRepo(deps.db, scope).findById(productId);
      if (!product) throw new NotFoundError("product not found");

      await createProductsRepo(deps.db, scope).removeFromCollection(productId, collectionId);
      res.status(204).send();
    }),
  );

  return router;
}
