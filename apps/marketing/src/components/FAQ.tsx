'use client';

import * as Accordion from '@radix-ui/react-accordion';

export interface FAQItem {
  q: string;
  a: string;
}

interface FAQProps {
  items: FAQItem[];
}

export function FAQ({ items }: FAQProps) {
  return (
    <Accordion.Root type="single" collapsible className="space-y-3">
      {items.map((item, i) => (
        <Accordion.Item
          key={item.q}
          value={`item-${i}`}
          className="overflow-hidden rounded-xl border border-gray-200 bg-white"
        >
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-5 py-4 text-left font-medium text-gray-900 hover:bg-gray-50 [&[data-state=open]>svg]:rotate-180">
              {item.q}
              <svg
                className="h-5 w-5 shrink-0 text-gray-500 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <p className="border-t border-gray-100 px-5 py-4 text-gray-600">{item.a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
