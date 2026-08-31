"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiRequest } from "@/utils/ApiSafeCalls";
import { resolveProductImage } from "@/utils/productMedia";

/* =========================================================
   CONSTANTS
========================================================= */

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const PRODUCTS_CACHE_KEY = "productsCache-v4";
const PRODUCTS_CACHE_VERSION = 4;
const PRODUCTS_PER_PAGE = 30;

const CATEGORIES_CACHE_KEY = "categoriesCache";
const MANUFACTURER_STORAGE_KEY = "manufacturerstorage";

/* =========================================================
   HELPERS
========================================================= */

const isBrowser = typeof window !== "undefined";

/* =========================================================
   PRODUCT MAPPER
========================================================= */

const transformProducts = (products = []) => {
  return products.map((product) => ({
    id: product.id,

    product_name: product.product_name,

    stock_quantity: product.stock_quantity,

    available_quantity: product.available_quantity,

    product_code: product.product_code,

    has_variations: product.has_variations,

    starting_price: product.starting_price,

    brand: product.brand?.brand_name || "No Brand",

    category: product.category?.category_name || "Uncategorized",

    category_id: product.category?.id || null,

    parent_id: product.category?.parent_id || null,

    item_number: `#${product.product_code}`,

    actual_price: product.actual_price,

    sell_price: product.sell_price,

    image_url: resolveProductImage(product),

    description: product.product_description,

    unit_info: product.unit_info,

    flash_sale: product.flash_sale,

    delivery_days: product.delivery_target_days,
  }));
};

/* =========================================================
   CATEGORY MAPPER
========================================================= */

const mapCategory = (category) => ({
  id: category.id,

  name: category.category_name,

  parent_id: category.parent_id,

  image: category.image_full_url,

  children: category.activeChildren?.map(mapCategory) || [],
});

const mapCategories = (categories = []) => {
  return categories.map(mapCategory);
};

/* =========================================================
   PRODUCT STORE
========================================================= */

export const useProductStore = create((set, get) => ({
  /* -------------------------
     STATE
  ------------------------- */

  products: [],

  lastFetched: null,

  loading: false,

  loadingMore: false,

  error: null,

  pagination: null,

  currentPage: 0,

  hasMore: true,

  /* =======================================================
     FETCH PRODUCTS
  ======================================================= */

  fetchProducts: async (page = 1, perPage = PRODUCTS_PER_PAGE, append = false) => {
    const state = get();

    /* Prevent duplicate requests */
    if (append && state.loadingMore) {
      return;
    }

    if (!append && state.loading) {
      return;
    }

    const now = Date.now();

    let hasValidCache = false;

    /* =====================================================
       FIRST PAGE CACHE
    ===================================================== */

    if (page === 1 && !append && isBrowser) {
      const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);

      if (cached) {
        try {
          const parsed = JSON.parse(cached);

          const cachedProducts = parsed.version === PRODUCTS_CACHE_VERSION ? parsed.data || [] : [];

          const expiry = parsed.expiry || 0;

          if (cachedProducts.length > 0 && Date.now() < expiry) {
            hasValidCache = true;

            set({
              products: cachedProducts,

              lastFetched: Date.now(),

              currentPage: 1,

              hasMore: true,

              error: null,
            });
          } else {
            localStorage.removeItem(PRODUCTS_CACHE_KEY);
          }
        } catch (error) {
          console.error("Invalid product cache:", error);

          localStorage.removeItem(PRODUCTS_CACHE_KEY);
        }
      }
    }

    /* =====================================================
       LOADING STATE
    ===================================================== */

    if (append) {
      set({
        loadingMore: true,
        error: null,
      });
    } else {
      /*
       * If cache exists, don't show the full-page loader.
       * We still refresh in the background.
       */
      set({
        loading: !hasValidCache,
        error: null,
      });
    }

    /* =====================================================
       API REQUEST
    ===================================================== */

    try {
      const response = await apiRequest(`/products/all?page=${page}&per_page=${perPage}`, false, {
        cache: "no-store",
      });

      const newProducts = transformProducts(response?.products || []);

      const apiPagination = response?.pagination || null;

      const totalPages = Number(apiPagination?.total_pages) || 1;

      /* ===================================================
         UPDATE STORE
      =================================================== */

      set((state) => {
        let updatedProducts;

        if (append) {
          /*
           * Prevent duplicates.
           */

          const existingIds = new Set(state.products.map((product) => product.id));

          const uniqueNewProducts = newProducts.filter((product) => !existingIds.has(product.id));

          updatedProducts = [...state.products, ...uniqueNewProducts];
        } else {
          /*
           * First page replaces current products.
           */

          updatedProducts = newProducts;
        }

        return {
          products: updatedProducts,

          pagination: apiPagination,

          currentPage: page,

          hasMore: page < totalPages,

          lastFetched: now,

          error: null,
        };
      });

      /* ===================================================
         CACHE FIRST PAGE ONLY
      =================================================== */

      if (page === 1 && !append && isBrowser) {
        localStorage.setItem(
          PRODUCTS_CACHE_KEY,
          JSON.stringify({
            data: newProducts,

            expiry: now + CACHE_DURATION,

            version: PRODUCTS_CACHE_VERSION,
          }),
        );
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);

      /*
       * If we already have cached products,
       * don't destroy them.
       */

      set((state) => ({
        error: state.products.length > 0 ? null : "Data not fetched!",
      }));
    } finally {
      set({
        loading: false,

        loadingMore: false,
      });
    }
  },

  /* =======================================================
     LOAD MORE PRODUCTS
  ======================================================= */

  loadMoreProducts: async () => {
    const { currentPage, hasMore, loadingMore } = get();

    if (loadingMore) {
      return;
    }

    if (!hasMore) {
      return;
    }

    const nextPage = currentPage + 1;

    await get().fetchProducts(nextPage, PRODUCTS_PER_PAGE, true);
  },

  /* =======================================================
     RESET PRODUCTS
  ======================================================= */

  resetProducts: () => {
    set({
      products: [],

      pagination: null,

      currentPage: 0,

      hasMore: true,

      loading: false,

      loadingMore: false,

      error: null,

      lastFetched: null,
    });
  },
}));

/* =========================================================
   CATEGORY STORE
========================================================= */

export const useCategoryStore = create((set, get) => ({
  /* -------------------------
       STATE
    ------------------------- */

  categories: [],

  lastFetchedcategory: null,

  loadingcategory: false,

  errorcategory: null,

  /* =======================================================
       FETCH CATEGORIES
    ======================================================= */

  fetchCategories: async () => {
    /*
     * Prevent duplicate requests.
     */

    if (get().loadingcategory) {
      return;
    }

    let cachedCategories = [];

    let expiry = 0;

    let hasValidCache = false;

    /* =====================================================
         SESSION STORAGE CACHE
      ===================================================== */

    if (isBrowser) {
      const cached = sessionStorage.getItem(CATEGORIES_CACHE_KEY);

      if (cached) {
        try {
          const parsed = JSON.parse(cached);

          cachedCategories = parsed.data || [];

          expiry = parsed.expiry || 0;

          if (cachedCategories.length > 0 && Date.now() < expiry) {
            hasValidCache = true;

            set({
              categories: cachedCategories,

              lastFetchedcategory: Date.now(),

              errorcategory: null,
            });

            /*
             * Use cached categories and stop.
             */
            return;
          }

          /*
           * Cache expired.
           */

          sessionStorage.removeItem(CATEGORIES_CACHE_KEY);
        } catch (error) {
          console.error("Invalid category cache:", error);

          sessionStorage.removeItem(CATEGORIES_CACHE_KEY);
        }
      }
    }

    /* =====================================================
         LOADING
      ===================================================== */

    set({
      loadingcategory: !hasValidCache,

      errorcategory: null,
    });

    const now = Date.now();

    /* =====================================================
         API REQUEST
      ===================================================== */

    try {
      const response = await apiRequest("/categories", false);

      if (response?.success && Array.isArray(response.categories)) {
        const mappedCategories = mapCategories(response.categories);

        /* ===============================================
             SAVE SESSION CACHE
          =============================================== */

        if (isBrowser) {
          sessionStorage.setItem(
            CATEGORIES_CACHE_KEY,
            JSON.stringify({
              data: mappedCategories,

              expiry: now + CACHE_DURATION,
            }),
          );
        }

        /* ===============================================
             UPDATE STORE
          =============================================== */

        set({
          categories: mappedCategories,

          lastFetchedcategory: now,

          errorcategory: null,
        });
      } else {
        set({
          errorcategory: "Data not fetched!",
        });
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);

      set({
        errorcategory: "Data not fetched!",
      });
    } finally {
      set({
        loadingcategory: false,
      });
    }
  },

  /* =======================================================
       CLEAR CATEGORY CACHE
    ======================================================= */

  clearCategories: () => {
    if (isBrowser) {
      sessionStorage.removeItem(CATEGORIES_CACHE_KEY);
    }

    set({
      categories: [],

      lastFetchedcategory: null,

      loadingcategory: false,

      errorcategory: null,
    });
  },
}));

/* =========================================================
   MANUFACTURER STORE
========================================================= */

const FIVE_MINUTES = 5 * 60 * 1000;

export const useManufacturerStore = create(
  persist(
    (set, get) => ({
      /* -------------------------
           STATE
        ------------------------- */

      manufacturers: [],

      lastFetchedmanufacturer: null,

      loadingmanufacturer: false,

      errormanufacturer: null,

      /* =================================================
           FETCH MANUFACTURERS
        ================================================= */

      fetchManufacturers: async (force = false) => {
        const { manufacturers, lastFetchedmanufacturer } = get();

        const now = Date.now();

        /* ===============================================
             USE EXISTING STORE CACHE
          =============================================== */

        if (!force && manufacturers.length > 0 && lastFetchedmanufacturer && now - lastFetchedmanufacturer < FIVE_MINUTES) {
          return;
        }

        /* ===============================================
             LOADING
          =============================================== */

        set({
          loadingmanufacturer: true,

          errormanufacturer: null,
        });

        try {
          const response = await apiRequest("/brands", false);

          if (response?.success && Array.isArray(response.brands)) {
            const simplifiedBrands = response.brands.map((brand) => ({
              id: brand.id,

              brand_name: brand.brand_name || brand.name || `Brand ${brand.id}`,
            }));

            set({
              manufacturers: simplifiedBrands,

              lastFetchedmanufacturer: now,

              errormanufacturer: null,
            });
          } else {
            set({
              errormanufacturer: "Data not fetched!",
            });
          }
        } catch (error) {
          console.error("Failed to fetch manufacturers:", error);

          set({
            errormanufacturer: error?.message || "Failed to fetch manufacturers",
          });
        } finally {
          set({
            loadingmanufacturer: false,
          });
        }
      },

      /* =================================================
           CLEAR MANUFACTURERS
        ================================================= */

      clearManufacturers: () => {
        set({
          manufacturers: [],

          lastFetchedmanufacturer: null,

          errormanufacturer: null,
        });
      },
    }),
    {
      name: MANUFACTURER_STORAGE_KEY,

      /*
       * Zustand persist storage.
       * sessionStorage is only available in browser.
       */

      storage: isBrowser
        ? {
            getItem: (name) => sessionStorage.getItem(name),

            setItem: (name, value) => sessionStorage.setItem(name, value),

            removeItem: (name) => sessionStorage.removeItem(name),
          }
        : undefined,
    },
  ),
);
