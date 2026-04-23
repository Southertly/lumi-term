async (page) => {
  const tabs = await page.locator('.tab').all();
  const tab0 = tabs[0];
  const rect = await tab0.boundingBox();
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  // Activate tab index 1 to test active tab preservation
  await tabs[1].click();

  // Drag tab 0 to position 2
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 80, centerY, { steps: 5 });
  await page.waitForTimeout(50);

  // Capture mid-drag state
  const midDrag = await page.evaluate(() => {
    const allTabs = document.querySelectorAll('.tab');
    return Array.from(allTabs).map((t, i) => ({
      index: i,
      isDragging: t.classList.contains('dragging'),
      transform: t.style.transform,
      opacity: window.getComputedStyle(t).opacity,
      boxShadow: window.getComputedStyle(t).boxShadow !== 'none' ? 'has-shadow' : 'no-shadow',
    }));
  });

  await page.mouse.move(centerX + 300, centerY, { steps: 10 });
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(200);

  const finalOrder = await page.evaluate(() => {
    const allTabs = document.querySelectorAll('.tab');
    return Array.from(allTabs).map((t, i) => ({
      index: i,
      isActive: t.classList.contains('active'),
    }));
  });

  return { midDrag, finalOrder };
}
