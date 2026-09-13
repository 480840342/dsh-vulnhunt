async (page) => {
  const origin = await page.evaluate(() => location.origin)
  const results = []
  for (const version of ['0.1.0-rc.6', '0.1.0-rc.8']) {
    for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto(`${origin}/browser-${version}/index.html`)
      const input = page.getByRole('textbox', { name: 'Message', exact: true })
      await input.waitFor({ state: 'visible' })
      const verify = async (stage) => {
        const box = await input.boundingBox()
        const state = await page.evaluate(() => ({
          errors: window.fixtureErrors,
          color: getComputedStyle(document.querySelector('textarea')).webkitTextFillColor,
          noTranslate: document.querySelector('[data-composer-card]').translate === false,
        }))
        if (!box || box.height < 32 || box.width < 100 || state.errors.length || !state.noTranslate) {
          throw new Error(`${version} ${stage}: ${JSON.stringify({ box, state })}`)
        }
        if (state.color === 'transparent' || state.color === 'rgba(0, 0, 0, 0)') throw new Error('Invisible text')
      }
      const translateText = async () => page.evaluate(() => {
        const backdrop = document.querySelector('[data-input-backdrop]')
        const text = document.createTreeWalker(backdrop, NodeFilter.SHOW_TEXT).nextNode()
        if (!text) throw new Error('Expected draft text')
        const replacement = document.createElement('font')
        replacement.textContent = text.textContent
        text.parentNode.replaceChild(replacement, text)
      })
      await verify('empty')
      await input.fill('hello test')
      await translateText()
      await input.press('ControlOrMeta+A')
      await input.press('Backspace')
      await verify('delete translated text')
      await input.press('Backspace')
      await verify('delete while empty')
      await input.fill('send after translation')
      await translateText()
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await page.waitForFunction(() => window.submissions === 1 && document.querySelector('textarea')?.dataset.phase === 'idle')
      await verify('button send')
      await input.fill('keyboard send')
      await translateText()
      await input.press('Enter')
      await page.waitForFunction(() => window.submissions === 2 && document.querySelector('textarea')?.dataset.phase === 'idle')
      await verify('Enter send')
      await input.fill('retype after send')
      await verify('retype')
      await page.screenshot({ path: `output/playwright/composer-${version}-${viewport.width}.png` })
      results.push({ version, width: viewport.width, passed: true })
    }
  }
  return results
}
