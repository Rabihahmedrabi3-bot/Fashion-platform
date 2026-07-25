import { Router } from "express";
import {
  listOrdersQuerySchema,
  updateOrderPaymentRequestSchema,
  updateOrderStatusRequestSchema,
  type UpdateOrderPaymentRequestInput,
  type UpdateOrderStatusRequestInput,
} from "@fashion-platform/validation";
import { PERMISSION_KEYS, type OrderStatus } from "@fashion-platform/shared-types";
import type { AppDependencies } from "../appDependencies.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { requireParam } from "../lib/params.js";
import { validateBody } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveTenantContext } from "../middleware/tenantContext.js";
import { createInventoryRepo } from "../repositories/inventoryRepo.js";
import { createOrderPaymentsRepo } from "../repositories/orderPaymentsRepo.js";
import { createOrdersRepo } from "../repositories/ordersRepo.js";
import type { TenantScope } from "../repositories/tenantScope.js";

/**
 * `pending` never appears as a target - orders only ever move forward
 * (or to `cancelled`). `delivered`/`cancelled` are terminal.
 */
const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["fulfilled", "cancelled"],
  fulfilled: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function createOrdersRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get(
    "/:id/orders",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.ORDER_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const query = listOrdersQuerySchema.parse(req.query);
      const repo = createOrdersRepo(deps.db, { tenantId: req.tenantContext.tenantId });
      res.status(200).json(await repo.list(query));
    }),
  );

  router.get(
    "/:id/orders/:orderId",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.ORDER_READ),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const orderId = requireParam(req.params, "orderId");

      const ordersRepo = createOrdersRepo(deps.db, scope);
      const order = await ordersRepo.findById(orderId);
      if (!order) throw new NotFoundError("order not found");

      const [items, payment] = await Promise.all([
        ordersRepo.listItems(orderId),
        createOrderPaymentsRepo(deps.db, scope).findForOrder(orderId),
      ]);
      res.status(200).json({ ...order, items, payment });
    }),
  );

  router.patch(
    "/:id/orders/:orderId/status",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.ORDER_UPDATE),
    validateBody(updateOrderStatusRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const orderId = requireParam(req.params, "orderId");
      const { status: nextStatus } = req.body as UpdateOrderStatusRequestInput;

      const ordersRepo = createOrdersRepo(deps.db, scope);
      const order = await ordersRepo.findById(orderId);
      if (!order) throw new NotFoundError("order not found");

      if (!LEGAL_TRANSITIONS[order.status].includes(nextStatus)) {
        throw new ConflictError(`cannot move an order from "${order.status}" to "${nextStatus}"`);
      }

      if (nextStatus === "cancelled") {
        // Restocking inventory and flipping the order status commit or fail together.
        const updated = await deps.db.transaction(async (tx) => {
          const items = await createOrdersRepo(tx, scope).listItems(orderId);
          const inventoryRepo = createInventoryRepo(tx, scope);
          for (const item of items) {
            await inventoryRepo.restock(item.variantId, item.quantity);
          }
          return createOrdersRepo(tx, scope).updateStatus(orderId, "cancelled", { cancelledAt: new Date() });
        });
        res.status(200).json(updated);
        return;
      }

      const extra = nextStatus === "delivered" ? { deliveredAt: new Date() } : {};
      const updated = await ordersRepo.updateStatus(orderId, nextStatus, extra);
      res.status(200).json(updated);
    }),
  );

  router.patch(
    "/:id/orders/:orderId/payment",
    requireAuth(deps),
    resolveTenantContext(deps),
    requirePermission(PERMISSION_KEYS.ORDER_UPDATE),
    validateBody(updateOrderPaymentRequestSchema),
    asyncHandler(async (req, res) => {
      if (!req.tenantContext) throw new UnauthorizedError("tenant context not resolved");
      const scope: TenantScope = { tenantId: req.tenantContext.tenantId };
      const orderId = requireParam(req.params, "orderId");
      const { status } = req.body as UpdateOrderPaymentRequestInput;

      const order = await createOrdersRepo(deps.db, scope).findById(orderId);
      if (!order) throw new NotFoundError("order not found");

      const payment = await createOrderPaymentsRepo(deps.db, scope).updateStatus(orderId, status);
      if (!payment) throw new NotFoundError("payment not found for this order");
      res.status(200).json(payment);
    }),
  );

  return router;
}
