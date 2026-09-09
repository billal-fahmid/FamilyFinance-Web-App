'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Category } from '@/types/database';

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

interface Props {
  categories: Category[];
  value: string;
  onChange: (key: string) => void;
  onCategoryCreated: (category: Category) => void;
  familyId: string;
  type: 'expense' | 'income';
  placeholder?: string;
  id?: string;
}

/** Searchable category picker — type to filter, or type a new name and
 * create it on the fly (family admins only; the DB enforces that via RLS). */
export function CategoryCombobox({
  categories, value, onChange, onCategoryCreated, familyId, type, placeholder = 'Select a category', id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = categories.find((c) => c.key === value);

  // Keep the displayed text in sync with the selection while closed, so it
  // never looks like an unsaved edit.
  useEffect(() => {
    if (!open) setQuery(selected?.label ?? '');
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.label.toLowerCase().includes(q));
  }, [categories, query]);

  const groups = useMemo(() => {
    const acc: Record<string, Category[]> = {};
    filtered.forEach((c) => {
      const g = c.parent_key || 'other';
      (acc[g] ??= []).push(c);
    });
    return acc;
  }, [filtered]);

  const exactMatch = categories.find((c) => c.label.toLowerCase() === query.trim().toLowerCase());
  const canOfferCreate = query.trim().length > 0 && !exactMatch;

  const select = (cat: Category) => {
    onChange(cat.key);
    setQuery(cat.label);
    setOpen(false);
    setError(null);
  };

  const createCategory = async () => {
    const label = query.trim();
    if (!label || !familyId) return;
    setError(null);
    setCreating(true);
    const supabase = createClient();
    const key = slugify(label) || `custom_${Date.now()}`;
    const { data, error: err } = await supabase
      .from('categories')
      .insert({ family_id: familyId, type, parent_key: null, key, label, is_system: false })
      .select()
      .single();
    setCreating(false);
    if (err || !data) {
      const code = (err as { code?: string } | null)?.code;
      setError(
        code === '42501'
          ? "Only family admins can add new categories — ask an admin, or pick an existing one."
          : err?.message ?? 'Could not create category'
      );
      return;
    }
    const created = data as Category;
    onCategoryCreated(created);
    select(created);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (exactMatch) select(exactMatch);
      else if (filtered.length === 1) select(filtered[0]);
      else if (canOfferCreate) createCategory();
    } else if (e.key === 'Escape') {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex h-10 w-full items-center rounded-md border border-input bg-background pl-8 pr-8 text-sm',
            'transition-colors placeholder:text-muted-foreground hover:border-ring/60',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
          )}
          placeholder={placeholder}
          value={open ? query : selected?.label ?? ''}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{titleCase(group)}</p>
              {items.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => select(c)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none',
                    'hover:bg-accent hover:text-accent-foreground',
                    c.key === value && 'font-medium'
                  )}
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', c.key === value ? 'text-primary opacity-100' : 'opacity-0')} />
                  {c.label}
                  {!c.is_system && <span className="ml-auto text-[10px] text-muted-foreground">Custom</span>}
                </button>
              ))}
            </div>
          ))}

          {filtered.length === 0 && !canOfferCreate && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">No categories found</p>
          )}

          {canOfferCreate && (
            <button
              type="button"
              disabled={creating}
              onClick={createCategory}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-primary outline-none hover:bg-accent disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              {creating ? 'Creating…' : `Create "${query.trim()}"`}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
