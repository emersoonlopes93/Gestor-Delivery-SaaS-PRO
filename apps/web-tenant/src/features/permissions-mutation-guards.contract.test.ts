import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const app = read('src/App.tsx');
const registry = read('src/navigation/navigationRegistry.ts');
const finance = read('src/features/purchasing/FinancePage.tsx');
const goals = read('src/features/analytics/GoalsPage.tsx');
const employees = read('src/features/management/employees/EmployeesPage.tsx');
const chatArea = read('src/features/whatsapp/components/ChatArea.tsx');
const quickReplies = read('src/features/whatsapp/components/QuickReplies.tsx');

describe('mutation permission guards', () => {
  it('keeps Finance readable while gating transaction creation by finance.manage', () => {
    expect(app).toContain('permission="finance.read"');
    expect(finance).toContain("const canManageFinance = has('finance.manage');");
    expect(finance).toContain('{canManageFinance && (');
    expect(finance).toContain('Novo lançamento');
    expect(finance).toContain('<TransactionModal');
  });

  it('gates goal creation, editing, and deletion independently', () => {
    expect(app).toContain('permission="goals.read"');
    expect(goals).toContain("const canCreateGoals = has('goals.create');");
    expect(goals).toContain("const canUpdateGoals = has('goals.update');");
    expect(goals).toContain("const canDeleteGoals = has('goals.delete');");
    expect(goals).toContain('onEdit={canUpdateGoals');
    expect(goals).toContain('onDelete={canDeleteGoals');
  });

  it('gates employee mutations with the same permission combinations as the API', () => {
    expect(app).toContain('permission="users.read"');
    expect(employees).toContain("hasAll(['users.create', 'users.roles'])");
    expect(employees).toContain("hasAll(['users.update', 'users.roles'])");
    expect(employees).toContain("has('users.delete')");
    expect(employees).toContain('{canCreateEmployees && (');
    expect(employees).toContain('{canUpdateEmployees && (');
    expect(employees).toContain('{canDeleteEmployees && (');
  });

  it('uses chat.read for Inbox discovery and guards every chat mutation separately', () => {
    expect(app).toContain('path="/whatsapp/inbox"');
    expect(app).toContain('permission="chat.read"');
    expect(registry).toContain("id: 'whatsapp.inbox'");
    expect(registry).toContain("permission: 'chat.read'");
    expect(chatArea).toContain("has('chat.send')");
    expect(chatArea).toContain("has('chat.manage_handoff')");
    expect(chatArea).toContain("has('chat.close')");
    expect(chatArea).toContain("has('chat.manage_quick_replies')");
    expect(chatArea).toContain('if (!session || !canCloseSessions) return;');
    expect(chatArea).toContain('if (!session || !canManageHandoff) return;');
    expect(quickReplies).toContain('canManage: boolean;');
    expect(quickReplies).toContain('{canManage && (');
  });

  it('does not retain orders.read as the WhatsApp Inbox guard', () => {
    const inboxRoute = app.slice(app.indexOf('path="/whatsapp/inbox"'), app.indexOf('path="/channels"'));
    expect(inboxRoute).not.toContain('orders.read');
  });
});
