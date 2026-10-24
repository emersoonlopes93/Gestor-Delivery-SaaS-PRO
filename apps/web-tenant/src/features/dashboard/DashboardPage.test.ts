import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_ACTION_MENU_DISABLED_CLASS,
  DASHBOARD_ACTION_MENU_ITEM_CLASS,
  DASHBOARD_PERIOD_OPTION_CLASS,
  DASHBOARD_PERIOD_SELECT_CLASS,
} from './DashboardPage';

describe('dashboard action menu theme classes', () => {
  it('keeps menu items readable with hover and focus in both themes', () => {
    expect(DASHBOARD_ACTION_MENU_ITEM_CLASS).toContain('hover:bg-slate-100');
    expect(DASHBOARD_ACTION_MENU_ITEM_CLASS).toContain('dark:hover:bg-slate-800');
    expect(DASHBOARD_ACTION_MENU_ITEM_CLASS).toContain('focus:ring-2');
  });

  it('keeps disabled menu items visibly muted without hiding them', () => {
    expect(DASHBOARD_ACTION_MENU_DISABLED_CLASS).toContain('disabled:text-slate-500');
    expect(DASHBOARD_ACTION_MENU_DISABLED_CLASS).toContain('dark:disabled:text-slate-400');
    expect(DASHBOARD_ACTION_MENU_DISABLED_CLASS).toContain('disabled:opacity-70');
  });

  it('keeps the period select options readable in both themes', () => {
    expect(DASHBOARD_PERIOD_SELECT_CLASS).toContain('bg-white');
    expect(DASHBOARD_PERIOD_SELECT_CLASS).toContain('text-slate-900');
    expect(DASHBOARD_PERIOD_SELECT_CLASS).toContain('dark:bg-slate-900');
    expect(DASHBOARD_PERIOD_SELECT_CLASS).toContain('dark:text-slate-100');
    expect(DASHBOARD_PERIOD_OPTION_CLASS).toContain('bg-white');
    expect(DASHBOARD_PERIOD_OPTION_CLASS).toContain('text-slate-900');
    expect(DASHBOARD_PERIOD_OPTION_CLASS).toContain('dark:bg-slate-900');
    expect(DASHBOARD_PERIOD_OPTION_CLASS).toContain('dark:text-slate-100');
  });
});
