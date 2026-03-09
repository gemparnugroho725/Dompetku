import { test, expect } from '@playwright/test';

test('check console errors on load', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      logs.push(msg.text());
    }
  });
  
  page.on('pageerror', exception => {
    logs.push(exception.message);
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  console.log('BROWSER ERRORS:', JSON.stringify(logs, null, 2));
});
