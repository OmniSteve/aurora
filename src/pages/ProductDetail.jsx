import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Clock } from 'lucide-react';
import { api } from '@/api/aurora';
import { baseUnitPrice, optionsPrice, customizationsPrice, unitTotal, depositForItem } from '@/lib/pricing';
import { formatPrice, round2 } from '@/lib/format';
import ImageGallery from '@/components/product/ImageGallery';
import OptionSelector from '@/components/product/OptionSelector';
import CustomizationFields from '@/components/product/CustomizationFields';
import SpecialRequestDrawer from '@/components/product/SpecialRequestDrawer';
import ProductCard from '@/components/store/ProductCard';
import { useCart } from '@/components/cart/CartContext';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const AVAILABILITY = {
  in_stock: { label: 'In stock', ok: true },
  low_stock: { label: 'Low stock — order soon', ok: true },
  out_of_stock: { label: 'Out of stock', ok: false },
  made_to_order: { label: 'Made to order', ok: true },
  preorder: { label: 'Available for preorder', ok: true },
};

export default function ProductDetail() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState(undefined);
  const [related, setRelated] = useState([]);
  const [selections, setSelections] = useState({});
  const [customs, setCustoms] = useState({});
  const [specialRequest, setSpecialRequest] = useState(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);

  // Clear a "please choose..." validation message as soon as the customer
  // changes a selection, rather than leaving it stuck on screen until they
  // click Add to Cart again -- addToCart() re-validates on submit either way.
  useEffect(() => { setError(''); }, [selections]);

  useEffect(() => {
    setProduct(undefined);
    setSelections({}); setCustoms({}); setSpecialRequest(null); setQty(1); setAdded(false); setError('');
    api.products.getBySlug(slug).then(async (p) => {
      setProduct(p);
      if (p) {
        const all = await api.products.listPublished();
        setRelated(all.filter((x) => x.id !== p.id && x.category_id === p.category_id).slice(0, 4));
      }
    });
  }, [slug]);

  if (product === undefined) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14 grid md:grid-cols-2 gap-12">
        <div className="aspect-square bg-muted animate-pulse" />
        <div className="space-y-4"><div className="h-10 bg-muted animate-pulse w-2/3" /><div className="h-6 bg-muted animate-pulse w-1/3" /></div>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="text-center py-32">
        <h1 className="text-3xl font-light">Piece not found</h1>
        <Link to="/shop" className="text-primary text-sm mt-4 inline-block">Return to the shop</Link>
      </div>
    );
  }

  const avail = AVAILABILITY[product.availability] || AVAILABILITY.in_stock;
  const base = baseUnitPrice(product);
  const optPrice = optionsPrice(product, selections);
  const custPrice = customizationsPrice(product, customs);
  const unit = unitTotal(product, selections, customs);
  const deposit = depositForItem(product, unit);
  const srConfig = product.special_request;
  const requiresApproval = !!specialRequest?.text && srConfig?.payment_behaviour && srConfig.payment_behaviour !== 'immediate';

  const addToCart = () => {
    const missing = (product.options || []).filter(
      (o) => o.required && (selections[o.name] == null || selections[o.name] === '' || selections[o.name] === false)
    );
    if (missing.length) {
      setError(`Please choose: ${missing.map((o) => o.name).join(', ')}`);
      return;
    }
    setError('');
    const img = product.images?.find((i) => i.featured) || product.images?.[0];
    addItem({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      image: img?.url || '',
      sku: product.sku || '',
      quantity: qty,
      unit_price: base,
      options: selections,
      options_price: optPrice,
      customizations: (product.customizations || [])
        .filter((c) => customs[c.label] != null && customs[c.label] !== '' && customs[c.label] !== false)
        .map((c) => ({ label: c.label, value: String(customs[c.label]), price: Number(c.price) || 0 })),
      special_request: specialRequest?.text
        ? { ...specialRequest, payment_behaviour: srConfig?.payment_behaviour || 'immediate' }
        : null,
      unit_total: round2(unit),
      line_total: round2(unit * qty),
      deposit,
      requires_approval: requiresApproval,
    });
    setAdded(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
      <nav className="text-xs text-muted-foreground mb-8" aria-label="Breadcrumb">
        <Link to="/shop" className="hover:text-primary">Shop</Link> <span aria-hidden="true">/</span> {product.name}
      </nav>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20 items-start">
        <div className="md:sticky md:top-28">
          <ImageGallery images={product.images} name={product.name} />
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-light">{product.name}</h1>
            {product.short_description && <p className="text-muted-foreground mt-3 leading-relaxed">{product.short_description}</p>}
            <div className="flex items-baseline gap-3 mt-5">
              {product.sale_price != null && product.sale_price !== '' && product.sale_price < product.price && (
                <span className="text-muted-foreground line-through text-lg">{formatPrice(product.price)}</span>
              )}
              <span className="text-2xl text-primary">{formatPrice(unit)}</span>
              {(optPrice > 0 || custPrice > 0) && (
                <span className="text-xs text-muted-foreground">
                  base {formatPrice(base)}{optPrice > 0 && ` + options ${formatPrice(optPrice)}`}{custPrice > 0 && ` + personalisation ${formatPrice(custPrice)}`}
                </span>
              )}
            </div>
            <p className={`text-xs uppercase tracking-luxe mt-3 ${avail.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
              {avail.label}
              {product.availability === 'made_to_order' && product.lead_time && ` · ${product.lead_time}`}
            </p>
          </div>

          {(product.options || []).length > 0 && (
            <div className="space-y-6 hairline pt-8">
              {product.options.map((opt) => (
                <OptionSelector
                  key={opt.name}
                  option={opt}
                  value={selections[opt.name]}
                  onChange={(v) => setSelections((s) => ({ ...s, [opt.name]: v }))}
                />
              ))}
            </div>
          )}

          {(product.customizations || []).length > 0 && (
            <div className="hairline pt-8">
              <CustomizationFields customizations={product.customizations} values={customs} onChange={setCustoms} />
            </div>
          )}

          {srConfig?.enabled && (
            <div className="hairline pt-8">
              <SpecialRequestDrawer config={srConfig} request={specialRequest} onSave={setSpecialRequest} />
              {requiresApproval && (
                <p className="text-xs text-primary mt-3" role="status">
                  {srConfig.payment_behaviour === 'quote'
                    ? 'This request will be quoted individually — no payment is taken until you approve the quote.'
                    : 'Aurora will review this request before payment is taken.'}
                </p>
              )}
            </div>
          )}

          {deposit > 0 && (
            <div className="border border-primary/40 p-4 text-sm">
              <p className="flex justify-between"><span>Deposit due today</span><span className="text-primary">{formatPrice(deposit * qty)}</span></p>
              <p className="flex justify-between text-muted-foreground mt-1"><span>Balance on completion</span><span>{formatPrice(round2(unit * qty - deposit * qty))}</span></p>
            </div>
          )}

          {error && <p className="text-destructive text-sm" role="alert">{error}</p>}

          <div className="flex gap-3">
            <div className="flex items-center border border-border">
              <button aria-label="Decrease quantity" className="px-4 py-3" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span className="w-8 text-center text-sm" aria-live="polite">{qty}</span>
              <button aria-label="Increase quantity" className="px-4 py-3" onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <button
              onClick={addToCart}
              disabled={!avail.ok}
              className="flex-1 bg-primary text-primary-foreground text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-50 py-4"
            >
              {avail.ok ? `Add to Cart — ${formatPrice(round2(unit * qty))}` : 'Out of Stock'}
            </button>
          </div>
          {added && (
            <p className="text-sm flex items-center gap-2" role="status">
              <Check className="w-4 h-4 text-primary" /> Added to your cart.{' '}
              <Link to="/cart" className="text-primary underline underline-offset-4">View cart</Link>
            </p>
          )}

          <Accordion type="single" collapsible className="hairline pt-4">
            {product.description && (
              <AccordionItem value="desc">
                <AccordionTrigger className="text-sm uppercase tracking-luxe">Description</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</AccordionContent>
              </AccordionItem>
            )}
            {(product.materials || []).length > 0 && (
              <AccordionItem value="materials">
                <AccordionTrigger className="text-sm uppercase tracking-luxe">Materials</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{product.materials.join(', ')}</AccordionContent>
              </AccordionItem>
            )}
            {product.care_info && (
              <AccordionItem value="care">
                <AccordionTrigger className="text-sm uppercase tracking-luxe">Care</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{product.care_info}</AccordionContent>
              </AccordionItem>
            )}
            {product.shipping_info && (
              <AccordionItem value="shipping">
                <AccordionTrigger className="text-sm uppercase tracking-luxe">Shipping</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{product.shipping_info}</AccordionContent>
              </AccordionItem>
            )}
          </Accordion>

          {product.lead_time && product.availability !== 'made_to_order' && (
            <p className="text-xs text-muted-foreground flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Production time: {product.lead_time}</p>
          )}
          {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-28">
          <h2 className="text-3xl font-light text-center mb-12">You May Also Love</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}