/** Exercise visible custom UI after it mounts, never force a hidden bridge. */
export async function pickerVisible(source) {
  const custom = source.locator('xpath=following-sibling::*[1]').getByRole('combobox');
  return await custom.isVisible() || await source.isVisible();
}
export async function selectValue(source, value) {
  await source.waitFor({state:'attached'});
  const scoped = await source.evaluate(s=>Boolean(s.closest('#schermoImpostazioni,.td-theme-studio,[data-calm-controls]')));
  if (!scoped) return source.selectOption(value);
  const custom = source.locator('xpath=following-sibling::*[1]').getByRole('combobox');
  await custom.waitFor({state:'visible'});
  const index = await source.evaluate((s,v)=>[...s.options].findIndex(o=>o.value===v),value);
  if (index<0) throw Error('Unknown option: '+value);
  // Click waits for stable geometry; focus() alone raced the section's focus restoration.
  if(await custom.getAttribute('aria-expanded')!=='true') await custom.click();
  const popupId = await custom.getAttribute('aria-controls');
  if(!popupId) throw Error('Custom listbox did not open');
  await source.page().locator('[id='+JSON.stringify(popupId)+']').getByRole('option').nth(index).click();
  if(await source.inputValue()!==value) throw Error('Value did not commit: '+value);
}
export async function checkValue(source, checked) {
  await source.waitFor({state:'attached'});
  if(await source.isChecked()===checked) return;
  const scoped = await source.evaluate(s=>Boolean(s.closest('#schermoImpostazioni,.td-theme-studio,[data-calm-controls]')));
  if(scoped) {
    const custom = source.locator('xpath=following-sibling::*[1]').locator('[role="switch"],[role="checkbox"]');
    await custom.waitFor({state:'visible'}); await custom.click();
  } else await source.setChecked(checked);
  if(await source.isChecked()!==checked) throw Error('Checked state did not commit');
}
