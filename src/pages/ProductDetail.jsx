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
import Container from '@/components/store/editorial/Container';
import { useCart } from '@/components/cart/CartContext';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const AVAILABILITY = {
  in_stock: { label: 'In stock', ok: true },
  low_stock: { label: 'Low stock — order soon', ok: true },
  out_of_stock: { label: 'Out of stock', ok: false },
  made_to_order: { label: 'Made to order', ok: true },
  preorder: { label: 'Available for preorder', ok: true },
};

// Cosmetic accent dot beside each material -- same mapping as
// components/home/MaterialStory.jsx, kept local since PDP is the only
// other place a per-material accent appears.
const STONE_TOKENS = ['--stone-rose', '--stone-aqua', '--stone-amber', '--stone-clay', '--stone-smoke'];
const KEYWORD_TOKEN = [
  [/rose|pink/i, '--stone-rose'],
  [/aqua|blue|sapphire|topaz/i, '--stone-aqua'],
  [/tiger|amber|citrine|gold/i, '--stone-amber'],
  [/agate|clay|brown|wood/i, '--stone-clay'],
  [/obsidian|smoke|onyx|black/i, '--stone-smoke'],
];
function tokenFor(name, index) {
  const match = KEYWORD_TOKEN.find(([re]) => re.test(name));
  return match ? match[1] : STONE_TOKENS[index % STONE_TOKENS.length];
}

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
  // click Add to Bag again -- addToCart() re-validates on submit either way.
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
      <Container className="py-16 grid lg:grid-cols-[3fr_2fr] gap-12 lg:gap-16">
        <div className="aspect-[4/5] bg-muted animate-pulse" />
        <div className="space-y-4 pt-4"><div className="h-10 bg-muted animate-pulse w-2/3" /><div className="h-6 bg-muted animate-pulse w-1/3" /></div>
      </Container>
    );
  }
  if (!product) {
    return (
      <div className="text-center py-32">
        <h1 className="font-heading text-3xl font-light">Piece not found</h1>
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
  const materials = product.materials || [];

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
    <Container className="py-14">
      <nav className="text-xs text-muted-foreground mb-8" aria-label="Breadcrumb">
        <Link to="/shop" className="hover:text-primary transition-colors">Shop</Link> <span aria-hidden="true">/</span> {product.name}
      </nav>
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-12 lg:gap-16 items-start">
        <div>
          <ImageGallery images={product.images} name={product.name} />
        </div>

        <div className="lg:sticky lg:top-28 space-y-8">
          <div>
            {materials.length > 0 && (
              <p className="eyebrow mb-3">{materials.join(' · ')}</p>
            )}
            <h1 className="font-heading font-light text-3xl md:text-4xl leading-tight">{product.name}</h1>
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
              <button aria-label="Decrease quantity" className="px-4 py-3.5" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span className="w-8 text-center text-sm" aria-live="polite">{qty}</span>
              <button aria-label="Increase quantity" className="px-4 py-3.5" onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <button onClick={addToCart} disabled={!avail.ok} className="btn-primary flex-1 py-0">
              {avail.ok ? `Add to Bag — ${formatPrice(round2(unit * qty))}` : 'Out of Stock'}
            </button>
          </div>
          {added && (
            <p className="text-sm flex items-center gap-2" role="status">
              <Check className="w-4 h-4 text-primary" /> Added to your bag.{' '}
              <Link to="/cart" className="text-primary underline underline-offset-4">View bag</Link>
            </p>
          )}

          <Accordion type="single" collapsible className="hairline pt-4">
            {materials.length > 0 && (
              <AccordionItem value="stones">
                <AccordionTrigger className="text-sm uppercase tracking-luxe">The Stones</AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-2.5">
                    {materials.map((m, i) => (
                      <li key={m} className="flex items-center gap-2.5 text-muted-foreground">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `hsl(var(${tokenFor(m, i)}))` }} aria-hidden="true" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            )}
            {product.description && (
              <AccordionItem value="details">
                <AccordionTrigger className="text-sm uppercase tracking-luxe">Details</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</AccordionContent>
              </AccordionItem>
            )}
            {product.care_info && (
              <AccordionItem value="care">
                <AccordionTrigger className="text-sm uppercase tracking-luxe">Care</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{product.care_info}</AccordionContent>
              </AccordionItem>
            )}
            {product.shipping_info && (
              <AccordionItem value="delivery">
                <AccordionTrigger className="text-sm uppercase tracking-luxe">Delivery</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{product.shipping_info}</AccordionContent>
              </AccordionItem>
            )}
          </Accordion>

          {product.lead_time && product.availability !== 'made_to_order' && (
            <p className="text-xs text-muted-foreground flex items-center gap-2"><Clock className="w-3.5 h-3.5" strokeWidth={1.5} /> Production time: {product.lead_time}</p>
          )}
          {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-28">
          <h2 className="font-heading font-light text-3xl text-center mb-14">You May Also Love</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12 md:gap-x-10">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </Container>
  );
}
