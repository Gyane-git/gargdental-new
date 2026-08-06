import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { mkdir, readdir } from "fs/promises";
import { prisma } from "@/lib/prisma";

// Ported near-verbatim from gargnew's utils/excelUpload.js - this one is schema-agnostic (just
// products/categories/brands, whose column names already match exactly between both projects),
// so only the pool.query() calls needed converting to Prisma.

export const IMAGE_UPLOAD_ROOT = path.join(process.cwd(), "public", "images", "uploads");

export const PRODUCT_TEMPLATE_HEADERS = [
  "product_name",
  "category_id",
  "delivery_target_days",
  "brand_id",
  "actual_price",
  "sell_price",
  "available_quantity",
  "stock_quantity",
];

export const IMAGE_TEMPLATE_HEADERS = ["product_code", "product_name", "main_image", "image_1", "image_2", "image_3", "image_4", "image_5"];

export const generateProductCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `P${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
    const existing = await prisma.products.findFirst({ where: { product_code: code } });
    if (!existing) return code;
  }
  throw new Error("Unable to generate a unique product code.");
};

export const slugify = (value = ""): string =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const toNumberOrZero = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeHeader = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const pickRowValue = (row: Record<string, unknown>, keys: string[] = []): unknown => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
};

export const parseIdValue = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const id = Number(match[0]);
  return Number.isFinite(id) ? id : null;
};

export const resolveCategoryId = async (row: Record<string, unknown>): Promise<number | null> => {
  const directId = parseIdValue(pickRowValue(row, ["category_id", "categoryid", "category", "cat_id", "catid"]));
  if (directId) return directId;

  const categoryName = String(pickRowValue(row, ["category_name", "categoryname", "category_title", "categorytitle"])).trim();
  if (!categoryName) return null;

  const exact = await prisma.categories.findFirst({ where: { category_name: categoryName } });
  if (exact) return Number(exact.id);

  const all = await prisma.categories.findMany({ select: { id: true, category_name: true } });
  const fuzzy = all.find((c) => c.category_name.trim().toLowerCase() === categoryName.toLowerCase());
  return fuzzy ? Number(fuzzy.id) : null;
};

export const resolveBrandId = async (row: Record<string, unknown>): Promise<number | null> => {
  const directId = parseIdValue(pickRowValue(row, ["brand_id", "brandid", "brand", "brand_code"]));
  if (directId) return directId;

  const brandName = String(pickRowValue(row, ["brand_name", "brandname", "brand_title"])).trim();
  if (!brandName) return null;

  const exact = await prisma.brands.findFirst({ where: { brand_name: brandName } });
  if (exact) return Number(exact.id);

  const all = await prisma.brands.findMany({ select: { id: true, brand_name: true } });
  const fuzzy = all.find((b) => b.brand_name.trim().toLowerCase() === brandName.toLowerCase());
  return fuzzy ? Number(fuzzy.id) : null;
};

export const parseExcelBuffer = (buffer: Buffer): Record<string, unknown>[] => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = typeof value === "string" ? value.trim() : value;
    });
    return normalized;
  });
};

export const buildWorkbookBuffer = (sheetName: string, headers: string[], rows: unknown[][] = []): Buffer => {
  const workbook = XLSX.utils.book_new();
  const data = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

export const excelDownloadResponse = (buffer: Buffer, filename: string): Response =>
  new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });

export const normalizeImagePath = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  let raw = String(value).trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      raw = decodeURIComponent(url.pathname);
    } catch {
      return raw;
    }
  }

  raw = raw.replace(/^public\//, "");
  if (!raw.startsWith("/")) raw = `/${raw}`;
  return raw.replace(/\/+/g, "/");
};

export const collectGalleryPathsFromRow = (row: Record<string, unknown>): string[] => {
  const paths: string[] = [];

  for (let i = 1; i <= 10; i++) {
    const value = pickRowValue(row, [`image_${i}`, `image${i}`, `gallery_${i}`, `gallery${i}`, `img_${i}`, `img${i}`]);
    const normalized = normalizeImagePath(value);
    if (normalized && !paths.includes(normalized)) paths.push(normalized);
  }

  Object.keys(row).forEach((key) => {
    if (key === "main_image") return;
    if (!/^(image|gallery|img)_?\d+$/i.test(key)) return;
    const normalized = normalizeImagePath(row[key]);
    if (normalized && !paths.includes(normalized)) paths.push(normalized);
  });

  return paths;
};

interface CategoryTreeNode {
  category_name: string;
  children?: CategoryTreeNode[];
  active_children?: CategoryTreeNode[];
}

const walkFilesRecursive = async (dir: string, baseDir: string, collected: string[] = []): Promise<string[]> => {
  let entries: fs.Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return collected;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFilesRecursive(fullPath, baseDir, collected);
      continue;
    }
    if (!entry.isFile()) continue;
    collected.push(path.relative(baseDir, fullPath).split(path.sep).join("/"));
  }

  return collected;
};

export const organizeFilesForCategories = async (categories: CategoryTreeNode[] = []): Promise<Record<string, string[]>> => {
  await mkdir(IMAGE_UPLOAD_ROOT, { recursive: true });
  const organized: Record<string, string[]> = {};

  const walkCategory = async (category: CategoryTreeNode) => {
    const folderName = category.category_name;
    const categoryFolder = path.join(IMAGE_UPLOAD_ROOT, folderName);
    if (fs.existsSync(categoryFolder)) {
      const files = await walkFilesRecursive(categoryFolder, IMAGE_UPLOAD_ROOT);
      if (files.length) organized[folderName] = files;
    }

    const children = category.children || category.active_children || [];
    for (const child of children) await walkCategory(child);
  };

  for (const category of categories) await walkCategory(category);

  return organized;
};

export const ensureCategoryFolder = async (folderName: string): Promise<string> => {
  const destination = path.join(IMAGE_UPLOAD_ROOT, folderName);
  await mkdir(destination, { recursive: true });
  return destination;
};

export const flattenCategoryTree = (tree: CategoryTreeNode[] = [], level = 0, list: unknown[] = []): unknown[] => {
  for (const category of tree) {
    list.push({
      category_name: category.category_name,
      level,
      label: `${"— ".repeat(level)}${category.category_name}`,
    });
    const children = category.children || category.active_children || [];
    if (children.length) flattenCategoryTree(children, level + 1, list);
  }
  return list;
};
