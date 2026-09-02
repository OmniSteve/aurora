import { z } from 'zod';
import { parseJsonBody } from '../lib/validate.js';
import { requireAdmin, requireCsrf } from '../lib/authGuard.js';
import { NotFoundError } from '../lib/http.js';

const optionValueSchema = z.object({
  label: z.string().max(200).optional().default(''),
  price_modifier: z.union([z.number(), z.string()]).optional().default(0),
  sku_suffix: z.string().max(50).nullable().optional(),
  swatch: z.string().max(20).nullable().optional(),
  available: z.boolean().nullable().optional(),
  lead_time: z.string().max(100).nullable().optional(),
});

const optionSchema = z.object({
  name: z.string().max(200),
  type: z.enum(['dropdown', 'buttons', 'swatches', 'text', 'number', 'checkbox', 'radio']),
  required: z.boolean().optional(),
  values: z.array(optionValueSchema).max(100).optional(),
});

const customizationSchema = z.object({
  label: z.string().max(200),
  type: z.enum(['text', 'number', 'select', 'date', 'checkbox']),
  price: z.union([z.number(), z.string()]).optional().default(0),
  options: z.array(z.string().max(200)).max(100).optional(),
  placeholder: z.string().max(200).nullable().optional(),
  max_length: z.number().int().positive().nullable().optional(),
});

const imageSchema = z.object({
  url: z.string().max(2000),
  alt: z.string().max(300).nullable().optional(),
  featured: z.boolean().optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(300),
  slug: z.string().trim().min(1).max(300),
  sku: z.string().max(100).nullable().optional(),
  short_description: z.string().max(1000).nullable().optional(),
  description: z.string().max(20000).nullable().optional(),
  price: z.union([z.number(), z.string()]),
  sale_price: z.union([z.number(), z.string()]).nullable().optional(),
  category_id: z.string().max(100).nullable().optional(),
  collection_ids: z.array(z.string().max(100)).max(100).optional(),
  images: z.array(imageSchema).max(50).optional(),
  materials: z.array(z.string().max(100)).max(100).optional(),
  availability: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'made_to_order', 'preorder']).optional(),
  stock_quantity: z.union([z.number(), z.string()]).nullable().optional(),
  lead_time: z.string().max(200).nullable().optional(),
  options: z.array(optionSchema).max(50).optional(),
  customizations: z.array(customizationSchema).max(50).optional(),
  special_request: z
    .object({
      enabled: z.boolean().optional(),
      message: z.string().max(500).nullable().optional(),
      allow_images: z.boolean().optional(),
      max_images: z.number().int().min(0).max(20).optional(),
      payment_behaviour: z.enum(['immediate', 'approval', 'quote']).optional(),
    })
    .nullable()
    .optional(),
  deposit: z
    .object({
      enabled: z.boolean().optional(),
      type: z.enum(['fixed', 'percentage']).optional(),
      value: z.union([z.number(), z.string()]).optional(),
    })
    .nullable()
    .optional(),
  care_info: z.string().max(5000).nullable().optional(),
  shipping_info: z.string().max(5000).nullable().optional(),
  seo: z.object({ title: z.string().max(300).nullable().optional(), description: z.string().max(500).nullable().optional(), og_image: z.string().max(2000).nullable().optional() }).nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  featured: z.boolean().optional(),
  new_arrival: z.boolean().optional(),
});

export function registerAdminProductRoutes(router) {
  router.get('/api/admin/products', async (ctx) => {
    await requireAdmin(ctx);
    const products = await ctx.repositories.products.listAllAdmin();
    return ctx.json({ products });
  });

  router.get('/api/admin/products/:id', async (ctx) => {
    await requireAdmin(ctx);
    const product = await ctx.repositories.products.getByIdAdmin(ctx.params.id);
    if (!product) throw new NotFoundError('Product not found');
    return ctx.json({ product });
  });

  router.post('/api/admin/products', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, productSchema);
    const product = await ctx.repositories.products.create(data);
    return ctx.json({ product }, 201);
  });

  router.put('/api/admin/products/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const data = await parseJsonBody(ctx.request, productSchema);
    const existing = await ctx.repositories.products.getByIdAdmin(ctx.params.id);
    if (!existing) throw new NotFoundError('Product not found');
    const product = await ctx.repositories.products.update(ctx.params.id, data);
    return ctx.json({ product });
  });

  router.del('/api/admin/products/:id', async (ctx) => {
    const { session } = await requireAdmin(ctx);
    await requireCsrf(ctx, session);
    const existing = await ctx.repositories.products.getByIdAdmin(ctx.params.id);
    if (!existing) throw new NotFoundError('Product not found');
    await ctx.repositories.products.remove(ctx.params.id);
    return ctx.json({ deleted: true });
  });
}
