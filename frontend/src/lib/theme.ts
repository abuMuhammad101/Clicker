/** The person's own light/dark choice (user menu > Theme); "system" follows the operating system. Per browser. */
export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'clicker.theme'

export function themeChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, choice)
  } catch {
    // Without storage the choice holds for this page load only.
    document.documentElement.dataset.theme = choice === 'system' ? document.documentElement.dataset.theme : choice
  }
  window.dispatchEvent(new Event('clicker-theme'))
}
