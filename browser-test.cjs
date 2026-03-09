const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER CONSOLE ERROR:', msg.text());
    }
  });

  page.on('pageerror', exception => {
    console.log('BROWSER PAGE ERROR:', exception.message);
  });

  try {
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle' });
  } catch (error) {
    console.log('NAVIGATION ERROR:', error);
  }
  
  await browser.close();
})();
