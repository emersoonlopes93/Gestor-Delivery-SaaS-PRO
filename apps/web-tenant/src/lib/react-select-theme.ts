import type { GroupBase, StylesConfig } from 'react-select';

const token = (name: string, fallback: string) => `var(${name}, ${fallback})`;

export function createThemedReactSelectStyles<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>(): StylesConfig<Option, IsMulti, Group> {
  return {
    control: (base, state) => ({
      ...base,
      minHeight: '2.875rem',
      borderRadius: '0.75rem',
      borderColor: state.isFocused ? token('--ring', '#0c93e9') : token('--input', '#e2e8f0'),
      backgroundColor: token('--input-bg', '#ffffff'),
      boxShadow: state.isFocused ? `0 0 0 2px ${token('--ring', '#0c93e9')}` : 'none',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
      '&:hover': {
        borderColor: state.isFocused ? token('--ring', '#0c93e9') : token('--border-strong', '#cbd5e1'),
      },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '0 0.875rem',
    }),
    input: (base) => ({
      ...base,
      color: token('--foreground', '#0f172a'),
    }),
    placeholder: (base) => ({
      ...base,
      color: token('--muted-foreground', '#64748b'),
    }),
    singleValue: (base) => ({
      ...base,
      color: token('--foreground', '#0f172a'),
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: token('--muted', '#f1f5f9'),
      borderRadius: '0.625rem',
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: token('--foreground', '#0f172a'),
      fontWeight: 700,
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: token('--muted-foreground', '#64748b'),
      ':hover': {
        backgroundColor: token('--destructive', '#ef4444'),
        color: token('--destructive-foreground', '#ffffff'),
      },
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 70,
    }),
    menu: (base) => ({
      ...base,
      zIndex: 70,
      overflow: 'hidden',
      borderRadius: '1rem',
      border: `1px solid ${token('--border', '#e2e8f0')}`,
      backgroundColor: token('--popover', '#ffffff'),
      boxShadow: token('--shadow-dropdown', '0 8px 24px rgb(15 23 42 / 0.12)'),
    }),
    menuList: (base) => ({
      ...base,
      padding: '0.5rem',
      backgroundColor: token('--popover', '#ffffff'),
    }),
    option: (base, state) => ({
      ...base,
      borderRadius: '0.75rem',
      cursor: state.isDisabled ? 'not-allowed' : 'pointer',
      backgroundColor: state.isSelected
        ? token('--primary', '#0c93e9')
        : state.isFocused
          ? token('--accent', '#f1f5f9')
          : 'transparent',
      color: state.isSelected
        ? token('--primary-foreground', '#ffffff')
        : state.isDisabled
          ? token('--muted-foreground', '#64748b')
          : token('--popover-foreground', '#0f172a'),
      opacity: state.isDisabled ? 0.5 : 1,
      ':active': {
        backgroundColor: state.isSelected ? token('--primary', '#0c93e9') : token('--accent', '#f1f5f9'),
      },
    }),
    noOptionsMessage: (base) => ({
      ...base,
      color: token('--muted-foreground', '#64748b'),
    }),
    loadingMessage: (base) => ({
      ...base,
      color: token('--muted-foreground', '#64748b'),
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: token('--border', '#e2e8f0'),
    }),
    clearIndicator: (base, state) => ({
      ...base,
      color: state.isFocused ? token('--foreground', '#0f172a') : token('--muted-foreground', '#64748b'),
      ':hover': {
        color: token('--foreground', '#0f172a'),
      },
    }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: state.isFocused ? token('--foreground', '#0f172a') : token('--muted-foreground', '#64748b'),
      ':hover': {
        color: token('--foreground', '#0f172a'),
      },
    }),
  };
}
