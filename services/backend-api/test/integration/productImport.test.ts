import type { Express } from "express";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/testApp.js";
import { registerVerifiedUser, createTenantForOwner, uniqueSlug } from "../helpers/fixtures.js";
import type { TestEmailProvider } from "../helpers/testEmailProvider.js";

const HEADERS = [
  "Product Name",
  "Product Slug",
  "Description",
  "Category",
  "Collections",
  "Subcategory",
  "Gender",
  "Style",
  "Occasion",
  "Season",
  "Fit",
  "Material",
  "Brand",
  "SKU",
  "Size",
  "Color",
  "Price",
  "Quantity",
];

async function buildImportWorkbookBuffer(rows: Array<Record<string, string>>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.addRow(HEADERS);
  for (const row of rows) {
    sheet.addRow(HEADERS.map((header) => row[header] ?? ""));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

interface Store {
  owner: Awaited<ReturnType<typeof registerVerifiedUser>>;
  tenantId: string;
}

async function setupStore(app: Express, emailProvider: TestEmailProvider): Promise<Store> {
  const owner = await registerVerifiedUser(app, emailProvider);
  const { tenantId } = await createTenantForOwner(app, owner);
  return { owner, tenantId };
}

function importRequest(app: Express, store: Store, buffer: Buffer) {
  return request(app)
    .post(`/tenants/${store.tenantId}/products/import`)
    .set("Authorization", `Bearer ${store.owner.accessToken}`)
    .attach("file", buffer, "products.xlsx");
}

describe("product import", () => {
  it("imports a multi-variant single product from one Product Name group", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);
    const productName = `Combo Tee ${uniqueSlug("p")}`;
    const skuA = uniqueSlug("SKU-A");
    const skuB = uniqueSlug("SKU-B");

    const buffer = await buildImportWorkbookBuffer([
      { "Product Name": productName, Description: "A nice tee", SKU: skuA, Size: "S", Color: "Red", Price: "19.99", Quantity: "5" },
      { "Product Name": productName, SKU: skuB, Size: "M", Color: "Blue", Price: "19.99", Quantity: "3" },
    ]);

    const res = await importRequest(app, store, buffer).expect(200);
    const results = res.body.results;
    expect(results).toHaveLength(2);
    expect(results.every((r: { status: string }) => r.status === "created")).toBe(true);

    const listRes = await request(app)
      .get(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);
    const created = listRes.body.find((p: { name: string }) => p.name === productName);
    expect(created).toBeDefined();
    expect(created.variantCount).toBe(2);

    const detailRes = await request(app)
      .get(`/tenants/${store.tenantId}/products/${created.id}`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);
    const variantA = detailRes.body.variants.find((v: { sku: string }) => v.sku === skuA);
    expect(variantA.quantity).toBe(5);
    expect(variantA.priceCents).toBe(1999);
  });

  it("imports multiple distinct products from one file", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);
    const nameA = `Product A ${uniqueSlug("p")}`;
    const nameB = `Product B ${uniqueSlug("p")}`;

    const buffer = await buildImportWorkbookBuffer([
      { "Product Name": nameA, SKU: uniqueSlug("SKU"), Price: "10" },
      { "Product Name": nameB, SKU: uniqueSlug("SKU"), Price: "20" },
    ]);

    const res = await importRequest(app, store, buffer).expect(200);
    expect(res.body.results.every((r: { status: string }) => r.status === "created")).toBe(true);

    const listRes = await request(app)
      .get(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);
    expect(listRes.body.some((p: { name: string }) => p.name === nameA)).toBe(true);
    expect(listRes.body.some((p: { name: string }) => p.name === nameB)).toBe(true);
  });

  it("fails the whole group on an unknown category name, without affecting other groups in the same file", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);
    const badName = `Bad Category Product ${uniqueSlug("p")}`;
    const goodName = `Good Product ${uniqueSlug("p")}`;

    const buffer = await buildImportWorkbookBuffer([
      { "Product Name": badName, Category: "Nonexistent Category XYZ", SKU: uniqueSlug("SKU"), Price: "10" },
      { "Product Name": goodName, SKU: uniqueSlug("SKU"), Price: "10" },
    ]);

    const res = await importRequest(app, store, buffer).expect(200);
    const results: Array<{ productName: string; status: string; error?: string }> = res.body.results;
    const badResult = results.find((r) => r.productName === badName);
    const goodResult = results.find((r) => r.productName === goodName);
    expect(badResult?.status).toBe("error");
    expect(badResult?.error).toContain("not found");
    expect(goodResult?.status).toBe("created");

    const listRes = await request(app)
      .get(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);
    expect(listRes.body.some((p: { name: string }) => p.name === badName)).toBe(false);
  });

  it("fails a group referencing an ambiguous category name (two categories sharing that name)", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);

    await request(app)
      .post(`/tenants/${store.tenantId}/categories`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Shoes", slug: uniqueSlug("shoes-a") })
      .expect(201);
    await request(app)
      .post(`/tenants/${store.tenantId}/categories`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Shoes", slug: uniqueSlug("shoes-b") })
      .expect(201);

    const productName = `Ambiguous Category Product ${uniqueSlug("p")}`;
    const buffer = await buildImportWorkbookBuffer([
      { "Product Name": productName, Category: "Shoes", SKU: uniqueSlug("SKU"), Price: "10" },
    ]);

    const res = await importRequest(app, store, buffer).expect(200);
    const result = res.body.results[0];
    expect(result.status).toBe("error");
    expect(result.error).toContain("more than one category");
  });

  it("isolates a duplicate-SKU row failure from the product and its other variants", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);
    const existingSku = uniqueSlug("SKU-existing");

    await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Pre-existing Product", slug: uniqueSlug("pre-existing") })
      .then(async (res) => {
        await request(app)
          .post(`/tenants/${store.tenantId}/products/${res.body.id}/variants`)
          .set("Authorization", `Bearer ${store.owner.accessToken}`)
          .send({ sku: existingSku, priceCents: 1000 })
          .expect(201);
      });

    const productName = `Dup SKU Product ${uniqueSlug("p")}`;
    const goodSku = uniqueSlug("SKU-good");
    const buffer = await buildImportWorkbookBuffer([
      { "Product Name": productName, SKU: existingSku, Price: "10" },
      { "Product Name": productName, SKU: goodSku, Price: "12" },
    ]);

    const res = await importRequest(app, store, buffer).expect(200);
    const results: Array<{ sku: string; status: string; error?: string }> = res.body.results;
    const dupResult = results.find((r) => r.sku === existingSku);
    const goodResult = results.find((r) => r.sku === goodSku);
    expect(dupResult?.status).toBe("error");
    expect(dupResult?.error).toContain("already exists");
    expect(goodResult?.status).toBe("created");

    const listRes = await request(app)
      .get(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);
    expect(listRes.body.some((p: { name: string }) => p.name === productName)).toBe(true);
  });

  it("rejects a file exceeding the max row count without creating anything", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);

    const rows = Array.from({ length: 501 }, (_, i) => ({
      "Product Name": `Row Cap Product ${uniqueSlug("p")}-${i}`,
      SKU: uniqueSlug("SKU"),
      Price: "10",
    }));
    const buffer = await buildImportWorkbookBuffer(rows);

    const res = await importRequest(app, store, buffer).expect(422);
    expect(res.body.message).toContain("too many rows");
  });

  it("rejects a corrupted/non-xlsx file with a clear error", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);

    const res = await importRequest(app, store, Buffer.from("this is not an xlsx file")).expect(422);
    expect(res.body.message).toContain("invalid or corrupted");
  });

  it("skips blank/trailing rows instead of treating them as phantom products", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);
    const productName = `Trailing Rows Product ${uniqueSlug("p")}`;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Products");
    sheet.addRow(HEADERS);
    sheet.addRow(HEADERS.map((h) => (h === "Product Name" ? productName : h === "SKU" ? uniqueSlug("SKU") : h === "Price" ? "10" : "")));
    sheet.addRow(HEADERS.map(() => "")); // fully blank row
    sheet.addRow(HEADERS.map(() => "")); // another blank row
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const res = await importRequest(app, store, buffer).expect(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].status).toBe("created");
  });

  it("groups Product Name case-insensitively and trimmed, mirroring Category/Collection resolution", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);
    const base = `Classic Tee ${uniqueSlug("p")}`;

    const buffer = await buildImportWorkbookBuffer([
      { "Product Name": base, SKU: uniqueSlug("SKU"), Price: "10" },
      { "Product Name": `  ${base.toUpperCase()}  `, SKU: uniqueSlug("SKU"), Price: "10" },
    ]);

    const res = await importRequest(app, store, buffer).expect(200);
    expect(res.body.results.every((r: { status: string }) => r.status === "created")).toBe(true);

    const listRes = await request(app)
      .get(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .expect(200);
    const matches = listRes.body.filter((p: { name: string }) => p.name.toLowerCase() === base.toLowerCase());
    expect(matches).toHaveLength(1);
    expect(matches[0].variantCount).toBe(2);
  });

  it("reports a clear 'already exists' error for a slug matching an existing product, confirming create-only scope", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);
    const slug = uniqueSlug("existing-product");

    await request(app)
      .post(`/tenants/${store.tenantId}/products`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Existing Product", slug })
      .expect(201);

    const buffer = await buildImportWorkbookBuffer([
      { "Product Name": "Existing Product", "Product Slug": slug, SKU: uniqueSlug("SKU"), Price: "10" },
    ]);

    const res = await importRequest(app, store, buffer).expect(200);
    const result = res.body.results[0];
    expect(result.status).toBe("error");
    expect(result.error).toContain("already exists");
  });

  it("the template endpoint round-trips through exceljs with expected headers and the tenant's real category/collection names", async () => {
    const { app, emailProvider } = buildTestApp();
    const store = await setupStore(app, emailProvider);

    await request(app)
      .post(`/tenants/${store.tenantId}/categories`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Dresses", slug: uniqueSlug("dresses") })
      .expect(201);
    await request(app)
      .post(`/tenants/${store.tenantId}/collections`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .send({ name: "Summer 2026", slug: uniqueSlug("summer") })
      .expect(201);

    const res = await request(app)
      .get(`/tenants/${store.tenantId}/products/import/template`)
      .set("Authorization", `Bearer ${store.owner.accessToken}`)
      .responseType("blob")
      .expect(200);

    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("product-import-template.xlsx");

    const workbook = new ExcelJS.Workbook();
    // exceljs's own type defs corrupt the global Buffer type (see productImport.ts) -
    // `any` is the correct escape hatch here too, not laziness.
    await workbook.xlsx.load(res.body as any);
    const productsSheet = workbook.getWorksheet("Products");
    expect(productsSheet).toBeDefined();
    const headerRow = productsSheet!.getRow(1).values as unknown[];
    expect(headerRow).toContain("Product Name");
    expect(headerRow).toContain("SKU");
    expect(headerRow).toContain("Price");

    const referenceSheet = workbook.getWorksheet("Reference");
    expect(referenceSheet).toBeDefined();
    const referenceText = referenceSheet!
      .getSheetValues()
      .flat()
      .filter((v): v is string => typeof v === "string")
      .join("\n");
    expect(referenceText).toContain("Dresses");
    expect(referenceText).toContain("Summer 2026");
  });
});
