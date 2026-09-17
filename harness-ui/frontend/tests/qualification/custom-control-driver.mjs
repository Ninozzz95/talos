/** Exercise the visible control, never force a hidden native bridge. */
export async function pickerVisible(source) {
  const custom = source.locator('xpath=following-sibling::*[1]').getByRole('combobox');
  return await custom.isVisible() || await source.isVisible();
}
export async function selectValue(source, value) {
  const custom = source.locator('xpath=following-sibling::*[1]').getByRole('combobox');
  if (!await custom.isVisible()) return source.selectOption(value);
  const index = await source.evaluate((s,v)=>[...s.options].findIndex(o=>o.value===v),value);
  if (index<0) throw Error('Unknown option: '+value);
  await custom.focus(); await custom.press('Home');
  for(let i=0;i<index;i++) await custom.press('ArrowDown');
  await custom.press('Enter');
  if(await source.inputValue()!==value) throw Error('Value did not commit: '+value);
}
export async function checkValue(source, checked) {
  if(await source.isChecked()===checked) return;
  const custom = source.locator('xpath=following-sibling::*[1]').locator('[role="switch"],[role="checkbox"]');
  if(await custom.isVisible()) await custom.click();
  else await source.setChecked(checked);
  if(await source.isChecked()!==checked) throw Error('Checked state did not commit');
}
