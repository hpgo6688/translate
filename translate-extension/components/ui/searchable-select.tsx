import { useEffect, useRef, useState } from 'react';

export type SelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  dropdownAlign?: 'left' | 'right';
};

export function SearchableSelect({
  value,
  options,
  onChange,
  dropdownAlign = 'left',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((item) => item.value === value) ?? options[0];
  const filtered = options.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div className="searchable-select" ref={containerRef}>
      <button
        type="button"
        className="popup-select searchable-trigger"
        onClick={() => {
          setOpen((prev) => !prev);
        }}
      >
        <span className="searchable-trigger-label">{selected?.label ?? ''}</span>
        <span className="searchable-trigger-caret">▼</span>
      </button>
      {open ? (
        <div className={`searchable-dropdown${dropdownAlign === 'right' ? ' is-right' : ''}`}>
          <input
            className="searchable-input"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="searchable-options">
            {filtered.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`searchable-option${item.value === value ? ' is-active' : ''}`}
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
