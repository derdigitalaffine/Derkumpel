import { createTheme } from '@mantine/core';

const fontFamily = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const theme = createTheme({
  primaryColor: 'blue',
  primaryShade: 7,
  defaultRadius: 'lg',
  fontFamily,
  headings: { fontFamily, fontWeight: '760' },
  shadows: {
    xs: '0 1px 2px rgba(15, 23, 42, 0.05)',
    sm: '0 4px 14px rgba(15, 23, 42, 0.07)',
    md: '0 10px 30px rgba(15, 23, 42, 0.10)',
    lg: '0 18px 48px rgba(15, 23, 42, 0.13)',
    xl: '0 28px 70px rgba(15, 23, 42, 0.16)',
  },
  components: {
    Button: {
      defaultProps: { radius: 'md', size: 'md' },
      styles: { root: { minHeight: 48, fontWeight: 750, letterSpacing: '-0.01em' } },
    },
    ActionIcon: {
      defaultProps: { radius: 'md' },
      styles: { root: { minWidth: 46, minHeight: 46 } },
    },
    Paper: { defaultProps: { radius: 'lg' } },
    Card: { defaultProps: { radius: 'lg' } },
    Badge: {
      defaultProps: { radius: 'sm' },
      styles: { root: { fontWeight: 750, letterSpacing: '0' } },
    },
    NavLink: {
      defaultProps: { variant: 'light' },
      styles: { root: { borderRadius: 12, minHeight: 46 }, label: { fontWeight: 700 } },
    },
    TextInput: { defaultProps: { size: 'md', radius: 'md' } },
    PasswordInput: { defaultProps: { size: 'md', radius: 'md' } },
    Textarea: { defaultProps: { size: 'md', radius: 'md' } },
    Select: { defaultProps: { size: 'md', radius: 'md' } },
    MultiSelect: { defaultProps: { size: 'md', radius: 'md' } },
    NumberInput: { defaultProps: { size: 'md', radius: 'md' } },
    Accordion: {
      styles: { control: { minHeight: 52 }, label: { fontWeight: 700 } },
    },
    Drawer: {
      defaultProps: { overlayProps: { backgroundOpacity: 0.38, blur: 3 } },
      styles: { title: { fontWeight: 800 } },
    },
    Modal: {
      defaultProps: { overlayProps: { backgroundOpacity: 0.42, blur: 3 } },
      styles: { title: { fontWeight: 800 } },
    },
  },
});
