async (page) => {
  const tabs = await page.locator('.tab').all();
  const tab0 = tabs[0];
  const rect = await tab0.boundingBox();
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  // Try to drag the single tab
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 200, centerY, { steps: 10 });
  await page.waitForTimeout(100);

  const midDrag = await page.evaluate(() => {
    const allTabs = document.querySelectorAll('.tab');
    return Array.from(allTabs).map((t, i) => ({
      index: i,
      isDragging: t.classList.contains('dragging'),
      transform: t.style.transform,
    }));
  });

  await page.mouse.up();
  return { tabCount: tabs.length, midDrag };
}
