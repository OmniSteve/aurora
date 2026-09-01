import React from 'react';
import { useLocation } from 'react-router-dom';

const CONTENT = {
  '/privacy': {
    title: 'Privacy Policy',
    sections: [
      ['Information we collect', 'We collect the details you provide when placing an order or submitting a bespoke request: your name, email address, phone number, delivery address, and any customisation instructions or reference images you share with us.'],
      ['How we use it', 'Your information is used solely to fulfil your orders, communicate about your commissions, and — only if you subscribe — send our occasional newsletter. We never sell your data.'],
      ['Payment information', 'Card payments are processed securely by our payment provider. Aurora never stores your card number or security code.'],
      ['Your rights', 'You may request a copy of your data, or ask us to correct or delete it, at any time by emailing atelier@aurora-jewellery.com.'],
    ],
  },
  '/terms': {
    title: 'Terms of Service',
    sections: [
      ['Made-to-order pieces', 'Many Aurora pieces are made to order. Quoted lead times are estimates and begin once payment (or the required deposit) is received.'],
      ['Deposits & balances', 'Where a deposit is required, the remaining balance is due before dispatch. Deposits on commissioned work are non-refundable once production has begun.'],
      ['Personalised items', 'Engraved and personalised items are made specifically for you and cannot be returned unless faulty.'],
      ['Special requests & bespoke work', 'Special requests and bespoke commissions may require review or an individual quote before payment. We will always confirm the final price with you before charging.'],
      ['Returns', 'Non-personalised, in-stock items may be returned unworn within 14 days of delivery for a full refund.'],
    ],
  },
};

export default function Policy() {
  const { pathname } = useLocation();
  const page = CONTENT[pathname] || CONTENT['/privacy'];

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-light">{page.title}</h1>
      <div className="mt-10 space-y-8">
        {page.sections.map(([h, body]) => (
          <section key={h}>
            <h2 className="font-heading text-xl mb-2">{h}</h2>
            <p className="text-muted-foreground leading-relaxed text-sm">{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}