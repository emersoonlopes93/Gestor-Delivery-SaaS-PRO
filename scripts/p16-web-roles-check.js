const { chromium } = require('@playwright/test');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    await page.getByLabel('E-mail de Acesso').fill('demo@demo.com');
    await page.getByLabel('Sua Senha').fill('demo123');
    await page.getByRole('button', { name: 'Acessar Painel' }).click();

    await page.waitForURL(/\/dashboard$/, { timeout: 20000 });
    await page.goto('http://localhost:5173/management/employees', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Novo Funcionário/i }).click();
    await page.getByText('Cargos / Permissoes', { exact: false }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: 'tmp/p16-web-roles-check.png', fullPage: true });

    const roleCards = await page.locator('label').evaluateAll((labels) =>
      labels
        .map((label) => {
          const text = label.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          return text;
        })
        .filter((text) => text.length > 0),
    );

    const ownerCard = roleCards.find((text) => text.includes('Dono'));

    console.log(
      JSON.stringify(
        {
          url: page.url(),
          rolesCount: roleCards.length,
          roleCards,
          ownerCard,
          bodyText: (await page.locator('body').innerText()).slice(0, 4000),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
