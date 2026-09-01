import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '@/api/aurora';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BasicsTab from '@/components/admin/product/BasicsTab';
import ImagesTab from '@/components/admin/product/ImagesTab';
import PricingTab from '@/components/admin/product/PricingTab';
import OptionsTab from '@/components/admin/product/OptionsTab';
import CustomisationTab from '@/components/admin/product/CustomisationTab';
import SpecialRequestTab from '@/components/admin/product/SpecialRequestTab';
import InventoryTab from '@/components/admin/product/InventoryTab';
import SeoTab from '@/components/admin/product/SeoTab';

const BLANK = {
  name: '', slug: '', sku: '', short_description: '', description: '',
  price: 0, sale_price: null, category_id: '', collection_ids: [], images: [], materials: [],
  availability: 'in_stock', stock_quantity: 0, lead_time: '',
  options: [], customizations: [],
  special_request: { enabled: false, message: 'Have something different in mind?', allow_images: true, max_images: 3, payment_behaviour: 'approval' },
  deposit: { enabled: false, type: 'percentage', value: 30 },
  care_info: '', shipping_info: '',
  seo: { title: '', description: '', og_image: '' },
  status: 'draft', featured: false, new_arrival: false,
};

export default function AdminProductEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [form, setForm] = useState(isNew ? BLANK : null);
  const [categories, setCategories] = useState([]);
  const [collections, setCollections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.categories.listAll().then(setCategories);
    api.collections.listAll().then(setCollections);
    if (!isNew) api.products.get(id).then((p) => setForm({ ...BLANK, ...p }));
  }, [id, isNew]);

  if (!form) return <p className="text-muted-foreground">Loading product…</p>;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('The product needs a name.');
    setSaving(true);
    const { id: _id, created_date, updated_date, created_by_id, ...data } = form;
    data.price = Number(data.price) || 0;
    data.sale_price = data.sale_price === '' || data.sale_price == null ? null : Number(data.sale_price);
    data.stock_quantity = Number(data.stock_quantity) || 0;
    try {
      if (isNew) {
        const created = await api.products.create(data);
        navigate(`/admin/products/${created.id}`, { replace: true });
      } else {
        await api.products.update(id, data);
      }
    } catch {
      setError('Could not save the product. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link to="/admin/products" aria-label="Back to products" className="p-2 border border-border hover:border-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl md:text-3xl font-light">{isNew ? 'New Product' : form.name || 'Edit Product'}</h1>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 text-xs uppercase tracking-luxe hover:bg-primary/90 transition-colors disabled:opacity-60">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </button>
      </div>
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}

      <Tabs defaultValue="basics">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="options">Variants</TabsTrigger>
          <TabsTrigger value="custom">Personalisation</TabsTrigger>
          <TabsTrigger value="special">Special Requests</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="basics"><BasicsTab form={form} set={set} categories={categories} collections={collections} /></TabsContent>
          <TabsContent value="images"><ImagesTab form={form} set={set} /></TabsContent>
          <TabsContent value="pricing"><PricingTab form={form} set={set} /></TabsContent>
          <TabsContent value="options"><OptionsTab form={form} set={set} /></TabsContent>
          <TabsContent value="custom"><CustomisationTab form={form} set={set} /></TabsContent>
          <TabsContent value="special"><SpecialRequestTab form={form} set={set} /></TabsContent>
          <TabsContent value="inventory"><InventoryTab form={form} set={set} /></TabsContent>
          <TabsContent value="seo"><SeoTab form={form} set={set} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}